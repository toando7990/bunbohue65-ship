// ============================================================
// routes/order-promo-info.js — GET /order/:id/promo-info
// ============================================================
// Tên chương trình khuyến mại + mã phiếu giảm giá của 1 đơn — để thẻ đơn phía
// khách ("Theo dõi", "Lịch sử") hiện "Khuyến mại GIỜ VÀNG", "Phiếu giảm giá
// NEWUSER10" thay vì 1 dòng "Đã giảm" chung. Canister không lưu các thông
// tin này (chỉ có số tiền giảm), VPS lưu khi tạo đơn (routes/create.js).
// Không cần xác thực — cùng mức tin cậy các API tự phục vụ khác theo orderId
// (order-lalamove-status.js); thông tin trả về không nhạy cảm.
// ============================================================
const express = require('express');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use('/order/:id/promo-info', rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));

router.get('/order/:id/promo-info', (req, res) => {
  const row = req.app.locals.db
    .prepare('SELECT km_program_code, km_program_name, voucher_code FROM orders WHERE order_id = ?')
    .get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
  res.json({
    ok: true,
    kmProgramCode: row.km_program_code || '',
    kmProgramName: row.km_program_name || '',
    voucherCode: row.voucher_code || '',
  });
});

module.exports = router;
