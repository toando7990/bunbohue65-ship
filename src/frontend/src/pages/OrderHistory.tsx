// OrderHistory — tra cứu lịch sử đơn hàng theo email ĐÃ XÁC THỰC trên máy
// này (từ EmailVerificationDialog lúc đặt món). KHÔNG cho nhập email tuỳ ý —
// chỉ tra đúng email mà thiết bị này đã chứng minh kiểm soát qua OTP, tránh
// việc bất kỳ ai gõ email người khác vào cũng xem được lịch sử đơn của họ.
//
// Khác với /track (OrderList): OrderList chỉ nhớ đơn đã đặt TỪ TRÌNH DUYỆT
// NÀY qua localStorage bbh_my_orders. Trang này gọi getOrdersByEmail() — lọc
// PHÍA CANISTER theo receiverEmail, nên hoạt động trên mọi thiết bị ĐÃ TỪNG
// xác thực email đó, không phụ thuộc localStorage bbh_my_orders.

import { OrderCard } from "@/components/OrderCard";
import { useOrdersByEmail } from "@/hooks/useQueries";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { History, Mail } from "lucide-react";

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export default function OrderHistory() {
  const verified = getVerifiedEmail();
  const searchedEmail = verified ? normalizeEmail(verified.email) : null;

  const { data, isLoading, isError, refetch } = useOrdersByEmail(searchedEmail);
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
          {searchedEmail
            ? `Các đơn hàng đã đặt bằng email ${searchedEmail} (email đã xác thực trên thiết bị này).`
            : "Tra cứu lại các đơn hàng đã đặt bằng email đã xác thực trên thiết bị này."}
        </p>
      </header>

      {!searchedEmail ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.no_verified_email_state"
        >
          <Mail
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Chưa có email xác thực trên thiết bị này
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Lịch sử đặt đơn chỉ tra được bằng email đã xác thực khi đặt món. Vui
            lòng mở trang này trên đúng thiết bị bạn đã dùng để đặt món và xác
            thực email.
          </p>
        </div>
      ) : isError ? (
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
      ) : !isLoading && results.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.empty_state"
        >
          <History
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Chưa có đơn hàng nào
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Đơn hàng bạn đặt tiếp theo sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : (
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
    </section>
  );
}
