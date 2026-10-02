// ============================================================
// routes/no-show.js — Khách bỏ đơn (Điều khoản giao dịch mục 9)
// ============================================================
// Chính sách đã chốt: CHỈ cảnh báo + ghi nhận địa chỉ IP, KHÔNG chặn đặt đơn.
//
//   POST /order/:id/no-show      { deviceId, undo? }
//        Nhân viên (/driver, thiết bị đã kích hoạt của ĐÚNG nhà hàng của
//        đơn) đánh dấu / bỏ đánh dấu khách bỏ đơn. Lưu thời điểm + thiết bị.
//   GET  /customers/no-show-check?email=&phone=
//        Trang đặt món hỏi trước khi khách đặt: số đơn đã bị đánh dấu bỏ
//        đơn khớp email HOẶC SĐT HOẶC IP hiện tại (trong 90 ngày). Chỉ trả
//        về số lượng + lần gần nhất, không lộ thông tin đơn.

const express = require('express');
const canister = require('../lib/canister');
const { clientIp } = require('../lib/client-ip');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

router.post('/order/:id/no-show', rateLimit({ windowMs: 60000, max: 20, message: 'Too many requests' }));
router.get('/customers/no-show-check', rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }));

router.post('/order/:id/no-show', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    const deviceId = String((req.body || {}).deviceId || '').trim();
    const undo = !!(req.body || {}).undo;
    const order = db.prepare('SELECT order_id, restaurant_id, booking_status, no_show_at FROM orders WHERE order_id = ?').get(orderId);
    if (!order) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng.' });
    if (!deviceId) return res.status(400).json({ ok: false, error: 'Thiếu deviceId.' });
    let devices;
    try {
      devices = await canister.listDevicesByRestaurant(order.restaurant_id);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Không xác thực được thiết bị, vui lòng thử lại.' });
    }
    const device = devices.find((d) => d.deviceId === deviceId);
    if (!device || !device.active) {
      return res.status(403).json({ ok: false, error: 'Thiết bị không thuộc nhà hàng của đơn này.' });
    }
    if (undo) {
      db.prepare("UPDATE orders SET no_show_at = NULL, no_show_by = '', updated_at = ? WHERE order_id = ?")
        .run(Date.now(), orderId);
    } else {
      db.prepare('UPDATE orders SET no_show_at = ?, no_show_by = ?, updated_at = ? WHERE order_id = ? AND no_show_at IS NULL')
        .run(Date.now(), deviceId, Date.now(), orderId);
    }
    console.log(`[no-show] ${undo ? 'bỏ đánh dấu' : 'đánh dấu'} khách bỏ đơn:`, orderId, 'thiết bị', deviceId);
    res.json({ ok: true, noShow: !undo });
  } catch (e) {
    next(e);
  }
});

router.get('/customers/no-show-check', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').replace(/\s/g, '');
    const ip = clientIp(req);
    const conds = [];
    const args = [];
    if (email) { conds.push('lower(receiver_email) = ?'); args.push(email); }
    if (phone) { conds.push("replace(cus_phone, ' ', '') = ?"); args.push(phone); }
    if (ip) { conds.push('customer_ip = ?'); args.push(ip); }
    if (conds.length === 0) return res.json({ ok: true, count: 0, lastAt: null });
    const row = db.prepare(
      `SELECT COUNT(*) AS n, MAX(no_show_at) AS last FROM orders
       WHERE no_show_at IS NOT NULL AND no_show_at >= ? AND (${conds.join(' OR ')})`,
    ).get(Date.now() - WINDOW_MS, ...args);
    res.json({ ok: true, count: row.n || 0, lastAt: row.last || null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
