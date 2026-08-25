// DriverOrderHistory — tab "Lịch sử đơn hàng" trên /driver, cạnh "Hàng đợi
// thanh toán". Cho nhân viên xem lại đơn của ĐÚNG nhà hàng mình đang trực,
// theo 3 mốc: Hôm nay / Tuần này / Tháng này — không cần đăng nhập admin,
// chỉ cần thiết bị đã kích hoạt (đã biết restaurantId).
//
// Nguồn dữ liệu: VPS GET /orders/restaurant-history (routes/restaurant-history.js)
// — KHÔNG dùng canister vì canister chỉ giữ đơn trong ngày (pruneOldOrders),
// "Tuần này"/"Tháng này" cần dữ liệu nhiều ngày trước.
//
// totalOrders/orders: TẤT CẢ đơn trong khoảng (mọi trạng thái). totalPaidAmount:
// CHỈ cộng đơn đã thanh toán — đúng nghĩa "tổng số tiền đơn đã thanh toán".

import { OrderCard } from "@/components/OrderCard";
import { toOrder } from "@/lib/order-mapping";
import { getRestaurantHistory } from "@/lib/vps-client";
import type { RestaurantHistoryPeriod } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Receipt, Wallet } from "lucide-react";
import { useState } from "react";

const PERIOD_LABELS: Record<RestaurantHistoryPeriod, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
};

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DriverOrderHistory({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const [period, setPeriod] = useState<RestaurantHistoryPeriod>("today");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["restaurantHistory", restaurantId, period],
    queryFn: () => getRestaurantHistory(restaurantId, period),
    enabled: !!restaurantId,
    refetchOnWindowFocus: false,
  });

  const results = (data?.orders ?? []).map(toOrder);

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-4 md:px-6"
      data-ocid="driver_history.page"
    >
      {/* Chọn mốc thời gian */}
      <div
        className="mb-4 flex gap-1.5"
        role="tablist"
        aria-label="Chọn khoảng thời gian"
        data-ocid="driver_history.period_tabs"
      >
        {(Object.keys(PERIOD_LABELS) as RestaurantHistoryPeriod[]).map((p) => {
          const active = p === period;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(p)}
              data-ocid={`driver_history.period_tab.${p}`}
              className={`min-h-[40px] flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-smooth ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          );
        })}
      </div>

      {/* Tổng hợp — số đơn + tổng tiền đã thanh toán */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3"
          data-ocid="driver_history.total_orders"
        >
          <Receipt
            className="h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Tổng số đơn</p>
            <p className="font-display text-lg font-bold text-foreground">
              {isLoading ? "…" : (data?.totalOrders ?? 0)}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3"
          data-ocid="driver_history.total_paid"
        >
          <Wallet
            className="h-5 w-5 shrink-0 text-success"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Đã thanh toán</p>
            <p className="font-display text-lg font-bold text-foreground">
              {isLoading ? "…" : formatVnd(data?.totalPaidAmount ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Danh sách đơn */}
      {isLoading ? (
        <div
          className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
          data-ocid="driver_history.loading_state"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải…
        </div>
      ) : results.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          data-ocid="driver_history.grid"
        >
          {results.map((order, i) => (
            <OrderCard
              key={order.orderId}
              order={order}
              index={i + 1}
              hidePickupCode
              disableDetailLink
            />
          ))}
        </div>
      ) : isError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="driver_history.error_state"
          role="alert"
        >
          <p className="font-medium text-destructive">Không tải được dữ liệu</p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="driver_history.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="driver_history.empty_state"
        >
          <History
            className="h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Chưa có đơn hàng nào {PERIOD_LABELS[period].toLowerCase()}.
          </p>
        </div>
      )}
    </div>
  );
}
