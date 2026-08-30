// ============================================================
// routes/sales-bonus-cron.js — "Khuyến mại doanh số tuần/tháng" (Giai
// đoạn 3d).
// ============================================================
// 2 cron riêng biệt:
//   - 00:15 thứ Hai hằng tuần (giờ VN): tính tổng doanh số TUẦN TRƯỚC
//     (thứ Hai -> Chủ nhật) của từng khách, gọi issueSalesBonus('weekly').
//   - 00:15 ngày 1 hằng tháng (giờ VN): tính tổng doanh số THÁNG TRƯỚC
//     của từng khách, gọi issueSalesBonus('monthly').
//
// Doanh số = SUM(amount) các đơn payment_status='paid' trong kỳ (đúng quy
// ước đã dùng ở routes/analytics.js — amount là số tiền thực trả, ĐÃ TRỪ
// KM Hệ 1 nếu có, khớp quyết định đã chốt). Nhóm theo receiver_email —
// đơn không có email (khách không xác thực) bị bỏ qua (không thể phát
// phiếu cho ai không xác định).
//
// node-cron chạy theo giờ hệ thống VPS — GIẢ ĐỊNH VPS đặt múi giờ VN
// (UTC+7) hoặc TZ được cấu hình đúng khi deploy (ghi chú rõ ở README/lúc
// bàn giao, không tự động phát hiện múi giờ ở đây).
// ============================================================

const cron = require('node-cron');
const canister = require('../lib/canister');

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function formatYYYYMMDD(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

function formatYYYYMM(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}`;
}

function computeLastWeekRange(now) {
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  return { start: weekStart, endExclusive: todayStart, periodKey: formatYYYYMMDD(weekStart) };
}

function computeLastMonthRange(now) {
  const todayStart = startOfDay(now);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
  return { start: monthStart, endExclusive: todayStart, periodKey: formatYYYYMM(monthStart) };
}

function computeSalesByEmail(db, start, endExclusive) {
  const rows = db.prepare(
    `SELECT receiver_email AS email, COALESCE(SUM(amount), 0) AS total
     FROM orders
     WHERE payment_status = 'paid'
       AND receiver_email != ''
       AND created_at >= ? AND created_at < ?
     GROUP BY receiver_email`,
  ).all(start.getTime(), endExclusive.getTime());
  return rows;
}

async function runPeriod(db, periodType, range) {
  const rows = computeSalesByEmail(db, range.start, range.endExclusive);
  console.log(
    `[sales-bonus-cron] ${periodType} kỳ ${range.periodKey}: ${rows.length} khách có doanh số`,
  );
  for (const row of rows) {
    try {
      const result = await canister.issueSalesBonus(row.email, periodType, range.periodKey, row.total);
      if (result?.err) {
        console.error(`[sales-bonus-cron] issueSalesBonus lỗi cho ${row.email}:`, result.err);
      } else if (result?.ok?.length > 0) {
        console.log(
          `[sales-bonus-cron] Đã phát phiếu ${result.ok[0].value} đ cho ${row.email} (doanh số ${periodType}: ${row.total})`,
        );
      }
    } catch (e) {
      console.error(`[sales-bonus-cron] Lỗi gọi issueSalesBonus cho ${row.email}:`, e.message);
    }
  }
}

function startSalesBonusCron(db) {
  const weeklyTask = cron.schedule('15 0 * * 1', async () => {
    try {
      await runPeriod(db, 'weekly', computeLastWeekRange(new Date()));
    } catch (e) {
      console.error('[sales-bonus-cron] weekly fatal:', e.message);
    }
  });

  const monthlyTask = cron.schedule('15 0 1 * *', async () => {
    try {
      await runPeriod(db, 'monthly', computeLastMonthRange(new Date()));
    } catch (e) {
      console.error('[sales-bonus-cron] monthly fatal:', e.message);
    }
  });

  return {
    stop() {
      weeklyTask.stop();
      monthlyTask.stop();
    },
  };
}

module.exports = {
  startSalesBonusCron,
  computeLastWeekRange,
  computeLastMonthRange,
  computeSalesByEmail,
};
