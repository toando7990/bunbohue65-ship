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
    // QR hết hạn (vượt expire_at) mà chưa thanh toán. VPS worker đẩy về qua
    // markPaymentExpired (HMAC) để tài xế có thể tạo QR mới cho đơn.
    #expired;
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
    // Mã 6 ký tự (chữ hoa + số, loại bỏ ký tự dễ nhầm 0/O 1/I), sinh ngẫu
    // nhiên phía VPS lúc tạo đơn. Khách xem/copy trong "Theo dõi đơn" và tự
    // báo cho tài xế (gọi điện, nhắn tin...) — tài xế đọc mã này cho nhân
    // viên quán khi đến lấy hàng, thay cho việc nhân viên tự bấm "Thanh
    // toán" mà không chắc tài xế đã thực sự có mặt. listPendingPaymentOrders
    // (Hàng đợi thanh toán) PHẢI ẩn field này khỏi mọi caller không phải
    // admin — xem core-api.mo.
    pickupCode : Text;
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
    // billId: mã bill Tingee (cần để VPS worker poll getDynamicQrStatus).
    // Optional — null khi chưa tạo bill QR.
    billId : ?Text;
    // qrCode: mã QR thanh toán (VietQR EMV) do VPS worker tạo và đẩy về qua
    // updateOrderQr. Optional — null khi chưa có QR.
    qrCode : ?Text;
    // expireAt: thời điểm hết hạn QR (Unix timestamp, giây). Optional — null
    // khi chưa có QR.
    expireAt : ?Nat64;
    // kmDiscountAmount/voucherDiscountAmount (Giai đoạn 4c) — số tiền chiết
    // khấu ĐÃ ÁP DỤNG lúc tạo đơn, ĐÃ GỒM VAT (cùng đơn vị amount). Sao chép
    // từ VPS SQLite (đã có sẵn từ Giai đoạn 3e — km_discount_amount/
    // voucher_discount_amount) sang canister CHỈ ĐỂ HIỂN THỊ trên thẻ đơn
    // ("Theo dõi đơn") — canister không tự tính lại, VPS là nguồn xác nhận
    // cuối cùng (applyPromotion/applyVoucher). 0 nếu đơn không có chiết
    // khấu loại đó (mặc định, không cần Optional).
    kmDiscountAmount : Nat;
    voucherDiscountAmount : Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  // A registered device (POS / driver / cashier) tied to a restaurant
  public type Device = {
    deviceId : Text;
    restaurantId : Text;
    role : DeviceRole;
    // Tên nhân viên đang dùng thiết bị + SĐT liên hệ trực tiếp của họ — khách
    // xem SĐT này trên thẻ đơn ("Theo dõi đơn") thay vì chỉ có địa chỉ nhà
    // hàng. Do NHÂN VIÊN tự nhập lúc kích hoạt thiết bị (điện thoại cá nhân
    // của họ), không phải admin nhập trước. Thiết bị kích hoạt trước tính
    // năng này có 2 field rỗng — frontend fallback về Restaurant.phone.
    name : Text;
    phone : Text;
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
