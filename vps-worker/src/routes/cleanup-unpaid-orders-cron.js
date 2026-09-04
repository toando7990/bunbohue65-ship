// ============================================================
// routes/cleanup-unpaid-orders-cron.js — dọn đơn chưa thanh toán/hết hạn
// của ngày hôm trước trên VPS
// ============================================================
// Chạy 1 lần/ngày lúc 00:30 (giờ hệ thống VPS — GIẢ ĐỊNH đã đặt múi giờ
// VN, cùng quy ước sales-bonus-cron.js/km-notify-cron.js): XOÁ VĨNH VIỄN
// mọi đơn có payment_status IN ('unpaid', 'expired') mà created_at thuộc
// TRỌN NGÀY HÔM TRƯỚC (00:00 -> 23:59:59.999, giờ hệ thống VPS).
//
// PHẠM VI: chỉ VPS SQLite. Canister ĐÃ TỰ ĐỘNG dọn mọi đơn (kể cả đã
// thanh toán) từ ngày hôm trước qua pruneOldOrders() (xem
// src/backend/lib/core.mo, gọi mỗi khi có thao tác đơn hàng — "VPS keeps
// full history and only syncs the current day"). VPS chủ đích giữ lại
// TOÀN BỘ lịch sử để phục vụ "Lịch sử đặt đơn"/kế toán — job này CHỈ dọn
// riêng phần đơn CHƯA TỪNG THANH TOÁN THÀNH CÔNG (không còn giá trị lịch
// sử/kế toán). Đơn ĐÃ thanh toán (payment_status = 'paid'/'refunded')
// KHÔNG BAO GIỜ bị đụng tới, giữ lại vĩnh viễn như thiết kế ban đầu.
//
// Đã xác nhận với người dùng (không cần hỏi lại):
// 1. Gộp cả 'expired' (QR hết hạn chưa thanh toán — xem lib/sync.js
//    startUnpaidExpiry, tự động chuyển unpaid -> expired khi QR hết hạn)
//    vào phạm vi xoá, không chỉ đúng 'unpaid'.
// 2. Xoá luôn log liên quan (ahamove_logs/tingee_logs/bkav_logs) — 3 bảng
//    này KHÔNG có ON DELETE CASCADE tự động (chỉ order_items có, qua
//    PRAGMA foreign_keys = ON đã bật ở db.js), nên phải tự xoá thủ công
//    để tránh log mồ côi trỏ tới đơn không còn tồn tại.
// 3. KHÔNG cần sao lưu trước khi xoá — job này chạy TRƯỚC cron backup
//    (0 3 * * *, index.js), người dùng đã xác nhận chấp nhận bản backup
//    gần nhất sẽ không có các đơn đã xoá.

const cron = require('node-cron');
const shutdown = require('./../lib/shutdown');

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Trọn ngày hôm trước (giờ hệ thống VPS): [start, endExclusive).
function yesterdayRange(now) {
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  return { start: yesterdayStart.getTime(), endExclusive: todayStart.getTime() };
}

// Tách riêng logic khỏi cron.schedule để test được độc lập (truyền `now`
// giả lập, không phụ thuộc đồng hồ hệ thống lúc chạy test).
function runCleanup(db, now) {
  const { start, endExclusive } = yesterdayRange(now);
  const rows = db
    .prepare(
      `SELECT order_id FROM orders
       WHERE payment_status IN ('unpaid', 'expired')
         AND created_at >= ? AND created_at < ?`,
    )
    .all(start, endExclusive);

  if (rows.length === 0) {
    console.log(
      '[cleanup-unpaid-orders-cron] Không có đơn chưa thanh toán/hết hạn nào của ngày hôm trước cần dọn.',
    );
    return { deletedCount: 0, orderIds: [] };
  }

  const orderIds = rows.map((r) => r.order_id);
  const deleteAhamove = db.prepare('DELETE FROM ahamove_logs WHERE order_id = ?');
  const deleteTingee = db.prepare('DELETE FROM tingee_logs WHERE order_id = ?');
  const deleteBkav = db.prepare('DELETE FROM bkav_logs WHERE order_id = ?');
  const deleteOrder = db.prepare('DELETE FROM orders WHERE order_id = ?');
  // order_items tự động xoá theo (ON DELETE CASCADE + PRAGMA foreign_keys
  // = ON, đã bật sẵn ở db.js) — không cần câu lệnh riêng.

  const runAll = db.transaction((ids) => {
    for (const id of ids) {
      deleteAhamove.run(id);
      deleteTingee.run(id);
      deleteBkav.run(id);
      deleteOrder.run(id);
    }
  });
  runAll(orderIds);

  console.log(
    `[cleanup-unpaid-orders-cron] Đã xoá ${orderIds.length} đơn chưa thanh toán/hết hạn của ngày hôm trước:`,
    orderIds.join(', '),
  );
  return { deletedCount: orderIds.length, orderIds };
}

function startCleanupUnpaidOrdersCron(db) {
  const task = cron.schedule('30 0 * * *', () => {
    if (shutdown.shuttingDown) return;
    try {
      runCleanup(db, new Date());
    } catch (e) {
      console.error('[cleanup-unpaid-orders-cron] fatal:', e.message);
    }
  });

  return {
    stop() {
      task.stop();
    },
  };
}

module.exports = { startCleanupUnpaidOrdersCron, runCleanup, yesterdayRange };
