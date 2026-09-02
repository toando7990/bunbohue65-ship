// Public API surface cho "Khuyến mại đăng ký" (Giai đoạn 3c) — chỉ CRUD
// cho admin cấu hình chương trình. Việc PHÁT HÀNH phiếu (khi khách xác
// thực OTP lần đầu tiên) nằm trong mixins/email-verification-api.mo (gọi
// RegistrationPromoLib.tryIssueRegistrationBonus trực tiếp), KHÔNG có ở
// đây — mixin này thuần tuý là quản trị chương trình.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ khách nhận phiếu (kiểm tra
// TRỰC TIẾP qua Voucher.programCode — không cần field theo dõi riêng như
// Hệ 1, vì phiếu đã có sẵn field này) — KHÔNG cho sửa/xoá nữa, chỉ còn
// stopRegistrationPromo (set active=false, luôn dùng được).

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";

import RegistrationPromoTypes "../types/registration-promo";
import RegistrationPromoLib "../lib/registration-promo";
import VoucherTypes "../types/voucher";

mixin (
  accessControlState : AccessControl.AccessControlState,
  registrationPromos : RegistrationPromoTypes.RegistrationPromoStore,
  vouchers : VoucherTypes.VoucherStore,
) {
  // Chương trình đã có phiếu nào phát ra với programCode này chưa — kiểm
  // tra trực tiếp trên Voucher.programCode (field sẵn có, không cần lưu
  // thêm dữ liệu theo dõi riêng).
  func hasIssuedRegistrationVoucher(code : Text) : Bool {
    for ((_voucherCode, v) in vouchers.toArray().vals()) {
      if (v.programCode == code) { return true };
    };
    false;
  };

  public shared ({ caller }) func createRegistrationPromo(
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
    termsUrl : Text,
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
      termsUrl;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func updateRegistrationPromo(
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
    active : Bool,
    termsUrl : Text,
  ) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (registrationPromos.get(code) == null) {
      return #err("Không tìm thấy chương trình khuyến mại đăng ký");
    };
    if (hasIssuedRegistrationVoucher(code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
    };
    let promo : RegistrationPromoTypes.RegistrationPromo = {
      code;
      name;
      startDate;
      endDate;
      voucherValue;
      voucherValidDays;
      active;
      termsUrl;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deleteRegistrationPromo(code : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?_) {};
    };
    if (hasIssuedRegistrationVoucher(code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    registrationPromos.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopRegistrationPromo(code : Text) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?promo) {
        let updated : RegistrationPromoTypes.RegistrationPromo = { promo with active = false };
        registrationPromos.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isRegistrationPromoUsed(code : Text) : async Result.Result<Bool, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(hasIssuedRegistrationVoucher(code));
  };

  public query ({ caller }) func listRegistrationPromos() : async Result.Result<[RegistrationPromoTypes.RegistrationPromo], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(registrationPromos.toArray().map(func((_code : Text, p : RegistrationPromoTypes.RegistrationPromo)) : RegistrationPromoTypes.RegistrationPromo = p));
  };
};
