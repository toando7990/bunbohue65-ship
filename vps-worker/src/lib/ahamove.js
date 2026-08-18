// ============================================================
// lib/ahamove.js — Ahamove v3 Partner API client (JSON/REST)
// ============================================================
// Domain: https://partner-api.ahamove.com (override via AHAMOVE_BASE_URL)
// Auth:   Bearer token flow (POST /v3/accounts/token with mobile + api_key).
//         Token is a JWT; exp is read from the payload and auto-refreshed
//         (60s skew buffer). On HTTP 401 from any order endpoint, the token
//         is refreshed and the request retried once.
// Endpoints:
//   - POST   /v3/orders/estimates          (estimateOrderFee)
//   - POST   /v3/orders                    (createOrder)
//   - DELETE /v3/orders/<order_id>         (cancelOrder)
//   - GET    /v3/orders/<order_id>         (getOrderDetail)
//   - GET    /v3/orders/<order_id>/tracking-link (getOrderTrackingLink)
// ============================================================

const axios = require('axios');

// ------------------------------------------------------------
// Config: credentials from env, NEVER hardcoded.
// ------------------------------------------------------------
const BASE_URL = process.env.AHAMOVE_BASE_URL || 'https://partner-api.ahamove.com';
const API_KEY = process.env.AHAMOVE_API_KEY;
const MOBILE = process.env.AHAMOVE_PHONE;

if (!API_KEY) console.warn('[ahamove] AHAMOVE_API_KEY missing — token fetch will fail');
if (!MOBILE) console.warn('[ahamove] AHAMOVE_PHONE missing — token fetch will fail');

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// Refresh 60s before exp to absorb clock skew.
const TOKEN_SKEW_SECONDS = 60;

// ------------------------------------------------------------
// Module-level token cache.
// ------------------------------------------------------------
let cachedToken = null;     // { token, exp }  exp = seconds since epoch

// ------------------------------------------------------------
// Decode the JWT payload (base64url middle segment) → object.
// Returns null if the token is malformed.
// ------------------------------------------------------------
function decodeJwtExp(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  let payload;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    payload = JSON.parse(json);
  } catch (_e) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  return payload.exp;
}

// ------------------------------------------------------------
// getToken(): POST /v3/accounts/token with { mobile, api_key }.
// Caches the token + decoded exp. Returns the token string.
// ------------------------------------------------------------
async function getToken() {
  if (!MOBILE || !API_KEY) {
    throw new Error('Ahamove getToken failed: AHAMOVE_PHONE or AHAMOVE_API_KEY not set');
  }
  const body = { mobile: MOBILE, api_key: API_KEY };
  let res;
  try {
    res = await client.post('/v3/accounts/token', body, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const status = err.response ? err.response.status : 'n/a';
    const data = err.response ? err.response.data : undefined;
    throw new Error(
      `Ahamove POST /v3/accounts/token failed: ${status} ${JSON.stringify(data)}`
    );
  }
  const data = res.data || {};
  const token = data.token;
  if (!token) {
    throw new Error(
      `Ahamove POST /v3/accounts/token failed: missing token in response ${JSON.stringify(data)}`
    );
  }
  const exp = decodeJwtExp(token);
  // If exp cannot be decoded, treat as immediately expiring (will refresh on next call).
  cachedToken = { token, exp: exp || 0 };
  return token;
}

// ------------------------------------------------------------
// ensureToken(): returns a valid (non-expired) token, fetching
// a new one if the cache is empty or within the skew buffer.
// ------------------------------------------------------------
async function ensureToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.token && (cachedToken.exp - now) > TOKEN_SKEW_SECONDS) {
    return cachedToken.token;
  }
  return getToken();
}

// ------------------------------------------------------------
// Invalidate the cached token (called on HTTP 401).
// ------------------------------------------------------------
function invalidateToken() {
  cachedToken = null;
}

// ------------------------------------------------------------
// Build the standard auth headers for an order endpoint.
// ------------------------------------------------------------
async function authHeaders() {
  const token = await ensureToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ------------------------------------------------------------
// Build a consistent error for non-2xx responses.
// ------------------------------------------------------------
function buildError(method, path, status, data) {
  return new Error(
    `Ahamove ${method} ${path} failed: ${status} ${JSON.stringify(data)}`
  );
}

// ------------------------------------------------------------
// withAuthRetry: run an order-endpoint request; on HTTP 401,
// refresh the token once and retry the same request.
// `fn` receives a fresh Authorization header object and must
// return the axios response (or throw).
// ------------------------------------------------------------
async function withAuthRetry(method, path, fn) {
  let headers = await authHeaders();
  try {
    return await fn(headers);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    if (status !== 401) throw err;
    // 401 → refresh token and retry once.
    invalidateToken();
    headers = await authHeaders();
    try {
      return await fn(headers);
    } catch (err2) {
      const s2 = err2.response ? err2.response.status : 'n/a';
      const d2 = err2.response ? err2.response.data : undefined;
      throw buildError(method, path, s2, d2);
    }
  }
}

// ============================================================
// ENDPOINT 1 — estimateOrderFee(body): POST /v3/orders/estimates
// ============================================================
// Body fields (per spec):
//   order_time (number, 0 = immediate)
//   path (array, REQUIRED) — each: lat, lng, address, short_address, name,
//        mobile, remarks; drop points also: cod, item_value, tracking_number
//   services (array, REQUIRED) — each: _id + requests[{_id, num, tier_code}]
//   payment_method ('CASH'|'CREDIT')
//   remarks?, promo_code?, items[{_id, num, name, price}],
//   package_detail[{weight, length, width, height, description}]
// Response: array of { service_id, data: { distance, duration, distance_fee,
//   request_fee, stop_fee, vat_fee, discount, total_fee, requests, total_price } }
// Returns the full response array.
// ============================================================
async function estimateOrderFee(body) {
  const path = '/v3/orders/estimates';
  const res = await withAuthRetry('POST', path, async (headers) => {
    return client.post(path, body, { headers });
  });
  return Array.isArray(res.data) ? res.data : [];
}

// ============================================================
// ENDPOINT 2 — createOrder(body): POST /v3/orders
// ============================================================
// Body is like estimate BUT:
//   - use 'service_id' (single string) instead of 'services' (array)
//   - put 'requests' (array of {_id, num, tier_code}) at top-level
// Keep: path, items, package_detail, payment_method, remarks,
//       promo_code, order_time.
// Response: { order_id, status, shared_link, order: {...} }
// Returns the full response object.
// ============================================================
async function createOrder(body) {
  const path = '/v3/orders';
  const res = await withAuthRetry('POST', path, async (headers) => {
    return client.post(path, body, { headers });
  });
  return res.data || {};
}

// ============================================================
// ENDPOINT 3 — cancelOrder(orderId, comment): DELETE /v3/orders/<order_id>
// ============================================================
// Body: { comment }. Response: {} on success.
// ============================================================
async function cancelOrder(orderId, comment) {
  const path = `/v3/orders/${encodeURIComponent(orderId)}`;
  const res = await withAuthRetry('DELETE', path, async (headers) => {
    return client.delete(path, {
      headers,
      data: { comment },
    });
  });
  return res.data || {};
}

// ============================================================
// ENDPOINT 4 — getOrderDetail(orderId): GET /v3/orders/<order_id>
// ============================================================
// No body. Response: order detail object { _id, status, total_fee,
// distance, path, service_id, ... }.
// Returns the full object.
// ============================================================
async function getOrderDetail(orderId) {
  const path = `/v3/orders/${encodeURIComponent(orderId)}`;
  const res = await withAuthRetry('GET', path, async (headers) => {
    return client.get(path, { headers });
  });
  return res.data || {};
}

// ============================================================
// ENDPOINT 5 — getOrderTrackingLink(orderId):
//   GET /v3/orders/<order_id>/tracking-link
// ============================================================
// Response: { shared_link }.
// Fallback on non-2xx (e.g. 404): call getOrderDetail(orderId) and
// return { shared_link: orderDetail.shared_link }.
// ============================================================
async function getOrderTrackingLink(orderId) {
  const path = `/v3/orders/${encodeURIComponent(orderId)}/tracking-link`;
  try {
    const res = await withAuthRetry('GET', path, async (headers) => {
      return client.get(path, { headers });
    });
    const data = res.data || {};
    return { shared_link: data.shared_link || '' };
  } catch (err) {
    // Fallback: pull shared_link from order detail.
    const detail = await getOrderDetail(orderId);
    return { shared_link: detail.shared_link || '' };
  }
}

// ============================================================
// mapAhamoveStatus(status): map Ahamove status → canister BookingStatus.
// ============================================================
// Canister BookingStatus chỉ có 5 variants: pending, confirmed, shipping,
// completed, cancelled. Mapping:
//   IDLE → pending, ASSIGNING → pending, ACCEPTED → confirmed,
//   IN PROCESS → shipping, COMPLETED → completed,
//   CANCELLED → cancelled. Unknown statuses → null (caller skip canister
//   updateStatus thay vì truyền uppercase/variant không hợp lệ → canister
//   decode fail hoặc HMAC mismatch).
// ============================================================
function mapAhamoveStatus(status) {
  const s = String(status || '').toUpperCase();
  switch (s) {
    case 'IDLE':
      return 'pending';
    case 'ASSIGNING':
      return 'pending';
    case 'ACCEPTED':
      return 'confirmed';
    case 'IN PROCESS':
      return 'shipping';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return null;
  }
}

// Backward-compat alias (webhooks.js calls mapBookingStatus).
function mapBookingStatus(status) {
  return mapAhamoveStatus(status);
}

// Backward-compat alias (webhooks.js polls via getOrderStatus).
async function getOrderStatus(orderId) {
  return getOrderDetail(orderId);
}

module.exports = {
  BASE_URL,
  getToken,
  ensureToken,
  estimateOrderFee,
  createOrder,
  cancelOrder,
  getOrderDetail,
  getOrderTrackingLink,
  mapAhamoveStatus,
  mapBookingStatus,
  getOrderStatus,
};
