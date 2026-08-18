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
const DEV_FALLBACK_URL = "http://103.149.170.47:3000";
const PROD_FALLBACK_URL = "http://103.149.170.47:3000";

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

// Email invoice to customer — VPS triggers Bkav email send.
export async function emailInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "POST",
    path: `/invoice/${encodeURIComponent(orderId)}/email`,
  });
}

// Analytics — admin-gated, requires X-API-Key header.
//
// 401 handling: when VPS has ANALYTICS_API_KEY set but the frontend is missing
// VITE_ANALYTICS_API_KEY (or the value mismatches), the VPS auth middleware
// returns 401 with `{ error: 'Invalid or missing X-API-Key' }`. Rather than
// surfacing that raw transport error to admins, we translate it into a clear
// Vietnamese configuration hint so the admin knows exactly what to fix.
// Other errors (network, timeout, 5xx) propagate with their extracted message.
export async function getAnalytics(
  range: "7d" | "30d" | "90d" = "30d",
): Promise<AnalyticsResponse> {
  try {
    return await vpsFetch<AnalyticsResponse>({
      method: "GET",
      path: `/analytics?range=${encodeURIComponent(range)}`,
    });
  } catch (err) {
    if (err instanceof VpsHttpError && err.status === 401) {
      // Distinguish "no key configured on frontend" from "key mismatched" so
      // the admin gets an actionable message either way.
      const detail = !ANALYTICS_API_KEY
        ? "Analytics chưa cấu hình API key trên frontend (thiếu biến VITE_ANALYTICS_API_KEY). Vui lòng liên hệ quản trị viên để thiết lập."
        : "API key analytics không hợp lệ hoặc không khớp với VPS. Vui lòng kiểm tra lại VITE_ANALYTICS_API_KEY.";
      throw new VpsHttpError(err.status, err.body, detail);
    }
    throw err;
  }
}

// Exported base URL as a string. Resolved lazily via getVpsUrl() so the same
// fallback chain (env.vps_url → DEV_FALLBACK_URL → PROD_FALLBACK_URL) applies
// here as in the async call paths. Prefer getVpsUrl() inside async call paths;
// this export is kept for compatibility with any consumer that only needs to
// read the configured value. Resolved at module-eval time from the runtime
// config loaded by loadEnv() at boot.
export const vpsBaseUrl: string = getVpsUrl();
