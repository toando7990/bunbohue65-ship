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
  const Order = IDL.Record({
    orderId: IDL.Text,
    restaurantId: IDL.Text,
    cusName: IDL.Text,
    cusPhone: IDL.Text,
    cusAddress: IDL.Text,
    cusTaxCode: IDL.Text,
    receiverEmail: IDL.Text,
    items: IDL.Vec(OrderItem),
    amount: IDL.Nat,
    goodsAmount: IDL.Nat,
    shippingFee: IDL.Nat,
    taxTotal: IDL.Nat,
    bookingStatus: IDL.Variant({
      pending: IDL.Null, confirmed: IDL.Null, shipping: IDL.Null,
      completed: IDL.Null, cancelled: IDL.Null,
    }),
    paymentStatus: IDL.Variant({
      unpaid: IDL.Null, paid: IDL.Null, refunded: IDL.Null,
    }),
    invoiceStatus: IDL.Variant({
      none: IDL.Null, invoiced: IDL.Null, failed: IDL.Null,
    }),
    ahamoveOrderId: IDL.Text,
    tingeeQrId: IDL.Text,
    sharedLink: IDL.Text,
    invoiceId: IDL.Text,
    pdfUrl: IDL.Text,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
  });
  const OrderStatus = IDL.Record({
    bookingStatus: Order.bookingStatus,
    paymentStatus: Order.paymentStatus,
    invoiceStatus: Order.invoiceStatus,
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
       IDL.Text, IDL.Text, IDL.Text, IDL.Text],
      [ResultOrder], [],
    ),
    updateStatus: IDL.Func(
      [IDL.Text, Order.bookingStatus, IDL.Text], [ResultOrder], [],
    ),
    updatePaymentStatus: IDL.Func(
      [IDL.Text, Order.paymentStatus, IDL.Text], [ResultOrder], [],
    ),
    updateInvoiceStatus: IDL.Func(
      [IDL.Text, Order.invoiceStatus, IDL.Text, IDL.Text, IDL.Text], [ResultOrder], [],
    ),
    listPendingPaymentOrders: IDL.Func([IDL.Text], [IDL.Vec(Order)], ['query']),
    getOrderStatus: IDL.Func([IDL.Text], [ResultOrderStatus], ['query']),
    getMenuForRestaurant: IDL.Func([IDL.Text], [IDL.Vec(MenuItemRecord)], ['query']),
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
async function createOrder(order) {
  const actor = getActor();
  const hmacSig = hmac.signCreateOrder(
    VPS_SECRET, order.orderId, order.restaurantId, order.amount, order.goodsAmount,
  );
  const result = await actor.createOrder(
    order.orderId, order.restaurantId,
    order.cusName, order.cusPhone, order.cusAddress, order.cusTaxCode, order.receiverEmail,
    order.items.map((it) => ({
      itemId: it.itemId, name: it.name, price: BigInt(it.price),
      quantity: BigInt(it.quantity), unitName: it.unitName, vatRate: BigInt(it.vatRate),
    })),
    BigInt(order.amount), BigInt(order.goodsAmount),
    BigInt(order.shippingFee), BigInt(order.taxTotal),
    order.ahamoveOrderId, order.tingeeQrId, order.sharedLink, hmacSig,
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

// getMenuForRestaurant — query. Trả [MenuItem] (price là BigInt Nat).
// Dùng trong routes/quote.js để fetch price cho items khi frontend không gửi price.
async function getMenuForRestaurant(restaurantId) {
  const actor = getActor();
  return await actor.getMenuForRestaurant(restaurantId);
}

module.exports = {
  getActor, createOrder, updateStatus, updatePaymentStatus,
  updateInvoiceStatus, getOrderStatus, listPendingPaymentOrders,
  getMenuForRestaurant,
};
