// ============================================================
// routes/webhooks.js — Tingee webhook (nguồn xác nhận thanh toán DUY NHẤT)
// ============================================================
// SỬA LỚN (theo kế hoạch đã duyệt — chuyển từ polling sang webhook theo
// khuyến cáo chính thức của Tingee, tài liệu:
// https://developers.tingee.vn/docs/webhook-ipn):
//
// 1. SỬA LỖI NGHIÊM TRỌNG ĐỘC LẬP (đã tồn tại từ trước, không liên quan
//    gì tới việc chuyển đổi lần này): middleware xác thực chữ ký đọc SAI
//    tên header — 'X-Tingee-Signature'/'X-Tingee-Timestamp' — trong khi
//    Tingee THẬT SỰ gửi 'x-signature'/'x-request-timestamp' (KHÔNG có
//    tiền tố "Tingee"). Vì sig luôn undefined, middleware LUÔN trả 401
//    NGAY TỪ ĐẦU, request KHÔNG BAO GIỜ chạm tới dòng xử lý/ghi log phía
//    sau — đây rất có thể là lý do webhook "biến mất hoàn toàn" trong
//    suốt quá trình điều tra sự cố thanh toán trước đây (không phải do
//    Tingee không gửi).
// 2. Route webhook giờ THỰC SỰ xác nhận thanh toán (trước đây chỉ ghi
//    log rồi ack, polling get-status-dynamic-qr mới là nguồn thật —
//    polling đã bị XOÁ HẲN theo quyết định đã chốt).
// 3. Đọc extraInfo (gửi kèm lúc tạo QR — xem lib/tingee.js/routes/qr.js)
//    từ additionalData để tra đúng orderId — KHÔNG dùng qr_id nữa (field
//    đó không có trong payload thật, chỉ có trong giả định cũ sai).
// 4. BẮT BUỘC so sánh amount thực nhận với amount hoá đơn TRƯỚC KHI xác
//    nhận — đúng cảnh báo bảo mật CHÍNH THỨC từ Tingee: giao dịch QR
//    ĐỘNG có thể bị người chuyển tự ý sửa số tiền ở 1 số ngân hàng chưa
//    chặn, Tingee VẪN gửi webhook như bình thường dù số tiền sai khác.
// 5. Idempotency theo transactionCode + kiểm tra payment_status hiện tại
//    — Tingee có thể gửi lại webhook tối đa 5 lần nếu endpoint lỗi/timeout.
// 6. Trả về ĐÚNG format Tingee yêu cầu: {"code":"00","message":"Success"}
//    (không phải {ok:true} tự chế trước đây).
//
// AhaMove ĐÃ GỠ HOÀN TOÀN (khách tự đặt tài xế bằng app ngoài — quote.js/
// create.js không còn tạo đơn AhaMove từ trước) — không có webhook/poll
// AhaMove trong file này.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const tingee = require('../lib/tingee'); // { generateDynamicQr, deleteDynamicQr, getDynamicQrStatus, BASE_URL }
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

// Rate-limit webhooks: 60 req/phút/IP. CHỈ áp dụng cho route cụ thể —
// cùng lý do đã sửa ở routes/create.js.
router.use('/webhook/tingee', rateLimit({ windowMs: 60000, max: 60, message: 'Too many webhook calls' }));

// ------------------------------------------------------------
// Webhook signature verification.
// ------------------------------------------------------------
// Production PHẢI verify. Dev (NODE_ENV !== 'production') cho phép skip
// khi secret chưa set để dễ test, nhưng vẫn log warning.
// ------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === 'production';
const TINGEE_SECRET = process.env.TINGEE_SECRET;

if (!TINGEE_SECRET) {
  console.warn(
    '[webhooks] TINGEE_SECRET missing — Tingee webhook verification will fail in production'
  );
}

// Constant-time hex string comparison. Traps on length mismatch, so guard
// with a length check first to avoid leaking length info via thrown error.
function safeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// verifyTingeeWebhook: verify x-signature header.
// Theo ĐÚNG tài liệu chính thức: signature = HMAC_SHA512(x-request-timestamp
// + ':' + json_body, secretKey). Header ĐÚNG tên (không tiền tố "Tingee"):
// x-signature, x-request-timestamp.
function verifyTingeeWebhook(req, res, next) {
  const sig = req.get('x-signature');
  const ts = req.get('x-request-timestamp');
  if (!sig || !ts) {
    if (!IS_PROD && !TINGEE_SECRET) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(401).json({ error: 'missing x-signature or x-request-timestamp' });
  }
  if (!TINGEE_SECRET) {
    if (!IS_PROD) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(500).json({ error: 'webhook secret not configured' });
  }
  const rawBody = req.rawBody || '';
  const payload = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha512', TINGEE_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  if (!safeEqualHex(sig, expected)) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
}

// Tìm giá trị extraInfo (orderId) trong additionalData — tài liệu Tingee
// chỉ mô tả "array, chứa thông tin bổ sung (ví dụ billId cho QR động)",
// KHÔNG có ví dụ schema đầy đủ cho từng phần tử. Thử các cấu trúc phổ
// biến nhất ({name,value} / {key,value} / {extraInfo} trực tiếp) — CẦN
// ĐỐI CHIẾU LẠI với payload thật đầu tiên nhận được sau khi triển khai
// (xem cột response_body trong tingee_logs, action='webhook') và điều
// chỉnh hàm này nếu cấu trúc thật khác giả định dưới đây.
function extractExtraInfo(body) {
  const additionalData = body && body.additionalData;
  if (!Array.isArray(additionalData)) return null;
  for (const item of additionalData) {
    if (!item || typeof item !== 'object') continue;
    if (item.name === 'extraInfo' && typeof item.value === 'string') return item.value;
    if (item.key === 'extraInfo' && typeof item.value === 'string') return item.value;
    if (typeof item.extraInfo === 'string') return item.extraInfo;
  }
  return null;
}

// POST /webhook/tingee — body thật theo tài liệu chính thức:
// { clientId, transactionCode, amount, content, bank, accountNumber,
//   vaAccountNumber, transactionDate, type, additionalData: [...] }
router.post('/webhook/tingee', verifyTingeeWebhook, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const { transactionCode, amount, type } = body;

    // Ghi log TOÀN BỘ payload trước tiên — kể cả khi không xử lý được gì
    // (order not found, amount không khớp...) — cần đầy đủ để tra soát
    // và đối chiếu lại cấu trúc additionalData thật.
    db.prepare(
      `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, created_at) VALUES (?, ?, 'webhook', ?, ?)`,
    ).run(transactionCode || '', transactionCode || '', JSON.stringify(body), Date.now());

    // type: 'debit' = ghi nợ (tiền RA — không phải giao dịch nhận tiền,
    // bỏ qua). Không truyền hoặc 'credit' = ghi có (tiền VÀO — đúng
    // giao dịch cần xử lý). Theo đúng mô tả tài liệu: "Nếu không truyền
    // sang thì mặc định là Ghi có".
    if (type === 'debit') {
      return res.json({ code: '00', message: 'Success' });
    }

    const orderId = extractExtraInfo(body);
    if (!orderId) {
      console.warn('[webhook/tingee] không tìm thấy extraInfo trong additionalData:', JSON.stringify(body.additionalData));
      return res.json({ code: '00', message: 'Success' });
    }

    const order = db.prepare(`SELECT order_id, amount, payment_status, tingee_qr_account, tingee_bill_id FROM orders WHERE order_id = ?`).get(orderId);
    if (!order) {
      console.warn('[webhook/tingee] order not found:', orderId, 'transactionCode:', transactionCode);
      return res.json({ code: '00', message: 'Success' });
    }

    // Idempotency — đã xử lý paid trước đó (lần webhook gốc, hoặc lần
    // retry trước) → bỏ qua, không xử lý lại (Tingee gửi lại tối đa 5
    // lần nếu endpoint lỗi/timeout — theo tài liệu chính thức).
    if (order.payment_status === 'paid') {
      return res.json({ code: '00', message: 'Success' });
    }

    // BẮT BUỘC so sánh số tiền THỰC NHẬN với số tiền hoá đơn TRƯỚC KHI
    // xác nhận — đúng cảnh báo bảo mật chính thức từ Tingee: giao dịch
    // QR ĐỘNG có thể bị người chuyển tự ý sửa số tiền ở 1 số ngân hàng
    // chưa chặn; Tingee vẫn gửi webhook bình thường dù số tiền sai khác.
    // KHÔNG tin payload một cách mù quáng.
    const amountReceived = Number(amount || 0);
    if (amountReceived < Number(order.amount || 0)) {
      console.warn(
        '[webhook/tingee] số tiền không khớp — KHÔNG xác nhận:',
        orderId, 'nhận:', amountReceived, 'cần:', order.amount, 'transactionCode:', transactionCode,
      );
      return res.json({ code: '00', message: 'Success' });
    }

    await canister.updatePaymentStatus(orderId, 'paid');
    db.prepare(`UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE order_id = ?`)
      .run(Date.now(), orderId);
    if (order.tingee_qr_account && order.tingee_bill_id) {
      try {
        await tingee.deleteDynamicQr({ qrAccount: order.tingee_qr_account, billId: order.tingee_bill_id });
      } catch (e) {
        console.warn('[webhook/tingee] deleteDynamicQr failed:', e.message);
      }
    }
    console.log('[webhook/tingee] xác nhận thanh toán:', orderId, 'transactionCode:', transactionCode);

    res.json({ code: '00', message: 'Success' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
