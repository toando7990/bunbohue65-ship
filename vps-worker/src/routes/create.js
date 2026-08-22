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
const canister = require('../lib/canister');
const { generatePickupCode } = require('../lib/pickup-code');
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
    // Mã 6 ký tự khách xem trong "Theo dõi đơn" và tự báo cho tài xế —
    // xem lib/pickup-code.js. Sinh 1 lần lúc tạo đơn, không đổi sau đó.
    const pickupCode = generatePickupCode();

    // Validate required fields.
    if (!restaurantId || !cusName || !cusPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Tính tiền (frontend gửi price + vatRate trong items)
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    // Khách tự đặt tài xế bằng app ngoài → không tạo đơn Ahamove, không cộng phí ship.
    const goodsAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    const taxTotal = 0;

    // Không tạo đơn Ahamove (khách tự đặt tài xế bằng app ngoài, trả phí trực tiếp bên ngoài).
    const ahamoveOrderId = frontendAhamoveOrderId || '';
    const shippingFee = 0;
    const sharedLinkFromAhamove = '';
    const bookingStatus = 'confirmed';

    // QR chỉ chứa tiền hàng (đã gồm VAT, không phí ship).
    const amount = goodsAmount;

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
        pickup_code, booking_status, payment_status, invoice_status, canister_synced, created_at, updated_at)
      VALUES (@orderId, @restaurantId, @cusName, @cusPhone, @cusAddress, @cusTaxCode,
        @receiverEmail, @amount, @goodsAmount, @shippingFee, @taxTotal,
        @ahamoveOrderId, @tingeeQrId, @tingeeQrAccount, @tingeeBillId, @tingeeQrCode, @sharedLink,
        @pickupCode, @bookingStatus, 'unpaid', 'none', 0, @now, @now)
    `);
    insertOrder.run({
      orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
      receiverEmail: receiverEmail || '', amount, goodsAmount, shippingFee, taxTotal,
      ahamoveOrderId, tingeeQrId, tingeeQrAccount, tingeeBillId, tingeeQrCode, sharedLink,
      pickupCode, bookingStatus, now,
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
        ahamoveOrderId, tingeeQrId, sharedLink, tingeeQrCode, pickupCode,
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
