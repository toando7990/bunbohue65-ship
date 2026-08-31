// Frontend types matching backend.d.ts (re-exported for app use).
// BigInt amounts are in VND smallest-unit (đồng). Status enums mirror backend.
// Enums (BookingStatus, PaymentStatus, InvoiceStatus, DeviceRole, UserRole) are
// runtime values from @/backend — re-export without `type` modifier so callers
// can use them as object keys / discriminant values, not just type positions.
export {
  BookingStatus,
  PaymentStatus,
  InvoiceStatus,
  DeviceRole,
  UserRole,
} from "@/backend";

export type {
  Order,
  OrderItem,
  OrderStatus,
  OrderId,
  Device,
  DeviceId,
  PendingActivation,
  MenuItem,
  Restaurant,
  RestaurantId,
  StoreHours,
  BookingStatus as BookingStatusType,
  PaymentStatus as PaymentStatusType,
  InvoiceStatus as InvoiceStatusType,
  DeviceRole as DeviceRoleType,
  UserRole as UserRoleType,
  UpgradeState,
} from "@/backend";

// VPS quote request payload — sent to VPS worker /quote endpoint.
export interface QuoteRequest {
  restaurantId: string;
  pickupAddress: string;
  dropAddress: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
  }>;
}

// VPS quote response — Ahamove fee + computed goods/tax totals.
export interface QuoteResponse {
  shippingFee: number;
  goodsAmount: number;
  taxTotal: number;
  amount: number;
  vatRate: number;
  ahamoveOrderId: string;
  estimatedDeliveryMinutes: number;
  packagingFee: number;
  packagingItemName: string;
  packagingQty: number;
}
// VPS create-order payload — sent to VPS worker /order/create (HMAC signed server-side).
export interface CreateOrderPayload {
  restaurantId: string;
  pickupAddress: string;
  cusName: string;
  cusPhone: string;
  cusAddress: string;
  cusTaxCode: string;
  receiverEmail: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    vatRate: number;
    unitName: string;
  }>;
  shippingFee: number;
  ahamoveOrderId: string;
  voucherCode?: string;
}

// VPS create-order response — canister orderId + signed payload confirmation.
// `pendingSync` is true when the canister push failed and the order went to the
// VPS retry queue — the frontend should wait for the retry to sync before
// trying to load the order/QR from the canister.
export interface CreateOrderResponse {
  orderId: string;
  ok: boolean;
  error?: string;
  pendingSync?: boolean;
}

// VPS request-QR response — POST /order/:id/qr (idempotent).
// ok:true → QR hiện có (reused=true) hoặc QR mới vừa tạo (reused=false).
// ok:false → lỗi tạm thời (retryable=true) hoặc lỗi vĩnh viễn (retryable=false).
export type RequestQrResponse =
  | {
      ok: true;
      qrCode: string;
      billId: string;
      expireAt: number;
      reused: boolean;
    }
  | { ok: false; retryable: boolean; message: string };

// VPS invoice response — Bkav e-invoice PDF/HTML link.
export interface InvoiceResponse {
  invoiceId: string;
  invoiceUrl: string;
  sharedLink: string;
  ok: boolean;
  error?: string;
}

// VPS analytics response — aggregated dashboard metrics.
export interface AnalyticsResponse {
  totalOrders: number;
  totalRevenue: number;
  paidOrders: number;
  pendingOrders: number;
  shippingOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  byRestaurant: Array<{
    restaurantId: string;
    name: string;
    orders: number;
    revenue: number;
  }>;
  byDay: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  // Món bán chạy nhất trong khoảng thời gian, top 10 theo số lượng. Loại
  // đơn đã huỷ (booking_status='cancelled').
  topItems: Array<{
    itemId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  // Khách hàng thật (group theo SĐT, không phải chi nhánh). new = lần đặt
  // đầu tiên của họ (trên toàn bộ lịch sử) rơi vào trong khoảng này;
  // returning = đã từng đặt trước đó. top: top 10 theo tổng chi trong range.
  customers: {
    total: number;
    new: number;
    returning: number;
    top: Array<{
      phone: string;
      name: string;
      orderCount: number;
      totalSpent: number;
    }>;
  };
}

// Processed dish image — client-side canvas output stored directly on the
// canister as raw JPEG bytes. `dataUrl` is used for local preview only.
export interface ProcessedImage {
  bytes: Uint8Array;
  dataUrl: string;
  sizeBytes: number;
}

// VPS customer record — returned by GET /customers/:email for a verified
// customer. Used to auto-fill the cart's customer form on subsequent orders.
export interface Customer {
  email: string;
  name: string;
  phone: string;
}

// Payment mode — who pays the order amount on the driver screen.
// 'driver' (default): the driver pays the order, then settles with the house.
// 'customer': the customer pays the driver directly at pickup.
export type PaymentMode = "driver" | "customer";

// VPS order-history record — GET /orders/history?email= trả về đơn TRƯỚC
// ngày hôm nay (canister chỉ giữ đơn trong ngày, xem routes/order-history.js
// VPS). Field tối giản, PHẦN NÀY KHÔNG có pickupCode/cusAddress/cusTaxCode/
// receiverEmail — VPS không trả các field này cho endpoint lịch sử.
export interface VpsHistoryOrder {
  orderId: string;
  restaurantId: string;
  cusName: string;
  cusPhone: string;
  amount: number;
  bookingStatus: string;
  paymentStatus: string;
  createdAt: number;
  items: Array<{
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    unitName: string;
  }>;
}

// VPS restaurant-history record — GET /orders/restaurant-history?restaurantId=&period=
// Dùng cho tab "Lịch sử đơn hàng" trên /driver. orders: TẤT CẢ đơn trong
// khoảng (mọi trạng thái). totalPaidAmount: CHỈ cộng đơn đã thanh toán.
export interface VpsRestaurantHistory {
  totalOrders: number;
  totalPaidAmount: number;
  orders: VpsHistoryOrder[];
}

export type RestaurantHistoryPeriod = "today" | "week" | "month";
