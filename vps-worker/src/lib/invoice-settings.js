// ============================================================
// lib/invoice-settings.js — công tắc "Phát hành hoá đơn Bkav tự động"
// ============================================================
// Kế toán bật/tắt trên trang Kế toán (routes/enterprise-actions.js).
//  - BẬT: đơn TẠO SAU lúc bật, khi đã thanh toán, được cron phát hành ngay
//    (~15 giây) — không cần Kế toán bấm. Đơn tạo trước lúc bật vẫn do Kế
//    toán phát hành (người dùng chọn: "chỉ đơn mới"). Lưới an toàn 22:00
//    vẫn chạy.
//  - TẮT (mặc định): KHÔNG có gì tự gửi Bkav — kể cả lưới an toàn 22:00
//    (người dùng chọn "Tắt luôn"). Chỉ đơn Kế toán bấm "Phát hành".
// Lưu ở bảng app_settings, khoá 'invoice_auto', value JSON {enabled, since}.
// ============================================================

const KEY = 'invoice_auto';

function getInvoiceAuto(db) {
  const row = db.prepare('SELECT value, updated_at, updated_by FROM app_settings WHERE key = ?').get(KEY);
  let v = {};
  try {
    v = row ? JSON.parse(row.value) : {};
  } catch {
    v = {};
  }
  const enabled = v.enabled === true;
  return {
    enabled,
    since: enabled && Number.isFinite(v.since) ? v.since : null,
    updatedAt: row ? row.updated_at : null,
    updatedBy: row ? row.updated_by : '',
  };
}

function setInvoiceAuto(db, enabled, deviceId, nowMs) {
  const now = nowMs ?? Date.now();
  const current = getInvoiceAuto(db);
  // Bật lại khi đang bật: giữ mốc 'since' cũ (không bỏ sót đơn ở giữa).
  const since = enabled ? (current.enabled && current.since ? current.since : now) : null;
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(KEY, JSON.stringify({ enabled: !!enabled, since }), now, String(deviceId || ''));
  return getInvoiceAuto(db);
}

// Đánh dấu cần phát hành các đơn đã thanh toán, tạo từ lúc bật công tắc.
// Trả số đơn vừa đánh dấu. Gọi mỗi nhịp cron phát hành (routes/invoice.js).
function requestAutoInvoices(db, nowMs) {
  const s = getInvoiceAuto(db);
  if (!s.enabled || !s.since) return 0;
  const rows = db.prepare(
    `SELECT order_id FROM orders WHERE payment_status = 'paid' AND invoice_status = 'none'
     AND booking_status <> 'cancelled' AND invoice_requested = 0 AND created_at >= ?`,
  ).all(s.since);
  const now = nowMs ?? Date.now();
  for (const r of rows) {
    db.prepare('UPDATE orders SET invoice_requested = 1, updated_at = ? WHERE order_id = ?').run(now, r.order_id);
    db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'AutoRequest', ?, ?)`)
      .run(r.order_id, 'Tự phát hành (công tắc phát hành tự động đang bật)', now);
  }
  return rows.length;
}

module.exports = { getInvoiceAuto, setInvoiceAuto, requestAutoInvoices };
