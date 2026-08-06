import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import CoreTypes "../types/core";

// Domain logic for the core domain (orders).
// Stateless module functions operating on injected state. Device/menu/restaurant
// domains own their own lib modules (lib/devices.mo, lib/menu.mo) and are
// invoked directly by their mixins; this module only implements order logic.
module {
  public type Order = CoreTypes.Order;
  public type OrderItem = CoreTypes.OrderItem;
  public type Device = CoreTypes.Device;
  public type PendingActivation = CoreTypes.PendingActivation;
  public type MenuItem = CoreTypes.MenuItem;
  public type Restaurant = CoreTypes.Restaurant;
  public type OrderStatus = CoreTypes.OrderStatus;
  public type BookingStatus = CoreTypes.BookingStatus;
  public type PaymentStatus = CoreTypes.PaymentStatus;
  public type InvoiceStatus = CoreTypes.InvoiceStatus;

  // Stable state shape passed in from the actor / mixin layer.
  public type State = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    var admin : Principal;
    var orders : Map.Map<Text, Order>;
    var devices : Map.Map<Text, Device>;
    var pendingActivations : Map.Map<Text, PendingActivation>;
    var menus : Map.Map<Text, MenuItem>;
    var restaurants : Map.Map<Text, Restaurant>;
    var restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  // --- Orders ---
  public func createOrder(state : State, order : Order) : () {
    state.orders.add(order.orderId, order);
  };

  public func listOrders(state : State) : [Order] {
    state.orders.toArray().map(func((_id : Text, o : Order)) : Order { o });
  };

  public func getOrder(state : State, orderId : Text) : ?Order {
    state.orders.get(orderId);
  };

  public func getOrderStatus(state : State, orderId : Text) : ?OrderStatus {
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        ?{
          bookingStatus = o.bookingStatus;
          paymentStatus = o.paymentStatus;
          invoiceStatus = o.invoiceStatus;
          tingeeQrId = o.tingeeQrId;
          sharedLink = o.sharedLink;
          invoiceId = o.invoiceId;
          // Đồng bộ pdfUrl từ Order sang snapshot cho frontend poll.
          pdfUrl = o.pdfUrl;
        };
      };
    };
  };

  public func listPendingPaymentOrders(
    state : State,
    restaurantId : Text,
  ) : [Order] {
    let pending = state.orders.toArray()
      .filter(func((_id : Text, o : Order)) : Bool {
        Text.equal(o.restaurantId, restaurantId) and o.paymentStatus == #unpaid and o.bookingStatus != #cancelled;
      })
      .map(func((_id : Text, o : Order)) : Order { o });
    let sorted = pending.sort(func(a : Order, b : Order) : { #less; #equal; #greater } {
      Int.compare(a.createdAt, b.createdAt);
    });
    sorted;
  };

  public func cancelOrder(state : State, orderId : Text) : ?Order {
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        let updated : Order = { o with bookingStatus = #cancelled; updatedAt = Time.now() };
        state.orders.add(orderId, updated);
        ?updated;
      };
    };
  };
};
