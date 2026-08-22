// OrderHistory — tra cứu lịch sử đơn hàng theo email đã xác thực.
// Khác với /track (OrderList): OrderList chỉ nhớ đơn đã đặt TỪ TRÌNH DUYỆT NÀY
// (qua localStorage bbh_my_orders) nên khách đổi máy/xoá cache là mất lịch sử.
// Trang này gọi getOrdersByEmail() — lọc PHÍA CANISTER theo receiverEmail, nên
// hoạt động trên mọi thiết bị, không phụ thuộc localStorage của trình duyệt đó.
//
// Nếu máy này đã có email xác thực (từ EmailVerificationDialog lúc đặt món) →
// tự điền sẵn + tự tra cứu ngay, khách không cần gõ gì. Nếu chưa (máy lạ,
// hoặc vào thẳng /history mà chưa qua bước đặt món) → khách tự nhập email đã
// dùng lúc đặt món để tra — không yêu cầu xác thực lại OTP chỉ để XEM lịch sử.

import { OrderCard } from "@/components/OrderCard";
import { useOrdersByEmail } from "@/hooks/useQueries";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { History, Loader2, Search } from "lucide-react";
import { type FormEvent, useState } from "react";

// Khoá localStorage lưu email tra cứu gần nhất (khi khách tự gõ, khác với
// email xác thực) — chỉ để tiện điền lại lần sau trên máy này.
const LAST_EMAIL_KEY = "bbh_history_last_email";

// Permissive check — khớp với EMAIL_RE trong CustomerForm.tsx.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export default function OrderHistory() {
  const [emailInput, setEmailInput] = useState(() => {
    const verified = getVerifiedEmail();
    if (verified) return verified.email;
    try {
      return localStorage.getItem(LAST_EMAIL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  // Máy này đã có email xác thực sẵn → tự tra cứu ngay từ lần render đầu,
  // khách không cần bấm gì (lazy init nên chỉ đọc localStorage đúng 1 lần).
  const [searchedEmail, setSearchedEmail] = useState<string | null>(() => {
    const verified = getVerifiedEmail();
    return verified ? normalizeEmail(verified.email) : null;
  });
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, refetch } =
    useOrdersByEmail(searchedEmail);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeEmail(emailInput);
    if (!EMAIL_RE.test(normalized)) {
      setError("Email không hợp lệ.");
      setSearchedEmail(null);
      return;
    }
    setError(null);
    setSearchedEmail(normalized);
    // Chỉ lưu lại nếu khác với email đã xác thực trên máy này (tránh ghi đè
    // không cần thiết khi khách chỉ đang xác nhận lại email của chính mình).
    const verified = getVerifiedEmail();
    if (!verified || normalizeEmail(verified.email) !== normalized) {
      try {
        localStorage.setItem(LAST_EMAIL_KEY, normalized);
      } catch {
        // localStorage không khả dụng — vẫn tra cứu bình thường trong phiên này.
      }
    }
  }

  const results = data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
      data-ocid="order_history.page"
    >
      <header className="mb-6">
        <h1
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight md:text-3xl"
          data-ocid="order_history.title"
        >
          <History className="h-6 w-6 text-primary" aria-hidden="true" />
          Lịch sử đặt đơn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tra cứu lại các đơn hàng đã đặt bằng email đã dùng lúc đặt món — tra
          được trên mọi thiết bị, không cần dùng đúng trình duyệt đã đặt đơn.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start"
        data-ocid="order_history.search_form"
      >
        <div className="flex-1">
          <label htmlFor="history-email" className="sr-only">
            Email
          </label>
          <input
            id="history-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Nhập email đã dùng khi đặt món"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            aria-invalid={!!error}
            data-ocid="order_history.email_input"
            className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && (
            <p
              className="mt-1.5 text-xs text-destructive"
              data-ocid="order_history.email_error"
            >
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isFetching}
          data-ocid="order_history.search_button"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Tra cứu
        </button>
      </form>

      {isError && searchedEmail && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="order_history.error_state"
          role="alert"
        >
          <p className="font-medium text-destructive">
            Không tải được đơn hàng
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="order_history.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      )}

      {!isError && searchedEmail && !isLoading && results.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.empty_state"
        >
          <History
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Không tìm thấy đơn hàng nào
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Không có đơn nào khớp với email {searchedEmail}. Kiểm tra lại email
            đã dùng lúc đặt món.
          </p>
        </div>
      )}

      {searchedEmail && results.length > 0 && (
        <>
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-ocid="order_history.count"
          >
            {results.length} đơn hàng
          </p>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-ocid="order_history.grid"
          >
            {results.map((order, i) => (
              <OrderCard key={order.orderId} order={order} index={i + 1} />
            ))}
          </div>
        </>
      )}

      {!searchedEmail && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.prompt_state"
        >
          <Search
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Nhập email đã dùng lúc đặt món rồi bấm "Tra cứu" để xem lại các đơn
            hàng đã đặt.
          </p>
        </div>
      )}
    </section>
  );
}
