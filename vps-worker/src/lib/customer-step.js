// ============================================================
// lib/customer-step.js — Khách tự chọn "Đặt tài xế" / "Huỷ đơn"
// ============================================================
// Đơn đặt món từ xa (giao tận nơi, có toạ độ khách, không phải đơn quầy)
// KHÔNG còn tự gọi tài xế ngay khi tạo. Luồng mới:
//
//   tạo đơn → customer_step='awaiting', booking_status='pending'
//             (canister #pending → /driver KHÔNG hiện đơn trong hàng đợi
//             thanh toán, xem frontend hooks/usePendingOrders.ts)
//   ├─ khách bấm "Đặt tài xế"  → 'dispatched', #confirmed, gọi
//   │                            delivery.dispatch() như trước
//   ├─ khách bấm "Huỷ đơn"     → 'cancelled', #cancelled
//   └─ quá STEP_WINDOW_MS      → 'expired',   #cancelled (tick 30s)
//
// Sau khi đã đặt tài xế, khách vẫn huỷ được khi CHƯA có tài xế nhận đơn
// (lượt giao đang 'finding' hoặc đặt thất bại). Huỷ chuyến bên hãng do
// delivery.cancelForCancelledOrders() làm ở nhịp tick kế tiếp — cùng cơ
// chế đã dùng cho đơn bị huỷ ở nơi khác.
//
// Đơn cũ (customer_step='') và đơn quầy KHÔNG bị ảnh hưởng.

const canister = require('./canister');
const delivery = require('./delivery');

const STEP_WINDOW_MS = 10 * 60 * 1000; // 10 phút chờ khách bấm "Đặt tài xế"
const EXPIRED_REASON = 'Quá 10 phút chưa đặt tài xế';

const deps = {
  canister,
  delivery,
  now: () => Date.now(),
};

function getOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
}

// Lượt giao hiện tại đã có tài xế nhận chưa? (finding/đặt lỗi = chưa)
function driverAssigned(db, orderId) {
  const active = db.prepare(
    'SELECT unified FROM deliveries WHERE order_id = ? AND ended = 0 ORDER BY id DESC',
  ).get(orderId);
  return !!active && active.unified !== 'finding';
}

// Đẩy trạng thái #pending lên canister ngay sau createOrder. Lỗi → tick
// thử lại (syncPendingToCanister). KHÔNG throw.
async function pushPending(orderId) {
  try {
    const r = await deps.canister.updateStatus(orderId, 'pending');
    if (r && r.err !== undefined) {
      console.warn('[customer-step] canister updateStatus pending err:', orderId, r.err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[customer-step] canister updateStatus pending lỗi:', orderId, e.message);
    return false;
  }
}

// Gọi ngay khi tạo đơn giao tận nơi.
function markAwaiting(db, orderId) {
  const now = deps.now();
  db.prepare(
    `UPDATE orders SET customer_step = 'awaiting', step_deadline = ?, booking_status = 'pending', updated_at = ?
     WHERE order_id = ?`,
  ).run(now + STEP_WINDOW_MS, now, orderId);
  return now + STEP_WINDOW_MS;
}

// Trạng thái công khai cho trang "Theo dõi đơn".
function publicState(db, orderId) {
  const o = getOrder(db, orderId);
  if (!o) return null;
  const step = o.customer_step || '';
  const assigned = driverAssigned(db, orderId);
  const canCancel = o.payment_status === 'unpaid'
    && o.booking_status !== 'cancelled'
    && (step === 'awaiting' || (step === 'dispatched' && !assigned));
  return {
    step,
    deadline: o.step_deadline || null,
    serverNow: deps.now(),
    canDispatch: step === 'awaiting' && deps.now() < (o.step_deadline || 0),
    canCancel,
    cancelReason: o.cancel_reason || '',
    cancelledAt: ['cancelled', 'expired'].includes(step) ? o.updated_at : null,
  };
}

async function cancelOnCanister(orderId) {
  try {
    const r = await deps.canister.cancelOrder(orderId);
    if (r && r.err !== undefined) {
      // "Order not found": canister chưa có đơn (retry queue sẽ tạo rồi
      // huỷ ngay, xem syncPendingToCanister) — không phải lỗi.
      console.warn('[customer-step] canister cancelOrder err:', orderId, r.err);
    }
  } catch (e) {
    console.warn('[customer-step] canister cancelOrder lỗi:', orderId, e.message);
  }
}

// Khách bấm "Đặt tài xế".
async function requestDispatch(db, orderId) {
  const o = getOrder(db, orderId);
  if (!o) return { ok: false, status: 404, error: 'Không tìm thấy đơn' };
  if (o.customer_step === 'dispatched') return { ok: true, already: true };
  if (o.customer_step !== 'awaiting') {
    return { ok: false, status: 400, error: 'Đơn đã huỷ, không đặt tài xế được' };
  }
  if (deps.now() >= (o.step_deadline || 0)) {
    await expireOrder(db, o);
    return { ok: false, status: 400, error: 'Đơn đã quá 10 phút và đã tự huỷ' };
  }
  const now = deps.now();
  // Chuyển trạng thái trước (chống bấm 2 lần / tick tự huỷ chen ngang).
  const changed = db.prepare(
    `UPDATE orders SET customer_step = 'dispatched', dispatched_at = ?, booking_status = 'confirmed', updated_at = ?
     WHERE order_id = ? AND customer_step = 'awaiting'`,
  ).run(now, now, orderId).changes;
  if (!changed) return { ok: true, already: true };

  // #confirmed trên canister → đơn vào hàng đợi thanh toán /driver.
  try {
    const r = await deps.canister.updateStatus(orderId, 'confirmed');
    if (r && r.err !== undefined) console.warn('[customer-step] canister confirmed err:', orderId, r.err);
  } catch (e) {
    console.warn('[customer-step] canister confirmed lỗi:', orderId, e.message);
  }
  // Đặt tài xế nền; lỗi → delivery.retryUndispatched thử lại (mốc dispatched_at).
  setImmediate(() => {
    deps.delivery.dispatch(db, orderId).then((r) => {
      if (!r.ok) console.warn('[customer-step] chưa đặt được tài xế:', orderId, r.error);
    }).catch(() => {});
  });
  return { ok: true };
}

// Khách bấm "Huỷ đơn".
async function cancelByCustomer(db, orderId, reason) {
  const o = getOrder(db, orderId);
  if (!o) return { ok: false, status: 404, error: 'Không tìm thấy đơn' };
  const state = publicState(db, orderId);
  if (o.customer_step === 'cancelled' || o.customer_step === 'expired') return { ok: true, already: true };
  if (!state.canCancel) {
    return {
      ok: false,
      status: 400,
      error: o.payment_status !== 'unpaid'
        ? 'Đơn đã thanh toán, không huỷ được'
        : 'Tài xế đã nhận đơn, không huỷ được nữa',
    };
  }
  const now = deps.now();
  const text = String(reason || '').trim().slice(0, 120) || 'Khách huỷ đơn';
  db.prepare(
    `UPDATE orders SET customer_step = 'cancelled', booking_status = 'cancelled', cancel_reason = ?, updated_at = ?
     WHERE order_id = ?`,
  ).run(text, now, orderId);
  await cancelOnCanister(orderId);
  return { ok: true };
}

async function expireOrder(db, o) {
  const now = deps.now();
  const changed = db.prepare(
    `UPDATE orders SET customer_step = 'expired', booking_status = 'cancelled', cancel_reason = ?, updated_at = ?
     WHERE order_id = ? AND customer_step = 'awaiting'`,
  ).run(EXPIRED_REASON, now, o.order_id).changes;
  if (changed) {
    console.log('[customer-step] tự huỷ đơn quá hạn:', o.order_id);
    await cancelOnCanister(o.order_id);
  }
}

// tick 30s: tự huỷ đơn quá 10 phút chưa đặt tài xế.
async function tick(db) {
  const rows = db.prepare(
    `SELECT * FROM orders WHERE customer_step = 'awaiting' AND step_deadline IS NOT NULL AND step_deadline <= ?`,
  ).all(deps.now());
  for (const o of rows) await expireOrder(db, o);
}

// Retry queue vừa tạo được đơn trên canister (createOrder mặc định
// #confirmed) → đưa về đúng trạng thái của bước khách đang ở.
async function syncAfterCanisterCreate(db, orderId) {
  const o = getOrder(db, orderId);
  if (!o) return;
  if (o.customer_step === 'awaiting') await pushPending(orderId);
  else if (o.customer_step === 'cancelled' || o.customer_step === 'expired') await cancelOnCanister(orderId);
}

module.exports = {
  deps,
  STEP_WINDOW_MS,
  markAwaiting,
  pushPending,
  publicState,
  requestDispatch,
  cancelByCustomer,
  tick,
  syncAfterCanisterCreate,
};
