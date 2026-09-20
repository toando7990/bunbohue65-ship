// ============================================================
// routes/pickup-qr-image.js — GET /order/:id/pickup-qr.png
// ============================================================
// Ảnh QR "nhận hàng" dạng PNG, phục vụ qua 1 đường link công khai — dùng
// để nhúng vào trường remarks khi gọi Lalamove "Place Order" (Phần 6/6):
// tài xế Lalamove mở link này trong app/trình duyệt của họ, nhân viên
// quán quét ảnh hiện ra bằng camera ở /driver (QrScannerDialog.tsx, tính
// năng "QR nhận hàng" đã có từ trước) — tự động mở đúng đơn + điền sẵn
// mã nhận hàng, không cần đọc mã bằng miệng/gõ tay nữa.
//
// Mã hoá CÙNG định dạng JSON {orderId, pickupCode} mà QrScannerDialog.tsx
// đã mong đợi — sửa 1 bên phải sửa bên kia.
//
// BẢO MẬT: orderId có 8 ký tự hex ngẫu nhiên (crypto.randomBytes(4)) —
// khó đoán nhưng không phải không thể (2^32 khả năng). Rate-limit chặt
// + CHỈ hoạt động khi đơn CHƯA thanh toán và CHƯA huỷ (cùng điều kiện QR
// "nhận hàng" ở OrderTracker.tsx) — đơn đã xong thì ảnh QR không còn ý
// nghĩa gì để lộ ra nữa, giảm bề mặt tấn công.
// ============================================================

const express = require('express');
const QRCode = require('qrcode');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

router.use(
  '/order/:id/pickup-qr.png',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many pickup-qr requests' }),
);

router.get('/order/:id/pickup-qr.png', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const order = db.prepare(
      `SELECT order_id, pickup_code, payment_status, booking_status FROM orders WHERE order_id = ?`,
    ).get(orderId);

    if (!order || !order.pickup_code) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng hoặc đơn chưa có mã nhận hàng.' });
    }
    if (order.booking_status === 'cancelled') {
      return res.status(410).json({ ok: false, message: 'Đơn này đã bị huỷ.' });
    }
    if (order.payment_status === 'paid') {
      return res.status(410).json({ ok: false, message: 'Đơn này đã thanh toán, không cần quét mã nhận hàng nữa.' });
    }

    const qrValue = JSON.stringify({ orderId: order.order_id, pickupCode: order.pickup_code });
    const png = await QRCode.toBuffer(qrValue, { type: 'png', width: 400, margin: 2 });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store'); // mã nhận hàng nhạy cảm — không cache lại ở đâu
    res.send(png);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
