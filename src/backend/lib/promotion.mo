import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Result "mo:core/Result";

import PromotionTypes "../types/promotion";

// lib/promotion.mo — Giai đoạn 1: chỉ có logic đếm/kiểm tra lượt dùng KM
// trong ngày. Chương trình KM thật (Hệ 1/Hệ 2) là Giai đoạn 2/3.
module {
  // Hằng số thời gian (nanosecond) — CÙNG CÔNG THỨC với utc7DayStart() ở
  // lib/core.mo (không import trực tiếp để tránh phụ thuộc chéo module —
  // đây chỉ là phép tính thuần, không phải state, an toàn khi trùng lặp).
  func DAY_NS() : Int { 24 * 3600 * 1_000_000_000 };
  func UTC7_OFFSET_NS() : Int { 7 * 3600 * 1_000_000_000 };

  // Ngày hiện tại theo giờ VN (UTC+7), dạng "YYYYMMDD" — dùng làm 1 phần
  // khoá composite KmUsageKey. now: nanosecond kể từ epoch (Time.now()).
  public func vnDateKey(now : Int) : Text {
    let shifted = now + UTC7_OFFSET_NS();
    let dayIndex = shifted / DAY_NS(); // Số ngày kể từ epoch, theo giờ VN.
    let (y, m, d) = civilFromDays(dayIndex);
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  // Thuật toán chuyển "số ngày kể từ epoch" sang (năm, tháng, ngày) —
  // Howard Hinnant's civil_from_days, xử lý đúng năm nhuận, không phụ thuộc
  // thư viện ngày tháng ngoài (Motoko base không có).
  func civilFromDays(z0 : Int) : (Int, Int, Int) {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if (mp < 10) mp + 3 else mp - 9; // [1, 12]
    (if (m <= 2) y + 1 else y, m, d);
  };

  func padNat(n : Int, width : Nat) : Text {
    var s = Int.toText(n);
    while (s.size() < width) { s := "0" # s };
    s;
  };

  // Khoá composite — xem giải thích ở types/promotion.mo.
  public func usageKey(email : Text, programCode : Text, now : Int) : PromotionTypes.KmUsageKey {
    Text.toLowercase(email) # "|" # programCode # "|" # vnDateKey(now);
  };

  // Đếm hiện tại (không sửa gì) — dùng để hiển thị "còn N lượt KM hôm nay"
  // phía frontend nếu cần, không tính vào giới hạn.
  public func getUsageCount(
    store : PromotionTypes.KmUsageStore,
    email : Text,
    programCode : Text,
    now : Int,
  ) : Nat {
    switch (store.get(usageKey(email, programCode, now))) {
      case null { 0 };
      case (?count) { count };
    };
  };

  // Kiểm tra + tăng bộ đếm TRONG 1 THAO TÁC (atomic trong ngữ cảnh
  // single-threaded của canister — không có race condition giữa các cuộc
  // gọi). Nếu đã đạt dailyLimit → #err, KHÔNG tăng bộ đếm. Nếu còn hạn mức
  // → tăng lên 1, trả về #ok(count mới).
  public func tryConsumeSlot(
    store : PromotionTypes.KmUsageStore,
    email : Text,
    programCode : Text,
    dailyLimit : Nat,
    now : Int,
  ) : Result.Result<Nat, Text> {
    let key = usageKey(email, programCode, now);
    let current = switch (store.get(key)) {
      case null { 0 };
      case (?count) { count };
    };
    if (current >= dailyLimit) {
      return #err("Đã đạt giới hạn khuyến mại hôm nay cho chương trình này");
    };
    let next = current + 1;
    store.add(key, next);
    #ok(next);
  };
};
