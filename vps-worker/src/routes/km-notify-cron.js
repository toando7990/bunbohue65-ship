// ============================================================
// routes/km-notify-cron.js — email nhắc KM Hệ 1 trước 15 phút (Giai đoạn 4b)
// ============================================================
// Chạy MỖI PHÚT (cần độ chính xác phút, không thể gộp lịch thưa hơn):
//   1. Gọi canister.getCurrentPromotion() — chương trình Hệ 1 đang có
//      hiệu lực HÔM NAY (khớp ngày + thứ trong tuần). null → không làm gì.
//   2. Với TỪNG khung giờ (timeSlots, tối đa 3) của chương trình: tính thời
//      điểm "còn 15 phút" = giờ bắt đầu khung - 15 phút. Nếu khớp ĐÚNG
//      phút hiện tại (giờ hệ thống VPS — GIẢ ĐỊNH đã đặt múi giờ VN, cùng
//      quy ước routes/sales-bonus-cron.js) → gửi email cho MỌI khách có
//      km_notify_opt_in=1.
//   3. MỖI KHUNG GIỜ GỬI 1 EMAIL RIÊNG (đã xác nhận với người dùng) — nếu
//      1 ngày có 3 khung giờ, khách nhận 3 email/ngày (1 email/khung).
//   4. Chống gửi trùng qua bảng km_notifications_sent (khoá
//      ngày+mã chương trình+chỉ số khung giờ) — phòng trường hợp cron
//      chạy lại trong đúng phút đó (server restart, lệch giờ hệ thống).
//
// Thời điểm "còn 15 phút" tính CÓ XOAY VÒNG qua nửa đêm (ví dụ khung giờ
// bắt đầu 00:10 → thời điểm nhắc là 23:55 NGÀY HÔM ĐÓ, vẫn cùng
// getCurrentPromotion() vì canister chỉ so ngày, không so giờ).
// ============================================================

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const canister = require('./../lib/canister');

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function dateKeyOf(now) {
  const d = new Date(now);
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

function nowMinutesSinceMidnight(now) {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

// Thời điểm nhắc (phút trong ngày, đã xoay vòng 0-1439) của 1 khung giờ.
function notifyMinutesForSlot(slot) {
  const slotStartMinutes = Number(slot.startHour) * 60 + Number(slot.startMinute);
  return ((slotStartMinutes - 15) % 1440 + 1440) % 1440;
}

function formatHm(hour, minute) {
  return `${pad(Number(hour), 2)}:${pad(Number(minute), 2)}`;
}

async function sendKmNotifyEmails(db, promotion, slot, slotIndex) {
  const rows = db.prepare(
    'SELECT email FROM customers WHERE km_notify_opt_in = 1',
  ).all();
  if (rows.length === 0) return;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const timeStr = formatHm(slot.startHour, slot.startMinute);
  const subject = `Khuyến mãi giờ vàng sắp bắt đầu lúc ${timeStr} — Bunbohue65`;
  const tierLines = (promotion.tiers || [])
    .map((t) => `- Đơn từ ${Number(t.minOrderValue).toLocaleString('vi-VN')}đ, giảm ${Number(t.discountAmount).toLocaleString('vi-VN')}đ`)
    .join('\n');
  const text =
    `${promotion.name} sắp bắt đầu lúc ${timeStr} (còn 15 phút nữa), ` +
    `kéo dài ${slot.durationMinutes} phút.\n\n` +
    `Mức khuyến mại:\n${tierLines}\n\n` +
    `Đặt món ngay trong khung giờ để nhận ưu đãi!\n\nBunbohue65`;

  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER, to: row.email, subject, text,
      });
    } catch (e) {
      console.error(`[km-notify-cron] Gửi email lỗi cho ${row.email}:`, e.message);
    }
  }
  console.log(`[km-notify-cron] Đã gửi ${rows.length} email nhắc khung giờ ${timeStr}`);
}

async function checkAndNotify(db, now) {
  const promotion = await canister.getCurrentPromotion();
  if (!promotion || promotion.length === 0) return; // Opt candid: [] | [Promotion]
  const promo = Array.isArray(promotion) ? promotion[0] : promotion;
  if (!promo) return;

  const nowMinutes = nowMinutesSinceMidnight(now);
  const dateKey = dateKeyOf(now);
  const timeSlots = promo.timeSlots || [];

  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i];
    if (notifyMinutesForSlot(slot) !== nowMinutes) continue;

    const already = db.prepare(
      'SELECT 1 FROM km_notifications_sent WHERE date_key = ? AND promotion_code = ? AND slot_index = ?',
    ).get(dateKey, promo.code, i);
    if (already) continue;

    db.prepare(
      'INSERT INTO km_notifications_sent (date_key, promotion_code, slot_index, sent_at) VALUES (?, ?, ?, ?)',
    ).run(dateKey, promo.code, i, Date.now());

    await sendKmNotifyEmails(db, promo, slot, i);
  }
}

function startKmNotifyCron(db) {
  return cron.schedule('* * * * *', async () => {
    try {
      await checkAndNotify(db, new Date());
    } catch (e) {
      console.error('[km-notify-cron] fatal:', e.message);
    }
  });
}

module.exports = {
  startKmNotifyCron,
  // Export để test độc lập.
  notifyMinutesForSlot,
  nowMinutesSinceMidnight,
  dateKeyOf,
  checkAndNotify,
};
