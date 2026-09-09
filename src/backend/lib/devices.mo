import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Char "mo:core/Char";
import Nat64 "mo:core/Nat64";

import Common "../types/common";
import Devices "../types/devices";

module {
  public type Device = Devices.Device;
  public type PendingActivation = Devices.PendingActivation;
  public type DeviceRole = Devices.DeviceRole;
  public type EnterpriseRole = Devices.EnterpriseRole;

  // Stable storage shapes used by the actor.
  public type DevicesStore = Map.Map<Common.DeviceId, Device>;
  public type PendingActivationsStore = Map.Map<Text, PendingActivation>;

  // 15 minutes in nanoseconds (Time.now() unit). Static expression — module
  // `let` fields cannot contain operators, so the constant is precomputed.
  public let ACTIVATION_TTL_NS : Nat = 900000000000;

  // Charset for 6-char uppercase alphanumeric activation codes.
  let CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  // Mutable PRNG state record — passed by reference so advances persist across
  // calls within a single activation flow. Cannot live at module level (M0014:
  // module `let`/`var` fields must be static), so callers own it and thread it
  // through generateCode / createPendingActivation.
  public type PrngState = { var state : Nat; var seeded : Bool };

  // Create a fresh PRNG state record. Callers that need a stateful PRNG across
  // multiple calls should hold the returned record and pass it back in.
  public func newPrngState() : PrngState {
    { var state = 0; var seeded = false };
  };

  // Advance the xorshift64 PRNG by one step and return the next 64-bit-ish
  // value as a Nat. Uses the classic xorshift64 constants. Operates on Nat64
  // to keep bit ops well-defined; converts to Nat at the end.
  func nextRandom(prng : PrngState) : Nat {
    if (not prng.seeded) {
      // Seed from Time.now(); mask to 64 bits via Nat64 and avoid 0 seed
      // (xorshift would stall at 0) by OR-ing in a 1 bit.
      let now64 : Nat64 = Nat64.fromIntWrap(Time.now());
      prng.state := Nat64.toNat(now64 | 1);
      prng.seeded := true;
    };
    var x : Nat64 = Nat64.fromIntWrap(prng.state);
    x := x ^ (x << 13);
    x := x ^ (x >> 7);
    x := x ^ (x << 17);
    prng.state := x.toNat();
    x.toNat();
  };

  // Generate a fresh 6-char uppercase alphanumeric activation code.
  public func generateCode(prng : PrngState) : Text {
    let charsetSize = CODE_CHARSET.size();
    var code = "";
    var i = 0;
    while (i < 6) {
      let idx = nextRandom(prng) % charsetSize;
      let chars = CODE_CHARSET.chars().toArray();
      let char = chars[idx].toText();
      code := code # char;
      i += 1;
    };
    code;
  };

  // Issue a pending activation for a restaurant + role, store it, return it.
  // `role` may be any DeviceRole including the 3 enterprise roles, so an admin
  // can issue an activation code that binds an enterprise role to a device.
  public func createPendingActivation(
    store : PendingActivationsStore,
    restaurantId : Common.RestaurantId,
    role : DeviceRole,
    prng : PrngState,
  ) : PendingActivation {
    let code = generateCode(prng);
    let now = Time.now();
    let activation : PendingActivation = {
      code;
      restaurantId;
      role;
      createdAt = now;
      expiresAt = now + ACTIVATION_TTL_NS;
      used = false;
    };
    store.add(code, activation);
    activation;
  };

  // Validate + consume a code, then create and store the resulting Device.
  public func activateDevice(
    pendingStore : PendingActivationsStore,
    devicesStore : DevicesStore,
    code : Text,
    deviceId : Common.DeviceId,
    name : Text,
    phone : Text,
    now : Common.Timestamp,
  ) : Result.Result<Device, Text> {
    switch (pendingStore.get(code)) {
      case null { #err("Invalid code") };
      case (?a) {
        if (a.used or now >= a.expiresAt) {
          #err("Expired or used");
        } else {
          let updated : PendingActivation = { a with used = true };
          pendingStore.add(code, updated);
          let device : Device = {
            deviceId;
            restaurantId = a.restaurantId;
            role = a.role;
            name;
            phone;
            activatedAt = now;
            active = true;
          };
          devicesStore.add(deviceId, device);
          #ok(device);
        };
      };
    };
  };

  // Revoke (deactivate) a device by id; returns the revoked device.
  public func revokeDevice(
    store : DevicesStore,
    deviceId : Common.DeviceId,
  ) : Result.Result<Device, Text> {
    switch (store.get(deviceId)) {
      case null { #err("Not found") };
      case (?d) {
        let updated : Device = { d with active = false };
        store.add(deviceId, updated);
        #ok(updated);
      };
    };
  };

  // Remove expired or used pending activations; returns count removed.
  public func cleanupExpiredActivations(
    store : PendingActivationsStore,
    now : Common.Timestamp,
  ) : Nat {
    var count = 0;
    let snapshot = store.toArray();
    for ((code, a) in snapshot.values()) {
      if (now >= a.expiresAt or a.used) {
        store.remove(code);
        count += 1;
      };
    };
    count;
  };

  // List ALL devices (both active and revoked) for a restaurant. Revoked
  // devices (active=false) are included so the admin UI can display their
  // revoked state. The `active` field on each returned Device tells the caller
  // whether it is currently usable.
  public func listDevicesByRestaurant(
    store : DevicesStore,
    restaurantId : Common.RestaurantId,
  ) : [Device] {
    store.toArray()
      .filter(func((_id, d) : (Common.DeviceId, Device)) : Bool {
        Text.equal(d.restaurantId, restaurantId);
      })
      .map(func((_id, d) : (Common.DeviceId, Device)) : Device { d });
  };

  // List ALL devices (both active and revoked) for a role. Revoked devices
  // (active=false) are included so the admin UI can display their revoked
  // state. The `active` field on each returned Device tells the caller whether
  // it is currently usable.
  public func listDevicesByRole(
    store : DevicesStore,
    role : DeviceRole,
  ) : [Device] {
    store.toArray()
      .filter(func((_id, d) : (Common.DeviceId, Device)) : Bool {
        d.role == role;
      })
      .map(func((_id, d) : (Common.DeviceId, Device)) : Device { d });
  };

  // CONTRACT — role-gating helper. Returns true when the given DeviceRole is
  // one of the 3 enterprise roles. Used by the devices-api mixin to gate
  // enterprise business APIs (payment queue / accounting / sales+promo
  // reporting) to devices bound to the matching enterprise role.
  public func isEnterpriseRole(role : DeviceRole) : Bool {
    switch role {
      case (#paymentQueue) true;
      case (#accounting) true;
      case (#salesPromoReporting) true;
      case (_) false;
    };
  };

  // CONTRACT — role-gating helper. Returns true when the given DeviceRole
  // matches the requested enterprise role. Used to gate a specific business
  // API to the device role that owns it.
  public func hasEnterpriseRole(role : DeviceRole, required : EnterpriseRole) : Bool {
    switch (role, required) {
      case (#paymentQueue, #paymentQueue) true;
      case (#accounting, #accounting) true;
      case (#salesPromoReporting, #salesPromoReporting) true;
      case (_) false;
    };
  };

  // CONTRACT — role-gating helper. Returns true when the device identified by
  // `deviceId` exists, is active, and is bound to the requested enterprise
  // role. Used by the business-API mixins (payment queue / accounting /
  // sales+promo reporting) to gate their endpoints to the matching enterprise
  // device role. Admin gating is handled separately by the caller via
  // AccessControl.isAdmin — this helper only checks the device role.
  public func deviceHasRole(
    store : DevicesStore,
    deviceId : Common.DeviceId,
    required : EnterpriseRole,
  ) : Bool {
    switch (store.get(deviceId)) {
      case null { false };
      case (?d) { d.active and hasEnterpriseRole(d.role, required) };
    };
  };
};
