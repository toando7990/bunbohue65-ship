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

const canister = require('../lib/canister');

router.get('/order/:id/promo-info', async (req, res) => {
  const db = req.app.locals.db;
  const row = db
    .prepare('SELECT km_program_code, km_program_name, voucher_code, cus_address FROM orders WHERE order_id = ?')
    .get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
  let name = row.km_program_name || '';
  // Đơn tạo TRƯỚC khi lưu tên chương trình: tra bổ sung qua query công khai
  // getCurrentPromotion() — chỉ nhận khi ĐÚNG mã, rồi lưu lại để lần sau khỏi
  // tra. Chương trình đã hết hiệu lực thì không tra được → thẻ hiện mã.
  if (!name && row.km_program_code) {
    try {
      const cur = await canister.getCurrentPromotion();
      const promo = Array.isArray(cur) ? cur[0] : cur;
      if (promo && promo.code === row.km_program_code && promo.name) {
        name = String(promo.name);
        db.prepare('UPDATE orders SET km_program_name = ? WHERE order_id = ?').run(name, req.params.id);
      }
    } catch (e) {
      console.warn('[promo-info] getCurrentPromotion lỗi (bỏ qua):', e.message);
    }
  }
  res.json({
    ok: true,
    kmProgramCode: row.km_program_code || '',
    kmProgramName: name,
    voucherCode: row.voucher_code || '',
    // Đơn giao tận nơi hay tại quầy — canister XOÁ cusAddress khỏi đơn trả
    // cho khách (bảo vệ thông tin cá nhân), nên thẻ đơn không tự biết được.
    // Chỉ trả true/false, KHÔNG trả địa chỉ.
    isDelivery: !!row.cus_address,
  });
});

module.exports = router;
