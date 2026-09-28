// ============================================================
// lib/delivery.js — điều phối tài xế 2 hãng Lalamove + Ahamove
// ============================================================
// Luồng (giao diện đã duyệt 28/09/2026):
//  1. /quote: báo giá các hãng dùng được, chọn hãng theo cài đặt → phí
//     ship hiện cho khách (quoteForCustomer).
//  2. Tạo đơn → dispatch(): báo giá lại (quotation Lalamove hết hạn sau
//     ~5 phút), chọn hãng, đặt tài xế. Hãng đầu lỗi → đặt ngay hãng kia.
//  3. tick() mỗi 30 giây:
//     - làm mới trạng thái lượt đang chạy (dự phòng khi webhook chưa có);
//     - quá failoverMinutes vẫn "Đang tìm tài xế" → huỷ, chuyển hãng kia;
//     - hãng huỷ / hết hạn và bật redispatchOnCancel → đặt hãng kia.
//     Tối đa 2 lượt / đơn (1 lần chuyển). Khách không trả thêm phí.
//  4. Webhook Ahamove (/webhook/ahamove) → làm mới ngay đơn đó.
// Cờ an toàn: chỉ hãng có LALAMOVE_AUTO_DISPATCH=true /
// AHAMOVE_AUTO_DISPATCH=true mới được TỰ ĐẶT tài xế thật (phát sinh phí).
// ============================================================

const canister = require('./canister');
const lalamove = require('./lalamove');
const ahamove = require('./ahamove');
const rules = require('./delivery-rules');

const SETTINGS_KEY = 'delivery';
const RR_KEY = 'delivery_rr';
const WEBHOOK_KEY = 'ahamove_webhook_last';
const QUOTE_TIMEOUT_MS = 8000;
const REFRESH_EVERY_MS = 45 * 1000;

// Bộ chuyển đổi cho test (thay lalamove/ahamove/canister giả).
const deps = { lalamove, ahamove, canister, now: () => Date.now() };

// ---------- Cài đặt ----------
function readSetting(db, key) {
  const row = db.prepare('SELECT value, updated_at, updated_by FROM app_settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by };
  } catch {
    return null;
  }
}
function writeSetting(db, key, value, by) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(key, JSON.stringify(value), deps.now(), String(by || ''));
}

function getSettings(db) {
  const r = readSetting(db, SETTINGS_KEY);
  return rules.sanitizeSettings(r ? r.value : null);
}
function setSettings(db, input, by) {
  const s = rules.sanitizeSettings({ ...getSettings(db), ...(input || {}) });
  writeSetting(db, SETTINGS_KEY, s, by);
  return s;
}

function rrCounter(db) {
  const r = readSetting(db, RR_KEY);
  return r && Number.isFinite(Number(r.value)) ? Number(r.value) : 0;
}
function bumpRr(db) {
  writeSetting(db, RR_KEY, rrCounter(db) + 1, 'system');
}

function client(p) {
  return p === 'lalamove' ? deps.lalamove : deps.ahamove;
}
function autoDispatchFlag(p) {
  return process.env[p === 'lalamove' ? 'LALAMOVE_AUTO_DISPATCH' : 'AHAMOVE_AUTO_DISPATCH'] === 'true';
}
function enabledInSettings(settings, p) {
  return p === 'lalamove' ? settings.lalamoveEnabled : settings.ahamoveEnabled;
}
// Hãng được TỰ ĐẶT tài xế thật.
function dispatchProviders(settings) {
  return rules.PROVIDERS.filter(
    (p) => client(p).isConfigured() && enabledInSettings(settings, p) && autoDispatchFlag(p),
  );
}
// Hãng dùng để báo phí cho khách: hãng tự đặt được; nếu chưa bật tự đặt
// hãng nào thì mọi hãng đủ khoá + đang bật (giữ hành vi cũ: vẫn báo phí
// Lalamove khi LALAMOVE_AUTO_DISPATCH tắt).
function quoteProviders(settings) {
  const d = dispatchProviders(settings);
  if (d.length > 0) return d;
  return rules.PROVIDERS.filter((p) => client(p).isConfigured() && enabledInSettings(settings, p));
}

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} quá ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

// Báo giá song song. stops: { pickup:{lat,lng,address}, drop:{lat,lng,address} }
async function quoteAll(providers, stops) {
  const out = {};
  const errors = {};
  await Promise.all(
    providers.map(async (p) => {
      try {
        if (p === 'lalamove') {
          const q = await withTimeout(
            deps.lalamove.getQuotation({
              pickupLat: stops.pickup.lat,
              pickupLng: stops.pickup.lng,
              pickupAddress: stops.pickup.address,
              dropLat: stops.drop.lat,
              dropLng: stops.drop.lng,
              dropAddress: stops.drop.address,
            }),
            QUOTE_TIMEOUT_MS,
            'Lalamove',
          );
          out.lalamove = q;
        } else {
          out.ahamove = await withTimeout(
            deps.ahamove.estimate({ pickup: stops.pickup, drop: stops.drop }),
            QUOTE_TIMEOUT_MS,
            'Ahamove',
          );
        }
      } catch (e) {
        errors[p] = e.message;
        console.warn(`[delivery] báo giá ${p} lỗi:`, e.message);
      }
    }),
  );
  return { quotes: out, errors };
}

// Phí ship hiện cho khách lúc xem giỏ hàng (không tăng bộ đếm xoay vòng).
async function quoteForCustomer(db, stops) {
  const settings = getSettings(db);
  const providers = quoteProviders(settings);
  if (providers.length === 0) return null;
  const { quotes } = await quoteAll(providers, stops);
  const { order } = rules.chooseProviders(settings, providers, quotes, rrCounter(db));
  if (order.length === 0) return null;
  const provider = order[0];
  return { provider, quote: quotes[provider], quotes };
}

// ---------- Đặt tài xế ----------
const inflight = new Set(); // chống đặt trùng cùng 1 đơn

function hasCoords(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

async function loadContext(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  if (!order) return { error: 'Không tìm thấy đơn' };
  if (['cancelled', 'completed'].includes(order.booking_status)) return { error: `Đơn đã ${order.booking_status}` };
  if (!hasCoords(Number(order.cus_lat), Number(order.cus_lng))) return { error: 'Đơn không có toạ độ khách' };
  const restaurants = await deps.canister.listRestaurants();
  const r = restaurants.find((x) => x.restaurantId === order.restaurant_id);
  if (!r || !hasCoords(Number(r.lat), Number(r.lng))) return { error: 'Nhà hàng chưa có toạ độ' };
  return { order, restaurant: r };
}

function remarksFor(order) {
  const qrLine = process.env.VPS_PUBLIC_URL
    ? `\nQR nhận hàng (bấm link):\n${process.env.VPS_PUBLIC_URL.replace(/\/+$/, '')}/q/${order.order_id}\n`
    : '';
  // Mã nhận hàng ĐẦU TIÊN, in hoa, 1 dòng riêng — tài xế đọc cho nhân
  // viên, và "Quét màn hình tài xế" ở /driver đọc chữ trúng hơn.
  return `MÃ NHẬN HÀNG: ${order.pickup_code}\nĐơn ${order.order_id}${qrLine}`;
}

async function placeWith(provider, ctx, quote) {
  const { order, restaurant } = ctx;
  const remarks = remarksFor(order);
  if (provider === 'lalamove') {
    const placed = await deps.lalamove.placeOrder({
      quotationId: quote.quotationId,
      pickupStopId: quote.pickupStopId,
      dropStopId: quote.dropStopId,
      senderName: restaurant.name || 'Nhà hàng',
      senderPhone: restaurant.phone || '',
      recipientName: order.cus_name,
      recipientPhone: order.cus_phone,
      recipientRemarks: remarks,
    });
    return {
      externalId: placed.lalamoveOrderId,
      rawStatus: placed.status || 'ASSIGNING_DRIVER',
      driverId: placed.driverId || '',
      shareLink: placed.shareLink || '',
      fee: quote.feeVnd,
    };
  }
  const placed = await deps.ahamove.createOrder({
    pickup: {
      lat: restaurant.lat,
      lng: restaurant.lng,
      address: restaurant.address,
      name: restaurant.name || 'Nhà hàng',
      phone: restaurant.phone || '',
      remarks,
    },
    drop: {
      lat: Number(order.cus_lat),
      lng: Number(order.cus_lng),
      address: order.cus_address,
      name: order.cus_name,
      phone: order.cus_phone,
      remarks: `Đơn ${order.order_id}`,
    },
    remarks,
    trackingNumber: order.order_id,
  });
  return {
    externalId: placed.orderId,
    rawStatus: placed.status || 'ASSIGNING',
    driverId: '',
    shareLink: placed.shareLink || '',
    fee: placed.feeVnd ?? quote.feeVnd,
  };
}

function attemptsOf(db, orderId) {
  return db.prepare('SELECT * FROM deliveries WHERE order_id = ? ORDER BY attempt').all(orderId);
}

function insertAttempt(db, orderId, attempt, provider, data) {
  const now = deps.now();
  const unified = data.unified || rules.unifyStatus(provider, { status: data.rawStatus });
  const info = db.prepare(
    `INSERT INTO deliveries (order_id, attempt, provider, external_id, raw_status, unified, driver_id,
      share_link, fee, reason, end_reason, ended, created_at, updated_at, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    orderId, attempt, provider, data.externalId || '', data.rawStatus || '', unified, data.driverId || '',
    data.shareLink || '', data.fee ?? null, data.reason || '', data.endReason || '', data.ended ? 1 : 0,
    now, now, now,
  );
  if (!data.ended) {
    db.prepare('UPDATE orders SET delivery_provider = ?, delivery_order_id = ?, updated_at = ? WHERE order_id = ?')
      .run(provider, data.externalId || '', now, orderId);
    if (provider === 'lalamove') {
      // Giữ cột cũ cho các chỗ còn đọc lalamove_* (route /lalamove-status).
      db.prepare(
        `UPDATE orders SET lalamove_order_id = ?, lalamove_driver_id = ?, lalamove_share_link = ?,
         lalamove_status = ? WHERE order_id = ?`,
      ).run(data.externalId || '', data.driverId || '', data.shareLink || '', data.rawStatus || '', orderId);
    }
  }
  return info.lastInsertRowid;
}

// dispatch — đặt tài xế cho 1 đơn. opts.exclude: hãng không dùng (vừa
// thất bại); opts.reason: ghi chú lượt mới (hiện cho khách khi chuyển hãng).
// Trả { ok, provider?, error? }. KHÔNG throw.
async function dispatch(db, orderId, opts = {}) {
  if (inflight.has(orderId)) return { ok: false, error: 'Đang đặt tài xế cho đơn này' };
  inflight.add(orderId);
  try {
    const prior = attemptsOf(db, orderId);
    if (prior.some((d) => !d.ended)) return { ok: false, error: 'Đơn đang có tài xế' };
    if (prior.filter((d) => d.unified !== 'place_failed').length >= rules.MAX_ATTEMPTS) {
      return { ok: false, error: 'Đã chuyển hãng 1 lần' };
    }
    const settings = getSettings(db);
    const exclude = new Set(opts.exclude || []);
    const providers = dispatchProviders(settings).filter((p) => !exclude.has(p));
    if (providers.length === 0) return { ok: false, error: 'Không có hãng nào bật tự đặt tài xế' };

    const ctx = await loadContext(db, orderId);
    if (ctx.error) return { ok: false, error: ctx.error };
    const stops = {
      pickup: { lat: Number(ctx.restaurant.lat), lng: Number(ctx.restaurant.lng), address: ctx.restaurant.address },
      drop: { lat: Number(ctx.order.cus_lat), lng: Number(ctx.order.cus_lng), address: ctx.order.cus_address },
    };
    const { quotes, errors } = await quoteAll(providers, stops);
    const { order: plan, usedRoundRobin } = rules.chooseProviders(settings, providers, quotes, rrCounter(db));
    if (usedRoundRobin) bumpRr(db);
    if (plan.length === 0) {
      const msg = Object.entries(errors).map(([p, e]) => `${rules.PROVIDER_NAMES[p]}: ${e}`).join('; ');
      return { ok: false, error: `Không báo giá được (${msg || 'không rõ'})` };
    }

    let attempt = prior.length;
    let reason = opts.reason || '';
    for (const p of plan) {
      attempt += 1;
      try {
        const placed = await placeWith(p, ctx, quotes[p]);
        insertAttempt(db, orderId, attempt, p, { ...placed, reason });
        console.log(`[delivery] ${orderId}: đặt ${p} thành công → ${placed.externalId}`);
        return { ok: true, provider: p };
      } catch (e) {
        console.error(`[delivery] ${orderId}: đặt ${p} lỗi:`, e.message);
        insertAttempt(db, orderId, attempt, p, {
          unified: 'place_failed', reason, endReason: e.message.slice(0, 300), ended: true, fee: quotes[p]?.feeVnd,
        });
        reason = `${rules.PROVIDER_NAMES[p]} không đặt được tài xế — đã chuyển sang hãng khác`;
      }
    }
    return { ok: false, error: 'Không đặt được tài xế ở hãng nào' };
  } catch (e) {
    console.error('[delivery] dispatch lỗi', orderId, e.message);
    return { ok: false, error: e.message };
  } finally {
    inflight.delete(orderId);
  }
}

// ---------- Cập nhật trạng thái ----------
function applyUpdate(db, row, info) {
  const now = deps.now();
  const unified = rules.unifyStatus(row.provider, info);
  const set = {
    raw_status: info.status || row.raw_status,
    sub_status: info.subStatus ?? row.sub_status,
    drop_status: info.dropStatus ?? row.drop_status,
    unified,
    driver_id: info.driverId || row.driver_id,
    driver_name: info.driverName || row.driver_name,
    driver_phone: info.driverPhone || row.driver_phone,
    driver_plate: info.driverPlate || row.driver_plate,
    share_link: info.shareLink || row.share_link,
    assigned_at: row.assigned_at ?? (['to_pickup', 'at_pickup', 'delivering', 'near_drop', 'delivered'].includes(unified) ? now : null),
    picked_at: row.picked_at ?? (['delivering', 'near_drop', 'delivered'].includes(unified) ? now : null),
    completed_at: row.completed_at ?? (unified === 'delivered' ? now : null),
    ended: rules.TERMINAL.has(unified) ? 1 : row.ended,
    end_reason: rules.TERMINAL.has(unified) && !row.end_reason ? (info.cancelComment || rules.UNIFIED_LABELS[unified]) : row.end_reason,
  };
  db.prepare(
    `UPDATE deliveries SET raw_status=@raw_status, sub_status=@sub_status, drop_status=@drop_status,
      unified=@unified, driver_id=@driver_id, driver_name=@driver_name, driver_phone=@driver_phone,
      driver_plate=@driver_plate, share_link=@share_link, assigned_at=@assigned_at, picked_at=@picked_at,
      completed_at=@completed_at, ended=@ended, end_reason=@end_reason, updated_at=@now, refreshed_at=@now
     WHERE id=@id`,
  ).run({ ...set, now, id: row.id });
  if (row.provider === 'lalamove') {
    db.prepare(
      `UPDATE orders SET lalamove_status = ?, lalamove_driver_id = ?, lalamove_share_link = ? WHERE order_id = ? AND lalamove_order_id = ?`,
    ).run(set.raw_status, set.driver_id, set.share_link, row.order_id, row.external_id);
  }
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(row.id);
}

async function fetchInfo(row) {
  if (row.provider === 'lalamove') {
    const d = await deps.lalamove.getOrderDetails(row.external_id);
    const info = { status: d.status, driverId: d.driverId, shareLink: d.shareLink };
    // Lấy tên/SĐT/biển số tài xế 1 lần khi vừa có tài xế.
    if (d.driverId && (!row.driver_name || d.driverId !== row.driver_id)) {
      try {
        const drv = await deps.lalamove.getDriver(row.external_id, d.driverId);
        info.driverName = drv.name;
        info.driverPhone = drv.phone;
        info.driverPlate = drv.plate;
      } catch (e) {
        console.warn('[delivery] lalamove getDriver lỗi', row.external_id, e.message);
      }
    }
    return info;
  }
  return deps.ahamove.getOrder(row.external_id);
}

// Làm mới 1 lượt đang chạy; nếu hãng huỷ → xử lý chuyển hãng.
async function refreshRow(db, row) {
  let updated;
  try {
    updated = applyUpdate(db, row, await fetchInfo(row));
  } catch (e) {
    db.prepare('UPDATE deliveries SET refreshed_at = ? WHERE id = ?').run(deps.now(), row.id);
    console.warn('[delivery] làm mới lỗi', row.provider, row.external_id, e.message);
    return row;
  }
  if (!row.ended && updated.ended && updated.unified === 'cancelled') {
    const settings = getSettings(db);
    if (settings.redispatchOnCancel) {
      await dispatch(db, row.order_id, {
        exclude: [row.provider],
        reason: `${rules.PROVIDER_NAMES[row.provider]} huỷ / không tìm được tài xế — đã tự chuyển sang hãng khác`,
      });
    }
  }
  return updated;
}

// tick — gọi mỗi 30 giây.
async function tick(db) {
  const now = deps.now();
  const settings = getSettings(db);
  const rows = db.prepare(
    `SELECT d.* FROM deliveries d JOIN orders o ON o.order_id = d.order_id
     WHERE d.ended = 0 AND o.booking_status NOT IN ('cancelled')`,
  ).all();
  for (const row of rows) {
    let cur = row;
    if (now - (row.refreshed_at || 0) >= REFRESH_EVERY_MS) cur = await refreshRow(db, row);
    if (cur.ended) continue;
    const waitedMs = now - cur.created_at;
    if (cur.unified === 'finding' && waitedMs >= settings.failoverMinutes * 60 * 1000) {
      const others = dispatchProviders(settings).filter((p) => p !== cur.provider);
      const used = attemptsOf(db, cur.order_id).filter((d) => d.unified !== 'place_failed').length;
      if (others.length === 0 || used >= rules.MAX_ATTEMPTS) continue; // không có hãng để chuyển
      try {
        await client(cur.provider).cancelOrder(cur.external_id, 'Không có tài xế nhận đơn');
      } catch (e) {
        // Huỷ lỗi (VD tài xế vừa nhận) → làm mới lại, không chuyển.
        console.warn('[delivery] huỷ để chuyển hãng lỗi', cur.external_id, e.message);
        await refreshRow(db, { ...cur, refreshed_at: 0 });
        continue;
      }
      db.prepare(`UPDATE deliveries SET ended = 1, unified = 'cancelled', end_reason = ?, updated_at = ? WHERE id = ?`)
        .run(`Chưa có tài xế sau ${settings.failoverMinutes} phút`, deps.now(), cur.id);
      await dispatch(db, cur.order_id, {
        exclude: [cur.provider],
        reason: `${rules.PROVIDER_NAMES[cur.provider]} chưa có tài xế sau ${settings.failoverMinutes} phút — đã tự chuyển sang hãng khác`,
      });
    }
  }
}

// Webhook Ahamove → làm mới ngay (không tin dữ liệu gửi tới, đọc lại qua API).
async function onAhamoveWebhook(db, body) {
  const raw = String((body && (body._id || body.order_id)) || '').trim();
  if (!raw) return { ok: false, error: 'Thiếu _id' };
  // Đơn nhiều điểm giao: _id dạng "<mã đơn>-<số điểm>".
  const base = raw.replace(/-\d+$/, '');
  const row = db.prepare(
    `SELECT * FROM deliveries WHERE provider = 'ahamove' AND external_id IN (?, ?) ORDER BY id DESC`,
  ).get(raw, base);
  if (!row) return { ok: false, error: 'Không có đơn' };
  // Ghi nhận webhook đã hoạt động (chỉ khi đúng đơn của mình).
  writeSetting(db, WEBHOOK_KEY, deps.now(), 'ahamove');
  if (row.ended) return { ok: true, ignored: true };
  await refreshRow(db, row);
  return { ok: true };
}

// ---------- Đọc cho giao diện ----------
function publicStatus(db, orderId) {
  const rows = attemptsOf(db, orderId);
  if (rows.length === 0) return null;
  const placed = rows.filter((r) => r.unified !== 'place_failed');
  const current = [...placed].reverse().find((r) => !r.ended) || placed[placed.length - 1] || null;
  let switched = null;
  if (current && current.reason) {
    const idx = rows.findIndex((r) => r.id === current.id);
    const prev = idx > 0 ? rows[idx - 1] : null;
    switched = {
      from: prev ? prev.provider : '',
      fromName: prev ? rules.PROVIDER_NAMES[prev.provider] : '',
      // "…đã tự chuyển sang hãng khác" → nêu đúng tên hãng đang giao.
      reason: current.reason.replace('hãng khác', rules.PROVIDER_NAMES[current.provider]),
      at: current.created_at,
    };
  }
  if (!current) {
    return {
      provider: '',
      providerName: '',
      status: 'place_failed',
      statusLabel: rules.UNIFIED_LABELS.place_failed,
      step: -1,
      allFailed: true,
      attempts: rows.length,
    };
  }
  const settings = getSettings(db);
  const canSwitchMore = placed.length < rules.MAX_ATTEMPTS && dispatchProviders(settings).some((p) => p !== current.provider);
  const allFailed =
    ['cancelled', 'failed'].includes(current.unified) && !(current.unified === 'cancelled' && canSwitchMore && settings.redispatchOnCancel);
  return {
    provider: current.provider,
    providerName: rules.PROVIDER_NAMES[current.provider],
    externalId: current.external_id,
    status: current.unified,
    statusLabel: rules.UNIFIED_LABELS[current.unified] || current.unified,
    rawStatus: current.raw_status,
    step: rules.stepIndex(current.unified),
    driver: current.driver_name || current.driver_phone || current.driver_plate
      ? { name: current.driver_name, phone: current.driver_phone, plate: current.driver_plate }
      : null,
    shareLink: current.share_link,
    times: {
      createdAt: current.created_at,
      assignedAt: current.assigned_at,
      pickedAt: current.picked_at,
      completedAt: current.completed_at,
    },
    switched,
    allFailed,
    endReason: current.ended ? current.end_reason : '',
    attempts: rows.length,
  };
}

function batchStatus(db, orderIds) {
  const out = {};
  for (const id of orderIds) {
    const s = publicStatus(db, id);
    if (s) out[id] = s;
  }
  return out;
}

function stats(db, days = 7) {
  const since = deps.now() - days * 24 * 60 * 60 * 1000;
  const rows = db.prepare(
    `SELECT provider,
       SUM(CASE WHEN unified <> 'place_failed' THEN 1 ELSE 0 END) AS orders,
       AVG(CASE WHEN unified <> 'place_failed' THEN fee END) AS avg_fee,
       AVG(CASE WHEN assigned_at IS NOT NULL THEN (assigned_at - created_at) END) AS avg_assign_ms,
       SUM(CASE WHEN ended = 1 AND attempt = 1 AND unified IN ('cancelled','place_failed')
             AND EXISTS (SELECT 1 FROM deliveries d2 WHERE d2.order_id = deliveries.order_id AND d2.attempt > 1)
           THEN 1 ELSE 0 END) AS switched_away
     FROM deliveries WHERE created_at >= ? GROUP BY provider`,
  ).all(since);
  return rules.PROVIDERS.map((p) => {
    const r = rows.find((x) => x.provider === p) || {};
    return {
      provider: p,
      orders: Number(r.orders || 0),
      avgFee: r.avg_fee != null ? Math.round(r.avg_fee) : null,
      avgAssignMinutes: r.avg_assign_ms != null ? Math.round((r.avg_assign_ms / 60000) * 10) / 10 : null,
      switchedAway: Number(r.switched_away || 0),
    };
  });
}

async function adminInfo(db) {
  const settings = getSettings(db);
  const aha = await deps.ahamove.checkConnection();
  const hook = readSetting(db, WEBHOOK_KEY);
  const base = (process.env.VPS_PUBLIC_URL || '').replace(/\/+$/, '');
  return {
    settings,
    providers: {
      lalamove: {
        configured: deps.lalamove.isConfigured(),
        env: deps.lalamove.ENV,
        autoDispatch: autoDispatchFlag('lalamove'),
        ok: deps.lalamove.isConfigured(),
        error: deps.lalamove.isConfigured() ? '' : 'Chưa cấu hình LALAMOVE_API_KEY / LALAMOVE_API_SECRET',
      },
      ahamove: {
        configured: deps.ahamove.isConfigured(),
        env: deps.ahamove.ENV,
        autoDispatch: autoDispatchFlag('ahamove'),
        ok: aha.ok,
        error: aha.ok ? '' : aha.error,
        serviceId: deps.ahamove.SERVICE_ID,
      },
    },
    webhook: {
      url: base ? `${base}/webhook/ahamove` : '',
      lastReceivedAt: hook ? Number(hook.value) || null : null,
    },
    stats: stats(db, 7),
  };
}

module.exports = {
  deps,
  getSettings,
  setSettings,
  dispatchProviders,
  quoteProviders,
  quoteAll,
  quoteForCustomer,
  dispatch,
  refreshRow,
  tick,
  onAhamoveWebhook,
  publicStatus,
  batchStatus,
  stats,
  adminInfo,
};
