import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Iter "mo:core/Iter";
import Nat64 "mo:core/Nat64";
import Option "mo:core/Option";

import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import MapEntity "mo:caffeineai-oql/MapEntity";

import CoreApi "mixins/core-api";
import HmacApi "mixins/hmac-api";
import DevicesApi "mixins/devices-api";
import UpgradeApi "mixins/upgrade-api";
import SecretApi "mixins/secret-api";
import MenuApi "mixins/menu-api";
import MenuSeedApi "mixins/menu-seed-api";
import EmailVerificationApi "mixins/email-verification-api";
import PromotionApi "mixins/promotion-api";
import PaymentModeConfigApi "mixins/payment-mode-config-api";
import StoreHoursConfigApi "mixins/store-hours-config-api";

import CoreLib "lib/core";
import CoreTypes "types/core";
import MenuSeedLib "lib/menu-seed";
import SecretLib "lib/secret";
import SecretTypes "types/secret";
import AccessControlLib "lib/access-control";
import EmailVerificationTypes "types/email-verification";
import PaymentModeConfigLib "lib/payment-mode-config";
import PaymentModeConfigTypes "types/payment-mode-config";
import StoreHoursConfigLib "lib/store-hours-config";
import StoreHoursConfigTypes "types/store-hours-config";
import PromotionTypes "types/promotion";
// Top-level Value modules so the OQL auto-derivation resolver picks them up
// for the variant fields on the exposed entities.
import DeviceRoleValue "types/DeviceRoleValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import IntValue "mo:caffeineai-oql/IntValue";
import NatValue "mo:caffeineai-oql/NatValue";
import RecordValue "mo:caffeineai-oql/RecordValue";
import TextValue "mo:caffeineai-oql/TextValue";
import BlobValue "mo:caffeineai-oql/BlobValue";

actor Main {
  // Authorization state — transient (re-initialized on restart, as before).
  transient let accessControlState = AccessControl.initState();

  // Stable state — initialized by the migration chain (no inline initializers).
  // The 8 stable vars below are supplied by migrations/20260805_140700.mo.
  //
  // vpsSecret / vpsSecretPrevious are declared `var` (mutable stable) so that
  // rotations performed via the transient `secretState` wrapper can be
  // persisted back to stable storage in `system func preupgrade`. With `let`
  // (immutable) the stable field could never capture a rotated value, so every
  // upgrade reset the secret to the migration's initial "" and broke HMAC
  // verification until an admin re-entered the secret on /admin.
  var vpsSecret : Text;
  var vpsSecretPrevious : Text;
  let admin : Principal;
  let orders : Map.Map<Text, CoreTypes.Order>;
  let devices : Map.Map<Text, CoreTypes.Device>;
  let pendingActivations : Map.Map<Text, CoreTypes.PendingActivation>;
  let menus : Map.Map<Text, CoreTypes.MenuItem>;
  let restaurants : Map.Map<Text, CoreTypes.Restaurant>;
  let restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;

  // Email OTP verification state — keyed by lower-cased email address. Supplied
  // by migrations/20260815_000000.mo (empty Map on fresh install/upgrade).
  let otpRecords : Map.Map<EmailVerificationTypes.Email, EmailVerificationTypes.OtpRecord>;

  // Global payment-mode flag (12th stable field). Controls who pays shipping:
  //   #driver   — default; the driver pays at pickup (existing flow)
  //   #customer — the customer pays; the order ends when the driver picks up
  //               the goods (markPickedUp sets bookingStatus=#pickedUp).
  // Supplied by migrations/20260817_000000.mo with default #driver on fresh
  // install/upgrade. Declared `var` (mutable stable) so that admin rotations
  // performed via the transient `paymentModeState` wrapper can be persisted
  // back to stable storage in `system func preupgrade` — same pattern as
  // `vpsSecret` / `vpsSecretPrevious` above.
  var paymentMode : PaymentModeConfigTypes.PaymentMode;

  // Global store open/close hours (13th stable field). Controls when the store
  // accepts orders: when the current time is outside [open, close), both the
  // driver and customer flows block order placement and show a waiting screen.
  // Applies to ALL stores (global only — per-store hours are out of scope).
  // Supplied by migrations/20260818_000000.mo with default 00:00–23:59 (always
  // open) on fresh install/upgrade. Declared `var` (mutable stable) so that
  // admin rotations performed via the transient `storeHoursState` wrapper can be
  // persisted back to stable storage in `system func preupgrade` — same pattern
  // as `paymentMode` / `vpsSecret` / `vpsSecretPrevious` above.
  var storeHours : StoreHoursConfigTypes.StoreHours;

  // Đếm lượt dùng khuyến mại (KM) trong ngày, theo (email, chương trình KM)
  // (14th stable field) — Giai đoạn 1 của hệ thống KM. Khoá composite dạng
  // "email|programCode|YYYYMMDD" (giờ VN) — xem lib/promotion.mo. Gộp cả 3
  // khung giờ KM/ngày của cùng 1 chương trình vào chung 1 bộ đếm. Chương
  // trình KM thật (Hệ 1/Hệ 2) là Giai đoạn 2/3 — bảng này chỉ mới có cấu
  // trúc đếm, chưa có gì đọc/ghi tới cho tới khi Giai đoạn 2 nối logic áp
  // dụng KM thật vào createOrder. Supplied by migrations/<ngày mới nhất>.mo
  // với Map rỗng trên upgrade — không đổi shape các field khác, an toàn.
  let kmUsage : PromotionTypes.KmUsageStore;

  // Stable shuttle for the transient `accessControlState` (line 36). The
  // access-control state is `transient let` — re-initialized empty on every
  // (re)start — so admin role assignments made at runtime via
  // `assignCallerUserRole` are lost across upgrades. This stable `var` pair
  // persists the role map across upgrades by serializing the non-shared
  // `Map.Map<Principal, UserRole>` into a shared `[(Principal, UserRole)]`
  // array. The preupgrade hook copies the live `accessControlState` into the
  // shuttle; the postupgrade hook re-seeds `accessControlState` from the
  // shuttle. Same pattern as `vpsSecret` / `vpsSecretPrevious` above.
  var accessControlShuttle : AccessControlLib.AccessControlShuttle;

  // Mutable secret-state record shared with the secret domain. Wraps the two
  // stable secret vars by reference so mixin mutations propagate to actor state.
  transient let secretState : SecretTypes.SecretState = {
    var vpsSecret = vpsSecret;
    var vpsSecretPrevious = vpsSecretPrevious;
  };

  // Mutable payment-mode-state record shared with the payment-mode-config
  // domain. Wraps the stable `var paymentMode` by reference so mixin mutations
  // (setPaymentMode) propagate to actor state — same shape as `secretState`.
  // The stable `var` is updated by the preupgrade hook (see
  // PaymentModeConfigLib.syncToStable) so the value survives upgrades.
  transient let paymentModeState : PaymentModeConfigTypes.PaymentModeState = {
    var paymentMode = paymentMode;
  };

  // Mutable store-hours-state record shared with the store-hours-config domain.
  // Wraps the stable `var storeHours` by reference so mixin mutations
  // (setStoreHours) propagate to actor state — same shape as `paymentModeState`.
  // The stable `var` is updated by the preupgrade hook (see
  // StoreHoursConfigLib.syncToStable) so the value survives upgrades.
  transient let storeHoursState : StoreHoursConfigTypes.StoreHoursState = {
    var storeHours = storeHours;
  };

  // Upgrade hooks: keep the stable `var vpsSecret` / `var vpsSecretPrevious`
  // pair in sync with the transient `secretState` wrapper across upgrades.
  //
  // `secretState` is `transient let` — it is rebuilt on every (re)start from the
  // stable `var` pair, copying their CURRENT values into fresh `var` fields of
  // the wrapper. That copy is one-way: when `setVpsSecret` rotates the secret it
  // mutates `secretState.vpsSecret`, but the stable `var vpsSecret` is NOT
  // updated. Without `preupgrade`, the stable `var` retains its pre-rotation
  // value (or the migration's initial "") and the next start rebuilds
  // `secretState` from that stale value — the secret resets.
  //
  //   preupgrade  : copy secretState.*  -> stable var*   (persist rotation)
  //   postupgrade : copy stable var*    -> secretState.*  (restore to wrapper)
  //
  // Motoko passes primitive `var` actor fields by value, so the helpers cannot
  // mutate the stable `var` pair directly. Instead each hook builds a fresh
  // `StableSecretRef` from the current stable values, hands it to the helper for
  // the copy, then writes the (possibly mutated) ref fields back to the stable
  // `var` pair. The ref is the by-reference shuttle between the transient
  // `secretState` wrapper and the stable `var` pair.
  //
  // Enhanced orthogonal persistence persists the stable `var` pair
  // automatically; the hooks only bridge the transient wrapper.
  system func preupgrade() {
    let ref : SecretTypes.StableSecretRef = {
      var vpsSecret = vpsSecret;
      var vpsSecretPrevious = vpsSecretPrevious;
    };
    SecretLib.syncToStable(secretState, ref);
    vpsSecret := ref.vpsSecret;
    vpsSecretPrevious := ref.vpsSecretPrevious;

    // Sync accessControlState -> accessControlShuttle AFTER the secret sync so
    // runtime admin role assignments survive the upgrade. `toStable` returns a
    // fresh shuttle record (the shuttle's `userRoles` field is immutable, so it
    // cannot be mutated in place); assign the returned shuttle to the stable
    // `accessControlShuttle` var.
    accessControlShuttle := AccessControlLib.toStable(accessControlState);

    // Sync paymentModeState -> stable `var paymentMode` so admin rotations
    // performed via setPaymentMode survive the upgrade. Same StablePaymentModeRef
    // shuttle pattern as the secret sync above: build a fresh ref from the
    // current stable value, hand it to the helper for the copy, then write the
    // (possibly mutated) ref field back to the stable `var`.
    let paymentModeRef : PaymentModeConfigTypes.StablePaymentModeRef = {
      var paymentMode = paymentMode;
    };
    PaymentModeConfigLib.syncToStable(paymentModeState, paymentModeRef);
    paymentMode := paymentModeRef.paymentMode;

    // Sync storeHoursState -> stable `var storeHours` so admin rotations
    // performed via setStoreHours survive the upgrade. Same StableStoreHoursRef
    // shuttle pattern as the paymentMode sync above.
    let storeHoursRef : StoreHoursConfigTypes.StableStoreHoursRef = {
      var storeHours = storeHours;
    };
    StoreHoursConfigLib.syncToStable(storeHoursState, storeHoursRef);
    storeHours := storeHoursRef.storeHours;
  };

  system func postupgrade() {
    let ref : SecretTypes.StableSecretRef = {
      var vpsSecret = vpsSecret;
      var vpsSecretPrevious = vpsSecretPrevious;
    };
    SecretLib.syncFromStable(secretState, ref);

    // Re-seed accessControlState <- accessControlShuttle AFTER restoring the
    // secret so the transient `accessControlState` (re-initialized empty at
    // line 36) picks up the persisted admin role assignments. The shuttle is a
    // stable `var` record (mutable by reference), so we can pass it directly.
    AccessControlLib.fromStable(accessControlState, accessControlShuttle);

    // Restore paymentModeState <- stable `var paymentMode` AFTER the access
    // control re-seed so the transient `paymentModeState` wrapper (rebuilt at
    // construction from the stable `var`) picks up the persisted value. Same
    // StablePaymentModeRef shuttle pattern as the secret restore above.
    let paymentModeRef : PaymentModeConfigTypes.StablePaymentModeRef = {
      var paymentMode = paymentMode;
    };
    PaymentModeConfigLib.syncFromStable(paymentModeState, paymentModeRef);

    // Restore storeHoursState <- stable `var storeHours` AFTER the paymentMode
    // restore so the transient `storeHoursState` wrapper (rebuilt at
    // construction from the stable `var`) picks up the persisted value. Same
    // StableStoreHoursRef shuttle pattern as the paymentMode restore above.
    let storeHoursRef : StoreHoursConfigTypes.StableStoreHoursRef = {
      var storeHours = storeHours;
    };
    StoreHoursConfigLib.syncFromStable(storeHoursState, storeHoursRef);

    // Idempotent menu seed: ensure the 'Dụng cụ đựng đồ ăn' item exists in the
    // 'Khác' category so the VPS can fetch its unit price when computing quotes.
    // Runs on every install/upgrade; no-ops when the item already exists.
    ignore MenuSeedLib.seedMenuItems(menus);
  };

  // Core domain state record shared with the core-api mixin. `secretState` is
  // the mutable-by-reference SecretState (see above) so createOrder/cancelOrder
  // read the LIVE secret pair via `state.secretState.vpsSecret` /
  // `state.secretState.vpsSecretPrevious` even after `setVpsSecret` rotates
  // them. The previous shape copied the secret into coreState's own var fields,
  // which froze the value at construction time and broke HMAC verification
  // after a rotation.
  transient let coreState : CoreLib.State = {
    var secretState = secretState;
    var admin = admin;
    var orders = orders;
    var devices = devices;
    var pendingActivations = pendingActivations;
    var menus = menus;
    var restaurants = restaurants;
    var restaurantMenuOverrides = restaurantMenuOverrides;
  };

  include MixinAuthorization(accessControlState, null);
  include CoreApi(accessControlState, coreState);
  include HmacApi(orders, secretState);
  include DevicesApi(accessControlState, devices, pendingActivations);
  include UpgradeApi(accessControlState, orders, devices, pendingActivations, menus, restaurants, restaurantMenuOverrides);
  include SecretApi(secretState, accessControlState);
  include MenuApi(accessControlState, menus, restaurants, restaurantMenuOverrides);
  include MenuSeedApi(accessControlState, menus);
  include EmailVerificationApi(otpRecords);
  include PromotionApi(kmUsage, secretState);
  include PaymentModeConfigApi(accessControlState, paymentModeState, coreState);
  include StoreHoursConfigApi(accessControlState, storeHoursState);

  /// Returns the canister's own id as text, so the VPS knows which canister
  /// it is talking to. `Principal.fromActor(Main)` resolves the actor's own
  /// canister principal at runtime (mo:core/IC.getCanisterId does not exist in
  /// core 2.6.1).
  public query func getCanisterIdText() : async Text {
    Principal.fromActor(Main).toText();
  };

  // Variant → text helpers for the manual orders entity. Local funcs keep the
  // payload extractors self-contained; the OQL column arrives as #text.
  func bookingStatusText(s : CoreTypes.BookingStatus) : Text = switch s {
    case (#pending) "pending";
    case (#confirmed) "confirmed";
    case (#shipping) "shipping";
    case (#pickedUp) "pickedUp";
    case (#completed) "completed";
    case (#cancelled) "cancelled";
  };
  func paymentStatusText(s : CoreTypes.PaymentStatus) : Text = switch s {
    case (#unpaid) "unpaid";
    case (#paid) "paid";
    case (#refunded) "refunded";
    case (#expired) "expired";
  };
  func invoiceStatusText(s : CoreTypes.InvoiceStatus) : Text = switch s {
    case (#none) "none";
    case (#invoiced) "invoiced";
    case (#failed) "failed";
  };

  // Flatten the nested Map<Text, Map<Text, Nat>> (restaurantId -> itemId ->
  // price override) into an iterator of flat records so the OQL manual entity
  // can auto-derive one row per (restaurantId, itemId, price) triple.
  func menuOverrideRows(
    overrides : Map.Map<Text, Map.Map<Text, Nat>>,
  ) : Iter.Iter<{ restaurantId : Text; itemId : Text; price : Nat }> {
    let outer = overrides.entries();
    var currentRestaurantId : Text = "";
    var inner : ?Iter.Iter<(Text, Nat)> = null;
    object {
      public func next() : ?{ restaurantId : Text; itemId : Text; price : Nat } {
        loop {
          switch (inner) {
            case (?it) {
              switch (it.next()) {
                case (?(itemId, price)) {
                  return ?{ restaurantId = currentRestaurantId; itemId; price };
                };
                case null { inner := null };
              };
            };
            case null {};
          };
          switch (outer.next()) {
            case (?(restaurantId, innerMap)) {
              currentRestaurantId := restaurantId;
              inner := ?innerMap.entries();
            };
            case null { return null };
          };
        };
      };
    };
  };

  // OQL exposure — operational data is admin-managed; controller-only keeps it
  // private to users while still answerable by the Data Intelligence agent.
  // pendingActivations are short-lived secrets and are NOT exposed.
  include Expose({
    entities = [
      // orders: manual mode because Order carries a [OrderItem] collection
      // field plus variant fields; auto-derive cannot flatten those. Promote
      // each primitive/variant column explicitly; items is dropped.
      Entity.sample(
        orders.toEntityManual(
          "order", "Order", "orderId",
        ),
        {
          orderId = "";
          restaurantId = "";
          cusName = "";
          cusPhone = "";
          cusAddress = "";
          cusTaxCode = "";
          receiverEmail = "";
          pickupCode = "";
          items = [];
          amount = 0;
          goodsAmount = 0;
          shippingFee = 0;
          taxTotal = 0;
          bookingStatus = #pending;
          paymentStatus = #unpaid;
          invoiceStatus = #none;
          ahamoveOrderId = "";
          tingeeQrId = "";
          tingeeQrCode = "";
          sharedLink = "";
          invoiceId = "";
          pdfUrl = "";
          billId = null;
          qrCode = null;
          expireAt = null;
          createdAt = 0;
          updatedAt = 0;
        },
      )
        .payload("orderId", func(o : CoreTypes.Order) : Text = o.orderId)
        .payload("restaurantId", func(o : CoreTypes.Order) : Text = o.restaurantId)
        .payload("cusName", func(o : CoreTypes.Order) : Text = o.cusName)
        .payload("cusPhone", func(o : CoreTypes.Order) : Text = o.cusPhone)
        .payload("cusAddress", func(o : CoreTypes.Order) : Text = o.cusAddress)
        .payload("cusTaxCode", func(o : CoreTypes.Order) : Text = o.cusTaxCode)
        .payload("receiverEmail", func(o : CoreTypes.Order) : Text = o.receiverEmail)
        .payload("pickupCode", func(o : CoreTypes.Order) : Text = o.pickupCode)
        .payload("amount", func(o : CoreTypes.Order) : Nat = o.amount)
        .payload("goodsAmount", func(o : CoreTypes.Order) : Nat = o.goodsAmount)
        .payload("shippingFee", func(o : CoreTypes.Order) : Nat = o.shippingFee)
        .payload("taxTotal", func(o : CoreTypes.Order) : Nat = o.taxTotal)
        .payload("bookingStatus", func(o : CoreTypes.Order) : Text = bookingStatusText(o.bookingStatus))
        .payload("paymentStatus", func(o : CoreTypes.Order) : Text = paymentStatusText(o.paymentStatus))
        .payload("invoiceStatus", func(o : CoreTypes.Order) : Text = invoiceStatusText(o.invoiceStatus))
        .payload("ahamoveOrderId", func(o : CoreTypes.Order) : Text = o.ahamoveOrderId)
        .payload("tingeeQrId", func(o : CoreTypes.Order) : Text = o.tingeeQrId)
        .payload("tingeeQrCode", func(o : CoreTypes.Order) : Text = o.tingeeQrCode)
        .payload("sharedLink", func(o : CoreTypes.Order) : Text = o.sharedLink)
        .payload("invoiceId", func(o : CoreTypes.Order) : Text = o.invoiceId)
        // pdfUrl: URL file PDF hoá đơn điện tử (do VPS lấy qua mã lệnh 818 và
        // đẩy ngược qua updateInvoiceStatus). Rỗng khi chưa có PDF.
        .payload("pdfUrl", func(o : CoreTypes.Order) : Text = o.pdfUrl)
        // billId / qrCode / expireAt: optional QR fields (order-payment). OQL
        // manual payloads need a flat value, so options collapse to a sentinel
        // ("" / 0) when null.
        .payload("billId", func(o : CoreTypes.Order) : Text = o.billId.get(""))
        .payload("qrCode", func(o : CoreTypes.Order) : Text = o.qrCode.get(""))
        .payload("expireAt", func(o : CoreTypes.Order) : Nat = o.expireAt.get(0 : Nat64).toNat())
        .payload("createdAt", func(o : CoreTypes.Order) : Int = o.createdAt)
        .payload("updatedAt", func(o : CoreTypes.Order) : Int = o.updatedAt)
        .controllerOnly()
        .build(),

      // devices: auto-derive works — DeviceRole has DeviceRoleValue.mo.
      Entity.sample(
        devices.toEntity(
          "device", "Device", "deviceId",
        ),
        {
          deviceId = "";
          restaurantId = "";
          role = #admin;
          name = "";
          phone = "";
          activatedAt = 0;
          active = false;
        },
      )
        .controllerOnly()
        .build(),

      // menus: all-primitive record — auto-derive (Blob via BlobValue).
      Entity.sample(
        menus.toEntity(
          "menuItem", "MenuItem", "itemId",
        ),
        {
          itemId = "";
          name = "";
          price = 0;
          unitName = "";
          vatRate = 0;
          category = "";
          image = ("" : Blob);
          visible = false;
        },
      )
        .controllerOnly()
        .build(),

      // restaurants: all-primitive record — auto-derive.
      Entity.sample(
        restaurants.toEntity(
          "restaurant", "Restaurant", "restaurantId",
        ),
        {
          restaurantId = "";
          name = "";
          address = "";
          phone = "";
          visible = false;
        },
      )
        .controllerOnly()
        .build(),

      // pendingActivations: short-lived activation codes. DeviceRole has a
      // DeviceRoleValue.mo so auto-derive handles the variant field.
      Entity.sample(
        pendingActivations.toEntity(
          "pendingActivation", "PendingActivation", "code",
        ),
        {
          code = "";
          restaurantId = "";
          role = #admin;
          createdAt = 0;
          expiresAt = 0;
          used = false;
        },
      )
        .controllerOnly()
        .build(),

      // restaurantMenuOverrides: Map<Text, Map<Text, Nat>> — a nested map
      // (restaurantId -> (itemId -> price override)). Flatten into one row per
      // (restaurantId, itemId) triple so each row is a flat record, then .edge
      // the promoted keys to the restaurant and menuItem entities.
      Entity.sample(
        Entity.manual<{ restaurantId : Text; itemId : Text; price : Nat }>(
          "menuOverride",
          func() = menuOverrideRows(restaurantMenuOverrides),
          "MenuOverride",
          "key",
        ),
        { restaurantId = ""; itemId = ""; price = 0 },
      )
        .payload("key", func(r) : Text = r.restaurantId # "|" # r.itemId)
        .payload("restaurantId", func(r) : Text = r.restaurantId)
        .edge("restaurantId", "restaurant")
        .payload("itemId", func(r) : Text = r.itemId)
        .edge("itemId", "menuItem")
        .payload("price", func(r) : Nat = r.price)
        .controllerOnly()
        .build(),

      // paymentMode: singleton config entity (one row). Manual mode over a
      // one-row iterator on paymentModeState so the global flag is queryable
      // by the Data Intelligence agent. controllerOnly keeps it private to
      // users. The single payload column "paymentMode" renders the variant
      // via PaymentModeConfigTypes.toText so the OQL column arrives as #text.
      Entity.sample(
        Entity.manual<PaymentModeConfigTypes.PaymentModeState>(
          "paymentMode",
          func() = (object {
            public func next() : ?PaymentModeConfigTypes.PaymentModeState {
              ?paymentModeState;
            };
          }),
          "PaymentMode",
          "paymentMode",
        ),
        { var paymentMode = #driver : PaymentModeConfigTypes.PaymentMode },
      )
        .payload("paymentMode", func(_ : PaymentModeConfigTypes.PaymentModeState) : Text = PaymentModeConfigTypes.toText(paymentModeState.paymentMode))
        .controllerOnly()
        .build(),

      // storeHours: singleton config entity (one row). Manual mode over a
      // one-row iterator on storeHoursState so the global open/close hours are
      // queryable by the Data Intelligence agent. controllerOnly keeps it
      // private to users. Each field of the StoreHours record is exposed as its
      // own Nat column (openHour/openMinute/closeHour/closeMinute, 24h clock).
      Entity.sample(
        Entity.manual<StoreHoursConfigTypes.StoreHoursState>(
          "storeHours",
          func() = (object {
            public func next() : ?StoreHoursConfigTypes.StoreHoursState {
              ?storeHoursState;
            };
          }),
          "StoreHours",
          "openHour",
        ),
        { var storeHours = StoreHoursConfigTypes.defaultStoreHours },
      )
        .payload("openHour", func(_ : StoreHoursConfigTypes.StoreHoursState) : Nat = storeHoursState.storeHours.openHour)
        .payload("openMinute", func(_ : StoreHoursConfigTypes.StoreHoursState) : Nat = storeHoursState.storeHours.openMinute)
        .payload("closeHour", func(_ : StoreHoursConfigTypes.StoreHoursState) : Nat = storeHoursState.storeHours.closeHour)
        .payload("closeMinute", func(_ : StoreHoursConfigTypes.StoreHoursState) : Nat = storeHoursState.storeHours.closeMinute)
        .controllerOnly()
        .build(),
    ];
  });
};
