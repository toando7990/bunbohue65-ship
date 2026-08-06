// ============================================================
// lib/tingee.js — Tingee API client (JSON/REST, HMAC SHA512)
// ============================================================
// Auth: HMAC SHA512 signature trên (timestamp + ':' + body).
// Endpoints:
//   - POST /v1/generate-dynamic-qr
//   - POST /v1/delete-dynamic-qr
//   - POST /v1/get-status-dynamic-qr
// ============================================================

const axios = require('axios');
const crypto = require('crypto');

// Base URL: default production Tingee open-api, override via env nếu cần.
const BASE_URL = process.env.TINGEE_BASE_URL || 'https://open-api.tingee.vn';

// Credentials từ env, KHÔNG hardcode.
const CLIENT_ID = process.env.TINGEE_CLIENT_ID;
const CLIENT_SECRET = process.env.TINGEE_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[tingee] TINGEE_CLIENT_ID/SECRET missing — QR generation will fail');
}

// VA account + bank bin từ env (default rỗng).
const VA_ACCOUNT_NUMBER = process.env.TINGEE_VA_ACCOUNT_NUMBER || '';
const BANK_BIN = process.env.TINGEE_BANK_BIN || '';

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// ------------------------------------------------------------
// Timestamp Tingee: format yyyyMMddHHmmssSSS ở UTC+7 (Asia/Ho_Chi_Minh).
// VD: 20250723142000000
// ------------------------------------------------------------
function getTingeeTimestamp() {
  // Lấy millisecond epoch, cộng offset +7 giờ.
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const vn = new Date(utcMs + 7 * 60 * 60 * 1000);

  const yyyy = String(vn.getUTCFullYear()).padStart(4, '0');
  const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const HH = String(vn.getUTCHours()).padStart(2, '0');
  const mm = String(vn.getUTCMinutes()).padStart(2, '0');
  const ss = String(vn.getUTCSeconds()).padStart(2, '0');
  const SSS = String(vn.getUTCMilliseconds()).padStart(3, '0');

  return `${yyyy}${MM}${dd}${HH}${mm}${ss}${SSS}`;
}

// ------------------------------------------------------------
// Signature Tingee: HMAC_SHA512(timestamp + ':' + body, secret) → hex lowercase.
// Body là JSON string RAW (đúng chuỗi gửi đi, không reformat).
// ------------------------------------------------------------
function signTingeeRequest(timestamp, body) {
  return crypto
    .createHmac('sha512', CLIENT_SECRET)
    .update(`${timestamp}:${body}`)
    .digest('hex');
}

// ------------------------------------------------------------
// Build headers cho request: dùng CÙNG một timestamp cho cả header và signature.
// ------------------------------------------------------------
function buildHeaders(body) {
  const timestamp = getTingeeTimestamp();
  return {
    accept: 'application/json',
    'Content-Type': 'application/json',
    'x-client-id': CLIENT_ID,
    'x-signature': signTingeeRequest(timestamp, body),
    'x-request-timestamp': timestamp,
  };
}

// ------------------------------------------------------------
// Helper: POST với body raw string, log request/response.
// ------------------------------------------------------------
async function postSigned(endpoint, payload, action) {
  const body = JSON.stringify(payload);
  const headers = buildHeaders(body);

  console.log(`[tingee] ${action} → ${endpoint}`);
  let res;
  try {
    res = await client.post(endpoint, body, { headers });
  } catch (err) {
    console.error(`[tingee] ${action} ERROR:`, err.message);
    throw err;
  }

  const data = res.data || {};
  console.log(
    `[tingee] ${action} ← code=${data.code} message=${data.message}`
  );
  return data;
}

// ------------------------------------------------------------
// POST /v1/generate-dynamic-qr — tạo dynamic QR cho đơn.
// Params: { vaAccountNumber, qrCodeType, bankBin, amount, purpose?,
//           expireInMinute, extraInfo?, merchantId? }
// Trả { qrCode, qrAccount, billId, raw }.
// Throw Error có ý nghĩa khi response.code !== '00'.
// ------------------------------------------------------------
async function generateDynamicQr(params = {}) {
  const payload = {
    vaAccountNumber: params.vaAccountNumber ?? VA_ACCOUNT_NUMBER,
    qrCodeType: params.qrCodeType ?? 'dynamic-one-time-payment',
    bankBin: params.bankBin ?? BANK_BIN,
    amount: params.amount,
    expireInMinute: params.expireInMinute ?? 15,
  };
  if (params.purpose !== undefined) payload.purpose = params.purpose;
  if (params.extraInfo !== undefined) payload.extraInfo = params.extraInfo;
  if (params.merchantId !== undefined) payload.merchantId = params.merchantId;

  const data = await postSigned('/v1/generate-dynamic-qr', payload, 'generateDynamicQr');

  if (data.code !== '00') {
    throw new Error(
      `generateDynamicQr failed: code=${data.code} message=${data.message}`
    );
  }

  const inner = data.data || {};
  return {
    qrCode: inner.qrCode || inner.qr_code || '',
    qrAccount: inner.qrAccount || inner.qr_account || '',
    billId: inner.billId || inner.bill_id || '',
    raw: data,
  };
}

// ------------------------------------------------------------
// POST /v1/delete-dynamic-qr — xoá QR (KHÔNG phải DELETE).
// Params: { qrAccount, billId, merchantId? }
// Trả { code, message, data, raw }.
// Throw Error khi code !== '00'.
// ------------------------------------------------------------
async function deleteDynamicQr({ qrAccount, billId, merchantId } = {}) {
  const payload = { qrAccount, billId };
  if (merchantId !== undefined) payload.merchantId = merchantId;

  const data = await postSigned('/v1/delete-dynamic-qr', payload, 'deleteDynamicQr');

  if (data.code !== '00') {
    throw new Error(
      `deleteDynamicQr failed: code=${data.code} message=${data.message}`
    );
  }

  return {
    code: data.code,
    message: data.message,
    data: data.data,
    raw: data,
  };
}

// ------------------------------------------------------------
// POST /v1/get-status-dynamic-qr — poll trạng thái thanh toán.
// Params: { qrAccount, billId, merchantId? }
// Trả { code, message, data: { billInfo, transactionInfos }, raw }.
// Throw Error khi code !== '00'.
// ------------------------------------------------------------
async function getDynamicQrStatus({ qrAccount, billId, merchantId } = {}) {
  const payload = { qrAccount, billId };
  if (merchantId !== undefined) payload.merchantId = merchantId;

  const data = await postSigned('/v1/get-status-dynamic-qr', payload, 'getDynamicQrStatus');

  if (data.code !== '00') {
    throw new Error(
      `getDynamicQrStatus failed: code=${data.code} message=${data.message}`
    );
  }

  const inner = data.data || {};
  return {
    code: data.code,
    message: data.message,
    data: {
      billInfo: inner.billInfo || null,
      transactionInfos: inner.transactionInfos || [],
    },
    raw: data,
  };
}

module.exports = {
  BASE_URL,
  signTingeeRequest,
  getTingeeTimestamp,
  generateDynamicQr,
  deleteDynamicQr,
  getDynamicQrStatus,
};
