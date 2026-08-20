// ============================================================
// lib/hmac.js — HMAC-SHA256 signing cho canister calls
// ============================================================
// Canonical payloads (PHẢI khớp với canister lib/hmac.mo):
//   createOrder          : orderId|restaurantId|amount|goodsAmount
//   updateStatus         : orderId|<bookingStatus>           (lowercase variant)
//   updatePaymentStatus  : orderId|<paymentStatus>
//   updateInvoiceStatus  : orderId|<invoiceStatus>|invoiceId|pdfUrl
// Digest = lowercase hex SHA-256 (64 chars).
// ============================================================

const crypto = require('crypto');

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

// createOrder: orderId|restaurantId|amount|goodsAmount
function signCreateOrder(secret, orderId, restaurantId, amount, goodsAmount) {
  const payload = `${orderId}|${restaurantId}|${amount}|${goodsAmount}`;
  return sign(secret, payload);
}

// updateStatus: orderId|<bookingStatus>
function signUpdateStatus(secret, orderId, bookingStatus) {
  return sign(secret, `${orderId}|${bookingStatus}`);
}

// updatePaymentStatus: orderId|<paymentStatus>
function signUpdatePaymentStatus(secret, orderId, paymentStatus) {
  return sign(secret, `${orderId}|${paymentStatus}`);
}

// updateInvoiceStatus: orderId|<invoiceStatus>|invoiceId|pdfUrl
// pdfUrl có thể là chuỗi rỗng khi Bkav 816 thất bại sau retry.
function signUpdateInvoiceStatus(secret, orderId, invoiceStatus, invoiceId, pdfUrl) {
  return sign(secret, `${orderId}|${invoiceStatus}|${invoiceId}|${pdfUrl}`);
}

// updateOrderQr: orderId|qrCode|billId|expireAt
// qrCode/billId null → chuỗi rỗng; expireAt null → chuỗi rỗng, ngược lại là
// decimal string (giây). Khớp canister HmacLib.qrPayload.
function signUpdateOrderQr(secret, orderId, qrCode, billId, expireAt) {
  const qr = qrCode === null || qrCode === undefined ? '' : String(qrCode);
  const bill = billId === null || billId === undefined ? '' : String(billId);
  const exp = expireAt === null || expireAt === undefined ? '' : String(expireAt);
  return sign(secret, `${orderId}|${qr}|${bill}|${exp}`);
}

module.exports = {
  sign,
  signCreateOrder,
  signUpdateStatus,
  signUpdatePaymentStatus,
  signUpdateInvoiceStatus,
  signUpdateOrderQr,
};
