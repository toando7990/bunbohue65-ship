// ============================================================
// db.js — SQLite schema + WAL + backup
// ============================================================
// Tables: orders, order_items, customers, ahamove_logs, tingee_logs, bkav_logs
// Indexes trên order_id, restaurant_id, status, created_at
// WAL mode + busy_timeout. Backup function (gzip daily).
// ============================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');

function ensureDirs() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function openDb() {
  ensureDirs();
  const db = new Database(DB_PATH);
  // WAL mode + busy_timeout cho concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  order_id            TEXT PRIMARY KEY,
  restaurant_id       TEXT NOT NULL,
  cus_name            TEXT NOT NULL,
  cus_phone           TEXT NOT NULL,
  cus_address         TEXT NOT NULL,
  cus_tax_code        TEXT NOT NULL DEFAULT '',
  receiver_email      TEXT NOT NULL DEFAULT '',
  amount              INTEGER NOT NULL,        -- total amount (VND, nguyên đồng)
  goods_amount        INTEGER NOT NULL,        -- tiền hàng (pre-tax + pre-shipping)
  shipping_fee        INTEGER NOT NULL,
  tax_total           INTEGER NOT NULL,        -- VAT 8% trên goods_amount
  ahamove_order_id    TEXT NOT NULL DEFAULT '',
  tingee_qr_id        TEXT NOT NULL DEFAULT '',
  tingee_qr_account   TEXT NOT NULL DEFAULT '',   -- account từ generate-dynamic-qr response
  tingee_bill_id      TEXT NOT NULL DEFAULT '',   -- billId từ generate-dynamic-qr response
  tingee_qr_code      TEXT NOT NULL DEFAULT '',   -- raw VietQR EMV string từ generate-dynamic-qr response
  shared_link         TEXT NOT NULL DEFAULT '',
  invoice_id          TEXT NOT NULL DEFAULT '',
  pdf_url             TEXT NOT NULL DEFAULT '',        -- link PDF hóa đơn từ Bkav (CmdType 816)
  pickup_code         TEXT NOT NULL DEFAULT '',        -- mã 6 ký tự khách báo tài xế đọc cho quán khi thanh toán
  booking_status      TEXT NOT NULL DEFAULT 'confirmed',  -- pending|confirmed|shipping|completed|cancelled
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',     -- unpaid|paid|refunded|expired
  invoice_status      TEXT NOT NULL DEFAULT 'none',      -- none|invoiced|failed
  canister_synced     INTEGER NOT NULL DEFAULT 0,         -- 0/1: đã push createOrder thành công
  retry_count         INTEGER NOT NULL DEFAULT 0,
  last_retry_at       INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  quantity    INTEGER NOT NULL,
  unit_name   TEXT NOT NULL DEFAULT '',
  vat_rate    INTEGER NOT NULL DEFAULT 8,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  email       TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ahamove_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL,
  ahamove_order_id TEXT,
  action          TEXT NOT NULL,    -- quote|create|get_status|webhook
  request_body    TEXT,
  response_body   TEXT,
  status_code     INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tingee_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  tingee_qr_id TEXT,
  action       TEXT NOT NULL,    -- generate_qr|delete_qr|get_status|webhook
  request_body TEXT,
  response_body TEXT,
  status_code  INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bkav_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  invoice_id   TEXT,
  command      TEXT NOT NULL,    -- CreateInvoice|GetInvoicePDF|email
  request_xml  TEXT,
  response_xml TEXT,
  status_code  INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_booking_status ON orders(booking_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_status ON orders(invoice_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ahamove_logs_order_id ON ahamove_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ahamove_logs_created_at ON ahamove_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tingee_logs_order_id ON tingee_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_tingee_logs_created_at ON tingee_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bkav_logs_order_id ON bkav_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_bkav_logs_created_at ON bkav_logs(created_at);
`;

function initSchema(db) {
  db.exec(SCHEMA);

  // Migration an toàn: thêm 2 cột mới cho Tingee (qr_account, bill_id)
  // nếu DB cũ chưa có. Dùng PRAGMA table_info để kiểm tra, không crash
  // nếu cột đã tồn tại (CREATE TABLE IF NOT EXISTS không cập nhật schema cũ).
  const cols = db.prepare('PRAGMA table_info(orders)').all();
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has('tingee_qr_account')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_qr_account TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('tingee_bill_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_bill_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('tingee_qr_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_qr_code TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('pdf_url')) {
    db.exec("ALTER TABLE orders ADD COLUMN pdf_url TEXT NOT NULL DEFAULT ''");
  }
  // expire_at: Unix timestamp (giây) khi QR Tingee hết hạn. Dùng cho idempotency
  // của POST /order/:id/qr — nếu now < expire_at thì trả QR hiện có, không tạo
  // bill Tingee mới (tránh code=1001 rate limit).
  if (!colNames.has('expire_at')) {
    db.exec("ALTER TABLE orders ADD COLUMN expire_at INTEGER");
  }
  // pickup_code: mã 6 ký tự (chữ hoa + số, không có 0/O 1/I) sinh lúc tạo
  // đơn. Khách xem trong "Theo dõi đơn", tự báo tài xế bằng ngoài luồng
  // (gọi điện, nhắn tin...). Tài xế đọc mã này cho nhân viên quán khi đến
  // lấy hàng — POST /order/:id/qr yêu cầu khớp mã này trước khi tạo QR
  // Tingee, để nhân viên không tự bấm "Thanh toán" khi tài xế chưa thực sự
  // có mặt. KHÔNG bao giờ trả field này qua listPendingPaymentOrders phía
  // canister (xem core-api.mo hidePickupCode).
  if (!colNames.has('pickup_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN pickup_code TEXT NOT NULL DEFAULT ''");
  }
}

// Backup daily: copy DB file (WAL checkpoint) → gzip vào BACKUP_DIR.
// Trả về đường dẫn file backup, hoặc throw nếu lỗi.
function backup(db) {
  // Force WAL checkpoint để snapshot đầy đủ
  db.pragma('wal_checkpoint(TRUNCATE)');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `app-${ts}.db.gz`);
  const buf = fs.readFileSync(DB_PATH);
  const gz = zlib.gzipSync(buf);
  fs.writeFileSync(backupPath, gz);
  // Giữ 30 ngày gần nhất
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.startsWith('app-') || !f.endsWith('.db.gz')) continue;
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
  return backupPath;
}

module.exports = { openDb, initSchema, backup, DB_PATH, BACKUP_DIR };
