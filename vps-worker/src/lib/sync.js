// ============================================================
// lib/sync.js — Retry queue + reconciliation + alert email
// ============================================================
// - Retry queue: 5 lần exponential backoff, cron 30s.
// - Reconciliation: cron 5 phút, so sánh VPS state vs canister state.
// - Alert email khi lệch >5 phút.
// ============================================================

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const canister = require('./canister');
const shutdown = require('./shutdown');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_EMAIL = process.env.ALERT_EMAIL;

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  if (!SMTP_HOST || !SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

async function sendAlert(subject, text) {
  const t = transporter();
  if (!t || !ALERT_EMAIL) {
    console.warn('[sync] alert skipped (no SMTP/ALERT_EMAIL):', subject);
    return;
  }
  try {
    await t.sendMail({ from: SMTP_USER, to: ALERT_EMAIL, subject, text });
  } catch (e) {
    console.error('[sync] alert email failed:', e.message);
  }
}

// Retry queue: các order chưa push createOrder thành công (canister_synced=0).
// 5 lần, exponential backoff: 30s, 60s, 120s, 240s, 480s.
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 30000;

function shouldRetry(order) {
  if (order.canister_synced) return false;
  if (order.retry_count >= MAX_RETRIES) return false;
  if (!order.last_retry_at) return true;
  const backoff = BACKOFF_BASE_MS * Math.pow(2, order.retry_count);
  return Date.now() - order.last_retry_at >= backoff;
}

// Cron 30s: retry các order chưa synced.
function startRetryQueue(db) {
  const task = cron.schedule('*/30 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const pending = db.prepare(
        `SELECT * FROM orders WHERE canister_synced = 0 AND retry_count < ?`
          .replace('?', String(MAX_RETRIES)),
      ).all(MAX_RETRIES);
      for (const row of pending) {
        if (!shouldRetry(row)) continue;
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.order_id);
        try {
          const result = await canister.createOrder({
            orderId: row.order_id, restaurantId: row.restaurant_id,
            cusName: row.cus_name, cusPhone: row.cus_phone, cusAddress: row.cus_address,
            cusTaxCode: row.cus_tax_code, receiverEmail: row.receiver_email,
            items: items.map((it) => ({
              itemId: it.item_id, name: it.name, price: it.price,
              quantity: it.quantity, unitName: it.unit_name, vatRate: it.vat_rate,
            })),
            amount: row.amount, goodsAmount: row.goods_amount,
            shippingFee: row.shipping_fee, taxTotal: row.tax_total,
            ahamoveOrderId: row.ahamove_order_id, tingeeQrId: row.tingee_qr_id,
            sharedLink: row.shared_link,
          });
          if (result?.ok) {
            db.prepare(`UPDATE orders SET canister_synced = 1, updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), row.order_id);
          } else {
            db.prepare(`UPDATE orders SET retry_count = retry_count + 1, last_retry_at = ?, updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), Date.now(), row.order_id);
            console.warn('[sync] createOrder retry failed:', row.order_id, result?.err);
          }
        } catch (e) {
          db.prepare(`UPDATE orders SET retry_count = retry_count + 1, last_retry_at = ?, updated_at = ? WHERE order_id = ?`)
            .run(Date.now(), Date.now(), row.order_id);
          console.error('[sync] createOrder retry error:', row.order_id, e.message);
        }
      }
    } catch (e) {
      console.error('[sync] retry queue error:', e.message);
    }
  });
  return task;
}

// Reconciliation cron 5 phút: so sánh VPS state vs canister state cho các order
// đã synced. Nếu lệch >5 phút (updatedAt chênh >5min), alert email.
function startReconciliation(db) {
  const task = cron.schedule('*/5 * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const synced = db.prepare(
        `SELECT order_id, booking_status, payment_status, invoice_status, updated_at FROM orders WHERE canister_synced = 1`,
      ).all();
      let driftCount = 0;
      for (const row of synced) {
        try {
          const result = await canister.getOrderStatus(row.order_id);
          if (result?.err) {
            driftCount++;
            continue;
          }
          const cs = result.ok;
          if (cs.bookingStatus[row.booking_status] === undefined ||
              cs.paymentStatus[row.payment_status] === undefined ||
              cs.invoiceStatus[row.invoice_status] === undefined) {
            driftCount++;
          }
        } catch (e) {
          driftCount++;
          console.error('[sync] reconcile error:', row.order_id, e.message);
        }
      }
      if (driftCount > 0) {
        await sendAlert(
          '[Bunbohue65] Sync drift detected',
          `${driftCount} order(s) lệch state giữa VPS và canister. Kiểm tra logs VPS.`,
        );
      }
    } catch (e) {
      console.error('[sync] reconciliation error:', e.message);
    }
  });
  return task;
}

module.exports = { startRetryQueue, startReconciliation, sendAlert, MAX_RETRIES };
