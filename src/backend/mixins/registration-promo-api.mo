// Public API surface cho "Khuyến mại đăng ký" (Giai đoạn 3c) — chỉ CRUD
// cho admin cấu hình chương trình. Việc PHÁT HÀNH phiếu (khi khách xác
// thực OTP lần đầu tiên) nằm trong mixins/email-verification-api.mo (gọi
// RegistrationPromoLib.tryIssueRegistrationBonus trực tiếp), KHÔNG có ở
// đây — mixin này thuần tuý là quản trị chương trình.

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";

import RegistrationPromoTypes "../types/registration-promo";
import RegistrationPromoLib "../lib/registration-promo";

mixin (
  accessControlState : AccessControl.AccessControlState,
  registrationPromos : RegistrationPromoTypes.RegistrationPromoStore,
) {
  // Admin only. Tạo chương trình khuyến mại đăng ký mới — canister tự sinh
  // mã 8 ký tự. active=true mặc định.
  public shared ({ caller }) func createRegistrationPromo(
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
  ) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    let prng = RegistrationPromoLib.newPrngState();
    let code = RegistrationPromoLib.generateCode(prng);
    let promo : RegistrationPromoTypes.RegistrationPromo = {
      code;
      name;
      startDate;
      endDate;
      voucherValue;
      voucherValidDays;
      active = true;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  // Admin only. Cập nhật chương trình đã có (theo code) — ghi đè toàn bộ
  // field trừ code. Dùng để sửa thông tin lẫn bật/tắt (active).
  public shared ({ caller }) func updateRegistrationPromo(
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
    active : Bool,
  ) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (registrationPromos.get(code) == null) {
      return #err("Không tìm thấy chương trình khuyến mại đăng ký");
    };
    let promo : RegistrationPromoTypes.RegistrationPromo = {
      code;
      name;
      startDate;
      endDate;
      voucherValue;
      voucherValidDays;
      active;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  // Admin only. Xoá chương trình.
  public shared ({ caller }) func deleteRegistrationPromo(code : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?_) {};
    };
    registrationPromos.remove(code);
    #ok;
  };

  // Admin only. Liệt kê TẤT CẢ chương trình (kể cả hết hạn/tắt).
  public query ({ caller }) func listRegistrationPromos() : async Result.Result<[RegistrationPromoTypes.RegistrationPromo], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(registrationPromos.toArray().map(func((_code : Text, p : RegistrationPromoTypes.RegistrationPromo)) : RegistrationPromoTypes.RegistrationPromo = p));
  };
};
