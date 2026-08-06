import Result "mo:core/Result";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Int "mo:core/Int";
import Time "mo:core/Time";
import CoreTypes "../types/core";
import CoreLib "../lib/core";
import HmacLib "../lib/hmac";

// Public API surface for the core domain. State is injected from main.mo.
// This mixin owns ONLY the 7 order/secret methods. Devices, menus, and
// restaurants live in their own mixins (devices-api, menu-api) — do not
// re-declare them here.
mixin (state : CoreLib.State) {
  // --- Orders (VPS push, HMAC-verified; not public to end users) ---
  // createOrder is invoked by the VPS worker with an HMAC over
  // orderId|restaurantId|amount|goodsAmount. On success a new Order is created
  // with bookingStatus=#confirmed, paymentStatus=#unpaid, invoiceStatus=#none.
  public shared func createOrder(
    orderId : Text,
    restaurantId : Text,
    cusName : Text,
    cusPhone : Text,
    cusAddress : Text,
    cusTaxCode : Text,
    receiverEmail : Text,
    items : [CoreTypes.OrderItem],
    amount : Nat,
    goodsAmount : Nat,
    shippingFee : Nat,
    taxTotal : Nat,
    ahamoveOrderId : Text,
    tingeeQrId : Text,
    sharedLink : Text,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    let payload = orderId # "|" # restaurantId # "|" # Int.toText(amount) # "|" # Int.toText(goodsAmount);
    if (not HmacLib.verifyHmac(state.vpsSecret, state.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let now = Time.now();
    let order : CoreTypes.Order = {
      orderId;
      restaurantId;
      cusName;
      cusPhone;
      cusAddress;
      cusTaxCode;
      receiverEmail;
      items;
      amount;
      goodsAmount;
      shippingFee;
      taxTotal;
      bookingStatus = #confirmed;
      paymentStatus = #unpaid;
      invoiceStatus = #none;
      ahamoveOrderId;
      tingeeQrId;
      sharedLink;
      invoiceId = "";
      // Chưa có PDF khi mới tạo order — VPS sẽ đẩy pdfUrl ngược qua
      // updateInvoiceStatus sau khi lấy PDF qua mã lệnh 818.
      pdfUrl = "";
      createdAt = now;
      updatedAt = now;
    };
    CoreLib.createOrder(state, order);
    #ok(order);
  };

  public shared func listOrders() : async [CoreTypes.Order] {
    CoreLib.listOrders(state);
  };

  public shared func getOrder(orderId : Text) : async Result.Result<CoreTypes.Order, Text> {
    Result.fromOption(CoreLib.getOrder(state, orderId), "Order not found");
  };

  // Lightweight status snapshot for the frontend 5s poll.
  public shared query func getOrderStatus(
    orderId : Text,
  ) : async Result.Result<CoreTypes.OrderStatus, Text> {
    Result.fromOption(CoreLib.getOrderStatus(state, orderId), "Order not found");
  };

  public shared func listPendingPaymentOrders(
    restaurantId : Text,
  ) : async [CoreTypes.Order] {
    CoreLib.listPendingPaymentOrders(state, restaurantId);
  };

  // cancelOrder verifies HMAC over the orderId-only payload and sets
  // bookingStatus=#cancelled.
  public shared func cancelOrder(
    orderId : Text,
    hmac : Text,
  ) : async Result.Result<CoreTypes.Order, Text> {
    if (not HmacLib.verifyHmac(state.vpsSecret, state.vpsSecretPrevious, orderId, hmac)) {
      return #err("Invalid HMAC");
    };
    Result.fromOption(CoreLib.cancelOrder(state, orderId), "Order not found");
  };
};
