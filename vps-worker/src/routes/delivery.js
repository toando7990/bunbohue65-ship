// ============================================================
// routes/delivery.js — giao hàng 2 hãng (Lalamove + Ahamove)
//   GET  /order/:id/delivery        trạng thái chung cho "Theo dõi đơn"
//   POST /orders/delivery-status    { orderIds[] } — thẻ đơn /driver (≤ 50)
//   POST /webhook/ahamove           Ahamove báo trạng thái
//   GET  /admin/delivery            cài đặt + kết nối + thống kê (vé admin)
//   POST /admin/delivery            { settings } — lưu cài đặt (vé admin)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const delivery = require('../lib/delivery');
const { requireAdminTicket } = require('../lib/admin-ticket');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const PURPOSE = 'delivery';
const REFRESH_ON_READ_MS = 20 * 1000;

router.use('/order/:id/delivery', rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));
router.use('/orders/delivery-status', rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));

router.get('/order/:id/delivery', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    // Lượt đang chạy lâu chưa làm mới (webhook chưa có) → làm mới ngay.
    const active = db.prepare('SELECT * FROM deliveries WHERE order_id = ? AND ended = 0 ORDER BY id DESC').get(orderId);
    if (active && Date.now() - (active.refreshed_at || 0) >= REFRESH_ON_READ_MS) {
      await delivery.refreshRow(db, active);
    }
    res.json({ ok: true, delivery: delivery.publicStatus(db, orderId) });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/delivery-status', (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String).slice(0, 50) : [];
    res.json({ ok: true, deliveries: delivery.batchStatus(req.app.locals.db, ids) });
  } catch (e) {
    next(e);
  }
});

// Ahamove gọi kèm khoá đã thống nhất (apikey / Bearer) nếu đặt
// AHAMOVE_WEBHOOK_KEY. Dù sao VPS cũng đọc lại trạng thái qua API Ahamove,
// không tin dữ liệu gửi tới.
function verifyAhamoveWebhook(req, res, next) {
  const key = process.env.AHAMOVE_WEBHOOK_KEY;
  if (!key) return next();
  const auth = req.get('Authorization') || '';
  const got = req.get('apikey') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const a = Buffer.from(String(got));
  const b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'invalid key' });
  }
  next();
}

router.post('/webhook/ahamove', verifyAhamoveWebhook, async (req, res) => {
  // Trả 200 ngay; xử lý sau để Ahamove không phải chờ.
  res.json({ ok: true });
  try {
    await delivery.onAhamoveWebhook(req.app.locals.db, req.body || {});
  } catch (e) {
    console.error('[webhook/ahamove] lỗi xử lý:', e.message);
  }
});

router.get('/admin/delivery', requireAdminTicket(PURPOSE), async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await delivery.adminInfo(req.app.locals.db)) });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/delivery', requireAdminTicket(PURPOSE), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const settings = delivery.setSettings(db, req.body?.settings || {}, 'admin');
    console.log('[delivery] cài đặt mới:', JSON.stringify(settings));
    res.json({ ok: true, ...(await delivery.adminInfo(db)) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
