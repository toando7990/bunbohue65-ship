// ============================================================
// routes/customers.js — GET /customers/:email + POST /customers
// ============================================================
// Frontend (vps-client.ts) calls GET /customers/:email để tự động
// điền tên/SĐT/email vào giỏ hàng khi mở app với email đã xác thực.
// Trả về { email, name, phone } nếu tồn tại, ngược lại 404.
//
// POST /customers upsert một customer theo email. Chỉ tạo row mới khi
// email chưa tồn tại — KHÔNG ghi đè name/phone đã có. Lúc tạo chỉ biết
// email nên name/phone để trống (default ''). Trả về customer đã tạo/tồn tại.
// ============================================================

const express = require('express');

const router = express.Router();

// GET /customers/:email
router.get('/customers/:email', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }

  const row = db.prepare(
    'SELECT email, name, phone FROM customers WHERE email = ?'
  ).get(email);

  if (!row) {
    return res.status(404).json({ ok: false, error: 'Customer not found' });
  }

  res.json({ email: row.email, name: row.name, phone: row.phone });
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

  // Chỉ tạo row khi email chưa tồn tại — không ghi đè name/phone đã có.
  db.prepare(
    `INSERT INTO customers (email, name, phone, created_at, updated_at)
     VALUES (@email, '', '', @now, @now)
     ON CONFLICT(email) DO NOTHING`
  ).run({ email, now });

  const row = db.prepare(
    'SELECT email, name, phone FROM customers WHERE email = ?'
  ).get(email);

  res.json({ email: row.email, name: row.name, phone: row.phone });
});

module.exports = router;
