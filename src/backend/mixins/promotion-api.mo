// Public API surface cho hệ thống khuyến mại (KM).
//
// Giai đoạn 1: đếm/kiểm tra lượt dùng KM trong ngày (tryConsumeKmSlot,
// getKmUsageCount) — giữ nguyên, không đổi.
//
// Giai đoạn 2 (bổ sung): chương trình KM Hệ 1 (theo khung giờ) — admin
// tạo/sửa/xoá/bật-tắt, khách xem chương trình đang áp dụng (banner), VPS
// gọi applyPromotion() lúc tạo đơn để kiểm tra + áp dụng chiết khấu.
//
// applyPromotion: HMAC-verified (VPS gọi) — kiểm tra khung giờ + 2 giới hạn
// (tổng đơn/ngày toàn hệ thống, đơn/ngày/khách) TRONG 1 THAO TÁC ATOMIC,
// tránh race condition giữa kiểm tra và ghi. Không đạt điều kiện nào →
// #err, KHÔNG tăng bộ đếm nào cả (đơn vẫn đặt được bình thường, chỉ không
// có KM — theo quyết định đã chốt, xử lý ở phía VPS gọi hàm này).

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import PromotionTypes "../types/promotion";
import HmacLib "../lib/hmac";
import PromotionLib "../lib/promotion";

mixin (
  accessControlState : AccessControl.AccessControlState,
  kmUsage : PromotionTypes.KmUsageStore,
  kmDailyCount : PromotionTypes.KmDailyCountStore,
  promotions : PromotionTypes.PromotionStore,
  secretState : SecretTypes.SecretState,
) {
  // ============================================================
  // Giai đoạn 1 — giữ nguyên
  // ============================================================

  public shared func tryConsumeKmSlot(
    email : Text,
    programCode : Text,
    dailyLimit : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<Nat, Text> {
    let payload = email # "|" # programCode # "|" # Nat.toText(dailyLimit);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    PromotionLib.tryConsumeSlot(kmUsage, email, programCode, dailyLimit, Time.now());
  };

  public query func getKmUsageCount(email : Text, programCode : Text) : async Nat {
    PromotionLib.getUsageCount(kmUsage, email, programCode, Time.now());
  };

  // ============================================================
  // Giai đoạn 2 — quản trị chương trình KM (Hệ 1: theo khung giờ)
  // ============================================================

  // Admin only. Tạo chương trình KM mới — canister tự sinh mã 8 ký tự.
  // active=true mặc định (admin tự tắt sau nếu cần).
  public shared ({ caller }) func createPromotion(
    name : Text,
    startDate : Text,
    endDate : Text,
    daysOfWeek : [Bool],
    timeSlots : [PromotionTypes.TimeSlot],
    dailyOrderLimit : Nat,
    perCustomerDailyLimit : Nat,
    tiers : [PromotionTypes.DiscountTier],
  ) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (daysOfWeek.size() != 7) {
      return #err("daysOfWeek phải có đúng 7 phần tử (0=Chủ nhật...6=Thứ bảy)");
    };
    if (timeSlots.size() > 3) {
      return #err("Tối đa 3 khung giờ khuyến mại/ngày");
    };
    if (tiers.size() > 5) {
      return #err("Tối đa 5 mức khuyến mại");
    };
    let prng = PromotionLib.newPrngState();
    let code = PromotionLib.generatePromotionCode(prng);
    let promo : PromotionTypes.Promotion = {
      code;
      name;
      startDate;
      endDate;
      daysOfWeek;
      timeSlots;
      dailyOrderLimit;
      perCustomerDailyLimit;
      tiers;
      active = true;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

  // Admin only. Cập nhật chương trình KM đã có (theo code) — ghi đè toàn bộ
  // field trừ code. Dùng để sửa thông tin lẫn bật/tắt (active).
  public shared ({ caller }) func updatePromotion(
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    daysOfWeek : [Bool],
    timeSlots : [PromotionTypes.TimeSlot],
    dailyOrderLimit : Nat,
    perCustomerDailyLimit : Nat,
    tiers : [PromotionTypes.DiscountTier],
    active : Bool,
  ) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (promotions.get(code) == null) {
      return #err("Không tìm thấy chương trình khuyến mại");
    };
    if (daysOfWeek.size() != 7) {
      return #err("daysOfWeek phải có đúng 7 phần tử (0=Chủ nhật...6=Thứ bảy)");
    };
    if (timeSlots.size() > 3) {
      return #err("Tối đa 3 khung giờ khuyến mại/ngày");
    };
    if (tiers.size() > 5) {
      return #err("Tối đa 5 mức khuyến mại");
    };
    let promo : PromotionTypes.Promotion = {
      code;
      name;
      startDate;
      endDate;
      daysOfWeek;
      timeSlots;
      dailyOrderLimit;
      perCustomerDailyLimit;
      tiers;
      active;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

  // Admin only. Xoá chương trình KM.
  public shared ({ caller }) func deletePromotion(code : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại") };
      case (?_) {};
    };
    promotions.remove(code);
    #ok;
  };

  // Admin only. Liệt kê TẤT CẢ chương trình (kể cả hết hạn/tắt) để quản lý.
  public query ({ caller }) func listPromotions() : async Result.Result<[PromotionTypes.Promotion], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(promotions.toArray().map(func((_code : Text, p : PromotionTypes.Promotion)) : PromotionTypes.Promotion = p));
  };

  // Công khai. Trả về chương trình KM đang có hiệu lực HÔM NAY (khớp ngày +
  // thứ trong tuần, active=true) — KHÔNG kiểm tra khớp khung giờ cụ thể
  // (frontend tự làm đếm ngược theo timeSlots trả về). null nếu không có
  // chương trình nào hợp lệ hôm nay. Tại 1 thời điểm chỉ có ĐÚNG 1 chương
  // trình hoạt động (theo quyết định đã chốt) — nếu có nhiều hơn 1 (admin
  // cấu hình trùng, không nên xảy ra), trả về chương trình đầu tiên tìm
  // được, không đảm bảo thứ tự.
  public query func getCurrentPromotion() : async ?PromotionTypes.Promotion {
    let now = Time.now();
    let today = PromotionLib.vnDateKey(now);
    let wd = PromotionLib.weekdayIndex(now);
    for ((_code, promo) in promotions.toArray().vals()) {
      if (
        promo.active and today >= promo.startDate and today <= promo.endDate and
        wd < promo.daysOfWeek.size() and promo.daysOfWeek[wd]
      ) {
        return ?promo;
      };
    };
    null;
  };

  // ============================================================
  // Giai đoạn 2 — áp dụng KM lúc tạo đơn (VPS gọi, HMAC-verified)
  // ============================================================

  // Kiểm tra + áp dụng KM cho 1 đơn hàng:
  //   1. Tìm chương trình đang ĐÚNG khung giờ NGAY BÂY GIỜ (không chỉ đúng
  //      ngày như getCurrentPromotion — phải khớp CẢ khung giờ cụ thể).
  //   2. Tìm mức chiết khấu theo orderAmount (đã gồm VAT).
  //   3. Kiểm tra CẢ 2 điều kiện (tổng đơn/ngày, đơn/ngày/khách) TRƯỚC,
  //      KHÔNG sửa gì — chỉ khi CẢ 2 đạt mới tăng cả 2 bộ đếm. Motoko không
  //      tự rollback khi trả #err giữa chừng trong 1 lệnh gọi, nên nếu tăng
  //      bộ đếm A rồi mới kiểm tra điều kiện B thất bại, bộ đếm A đã bị
  //      tăng NHẦM — ĐÃ TỰ PHÁT HIỆN VÀ SỬA lỗi này qua mô phỏng Python
  //      trước khi giao. Không có await giữa các bước → toàn bộ chạy atomic
  //      trong 1 lượt xử lý message.
  // Bất kỳ điều kiện nào không đạt → #err, KHÔNG tăng bộ đếm nào. Caller
  // (VPS) coi #err là "không có KM", vẫn tạo đơn bình thường.
  //
  // HMAC payload: "email|orderAmount". Không cần truyền programCode (VPS
  // không tự chọn chương trình — canister tự tìm chương trình đang khớp
  // khung giờ NGAY LÚC XỬ LÝ, tránh VPS gửi sai/cũ).
  public shared func applyPromotion(
    email : Text,
    orderAmount : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<{ promotionCode : Text; discountAmount : Nat }, Text> {
    let payload = email # "|" # Nat.toText(orderAmount);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let now = Time.now();
    var found : ?PromotionTypes.Promotion = null;
    for ((_code, promo) in promotions.toArray().vals()) {
      if (found == null and PromotionLib.isPromotionActiveNow(promo, now)) {
        found := ?promo;
      };
    };
    let promo = switch (found) {
      case null { return #err("Không có chương trình khuyến mại nào đang diễn ra") };
      case (?p) { p };
    };
    let tier = switch (PromotionLib.findApplicableTier(promo, orderAmount)) {
      case null { return #err("Đơn chưa đạt mức tối thiểu để nhận khuyến mại") };
      case (?t) { t };
    };
    let dailyCountNow = PromotionLib.getDailyCount(kmDailyCount, promo.code, now);
    if (dailyCountNow >= promo.dailyOrderLimit) {
      return #err("Đã đạt giới hạn tổng số đơn khuyến mại hôm nay");
    };
    let customerCountNow = PromotionLib.getUsageCount(kmUsage, email, promo.code, now);
    if (customerCountNow >= promo.perCustomerDailyLimit) {
      return #err("Đã đạt giới hạn khuyến mại hôm nay cho chương trình này");
    };
    ignore PromotionLib.tryConsumeDailyCount(kmDailyCount, promo.code, promo.dailyOrderLimit, now);
    ignore PromotionLib.tryConsumeSlot(kmUsage, email, promo.code, promo.perCustomerDailyLimit, now);
    #ok({ promotionCode = promo.code; discountAmount = tier.discountAmount });
  };
};
