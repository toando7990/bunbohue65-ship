import CoreTypes "core";

// Device-domain types.
//
// Canonical device types (DeviceRole, Device, PendingActivation) are owned by
// the `core` domain and imported from `types/core`. This file re-exports them
// so device-domain consumers can import a single `Devices` module, and may
// declare device-domain-local types if needed.
module {
  public type DeviceRole = CoreTypes.DeviceRole;
  public type Device = CoreTypes.Device;
  public type PendingActivation = CoreTypes.PendingActivation;
};
