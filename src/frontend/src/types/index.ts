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
