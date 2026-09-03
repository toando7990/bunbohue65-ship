// PaymentQueue — Bước 2 của DriverPaymentScreen.
// Hiển thị hàng đợi đơn chờ thanh toán (FIFO theo createdAt), mỗi đơn có nút [Thanh toán].
// Mobile-first cards, large touch targets, Vietnamese labels.

import { type Order, PaymentStatus } from "@/backend";
import { Clock, ListOrdered, Loader2, ShoppingBag } from "lucide-react";

interface PaymentQueueProps {
  orders: Order[];
  isLoading: boolean;
  isError: boolean;
  onPay: (order: Order) => void;
  payingOrderId?: string | null;
}

// Format VND từ bigint (amount tính bằng đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Format thời gian từ bigint nanoseconds → HH:mm.
function formatTime(ns: bigint): string {
  const ms = Number(ns) / 1_000_000;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

// Đảm bảo chỉ hiển thị đơn chưa thanh toán (defensive — canister đã lọc).
// Bao gồm cả đơn #expired (QR hết hạn chưa thanh toán) để tài xế có thể
// chạm [Thanh toán] tạo QR mới, theo yêu cầu "tạo QR mới sau khi QR cũ hết hạn".
function isPending(o: Order): boolean {
  return (
    o.paymentStatus === PaymentStatus.unpaid ||
    o.paymentStatus === PaymentStatus.expired
  );
}

// Đơn có QR hết hạn chưa thanh toán (#expired) — cần tạo QR mới.
function isExpired(o: Order): boolean {
  return o.paymentStatus === PaymentStatus.expired;
}

// Chỉ hiện đơn tạo trong ngày hôm nay (giờ địa phương của thiết bị).
function isToday(ns: bigint): boolean {
  const ms = Number(ns) / 1_000_000;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Mốc tính thời gian chờ: createdAt (thời điểm đặt đơn) — dùng làm mốc gần đúng
// cho "tài xế nhận đơn" (khách tự đặt tài xế qua app ngoài như Grab).
const OVERDUE_MINUTES = 60;

function elapsedMinutes(createdAt: bigint): number {
  const ms = Number(createdAt) / 1_000_000;
  return (Date.now() - ms) / 60000;
}

function isOverdue(createdAt: bigint): boolean {
  return elapsedMinutes(createdAt) > OVERDUE_MINUTES;
}

// Đơn có áp dụng chiết khấu (Hệ 1 hoặc phiếu giảm giá, cộng gộp) — dùng để
// tô màu viền thẻ phân biệt trực quan với đơn thường (theo yêu cầu: đỏ =
// có khuyến mại, xanh = bình thường). THAY THẾ ý nghĩa màu đỏ trước đây
// (trước dùng đỏ cho đơn quá hạn — nay bỏ hẳn hiển thị "Trễ X phút", màu
// đỏ chuyển sang biểu thị khuyến mại để không xung đột ý nghĩa).
function hasDiscount(o: Order): boolean {
  return o.kmDiscountAmount + o.voucherDiscountAmount > 0n;
}
export function PaymentQueue({
  orders,
  isLoading,
  isError,
  onPay,
  payingOrderId,
}: PaymentQueueProps) {
  const pending = orders.filter((o) => isPending(o) && isToday(o.createdAt));
  // Đơn quá hạn (>60 phút) nổi lên đầu; trong cùng nhóm (quá hạn hoặc chưa),
  // vẫn giữ FIFO — createdAt ascending (cũ nhất trước).
  const sorted = [...pending].sort((a, b) => {
    const aOverdue = isOverdue(a.createdAt) ? 0 : 1;
    const bOverdue = isOverdue(b.createdAt) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return Number(a.createdAt - b.createdAt);
  });
  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8"
      data-ocid="queue.section"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            Hàng đợi thanh toán
          </h1>
        </div>
        <span
          className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          data-ocid="queue.count"
        >
          {sorted.length} đơn
        </span>
      </header>

      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-ocid="queue.error_state"
        >
          Không tải được danh sách đơn. Đang thử lại tự động mỗi 5 giây…
        </div>
      )}

      {isLoading && sorted.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
          data-ocid="queue.loading_state"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Đang tải đơn chờ…</p>
        </div>
      )}

      {!isLoading && sorted.length === 0 && !isError && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center"
          data-ocid="queue.empty_state"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <ShoppingBag className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-semibold">
            Không có đơn chờ thanh toán
          </h2>
          <p className="text-sm text-muted-foreground">
            Hàng đợi trống. Đơn mới sẽ xuất hiện tự động mỗi 5 giây.
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul
          className="flex flex-col gap-3"
          data-ocid="queue.list"
          aria-label="Danh sách đơn chờ thanh toán"
        >
          {sorted.map((order, idx) => {
            const isPaying = payingOrderId === order.orderId;
            const expired = isExpired(order);
            const discounted = hasDiscount(order);
            return (
              <li
                key={order.orderId}
                data-ocid={`queue.item.${idx + 1}`}
                className={`rounded-xl border p-4 shadow-sm transition-smooth hover:shadow-md ${
                  expired
                    ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/40"
                    : discounted
                      ? "border-destructive bg-destructive/10 ring-1 ring-destructive/40"
                      : "border-accent/50 bg-accent/5 ring-1 ring-accent/25"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        #{idx + 1}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        title="Thời gian tạo đơn"
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatTime(order.createdAt)}
                      </span>
                      {expired && (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-amber-50"
                          data-ocid={`queue.expired_badge.${idx + 1}`}
                        >
                          QR hết hạn — tạo lại
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 truncate font-display text-base font-semibold text-foreground">
                      {order.cusName || "Khách vãng lai"}
                    </h3>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {order.orderId}
                    </p>
                    {order.cusPhone && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        SĐT: {order.cusPhone}
                      </p>
                    )}
                    {order.items && order.items.length > 0 && (
                      <ul
                        className="mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2"
                        data-ocid={`queue.item_list.${idx + 1}`}
                      >
                        {order.items.map((it) => (
                          <li
                            key={it.itemId}
                            className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                          >
                            <span className="truncate">
                              {it.name} × {Number(it.quantity)}
                            </span>
                            <span className="shrink-0 font-mono">
                              {formatVnd(
                                BigInt(Number(it.price) * Number(it.quantity)),
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {/* Đã giảm (Giai đoạn 4c/cộng gộp KM Hệ 1 + phiếu) —
                        hiện ngay trên tổng tiền khi đơn có áp dụng chiết
                        khấu, khớp cách hiện ở OrderCard.tsx. */}
                    {discounted && (
                      <span
                        className="font-mono text-xs font-medium text-destructive"
                        data-ocid={`queue.discount.${idx + 1}`}
                      >
                        Đã giảm -
                        {formatVnd(
                          order.kmDiscountAmount + order.voucherDiscountAmount,
                        )}
                      </span>
                    )}
                    {/* Chỉ hiện tiền hàng — không gồm phí ship (khách tự trả
                        tài xế bên ngoài, không phải khoản quán nhận). Khớp
                        với số trên màn QR. */}
                    <span className="font-display text-xl font-bold text-primary">
                      {formatVnd(order.amount - order.shippingFee)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onPay(order)}
                      disabled={isPaying}
                      data-ocid={`queue.pay_button.${idx + 1}`}
                      aria-label={`Thanh toán đơn ${order.cusName || order.orderId}`}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPaying ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Đang mở…
                        </>
                      ) : expired ? (
                        "Tạo QR mới"
                      ) : (
                        "Thanh toán"
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
