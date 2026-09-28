import Result "mo:core/Result";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import SecretLib "../lib/secret";
import SecretTypes "../types/secret";
import HmacLib "../lib/hmac";
import Int "mo:core/Int";
import Time "mo:core/Time";

mixin (state : SecretTypes.SecretState, accessControlState : AccessControl.AccessControlState) {
  /// Admin-only. Rotates the VPS secret: current `vpsSecret` is moved into
  /// `vpsSecretPrevious` before `newSecret` is written to `vpsSecret`.
  /// Returns `#ok` on success, `#err` if the caller is not an admin.
  public shared ({ caller }) func setVpsSecret(newSecret : Text) : async { #ok : (); #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    SecretLib.rotateSecret(state, newSecret);
    #ok();
  };

  /// Admin-only. Cấp "vé" để trang /admin gọi các API quản trị trên VPS
  /// (VPS không kiểm tra được đăng nhập Internet Identity). Vé dạng
  /// "<ms>.<hex>", hex = HMAC-SHA256(vpsSecret, "admin|<purpose>|<ms>");
  /// VPS kiểm tra bằng VPS_SECRET, hạn 10 phút (vps-worker/src/lib/admin-ticket.js).
  /// Chỉ cấp cho các mục đích đã khai báo.
  public shared ({ caller }) func issueVpsAdminTicket(purpose : Text) : async Result.Result<Text, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    if (purpose != "delivery") return #err("Unknown purpose");
    if (state.vpsSecret == "") return #err("VPS secret not set");
    let ms = Int.toText(Time.now() / 1_000_000);
    #ok(ms # "." # HmacLib.hmacSha256(state.vpsSecret, "admin|" # purpose # "|" # ms));
  };

  /// Returns the canister's own id as text, so the VPS knows which canister
  /// it is talking to. Implemented in `main.mo` (where `Self` is in scope).
};
