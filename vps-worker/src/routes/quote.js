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
const ahamove = require('../lib/ahamove');
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

// POST /quote — frontend contract (camelCase response)
// Body: { restaurantId, pickupAddress, dropAddress, items:[{itemId,name,quantity}] }
router.post('/quote', async (req, res, next) => {
  try {
    const { restaurantId, pickupAddress, dropAddress, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }

    const goodsAmount = await computeGoodsAmount(restaurantId, items);
    const taxTotal = Math.round(goodsAmount * VAT_RATE);
    const itemsTotal = goodsAmount + taxTotal;

    // Quote phí VC qua Ahamove v3 estimateOrderFee.
    // pickupAddress → Ahamove pickup, dropAddress → drop.
    let shippingFee = 0;
    let ahamoveOrderId = '';
    let estimatedDeliveryMinutes = 0;
    try {
      const serviceId = 'SGN-BIKE';
      const body = {
        order_time: 0, // immediate
        path: [
          // Pickup point — lat/lng unknown → null, Ahamove geocodes from address.
          {
            lat: null,
            lng: null,
            address: pickupAddress || '',
            short_address: pickupAddress || '',
            name: '',
            mobile: '',
            remarks: '',
          },
          // Drop point.
          {
            lat: null,
            lng: null,
            address: dropAddress || '',
            short_address: dropAddress || '',
            name: '',
            mobile: '',
            remarks: '',
            cod: 0,
            item_value: itemsTotal,
          },
        ],
        services: [{ _id: serviceId, requests: [] }],
        payment_method: 'CASH',
        items: items.map((it) => ({
          _id: it.itemId != null ? String(it.itemId) : '',
          num: Number(it.quantity) || 1,
          name: it.name || '',
          price: it.price != null ? Number(it.price) : 0,
        })),
      };
      const estimates = await ahamove.estimateOrderFee(body);
      // estimateOrderFee returns an ARRAY of {service_id, data:{total_fee,...}}.
      // Pick the estimate matching the requested service_id; fallback to first.
      const estimate =
        (Array.isArray(estimates) && estimates.find((e) => e && e.service_id === serviceId)) ||
        (Array.isArray(estimates) && estimates[0]) ||
        null;
      if (estimate && estimate.data) {
        shippingFee = Number(estimate.data.total_fee ?? 0) || 0;
        // ETA: v3 returns duration (minutes) in data.duration.
        estimatedDeliveryMinutes = Number(estimate.data.duration ?? 0) || 0;
      }
    } catch (e) {
      // Nếu Ahamove fail, vẫn trả quote với shipping_fee=0 + warning.
      console.warn('[quote] Ahamove estimateOrderFee failed:', e.message);
    }

    const amount = itemsTotal + shippingFee;
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
    const taxTotal = Math.round(goodsAmount * VAT_RATE);
    const itemsTotal = goodsAmount + taxTotal;

    let shippingFee = 0;
    let ahamoveRaw = null;
    try {
      const serviceId = 'SGN-BIKE';
      const body = {
        order_time: 0, // immediate
        path: [
          // Pickup point — lat/lng unknown → null, Ahamove geocodes from address.
          {
            lat: null,
            lng: null,
            address: '',
            short_address: '',
            name: '',
            mobile: '',
            remarks: '',
          },
          // Drop point — legacy route passes cusLat/cusLng if available.
          {
            lat: cusLat != null ? Number(cusLat) : null,
            lng: cusLng != null ? Number(cusLng) : null,
            address: cusAddress || '',
            short_address: cusAddress || '',
            name: '',
            mobile: '',
            remarks: '',
            cod: 0,
            item_value: itemsTotal,
          },
        ],
        services: [{ _id: serviceId, requests: [] }],
        payment_method: 'CASH',
        items: items.map((it) => ({
          _id: it.itemId != null ? String(it.itemId) : '',
          num: Number(it.quantity) || 1,
          name: it.name || '',
          price: it.price != null ? Number(it.price) : 0,
        })),
      };
      const estimates = await ahamove.estimateOrderFee(body);
      // estimateOrderFee returns an ARRAY of {service_id, data:{total_fee,...}}.
      // Pick the estimate matching the requested service_id; fallback to first.
      const estimate =
        (Array.isArray(estimates) && estimates.find((e) => e && e.service_id === serviceId)) ||
        (Array.isArray(estimates) && estimates[0]) ||
        null;
      if (estimate && estimate.data) {
        shippingFee = Number(estimate.data.total_fee ?? 0) || 0;
        ahamoveRaw = estimate;
      }
    } catch (e) {
      console.warn('[quote] Ahamove estimateOrderFee failed:', e.message);
    }

    const totalAmount = itemsTotal + shippingFee;
    res.json({
      shipping_fee: shippingFee,
      items_total: itemsTotal,
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
