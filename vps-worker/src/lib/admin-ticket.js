// ============================================================
// lib/admin-ticket.js — xác thực quản trị viên (trang /admin) khi gọi VPS
// ============================================================
// Trang /admin đăng nhập bằng Internet Identity — VPS không kiểm tra được
// danh tính đó trực tiếp. Canister (đã biết ai là admin) cấp "vé":
//   issueVpsAdminTicket(purpose) → "<ms>.<hex>"
//   hex = HMAC-SHA256(vpsSecret, "admin|<purpose>|<ms>")
// Frontend gửi vé qua header X-Admin-Ticket; VPS kiểm tra bằng VPS_SECRET
// (cùng khoá bí mật với canister) và hạn 10 phút.
// ============================================================

const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000;

function verifyTicket(ticket, purpose, nowMs = Date.now()) {
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(String(ticket || '').trim());
  if (!m) return false;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms) || Math.abs(nowMs - ms) > TTL_MS) return false;
  const secrets = [process.env.VPS_SECRET, process.env.VPS_SECRET_PREVIOUS].filter(Boolean);
  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(`admin|${purpose}|${m[1]}`, 'utf8').digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(m[2]);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function requireAdminTicket(purpose) {
  return (req, res, next) => {
    if (!verifyTicket(req.get('X-Admin-Ticket'), purpose)) {
      return res.status(401).json({ ok: false, error: 'Phiên quản trị hết hạn — tải lại trang.' });
    }
    next();
  };
}

module.exports = { verifyTicket, requireAdminTicket, TTL_MS };
