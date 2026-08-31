// ============================================================
// lib/canister.js — Canister call client (HMAC-signed pushes)
// ============================================================
// Canister là source of truth, 0 HTTP outcall. VPS push state qua:
//   createOrder, updateStatus, updatePaymentStatus, updateInvoiceStatus
// Dùng @icp-sdk/core. HMAC signing qua lib/hmac.js.
// ============================================================

const { HttpAgent, Actor } = require('@icp-sdk/core/agent');
const hmac = require('./hmac');

const CANISTER_ID = process.env.CANISTER_ID;
const IC_HOST = process.env.IC_HOST || 'http://127.0.0.1:4943';
const VPS_SECRET = process.env.VPS_SECRET;

if (!CANISTER_ID) throw new Error('CANISTER_ID env var required');
if (!VPS_SECRET) throw new Error('VPS_SECRET env var required');

// Candid interface (IDL) cho 4 method VPS push + getOrderStatus + getMenuForRestaurant.
// createOrder trả Result<Order, Text> → variant { ok, err }.
// MenuItemRecord khớp chính xác CoreTypes.MenuItem của backend (xem
// src/backend/types/core.mo:100-109 và frontend bindings
// src/frontend/src/declarations/backend.did.js:47-56). Sai field → candid decode fail.
const IDL_FACTORY = ({ IDL }) => {
  const MenuItemRecord = IDL.Record({
    itemId: IDL.Text,
    name: IDL.Text,
    price: IDL.Nat,
    unitName: IDL.Text,
    vatRate: IDL.Nat,
    category: IDL.Text,
    imageUrl: IDL.Text,
    visible: IDL.Bool,
  });
  const OrderItem = IDL.Record({
    itemId: IDL.Text,
    name: IDL.Text,
    price: IDL.Nat,
    quantity: IDL.Nat,
    unitName: IDL.Text,
    vatRate: IDL.Nat,
  });
  // 3 kiểu trạng thái định nghĩa RIÊNG thành hằng số trước, dùng lại ở cả
  // Order/OrderStatus record LẪN chữ ký IDL.Func bên dưới — KHÔNG truy cập
  // qua Order.bookingStatus/Order.paymentStatus/Order.invoiceStatus (property
  // access trên instance IDL.Record không được đảm bảo trả về type field,
  // phụ thuộc chi tiết triển khai nội bộ của thư viện — đã từng "hoạt động
  // tình cờ" rồi vỡ sau 1 lần nâng cấp @icp-sdk/core, khiến updateStatus/
  // updatePaymentStatus/updateInvoiceStatus nhận `undefined` làm kiểu tham
  // số, gây lỗi "Cannot read properties of undefined (reading
  // 'buildTypeTable')" ngay khi encode request — im lặng không cập nhật
  // được trạng thái thanh toán dù Tingee đã xác nhận tiền về).
  const BookingStatus = IDL.Variant({
    pending: IDL.Null, confirmed: IDL.Null, shipping: IDL.Null,
    pickedUp: IDL.Null, completed: IDL.Null, cancelled: IDL.Null,
  });
  const PaymentStatus = IDL.Variant({
    unpaid: IDL.Null, paid: IDL.Null, refunded: IDL.Null, expired: IDL.Null,
  });
  const InvoiceStatus = IDL.Variant({
    none: IDL.Null, invoiced: IDL.Null, failed: IDL.Null,
  });
  const Order = IDL.Record({
    orderId: IDL.Text,
    restaurantId: IDL.Text,
    cusName: IDL.Text,
    cusPhone: IDL.Text,
    cusAddress: IDL.Text,
    cusTaxCode: IDL.Text,
    receiverEmail: IDL.Text,
    pickupCode: IDL.Text,
    items: IDL.Vec(OrderItem),
    amount: IDL.Nat,
    goodsAmount: IDL.Nat,
    shippingFee: IDL.Nat,
    taxTotal: IDL.Nat,
    bookingStatus: BookingStatus,
    paymentStatus: PaymentStatus,
    invoiceStatus: InvoiceStatus,
    ahamoveOrderId: IDL.Text,
    tingeeQrId: IDL.Text,
    sharedLink: IDL.Text,
    tingeeQrCode: IDL.Text,
    invoiceId: IDL.Text,
    pdfUrl: IDL.Text,
    billId: IDL.Opt(IDL.Text),
    qrCode: IDL.Opt(IDL.Text),
    expireAt: IDL.Opt(IDL.Nat64),
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
  });
  const OrderStatus = IDL.Record({
    bookingStatus: BookingStatus,
    paymentStatus: PaymentStatus,
    invoiceStatus: InvoiceStatus,
    tingeeQrId: IDL.Text,
    sharedLink: IDL.Text,
    invoiceId: IDL.Text,
    pdfUrl: IDL.Text,
  });
  const ResultOrder = IDL.Variant({ ok: Order, err: IDL.Text });
  const ResultOrderStatus = IDL.Variant({ ok: OrderStatus, err: IDL.Text });
  return IDL.Service({
    createOrder: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text,
       IDL.Vec(OrderItem), IDL.Nat, IDL.Nat, IDL.Nat, IDL.Nat,
       IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [ResultOrder], [],
    ),
    updateStatus: IDL.Func(
      [IDL.Text, BookingStatus, IDL.Text], [ResultOrder], [],
    ),
    updatePaymentStatus: IDL.Func(
      [IDL.Text, PaymentStatus, IDL.Text], [ResultOrder], [],
    ),
    updateInvoiceStatus: IDL.Func(
      [IDL.Text, InvoiceStatus, IDL.Text, IDL.Text, IDL.Text], [ResultOrder], [],
    ),
    updateOrderQr: IDL.Func(
      [IDL.Text, IDL.Opt(IDL.Text), IDL.Opt(IDL.Text), IDL.Opt(IDL.Nat64), IDL.Text], [ResultOrder], [],
    ),
    markPaymentExpired: IDL.Func(
      [IDL.Text, IDL.Text], [ResultOrder], [],
    ),
    listPendingPaymentOrders: IDL.Func([IDL.Text], [IDL.Vec(Order)], ['query']),
    cancelOrder: IDL.Func([IDL.Text, IDL.Text], [ResultOrder], []),
    getOrderStatus: IDL.Func([IDL.Text], [ResultOrderStatus], ['query']),
    getMenuForRestaurant: IDL.Func([IDL.Text], [IDL.Vec(MenuItemRecord)], ['query']),
    getPaymentMode: IDL.Func([], [IDL.Text], ['query']),
    applyPromotion: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ promotionCode: IDL.Text, discountAmount: IDL.Nat }), err: IDL.Text })],
      [],
    ),
    issueSalesBonus: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({
        ok: IDL.Opt(IDL.Record({
          code: IDL.Text, programCode: IDL.Text, email: IDL.Text, value: IDL.Nat,
          startDate: IDL.Text, endDate: IDL.Text, used: IDL.Bool, issuedAt: IDL.Int,
        })),
        err: IDL.Text,
      })],
      [],
    ),
    applyVoucher: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
  });
};

let _actor = null;
function getActor() {
  if (_actor) return _actor;
  const agent = new HttpAgent({ host: IC_HOST });
  // Local replica: fetch root key. Production icp-api.io: bỏ qua.
  if (IC_HOST.includes('127.0.0.1') || IC_HOST.includes('localhost')) {
    agent.fetchRootKey().catch((e) => console.error('[canister] fetchRootKey failed:', e.message));
  }
  _actor = Actor.createActor(IDL_FACTORY, { agent, canisterId: CANISTER_ID });
  return _actor;
}

// createOrder — push order mới vào canister (HMAC verified).
// Trả về { ok: order } | { err: text }.
// CRITICAL: amount/goodsAmount phải là integer khi gọi hàm này. Backend
// canister reconstructs HMAC payload với Int.toText(Nat) — không decimal.
// BigInt() truncate decimal SAU khi sign → payload mismatch → #err('Invalid
// HMAC'). Math.round ở đây là safety net: đảm bảo HMAC sign và BigInt() dùng
// CÙNG giá trị integer kể cả khi caller truyền decimal (vd từ SQLite row cũ).
async function createOrder(order) {
  const actor = getActor();
  const amountInt = Math.round(Number(order.amount));
  const goodsAmountInt = Math.round(Number(order.goodsAmount));
  const shippingFeeInt = Math.round(Number(order.shippingFee));
  const taxTotalInt = Math.round(Number(order.taxTotal));
  const hmacSig = hmac.signCreateOrder(
    VPS_SECRET, order.orderId, order.restaurantId, amountInt, goodsAmountInt,
  );
  const result = await actor.createOrder(
    order.orderId, order.restaurantId,
    order.cusName, order.cusPhone, order.cusAddress, order.cusTaxCode, order.receiverEmail,
    order.items.map((it) => ({
      itemId: it.itemId, name: it.name, price: BigInt(Math.round(Number(it.price))),
      quantity: BigInt(Math.round(Number(it.quantity))), unitName: it.unitName, vatRate: BigInt(Math.round(Number(it.vatRate))),
    })),
    BigInt(amountInt), BigInt(goodsAmountInt),
    BigInt(shippingFeeInt), BigInt(taxTotalInt),
    order.ahamoveOrderId, order.tingeeQrId, order.sharedLink, order.tingeeQrCode,
    order.pickupCode || '', hmacSig,
  );
  return result; // { ok } | { err }
}

// updateStatus — booking status (pending|confirmed|shipping|completed|cancelled)
async function updateStatus(orderId, bookingStatus) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateStatus(VPS_SECRET, orderId, bookingStatus);
  return await actor.updateStatus(orderId, { [bookingStatus]: null }, hmacSig);
}

// updatePaymentStatus — (unpaid|paid|refunded)
async function updatePaymentStatus(orderId, paymentStatus) {
  const actor = getActor();
  const hmacSig = hmac.signUpdatePaymentStatus(VPS_SECRET, orderId, paymentStatus);
  return await actor.updatePaymentStatus(orderId, { [paymentStatus]: null }, hmacSig);
}

// updateInvoiceStatus — (none|invoiced|failed) + invoiceId + pdfUrl
// pdfUrl là link PDF từ Bkav 816 (chuỗi rỗng khi 816 thất bại sau retry).
async function updateInvoiceStatus(orderId, invoiceStatus, invoiceId, pdfUrl) {
  const actor = getActor();
  const safePdfUrl = pdfUrl || '';
  const hmacSig = hmac.signUpdateInvoiceStatus(VPS_SECRET, orderId, invoiceStatus, invoiceId, safePdfUrl);
  return await actor.updateInvoiceStatus(orderId, { [invoiceStatus]: null }, invoiceId, safePdfUrl, hmacSig);
}

// updateOrderQr — lưu QR Tingee (qrCode + billId + expireAt) vào đơn.
// qrCode/billId/expireAt là optional: null → không thay đổi field đó.
// expireAt là Unix timestamp (giây). HMAC payload: orderId|qrCode|billId|expireAt
// (null → chuỗi rỗng, expireAt → decimal string), khớp canister HmacLib.qrPayload.
async function updateOrderQr(orderId, qrCode, billId, expireAt) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateOrderQr(VPS_SECRET, orderId, qrCode, billId, expireAt);
  const qrCodeOpt = qrCode === null || qrCode === undefined ? [] : [qrCode];
  const billIdOpt = billId === null || billId === undefined ? [] : [billId];
  const expireAtOpt = expireAt === null || expireAt === undefined ? [] : [BigInt(expireAt)];
  return await actor.updateOrderQr(orderId, qrCodeOpt, billIdOpt, expireAtOpt, hmacSig);
}

// markPaymentExpired — đánh dấu đơn #expired khi QR động hết hạn chưa thanh toán.
// HMAC payload: orderId|expired (khớp canister HmacLib.expiredPayload). Sau khi
// đơn chuyển #expired, tài xế có thể tạo QR mới qua POST /order/:id/qr.
async function markPaymentExpired(orderId) {
  const actor = getActor();
  const hmacSig = hmac.signMarkPaymentExpired(VPS_SECRET, orderId);
  return await actor.markPaymentExpired(orderId, hmacSig);
}

// getOrderStatus — query (frontend poll 5s có thể gọi trực tiếp canister,
// nhưng VPS cũng dùng cho reconciliation).
async function getOrderStatus(orderId) {
  const actor = getActor();
  return await actor.getOrderStatus(orderId);
}

// listPendingPaymentOrders — query
async function listPendingPaymentOrders(restaurantId) {
  const actor = getActor();
  return await actor.listPendingPaymentOrders(restaurantId);
}

// cancelOrder — hủy đơn (bookingStatus=#cancelled). HMAC payload: orderId|cancelled
// (khớp backend HmacLib.statusPayload(orderId, #cancelled)). Dùng cho cron
// auto-cancel đơn unpaid hết hạn.
async function cancelOrder(orderId) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateStatus(VPS_SECRET, orderId, 'cancelled');
  return await actor.cancelOrder(orderId, hmacSig);
}

// getMenuForRestaurant — query. Trả [MenuItem] (price là BigInt Nat).
// Dùng trong routes/quote.js để fetch price cho items khi frontend không gửi price.
async function getMenuForRestaurant(restaurantId) {
  const actor = getActor();
  return await actor.getMenuForRestaurant(restaurantId);
}

// getPaymentMode — query. Trả 'driver' | 'customer'. Dùng để hiển thị đúng
// luồng thanh toán (khách tự đặt tài xế qua app ngoài, không qua AhaMove).
// Default 'driver' nếu canister trả giá trị bất thường.
async function getPaymentMode() {
  const actor = getActor();
  return await actor.getPaymentMode();
}

// applyPromotion — kiểm tra + áp dụng KM (Hệ 1, theo khung giờ) lúc tạo
// đơn. HMAC payload: email|orderAmount (Nat.toText, khớp
// promotion-api.mo). orderAmount PHẢI là integer khi gọi (giống lý do ở
// createOrder — HMAC sign dùng Int.toText, không decimal).
// Trả { ok: { promotionCode, discountAmount } } | { err: text } — #err
// (không có KM đang chạy, email chưa xác thực, đạt giới hạn...) KHÔNG
// phải lỗi hệ thống — caller (routes/create.js) coi #err là "không áp
// dụng KM", vẫn tạo đơn bình thường với giá gốc.
async function applyPromotion(email, orderAmount) {
  const actor = getActor();
  const orderAmountInt = Math.round(Number(orderAmount));
  const hmacSig = hmac.signApplyPromotion(VPS_SECRET, email, orderAmountInt);
  return await actor.applyPromotion(email, BigInt(orderAmountInt), hmacSig);
}

// issueSalesBonus — kiểm tra + phát thưởng doanh số (Giai đoạn 3d) cho 1
// khách trong 1 kỳ (periodType: 'weekly'|'monthly'). Gọi từ
// routes/sales-bonus-cron.js sau khi tính tổng doanh số kỳ trước. Canister
// tự quyết định có đạt mức nào không + chống phát trùng nếu cron gọi lại
// cho cùng 1 kỳ — trả về { ok: [voucher] | [] } (mảng rỗng = không đủ
// điều kiện, không phải lỗi) | { err: string } (chỉ khi periodType sai).
async function issueSalesBonus(email, periodType, periodKey, totalSales) {
  const actor = getActor();
  const totalSalesInt = Math.round(Number(totalSales));
  const hmacSig = hmac.signIssueSalesBonus(VPS_SECRET, email, periodType, periodKey, totalSalesInt);
  return await actor.issueSalesBonus(email, periodType, periodKey, BigInt(totalSalesInt), hmacSig);
}

// applyVoucher — kiểm tra + đánh dấu ĐÃ DÙNG 1 phiếu giảm giá (Giai đoạn
// 3e). orderAmount PHẢI là số tiền CÒN LẠI sau khi đã trừ KM Hệ 1 (nếu có)
// — phiếu áp vào phần còn lại, 2 loại chiết khấu CỘNG DỒN (không giới hạn
// chỉ 1 loại). Trả { ok: Nat } (số tiền giảm THỰC TẾ, đã giới hạn không
// vượt orderAmount) | { err: string } (phiếu không hợp lệ/đã dùng/hết
// hạn/sai email) — #err KHÔNG chặn tạo đơn, chỉ đơn giản là không áp
// dụng được phiếu đó.
async function applyVoucher(email, code, orderAmount) {
  const actor = getActor();
  const orderAmountInt = Math.round(Number(orderAmount));
  const hmacSig = hmac.signApplyVoucher(VPS_SECRET, email, code, orderAmountInt);
  return await actor.applyVoucher(email, code, BigInt(orderAmountInt), hmacSig);
}

module.exports = {
  getActor, createOrder, updateStatus, updatePaymentStatus,
  updateInvoiceStatus, updateOrderQr, markPaymentExpired, getOrderStatus, listPendingPaymentOrders, cancelOrder,
  getMenuForRestaurant, getPaymentMode, applyPromotion, issueSalesBonus, applyVoucher,
};
