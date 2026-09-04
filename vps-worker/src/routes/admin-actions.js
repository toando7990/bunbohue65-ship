// ============================================================
// routes/admin-actions.js — hành động thủ công cho trang Quản lý (admin)
// ============================================================
// KHÔNG có xác thực riêng ở endpoint này (Phương án A, đã xác nhận với
// người dùng) — dựa hoàn toàn vào trang /admin phía frontend đã chặn
// người không phải admin (đăng nhập Internet Identity thật). Cùng quy
// ước với các endpoint admin khác trên VPS hiện có (/analytics,
// /restaurant-history — xem ghi chú ở đầu các file đó). Bảo vệ THÊM bằng
// rate-limit (hành động xoá vĩnh viễn, không nên gọi liên tục) — phía
// frontend còn có hộp thoại xác nhận 2 lần trước khi gọi.

const express = require('express');
const { rateLimit } = require('../middleware/rate-limit');
const cleanupCron = require('./cleanup-unpaid-orders-cron');

const router = express.Router();

// Rate-limit: 5 req/phút/IP — hành động xoá vĩnh viễn, không nên gọi
// liên tục. CHỈ áp dụng cho route cụ thể (không router.use() không path
// — xem bài học đã sửa ở routes/create.js/qr.js/order-restaurant.js/
// webhooks.js, tránh tính nhầm mọi request khác đi qua).
router.use(
  '/admin/cleanup-unpaid-orders',
  rateLimit({ windowMs: 60000, max: 5, message: 'Too many cleanup requests' }),
);

// POST /admin/cleanup-unpaid-orders — nút "Xoá các đơn hàng chưa thanh
// toán trước ngày hiện tại". Xoá MỌI đơn payment_status IN
// ('unpaid','expired') có created_at TRƯỚC 00:00 hôm nay (giờ hệ thống
// VPS) — rộng hơn cron tự động (chỉ đúng hôm qua), dùng chung hàm xoá cốt
// lõi deleteOrdersByRange.
router.post('/admin/cleanup-unpaid-orders', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { start, endExclusive } = cleanupCron.beforeTodayRange(new Date());
    const result = cleanupCron.deleteOrdersByRange(
      db,
      start,
      endExclusive,
      'admin-manual-cleanup',
    );
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
