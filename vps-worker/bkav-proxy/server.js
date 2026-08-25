'use strict';

// ============================================================
// bkav-proxy/server.js — Bkav decrypt proxy
// ============================================================
// Chạy như 1 service HỆ THỐNG RIÊNG trên VPS (systemd), cổng nội bộ 3000,
// KHÔNG đụng cổng của vps-worker chính (3001 trên production hiện tại).
// Nginx route /bkav-prod, /bkav-demo, /bkav-health trên domain sẵn có
// (proxy.bunbohue65.com, đã có SSL) vào cổng 3000 này.
//
// LÝ DO CẦN PROXY RIÊNG: theo tài liệu Bkav chính thức, mọi phản hồi SOAP
// đều được mã hoá AES-256-CBC(gzip(XML)) trước khi trả về — worker Node.js
// (vps-worker) không tự giải mã trực tiếp được nếu chạy trong hàm xử lý
// HTTP outcall bình thường (cần thư viện crypto + zlib, không phải vấn đề
// với Node.js, nhưng TÁCH RIÊNG proxy này để: (1) dễ kiểm tra độc lập qua
// /bkav-health, (2) log riêng biệt cho debug, (3) không phụ thuộc logic
// nghiệp vụ của vps-worker chính — proxy chỉ làm đúng 1 việc: chuyển tiếp +
// giải mã, không biết gì về đơn hàng/hoá đơn.
//
// Nguồn gốc: chuyển thể từ bản tham khảo đã từng chạy được (repo
// toando7990/bunbohue65, file setup-bkav-proxy.sh) — đã dọn lại, đổi tên
// biến cho rõ nghĩa, KHÔNG đổi logic mã hoá/giải mã (đây là phần đã xác
// nhận đúng cấu trúc theo tài liệu Bkav chính thức: AES-256-CBC + gzip).

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.BKAV_PROXY_PORT) || 3000;
const HOST = '127.0.0.1'; // Chỉ lắng nghe nội bộ — Nginx là cửa ngõ duy nhất ra ngoài.

// 2 endpoint SOAP thật của Bkav — proxy chuyển tiếp NGUYÊN VĂN, không sửa gì.
const BKAV_ENDPOINTS = {
  '/bkav-prod': process.env.BKAV_PROD_ENDPOINT || 'https://ws.ehoadon.vn/WSPublicEhoadon.asmx',
  '/bkav-demo': process.env.BKAV_DEMO_ENDPOINT || 'https://wsdemo.ehoadon.vn/WSPublicEhoadon.asmx',
};

// ── Giải mã phản hồi Bkav ────────────────────────────────────────────────────
// Theo tài liệu chính thức: Dữ liệu → Nén (gzip) → Mã hoá AES-256-CBC → Base64.
// Giải mã làm ngược lại: Base64 decode → AES-256-CBC decrypt → gunzip.
// key/iv lấy từ PartnerToken (cấu trúc "Base64(Key):Base64(IV)"), do
// vps-worker tính sẵn và gửi qua header X-BKAV-KEY mỗi request — proxy
// KHÔNG tự lưu PartnerToken, chỉ dùng đúng những gì được gửi kèm.
function decryptBkavResponse(base64Body, keyBase64, ivBase64) {
  const encrypted = Buffer.from(base64Body.trim(), 'base64');
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return zlib.gunzipSync(decrypted).toString('utf8');
}

function extractTag(xml, localName) {
  const re = new RegExp('<(?:[^:>]+:)?' + localName + '[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?' + localName + '>', 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function isSoapFault(xml) {
  return /<(?:[^:>]+:)?Fault[\s>]/i.test(xml) || /<faultcode[\s>]/i.test(xml) || xml.includes('faultcode>');
}

function hasExecCommandResult(xml) {
  return /ExecCommandResult/i.test(xml);
}

// SOAP Fault — chuẩn hoá về dạng cố định, dễ parse phía worker, không lộ
// stack trace/nội dung động (đảm bảo phản hồi luôn nhất quán).
function normalizeSoapFault(xml) {
  const faultcode = extractTag(xml, 'faultcode') || 'UNKNOWN';
  const safe = faultcode.replace(/[<>&"']/g, '');
  const canonical = `<R><E>FAULT:${safe}</E></R>`;
  console.log('[bkav-proxy] SOAP Fault:', canonical);
  return canonical;
}

// Phản hồi thành công đã mã hoá — trích Base64 trong <ExecCommandResult>,
// giải mã, trả về XML thô cho worker tự parse tiếp.
function processEncryptedResponse(xml, keyBase64, ivBase64) {
  const re = /<(?:[^:>]+:)?ExecCommandResult[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?ExecCommandResult>/i;
  const m = xml.match(re);
  if (!m) return null;
  const payload = m[1].trim();
  if (!payload) return null;
  return decryptBkavResponse(payload, keyBase64, ivBase64);
}

function forwardToBkav(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + (url.search || ''),
      method,
      headers,
      rejectUnauthorized: false, // Bkav có thể dùng cert trung gian không chuẩn.
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/bkav-health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('bkav-proxy OK');
    return;
  }

  const routeKey = req.url.split('?')[0];
  const targetUrl = BKAV_ENDPOINTS[routeKey];
  if (!targetUrl) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const bodyChunks = [];
  req.on('data', (c) => bodyChunks.push(c));
  req.on('error', (err) => {
    console.error('[bkav-proxy] Request read error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Request read error');
  });

  req.on('end', async () => {
    const requestBody = Buffer.concat(bodyChunks);

    // X-BKAV-KEY: "<keyBase64>:<ivBase64>" — worker tính sẵn từ PartnerToken,
    // KHÔNG chuyển tiếp header này lên Bkav (chỉ dùng nội bộ để giải mã).
    const bkavKeyHeader = (req.headers['x-bkav-key'] || '').trim();
    const colonIdx = bkavKeyHeader.indexOf(':');
    const keyBase64 = colonIdx > 0 ? bkavKeyHeader.slice(0, colonIdx) : '';
    const ivBase64 = colonIdx > 0 ? bkavKeyHeader.slice(colonIdx + 1) : '';

    const forwardHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (lower === 'x-bkav-key' || lower === 'host' || lower === 'connection') continue;
      forwardHeaders[name] = value;
    }
    forwardHeaders['content-length'] = requestBody.length.toString();

    try {
      const bkavResp = await forwardToBkav(targetUrl, req.method, forwardHeaders, requestBody);
      const rawBody = bkavResp.body.toString('utf8').replace(/^\uFEFF/, '').trim();

      let outputXml;
      if (isSoapFault(rawBody)) {
        outputXml = normalizeSoapFault(rawBody);
      } else if (hasExecCommandResult(rawBody) && keyBase64 && ivBase64) {
        try {
          outputXml = processEncryptedResponse(rawBody, keyBase64, ivBase64);
          if (outputXml) {
            console.log('[bkav-proxy] Decrypted OK, length:', outputXml.length);
          } else {
            console.warn('[bkav-proxy] ExecCommandResult rỗng — trả nguyên văn');
            outputXml = rawBody;
          }
        } catch (decErr) {
          console.warn('[bkav-proxy] Giải mã thất bại:', decErr.message, '— trả nguyên văn');
          outputXml = rawBody;
        }
      } else {
        // Không có ExecCommandResult (lỗi khác), hoặc thiếu X-BKAV-KEY —
        // trả nguyên văn để worker tự log/debug thay vì proxy nuốt mất.
        if (hasExecCommandResult(rawBody) && (!keyBase64 || !ivBase64)) {
          console.warn('[bkav-proxy] Có ExecCommandResult nhưng THIẾU X-BKAV-KEY — không giải mã được, trả nguyên văn (mã hoá)');
        }
        outputXml = rawBody;
      }

      const outBuf = Buffer.from(outputXml, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': outBuf.length.toString() });
      res.end(outBuf);
    } catch (err) {
      console.error('[bkav-proxy] Lỗi gọi Bkav:', err.message);
      const errXml = Buffer.from('<R><E>PROXY_ERROR</E></R>', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': errXml.length.toString() });
      res.end(errXml);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[bkav-proxy] Listening on ${HOST}:${PORT}`);
  console.log('[bkav-proxy] Routes: /bkav-prod /bkav-demo /bkav-health');
});

process.on('uncaughtException', (err) => {
  console.error('[bkav-proxy] Uncaught exception:', err.message);
});
