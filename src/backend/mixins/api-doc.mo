// Behavioral API documentation for the backend. Static Markdown returned by
// getApiDoc — no runtime state is read, so the mixin takes no parameters.
mixin () {
  public query func getApiDoc() : async Text {
    "# Bunbohue65 Backend API

## Purpose

The Bunbohue65 backend is a Motoko canister that powers the Bunbohue65
restaurant ordering app. It manages device activation and revocation, orders,
menus, restaurants, promotions, vouchers, payment mode, store hours, and email
verification. This document focuses on the **device** domain and its public
API.

## Device domain

Devices (POS / driver / cashier tablets) are registered to a restaurant through
a one-time activation code. Each device carries a role (`#admin`, `#driver`, or
`#cashier`) and an `active` flag that controls whether it may operate.

### Public methods

- `generateActivationCode(restaurantId : Text, role : DeviceRole) : async Result<{ code : Text; restaurantId : Text; role : DeviceRole; createdAt : Int; expiresAt : Int; used : Bool }, Text>` — Issues a 6-character uppercase-alphanumeric activation code bound to a restaurant and role. **Admin only.** The code expires after 15 minutes.
- `activateDevice(code : Text, deviceId : Text, name : Text, phone : Text) : async Result<Device, Text>` — Consumes a valid, unexpired pending activation and registers a device with `active = true`. **Public** (no admin required). `name`/`phone` are the employee's own name and contact phone entered at activation time. Returns `#err(\"Invalid code\")` for an unknown code, or `#err(\"Expired or used\")` for an expired or already-consumed code.
- `revokeDevice(deviceId : Text) : async Result<Device, Text>` — Deactivates a device by setting its `active` field to `false`. **Admin only.** Returns `#err(\"Not found\")` for an unknown device. A revoked device remains in storage but can no longer operate.
- `cleanupExpiredActivations() : async Nat` — Removes expired or used pending activations and returns the count removed. **Admin only.** Returns `0` for a non-admin caller.
- `listDevicesByRestaurant(restaurantId : Text) : async [Device]` — Returns **all** devices for a restaurant, both active and revoked. **Query** (no auth gate).
- `listDevicesByRole(role : DeviceRole) : async [Device]` — Returns **all** devices with the given role, both active and revoked. **Query** (no auth gate).

### Device listing behavior

`listDevicesByRestaurant` and `listDevicesByRole` return **every** matching
device regardless of its `active` state. Revoked devices (`active = false`) are
included so the admin UI can display them as revoked rather than hiding them.
Each returned `Device` carries its own `active` field so the caller can
distinguish usable devices from revoked ones.

Revoking a device does **not** remove it from storage and does **not** change
the two list functions' behavior beyond the `active` flag. A revoked device is
still returned by both list functions, but with `active = false`.

### Revoked devices cannot operate

The `active` flag is the single source of truth for whether a device may
operate. A revoked device (`active = false`) must not be used for business
operations. Activation is one-way: `activateDevice` only ever creates a device
with `active = true` from a pending activation; it never re-activates an
existing revoked device. `revokeDevice` only ever flips `active` to `false`.
There is no endpoint that re-activates a revoked device.

## Authentication and authorization

The app's frontend pins an Internet Identity derivation origin, published at
`/.well-known/ii-derivation-origin` when available. An agent already holding
the user's Internet Identity authorization derives the correct per-app
principal against that origin (for example
`icp identity link web <name> --app <host>`). Such a delegation acts with the
user's full authority in this app until it expires.

Authorization is enforced on the backend via role-based access control. The
following device methods require a signed-in caller who is an **admin**:
`generateActivationCode`, `revokeDevice`, and `cleanupExpiredActivations`.
Non-admin callers receive `#err(\"Admin only\")` from `generateActivationCode`
and `revokeDevice`, and `0` from `cleanupExpiredActivations`.

`activateDevice` is **public** — any caller may consume a valid activation
code. `listDevicesByRestaurant` and `listDevicesByRole` are public **query**
methods with no auth gate.

## Units and encodings

- **Timestamps**: `createdAt`, `expiresAt`, and `activatedAt` are `Int`
  nanoseconds since the Unix epoch (matching `Time.now()`). `expiresAt` is
  `createdAt + 15 minutes` (900,000,000,000 ns).
- **Identifiers**: `deviceId` and `restaurantId` are `Text`.
- **Activation codes**: 6-character uppercase alphanumeric strings
  (`A-Z0-9`). They are single-use and expire 15 minutes after creation.
- **DeviceRole**: a variant — `#admin`, `#driver`, or `#cashier`.
- **Device.active**: a `Bool` — `true` means the device is currently usable,
  `false` means it has been revoked.

## Lifecycle and polling rules

A device lifecycle is: pending activation (code issued) → activated
(`active = true`) → revoked (`active = false`). There is no re-activation path.

`cleanupExpiredActivations` is a maintenance operation that removes stale
pending activations. It is safe to call periodically; it is idempotent in the
sense that already-removed codes are simply absent.

## Mutation retry safety

- `activateDevice` is **not** idempotent: consuming a code marks it `used`, so
  retrying the same call returns `#err(\"Expired or used\")`. Do not retry an
  activation that already succeeded.
- `revokeDevice` is idempotent: revoking an already-revoked device succeeds and
  returns the device with `active = false`.
- `generateActivationCode` creates a fresh code on every call; each call is
  independent.

## Errors, traps, limits, and gotchas

- `activateDevice` returns `#err(\"Invalid code\")` for an unknown code and
  `#err(\"Expired or used\")` for an expired or already-consumed code.
- `revokeDevice` returns `#err(\"Not found\")` for an unknown device.
- Activation codes expire 15 minutes after creation; an expired code cannot be
  used.
- A revoked device is still listed by `listDevicesByRestaurant` and
  `listDevicesByRole` (with `active = false`) — it is not hidden, but it must
  not be used for operations.
"
  };
};
