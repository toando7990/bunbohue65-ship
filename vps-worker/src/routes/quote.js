// ============================================================
// routes/quote.js — POST /quote (frontend) + POST /order/quote (legacy)
// ============================================================
// Frontend (vps-client.ts) calls POST /quote with:
//   { restaurantId, pickupAddress, dropAddress, items:[{itemId,name,quantity}] }
// Returns QuoteResponse (camelCase):
//   { shippingFee, goodsAmount, taxTotal, amount, vatRate,
//     ahamoveOrderId, estimatedDeliveryMinutes }
//
// Legacy POST /order/quote kept for backward compat (snake_case in/out).
//
// goods_amount: items không gửi price → fetch từ canister getMenuForRestaurant,
// fallback price=0 chỉ khi item không có trong menu. VAT cố định 8%.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');

const router = express.Router();
const VAT_RATE = 0.08; // VAT cố định 8%

// Lấy price cho mỗi item từ canister getMenuForRestaurant (nếu frontend không gửi price).
// Trả Map<itemId, price> (price là Number, VND). Nếu canister call fail → trả null
// để caller dùng fallback price=0.
async function fetchItemPrices(restaurantId, itemIds) {
  try {
    const menu = await canister.getMenuForRestaurant(restaurantId);
    if (!Array.isArray(menu)) return null;
    const priceMap = new Map();
    for (const item of menu) {
      if (item && item.itemId != null && item.price != null) {
        priceMap.set(item.itemId, Number(item.price));
      }
    }
    return priceMap;
  } catch (e) {
    console.warn('[quote] getMenuForRestaurant failed for restaurant', restaurantId, ':', e.message);
    return null;
  }
}

// Tính goodsAmount từ items. Nếu item có price → dùng; không → fetch prices;
// fetch fail hoặc item không có trong menu → price=0 + warning rõ ràng.
async function computeGoodsAmount(restaurantId, items) {
  const needsPrice = items.some((it) => it.price == null);
  if (!needsPrice) {
    return items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
  }
  const priceMap = await fetchItemPrices(restaurantId, items.map((it) => it.itemId));
  return items.reduce((s, it) => {
    let price;
    if (it.price != null) {
      price = Number(it.price);
    } else if (priceMap && priceMap.has(it.itemId)) {
      price = priceMap.get(it.itemId);
    } else {
      price = 0;
      console.warn(
        '[quote] Item', it.itemId, 'not found in menu for restaurant', restaurantId, '— using price=0',
      );
    }
    return s + price * Number(it.quantity);
  }, 0);
}

// Fetch paymentMode từ canister (giống routes/create.js). 'customer' → bỏ qua
// Ahamove quote; 'driver' (default) → flow Ahamove như cũ. Trả 'driver' khi
// canister call fail để hai route luôn consistent.
async function fetchPaymentMode() {
  try {
    const mode = await canister.getPaymentMode();
    if (mode === 'customer' || mode === 'driver') {
      return mode;
    }
  } catch (e) {
    console.warn('[quote] canister getPaymentMode failed, defaulting to driver:', e.message);
  }
  return 'driver';
}

// POST /quote — frontend contract (camelCase response)
// Body: { restaurantId, pickupAddress, dropAddress, items:[{itemId,name,quantity}] }
router.post('/quote', async (req, res, next) => {
  try {
    const { restaurantId, pickupAddress, dropAddress, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }

    const goodsAmount = await computeGoodsAmount(restaurantId, items);
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    // Khách tự đặt tài xế bằng app ngoài → không cộng phí ship, không quote Ahamove.
    const taxTotal = 0;
    const shippingFee = 0;
    const ahamoveOrderId = '';
    const estimatedDeliveryMinutes = 0;

    const amount = goodsAmount;
    res.json({
      shippingFee,
      goodsAmount,
      taxTotal,
      amount,
      vatRate: VAT_RATE,
      ahamoveOrderId,
      estimatedDeliveryMinutes,
    });
  } catch (e) {
    next(e);
  }
});

// POST /order/quote — legacy (snake_case in/out, kept for backward compat)
// Body: { cusAddress, cusLat, cusLng, items:[{itemId,name,price,quantity,unitName,vatRate}] }
router.post('/order/quote', async (req, res, next) => {
  try {
    const { cusAddress, cusLat, cusLng, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }
    const goodsAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    // Khách tự đặt tài xế bằng app ngoài → không cộng phí ship, không quote Ahamove.
    const taxTotal = 0;
    const shippingFee = 0;
    const ahamoveRaw = null;

    const totalAmount = goodsAmount;
    res.json({
      shipping_fee: shippingFee,
      items_total: goodsAmount,
      tax_total: taxTotal,
      total_amount: totalAmount,
      goods_amount: goodsAmount,
      ahamove_raw: ahamoveRaw,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
