// ============================================================
// routes/enterprise-actions.js — thao tác GHI của vai trò Kế toán
//   POST /orders/enterprise/:id/delete   { deviceId }  — xoá 1 đơn đã huỷ
//   POST /orders/enterprise/delete-cancelled { deviceId, dryRun? } — xoá hàng loạt
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
const bkav = require('../lib/bkav');
const { rateLimit } = require('../middleware/rate-limit');
const { getInvoiceAuto, setInvoiceAuto } = require('../lib/invoice-settings');

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

// ---------------------------------------------------------------------
// "Xoá" đơn (thay cho "Dọn dẹp" = huỷ đơn trước đây — Kế toán KHÔNG còn
// chức năng huỷ đơn thủ công, theo yêu cầu). XOÁ VĨNH VIỄN khỏi VPS, chỉ
// với đơn đủ CẢ 4 điều kiện:
//   1. Đã huỷ (booking_status = 'cancelled');
//   2. CHƯA TỪNG thanh toán — payment_status khác 'paid', chưa ghi nhận
//      hình thức thanh toán, không có mã tham chiếu ảnh chuyển khoản (đơn
//      "đã huỷ + đã thanh toán" liên quan tiền thật → KHÔNG xoá);
//   3. Chưa có hoá đơn Bkav (chứng từ phải lưu giữ);
//   4. Tạo TRƯỚC hôm nay (giờ VN) — đơn huỷ trong ngày còn đang xử lý.
// Xoá sạch trong 1 giao dịch (món, nhật ký Tingee/Bkav/Ahamove, đơn) + ghi
// deleted_orders_log; sau đó xoá ảnh xác nhận chuyển khoản trên đĩa (nếu có).
// ---------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC7_MS = 7 * 60 * 60 * 1000;
function startOfTodayUtc7(nowMs) {
  return Math.floor((nowMs + UTC7_MS) / DAY_MS) * DAY_MS - UTC7_MS;
}
const MANUAL_PAYMENT_DIR = path.join(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'),
  'manual-payment',
);

const DELETABLE_WHERE = `booking_status = 'cancelled'
  AND payment_status <> 'paid'
  AND COALESCE(payment_method, '') = ''
  AND COALESCE(manual_payment_reference, '') = ''
  AND invoice_status <> 'invoiced'
  AND COALESCE(invoice_id, '') = ''
  AND created_at < ?`;

// Lý do KHÔNG được xoá (tiếng Việt, hiện cho Kế toán) — null nếu được xoá.
function notDeletableReason(o, todayStart) {
  if (o.booking_status !== 'cancelled') return 'Chỉ xoá được đơn đã huỷ.';
  if (o.payment_status === 'paid' || o.payment_method || o.manual_payment_reference) {
    return 'Đơn đã thanh toán — không thể xoá.';
  }
  if (o.invoice_status === 'invoiced' || o.invoice_id) return 'Đơn đã có hoá đơn — không thể xoá.';
  if (o.created_at >= todayStart) return 'Chỉ xoá được đơn từ hôm trước trở về trước.';
  return null;
}

function deleteOrdersTx(db, rows, deviceId) {
  const now = Date.now();
  const tx = db.transaction((list) => {
    for (const o of list) {
      db.prepare(
        `INSERT INTO deleted_orders_log (order_id, restaurant_id, cus_name, cus_phone, amount, order_created_at, deleted_by_device, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(o.order_id, o.restaurant_id || '', o.cus_name || '', o.cus_phone || '', o.amount || 0, o.created_at || 0, deviceId, now);
      for (const t of ['order_items', 'ahamove_logs', 'tingee_logs', 'bkav_logs']) {
        db.prepare(`DELETE FROM ${t} WHERE order_id = ?`).run(o.order_id);
      }
      db.prepare('DELETE FROM orders WHERE order_id = ?').run(o.order_id);
    }
  });
  tx(rows);
  // Ảnh xác nhận chuyển khoản: tên file `${orderId}-${timestamp}.(jpg|png)`.
  // Ngoài giao dịch DB — lỗi xoá file chỉ ghi log, không hoàn tác việc xoá.
  let files = [];
  try {
    files = fs.readdirSync(MANUAL_PAYMENT_DIR);
  } catch {
    files = [];
  }
  for (const o of rows) {
    const esc = o.order_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${esc}-\\d+\\.(jpg|png)$`);
    for (const f of files.filter((x) => re.test(x))) {
      try {
        fs.unlinkSync(path.join(MANUAL_PAYMENT_DIR, f));
      } catch (e) {
        console.warn('[enterprise-actions] không xoá được ảnh', f, e.message);
      }
    }
  }
}

// Xoá 1 đơn.
router.post('/orders/enterprise/:id/delete', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
    const reason = notDeletableReason(o, startOfTodayUtc7(Date.now()));
    if (reason) return res.status(409).json({ ok: false, error: reason });
    deleteOrdersTx(g.db, [o], String(req.body.deviceId).trim());
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    next(e);
  }
});

// Xoá HÀNG LOẠT mọi đơn đủ điều kiện. dryRun=true → chỉ đếm (để hộp thoại
// xác nhận hiện đúng số lượng sẽ bị xoá), không xoá gì.
router.post('/orders/enterprise/delete-cancelled', async (req, res, next) => {
  try {
    const deviceId = String((req.body || {}).deviceId || '').trim();
    if (!deviceId) return res.status(400).json({ ok: false, error: 'Missing deviceId' });
    if (!(await isAccountingDevice(deviceId))) {
      return res.status(403).json({ ok: false, error: 'Chỉ thiết bị Kế toán được thực hiện thao tác này.' });
    }
    const db = req.app.locals.db;
    const rows = db.prepare(`SELECT * FROM orders WHERE ${DELETABLE_WHERE}`).all(startOfTodayUtc7(Date.now()));
    if (req.body.dryRun === true) return res.json({ ok: true, count: rows.length });
    if (rows.length > 0) deleteOrdersTx(db, rows, deviceId);
    res.json({ ok: true, deleted: rows.length });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------
// "Phát hành lại" hoá đơn Bkav cho đơn đã bị đánh dấu 'failed'. Chỉ trong
// khung 1 ngày làm việc kể từ khi đơn được tạo (CÙNG khung cron phát hành
// bù — xem routes/invoice.js). Không phát hành trực tiếp ở đây: đặt lại về
// hàng chờ (invoice_status='none') để cron xử lý với ĐỦ cơ chế an toàn
// (khoá chống chạy chồng, thử lại). invoice_retry_count=1 → cron KIỂM TRA
// Bkav đã có hoá đơn cho đơn này chưa TRƯỚC khi tạo (tránh phát hành trùng).
// ---------------------------------------------------------------------
const { startOfPreviousWorkingDayUtc7 } = require('./invoice');
// Seri hoá đơn production — cùng giá trị routes/invoice.js dùng.
const PROD_INVOICE_SERIAL = process.env.BKAV_PROD_INVOICE_SERIAL || 'C26MAA';

function notReissuableReason(o, windowStart) {
  if (o.invoice_status !== 'failed') return 'Chỉ phát hành lại được đơn có hoá đơn "Thất bại".';
  if (o.payment_status !== 'paid') return 'Đơn chưa thanh toán — không phát hành hoá đơn.';
  if (o.booking_status === 'cancelled') return 'Đơn đã huỷ — không phát hành hoá đơn.';
  if (o.pdf_url) {
    return 'Bkav đã có hoá đơn cho đơn này — đối chiếu và ghi nhận số hoá đơn thủ công, không phát hành lại.';
  }
  if (o.created_at < windowStart) {
    return 'Quá 1 ngày làm việc kể từ khi tạo đơn — không phát hành lại tự động.';
  }
  return null;
}

router.post('/orders/enterprise/:id/reissue', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
    const reason = notReissuableReason(o, startOfPreviousWorkingDayUtc7(Date.now()));
    if (reason) return res.status(409).json({ ok: false, error: reason });
    const r = g.db.prepare(
      `UPDATE orders SET invoice_status = 'none', invoice_retry_count = 1, invoice_error = '', invoice_requested = 1, updated_at = ? WHERE order_id = ? AND invoice_status = 'failed'`,
    ).run(Date.now(), o.order_id);
    g.db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'Reissue', ?, ?)`)
      .run(o.order_id, `Kế toán yêu cầu phát hành lại (thiết bị ${String(req.body.deviceId).trim()})`, Date.now());
    res.json({ ok: true, queued: r.changes === 1 });
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

// ============================================================
// Kế toán PHÁT HÀNH hoá đơn (thay cho tự động phát hành khi thanh toán) +
// thêm MST khách để phát hành hoá đơn công ty.
// ============================================================

// Chỉ kiểm tra thiết bị Kế toán (không gắn với 1 đơn cụ thể như guard()).
async function guardDevice(req, res) {
  const deviceId = String((req.body || {}).deviceId || '').trim();
  if (!deviceId) {
    res.status(400).json({ ok: false, error: 'Missing deviceId' });
    return null;
  }
  if (!(await isAccountingDevice(deviceId))) {
    res.status(403).json({ ok: false, error: 'Chỉ thiết bị Kế toán được thực hiện thao tác này.' });
    return null;
  }
  return { db: req.app.locals.db, deviceId };
}

// Lý do KHÔNG phát hành được (tiếng Việt) — null nếu phát hành được.
function notIssuableReason(o, windowStart) {
  if (!o) return 'Không tìm thấy đơn hàng trên máy chủ.';
  if (o.booking_status === 'cancelled') return 'Đơn đã huỷ — không phát hành hoá đơn.';
  if (o.payment_status !== 'paid') return 'Đơn chưa thanh toán.';
  if (o.invoice_status === 'invoiced') return 'Đơn đã có hoá đơn.';
  if (o.invoice_status === 'failed' && o.pdf_url) {
    return 'Bkav đã có hoá đơn cho đơn này — đối chiếu và ghi nhận số hoá đơn thủ công, không phát hành lại.';
  }
  if (o.created_at < windowStart) return 'Quá hạn phát hành (hết ngày làm việc tiếp theo sau ngày bán).';
  return null;
}

// POST /orders/enterprise/invoice/issue { deviceId, orderIds: [] }
// Đánh dấu các đơn cần phát hành — cron hoá đơn (routes/invoice.js) phát
// hành trong vòng ~15 giây. Đơn "Thất bại" được đưa về hàng chờ để thử lại.
router.post('/orders/enterprise/invoice/issue', async (req, res, next) => {
  try {
    const g = await guardDevice(req, res);
    if (!g) return;
    const ids = Array.isArray((req.body || {}).orderIds) ? req.body.orderIds.map(String) : [];
    if (ids.length === 0 || ids.length > 200) {
      return res.status(400).json({ ok: false, error: 'Chọn từ 1 đến 200 đơn.' });
    }
    const windowStart = startOfPreviousWorkingDayUtc7(Date.now());
    const queued = [];
    const rejected = [];
    const now = Date.now();
    for (const id of [...new Set(ids)]) {
      const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(id);
      const reason = notIssuableReason(o, windowStart);
      if (reason) {
        rejected.push({ orderId: id, reason });
        continue;
      }
      if (o.invoice_status === 'failed') {
        g.db.prepare(
          `UPDATE orders SET invoice_status = 'none', invoice_retry_count = 1, invoice_error = '', invoice_requested = 1, updated_at = ? WHERE order_id = ?`,
        ).run(now, id);
      } else {
        g.db.prepare('UPDATE orders SET invoice_requested = 1, updated_at = ? WHERE order_id = ?').run(now, id);
      }
      g.db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'IssueRequest', ?, ?)`)
        .run(id, `Kế toán yêu cầu phát hành (thiết bị ${g.deviceId})`, now);
      queued.push(id);
    }
    res.json({ ok: true, queued, rejected });
  } catch (e) {
    next(e);
  }
});

// POST /orders/enterprise/invoice/auto-setting { deviceId } — đọc công tắc
// "Phát hành hoá đơn Bkav tự động".
// POST /orders/enterprise/invoice/auto { deviceId, enabled } — bật/tắt.
// Chi tiết hành vi: lib/invoice-settings.js.
router.post('/orders/enterprise/invoice/auto-setting', async (req, res, next) => {
  try {
    const g = await guardDevice(req, res);
    if (!g) return;
    res.json({ ok: true, ...getInvoiceAuto(g.db) });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/enterprise/invoice/auto', async (req, res, next) => {
  try {
    const g = await guardDevice(req, res);
    if (!g) return;
    const enabled = (req.body || {}).enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'Thiếu enabled (true/false).' });
    }
    const s = setInvoiceAuto(g.db, enabled, g.deviceId, Date.now());
    g.db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES ('', 'AutoSetting', ?, ?)`)
      .run(`${enabled ? 'BẬT' : 'TẮT'} phát hành tự động (thiết bị ${g.deviceId})`, Date.now());
    console.log(`[invoice/auto] ${enabled ? 'BẬT' : 'TẮT'} phát hành tự động — thiết bị ${g.deviceId}`);
    res.json({ ok: true, ...s });
  } catch (e) {
    next(e);
  }
});

// Mã số thuế: 10 số, 10 số + "-" + 3 số (chi nhánh), 12 số (CCCD dùng làm
// MST cá nhân), 14 số.
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12}|\d{14})$/;
function normalizeTaxCode(v) {
  return String(v || '').replace(/\s+/g, '').trim();
}

// POST /orders/enterprise/:id/invoice-correction
//   { deviceId, kind: 'replace'|'adjust', buyerTaxCode, buyerName,
//     buyerAddress, receiverEmail, reason }
// THAY THẾ (Bkav lệnh 123) hoặc ĐIỀU CHỈNH THÔNG TIN (lệnh 124) hoá đơn ĐÃ
// phát hành. Món + số tiền giữ nguyên như đơn gốc (người dùng đã chốt) —
// chỉ đổi thông tin người mua. Gọi Bkav NGAY (không qua cron), trả kết quả.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const correctionInFlight = new Set();
router.post('/orders/enterprise/:id/invoice-correction', async (req, res, next) => {
  const orderId = req.params.id;
  try {
    const g = await guardDevice(req, res);
    if (!g) return;
    const body = req.body || {};
    const kind = body.kind === 'adjust' ? 'adjust' : body.kind === 'replace' ? 'replace' : '';
    const reason = String(body.reason || '').trim();
    const taxCode = normalizeTaxCode(body.buyerTaxCode);
    const buyerName = String(body.buyerName || '').trim();
    const buyerAddress = String(body.buyerAddress || '').trim();
    const receiverEmail = String(body.receiverEmail || '').trim();
    if (!kind) return res.status(400).json({ ok: false, error: 'Chọn Thay thế hoặc Điều chỉnh.' });
    if (reason.length < 5) return res.status(400).json({ ok: false, error: 'Nhập lý do (ít nhất 5 ký tự).' });
    if (taxCode && !TAX_CODE_RE.test(taxCode)) return res.status(400).json({ ok: false, error: 'Mã số thuế không hợp lệ.' });
    if (taxCode && !buyerName) return res.status(400).json({ ok: false, error: 'Nhập tên đơn vị mua hàng.' });
    if (receiverEmail && !EMAIL_RE.test(receiverEmail)) return res.status(400).json({ ok: false, error: 'Email không hợp lệ.' });

    const row = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!row) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng.' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(409).json({ ok: false, error: 'Đơn chưa có hoá đơn đã phát hành.' });
    }
    if (correctionInFlight.has(orderId)) {
      return res.status(409).json({ ok: false, error: 'Đơn này đang được xử lý — đợi vài giây.' });
    }
    correctionInFlight.add(orderId);

    const { orderTaxRate, partnerIdOf, syncInvoiceStatusToCanister } = require('./invoice');
    // Hoá đơn gốc: mẫu số + ký hiệu đã lưu, hoặc hỏi Bkav (lệnh 800) cho
    // hoá đơn phát hành trước khi hệ thống lưu các trường này.
    let original = {
      invoiceForm: row.bkav_invoice_form,
      invoiceSerial: row.bkav_invoice_serial,
      invoiceNo: Number(row.invoice_id),
      invoiceDate: '',
    };
    try {
      const info = await bkav.getInvoiceInfo800(row.bkav_invoice_guid || partnerIdOf(row));
      original = info;
      g.db.prepare('UPDATE orders SET bkav_invoice_form = ?, bkav_invoice_serial = ?, bkav_invoice_guid = ? WHERE order_id = ?')
        .run(info.invoiceForm, info.invoiceSerial, info.invoiceGUID, orderId);
    } catch (e) {
      if (!original.invoiceForm || !original.invoiceSerial || !original.invoiceNo) {
        correctionInFlight.delete(orderId);
        return res.status(502).json({ ok: false, error: `Không lấy được thông tin hoá đơn gốc từ Bkav: ${e.message}` });
      }
    }

    const items = g.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    const n = g.db.prepare('SELECT COUNT(*) AS c FROM invoice_corrections WHERE order_id = ?').get(orderId).c + 1;
    const partnerId = `${orderId}-${kind === 'replace' ? 'T' : 'D'}${n}`;
    const invoiceInput = {
      orderId,
      items: items.map((it) => ({ name: it.name, price: it.price, quantity: it.quantity, unitName: it.unit_name || '' })),
      amount: row.amount,
      kmDiscountAmount: row.km_discount_amount,
      voucherDiscountAmount: row.voucher_discount_amount,
      taxRate: orderTaxRate(items, orderId),
      paymentMethod: row.payment_method,
      receiverEmail,
      isRetailInvoice: !taxCode,
      buyerTaxCode: taxCode,
      buyerName,
      buyerUnitName: buyerName,
      buyerAddress,
    };

    let result;
    try {
      result = await bkav.sendCorrection(kind, invoiceInput, original, { reason, partnerId });
    } catch (e) {
      result = { success: false, error: e.message, raw: null, request: null };
    }
    const command = kind === 'replace' ? 'ReplaceInvoice' : 'AdjustInvoice';
    const now = Date.now();
    g.db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, request_xml, response_xml, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(orderId, result.invoiceNo || '', command, JSON.stringify(result.request || null).slice(0, 20000),
        typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw ?? null), result.success ? '' : String(result.error || ''), now);
    const identify = bkav.originalInvoiceIdentify(original.invoiceForm, original.invoiceSerial, original.invoiceNo);
    g.db.prepare(`INSERT INTO invoice_corrections (order_id, kind, partner_id, original_identify, new_invoice_no, buyer_tax_code, buyer_name, reason, status, error, device_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(orderId, kind, partnerId, identify, result.invoiceNo || '', taxCode, buyerName, reason,
        result.success ? 'ok' : 'failed', result.success ? '' : String(result.error || ''), g.deviceId, now);

    if (!result.success) {
      correctionInFlight.delete(orderId);
      return res.status(502).json({ ok: false, error: `Bkav từ chối: ${result.error || 'không rõ lý do'}` });
    }

    const newNo = result.invoiceNo || '';
    if (kind === 'replace') {
      // Hoá đơn hiện hành của đơn = hoá đơn thay thế.
      g.db.prepare(`UPDATE orders SET invoice_replaced_no = ?, invoice_id = ?, bkav_ma_cqt = ?, bkav_ma_tra_cuu = ?,
          bkav_partner_id = ?, bkav_invoice_form = ?, bkav_invoice_serial = ?, bkav_invoice_guid = ?, pdf_url = '',
          cus_tax_code = ?, cus_tax_name = ?, updated_at = ? WHERE order_id = ?`)
        .run(row.invoice_id, newNo || row.invoice_id, result.maCQT || '', result.maTraCuu || '', partnerId,
          result.invoiceForm || original.invoiceForm, result.invoiceSerial || original.invoiceSerial, result.invoiceGUID || '',
          taxCode, taxCode ? buyerName : '', now, orderId);
      let pdfUrl = '';
      try {
        pdfUrl = (await bkav.getInvoicePdf816(partnerId))?.pdf_url || '';
        if (pdfUrl) g.db.prepare('UPDATE orders SET pdf_url = ? WHERE order_id = ?').run(pdfUrl, orderId);
      } catch {
        // PDF lấy lại được sau (nút Xem PDF gọi 816 theo bkav_partner_id).
      }
      try {
        await syncInvoiceStatusToCanister(orderId, 'invoiced', newNo || row.invoice_id, pdfUrl);
      } catch {
        // Canister chỉ để hiển thị phía khách — lỗi không chặn kết quả.
      }
    } else {
      g.db.prepare('UPDATE orders SET invoice_adjusted_no = ?, updated_at = ? WHERE order_id = ?').run(newNo || '(chưa có số)', now, orderId);
    }
    correctionInFlight.delete(orderId);
    console.log(`[invoice-correction] ${command} ${orderId}: ${identify} → số ${newNo || '(chưa có số)'} (thiết bị ${g.deviceId})`);
    res.json({ ok: true, kind, invoiceNo: newNo, originalIdentify: identify });
  } catch (e) {
    correctionInFlight.delete(orderId);
    next(e);
  }
});

// POST /orders/enterprise/tax-code-lookup { deviceId, taxCode } — tra cứu
// tên + địa chỉ đã đăng ký với cơ quan thuế (Bkav CmdType 904) để Kế toán
// kiểm tra trước khi lưu MST cho đơn.
router.post('/orders/enterprise/tax-code-lookup', async (req, res, next) => {
  try {
    const g = await guardDevice(req, res);
    if (!g) return;
    const taxCode = normalizeTaxCode(req.body.taxCode);
    if (!TAX_CODE_RE.test(taxCode)) {
      return res.status(400).json({ ok: false, error: 'Mã số thuế không hợp lệ (10, 12, 14 số hoặc dạng 0123456789-001).' });
    }
    let lookup;
    try {
      lookup = await bkav.lookupTaxCode(taxCode, { prodInvoiceSerial: PROD_INVOICE_SERIAL });
    } catch (e) {
      console.error('[enterprise-actions] tax-code-lookup lỗi:', taxCode, e.message);
      return res.status(502).json({ ok: false, error: 'Không tra cứu được mã số thuế lúc này, vui lòng thử lại.' });
    }
    res.json({
      ok: true,
      found: !!(lookup.found && lookup.name),
      name: lookup.name || '',
      address: lookup.address || '',
      status: lookup.status || '',
    });
  } catch (e) {
    next(e);
  }
});

// POST /orders/enterprise/:id/tax-code { deviceId, taxCode, taxName? } —
// lưu (hoặc xoá, taxCode rỗng) MST khách cho đơn CHƯA có hoá đơn. Cron
// hoá đơn đọc cus_tax_code: có MST → hoá đơn công ty (tự tra cứu lại tên/
// địa chỉ chính thức lúc phát hành), không có → hoá đơn bán lẻ.
router.post('/orders/enterprise/:id/tax-code', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
    if (o.invoice_status === 'invoiced') {
      return res.status(409).json({ ok: false, error: 'Đơn đã có hoá đơn — không sửa được mã số thuế.' });
    }
    if (o.invoice_requested && o.invoice_status === 'none') {
      return res.status(409).json({ ok: false, error: 'Đơn đang được phát hành hoá đơn — không sửa được mã số thuế lúc này.' });
    }
    const taxCode = normalizeTaxCode(req.body.taxCode);
    if (taxCode && !TAX_CODE_RE.test(taxCode)) {
      return res.status(400).json({ ok: false, error: 'Mã số thuế không hợp lệ (10, 12, 14 số hoặc dạng 0123456789-001).' });
    }
    const taxName = taxCode ? String(req.body.taxName || '').trim().slice(0, 300) : '';
    g.db.prepare('UPDATE orders SET cus_tax_code = ?, cus_tax_name = ?, updated_at = ? WHERE order_id = ?')
      .run(taxCode, taxName, Date.now(), o.order_id);
    res.json({ ok: true, taxCode, taxName });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
