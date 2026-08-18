import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";
import StoreHoursConfigLib "../lib/store-hours-config";
import StoreHoursConfigTypes "../types/store-hours-config";

// Public API surface for the store-hours-config domain. State is injected from
// main.mo. This mixin owns:
//   - getStoreHours (query, public)
//   - setStoreHours (update, admin-only)
//   - isStoreOpen (query, public) — helper for the frontend to decide whether
//     to block order placement on both the driver and customer flows.
//
// `accessControlState` is the first param (following core-api/devices-api) so
// the admin-only setter can gate on AccessControl.isAdmin, mirroring
// setPaymentMode in mixins/payment-mode-config-api.mo.
mixin (
  accessControlState : AccessControl.AccessControlState,
  storeHoursState : StoreHoursConfigTypes.StoreHoursState,
) {
  /// Query: return the current storeHours config. Public — no caller gating;
  /// the value is not sensitive and the frontend needs it to render the
  /// open/close state on both the driver and customer flows.
  public query func getStoreHours() : async StoreHoursConfigTypes.StoreHours {
    StoreHoursConfigLib.getStoreHours(storeHoursState);
  };

  /// Admin-only update: set the global store open/close hours. Rejects any
  /// caller that is not an admin with #err. Returns #ok on success, #err if the
  /// caller is not an admin. Mirrors setPaymentMode in
  /// mixins/payment-mode-config-api.mo.
  public shared ({ caller }) func setStoreHours(hours : StoreHoursConfigTypes.StoreHours) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    StoreHoursConfigLib.setStoreHours(storeHoursState, hours);
    #ok(());
  };

  /// Query: return whether the store is currently open based on the current
  /// time. Public — the frontend calls this on both the driver and customer
  /// flows to decide whether to block order placement and show a waiting
  /// screen instead of allowing item selection.
  public query func isStoreOpen() : async Bool {
    StoreHoursConfigLib.isStoreOpen(storeHoursState, Time.now());
  };
};
