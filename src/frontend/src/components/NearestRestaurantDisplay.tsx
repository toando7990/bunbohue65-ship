// NearestRestaurantDisplay — thay cho RestaurantSelect.tsx (dropdown cũ)
// trong CreateOrder.tsx sau khi tái cấu trúc: khách KHÔNG còn tự chọn nhà
// hàng, app tự tính nhà hàng gần nhất theo địa chỉ nhận hàng đã chọn
// (xem lib/geo.ts). Chỉ hiển thị (read-only) tên + địa chỉ nhà hàng đã
// tự chọn, cùng chỗ hiển thị thời gian giao hàng dự kiến (Phần 4/6 —
// Lalamove "Get Quotation" — điền thật; hiện tại là placeholder).

import { Skeleton } from "@/components/ui/skeleton";
import { Clock, MapPin, Store } from "lucide-react";

interface NearestRestaurantDisplayProps {
  restaurantName: string | null;
  restaurantAddress: string | null;
  isLoading: boolean;
  // Không có địa chỉ nhận hàng hợp lệ hoặc không có nhà hàng nào đã cấu
  // hình toạ độ — chưa tính được nhà hàng gần nhất.
  hasNoResult: boolean;
}

export function NearestRestaurantDisplay({
  restaurantName,
  restaurantAddress,
  isLoading,
  hasNoResult,
}: NearestRestaurantDisplayProps) {
  if (isLoading) {
    return (
      <Skeleton
        className="h-16 w-full rounded-md"
        data-ocid="nearest_restaurant.loading_state"
      />
    );
  }

  if (hasNoResult) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-card/50 p-3 text-sm text-muted-foreground"
        data-ocid="nearest_restaurant.no_result_state"
      >
        Chưa xác định được nhà hàng gần bạn — vui lòng chọn địa chỉ nhận hàng ở
        trên.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
      data-ocid="nearest_restaurant.panel"
    >
      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-semibold" data-ocid="nearest_restaurant.name">
          {restaurantName}
        </span>
      </div>
      {restaurantAddress && (
        <span className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-1">{restaurantAddress}</span>
        </span>
      )}
      {/* Thời gian giao hàng dự kiến — Phần 4/6 (Lalamove "Get
          Quotation") sẽ điền số thật vào đây, thay placeholder này. */}
      <span
        className="flex items-center gap-1 pl-6 text-xs text-muted-foreground"
        data-ocid="nearest_restaurant.delivery_time_placeholder"
      >
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
        Đang tính thời gian giao hàng dự kiến…
      </span>
    </div>
  );
}
