// DriverOrderHistory — nội dung 1 trong 3 mốc lịch sử (Hôm nay/Tuần này/
// Tháng này) trên /driver. Cho nhân viên xem lại đơn của ĐÚNG nhà hàng
// mình đang trực — không cần đăng nhập admin, chỉ cần thiết bị đã kích
// hoạt (đã biết restaurantId).
//
// SỬA (theo yêu cầu tối ưu giao diện đã duyệt): 3 nút chọn mốc thời gian
// KHÔNG CÒN nằm trong component này — đã chuyển ra thanh điều hướng dưới
// dùng chung với "Hàng đợi" (xem DriverPaymentScreen.tsx). Component này
// giờ CHỈ nhận `period` qua props (không tự quản lý state period nữa).
// Thêm mới: ô tìm kiếm theo tên/SĐT (bôi sáng phần khớp — cùng cách đã
// làm ở PaymentQueue.tsx), và tiêu đề trang + số liệu tổng hợp hiện GỌN
// CÙNG 1 HÀNG (thay cho khối lưới 2 ô lớn trước đây).
//
// Nguồn dữ liệu: VPS GET /orders/restaurant-history (routes/restaurant-history.js)
// — KHÔNG dùng canister vì canister chỉ giữ đơn trong ngày (pruneOldOrders),
// "Tuần này"/"Tháng này" cần dữ liệu nhiều ngày trước.
//
// totalOrders/orders: TẤT CẢ đơn trong khoảng (mọi trạng thái). totalPaidAmount:
// CHỈ cộng đơn đã thanh toán — đúng nghĩa "tổng số tiền đơn đã thanh toán".

import { matchesQuery } from "@/components/HighlightMatch";
import { OrderCard } from "@/components/OrderCard";
import { toOrder } from "@/lib/order-mapping";
import { getRestaurantHistory } from "@/lib/vps-client";
import type { RestaurantHistoryPeriod } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Search } from "lucide-react";
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
  period,
}: {
  restaurantId: string;
  period: RestaurantHistoryPeriod;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["restaurantHistory", restaurantId, period],
    queryFn: () => getRestaurantHistory(restaurantId, period),
    enabled: !!restaurantId,
    refetchOnWindowFocus: false,
  });

  const results = (data?.orders ?? [])
    .map(toOrder)
    .filter(
      (o) =>
        matchesQuery(o.cusName, searchQuery) ||
        matchesQuery(o.cusPhone, searchQuery),
    );

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-4 md:px-6"
      data-ocid="driver_history.page"
    >
      {/* Tiêu đề trang + số liệu tổng hợp — cùng 1 hàng (thay khối lưới
          2 ô lớn trước đây, gọn hơn nhiều). */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-lg font-bold tracking-tight">
          {PERIOD_LABELS[period]}
        </h1>
        <div
          className="flex items-center gap-2 text-xs"
          data-ocid="driver_history.stats"
        >
          <span
            className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-muted-foreground"
            data-ocid="driver_history.total_orders"
          >
            {isLoading ? "…" : (data?.totalOrders ?? 0)} đơn
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground"
            data-ocid="driver_history.total_paid"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {isLoading ? "…" : formatVnd(data?.totalPaidAmount ?? 0)} đã TT
          </span>
        </div>
      </div>

      {/* Ô tìm kiếm — cùng cách đã làm ở PaymentQueue.tsx (Hàng đợi). */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc SĐT khách…"
          data-ocid="driver_history.search_input"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
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
              compactRestaurantInfo
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
          {searchQuery.trim() ? (
            <Search
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <History
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {searchQuery.trim()
              ? `Không tìm thấy đơn khớp "${searchQuery.trim()}".`
              : `Chưa có đơn hàng nào ${PERIOD_LABELS[period].toLowerCase()}.`}
          </p>
        </div>
      )}
    </div>
  );
}
