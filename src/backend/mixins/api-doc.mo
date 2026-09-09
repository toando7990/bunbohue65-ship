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

Devices (POS / driver / cashier / enterprise tablets) are registered to a
restaurant through a one-time activation code. Each device carries a role and
an `active` flag that controls whether it may operate. The role set is
`#admin`, `#driver`, `#cashier`, plus three enterprise roles: `#paymentQueue`
(hàng đợi thanh toán), `#accounting` (kế toán), and `#salesPromoReporting`
(báo cáo bán hàng và KM). Enterprise roles are bound to a device at activation
time via a restaurant+role activation code, consistent with the
admin/driver/cashier flow. Menu/restaurant edit rights stay with `#admin` only.

### Public methods

- `generateActivationCode(restaurantId : Text, role : DeviceRole) : async Result<{ code : Text; restaurantId : Text; role : DeviceRole; createdAt : Int; expiresAt : Int; used : Bool }, Text>` — Issues a 6-character uppercase-alphanumeric activation code bound to a restaurant and role. **Admin only.** The code expires after 15 minutes.
- `activateDevice(code : Text, deviceId : Text, name : Text, phone : Text) : async Result<Device, Text>` — Consumes a valid, unexpired pending activation and registers a device with `active = true`. **Public** (no admin required). `name`/`phone` are the employee's own name and contact phone entered at activation time. Returns `#err(\"Invalid code\")` for an unknown code, or `#err(\"Expired or used\")` for an expired or already-consumed code.
- `revokeDevice(deviceId : Text) : async Result<Device, Text>` — Deactivates a device by setting its `active` field to `false`. **Admin only.** Returns `#err(\"Not found\")` for an unknown device. A revoked device remains in storage but can no longer operate.
- `cleanupExpiredActivations() : async Nat` — Removes expired or used pending activations and returns the count removed. **Admin only.** Returns `0` for a non-admin caller.
- `listDevicesByRestaurant(restaurantId : Text) : async [Device]` — Returns **all** devices for a restaurant, both active and revoked. **Query** (no auth gate).
- `listDevicesByRole(role : DeviceRole) : async [Device]` — Returns **all** devices with the given role, both active and revoked. **Query** (no auth gate). The admin device-management page uses this to display and filter devices by enterprise role.
- `callerHasEnterpriseRole(deviceId : Text, role : EnterpriseRole) : async Bool` — **Query**. Returns `true` when the caller is an admin, or when the device identified by `deviceId` is active and bound to the given enterprise role (`#paymentQueue`, `#accounting`, or `#salesPromoReporting`). Because the device model keys devices by a per-browser hardware `deviceId` with no principal binding, the caller must supply the `deviceId` it is acting as — the backend cannot infer it from the caller principal alone.

### Enterprise device roles

Enterprise roles are bound to a device at activation time via a
restaurant+role activation code (same flow as admin/driver/cashier). They gate
business APIs by device role rather than by HMAC:

- **`#paymentQueue`** (hàng đợi thanh toán): may list pending-payment orders
  (`listPendingPaymentOrders`) and manually confirm an order's payment
  (`confirmPaymentByDevice`).
- **`#accounting`** (kế toán): may look up orders with full PII and the payment
  verification image (`listOrders`, `getOrder`, `getOrdersByEmail`), manually
  clean up an order (`cleanupOrderByDevice`), and manually issue an e-invoice
  (`issueInvoiceByDevice`).
- **`#salesPromoReporting`** (báo cáo bán hàng và KM): may manage and track
  promotions, sales promos, and registration promos (the promotion/sales/registration
  CRUD endpoints), while admin retains full access.

Admin always passes every enterprise gate. Menu/restaurant edit rights remain
with `#admin` only — enterprise roles cannot edit menus or restaurants.

### Enterprise device-gated mutations

The existing order mutation endpoints (`updatePaymentStatus`,
`updateInvoiceStatus`, `cancelOrder`, `pruneOldOrdersNow`) are HMAC-verified VPS
endpoints that a device cannot call (a device cannot produce a valid HMAC).
These new endpoints let enterprise device roles perform their manual operations,
gated by device role instead of HMAC. The HMAC endpoints are unchanged for the
VPS.

- `confirmPaymentByDevice(deviceId : Text, orderId : Text) : async Result<Order, Text>` — Marks an order's payment as `#paid` manually. Gated to a `#paymentQueue` device or admin; other callers receive `#err(\"Payment queue role required\")`. Delegates to the same apply logic as the VPS endpoint, so a manual confirmation transitions a `#confirmed` order to `#pickedUp` exactly like an automated `#paid` update. Returns `#err(\"Order not found\")` for an unknown order.
- `cleanupOrderByDevice(deviceId : Text, orderId : Text) : async Result<Order, Text>` — Manually cleans up (cancels) an order. Gated to a `#accounting` device or admin; other callers receive `#err(\"Accounting role required\")`. Returns `#err(\"Order not found\")` for an unknown order.
- `issueInvoiceByDevice(deviceId : Text, orderId : Text, invoiceId : Text, pdfUrl : Text) : async Result<Order, Text>` — Manually issues an e-invoice for an order, writing `invoiceStatus = #invoiced` plus the supplied `invoiceId` and `pdfUrl`. Gated to a `#accounting` device or admin; other callers receive `#err(\"Accounting role required\")`. Returns `#err(\"Order not found\")` for an unknown order.

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

Enterprise device roles gate business APIs by device role. Because the device
model keys devices by a per-browser hardware `deviceId` with no principal
binding, the gated endpoints receive the caller's `deviceId` as a parameter and
the backend checks it against the device store (`deviceHasRole`). Admin always
passes every enterprise gate. The enterprise-gated mutation endpoints
(`confirmPaymentByDevice`, `cleanupOrderByDevice`, `issueInvoiceByDevice`)
return `#err(\"Payment queue role required\")` / `#err(\"Accounting role required\")`
when the caller is neither an admin nor a device bound to the required role.

## Units and encodings

- **Timestamps**: `createdAt`, `expiresAt`, and `activatedAt` are `Int`
  nanoseconds since the Unix epoch (matching `Time.now()`). `expiresAt` is
  `createdAt + 15 minutes` (900,000,000,000 ns).
- **Identifiers**: `deviceId` and `restaurantId` are `Text`.
- **Activation codes**: 6-character uppercase alphanumeric strings
  (`A-Z0-9`). They are single-use and expire 15 minutes after creation.
- **DeviceRole**: a variant — `#admin`, `#driver`, `#cashier`, `#paymentQueue`, `#accounting`, or `#salesPromoReporting`.
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
