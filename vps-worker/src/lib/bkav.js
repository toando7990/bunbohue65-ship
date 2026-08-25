// ============================================================
// lib/bkav.js — Bkav eHoadon client (qua bkav-proxy giải mã riêng)
// ============================================================
// LỊCH SỬ QUAN TRỌNG: bản trước đây của file này tự gửi SOAP XML thẳng tới
// Bkav với field <PartnerGuid>/<PartnerToken>/<Command>/<XmlData> — SAI hoàn
// toàn so với tài liệu chính thức Bkav (FAQ_WebServices_Bkav.docx, người
// dùng cung cấp). Đối chiếu tài liệu + 1 bản tham khảo từng chạy được (repo
// toando7990/bunbohue65, bkav-worker/bkav-worker.js + setup-bkav-proxy.sh),
// phát hiện quy trình THẬT bắt buộc:
//
//   Gửi:  JSON → Base64 → gửi kèm partnerGUID + partnerToken
//   Nhận: Bkav trả SOAP XML chứa <ExecCommandResult> =
//         Base64(AES-256-CBC(gzip(XML))) — PHẢI giải mã bằng khoá lấy từ
//         PartnerToken (cấu trúc "Base64(Key):Base64(IV)") mới đọc được.
//
// Việc giải mã AES-256-CBC + gunzip được tách sang 1 service riêng
// (vps-worker/bkav-proxy/server.js, chạy trên VPS qua domain
// proxy.bunbohue65.com có sẵn) — file này chỉ gọi HTTP JSON vào proxy đó,
// không tự làm crypto.
//
// PHÁT HIỆN THÊM: bản tham khảo có 1 lỗ hổng — không gửi header X-BKAV-KEY
// khi gọi proxy, khiến proxy không giải mã được (rất có thể là lý do bản đó
// chỉ thành công 1 phần, thất bại phần lớn). Đã sửa trong file này —
// LUÔN tính và gửi X-BKAV-KEY từ PARTNER_TOKEN mỗi request.
// ============================================================

const axios = require('axios');

const PARTNER_GUID = process.env.BKAV_PARTNER_GUID || '';
const PARTNER_TOKEN = process.env.BKAV_PARTNER_TOKEN || '';
// Domain proxy giải mã — MẶC ĐỊNH gọi thẳng nội bộ qua localhost, KHÔNG qua
// Nginx/domain công khai. vps-worker và bkav-proxy chạy CÙNG 1 máy VPS —
// không có lý do đi vòng qua Internet rồi quay lại, và tránh mọi xung đột
// với các route Nginx khác đã có sẵn trên domain proxy.bunbohue65.com (đang
// phục vụ nhiều dịch vụ khác: AhaMove cổng 3002, Sepay, webhook Tingee...).
// Đổi qua biến môi trường nếu sau này bkav-proxy chạy trên máy khác.
const PROXY_BASE_URL = process.env.BKAV_PROXY_URL || 'http://127.0.0.1:3000';
// true → gọi Bkav DEMO (wsdemo.ehoadon.vn qua proxy /bkav-demo), mặc định
// false (production, ws.ehoadon.vn qua proxy /bkav-prod). Đổi qua biến môi
// trường khi cần test, KHÔNG sửa code.
const USE_DEMO = String(process.env.BKAV_USE_DEMO || '').toLowerCase() === 'true';
// Base URL host phục vụ file PDF eHoadon (KHÔNG phải endpoint SOAP).
// MessLog từ response 816 là path tương đối (vd: /Invoice_View_Demo/C2/3T/...pdf).
const PDF_BASE_URL = process.env.BKAV_PDF_BASE_URL || 'https://stg-ehoadon.vn';

if (!PARTNER_GUID || !PARTNER_TOKEN) {
  console.warn('[bkav] BKAV_PARTNER_GUID/TOKEN missing — invoicing will fail');
} else if (!PARTNER_TOKEN.includes(':')) {
  // PartnerToken PHẢI có cấu trúc "Base64(Key):Base64(IV)" theo tài liệu
  // Bkav — cảnh báo sớm nếu định dạng rõ ràng sai, tránh lỗi mã hoá khó hiểu
  // ở tận bước gọi API.
  console.warn('[bkav] BKAV_PARTNER_TOKEN không đúng định dạng "Key:IV" (thiếu dấu :) — kiểm tra lại giá trị từ Bkav.');
}

// Tách PartnerToken thành cặp Key:IV (Base64) — dùng để tính header
// X-BKAV-KEY gửi cho bkav-proxy giải mã phản hồi. Theo tài liệu:
// "Partner Token có cấu trúc: (Key đã được EncodeBase64):(IV đã được EncodeBase64)".
function splitPartnerToken() {
  const idx = PARTNER_TOKEN.indexOf(':');
  if (idx <= 0) return { keyBase64: '', ivBase64: '' };
  return {
    keyBase64: PARTNER_TOKEN.slice(0, idx),
    ivBase64: PARTNER_TOKEN.slice(idx + 1),
  };
}

// ------------------------------------------------------------
// callBkavViaProxy — Gửi CmdType bất kỳ qua bkav-proxy, trả kết quả đã parse.
// ------------------------------------------------------------
// jsonPayload: object CmdType (100 cho tạo hoá đơn, 816 cho lấy PDF...).
// config.useDemo (tuỳ chọn): override USE_DEMO cho riêng lần gọi này.
// ------------------------------------------------------------
async function callBkavViaProxy(jsonPayload, config) {
  config = config || {};
  const useDemo = config.useDemo ?? USE_DEMO;
  const proxyPath = useDemo ? '/bkav-demo' : '/bkav-prod';
  const proxyUrl = `${PROXY_BASE_URL.replace(/\/$/, '')}${proxyPath}`;

  const commandData = Buffer.from(JSON.stringify(jsonPayload), 'utf8').toString('base64');
  const httpBody = {
    partnerGUID: PARTNER_GUID,
    partnerToken: PARTNER_TOKEN,
    CommandData: commandData,
  };

  const { keyBase64, ivBase64 } = splitPartnerToken();

  const res = await axios.post(proxyUrl, httpBody, {
    headers: {
      'Content-Type': 'application/json',
      // Khoá giải mã cho bkav-proxy — proxy KHÔNG lưu lại, chỉ dùng đúng
      // request này rồi bỏ. Đây chính là header bản tham khảo THIẾU.
      'X-BKAV-KEY': `${keyBase64}:${ivBase64}`,
    },
    timeout: 35000, // proxy tự có timeout 30s gọi Bkav, dư thêm biên độ.
    // Response từ proxy luôn là text/xml (kể cả khi giải mã thất bại, proxy
    // trả nguyên văn để debug) — không để axios tự parse JSON.
    responseType: 'text',
    transformResponse: [(data) => data],
  });

  return parseProxyResponse(res.data);
}

// ------------------------------------------------------------
// parseProxyResponse — Parse phản hồi ĐÃ QUA bkav-proxy (đã giải mã, hoặc
// nguyên văn nếu proxy không giải mã được).
// ------------------------------------------------------------
// 3 dạng có thể gặp:
//   1. '<R><E>FAULT:...</E></R>' — SOAP Fault đã chuẩn hoá bởi proxy.
//   2. '<R><E>PROXY_ERROR</E></R>' — proxy không gọi được Bkav.
//   3. XML đã giải mã, chứa <ExecCommandResult>Base64(JSON)</ExecCommandResult>
//      HOẶC (dự phòng, nếu cấu trúc thực tế khác) chính nó đã là JSON string
//      trực tiếp — thử cả 2 cách, ưu tiên cách 1 (khớp bản tham khảo).
// LUÔN trả field `raw` chứa toàn bộ nội dung gốc — không bao giờ mất dấu
// vết, dù parse thành công hay thất bại (bài học từ lỗi invoiceId trước đây).
// ------------------------------------------------------------
function parseProxyResponse(bodyText) {
  const text = String(bodyText || '').trim();

  const faultMatch = text.match(/^<R><E>FAULT:([\s\S]*?)<\/E><\/R>$/);
  if (faultMatch) {
    return { success: false, error: `SOAP fault: ${faultMatch[1]}`, errorCode: 'SOAP_FAULT', raw: text };
  }
  if (text === '<R><E>PROXY_ERROR</E></R>') {
    return { success: false, error: 'bkav-proxy không gọi được Bkav (lỗi mạng/timeout)', errorCode: 'PROXY_ERROR', raw: text };
  }
  if (!text) {
    return { success: false, error: 'BKAV trả về phản hồi rỗng', errorCode: 'EMPTY_RESPONSE', raw: text };
  }

  // Cách 1: tìm <ExecCommandResult>Base64(JSON)</ExecCommandResult> —
  // khớp cấu trúc bản tham khảo mong đợi sau khi proxy giải mã 1 lớp.
  const execMatch = text.match(/<(?:[^:>]+:)?ExecCommandResult[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?ExecCommandResult>/i);
  let json = null;
  if (execMatch) {
    const inner = execMatch[1].trim();
    try {
      json = JSON.parse(Buffer.from(inner, 'base64').toString('utf8'));
    } catch {
      try {
        json = JSON.parse(inner); // Có thể đã là JSON thô, không Base64.
      } catch {
        json = null;
      }
    }
  }

  // Cách 2 (dự phòng): nội dung đã là JSON trực tiếp, không có wrapper
  // ExecCommandResult (trường hợp cấu trúc thực tế đơn giản hơn dự kiến).
  if (!json) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!json) {
    return { success: false, error: 'Không parse được phản hồi Bkav (không phải XML/JSON hợp lệ)', errorCode: 'PARSE_FAILED', raw: text };
  }

  // Bkav response shape: { Status, Object (JSON string hoặc mảng), Code, isOk, isError }
  const success = json.Status === 0 || json.isOk === true;
  let invoiceNo = '';
  let invoiceDate = '';
  let maCQT = '';
  let maTraCuu = '';

  if (success && json.Object) {
    try {
      const inner = typeof json.Object === 'string' ? JSON.parse(json.Object) : json.Object;
      const first = Array.isArray(inner) ? inner[0] : inner;
      invoiceNo = String(first?.InvoiceNo ?? first?.invoiceNo ?? '');
      invoiceDate = String(first?.InvoiceDate ?? first?.invoiceDate ?? '');
      maCQT = String(first?.MaCQT ?? first?.maCQT ?? '');
      maTraCuu = String(first?.MaTraCuu ?? first?.maTraCuu ?? first?.TransactionID ?? '');
    } catch {
      // Object parse fail — vẫn trả success nhưng fields trống, raw giữ nguyên để debug.
    }
  }

  return {
    success,
    invoiceNo,
    invoiceDate,
    maCQT,
    maTraCuu,
    error: success ? '' : String(json.MessLog || json.Message || json.ErrorMessage || 'bkav_failure'),
    errorCode: json.Code ?? json.Status ?? '',
    raw: json,
  };
}

// ------------------------------------------------------------
// buildJsonPayload — Build CmdType 100 JSON object theo Bkav sample.
// ------------------------------------------------------------
// Field mapping rules:
//   - isRetailInvoice=true  → buyerName='Bán cho người tiêu dùng',
//                             empty buyerTaxCode/buyerUnitName/buyerAddress
//   - isRetailInvoice=false → dùng buyerName/buyerTaxCode/buyerAddress
//                             từ invoice (hoặc từ vatInfo/company fields)
//   - taxRateID: 0%→1, 5%→2, 10%→3, 8%→4 (default 3 = 10%)
//   - invoiceSerial: prod dùng config.prodInvoiceSerial, demo '' (Bkav auto-assign)
//   - partnerInvoiceStringID = String(orderId)
//
// Backward compat: nếu caller truyền field cũ (cusName, cusTaxCode,
// cusAddress), map sang field mới tương ứng.
// ------------------------------------------------------------
function buildJsonPayload(invoice, config) {
  config = config || {};

  const buyerName = invoice.buyerName || invoice.cusName || '';
  const buyerTaxCode = invoice.buyerTaxCode || invoice.cusTaxCode || '';
  const buyerAddress = invoice.buyerAddress || invoice.cusAddress || '';

  const dateStr = new Date().toISOString().replace(/\.\d{3}Z$/, ''); // ISO datetime không ms/Z
  const isRetail = invoice.isRetailInvoice !== false; // default true

  const taxRateMap = { 0: 1, 5: 2, 10: 3, 8: 4 };
  const taxRateID = taxRateMap[invoice.taxRate] ?? 3; // default 10% → 3

  return {
    cmdType: 100,
    commandObject: [{
      invoice: {
        invoiceTypeID: 1,
        invoiceDate: dateStr,
        buyerName: isRetail ? 'Bán cho người tiêu dùng' : buyerName,
        buyerTaxCode: isRetail ? '' : buyerTaxCode,
        buyerUnitName: isRetail ? '' : (invoice.buyerUnitName || ''),
        buyerAddress: isRetail ? '' : buyerAddress,
        buyerBankAccount: '',
        payMethodID: 3,
        receiveTypeID: 1,
        receiverEmail: invoice.receiverEmail || '',
        receiverMobile: invoice.receiverMobile || '',
        receiverAddress: invoice.receiverAddress || '',
        receiverName: invoice.receiverName || '',
        note: '',
        billCode: '',
        currencyID: 'VND',
        exchangeRate: 1.0,
        invoiceStatusID: 1,
        invoiceForm: '',
        invoiceSerial: config.prodInvoiceSerial || '', // prod: config, demo: '' (Bkav auto-assign)
        invoiceNo: 0,
        signedDate: '0001-01-01T00:00:00',
        typeCreateInvoice: 0,
      },
      listInvoiceDetailsWS: (invoice.items || []).map((it) => {
        const amount = it.quantity * it.price;
        return {
          itemTypeID: 0,
          itemName: it.name,
          unitName: it.unitName || '',
          qty: it.quantity,
          price: it.price,
          amount,
          taxRateID,
          taxAmount: Math.round(amount * (invoice.taxRate / 100)),
          isDiscount: false,
        };
      }),
      partnerInvoiceID: 0,
      partnerInvoiceStringID: String(invoice.orderId),
    }],
  };
}

// ------------------------------------------------------------
// createInvoice — CmdType 100 qua bkav-proxy.
// ------------------------------------------------------------
// Backward compat: giữ signature cũ (cusName, cusTaxCode, cusAddress,
// amount, goodsAmount, taxTotal) — buildJsonPayload map tự động.
// Trả { invoiceNo, invoiceDate, maCQT, maTraCuu, error, errorCode, raw }.
// error/errorCode chỉ có giá trị khi Bkav báo thất bại (invoiceNo rỗng).
// ------------------------------------------------------------
async function createInvoice(invoice, config) {
  config = config || {};
  const payload = buildJsonPayload(invoice, config);
  const result = await callBkavViaProxy(payload, config);
  return {
    invoiceNo: result.invoiceNo,
    invoiceDate: result.invoiceDate,
    maCQT: result.maCQT,
    maTraCuu: result.maTraCuu,
    error: result.error,
    errorCode: result.errorCode,
    raw: result.raw,
  };
}

// ------------------------------------------------------------
// getInvoicePdf816 — Lấy PDF theo orderId qua CmdType 816, qua bkav-proxy.
// ------------------------------------------------------------
// Request JSON (CmdType 816):
//   { cmdType: 816,
//     commandObject: [{ partnerInvoiceID: 0,
//                        partnerInvoiceStringID: String(orderId) }] }
//
// Response (sau khi callBkavViaProxy parse): raw.Object là JSON string,
// parse tiếp sẽ ra mảng, phần tử [0].MessLog là path PDF trên server Bkav,
// ví dụ: /Invoice_View_Demo/C2/3T/C23TYY-00000007-X301O9JT62-CK.pdf
//
// Ghép MessLog với PDF_BASE_URL để có pdf_url đầy đủ.
// Trả { pdf_url } khi thành công, hoặc null khi không có MessLog.
// ------------------------------------------------------------
async function getInvoicePdf816(orderId, config) {
  const payload = {
    cmdType: 816,
    commandObject: [{
      partnerInvoiceID: 0,
      partnerInvoiceStringID: String(orderId),
    }],
  };

  const result = await callBkavViaProxy(payload, config);
  if (!result.success) return null;

  const rawObject = result.raw?.Object;
  if (!rawObject) return null;

  let innerArray;
  try {
    innerArray = typeof rawObject === 'string' ? JSON.parse(rawObject) : rawObject;
  } catch (err) {
    throw new Error(`Bkav 816: Object không phải JSON hợp lệ — ${err.message}`);
  }

  const messLog = (Array.isArray(innerArray) ? innerArray[0] : innerArray)?.MessLog;
  if (!messLog) return null;

  const base = PDF_BASE_URL.replace(/\/$/, '');
  const path = String(messLog).replace(/^\//, '');
  return { pdf_url: `${base}/${path}` };
}

module.exports = {
  createInvoice,
  getInvoicePdf816,
  buildJsonPayload,
  callBkavViaProxy,
  parseProxyResponse,
};
