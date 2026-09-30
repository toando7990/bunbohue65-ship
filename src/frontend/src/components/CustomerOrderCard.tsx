// CustomerOrderCard — thẻ đơn GỌN phía khách (Theo dõi đơn + Lịch sử), theo
// bản xem trước đã duyệt: 1 trạng thái dễ hiểu ở đầu thẻ, 1 dòng tóm tắt
// món, nhà hàng + giờ đặt + tổng tiền. Tên/SĐT khách, mã nhận hàng, nút sao
// chép và thông tin liên hệ nhà hàng chuyển vào màn hình chi tiết đơn.
//
// Chỉ bấm NÚT mới mở chi tiết (không điều hướng khi chạm vào thẻ — giữ yêu
// cầu cũ tránh mở nhầm). Thẻ nhân viên (/driver) vẫn dùng OrderCard cũ.
//
// mode="today": đơn hôm nay, nút tới /track/:orderId; đơn đang chờ khách
//   "Đặt tài xế" viền đỏ + đếm ngược.
// mode="history": đơn ngày trước (canister đã xoá — không mở được
//   /track), nút "Chi tiết" mở rộng ngay trên thẻ + nút "Hoá đơn" khi đã có.

import { useRestaurants } from "@/hooks/useQueries";
import {
  TONE_CLASS,
  customerStatus,
  formatClockNs,
  itemsSummary,
  shortId,
} from "@/lib/customer-order-status";
import { cn } from "@/lib/utils";
import {
  type DeliveryInfo,
  getCustomerStep,
  getInvoice,
} from "@/lib/vps-client";
import type { Order } from "@/types";
import { BookingStatus, InvoiceStatus } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function formatVnd(v: bigint | number): string {
  return `${Number(v).toLocaleString("vi-VN")}đ`;
}

function mmss(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// Đếm ngược tới hạn "Đặt tài xế" — chỉ tải cho đơn đang chờ khách.
function useStepCountdown(orderId: string, enabled: boolean): number | null {
  const { data } = useQuery({
    queryKey: ["customerStep", orderId],
    queryFn: () => getCustomerStep(orderId),
    enabled,
    refetchInterval: 15000,
    retry: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const active = enabled && data?.step === "awaiting" && !!data.deadline;
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  if (!active || !data?.deadline) return null;
  return data.deadline - now;
}

interface Props {
  order: Order;
  index: number;
  mode: "today" | "history";
  delivery?: DeliveryInfo | null;
}

export function CustomerOrderCard({ order, index, mode, delivery }: Props) {
  const status = customerStatus(order, delivery);
  const { data: restaurants } = useRestaurants();
  const restaurantName =
    restaurants?.find((r) => r.restaurantId === order.restaurantId)?.name ?? "";
  const total = order.amount + order.shippingFee;
  const remaining = useStepCountdown(
    order.orderId,
    mode === "today" && status.needsAction,
  );
  const [open, setOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const cancelled = order.bookingStatus === BookingStatus.cancelled;
  const hasInvoice = order.invoiceStatus === InvoiceStatus.invoiced;

  async function openInvoice() {
    setInvoiceLoading(true);
    try {
      const res = await getInvoice(order.orderId);
      if (!res.ok) throw new Error(res.error ?? "Không tải được hoá đơn");
      window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được hoá đơn");
    } finally {
      setInvoiceLoading(false);
    }
  }

  return (
    <div
      data-ocid={`order.card.${index}`}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3.5 shadow-sm",
        status.needsAction && mode === "today"
          ? "border-2 border-primary"
          : "border-border",
        status.finished && mode === "today" && "opacity-80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
            TONE_CLASS[status.tone],
          )}
          data-ocid={`order.card.${index}.status`}
        >
          {status.finished && !cancelled ? "✓" : "●"} {status.label}
        </span>
        {remaining !== null ? (
          <span
            className="inline-flex items-center gap-1 font-mono text-sm font-bold text-destructive"
            data-ocid={`order.card.${index}.countdown`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {mmss(remaining)}
          </span>
        ) : mode === "today" ? (
          delivery?.providerName ? (
            <span className="text-xs text-muted-foreground">
              {delivery.providerName}
            </span>
          ) : null
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatClockNs(order.createdAt)} ·{" "}
            <span className="font-mono">{shortId(order.orderId)}</span>
          </span>
        )}
      </div>

      <p
        className={cn(
          "text-sm leading-snug",
          cancelled ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {itemsSummary(order.items) || "—"}
      </p>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {restaurantName}
          {mode === "today" && (
            <>
              {restaurantName ? " · " : ""}
              {formatClockNs(order.createdAt)} ·{" "}
              <span className="font-mono">{shortId(order.orderId)}</span>
            </>
          )}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-sm font-bold",
            cancelled
              ? "text-muted-foreground line-through"
              : "text-foreground",
          )}
          data-ocid={`order.card.${index}.total`}
        >
          {formatVnd(total)}
        </span>
      </div>

      {mode === "history" && open && (
        <div
          className="flex flex-col gap-1 border-t border-dashed border-border pt-2 text-xs"
          data-ocid={`order.card.${index}.details`}
        >
          {order.items.map((it, i) => (
            <div key={it.itemId || i} className="flex justify-between gap-2">
              <span>
                {Number(it.quantity)}× {it.name}
              </span>
              <span className="font-mono">
                {formatVnd(it.price * it.quantity)}
              </span>
            </div>
          ))}
          {order.kmDiscountAmount + order.voucherDiscountAmount > 0n && (
            <div className="flex justify-between text-destructive">
              <span>Khuyến mại + phiếu giảm giá</span>
              <span className="font-mono">
                −
                {formatVnd(
                  order.kmDiscountAmount + order.voucherDiscountAmount,
                )}
              </span>
            </div>
          )}
          {order.shippingFee > 0n && (
            <div className="flex justify-between">
              <span>Phí ship</span>
              <span className="font-mono">{formatVnd(order.shippingFee)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Mã đơn</span>
            <span className="font-mono">{order.orderId}</span>
          </div>
        </div>
      )}

      {mode === "today" ? (
        <Link
          to="/track/$orderId"
          params={{ orderId: order.orderId }}
          data-ocid={`order.card.${index}.detail_link`}
          className={cn(
            "mt-1 inline-flex min-h-[42px] items-center justify-center rounded-md px-4 text-sm font-semibold transition-smooth",
            status.needsAction
              ? "bg-gradient-primary text-primary-foreground hover:opacity-90"
              : "border border-border bg-card text-foreground hover:bg-secondary",
          )}
        >
          {status.needsAction ? "Đặt tài xế hoặc huỷ →" : "Xem chi tiết"}
        </Link>
      ) : (
        <div
          className={cn(
            "mt-1 grid gap-2",
            hasInvoice ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-ocid={`order.card.${index}.toggle_details`}
            className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
          >
            {open ? "Thu gọn" : "Chi tiết"}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {hasInvoice && (
            <button
              type="button"
              onClick={openInvoice}
              disabled={invoiceLoading}
              data-ocid={`order.card.${index}.invoice_button`}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-primary px-3 text-sm font-semibold text-primary transition-smooth hover:bg-primary/5 disabled:opacity-60"
            >
              {invoiceLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              Hoá đơn
            </button>
          )}
        </div>
      )}
    </div>
  );
}
