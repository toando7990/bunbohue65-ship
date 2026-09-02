// Public API surface cho hệ thống khuyến mại (KM).
//
// Giai đoạn 1: đếm/kiểm tra lượt dùng KM trong ngày (tryConsumeKmSlot,
// getKmUsageCount) — giữ nguyên, không đổi.
//
// Giai đoạn 2 (bổ sung): chương trình KM Hệ 1 (theo khung giờ) — admin
// tạo/sửa/xoá/bật-tắt, khách xem chương trình đang áp dụng (banner), VPS
// gọi applyPromotion() lúc tạo đơn để kiểm tra + áp dụng chiết khấu.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ KHÁCH DÙNG THÀNH CÔNG (đánh
// dấu qua promotionUsed, ngay lúc applyPromotion() thành công lần đầu) —
// KHÔNG cho sửa/xoá nữa, chỉ còn nút "Dừng" (stopPromotion — set
// active=false, luôn dùng được không điều kiện). Muốn sửa nội dung thì
// admin "Sao chép và tạo mới" (tạo chương trình mới qua createPromotion
// bình thường, phía frontend tự điền sẵn dữ liệu — không cần API riêng).

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import PromotionTypes "../types/promotion";
import HmacLib "../lib/hmac";
import PromotionLib "../lib/promotion";
import EmailVerificationLib "../lib/email-verification";

mixin (
  accessControlState : AccessControl.AccessControlState,
  kmUsage : PromotionTypes.KmUsageStore,
  kmDailyCount : PromotionTypes.KmDailyCountStore,
  promotions : PromotionTypes.PromotionStore,
  secretState : SecretTypes.SecretState,
  otpRecords : EmailVerificationLib.State,
  promotionUsed : PromotionTypes.PromotionUsedStore,
) {
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

  public shared ({ caller }) func createPromotion(
    name : Text,
    startDate : Text,
    endDate : Text,
    daysOfWeek : [Bool],
    timeSlots : [PromotionTypes.TimeSlot],
    dailyOrderLimit : Nat,
    perCustomerDailyLimit : Nat,
    tiers : [PromotionTypes.DiscountTier],
    termsUrl : Text,
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
      termsUrl;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

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
    termsUrl : Text,
  ) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (promotions.get(code) == null) {
      return #err("Không tìm thấy chương trình khuyến mại");
    };
    if (promotionUsed.get(code) == ?true) {
      return #err("Chương trình đã có khách sử dụng, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
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
      termsUrl;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deletePromotion(code : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại") };
      case (?_) {};
    };
    if (promotionUsed.get(code) == ?true) {
      return #err("Chương trình đã có khách sử dụng, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    promotions.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopPromotion(code : Text) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại") };
      case (?promo) {
        let updated : PromotionTypes.Promotion = { promo with active = false };
        promotions.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isPromotionUsed(code : Text) : async Result.Result<Bool, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(promotionUsed.get(code) == ?true);
  };

  public query ({ caller }) func listPromotions() : async Result.Result<[PromotionTypes.Promotion], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(promotions.toArray().map(func((_code : Text, p : PromotionTypes.Promotion)) : PromotionTypes.Promotion = p));
  };

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

  public shared func applyPromotion(
    email : Text,
    orderAmount : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<{ promotionCode : Text; discountAmount : Nat }, Text> {
    let payload = email # "|" # Nat.toText(orderAmount);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    if (not EmailVerificationLib.isEmailVerified(otpRecords, email)) {
      return #err("Email chưa được xác thực");
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
    promotionUsed.add(promo.code, true);
    #ok({ promotionCode = promo.code; discountAmount = tier.discountAmount });
  };
};
