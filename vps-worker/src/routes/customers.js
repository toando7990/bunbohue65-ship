// ============================================================
// routes/customers.js — GET /customers/:email + POST /customers + PUT /customers/:email
// ============================================================
// Frontend (vps-client.ts) calls GET /customers/:email để tự động
// điền tên/SĐT/email vào giỏ hàng khi mở app với email đã xác thực.
// Trả về { email, name, phone, notifyKm } nếu tồn tại, ngược lại 404.
//
// POST /customers upsert một customer theo email. Chỉ tạo row mới khi
// email chưa tồn tại — KHÔNG ghi đè name/phone/notifyKm đã có. Lúc tạo
// chỉ biết email nên name/phone để trống, notifyKm=false (default). Trả
// về customer đã tạo/tồn tại.
//
// PUT /customers/:email — cập nhật (hoặc tạo mới nếu chưa có) tên/SĐT/
// notifyKm (Giai đoạn 4b — đăng ký nhận email nhắc trước 15 phút khi có
// khuyến mãi giờ vàng). Dùng cho trang "Thông tin của bạn" (Profile.tsx)
// — khách chủ động sửa hồ sơ của mình. KHÁC với POST (create-only, không
// ghi đè) — PUT LUÔN ghi đè name/phone/notifyKm bằng giá trị mới gửi lên.
// ============================================================

const express = require('express');

const router = express.Router();

function toCustomerJson(row) {
  return {
    email: row.email,
    name: row.name,
    phone: row.phone,
    notifyKm: !!row.km_notify_opt_in,
  };
}

// GET /customers/:email
router.get('/customers/:email', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in FROM customers WHERE email = ?'
  ).get(email);

  if (!row) {
    return res.status(404).json({ ok: false, error: 'Customer not found' });
  }

  res.json(toCustomerJson(row));
});

// POST /customers — upsert customer by email (create-only, no overwrite)
router.post('/customers', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ ok: false, error: 'email must be a non-empty string' });
  }

  const now = Date.now();

  // Chỉ tạo row khi email chưa tồn tại — không ghi đè dữ liệu đã có.
  db.prepare(
    `INSERT INTO customers (email, name, phone, km_notify_opt_in, created_at, updated_at)
     VALUES (@email, '', '', 0, @now, @now)
     ON CONFLICT(email) DO NOTHING`
  ).run({ email, now });

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in FROM customers WHERE email = ?'
  ).get(email);

  res.json(toCustomerJson(row));
});

// PUT /customers/:email — cập nhật hồ sơ (tên + SĐT + notifyKm), LUÔN ghi
// đè. Tạo mới nếu email chưa tồn tại (upsert thật, khác POST ở trên). Yêu
// cầu name + phone không rỗng — trang Profile.tsx đã validate phía
// frontend, kiểm tra lại ở đây cho chắc (không tin dữ liệu client gửi
// lên). notifyKm là Bool, mặc định false nếu không gửi lên (không bắt
// buộc như name/phone).
router.put('/customers/:email', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const notifyKm = body.notifyKm === true ? 1 : 0;

  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }
  if (!name) {
    return res.status(400).json({ ok: false, error: 'name must be a non-empty string' });
  }
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'phone must be a non-empty string' });
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO customers (email, name, phone, km_notify_opt_in, created_at, updated_at)
     VALUES (@email, @name, @phone, @notifyKm, @now, @now)
     ON CONFLICT(email) DO UPDATE SET name = @name, phone = @phone, km_notify_opt_in = @notifyKm, updated_at = @now`
  ).run({ email, name, phone, notifyKm, now });

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in FROM customers WHERE email = ?'
  ).get(email);

  res.json(toCustomerJson(row));
});

module.exports = router;
