// ============================================================
// routes/create.js — POST /order/create (rate-limited)
// ============================================================
// Frontend (vps-client.ts) calls POST /order/create with CreateOrderPayload:
//   { restaurantId, pickupAddress, cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail,
//     items:[{itemId,name,quantity,price,vatRate,unitName}],
//     shippingFee, ahamoveOrderId }
// Returns CreateOrderResponse (camelCase):
//   { orderId, ok, error? }
//
// 1. Tạo Ahamove order (nếu chưa có ahamoveOrderId từ frontend).
// 2. Tingee generate-dynamic-qr.
// 3. Lưu SQLite (orders + order_items).
// 4. Push canister createOrder (HMAC). Nếu fail → retry queue (sync.js).
// ============================================================

const express = require('express');
const crypto = require('crypto');
const ahamove = require('../lib/ahamove');
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const VAT_RATE = 0.08;

// Rate-limit: 30 req/phút/IP
router.use(rateLimit({ windowMs: 60000, max: 30, message: 'Too many create requests' }));

// POST /order/create
router.post('/order/create', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const {
      restaurantId, pickupAddress, cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail,
      items, shippingFee: frontendShippingFee, ahamoveOrderId: frontendAhamoveOrderId,
    } = body;
    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    // 0. Fetch paymentMode từ canister. 'customer' → bỏ qua Ahamove, customer
    //    tự đến lấy hàng; 'driver' (default) → flow Ahamove như cũ.
    //    Phải fetch TRƯỚC khi validate: customer mode ẩn trường cusAddress
    //    trên UI nên cusAddress luôn rỗng → không require trong customer mode.
    let paymentMode = 'driver';
    try {
      const mode = await canister.getPaymentMode();
      if (mode === 'customer' || mode === 'driver') {
        paymentMode = mode;
      }
    } catch (e) {
      console.warn('[create] canister getPaymentMode failed, defaulting to driver:', e.message);
    }

    // Validate required fields. cusAddress chỉ required khi paymentMode='driver'
    // (customer mode: khách nhập địa chỉ trong Grab Express, không trong app).
    if (!restaurantId || !cusName || !cusPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    if (paymentMode === 'driver' && !cusAddress) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Tính tiền (frontend gửi price + vatRate trong items)
    const goodsAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    const taxTotal = Math.round(goodsAmount * VAT_RATE);
    const itemsTotal = goodsAmount + taxTotal;

    // 1. Ahamove create order (v3) — chỉ khi paymentMode='driver'.
    //    Nếu frontend đã gửi ahamoveOrderId thì dùng lại, không tạo mới.
    //    v3 body: service_id (string), path[pickup+drop], items[], payment_method,
    //    order_time (0 = immediate), requests (top-level array if any).
    //    Response: { order_id, status, shared_link, order: { total_fee, ... } }.
    let ahamoveOrderId = frontendAhamoveOrderId || '';
    let shippingFee = Number(frontendShippingFee) || 0;
    let sharedLinkFromAhamove = '';
    let bookingStatus = 'confirmed';
    if (paymentMode === 'customer') {
      // Customer pickup: không gọi Ahamove. Đơn xác nhận ngay, phí ship = 0.
      ahamoveOrderId = '';
      shippingFee = 0;
      sharedLinkFromAhamove = '';
      bookingStatus = 'confirmed';
    } else if (!ahamoveOrderId) {
      try {
        const ahBody = {
          service_id: process.env.AHAMOVE_SERVICE_ID || 'HAN-BIKE',
          order_time: 0,
          payment_method: 'CASH',
          path: [
            {
              name: restaurantId || 'Restaurant',
              mobile: cusPhone,
              address: pickupAddress || '',
              lat: 0,
              lng: 0,
            },
            {
              mobile: cusPhone,
              name: cusName || 'Khách hàng',
              address: cusAddress,
              lat: 0,
              lng: 0,
            },
          ],
          items: items.map((it) => ({
            _id: it.itemId,
            num: Number(it.quantity) || 1,
            name: it.name,
            price: Number(it.price) || 0,
          })),
        };
        const ah = await ahamove.createOrder(ahBody);
        ahamoveOrderId = ah.order_id || '';
        sharedLinkFromAhamove = ah.shared_link || '';
        bookingStatus = ahamove.mapAhamoveStatus(ah.status) || 'confirmed';
        // v3: shippingFee from response.order.total_fee (NOT raw.total_fee/fee).
        shippingFee = Number(ah.order?.total_fee ?? 0);
        if (!ahamoveOrderId) {
          return res.status(502).json({ ok: false, error: 'Ahamove create failed: missing order_id' });
        }
      } catch (e) {
        const ahDetail = e.response&&e.response.data ? JSON.stringify(e.response.data) : e.message; console.error('[create] Ahamove createOrder failed:', ahDetail);
        return res.status(502).json({ ok: false, error: `Ahamove create failed: ${ahDetail}` });
      }
    }

    // paymentMode='customer': QR chỉ chứa tiền hàng (shippingFee=0).
    // paymentMode='driver': QR chứa itemsTotal + shippingFee.
    const amount = itemsTotal + shippingFee;

    // KHÔNG tạo QR Tingee ở đây nữa. QR động chỉ được tạo khi khách bấm
    // 'Thanh toán' trên thẻ đơn trong 'Theo dõi đơn' (POST /order/:id/qr).
    // Các field tingee để trống cho tới khi QR được tạo theo yêu cầu.
    const tingeeQrId = '', tingeeQrAccount = '', tingeeBillId = '', tingeeQrCode = '';
    const sharedLink = sharedLinkFromAhamove;

    // 3. Lưu SQLite
    const insertOrder = db.prepare(`
      INSERT INTO orders (order_id, restaurant_id, cus_name, cus_phone, cus_address, cus_tax_code,
        receiver_email, amount, goods_amount, shipping_fee, tax_total,
        ahamove_order_id, tingee_qr_id, tingee_qr_account, tingee_bill_id, tingee_qr_code, shared_link,
        booking_status, payment_status, invoice_status, canister_synced, created_at, updated_at)
      VALUES (@orderId, @restaurantId, @cusName, @cusPhone, @cusAddress, @cusTaxCode,
        @receiverEmail, @amount, @goodsAmount, @shippingFee, @taxTotal,
        @ahamoveOrderId, @tingeeQrId, @tingeeQrAccount, @tingeeBillId, @tingeeQrCode, @sharedLink,
        @bookingStatus, 'unpaid', 'none', 0, @now, @now)
    `);
    insertOrder.run({
      orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
      receiverEmail: receiverEmail || '', amount, goodsAmount, shippingFee, taxTotal,
      ahamoveOrderId, tingeeQrId, tingeeQrAccount, tingeeBillId, tingeeQrCode, sharedLink, bookingStatus, now,
    });
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, item_id, name, price, quantity, unit_name, vat_rate)
      VALUES (@orderId, @itemId, @name, @price, @quantity, @unitName, @vatRate)
    `);
    for (const it of items) {
      insertItem.run({
        orderId, itemId: it.itemId, name: it.name, price: it.price,
        quantity: it.quantity, unitName: it.unitName || '', vatRate: it.vatRate || 8,
      });
    }

    // 3b. Upsert khách hàng vào bảng customers (email là khóa chính).
    //     Chỉ lưu khi có email; cập nhật tên/SĐT nếu khách đã tồn tại.
    if (receiverEmail) {
      db.prepare(`
        INSERT INTO customers (email, name, phone, created_at, updated_at)
        VALUES (@email, @name, @phone, @now, @now)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          updated_at = excluded.updated_at
      `).run({
        email: receiverEmail,
        name: cusName || '',
        phone: cusPhone || '',
        now,
      });
    }

    // 4. Push canister createOrder (HMAC). Nếu fail → retry queue xử lý.
    let canisterOk = true;
    let canisterError = undefined;
    try {
      const result = await canister.createOrder({
        orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
        receiverEmail: receiverEmail || '', items, amount, goodsAmount, shippingFee, taxTotal,
        ahamoveOrderId, tingeeQrId, sharedLink, tingeeQrCode,
      });
      if (result?.ok) {
        db.prepare(`UPDATE orders SET canister_synced = 1, updated_at = ? WHERE order_id = ?`)
          .run(Date.now(), orderId);
      } else {
        canisterOk = false;
        canisterError = String(result?.err || 'canister createOrder returned err');
        console.warn('[create] canister createOrder returned err:', result?.err, '— retry queue sẽ xử lý');
      }
    } catch (e) {
      canisterOk = false;
      canisterError = e.message;
      console.error('[create] canister createOrder error:', e.message, '— retry queue sẽ xử lý');
    }

    // Frontend contract: { orderId, ok, error? }
    // ok=true ngay cả khi canister sync fail (đã lưu DB + retry queue sẽ xử lý).
    // Chỉ trả ok=false nếu order thực sự không tạo được (đã return sớm ở trên).
    res.status(201).json({
      orderId,
      ok: true,
      pendingSync: !canisterOk,
      error: canisterOk ? undefined : `canister sync pending: ${canisterError}`,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
