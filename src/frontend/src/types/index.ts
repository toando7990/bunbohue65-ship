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
}

// VPS create-order payload — sent to VPS worker /order/create (HMAC signed server-side).
export interface CreateOrderPayload {
  restaurantId: string;
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
export interface CreateOrderResponse {
  orderId: string;
  ok: boolean;
  error?: string;
}

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

// VPS image upload response — object-storage URL for menu item image.
export interface UploadImageResponse {
  imageUrl: string;
  ok: boolean;
  error?: string;
}
