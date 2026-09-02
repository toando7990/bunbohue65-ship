// Public API surface cho "Khuyến mại doanh số tuần/tháng" (Giai đoạn 3d).
//
// CRUD (admin only) — cấu hình chương trình (2 bộ mức riêng: tuần/tháng,
// tối đa 3 mức mỗi bộ).
//
// issueSalesBonus (VPS gọi, HMAC-verified) — VPS tính tổng doanh số theo
// kỳ (đơn `paid`+`completed` trong tuần/tháng TRƯỚC, theo amount — số tiền
// thực trả) rồi gọi hàm này; canister tự quyết định có đạt mức nào không
// (không tin VPS tính đúng) và CHỐNG PHÁT TRÙNG nếu cron gọi lại cho cùng
// 1 kỳ đã xử lý.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ khách nhận phiếu (kiểm tra
// TRỰC TIẾP qua Voucher.programCode, giống Khuyến mại đăng ký — vouchers
// đã sẵn có trong mixin này từ trước) — KHÔNG cho sửa/xoá nữa, chỉ còn
// stopSalesPromo.

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import SalesPromoTypes "../types/sales-promo";
import SalesPromoLib "../lib/sales-promo";
import VoucherTypes "../types/voucher";
import VoucherLib "../lib/voucher";
import HmacLib "../lib/hmac";

mixin (
  accessControlState : AccessControl.AccessControlState,
  salesPromos : SalesPromoTypes.SalesPromoStore,
  salesBonusIssued : SalesPromoTypes.SalesBonusIssuedStore,
  vouchers : VoucherTypes.VoucherStore,
  secretState : SecretTypes.SecretState,
) {
  func hasIssuedSalesVoucher(code : Text) : Bool {
    for ((_voucherCode, v) in vouchers.toArray().vals()) {
      if (v.programCode == code) { return true };
    };
    false;
  };

  public shared ({ caller }) func createSalesPromo(
    name : Text,
    startDate : Text,
    endDate : Text,
    weeklyTiers : [SalesPromoTypes.SalesTier],
    monthlyTiers : [SalesPromoTypes.SalesTier],
    voucherValidDays : Nat,
    termsUrl : Text,
  ) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (weeklyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tuần");
    };
    if (monthlyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tháng");
    };
    let prng = VoucherLib.newPrngState();
    let code = VoucherLib.generateVoucherCode(prng);
    let promo : SalesPromoTypes.SalesPromo = {
      code;
      name;
      startDate;
      endDate;
      weeklyTiers;
      monthlyTiers;
      voucherValidDays;
      active = true;
      termsUrl;
    };
    salesPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func updateSalesPromo(
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    weeklyTiers : [SalesPromoTypes.SalesTier],
    monthlyTiers : [SalesPromoTypes.SalesTier],
    voucherValidDays : Nat,
    active : Bool,
    termsUrl : Text,
  ) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (salesPromos.get(code) == null) {
      return #err("Không tìm thấy chương trình khuyến mại doanh số");
    };
    if (hasIssuedSalesVoucher(code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
    };
    if (weeklyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tuần");
    };
    if (monthlyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tháng");
    };
    let promo : SalesPromoTypes.SalesPromo = {
      code;
      name;
      startDate;
      endDate;
      weeklyTiers;
      monthlyTiers;
      voucherValidDays;
      active;
      termsUrl;
    };
    salesPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deleteSalesPromo(code : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (salesPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại doanh số") };
      case (?_) {};
    };
    if (hasIssuedSalesVoucher(code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    salesPromos.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopSalesPromo(code : Text) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (salesPromos.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại doanh số") };
      case (?promo) {
        let updated : SalesPromoTypes.SalesPromo = { promo with active = false };
        salesPromos.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isSalesPromoUsed(code : Text) : async Result.Result<Bool, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(hasIssuedSalesVoucher(code));
  };

  public query ({ caller }) func listSalesPromos() : async Result.Result<[SalesPromoTypes.SalesPromo], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(salesPromos.toArray().map(func((_code : Text, p : SalesPromoTypes.SalesPromo)) : SalesPromoTypes.SalesPromo = p));
  };

  public query func getCurrentSalesPromo() : async ?SalesPromoTypes.SalesPromo {
    SalesPromoLib.findActiveSalesPromo(salesPromos, Time.now());
  };

  public shared func issueSalesBonus(
    email : Text,
    periodType : Text,
    periodKey : Text,
    totalSales : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<?VoucherTypes.Voucher, Text> {
    let payload = email # "|" # periodType # "|" # periodKey # "|" # Nat.toText(totalSales);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let prng = VoucherLib.newPrngState();
    SalesPromoLib.tryIssueSalesBonus(
      salesPromos,
      salesBonusIssued,
      vouchers,
      prng,
      email,
      periodType,
      periodKey,
      totalSales,
      Time.now(),
    );
  };
};
