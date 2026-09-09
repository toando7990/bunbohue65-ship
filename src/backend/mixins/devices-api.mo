import Result "mo:core/Result";
import Time "mo:core/Time";
import Int "mo:core/Int";

import AccessControl "mo:caffeineai-authorization/access-control";
import DevicesLib "../lib/devices";
import Devices "../types/devices";
import Common "../types/common";

mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  pendingActivations : DevicesLib.PendingActivationsStore,
) {
  // Issue a 6-char activation code bound to a restaurant + role. Admin only.
  // `role` may be any DeviceRole including the 3 enterprise roles, so an admin
  // can issue an activation code that binds an enterprise role to a device.
  public shared ({ caller }) func generateActivationCode(
    restaurantId : Common.RestaurantId,
    role : Devices.DeviceRole,
  ) : async Result.Result<Devices.PendingActivation, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    // Fresh PRNG state per call, seeded lazily from Time.now() inside
    // generateCode. Codes vary across calls because Time.now() advances.
    let prng = DevicesLib.newPrngState();
    #ok(DevicesLib.createPendingActivation(pendingActivations, restaurantId, role, prng));
  };

  // Consume a valid pending activation and register a device. Public (no admin).
  // name/phone: nhân viên tự nhập điện thoại cá nhân của họ lúc kích hoạt —
  // hiển thị thay cho mã thiết bị trong UI, và SĐT dùng cho khách liên hệ
  // trên thẻ đơn (xem OrderCard.tsx).
  public shared ({ caller }) func activateDevice(
    code : Text,
    deviceId : Common.DeviceId,
    name : Text,
    phone : Text,
  ) : async Result.Result<Devices.Device, Text> {
    ignore caller;
    DevicesLib.activateDevice(
      pendingActivations,
      devices,
      code,
      deviceId,
      name,
      phone,
      Int.abs(Time.now()),
    );
  };

  // Revoke a device immediately. Admin only. Admin may revoke enterprise
  // devices (paymentQueue / accounting / salesPromoReporting) as well as
  // admin/driver/cashier devices.
  public shared ({ caller }) func revokeDevice(
    deviceId : Common.DeviceId,
  ) : async Result.Result<Devices.Device, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    DevicesLib.revokeDevice(devices, deviceId);
  };

  // Remove expired/used pending activations. Admin only. Returns count.
  public shared ({ caller }) func cleanupExpiredActivations() : async Nat {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return 0;
    };
    DevicesLib.cleanupExpiredActivations(pendingActivations, Int.abs(Time.now()));
  };

  // List ALL devices (both active and revoked) for a restaurant.
  public query func listDevicesByRestaurant(
    restaurantId : Common.RestaurantId,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRestaurant(devices, restaurantId);
  };

  // List ALL devices (both active and revoked) for a role. The admin device
  // management page uses this to display and filter devices by enterprise role.
  public query func listDevicesByRole(
    role : Devices.DeviceRole,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRole(devices, role);
  };

  // CONTRACT — role-gating helper exposed to the actor. Returns true when the
  // device identified by `deviceId` is bound to the given enterprise role (and
  // is active), OR when the caller is an admin. Used by the business-API
  // mixins (payment queue / accounting / sales+promo reporting) to gate access
  // to their endpoints to the matching enterprise device role. Admin always
  // passes.
  //
  // NOTE: the device model keys devices by a per-browser hardware `deviceId`
  // (no principal binding), so the caller must supply the deviceId it is
  // acting as — the backend cannot infer it from the caller principal alone.
  public query ({ caller }) func callerHasEnterpriseRole(
    deviceId : Common.DeviceId,
    role : Devices.EnterpriseRole,
  ) : async Bool {
    if (AccessControl.isAdmin(accessControlState, caller)) {
      return true;
    };
    DevicesLib.deviceHasRole(devices, deviceId, role);
  };
};
