import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Iter "mo:core/Iter";

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

import CoreLib "lib/core";
import CoreTypes "types/core";
import DevicesLib "lib/devices";
import MenuLib "lib/menu";
import SecretTypes "types/secret";

// Top-level Value modules so the OQL auto-derivation resolver picks them up
// for the variant fields on the exposed entities.
import DeviceRoleValue "types/DeviceRoleValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import IntValue "mo:caffeineai-oql/IntValue";
import NatValue "mo:caffeineai-oql/NatValue";
import RecordValue "mo:caffeineai-oql/RecordValue";
import TextValue "mo:caffeineai-oql/TextValue";

actor Main {
  // Authorization state — transient (re-initialized on restart, as before).
  transient let accessControlState = AccessControl.initState();

  // Stable state — initialized by the migration chain (no inline initializers).
  // The 8 stable vars below are supplied by migrations/20260805_140700.mo.
  let vpsSecret : Text;
  let vpsSecretPrevious : Text;
  let admin : Principal;
  let orders : Map.Map<Text, CoreTypes.Order>;
  let devices : Map.Map<Text, CoreTypes.Device>;
  let pendingActivations : Map.Map<Text, CoreTypes.PendingActivation>;
  let menus : Map.Map<Text, CoreTypes.MenuItem>;
  let restaurants : Map.Map<Text, CoreTypes.Restaurant>;
  let restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;

  // Mutable secret-state record shared with the secret domain. Wraps the two
  // stable secret vars by reference so mixin mutations propagate to actor state.
  transient let secretState : SecretTypes.SecretState = {
    var vpsSecret = vpsSecret;
    var vpsSecretPrevious = vpsSecretPrevious;
  };

  // Core domain state record shared with the core-api mixin.
  transient let coreState : CoreLib.State = {
    var vpsSecret = vpsSecret;
    var vpsSecretPrevious = vpsSecretPrevious;
    var admin = admin;
    var orders = orders;
    var devices = devices;
    var pendingActivations = pendingActivations;
    var menus = menus;
    var restaurants = restaurants;
    var restaurantMenuOverrides = restaurantMenuOverrides;
  };

  include MixinAuthorization(accessControlState, null);
  include CoreApi(coreState);
  include HmacApi(orders, vpsSecret, vpsSecretPrevious);
  include DevicesApi(accessControlState, devices, pendingActivations);
  include UpgradeApi(accessControlState, orders, devices, pendingActivations, menus, restaurants, restaurantMenuOverrides);
  include SecretApi(secretState, accessControlState);
  include MenuApi(accessControlState, menus, restaurants, restaurantMenuOverrides);

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
    case (#completed) "completed";
    case (#cancelled) "cancelled";
  };
  func paymentStatusText(s : CoreTypes.PaymentStatus) : Text = switch s {
    case (#unpaid) "unpaid";
    case (#paid) "paid";
    case (#refunded) "refunded";
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
          sharedLink = "";
          invoiceId = "";
          pdfUrl = "";
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
        .payload("amount", func(o : CoreTypes.Order) : Nat = o.amount)
        .payload("goodsAmount", func(o : CoreTypes.Order) : Nat = o.goodsAmount)
        .payload("shippingFee", func(o : CoreTypes.Order) : Nat = o.shippingFee)
        .payload("taxTotal", func(o : CoreTypes.Order) : Nat = o.taxTotal)
        .payload("bookingStatus", func(o : CoreTypes.Order) : Text = bookingStatusText(o.bookingStatus))
        .payload("paymentStatus", func(o : CoreTypes.Order) : Text = paymentStatusText(o.paymentStatus))
        .payload("invoiceStatus", func(o : CoreTypes.Order) : Text = invoiceStatusText(o.invoiceStatus))
        .payload("ahamoveOrderId", func(o : CoreTypes.Order) : Text = o.ahamoveOrderId)
        .payload("tingeeQrId", func(o : CoreTypes.Order) : Text = o.tingeeQrId)
        .payload("sharedLink", func(o : CoreTypes.Order) : Text = o.sharedLink)
        .payload("invoiceId", func(o : CoreTypes.Order) : Text = o.invoiceId)
        // pdfUrl: URL file PDF hoá đơn điện tử (do VPS lấy qua mã lệnh 818 và
        // đẩy ngược qua updateInvoiceStatus). Rỗng khi chưa có PDF.
        .payload("pdfUrl", func(o : CoreTypes.Order) : Text = o.pdfUrl)
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
          activatedAt = 0;
          active = false;
        },
      )
        .controllerOnly()
        .build(),

      // menus: all-primitive record — auto-derive.
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
          imageUrl = "";
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
    ];
  });
};
