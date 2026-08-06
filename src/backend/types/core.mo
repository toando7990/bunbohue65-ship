import Map "mo:core/Map";

module {
  // Stable identifier for an order (matches Order.orderId).
  public type OrderId = Text;

  // Stable storage shape for the orders collection (keyed by OrderId).
  public type OrderStore = Map.Map<Text, Order>;

  // Order lifecycle status
  public type BookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #completed;
    #cancelled;
  };

  // Payment status
  public type PaymentStatus = {
    #unpaid;
    #paid;
    #refunded;
  };

  // E-invoice issuance status
  public type InvoiceStatus = {
    #none;
    #invoiced;
    #failed;
  };

  // Device role assigned to a registered POS/driver/cashier device
  public type DeviceRole = {
    #admin;
    #driver;
    #cashier;
  };

  // Single line item inside an order
  public type OrderItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    quantity : Nat;
    unitName : Text;
    vatRate : Nat;
  };

  // A sales order — source of truth, created via VPS push + HMAC verification
  public type Order = {
    orderId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    items : [OrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : BookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    invoiceId : Text;
    // URL của file PDF hoá đơn điện tử (do VPS lấy qua mã lệnh 818 và đẩy
    // ngược về canister qua updateInvoiceStatus). Rỗng khi chưa có PDF.
    // Đây là field riêng, KHÔNG phải variant InvoiceStatus mới — giữ #invoiced
    // làm trạng thái đã xuất hoá đơn, pdfUrl chỉ bổ sung URL file PDF.
    pdfUrl : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // A registered device (POS / driver / cashier) tied to a restaurant
  public type Device = {
    deviceId : Text;
    restaurantId : Text;
    role : DeviceRole;
    activatedAt : Int;
    active : Bool;
  };

  // A pending device activation code (one-time, expires)
  public type PendingActivation = {
    code : Text;
    restaurantId : Text;
    role : DeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };

  // A menu item offered by the (default) restaurant
  public type MenuItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    imageUrl : Text;
    visible : Bool;
  };

  // A restaurant (currently single-tenant: Bunbohue65)
  public type Restaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
  };

  // Lightweight status snapshot returned to the frontend poll (5s)
  public type OrderStatus = {
    bookingStatus : BookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    tingeeQrId : Text;
    sharedLink : Text;
    invoiceId : Text;
    // URL file PDF hoá đơn điện tử (đồng bộ với Order.pdfUrl).
    pdfUrl : Text;
  };
};
