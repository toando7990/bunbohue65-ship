// ============================================================
// routes/analytics.js — REST JSON + X-API-Key + HMAC
// ============================================================
// Frontend (vps-client.ts) calls:
//   GET /analytics?range=7d|30d|90d  → AnalyticsResponse (camelCase)
//
// Legacy endpoints (kept for backward compat):
//   GET  /analytics/summary
//   GET  /analytics/revenue?from=&to=
//   GET  /analytics/orders?status=&from=&to=
//   GET  /analytics/customers
//   GET  /orders
//   GET  /orders/:id
//   GET  /orders/:id/status
// ============================================================

const express = require('express');
const { verifyApiKey, verifyHmac } = require('../middleware/auth');

const router = express.Router();

router.use(verifyApiKey);
router.use(verifyHmac);

// Map range string → ms cutoff.
function rangeToFromMs(range) {
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30; // default 30d
  return now - days * 24 * 60 * 60 * 1000;
}

// Format ms timestamp → YYYY-MM-DD (local date string for byDay grouping).
function dayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// GET /analytics?range=7d|30d|90d — frontend contract (camelCase)
// Returns AnalyticsResponse:
//   { totalOrders, totalRevenue, paidOrders, pendingOrders, shippingOrders,
//     cancelledOrders, averageOrderValue, byRestaurant:[{restaurantId,name,orders,revenue}],
//     byDay:[{date,orders,revenue}] }
router.get('/analytics', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const range = req.query.range || '30d';
    const fromMs = rangeToFromMs(range);

    // Total orders trong range
    const totalOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE created_at >= ?`,
    ).get(fromMs).c;

    // Revenue = SUM(amount) WHERE payment_status='paid' trong range
    const totalRevenue = db.prepare(
      `SELECT COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid' AND created_at >= ?`,
    ).get(fromMs).s;

    const paidOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE payment_status='paid' AND created_at >= ?`,
    ).get(fromMs).c;

    const pendingOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE payment_status='unpaid' AND booking_status != 'cancelled' AND created_at >= ?`,
    ).get(fromMs).c;

    const shippingOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE booking_status='shipping' AND created_at >= ?`,
    ).get(fromMs).c;

    const cancelledOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE booking_status='cancelled' AND created_at >= ?`,
    ).get(fromMs).c;

    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // byRestaurant — group by restaurant_id trong range
    const byRestaurantRows = db.prepare(
      `SELECT restaurant_id, COALESCE(NULLIF(restaurant_id,''),'unknown') AS rid,
              COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
       FROM orders WHERE created_at >= ?
       GROUP BY restaurant_id ORDER BY revenue DESC`,
    ).all(fromMs);
    const byRestaurant = byRestaurantRows.map((r) => ({
      restaurantId: r.rid,
      name: r.rid, // TODO: join restaurant name khi có bảng restaurants
      orders: r.orders,
      revenue: r.revenue,
    }));

    // byDay — group by date trong range
    const byDayRows = db.prepare(
      `SELECT (created_at / 86400000) * 86400000 AS day_ms,
              COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
       FROM orders WHERE created_at >= ?
       GROUP BY day_ms ORDER BY day_ms ASC`,
    ).all(fromMs);
    const byDay = byDayRows.map((r) => ({
      date: dayKey(r.day_ms),
      orders: r.orders,
      revenue: r.revenue,
    }));

    res.json({
      totalOrders,
      totalRevenue,
      paidOrders,
      pendingOrders,
      shippingOrders,
      cancelledOrders,
      averageOrderValue,
      byRestaurant,
      byDay,
    });
  } catch (e) { next(e); }
});

// GET /analytics/summary — legacy
router.get('/analytics/summary', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const totalOrders = db.prepare(`SELECT COUNT(*) c FROM orders`).get().c;
    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid'`).get().s;
    const pendingPayment = db.prepare(`SELECT COUNT(*) c FROM orders WHERE payment_status='unpaid' AND booking_status != 'cancelled'`).get().c;
    const completed = db.prepare(`SELECT COUNT(*) c FROM orders WHERE booking_status='completed'`).get().c;
    const invoiced = db.prepare(`SELECT COUNT(*) c FROM orders WHERE invoice_status='invoiced'`).get().c;
    res.json({ total_orders: totalOrders, total_revenue: totalRevenue, pending_payment: pendingPayment, completed, invoiced });
  } catch (e) { next(e); }
});

// GET /analytics/revenue?from=&to= (ms timestamps) — legacy
router.get('/analytics/revenue', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const from = Number(req.query.from) || 0;
    const to = Number(req.query.to) || Date.now();
    const row = db.prepare(
      `SELECT COALESCE(SUM(amount),0) total, COUNT(*) count FROM orders
       WHERE payment_status='paid' AND created_at >= ? AND created_at <= ?`,
    ).get(from, to);
    res.json({ from, to, total_revenue: row.total, order_count: row.count });
  } catch (e) { next(e); }
});

// GET /analytics/orders?status=&from=&to= — legacy
router.get('/analytics/orders', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, from, to } = req.query;
    const fromMs = Number(from) || 0;
    const toMs = Number(to) || Date.now();
    let sql = `SELECT order_id, restaurant_id, cus_name, cus_phone, amount, booking_status, payment_status, invoice_status, created_at FROM orders WHERE created_at >= ? AND created_at <= ?`;
    const params = [fromMs, toMs];
    if (status) { sql += ` AND booking_status = ?`; params.push(status); }
    const rows = db.prepare(sql).all(...params);
    res.json({ count: rows.length, orders: rows });
  } catch (e) { next(e); }
});

// GET /analytics/customers — legacy
router.get('/analytics/customers', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const rows = db.prepare(
      `SELECT cus_phone, cus_name, COUNT(*) order_count, SUM(amount) total_spent
       FROM orders GROUP BY cus_phone ORDER BY total_spent DESC LIMIT 100`,
    ).all();
    res.json({ count: rows.length, customers: rows });
  } catch (e) { next(e); }
});

// GET /orders — legacy
router.get('/orders', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const rows = db.prepare(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset);
    res.json({ count: rows.length, orders: rows });
  } catch (e) { next(e); }
});

// GET /orders/:id — legacy
router.get('/orders/:id', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const order = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(req.params.id);
    res.json({ order, items });
  } catch (e) { next(e); }
});

// GET /orders/:id/status — legacy
router.get('/orders/:id/status', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(
      `SELECT booking_status, payment_status, invoice_status, tingee_qr_id, shared_link, invoice_id FROM orders WHERE order_id = ?`,
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    res.json({
      booking_status: row.booking_status,
      payment_status: row.payment_status,
      invoice_status: row.invoice_status,
      tingee_qr_id: row.tingee_qr_id,
      shared_link: row.shared_link,
      invoice_id: row.invoice_id,
    });
  } catch (e) { next(e); }
});

module.exports = router;
