// ============================================================
// routes/webhooks.js — Ahamove + Tingee webhooks + backup poll
// ============================================================
// POST /webhook/ahamove + /webhook/tingee (rate-limit + verify signature)
// → map status → push canister. Backup poll Ahamove 10s + Tingee 5s.
// Sau paid → Tingee delete-dynamic-qr.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const cron = require('node-cron');
const ahamove = require('../lib/ahamove');
const tingee = require('../lib/tingee'); // { generateDynamicQr, deleteDynamicQr, getDynamicQrStatus, BASE_URL }
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');
const shutdown = require('../lib/shutdown');

const router = express.Router();

// Rate-limit webhooks: 60 req/phút/IP
router.use(rateLimit({ windowMs: 60000, max: 60, message: 'Too many webhook calls' }));

// ------------------------------------------------------------
// Webhook signature verification.
// ------------------------------------------------------------
// Production PHẢI verify. Dev (NODE_ENV !== 'production') cho phép skip
// khi secret chưa set để dễ test, nhưng vẫn log warning.
// ------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === 'production';
const AHAMOVE_WEBHOOK_SECRET =
  process.env.AHAMOVE_WEBHOOK_SECRET || process.env.AHAMOVE_API_KEY;
const TINGEE_SECRET = process.env.TINGEE_SECRET;

if (!AHAMOVE_WEBHOOK_SECRET) {
  console.warn(
    '[webhooks] AHAMOVE_WEBHOOK_SECRET (or AHAMOVE_API_KEY) missing — Ahamove webhook verification will fail in production'
  );
}
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

// verifyAhamoveWebhook: verify X-Ahamove-Signature header.
// Signature = HMAC-SHA256(rawBody, secret), hex lowercase.
function verifyAhamoveWebhook(req, res, next) {
  const sig = req.get('X-Ahamove-Signature');
  if (!sig) {
    if (!IS_PROD && !AHAMOVE_WEBHOOK_SECRET) {
      console.warn('[webhook/ahamove] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(401).json({ error: 'missing X-Ahamove-Signature' });
  }
  if (!AHAMOVE_WEBHOOK_SECRET) {
    if (!IS_PROD) {
      console.warn('[webhook/ahamove] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(500).json({ error: 'webhook secret not configured' });
  }
  const rawBody = req.rawBody || '';
  const expected = crypto
    .createHmac('sha256', AHAMOVE_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');
  if (!safeEqualHex(sig, expected)) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
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

// POST /webhook/ahamove — body: { order_id, status, ... }
router.post('/webhook/ahamove', verifyAhamoveWebhook, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { order_id: ahamoveOrderId, status } = req.body || {};
    if (!ahamoveOrderId) return res.status(400).json({ error: 'order_id required' });

    db.prepare(`INSERT INTO ahamove_logs (order_id, ahamove_order_id, action, response_body, created_at) VALUES (?, ?, 'webhook', ?, ?)`)
      .run(ahamoveOrderId, ahamoveOrderId, JSON.stringify(req.body), Date.now());

    const row = db.prepare(`SELECT order_id FROM orders WHERE ahamove_order_id = ?`).get(ahamoveOrderId);
    if (!row) return res.status(404).json({ error: 'order not found' });

    const bookingStatus = ahamove.mapAhamoveStatus(status);
    if (bookingStatus) {
      try {
        await canister.updateStatus(row.order_id, bookingStatus);
        db.prepare(`UPDATE orders SET booking_status = ?, updated_at = ? WHERE order_id = ?`)
          .run(bookingStatus, Date.now(), row.order_id);
      } catch (e) {
        console.error('[webhook/ahamove] canister updateStatus error:', e.message);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /webhook/ahamove/cancel — body: { orderId, comment }
// Manual cancel trigger: call ahamove.cancelOrder(ahamoveOrderId, comment),
// map CANCELLED → 'cancelled' via mapAhamoveStatus, push canister.updateStatus.
// Logs to ahamove_logs with action='cancel'.
router.post('/webhook/ahamove/cancel', verifyAhamoveWebhook, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { orderId, comment } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const row = db.prepare(
      `SELECT order_id, ahamove_order_id, booking_status FROM orders WHERE order_id = ?`,
    ).get(orderId);
    if (!row) return res.status(404).json({ error: 'order not found' });
    if (!row.ahamove_order_id) return res.status(400).json({ error: 'order has no ahamove_order_id' });

    const cancelComment = comment || 'Cancelled by operator';
    let cancelResp = {};
    let cancelErr = null;
    try {
      cancelResp = await ahamove.cancelOrder(row.ahamove_order_id, cancelComment);
    } catch (e) {
      cancelErr = e;
    }

    db.prepare(
      `INSERT INTO ahamove_logs (order_id, ahamove_order_id, action, request_body, response_body, error, created_at)
       VALUES (?, ?, 'cancel', ?, ?, ?, ?)`,
    ).run(
      row.order_id,
      row.ahamove_order_id,
      JSON.stringify({ comment: cancelComment }),
      JSON.stringify(cancelResp),
      cancelErr ? cancelErr.message : null,
      Date.now(),
    );

    if (cancelErr) {
      console.error('[webhook/ahamove/cancel] cancelOrder error:', cancelErr.message);
      return res.status(502).json({ ok: false, error: `Ahamove cancel failed: ${cancelErr.message}` });
    }

    // On success ({} response) → map CANCELLED → 'cancelled' and push canister.
    const bookingStatus = ahamove.mapAhamoveStatus('CANCELLED');
    try {
      await canister.updateStatus(row.order_id, bookingStatus);
      db.prepare(`UPDATE orders SET booking_status = ?, updated_at = ? WHERE order_id = ?`)
        .run(bookingStatus, Date.now(), row.order_id);
    } catch (e) {
      console.error('[webhook/ahamove/cancel] canister updateStatus error:', e.message);
    }
    res.json({ ok: true, bookingStatus });
  } catch (e) {
    next(e);
  }
});

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

// Poll Ahamove 10s: các order chưa completed/cancelled.
function startAhamovePoll(db) {
  const task = cron.schedule('*/10 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const rows = db.prepare(
        `SELECT order_id, ahamove_order_id, booking_status FROM orders
         WHERE ahamove_order_id != '' AND booking_status NOT IN ('completed', 'cancelled')`,
      ).all();
      for (const row of rows) {
        try {
          const info = await ahamove.getOrderDetail(row.ahamove_order_id);
          const newStatus = ahamove.mapAhamoveStatus(info.status);
          // Log poll to ahamove_logs with action='get_status'.
          db.prepare(
            `INSERT INTO ahamove_logs (order_id, ahamove_order_id, action, response_body, status_code, created_at)
             VALUES (?, ?, 'get_status', ?, ?, ?)`,
          ).run(row.order_id, row.ahamove_order_id, JSON.stringify(info), 200, Date.now());
          if (newStatus && newStatus !== row.booking_status) {
            await canister.updateStatus(row.order_id, newStatus);
            db.prepare(`UPDATE orders SET booking_status = ?, updated_at = ? WHERE order_id = ?`)
              .run(newStatus, Date.now(), row.order_id);
          }
        } catch (e) {
          console.error('[poll/ahamove] error:', row.order_id, e.message);
        }
      }
    } catch (e) {
      console.error('[poll/ahamove] fatal:', e.message);
    }
  });
  return task;
}

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
module.exports.startAhamovePoll = startAhamovePoll;
module.exports.startTingeePoll = startTingeePoll;
