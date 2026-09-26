// ============================================================
// routes/driver-pickup-lookup.js — tìm đơn cho tài xế Lalamove tại quầy
// ============================================================
// Trang /driver (DriverScreenScan.tsx): nhân viên chụp màn hình app tài
// xế (phần ghi chú đơn) → đọc chữ (OCR, lib/ocr.js) → lọc mã đơn + mã
// nhận hàng (lib/pickup-screen-parse.js) → tìm đúng đơn → mở thẳng màn
// thanh toán với mã nhận hàng đã điền sẵn. Không đọc được thì nhân viên
// nhập tay mã nhận hàng tài xế đọc.
//
//   POST /driver/pickup-lookup/photo  (multipart: image, restaurantId, deviceId)
//   POST /driver/pickup-lookup/code   (json: restaurantId, deviceId, pickupCode)
//
// Chỉ thiết bị ĐANG active của đúng nhà hàng mới gọi được (kiểm tra qua
// canister, cùng cách routes/cash-payment.js). Chỉ tìm trong đơn CHƯA
// thanh toán, chưa huỷ, của nhà hàng đó:
//   - Đọc được mã đơn: mở đơn đó; mã nhận hàng chỉ điền sẵn khi cũng đọc
//     được và KHỚP (không khớp → mở đơn nhưng để trống, nhân viên hỏi mã).
//   - Chỉ có mã nhận hàng: tìm trong đơn tạo HÔM NAY (giờ VN).
// Ảnh chỉ nằm trong bộ nhớ để đọc, KHÔNG lưu xuống đĩa.
// ============================================================

const express = require('express');
const multer = require('multer');
const canister = require('../lib/canister');
const { extractTextFromImage } = require('../lib/ocr');
const { parsePickupScreenText, isValidPickupCode } = require('../lib/pickup-screen-parse');
const { normalizePickupCode } = require('../lib/pickup-code');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new Error('Only jpg/png/webp images are accepted'));
    cb(null, true);
  },
});

router.use(
  '/driver/pickup-lookup',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many pickup lookup requests' }),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC7_MS = 7 * 60 * 60 * 1000;
function startOfTodayUtc7(nowMs) {
  return Math.floor((nowMs + UTC7_MS) / DAY_MS) * DAY_MS - UTC7_MS;
}

async function requireActiveDevice(restaurantId, deviceId, res) {
  if (!restaurantId || !deviceId) {
    res.status(400).json({ ok: false, message: 'Thiếu restaurantId hoặc deviceId.' });
    return false;
  }
  let devices;
  try {
    devices = await canister.listDevicesByRestaurant(restaurantId);
  } catch (e) {
    console.error('[driver-pickup-lookup] listDevicesByRestaurant lỗi:', restaurantId, e.message);
    res.status(502).json({ ok: false, message: 'Không xác thực được thiết bị, vui lòng thử lại.' });
    return false;
  }
  const device = (devices || []).find((d) => d.deviceId === deviceId);
  if (!device || !device.active) {
    res.status(403).json({ ok: false, message: 'Thiết bị chưa được kích hoạt hoặc đã bị thu hồi quyền truy cập.' });
    return false;
  }
  return true;
}

const OPEN_ORDER_WHERE = `restaurant_id = ? AND payment_status = 'unpaid'
  AND booking_status <> 'cancelled'`;

function toMatch(row, verifiedCode) {
  return {
    orderId: row.order_id,
    cusName: row.cus_name,
    amount: row.amount,
    // Chỉ trả mã khi đã KHỚP với mã đọc/nhập được — không lộ mã của đơn.
    pickupCode: verifiedCode ? row.pickup_code : '',
  };
}

// Tìm đơn từ ứng viên mã đơn / mã nhận hàng. Trả mảng match (có thể rỗng).
//   1) Mã đơn đầy đủ → 2) tiền tố mã đơn (dãy số thời gian) → 3) mã
//   nhận hàng trong đơn hôm nay. Mã nhận hàng chỉ điền sẵn khi khớp.
function findMatches(db, restaurantId, { orderIds = [], orderPrefixes = [], pickupCodes = [] }) {
  const select = 'SELECT order_id, cus_name, amount, pickup_code FROM orders';
  const verify = (row) => !!row.pickup_code && pickupCodes.includes(row.pickup_code);
  const seen = new Set();
  const matches = [];
  const push = (row) => {
    if (seen.has(row.order_id)) return;
    seen.add(row.order_id);
    matches.push(toMatch(row, verify(row)));
  };

  for (const orderId of orderIds) {
    const row = db.prepare(`${select} WHERE order_id = ? AND ${OPEN_ORDER_WHERE}`).get(orderId, restaurantId);
    if (row) push(row);
  }
  if (matches.length === 0) {
    for (const prefix of orderPrefixes) {
      const rows = db
        .prepare(`${select} WHERE order_id LIKE ? AND ${OPEN_ORDER_WHERE} LIMIT 3`)
        .all(`${prefix}%`, restaurantId);
      rows.forEach(push);
    }
  }
  // Nhiều đơn khớp theo tiền tố (gần như không xảy ra): ưu tiên đơn có mã
  // nhận hàng khớp.
  if (matches.length > 1 && matches.some((x) => x.pickupCode)) {
    return matches.filter((x) => x.pickupCode);
  }
  if (matches.length > 0 || pickupCodes.length === 0) return matches;

  const placeholders = pickupCodes.map(() => '?').join(',');
  db.prepare(
    `${select} WHERE ${OPEN_ORDER_WHERE} AND created_at >= ? AND pickup_code IN (${placeholders})
     ORDER BY created_at DESC LIMIT 5`,
  )
    .all(restaurantId, startOfTodayUtc7(Date.now()), ...pickupCodes)
    .forEach(push);
  return matches;
}

router.post('/driver/pickup-lookup/photo', upload.single('image'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const restaurantId = String((req.body || {}).restaurantId || '').trim();
    const deviceId = String((req.body || {}).deviceId || '').trim();
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'Vui lòng chụp ảnh màn hình tài xế.' });
    }
    if (!(await requireActiveDevice(restaurantId, deviceId, res))) return;

    let text;
    try {
      text = await extractTextFromImage(req.file.buffer);
    } catch (e) {
      console.error('[driver-pickup-lookup] OCR lỗi:', e.message);
      return res.json({ ok: true, matches: [], read: { orderIds: [], orderPrefixes: [], pickupCodes: [] } });
    }
    const read = parsePickupScreenText(text);
    const matches = findMatches(db, restaurantId, read);
    console.log('[driver-pickup-lookup] ảnh:', restaurantId, 'đọc', JSON.stringify(read), '→', matches.length, 'đơn');
    res.json({ ok: true, matches, read });
  } catch (e) {
    next(e);
  }
});

router.post('/driver/pickup-lookup/code', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const restaurantId = String(body.restaurantId || '').trim();
    const deviceId = String(body.deviceId || '').trim();
    const code = normalizePickupCode(body.pickupCode);
    if (!isValidPickupCode(code)) {
      return res.status(400).json({ ok: false, message: 'Mã nhận hàng gồm 6 ký tự (chữ hoặc số).' });
    }
    if (!(await requireActiveDevice(restaurantId, deviceId, res))) return;
    const matches = findMatches(db, restaurantId, { orderIds: [], pickupCodes: [code] });
    res.json({ ok: true, matches });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports._findMatches = findMatches;
