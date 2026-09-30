// ============================================================
// routes/customer-step.js — "Đặt tài xế" / "Huỷ đơn" của khách
// ============================================================
// Gọi từ "Theo dõi đơn" (/track/:orderId), KHÔNG cần đăng nhập — cùng mức
// tin cậy với các hành động tự phục vụ theo orderId khác (routes/qr.js,
// routes/order-restaurant.js): orderId có 8 ký tự hex ngẫu nhiên, chỉ
// trình duyệt đã đặt đơn mới biết. Logic nằm ở lib/customer-step.js.
//
//   GET  /order/:id/customer-step           → trạng thái + hạn chót
//   POST /order/:id/customer-step/dispatch  → khách bấm "Đặt tài xế"
//   POST /order/:id/customer-step/cancel    → khách bấm "Huỷ đơn" { reason }

const express = require('express');
const customerStep = require('../lib/customer-step');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

// Trang theo dõi đơn poll mỗi 5s → GET giới hạn rộng; POST giới hạn chặt.
router.get('/order/:id/customer-step', rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));
router.post(['/order/:id/customer-step/dispatch', '/order/:id/customer-step/cancel'], rateLimit({ windowMs: 60000, max: 10, message: 'Too many requests' }));

router.get('/order/:id/customer-step', (req, res, next) => {
  try {
    const state = customerStep.publicState(req.app.locals.db, String(req.params.id || ''));
    if (!state) return res.status(404).json({ ok: false, error: 'Order not found' });
    res.json({ ok: true, ...state });
  } catch (e) {
    next(e);
  }
});

router.post('/order/:id/customer-step/dispatch', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    const r = await customerStep.requestDispatch(db, orderId);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.error });
    res.json({ ok: true, ...customerStep.publicState(db, orderId) });
  } catch (e) {
    next(e);
  }
});

router.post('/order/:id/customer-step/cancel', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    const r = await customerStep.cancelByCustomer(db, orderId, (req.body || {}).reason);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.error });
    res.json({ ok: true, ...customerStep.publicState(db, orderId) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
