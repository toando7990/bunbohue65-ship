// ============================================================
// routes/webhooks.js — Tingee webhook + backup poll
// ============================================================
// POST /webhook/tingee (rate-limit + verify signature) → ack only (poll là
// nguồn trạng thái thanh toán duy nhất). Backup poll Tingee 5s.
// Sau paid → Tingee delete-dynamic-qr.
//
// AhaMove ĐÃ GỠ HOÀN TOÀN (khách tự đặt tài xế bằng app ngoài — quote.js/
// create.js không còn tạo đơn AhaMove từ trước) — xoá luôn webhook +
// backup poll AhaMove vì không còn tác dụng, chỉ gây lỗi 401 lặp vô hạn
// cho các đơn test cũ còn sót ahamove_order_id.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const cron = require('node-cron');
const tingee = require('../lib/tingee'); // { generateDynamicQr, deleteDynamicQr, getDynamicQrStatus, BASE_URL }
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');
const shutdown = require('../lib/shutdown');

const router = express.Router();

// Rate-limit webhooks: 60 req/phút/IP. CHỈ áp dụng cho route cụ thể —
// cùng lý do đã sửa ở routes/create.js.
router.use('/webhook/tingee', rateLimit({ windowMs: 60000, max: 60, message: 'Too many webhook calls' }));

// ------------------------------------------------------------
// Webhook signature verification.
// ------------------------------------------------------------
// Production PHẢI verify. Dev (NODE_ENV !== 'production') cho phép skip
// khi secret chưa set để dễ test, nhưng vẫn log warning.
// ------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === 'production';
const TINGEE_SECRET = process.env.TINGEE_SECRET;

if (!TINGEE_SECRET) {
  console.warn(
    '[webhooks] TINGEE_SECRET missing — Tingee webhook verification will fail in production'
  );
}

// Constant-time hex string comparison. Traps on length mismatch, so guard
// with a length check first to avoid leaking length info via thrown error.
function safeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// verifyTingeeWebhook: verify X-Tingee-Signature header.
// Per Tingee spec: signature = HMAC_SHA512(x-request-timestamp + ':' + rawBody, TINGEE_SECRET).
// Timestamp from X-Tingee-Timestamp (or x-request-timestamp) header.
function verifyTingeeWebhook(req, res, next) {
  const sig = req.get('X-Tingee-Signature');
  const ts =
    req.get('X-Tingee-Timestamp') || req.get('x-request-timestamp');
  if (!sig || !ts) {
    if (!IS_PROD && !TINGEE_SECRET) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(401).json({ error: 'missing X-Tingee-Signature or timestamp' });
  }
  if (!TINGEE_SECRET) {
    if (!IS_PROD) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(500).json({ error: 'webhook secret not configured' });
  }
  const rawBody = req.rawBody || '';
  const payload = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha512', TINGEE_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  if (!safeEqualHex(sig, expected)) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
}

// POST /webhook/tingee — body: { qr_id, status, ... }
// KHÔNG còn dùng để xác định trạng thái thanh toán. get-status-dynamic-qr
// (startTingeePoll) là nguồn trạng thái DUY NHẤT. Route này chỉ log và ack.
router.post('/webhook/tingee', verifyTingeeWebhook, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { qr_id: tingeeQrId } = req.body || {};
    if (!tingeeQrId) return res.status(400).json({ error: 'qr_id required' });

    db.prepare(`INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, created_at) VALUES (?, ?, 'webhook', ?, ?)`)
      .run(tingeeQrId, tingeeQrId, JSON.stringify(req.body), Date.now());

    // Payment status được xác định bởi get-status-dynamic-qr (startTingeePoll),
    // không phải webhook này. Ack để Tingee không retry.
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ============================================================
// Backup poll (cron) — bù webhooks bị miss
// ============================================================

// Poll Tingee 5s — get-status-dynamic-qr là nguồn trạng thái thanh toán DUY NHẤT.
// Cửa sổ poll khóa theo expire_at của QR (thời điểm QR hết hạn), KHÔNG theo
// created_at của đơn — vì QR được tạo khi tài xế bấm 'Thanh toán' (thường lâu
// sau khi tạo đơn). Poll các QR động còn hiệu lực (expire_at > now) và chưa
// thanh toán cho đến khi xác định được trạng thái cuối.
function startTingeePoll(db) {
  // Backoff khi gặp code 1001 (thao tác quá nhanh / rate limit): tạm ngừng poll
  // đơn đó trong 60s để không làm Tingee chặn tốc độ lây sang request tạo QR mới.
  const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
  // In-memory trạng thái poll: orderId → skipUntilMs (backoff 1001). Reset khi
  // worker khởi động lại là chấp nhận được.
  const backoffUntil = new Map(); // orderId -> ms
  const task = cron.schedule('*/5 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      // Chỉ poll đơn unpaid có qrAccount + billId hợp lệ và QR còn hiệu lực
      // (expire_at > now). Đơn có QR hết hạn (expire_at <= now) sẽ được
      // startUnpaidExpiry (sync.js) xử lý markPaymentExpired.
      const rows = db.prepare(
        `SELECT order_id, amount, tingee_qr_account, tingee_bill_id, expire_at
         FROM orders
         WHERE payment_status = 'unpaid'
           AND tingee_qr_account != ''
           AND tingee_bill_id != ''
           AND expire_at IS NOT NULL
           AND expire_at > ?`,
      ).all(Math.floor(Date.now() / 1000));
      const now = Date.now();
      for (const row of rows) {
        // Đang backoff (1001) → bỏ qua đơn này.
        const until = backoffUntil.get(row.order_id);
        if (until !== undefined && now < until) continue;
        try {
          const data = await tingee.getDynamicQrStatus({
            qrAccount: row.tingee_qr_account,
            billId: row.tingee_bill_id,
          });
          // Log mọi kết quả get-status-dynamic-qr vào tingee_logs (action 'get_status').
          db.prepare(
            `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, status_code, created_at)
             VALUES (?, ?, 'get_status', ?, ?, ?)`,
          ).run(row.order_id, row.tingee_qr_account, JSON.stringify(data.raw || data), 200, Date.now());
          // Thành công → xoá backoff nếu có.
          backoffUntil.delete(row.order_id);
          const billInfo = (data && data.data && data.data.billInfo) || {};
          const statusOk = String(billInfo.status || '').toLowerCase() === 'fully-paid';
          const amountOk = Number(billInfo.totalAmountPaid || 0) >= Number(row.amount || 0);
          if (statusOk || amountOk) {
            // Đã thanh toán → push updatePaymentStatus('paid') + xoá QR.
            await canister.updatePaymentStatus(row.order_id, 'paid');
            db.prepare(`UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), row.order_id);
            try {
              await tingee.deleteDynamicQr({ qrAccount: row.tingee_qr_account, billId: row.tingee_bill_id });
            } catch (e) { console.warn('[poll/tingee] deleteDynamicQr failed:', e.message); }
          }
        } catch (e) {
          const code = e && e.code;
          if (code === '1001') {
            // Rate limit → backoff đơn này, không retry ngay trong chu kỳ này.
            backoffUntil.set(row.order_id, Date.now() + RATE_LIMIT_BACKOFF_MS);
            console.warn('[poll/tingee] rate limit (1001), backoff:', row.order_id);
          } else if (code === '1003') {
            // Bill không tồn tại (hết hạn/bị xoá) → đánh dấu đơn expired để tài
            // xế tạo QR mới. startUnpaidExpiry (sync.js) cũng xử lý nhánh này.
            console.warn('[poll/tingee] bill not found (1003), mark expired:', row.order_id);
            try {
              await canister.markPaymentExpired(row.order_id);
              db.prepare(
                `UPDATE orders SET payment_status = 'expired', tingee_qr_account = '', tingee_bill_id = '', tingee_qr_code = '', expire_at = NULL, updated_at = ? WHERE order_id = ?`,
              ).run(Date.now(), row.order_id);
            } catch (err) {
              console.error('[poll/tingee] markPaymentExpired error:', row.order_id, err.message);
            }
          } else {
            console.error('[poll/tingee] error:', row.order_id, code, e.message);
          }
        }
      }
    } catch (e) {
      console.error('[poll/tingee] fatal:', e.message);
    }
  });
  return task;
}

module.exports = router;
module.exports.startTingeePoll = startTingeePoll;
