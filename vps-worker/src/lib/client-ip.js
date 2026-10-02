// IP thật của khách khi request đi qua reverse proxy (proxy.bunbohue65.com).
// KHÔNG bật app 'trust proxy' toàn cục (rate-limit đang dùng req.ip). Ưu tiên
// X-Real-IP (nginx đặt), sau đó phần tử CUỐI của X-Forwarded-For (do proxy
// của mình nối thêm — phần tử đầu do client tự gửi được, dễ giả), cuối cùng
// là địa chỉ socket.
function clientIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real.slice(0, 64);
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length) return xff[xff.length - 1].slice(0, 64);
  const sock = (req.socket && req.socket.remoteAddress) || req.ip || '';
  return String(sock).replace(/^::ffff:/, '').slice(0, 64);
}

module.exports = { clientIp };
