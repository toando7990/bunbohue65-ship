// ============================================================
// lib/bkav.js — Bkav eHoadon SOAP/XML client
// ============================================================
// Endpoint: https://ws.ehoadon.vn/WSPublicEhoadon.asmx/ExecCommand
// Methods: CreateInvoice (CmdType 100, khi completed + paid),
//          GetInvoicePDF (CmdType 816, theo PartnerInvoiceStringID).
//
// Architecture: direct SOAP/axios (buildEnvelope + execCommand).
// CmdType 100 JSON payload (buildJsonPayload) được Base64-encode
// và gửi làm XmlData CDATA trong SOAP envelope hiện có.
// ============================================================

const axios = require('axios');
const xml2js = require('xml2js');

const ENDPOINT = process.env.BKAV_ENDPOINT || 'https://ws.ehoadon.vn/WSPublicEhoadon.asmx/ExecCommand';
// Base URL host phục vụ file PDF eHoadon (KHÔNG phải SOAP ExecCommand endpoint).
// MessLog từ response 816 là path tương đối (vd: /Invoice_View_Demo/C2/3T/...pdf),
// cần ghép với PDF host này để có URL download đầy đủ.
const PDF_BASE_URL = process.env.BKAV_PDF_BASE_URL || 'https://stg-ehoadon.vn';
const PARTNER_GUID = process.env.BKAV_PARTNER_GUID;
const PARTNER_TOKEN = process.env.BKAV_PARTNER_TOKEN;

// Command list — Command string param trong SOAP ExecCommand.
// cmdType (100/816) nằm INSIDE JSON payload, không phải Command string.
const COMMANDS = (process.env.BKAV_COMMAND_LIST || 'CreateInvoice,GetInvoicePDF').split(',').map((s) => s.trim());

if (!PARTNER_GUID || !PARTNER_TOKEN) {
  console.warn('[bkav] BKAV_PARTNER_GUID/TOKEN missing — invoicing will fail');
}

// Build SOAP envelope cho ExecCommand.
// Bkav eHoadon dùng pattern: ExecCommand(partnerGuid, partnerToken, command, xmlData).
function buildEnvelope(command, xmlData) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ExecCommand xmlns="http://tempuri.org/">
      <PartnerGuid>${escapeXml(PARTNER_GUID || '')}</PartnerGuid>
      <PartnerToken>${escapeXml(PARTNER_TOKEN || '')}</PartnerToken>
      <Command>${escapeXml(command)}</Command>
      <XmlData><![CDATA[${xmlData}]]></XmlData>
    </ExecCommand>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Gọi SOAP ExecCommand, parse response XML → JSON.
async function execCommand(command, xmlData) {
  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown Bkav command: ${command}. Update BKAV_COMMAND_LIST.`);
  }
  const envelope = buildEnvelope(command, xmlData);
  const res = await axios.post(ENDPOINT, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '"http://tempuri.org/ExecCommand"',
    },
    timeout: 30000,
  });
  const parsed = await parseSoapResponse(res.data);
  return parsed;
}

// Parse SOAP response → extract ExecCommandResult inner XML → JSON.
async function parseSoapResponse(xml) {
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const result = await parser.parseStringPromise(xml);
  const body = result?.['soap:Envelope']?.['soap:Body'] || result?.Envelope?.Body;
  const execResult = body?.ExecCommandResponse?.ExecCommandResult;
  if (!execResult) throw new Error('Bkav: missing ExecCommandResult in SOAP response');
  // Inner content thường là XML string → parse tiếp.
  try {
    const inner = await parser.parseStringPromise(execResult);
    return inner;
  } catch {
    return { raw: execResult };
  }
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

  // Backward compat: map field cũ → field mới.
  const buyerName = invoice.buyerName || invoice.cusName || '';
  const buyerTaxCode = invoice.buyerTaxCode || invoice.cusTaxCode || '';
  const buyerAddress = invoice.buyerAddress || invoice.cusAddress || '';

  const dateStr = new Date().toISOString().replace(/\.\d{3}Z$/, ''); // ISO datetime without ms/Z
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
      listInvoiceDetailsWS: (invoice.items || []).map((it) => ({
        itemTypeID: 0,
        itemName: it.name,
        unitName: it.unitName || '',
        qty: it.quantity,
        price: it.price,
        amount: it.quantity * it.price,
        taxRateID: taxRateID,
        taxAmount: it.quantity * it.price * (invoice.taxRate / 100),
        isDiscount: false,
      })),
      partnerInvoiceID: 0,
      partnerInvoiceStringID: String(invoice.orderId),
    }],
  };
}

// ------------------------------------------------------------
// parseBkavResponse — Parse SOAP XML response → structured result.
// ------------------------------------------------------------
// Extract <ExecCommandResult> content (Base64-encoded JSON), decode,
// return { success, invoiceNo, invoiceDate, maCQT, maTraCuu, error, errorCode }.
// On parse failure: return { success: false, error: 'parse_failed', raw }.
//
// Dùng xml2js (đã có sẵn, consistent với getInvoicePdf816).
// ------------------------------------------------------------
async function parseBkavResponse(soapXml) {
  let execResult;
  try {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
    const parsed = await parser.parseStringPromise(soapXml);
    const body = parsed?.['soap:Envelope']?.['soap:Body'] || parsed?.Envelope?.Body;
    execResult = body?.ExecCommandResponse?.ExecCommandResult;
  } catch (err) {
    return { success: false, error: 'parse_failed', raw: soapXml };
  }

  if (!execResult) {
    return { success: false, error: 'missing_ExecCommandResult', raw: soapXml };
  }

  // execResult là Base64-encoded JSON → decode + JSON.parse.
  let json;
  try {
    const decoded = Buffer.from(execResult, 'base64').toString('utf8');
    json = JSON.parse(decoded);
  } catch (err) {
    // Có thể execResult đã là JSON string (không Base64) — thử parse trực tiếp.
    try {
      json = JSON.parse(execResult);
    } catch (err2) {
      return { success: false, error: 'decode_failed', raw: soapXml };
    }
  }

  // Bkav response shape: { Status, Object (JSON string), Code, isOk, isError }
  // Object là JSON string → parse tiếp để lấy invoice fields.
  const success = json.Status === 0 || json.isOk === true;
  let invoiceNo = '';
  let invoiceDate = '';
  let maCQT = '';
  let maTraCuu = '';

  if (success && json.Object) {
    try {
      const inner = typeof json.Object === 'string'
        ? JSON.parse(json.Object)
        : json.Object;
      const first = Array.isArray(inner) ? inner[0] : inner;
      invoiceNo = String(first?.InvoiceNo || first?.invoiceNo || '');
      invoiceDate = String(first?.InvoiceDate || first?.invoiceDate || '');
      maCQT = String(first?.MaCQT || first?.maCQT || '');
      maTraCuu = String(first?.MaTraCuu || first?.maTraCuu || first?.TransactionID || '');
    } catch (err) {
      // Object parse fail — vẫn trả success nhưng fields trống.
    }
  }

  return {
    success,
    invoiceNo,
    invoiceDate,
    maCQT,
    maTraCuu,
    error: success ? '' : (json.MessLog || json.Message || 'bkav_failure'),
    errorCode: json.Code ?? '',
    raw: json,
  };
}

// ------------------------------------------------------------
// callBkav — Wrapper: buildJsonPayload → Base64 → SOAP → parse.
// ------------------------------------------------------------
// Kết hợp buildEnvelope + axios + parseBkavResponse. Trả về
// structured result thay vì raw response như execCommand.
// ------------------------------------------------------------
async function callBkav(command, jsonPayload, config) {
  config = config || {};
  const jsonStr = JSON.stringify(jsonPayload);
  const commandData = Buffer.from(jsonStr, 'utf8').toString('base64');
  const envelope = buildEnvelope(command, commandData);
  const res = await axios.post(ENDPOINT, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '"http://tempuri.org/ExecCommand"',
    },
    timeout: 30000,
  });
  return await parseBkavResponse(res.data);
}

// ------------------------------------------------------------
// createInvoice — CmdType 100 JSON qua buildJsonPayload.
// ------------------------------------------------------------
// Backward compat: giữ signature cũ (cusName, cusTaxCode, cusAddress,
// amount, goodsAmount, taxTotal) — buildJsonPayload map tự động.
// Trả { invoiceNo, invoiceDate, maCQT, maTraCuu, error, errorCode, raw }.
// error/errorCode chỉ có giá trị khi Bkav báo thất bại (invoiceNo rỗng) —
// giữ lại để caller ghi log rõ nguyên nhân thay vì chỉ biết "rỗng".
// ------------------------------------------------------------
async function createInvoice(invoice, config) {
  config = config || {};
  const payload = buildJsonPayload(invoice, config);
  const result = await callBkav('CreateInvoice', payload, config);
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

// GetInvoicePDF — trả link download PDF.
// getInvoicePdf (CmdType GetInvoicePDF theo InvoiceID) — ĐÃ XOÁ, không còn
// nơi nào dùng. Toàn bộ endpoint khách hàng đã chuyển sang getInvoicePdf816
// (theo orderId, đáng tin cậy hơn — cron đã tự chứng minh hoạt động ổn định
// từ trước, trong khi API theo InvoiceID gần như không bao giờ hoạt động vì
// invoice_id hiếm khi có giá trị đúng trước khi sửa lỗi invoiceNo).

// ------------------------------------------------------------
// getInvoicePdf816 — Lấy PDF theo orderId qua CmdType 816.
// ------------------------------------------------------------
// Khác với getInvoicePdf (CmdType GetInvoicePDF theo invoiceId),
// hàm này dùng CmdType 816 để tra PDF theo PartnerInvoiceStringID
// (orderId trên hệ thống của mình).
//
// Request JSON (CmdType 816):
//   { CmdType: 816,
//     CommandObject: [{ PartnerInvoiceID: 0,
//                        PartnerInvoiceStringID: String(orderId) }] }
//
// Response 816 có shape:
//   { Status, Object (JSON string), Code, isOk, isError }
// Trong đó `Object` là JSON string, parse tiếp sẽ ra mảng,
// phần tử [0].MessLog là path PDF trên server Bkav, ví dụ:
//   /Invoice_View_Demo/C2/3T/C23TYY-00000007-X301O9JT62-CK.pdf
//
// Ghép MessLog với ENDPOINT base URL Bkav để có pdf_url đầy đủ.
// Trả { pdf_url } khi thành công, hoặc null khi isError/isOk=false.
//
// Lưu ý: KHÔNG sửa buildJsonPayload (chỉ dành cho CmdType 100),
// KHÔNG sửa parseBkavResponse/parseSoapResponse hiện có.
// ------------------------------------------------------------
async function getInvoicePdf816(orderId) {
  // Request JSON riêng cho 816 — không dùng buildJsonPayload (CmdType 100).
  const requestJson = {
    CmdType: 816,
    CommandObject: [
      {
        PartnerInvoiceID: 0,
        PartnerInvoiceStringID: String(orderId),
      },
    ],
  };

  // Gọi Bkav SOAP trực tiếp qua axios — không qua proxy :3000.
  const envelope = buildEnvelope('GetInvoicePDF', JSON.stringify(requestJson));
  const res = await axios.post(ENDPOINT, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '"http://tempuri.org/ExecCommand"',
    },
    timeout: 30000,
  });

  // Parse SOAP response → ExecCommandResult inner XML → JSON.
  const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
  const soapParsed = await parser.parseStringPromise(res.data);
  const body = soapParsed?.['soap:Envelope']?.['soap:Body'] || soapParsed?.Envelope?.Body;
  const execResult = body?.ExecCommandResponse?.ExecCommandResult;
  if (!execResult) {
    throw new Error('Bkav 816: missing ExecCommandResult in SOAP response');
  }

  // Parse 2 lớp JSON cho 816 (riêng, không dùng parseBkavResponse hiện có).
  // Lớp 1: JSON.parse(execResult) → { Status, Object, Code, isOk, isError }
  // Lớp 2: JSON.parse(response.Object) → mảng, [0].MessLog là path PDF.
  let response;
  try {
    response = JSON.parse(execResult);
  } catch (err) {
    throw new Error(`Bkav 816: response không phải JSON hợp lệ — ${err.message}`);
  }

  // Kiểm tra trạng thái lỗi từ Bkav.
  if (response?.isError || response?.isOk === false) {
    return null;
  }

  // Object là JSON string → parse tiếp để lấy MessLog (path PDF).
  let innerArray;
  try {
    innerArray = JSON.parse(response?.Object || '[]');
  } catch (err) {
    throw new Error(`Bkav 816: Object không phải JSON hợp lệ — ${err.message}`);
  }

  const messLog = innerArray?.[0]?.MessLog;
  if (!messLog) {
    // Không có path PDF trong response.
    return null;
  }

  // Ghép MessLog với PDF host (KHÔNG phải SOAP ExecCommand endpoint),
  // xử lý slash khi nối:
  //   - PDF_BASE_URL có thể kết thúc bằng / hoặc không → strip / ở cuối.
  //   - MessLog có thể bắt đầu bằng / hoặc không → strip / ở đầu.
  // Kết quả luôn có đúng 1 slash giữa base và path.
  const base = PDF_BASE_URL.replace(/\/$/, '');
  const path = String(messLog).replace(/^\//, '');
  const pdfUrl = `${base}/${path}`;

  return { pdf_url: pdfUrl };
}

module.exports = {
  // Existing exports (giữ nguyên).
  createInvoice,
  getInvoicePdf816,
  execCommand,
  ENDPOINT,
  COMMANDS,
  // New exports.
  buildJsonPayload,
  callBkav,
  parseBkavResponse,
};
