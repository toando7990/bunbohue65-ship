import Map "mo:core/Map";

module {
  // Stable identifier for an order (matches Order.orderId).
  public type OrderId = Text;

  // Stable storage shape for the orders collection (keyed by OrderId).
  public type OrderStore = Map.Map<Text, Order>;

  // Order lifecycle status. #pickedUp (Tài xế đã nhận hàng) is the terminal
  // status in customer-payment mode: markPickedUp transitions a #confirmed AND
  // #paid order to #pickedUp, ending the order lifecycle without shipping.
  public type BookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #completed;
    #cancelled;
    #pickedUp;
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

  // A sales order — source of truth, created via VPS push + HMAC verification.
  // tingeeQrCode holds the raw VietQR EMV string from Tingee, separate from
  // sharedLink (Ahamove tracking) and tingeeQrId (Tingee QR identifier).
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
    // Chuỗi VietQR EMV thô từ Tingee (ví dụ "00020101021238570010A000000727...").
    // Tách biệt với sharedLink (link theo dõi Ahamove) và tách biệt với
    // tingeeQrId (mã định danh QR Tingee). Rỗng khi chưa có QR thanh toán.
    tingeeQrCode : Text;
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

  // A menu item offered by the (default) restaurant.
  // `image` holds the dish image bytes directly in canister state (Blob),
  // replacing the previous VPS-hosted `imageUrl` string. The image is resized
  // to max 800x800 (aspect ratio kept) and encoded as JPEG quality 85 before
  // upload, so it stays well under the 2MB canister message/storage limit.
  public type MenuItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    image : Blob;
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

  // Lightweight status snapshot returned to the frontend poll (5s). Carries no
  // PII. tingeeQrCode is included so OrderTracker.tsx can render the QR via
  // <QRCodeSVG value={status.tingeeQrCode} /> when paymentStatus is #unpaid.
  public type OrderStatus = {
    bookingStatus : BookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    tingeeQrId : Text;
    sharedLink : Text;
    // Chuỗi VietQR EMV thô từ Tingee, đồng bộ với Order.tingeeQrCode để
    // frontend hiển thị QR thanh toán khi đơn chưa paid.
    tingeeQrCode : Text;
    invoiceId : Text;
    // URL file PDF hoá đơn điện tử (đồng bộ với Order.pdfUrl).
    pdfUrl : Text;
  };
};
