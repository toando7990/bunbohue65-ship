// DeliveryBar — thanh "Giao tới" gọn ở đầu trang đặt món từ xa (theo bản xem
// trước đã duyệt): gộp địa chỉ nhận hàng + nhà hàng phục vụ + thời gian giao
// dự kiến + phí ship vào 1 thanh, dính dưới header khi cuộn. Bấm "Đổi" mở
// lại khối chọn địa chỉ đầy đủ (DeliveryAddressSelector) và thông tin nhà
// hàng chi tiết (NearestRestaurantDisplay) — KHÔNG đổi logic chọn địa chỉ /
// nhà hàng, chỉ đổi cách trình bày. Chưa chọn địa chỉ → mở sẵn.

import { cn } from "@/lib/utils";
import type { CustomerAddress } from "@/types";
import { ChevronDown, Loader2, MapPin } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

function formatVnd(value: number): string {
  return `${value.toLocaleString("vi-VN")}đ`;
}

// Chiều cao header cố định của Layout — để thanh dính ngay dưới header.
function useHeaderHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setH(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return h;
}

interface Props {
  address: CustomerAddress | null;
  restaurantName: string | null;
  isQuoteLoading: boolean;
  shippingFee: number | null;
  estimatedDeliveryMinutes: number | null;
  // Khối chọn địa chỉ + thông tin nhà hàng đầy đủ (hiện khi mở).
  children: ReactNode;
}

export function DeliveryBar({
  address,
  restaurantName,
  isQuoteLoading,
  shippingFee,
  estimatedDeliveryMinutes,
  children,
}: Props) {
  const [open, setOpen] = useState(!address);
  const headerHeight = useHeaderHeight();

  // Vừa chọn xong địa chỉ lần đầu → tự thu gọn.
  const hasAddress = !!address;
  useEffect(() => {
    if (hasAddress) setOpen(false);
    else setOpen(true);
  }, [hasAddress]);

  const meta: string[] = [];
  if (restaurantName) meta.push(`Từ ${restaurantName}`);
  if (estimatedDeliveryMinutes) meta.push(`~${estimatedDeliveryMinutes} phút`);
  if (shippingFee && shippingFee > 0)
    meta.push(`ship ${formatVnd(shippingFee)}`);

  return (
    <div data-ocid="create_order.delivery_bar">
      <div
        className="sticky z-30 -mx-4 border-b border-border bg-card px-4 py-2.5 md:-mx-6 md:px-6"
        style={{ top: headerHeight }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-ocid="create_order.delivery_bar.toggle"
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPin
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="truncate">
                {address
                  ? `${address.label ? `${address.label} · ` : ""}${address.address}`
                  : "Chọn địa chỉ nhận hàng"}
              </span>
            </span>
            <span className="mt-0.5 flex items-center gap-1 pl-[22px] text-xs text-muted-foreground">
              {isQuoteLoading && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              )}
              <span className="truncate">
                {meta.length > 0
                  ? meta.join(" · ")
                  : address
                    ? "Đang tìm nhà hàng gần bạn…"
                    : "Để tính phí ship và nhà hàng gần nhất"}
              </span>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-sm font-semibold text-primary">
            {open ? "Xong" : "Đổi"}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
      {open && (
        <div
          className="mt-3 flex flex-col gap-3"
          data-ocid="create_order.restaurant_card"
        >
          {children}
        </div>
      )}
    </div>
  );
}
