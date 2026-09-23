// ============================================================
// routes/order-lalamove-status.js — GET /order/:id/lalamove-status
// ============================================================
// Trả thông tin theo dõi Lalamove THẬT của 1 đơn (lalamove_order_id,
// lalamove_driver_id, lalamove_share_link, lalamove_status) — chỉ có
// giá trị khi đơn đã được tự động gọi tài xế thành công (Phần 6/6,
// LALAMOVE_AUTO_DISPATCH=true). Dùng cho OrderTracker.tsx thay thế
// "Hành trình giao" 2 bước cũ (dành cho luồng tài xế tự đặt qua app
// ngoài) bằng theo dõi trực quan Lalamove thật khi có.
//
// KHÔNG cần xác thực — cùng mức tin cậy với các API tự phục vụ khác
// theo orderId (routes/qr.js, routes/order-restaurant.js): orderId có
// đủ entropy ngẫu nhiên, và thông tin trả về không nhạy cảm (không có
// pickupCode/thông tin thanh toán).
// ============================================================

const express = require('express');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

router.use(
  '/order/:id/lalamove-status',
  rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }),
);

router.get('/order/:id/lalamove-status', (req, res) => {
  const db = req.app.locals.db;
  const orderId = req.params.id;

  const row = db.prepare(
    'SELECT lalamove_order_id, lalamove_driver_id, lalamove_share_link, lalamove_status FROM orders WHERE order_id = ?',
  ).get(orderId);

  if (!row) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
  }

  res.json({
    ok: true,
    lalamoveOrderId: row.lalamove_order_id || '',
    lalamoveDriverId: row.lalamove_driver_id || '',
    lalamoveShareLink: row.lalamove_share_link || '',
    lalamoveStatus: row.lalamove_status || '',
  });
});

module.exports = router;
