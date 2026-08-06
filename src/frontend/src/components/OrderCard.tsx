// OrderCard — card tóm tắt đơn hàng: orderId, cusName, amount, status badges.
// Mobile-first, dùng trong OrderList. Link đến /track/:orderId để xem chi tiết.

import { StatusBadge } from "@/components/StatusBadge";
import type { BookingStatus, Order, PaymentStatus } from "@/types";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Receipt } from "lucide-react";

// Định dạng số tiền VND từ bigint (đơn vị đồng).
function formatVnd(amount: bigint): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

// Rút gọn orderId để hiển thị (giữ 8 ký tự đầu + 4 cuối).
function shortOrderId(orderId: string): string {
  if (orderId.length <= 16) return orderId;
  return `${orderId.slice(0, 8)}…${orderId.slice(-4)}`;
}

export interface OrderCardProps {
  order: Order;
  /** Index trong list (1-based) cho deterministic marker. */
  index: number;
}

export function OrderCard({ order, index }: OrderCardProps) {
  return (
    <Link
      to="/track/$orderId"
      params={{ orderId: order.orderId }}
      data-ocid={`order.card.${index}`}
      className="group block rounded-lg border border-border bg-card p-4 shadow-sm transition-smooth hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Receipt
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={order.orderId}
            >
              {shortOrderId(order.orderId)}
            </span>
          </div>
          <h3 className="mt-1 truncate font-display text-base font-semibold text-foreground">
            {order.cusName || "Khách vãng lai"}
          </h3>
          {order.cusPhone && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {order.cusPhone}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-display text-base font-semibold text-foreground">
            {formatVnd(order.amount)}
          </p>
          <p className="text-xs text-muted-foreground">Tổng cộng</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={order.bookingStatus as BookingStatus} />
        <StatusBadge status={order.paymentStatus as PaymentStatus} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {order.items.length} mặt hàng
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-smooth group-hover:gap-2">
          Xem chi tiết
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
