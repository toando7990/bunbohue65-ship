// ============================================================
// routes/maps-config.js — GET /maps-config
// ============================================================
// Trả Google Maps "browser key" cho frontend (AddressPicker.tsx) — dùng
// để hiện bản đồ Google + gợi ý địa chỉ khi khách thêm/sửa địa chỉ nhận
// hàng. Để key trong .env của VPS (GOOGLE_MAPS_BROWSER_KEY) thay vì
// build cứng vào frontend: đổi/thu hồi key chỉ cần sửa .env + restart,
// không cần deploy lại app.
//
// Đây là key DÙNG TRÊN TRÌNH DUYỆT — vốn công khai theo thiết kế của
// Google (ai mở trang cũng thấy được trong network tab), được bảo vệ
// bằng giới hạn "HTTP referrer" (chỉ tên miền của app) + giới hạn API +
// hạn mức/ngày cấu hình trong Google Cloud Console. KHÔNG dùng key này
// cho việc gì khác phía server.
//
// Chưa cấu hình → trả browserKey rỗng, frontend tự quay về bản đồ
// OpenStreetMap cũ (ghim tay), không lỗi.
// ============================================================

const express = require('express');

const router = express.Router();

router.get('/maps-config', (req, res) => {
  const browserKey = String(process.env.GOOGLE_MAPS_BROWSER_KEY || '').trim();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: true, browserKey });
});

module.exports = router;
