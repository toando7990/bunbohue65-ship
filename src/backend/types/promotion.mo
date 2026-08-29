import Map "mo:core/Map";

// Types cho hệ thống khuyến mại (KM) — Giai đoạn 1 chỉ có KmUsage (đếm số
// lần khách đã dùng KM trong ngày, theo từng chương trình). Chương trình KM
// thật (Hệ 1 — khung giờ, Hệ 2 — tích luỹ chi tiêu) sẽ định nghĩa type riêng
// ở Giai đoạn 2/3 — Giai đoạn 1 KHÔNG có type "Promotion"/"Program" vì chưa
// cần (programCode chỉ là Text tham chiếu, không phải khoá ngoại chặt — canister/
// Motoko không có khái niệm khoá ngoại giữa các Map).
module {
  // Khoá composite dạng "email|programCode|YYYYMMDD" (ngày theo giờ VN,
  // UTC+7) — 1 khoá = số lần khách (theo email đã xác thực) đã dùng KM của
  // ĐÚNG chương trình đó trong ĐÚNG ngày đó. Gộp cả 3 khung giờ/ngày của
  // cùng 1 chương trình vào chung 1 bộ đếm (theo quyết định của người dùng —
  // giới hạn tính tổng cả 3 khung giờ, không tính riêng từng khung giờ).
  public type KmUsageKey = Text;

  public type KmUsageStore = Map.Map<KmUsageKey, Nat>;
};
