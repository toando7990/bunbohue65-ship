// VPS worker HTTP client — frontend calls VPS directly for quote/create/upload/analytics.
// Canister is only polled for status/QR (see hooks/useOrderStatus, hooks/usePendingOrders).
// API keys live in VPS env vars only — never exposed to frontend/canister/git.

import { getEnv } from "@/lib/env";
import type {
  AnalyticsResponse,
  CreateOrderPayload,
  CreateOrderResponse,
  Customer,
  InvoiceResponse,
  QuoteRequest,
  QuoteResponse,
  RequestQrResponse,
  RestaurantHistoryPeriod,
  VpsHistoryOrder,
  VpsRestaurantHistory,
} from "@/types";

// VPS base URL resolution.
//
// IMPORTANT: This module MUST NOT throw at module-evaluation time. A top-level
// throw here runs during import resolution (before main.tsx's loadEnv().then()
// chain engages) and is uncaught — it produces a blank white screen on Live.
//
// The VPS URL is read from the runtime config (env.json → loadEnv() → getEnv())
// rather than a build-time Vite env var, so the same bundle can target a
// different VPS worker without rebuilding. getEnv() is only invoked inside
// getVpsUrl() (call-time, inside an async body), never at module top level —
// this preserves the invariant that importing this module is always safe even
// before loadEnv() has resolved.
//
// The hardcoded IP fallback is allowed only in dev mode for local development.
// In production, when the platform overwrites env.json and drops the custom
// `vps_url` key (Caffeine's loadConfig() only knows the 5 platform keys), we
// fall back to the known production proxy URL so the app still boots.
const DEV_FALLBACK_URL = "https://proxy.bunbohue65.com";
const PROD_FALLBACK_URL = "https://proxy.bunbohue65.com";

// Resolve the VPS base URL at call-time. Throws a catchable Error only when
// the URL is unavailable in every form (runtime config not yet loaded AND no
// fallback applies — a state that should not occur in practice). Callers can
// let it propagate to the ErrorBoundary; the normal path always returns a URL.
function getVpsUrl(): string {
  const env = getEnv();
  if (env?.vps_url && env.vps_url.trim() !== "") {
    return env.vps_url.trim();
  }
  if (!import.meta.env.PROD) {
    return DEV_FALLBACK_URL;
  }
  return PROD_FALLBACK_URL;
}

const DEFAULT_TIMEOUT_MS = 15000;

export class VpsHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `VPS request failed: ${status}`);
    this.name = "VpsHttpError";
    this.status = status;
    this.body = body;
  }
}

// Extract a human-readable error message from a VPS error body. The VPS worker
// returns errors as `{ error: string }` (see vps-worker/src/middleware/auth.js);
// fall back to the raw text/string body when the shape is unexpected.
function extractErrorMessage(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body.trim() === "" ? null : body;
  if (typeof body === "object") {
    const maybe = body as Record<string, unknown>;
    const err = maybe.error ?? maybe.message ?? maybe.detail;
    if (typeof err === "string" && err.trim() !== "") return err;
  }
  return null;
}

interface FetchOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  isFormData?: boolean;
}

// Thin fetch wrapper with timeout, JSON handling, and analytics X-API-Key injection.
async function vpsFetch<T>(options: FetchOptions): Promise<T> {
  const {
    method,
    path,
    body,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    isFormData = false,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const finalHeaders: Record<string, string> = { ...headers };
  if (!isFormData) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method,
    headers: finalHeaders,
    signal: controller.signal,
  };
  if (body !== undefined) {
    init.body = isFormData ? (body as FormData) : JSON.stringify(body);
  }

  try {
    const res = await fetch(`${getVpsUrl()}${path}`, init);
    const text = await res.text();
    const parsed = text ? safeParse(text) : null;

    if (!res.ok) {
      const extracted = extractErrorMessage(parsed);
      throw new VpsHttpError(
        res.status,
        parsed ?? text,
        extracted ?? `VPS request failed: ${res.status}`,
      );
    }
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Ahamove quote — VPS calls Ahamove API quote, returns fee + computed totals.
export async function quote(payload: QuoteRequest): Promise<QuoteResponse> {
  return vpsFetch<QuoteResponse>({
    method: "POST",
    path: "/quote",
    body: payload,
  });
}

// Create order — VPS signs HMAC + calls canister createOrder (canister verifies).
export async function create(
  payload: CreateOrderPayload,
): Promise<CreateOrderResponse> {
  return vpsFetch<CreateOrderResponse>({
    method: "POST",
    path: "/order/create",
    body: payload,
  });
}

// Get invoice (Bkav e-invoice) for an order — VPS fetches from Bkav SOAP.
export async function getInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "GET",
    path: `/invoice/${encodeURIComponent(orderId)}`,
  });
}

// Request a Tingee dynamic QR for an order — VPS POST /order/:id/qr (idempotent).
// VPS calls tingee.generateDynamicQr, persists qrCode + billId + expireAt via
// updateOrderQr, and returns the QR. If the existing QR is still valid
// (now < expireAt) the VPS returns it unchanged (reused=true) without creating
// a new Tingee bill. The frontend never polls getDynamicQrStatus — it only
// polls the canister getOrderStatus for payment state.
//
// pickupCode: chỉ truyền khi gọi từ luồng "Hàng đợi thanh toán" (nhân viên
// quán nhập mã tài xế đọc cho nghe) — VPS chỉ kiểm tra khi field này CÓ mặt
// trong request, nên bỏ trống (undefined) giữ nguyên hành vi tự thanh toán
// của khách (QrPayment/OrderCard) như trước, không cần nhập mã.
export async function requestQr(
  orderId: string,
  pickupCode?: string,
): Promise<RequestQrResponse> {
  return vpsFetch<RequestQrResponse>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/qr`,
    body: pickupCode !== undefined ? { pickupCode } : undefined,
  });
}

// Upsert a customer record by email — VPS POST /customers with { email }.
// Creates the customer if it does not already exist (idempotent). This is
// intentionally non-blocking and swallows every error (network slow, VPS
// unresponsive, 4xx/5xx) so a failure never blocks the customer from using
// the app. The record is also upserted with full details when an order is
// placed (see create.js), so a missed call here is always recovered later.
export async function upsertCustomer(email: string): Promise<void> {
  try {
    await vpsFetch<unknown>({
      method: "POST",
      path: "/customers",
      body: { email },
    });
  } catch {
    // Swallow all errors — this is a best-effort background sync.
  }
}

// Look up a saved customer by verified email — VPS GET /customers/:email.
// Returns the customer record { email, name, phone }, or null when the VPS
// responds 404 (no saved customer yet). Any other error propagates so callers
// can decide whether to surface it.
export async function getCustomer(email: string): Promise<Customer | null> {
  try {
    return await vpsFetch<Customer>({
      method: "GET",
      path: `/customers/${encodeURIComponent(email)}`,
    });
  } catch (err) {
    if (err instanceof VpsHttpError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// Cập nhật hồ sơ khách hàng (tên + SĐT) — LUÔN ghi đè, khác getCustomer/
// POST (create-only). Dùng cho trang "Thông tin của bạn" (Profile.tsx).
export async function updateCustomer(
  email: string,
  name: string,
  phone: string,
): Promise<Customer> {
  return vpsFetch<Customer>({
    method: "PUT",
    path: `/customers/${encodeURIComponent(email)}`,
    body: { name, phone },
  });
}

// Lịch sử đặt đơn — VPS trả đơn TRƯỚC ngày hôm nay (canister chỉ giữ đơn
// trong ngày, xem routes/order-history.js). Đã sắp mới nhất lên đầu.
export async function getOrderHistory(
  email: string,
): Promise<VpsHistoryOrder[]> {
  const res = await vpsFetch<{ ok: boolean; orders: VpsHistoryOrder[] }>({
    method: "GET",
    path: `/orders/history?email=${encodeURIComponent(email)}`,
  });
  return res.orders;
}

// Tổng doanh số + danh sách đơn CỦA 1 KHÁCH trong kỳ HIỆN TẠI (tuần
// này/tháng này, TÍNH TỚI THỜI ĐIỂM GỌI — bao gồm cả hôm nay). Chỉ tính
// đơn đã thanh toán. Dùng cho tab "Tuần này"/"Tháng này" trong "Lịch sử
// đặt đơn" (Giai đoạn 3f) — khác getOrderHistory() (chỉ tính TRƯỚC hôm
// nay) và getRestaurantHistory() (theo nhà hàng, không theo khách).
export async function getPeriodSummary(
  email: string,
  period: "week" | "month",
): Promise<{ orders: VpsHistoryOrder[]; total: number }> {
  const res = await vpsFetch<{
    ok: boolean;
    orders: VpsHistoryOrder[];
    total: number;
  }>({
    method: "GET",
    path: `/orders/period-summary?email=${encodeURIComponent(email)}&period=${period}`,
  });
  return { orders: res.orders, total: res.total };
}

// Lịch sử đơn hàng theo nhà hàng — dùng cho tab "Lịch sử đơn hàng" trên
// /driver. period: 'today' | 'week' (tuần này, Thứ 2 - hiện tại) | 'month'
// (tháng này, ngày 1 - hiện tại).
export async function getRestaurantHistory(
  restaurantId: string,
  period: RestaurantHistoryPeriod,
): Promise<VpsRestaurantHistory> {
  return vpsFetch<VpsRestaurantHistory>({
    method: "GET",
    path: `/orders/restaurant-history?restaurantId=${encodeURIComponent(restaurantId)}&period=${period}`,
  });
}

// Email invoice to customer — VPS triggers Bkav email send.
export async function emailInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "POST",
    path: `/invoice/${encodeURIComponent(orderId)}/email`,
  });
}

// Analytics — quyền truy cập thật sự nằm ở AdminGate (Internet Identity +
// vai trò admin trên canister, xem App.tsx adminAnalyticsRoute), không phải
// ở tầng VPS. Route /analytics phía VPS KHÔNG được đặt X-API-Key bắt buộc:
// Caffeine build frontend chỉ nạp 5 "platform keys" cố định qua env.json,
// không có cơ chế tiêm secret tuỳ ý lúc build (không có VITE_.env thật) —
// nên 1 khoá API kiểu VITE_ANALYTICS_API_KEY sẽ KHÔNG BAO GIỜ set được đúng
// trong môi trường Caffeine. Nếu VPS admin tự set ANALYTICS_API_KEY trong
// .env cho mục đích khác (gọi API trực tiếp từ nơi khác), route này sẽ đòi
// hỏi header đó và app web sẽ luôn bị 401 — xem middleware/auth.js (VPS).
export async function getAnalytics(
  range: "7d" | "30d" | "90d" = "30d",
): Promise<AnalyticsResponse> {
  return vpsFetch<AnalyticsResponse>({
    method: "GET",
    path: `/analytics?range=${encodeURIComponent(range)}`,
  });
}

// Exported base URL as a string. Resolved lazily via getVpsUrl() so the same
// fallback chain (env.vps_url → DEV_FALLBACK_URL → PROD_FALLBACK_URL) applies
// here as in the async call paths. Prefer getVpsUrl() inside async call paths;
// this export is kept for compatibility with any consumer that only needs to
// read the configured value. Resolved at module-eval time from the runtime
// config loaded by loadEnv() at boot.
export const vpsBaseUrl: string = getVpsUrl();
