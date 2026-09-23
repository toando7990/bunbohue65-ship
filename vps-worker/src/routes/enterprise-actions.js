// ============================================================
// routes/enterprise-actions.js — thao tác GHI của vai trò Kế toán
//   POST /orders/enterprise/:id/cleanup  { deviceId }
//   POST /orders/enterprise/:id/invoice  { deviceId, invoiceId, pdfUrl }
// ============================================================
// BUG THẬT đã sửa ("Order not found" khi bấm "Dọn dẹp"): danh sách Kế toán
// đọc từ VPS SQLite (giữ nhiều ngày — routes/enterprise-history.js), nhưng
// 2 nút "Dọn dẹp"/"Hoá đơn" trước đây CHỈ ghi vào canister — mà canister
// chỉ giữ đơn TRONG NGÀY (pruneOldOrders). Đơn từ hôm trước → canister báo
// "Order not found"; kể cả đơn trong ngày, danh sách (VPS) cũng không phản
// ánh thay đổi. Giờ ghi vào VPS SQLite (nguồn của danh sách), rồi đồng bộ
// canister NẾU đơn vẫn còn trên đó (best-effort — "Order not found" ở
// canister là bình thường với đơn cũ, không phải lỗi).
//
// Quyền: CHỈ thiết bị vai trò accounting (khớp quyền canister cho
// cleanupOrderByDevice/issueInvoiceByDevice), cache 5 phút như
// enterprise-history.js.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use('/orders/enterprise', rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }));

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const roleCache = new Map();

async function isAccountingDevice(deviceId) {
  const cached = roleCache.get(deviceId);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;
  let ok = false;
  try {
    ok = await canister.deviceHasAccountingRole(deviceId);
  } catch (e) {
    console.error('[enterprise-actions] role check error:', deviceId, e.message);
  }
  roleCache.set(deviceId, { ok, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return ok;
}

async function guard(req, res) {
  const deviceId = String((req.body || {}).deviceId || '').trim();
  if (!deviceId) {
    res.status(400).json({ ok: false, error: 'Missing deviceId' });
    return null;
  }
  if (!(await isAccountingDevice(deviceId))) {
    res.status(403).json({ ok: false, error: 'Chỉ thiết bị Kế toán được thực hiện thao tác này.' });
    return null;
  }
  const db = req.app.locals.db;
  const order = db.prepare('SELECT order_id, booking_status FROM orders WHERE order_id = ?').get(req.params.id);
  if (!order) {
    res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng trên máy chủ.' });
    return null;
  }
  return { db, order };
}

function isNotFound(result) {
  return result && result.err !== undefined && /not found/i.test(String(result.err));
}

router.post('/orders/enterprise/:id/cleanup', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    g.db.prepare(`UPDATE orders SET booking_status = 'cancelled', updated_at = ? WHERE order_id = ?`)
      .run(Date.now(), g.order.order_id);
    let canisterSynced = false;
    try {
      const r = await canister.cancelOrder(g.order.order_id);
      canisterSynced = !!(r && r.ok);
      if (!canisterSynced && !isNotFound(r)) {
        console.warn('[enterprise-actions] canister cancelOrder:', g.order.order_id, r && r.err);
      }
    } catch (e) {
      console.warn('[enterprise-actions] canister cancelOrder error:', g.order.order_id, e.message);
    }
    res.json({ ok: true, canisterSynced });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/enterprise/:id/invoice', async (req, res, next) => {
  try {
    const invoiceId = String((req.body || {}).invoiceId || '').trim();
    const pdfUrl = String((req.body || {}).pdfUrl || '').trim();
    if (!invoiceId || !pdfUrl) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập mã hoá đơn và đường dẫn PDF.' });
    }
    const g = await guard(req, res);
    if (!g) return;
    g.db.prepare(`UPDATE orders SET invoice_status = 'invoiced', invoice_id = ?, pdf_url = ?, updated_at = ? WHERE order_id = ?`)
      .run(invoiceId, pdfUrl, Date.now(), g.order.order_id);
    let canisterSynced = false;
    try {
      const r = await canister.updateInvoiceStatus(g.order.order_id, 'invoiced', invoiceId, pdfUrl);
      canisterSynced = !!(r && r.ok);
      if (!canisterSynced && !isNotFound(r)) {
        console.warn('[enterprise-actions] canister updateInvoiceStatus:', g.order.order_id, r && r.err);
      }
    } catch (e) {
      console.warn('[enterprise-actions] canister updateInvoiceStatus error:', g.order.order_id, e.message);
    }
    res.json({ ok: true, canisterSynced });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
