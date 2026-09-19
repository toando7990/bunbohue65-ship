// ============================================================
// lib/lalamove.js — Lalamove API v3 client (Get Quotation)
// ============================================================
// Tái cấu trúc đặt món từ xa (Phần 4/6) — thay Ahamove (chưa từng tích
// hợp thật, xem comment cũ ở routes/quote.js) bằng Lalamove, tự động
// tính phí ship + khoảng cách theo toạ độ nhà hàng/khách thật (Get
// Quotation API), không còn ước lượng 0 cứng như trước.
//
// XÁC THỰC: HMAC-SHA256 — đã tra cứu lại tài liệu chính thức của
// Lalamove (developers.lalamove.com) trước khi viết, không chỉ dựa vào
// hiểu biết cũ có thể lỗi thời:
//   SIGNATURE = HmacSHA256Hex(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`, SECRET)
//   Header Authorization: `hmac {API_KEY}:{timestamp}:{signature}`
//   Header Market: mã thị trường 2 ký tự (VN cho Việt Nam)
// timestamp là mili-giây kể từ epoch (Date.now()), body là JSON string
// CHÍNH XÁC byte-for-byte đã gửi (không phải object) — ký sai body sẽ
// bị Lalamove từ chối (401), không có gợi ý lỗi cụ thể hơn.
//
// ⚠️ QUAN TRỌNG — CHƯA KIỂM CHỨNG VỚI TÀI KHOẢN LALAMOVE THẬT: viết dựa
// trên tài liệu chính thức + nhiều SDK cộng đồng đối chiếu (Go, PHP,
// Python), nhưng KHÔNG có API key/secret thật để tự gọi thử. serviceType
// 'MOTORCYCLE' là giá trị phổ biến nhất cho giao đồ ăn, nhưng tài liệu
// Lalamove ghi rõ giá trị CHÍNH XÁC có thể khác nhau theo từng thành
// phố/thị trường (xem "Get City Info" endpoint) — cần chạy thử với
// LALAMOVE_ENV=sandbox thật và xem log lỗi (nếu có) trước khi bật
// production. Set LALAMOVE_SERVICE_TYPE nếu 'MOTORCYCLE' không đúng cho
// thị trường của bạn.
// ============================================================

const axios = require('axios');
const crypto = require('crypto');

const IS_PRODUCTION = process.env.LALAMOVE_ENV === 'production';
const BASE_URL = IS_PRODUCTION
  ? 'https://rest.lalamove.com'
  : 'https://rest.sandbox.lalamove.com';

const API_KEY = process.env.LALAMOVE_API_KEY;
const API_SECRET = process.env.LALAMOVE_API_SECRET;
const MARKET = process.env.LALAMOVE_MARKET || 'VN';
const SERVICE_TYPE = process.env.LALAMOVE_SERVICE_TYPE || 'MOTORCYCLE';
const LANGUAGE = process.env.LALAMOVE_LANGUAGE || 'vi_VN';

if (!API_KEY || !API_SECRET) {
  console.warn('[lalamove] LALAMOVE_API_KEY/LALAMOVE_API_SECRET missing — quotation sẽ luôn lỗi');
}

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

class LalamoveError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'LalamoveError';
    this.status = status;
    this.body = body;
  }
}

function sign(method, path, body) {
  const timestamp = Date.now().toString();
  // GET không có body → phần cuối vẫn cần \r\n\r\n rồi để trống (theo đúng
  // tài liệu) — quotation dùng POST nên luôn có body ở đây.
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(rawSignature)
    .digest('hex');
  return { timestamp, signature };
}

function buildHeaders(method, path, body) {
  const { timestamp, signature } = sign(method, path, body);
  return {
    'Content-Type': 'application/json',
    Authorization: `hmac ${API_KEY}:${timestamp}:${signature}`,
    Market: MARKET,
  };
}

// getQuotation — POST /v3/quotations. Trả { quotationId, feeVnd,
// distanceMeters } — feeVnd/distanceMeters là Number đã parse từ chuỗi
// Lalamove trả về (priceBreakdown.total, distance.value là string trong
// response thật theo tài liệu).
async function getQuotation({
  pickupLat,
  pickupLng,
  pickupAddress,
  dropLat,
  dropLng,
  dropAddress,
}) {
  const path = '/v3/quotations';
  const body = JSON.stringify({
    data: {
      serviceType: SERVICE_TYPE,
      language: LANGUAGE,
      stops: [
        {
          coordinates: { lat: String(pickupLat), lng: String(pickupLng) },
          address: pickupAddress,
        },
        {
          coordinates: { lat: String(dropLat), lng: String(dropLng) },
          address: dropAddress,
        },
      ],
      item: {
        quantity: '1',
        weight: 'LESS_THAN_3_KG',
        categories: ['FOOD_DELIVERY'],
        handlingInstructions: [],
      },
    },
  });
  const headers = buildHeaders('POST', path, body);

  let res;
  try {
    res = await client.post(path, body, { headers });
  } catch (err) {
    if (err.response) {
      console.error(
        '[lalamove] getQuotation lỗi:',
        err.response.status,
        JSON.stringify(err.response.data),
      );
      throw new LalamoveError(
        `Lalamove quotation failed: ${err.response.status}`,
        err.response.status,
        err.response.data,
      );
    }
    console.error('[lalamove] getQuotation lỗi mạng:', err.message);
    throw new LalamoveError(`Lalamove network error: ${err.message}`, null, null);
  }

  const data = (res.data || {}).data;
  if (!data || !data.priceBreakdown) {
    throw new LalamoveError('Lalamove trả về dữ liệu không hợp lệ', res.status, res.data);
  }

  return {
    quotationId: data.quotationId,
    feeVnd: Math.round(Number(data.priceBreakdown.total)),
    distanceMeters: data.distance ? Number(data.distance.value) : null,
  };
}

module.exports = { getQuotation, LalamoveError };
