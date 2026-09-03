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
// 1. Lưu SQLite (orders + order_items) — khách tự đặt tài xế qua app ngoài,
//    không tạo đơn AhaMove (đã gỡ hoàn toàn — xem lib/canister.js, webhooks.js).
// 2. Push canister createOrder (HMAC). Nếu fail → retry queue (sync.js).
// ============================================================

const express = require('express');
const crypto = require('crypto');
const canister = require('../lib/canister');
const { generatePickupCode } = require('../lib/pickup-code');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const VAT_RATE = 0.08;

// Rate-limit: 30 req/phút/IP — CHỈ áp dụng cho route tạo đơn cụ thể
// (KHÔNG dùng router.use() không path — mount chung tại '/' cùng các
// router khác nên sẽ vô tình tính luôn MỌI request khác đi qua trước khi
// tới đúng route của chúng, gây lỗi rate-limit sai chỗ toàn hệ thống —
// đã tự phát hiện + sửa lỗi này).
router.use('/order/create', rateLimit({ windowMs: 60000, max: 30, message: 'Too many create requests' }));

// POST /order/create
router.post('/order/create', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const {
      restaurantId, pickupAddress, cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail,
      items, shippingFee: frontendShippingFee, ahamoveOrderId: frontendAhamoveOrderId,
      voucherCode,
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

    // Áp dụng KM (Hệ 1 — theo khung giờ) nếu có email — canister tự kiểm
    // tra: đang đúng khung giờ + email đã xác thực OTP + còn hạn mức (tổng
    // đơn/ngày, đơn/ngày/khách). Bất kỳ điều kiện nào không đạt → #err,
    // KHÔNG chặn tạo đơn — chỉ đơn giản là không có KM (theo quyết định đã
    // chốt). goodsAmount ở đây CHƯA trừ KM — dùng làm "tổng tiền đơn" để
    // canister so khớp mức chiết khấu (đã gồm VAT, đúng số khách nhìn thấy
    // lúc đặt món).
    let kmProgramCode = '';
    let kmDiscountAmount = 0;
    if (receiverEmail) {
      try {
        const kmResult = await canister.applyPromotion(receiverEmail, goodsAmount);
        if (kmResult?.ok) {
          kmProgramCode = kmResult.ok.promotionCode;
          kmDiscountAmount = Number(kmResult.ok.discountAmount);
        }
        // #err (không có KM đang chạy, chưa xác thực, đạt giới hạn...) —
        // bỏ qua, không log lỗi (đây là trường hợp bình thường, không phải
        // sự cố — hầu hết đơn sẽ #err vì không phải lúc nào cũng có KM).
      } catch (e) {
        console.warn('[create] applyPromotion lỗi (bỏ qua, tạo đơn không KM):', e.message);
      }
    }

    // Tổng tiền đơn thanh toán = Tổng tiền đơn - số tiền chiết khấu (theo
    // đúng công thức người dùng yêu cầu). kmDiscountAmount=0 nếu không có
    // KM → amount = goodsAmount như cũ, không đổi hành vi hiện tại.
    const amountAfterDiscount = goodsAmount - kmDiscountAmount;

    // Áp dụng phiếu giảm giá (Giai đoạn 3e) nếu khách chọn — ÁP SAU KM Hệ
    // 1 (orderAmount truyền vào là amountAfterDiscount, PHẦN CÒN LẠI sau
    // KM, không phải goodsAmount gốc). 2 loại chiết khấu CỘNG DỒN, không
    // giới hạn chỉ 1 loại (đúng quyết định đã chốt). Canister tự kiểm tra:
    // phiếu tồn tại, đúng email, chưa dùng, còn hạn — #err (bất kỳ lý do
    // gì) → KHÔNG chặn tạo đơn, chỉ đơn giản không áp dụng phiếu.
    let voucherCodeApplied = '';
    let voucherDiscountAmount = 0;
    if (voucherCode && receiverEmail) {
      try {
        const voucherResult = await canister.applyVoucher(receiverEmail, voucherCode, amountAfterDiscount);
        if (voucherResult?.ok !== undefined) {
          voucherCodeApplied = voucherCode;
          voucherDiscountAmount = Number(voucherResult.ok);
        }
      } catch (e) {
        console.warn('[create] applyVoucher lỗi (bỏ qua, tạo đơn không phiếu):', e.message);
      }
    }
    const amountAfterVoucher = amountAfterDiscount - voucherDiscountAmount;

    // Không tạo đơn Ahamove (khách tự đặt tài xế bằng app ngoài, trả phí trực tiếp bên ngoài).
    const ahamoveOrderId = frontendAhamoveOrderId || '';
    const shippingFee = 0;
    const sharedLinkFromAhamove = '';
    const bookingStatus = 'confirmed';

    // QR chỉ chứa tiền hàng (đã gồm VAT, không phí ship), ĐÃ TRỪ cả 2 loại
    // chiết khấu (KM Hệ 1 + phiếu, nếu có) — đây là số tiền khách thực sự
    // phải trả.
    const amount = amountAfterVoucher;

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
        pickup_code, km_program_code, km_discount_amount, voucher_code, voucher_discount_amount,
        booking_status, payment_status, invoice_status, canister_synced, created_at, updated_at)
      VALUES (@orderId, @restaurantId, @cusName, @cusPhone, @cusAddress, @cusTaxCode,
        @receiverEmail, @amount, @goodsAmount, @shippingFee, @taxTotal,
        @ahamoveOrderId, @tingeeQrId, @tingeeQrAccount, @tingeeBillId, @tingeeQrCode, @sharedLink,
        @pickupCode, @kmProgramCode, @kmDiscountAmount, @voucherCodeApplied, @voucherDiscountAmount,
        @bookingStatus, 'unpaid', 'none', 0, @now, @now)
    `);
    insertOrder.run({
      orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
      receiverEmail: receiverEmail || '', amount, goodsAmount, shippingFee, taxTotal,
      ahamoveOrderId, tingeeQrId, tingeeQrAccount, tingeeBillId, tingeeQrCode, sharedLink,
      pickupCode, kmProgramCode, kmDiscountAmount, voucherCodeApplied, voucherDiscountAmount, bookingStatus, now,
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
        kmDiscountAmount, voucherDiscountAmount,
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
