// ============================================================
// middleware/auth.js — X-API-Key + HMAC verify cho analytics
// ============================================================
// Analytics endpoints yêu cầu:
//   Header: X-API-Key: <ANALYTICS_API_KEY>
//   Header: X-Signature: HMAC-SHA256(ANALYTICS_API_KEY, body) hex
// (HMAC optional cho GET — chỉ verify X-API-Key.)
// ============================================================

const crypto = require('crypto');

const API_KEY = process.env.ANALYTICS_API_KEY;
if (!API_KEY) console.warn('[auth] ANALYTICS_API_KEY missing — analytics endpoints open');

function verifyApiKey(req, res, next) {
  if (!API_KEY) return next(); // open nếu chưa cấu hình (dev only)
  const key = req.get('X-API-Key');
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }
  next();
}

// HMAC verify cho POST/PUT body. Skip cho GET.
function verifyHmac(req, res, next) {
  if (req.method === 'GET') return next();
  if (!API_KEY) return next();
  const sig = req.get('X-Signature');
  if (!sig) return res.status(401).json({ error: 'Missing X-Signature' });
  const rawBody = req.rawBody || '';
  const expected = crypto.createHmac('sha256', API_KEY).update(rawBody, 'utf8').digest('hex');
  // Timing-safe compare: crypto.timingSafeEqual throws when the two buffers
  // differ in length, so guard with a length check first. Comparing hex
  // strings of equal length byte-by-byte avoids the short-circuit of `!==`.
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }
  next();
}

module.exports = { verifyApiKey, verifyHmac };
