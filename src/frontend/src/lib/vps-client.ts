// VPS worker HTTP client — frontend calls VPS directly for quote/create/upload/analytics.
// Canister is only polled for status/QR (see hooks/useOrderStatus, hooks/usePendingOrders).
// API keys live in VPS env vars only — never exposed to frontend/canister/git.

import type {
  AnalyticsResponse,
  CreateOrderPayload,
  CreateOrderResponse,
  InvoiceResponse,
  QuoteRequest,
  QuoteResponse,
  UploadImageResponse,
} from "@/types";

// VPS base URL resolution.
//
// IMPORTANT: This module MUST NOT throw at module-evaluation time. A top-level
// throw here runs during import resolution (before main.tsx's loadEnv().then()
// chain engages) and is uncaught — it produces a blank white screen on Live.
//
// We resolve the URL lazily: `getVpsUrl()` throws only when actually called
// inside an async function body, so the throw is catchable by the calling
// code's try/catch, React's render cycle, or the ErrorBoundary. Importing this
// module is always safe, even when VITE_VPS_URL is missing.
//
// The hardcoded IP fallback is allowed only in dev mode for local development.
const VPS_URL =
  import.meta.env.VITE_VPS_URL ??
  (import.meta.env.PROD ? null : "http://103.149.170.47:3000");

// Resolve the VPS base URL at call-time. Throws a catchable Error when the URL
// is unavailable (production build without VITE_VPS_URL). Callers should handle
// this error or let it propagate to the ErrorBoundary.
function getVpsUrl(): string {
  if (!VPS_URL) {
    throw new Error(
      "VITE_VPS_URL chưa được cấu hình. Vui lòng liên hệ quản trị viên để thiết lập địa chỉ VPS.",
    );
  }
  return VPS_URL;
}

// Analytics endpoints require X-API-Key — sourced from VITE_ANALYTICS_API_KEY (admin-only).
// In production this is set per-deployment; placeholder kept for local dev.
const ANALYTICS_API_KEY = import.meta.env.VITE_ANALYTICS_API_KEY ?? "";

const DEFAULT_TIMEOUT_MS = 15000;

class VpsHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `VPS request failed: ${status}`);
    this.name = "VpsHttpError";
    this.status = status;
    this.body = body;
  }
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
  // Analytics routes are admin-gated — attach X-API-Key only when present.
  if (path.startsWith("/analytics") && ANALYTICS_API_KEY) {
    finalHeaders["X-API-Key"] = ANALYTICS_API_KEY;
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
      throw new VpsHttpError(res.status, parsed ?? text);
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

// Upload menu item image — multipart/form-data to VPS, stored in object-storage.
export async function uploadImage(
  formData: FormData,
): Promise<UploadImageResponse> {
  return vpsFetch<UploadImageResponse>({
    method: "POST",
    path: "/upload",
    body: formData,
    isFormData: true,
  });
}

// Get invoice (Bkav e-invoice) for an order — VPS fetches from Bkav SOAP.
export async function getInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "GET",
    path: `/invoice/${encodeURIComponent(orderId)}`,
  });
}

// Email invoice to customer — VPS triggers Bkav email send.
export async function emailInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "POST",
    path: `/invoice/${encodeURIComponent(orderId)}/email`,
  });
}

// Analytics — admin-gated, requires X-API-Key header.
export async function getAnalytics(
  range: "7d" | "30d" | "90d" = "30d",
): Promise<AnalyticsResponse> {
  return vpsFetch<AnalyticsResponse>({
    method: "GET",
    path: `/analytics?range=${encodeURIComponent(range)}`,
  });
}

// Exported base URL as a string (empty string sentinel when unset). Prefer
// getVpsUrl() inside async call paths — it throws a catchable error when the
// URL is missing. This export is kept for compatibility with any consumer that
// only needs to read the configured value without triggering a throw.
export const vpsBaseUrl: string = VPS_URL ?? "";
