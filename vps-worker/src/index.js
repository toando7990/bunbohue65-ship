// ============================================================
// index.js — Express app entry point
// ============================================================
// - Express + CORS + /health
// - Mount routes: quote, create, webhooks, invoice, analytics, upload
// - Cron jobs: backup daily, reconciliation 5min, retry 30s,
//   poll Tingee 5s, invoice 1min
// - Static /uploads
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const multer = require('multer');

const { openDb, initSchema, backup } = require('./db');
const { startRetryQueue, startReconciliation, startUnpaidExpiry } = require('./lib/sync');
const shutdown = require('./lib/shutdown');

const quoteRoutes = require('./routes/quote');
const createRoutes = require('./routes/create');
const qrRoutes = require('./routes/qr');
const orderRestaurantRoutes = require('./routes/order-restaurant');
const webhooksRoutes = require('./routes/webhooks');
const invoiceRoutes = require('./routes/invoice');
const salesBonusCron = require('./routes/sales-bonus-cron');
const kmNotifyCron = require('./routes/km-notify-cron');
const analyticsRoutes = require('./routes/analytics');
const uploadRoutes = require('./routes/upload');
const customersRoutes = require('./routes/customers');
const orderHistoryRoutes = require('./routes/order-history');
const restaurantHistoryRoutes = require('./routes/restaurant-history');

const cronJobs = [];

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// --- DB init ---
const db = openDb();
initSchema(db);

// --- Express app ---
const app = express();
app.locals.db = db;

// Capture raw body cho HMAC verify (analytics)
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  limit: '2mb',
}));

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));

// Static uploads
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Mount routes
app.use('/', quoteRoutes);
app.use('/', createRoutes);
app.use('/', qrRoutes);
app.use('/', orderRestaurantRoutes);
app.use('/', webhooksRoutes);
app.use('/', invoiceRoutes);
app.use('/', uploadRoutes);
app.use('/', customersRoutes);
app.use('/', orderHistoryRoutes);
app.use('/', restaurantHistoryRoutes);
app.use('/', analyticsRoutes);

// Error handler
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  if (err instanceof multer?.MulterError || err?.message?.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'internal_error', detail: err.message });
});

// --- Cron jobs ---
// Backup daily 03:00
cronJobs.push(cron.schedule('0 3 * * *', () => {
  if (shutdown.shuttingDown) return;
  try {
    const p = backup(db);
    console.log('[cron] backup →', p);
  } catch (e) {
    console.error('[cron] backup failed:', e.message);
  }
}));

// Retry queue 30s
cronJobs.push(startRetryQueue(db));

// Reconciliation 5 phút
cronJobs.push(startReconciliation(db));

// Auto-cancel đơn unpaid hết hạn 1 phút (khớp expiry QR 15 phút)
cronJobs.push(startUnpaidExpiry(db));

// Poll Tingee 5s (backup cho webhook)
cronJobs.push(webhooksRoutes.startTingeePoll(db));

// Invoice cron 1 phút (tạo invoice cho completed + paid)
cronJobs.push(invoiceRoutes.startInvoiceCron(db));
cronJobs.push(salesBonusCron.startSalesBonusCron(db));
cronJobs.push(kmNotifyCron.startKmNotifyCron(db));

// --- Start ---
app.listen(PORT, () => {
  console.log(`[vps-worker] listening on :${PORT}`);
  console.log(`[vps-worker] CORS origin: ${CORS_ORIGIN}`);
  console.log(`[vps-worker] UPLOAD_DIR: ${UPLOAD_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('[vps-worker] graceful shutdown started');
  shutdown.shuttingDown = true;
  cronJobs.forEach((t) => { try { t.stop(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 5000)); // đợi pending tasks 5s
  try { db.close(); } catch (e) {}
  process.exit(0);
}
