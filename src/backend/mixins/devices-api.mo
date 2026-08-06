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
  public shared ({ caller }) func activateDevice(
    code : Text,
    deviceId : Common.DeviceId,
  ) : async Result.Result<Devices.Device, Text> {
    ignore caller;
    DevicesLib.activateDevice(
      pendingActivations,
      devices,
      code,
      deviceId,
      Int.abs(Time.now()),
    );
  };

  // Revoke a device immediately. Admin only.
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

  // List active devices for a restaurant.
  public query func listDevicesByRestaurant(
    restaurantId : Common.RestaurantId,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRestaurant(devices, restaurantId);
  };

  // List active devices for a role.
  public query func listDevicesByRole(
    role : Devices.DeviceRole,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRole(devices, role);
  };
};
