// OrderTracker — poll getOrderStatus canister 5s, hiển thị trạng thái realtime.
// Nút "Theo dõi hành trình" mở Ahamove shared_link. Nút "Tải hoá đơn" tải Bkav
// PDF qua VPS /order/:id/invoice (vps-client.getInvoice). UI tiếng Việt.

import { StatusBadge } from "@/components/StatusBadge";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { cn } from "@/lib/utils";
import { getInvoice } from "@/lib/vps-client";
import type { OrderStatus } from "@/types";
import { BookingStatus, InvoiceStatus, type PaymentStatus } from "@/types";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";

// Trạng thái tải hoá đơn.
type InvoiceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

// Bước hành trình giao hàng dựa trên BookingStatus.
interface TimelineStep {
  key: BookingStatus;
  label: string;
  description: string;
  icon: typeof Clock;
}

const TIMELINE: TimelineStep[] = [
  {
    key: BookingStatus.pending,
    label: "Chờ xác nhận",
    description: "Đơn vừa tạo, chờ nhà hàng xác nhận.",
    icon: Clock,
  },
  {
    key: BookingStatus.confirmed,
    label: "Đã xác nhận",
    description: "Nhà hàng đã xác nhận, chuẩn bị giao.",
    icon: CheckCircle2,
  },
  {
    key: BookingStatus.shipping,
    label: "Đang giao",
    description: "Tài xế đang giao hàng đến khách.",
    icon: Truck,
  },
  {
    key: BookingStatus.completed,
    label: "Hoàn thành",
    description: "Đơn đã giao thành công.",
    icon: CheckCircle2,
  },
];

// Vị trí bước hiện tại trong timeline (cancelled = -1, không hiển thị progress).
function stepIndex(status: BookingStatus): number {
  const order: BookingStatus[] = [
    BookingStatus.pending,
    BookingStatus.confirmed,
    BookingStatus.shipping,
    BookingStatus.completed,
  ];
  return order.indexOf(status);
}

export default function OrderTracker() {
  const { orderId } = useParams({ strict: false }) as { orderId?: string };
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useOrderStatus(orderId);
  const [invoiceState, setInvoiceState] = useState<InvoiceState>({
    kind: "idle",
  });
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(
        new Intl.DateTimeFormat("vi-VN", {
          timeStyle: "medium",
        }).format(new Date(dataUpdatedAt)),
      );
    }
  }, [dataUpdatedAt]);

  async function handleDownloadInvoice() {
    if (!orderId) return;
    setInvoiceState({ kind: "loading" });
    try {
      const res = await getInvoice(orderId);
      if (!res.ok) {
        throw new Error(res.error ?? "Không thể tải hoá đơn");
      }
      setInvoiceState({ kind: "success", url: res.invoiceUrl });
      // Mở hoá đơn trong tab mới.
      window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setInvoiceState({
        kind: "error",
        message: e instanceof Error ? e.message : "Lỗi không xác định",
      });
    }
  }

  // Thiếu orderId — hướng dẫn quay lại danh sách.
  if (!orderId) {
    return (
      <section
        className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6"
        data-ocid="order_tracker.missing_id_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Theo dõi đơn
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Không tìm thấy mã đơn hàng. Vui lòng chọn một đơn từ danh sách.
        </p>
        <Link
          to="/track"
          data-ocid="order_tracker.back_link"
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Xem danh sách đơn
        </Link>
      </section>
    );
  }

  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6"
      data-ocid="order_tracker.page"
    >
      {/* Header với nút quay lại */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          to="/track"
          data-ocid="order_tracker.back_link"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-smooth hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Danh sách
        </Link>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          data-ocid="order_tracker.refresh_button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Làm mới
        </button>
      </div>

      <h1
        className="font-display text-2xl font-semibold tracking-tight md:text-3xl"
        data-ocid="order_tracker.title"
      >
        Theo dõi đơn
      </h1>
      <p
        className="mt-1 break-all font-mono text-sm text-muted-foreground"
        data-ocid="order_tracker.order_id"
      >
        {orderId}
      </p>

      {/* Loading state */}
      {isLoading && (
        <div
          className="mt-6 flex flex-col items-center justify-center rounded-lg border border-border bg-card p-10 text-center"
          data-ocid="order_tracker.loading_state"
          aria-busy="true"
          aria-live="polite"
        >
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Đang tải trạng thái đơn…
          </p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="order_tracker.error_state"
          role="alert"
        >
          <AlertCircle
            className="mx-auto h-8 w-8 text-destructive"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium text-destructive">
            Không tải được trạng thái đơn
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Lỗi không xác định."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="order_tracker.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Empty / not found */}
      {!isLoading && !isError && !data && (
        <div
          className="mt-6 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center"
          data-ocid="order_tracker.empty_state"
        >
          <FileText
            className="mx-auto h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">Không tìm thấy đơn hàng</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn hàng có thể chưa được tạo hoặc mã không hợp lệ.
          </p>
        </div>
      )}

      {/* Main content — status realtime */}
      {!isLoading && !isError && data && (
        <OrderStatusView
          status={data}
          lastUpdated={lastUpdated}
          isFetching={isFetching}
          invoiceState={invoiceState}
          onDownloadInvoice={handleDownloadInvoice}
        />
      )}
    </section>
  );
}

interface OrderStatusViewProps {
  status: OrderStatus;
  lastUpdated: string;
  isFetching: boolean;
  invoiceState: InvoiceState;
  onDownloadInvoice: () => void;
}

function OrderStatusView({
  status,
  lastUpdated,
  isFetching,
  invoiceState,
  onDownloadInvoice,
}: OrderStatusViewProps) {
  const booking = status.bookingStatus as BookingStatus;
  const payment = status.paymentStatus as PaymentStatus;
  const invoice = status.invoiceStatus as InvoiceStatus;
  const isCancelled = booking === BookingStatus.cancelled;
  const currentStep = stepIndex(booking);
  const hasSharedLink = !!status.sharedLink;
  const canDownloadInvoice =
    invoice === InvoiceStatus.invoiced || invoice === InvoiceStatus.failed;

  return (
    <div className="mt-6 space-y-6">
      {/* Trạng thái tổng hợp */}
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        data-ocid="order_tracker.status_panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Trạng thái</h2>
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            data-ocid="order_tracker.poll_indicator"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isFetching ? "bg-warning" : "bg-success",
              )}
              aria-hidden="true"
            />
            {isFetching ? "Đang cập nhật…" : `Cập nhật ${lastUpdated}`}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Đặt hàng</span>
            <StatusBadge status={booking} size="md" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Thanh toán</span>
            <StatusBadge status={payment} size="md" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Hoá đơn</span>
            <StatusBadge status={invoice} size="md" />
          </div>
        </div>
      </div>

      {/* Hành trình giao hàng */}
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        data-ocid="order_tracker.timeline_panel"
      >
        <h2 className="font-display text-lg font-semibold">Hành trình giao</h2>
        {isCancelled ? (
          <div
            className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            data-ocid="order_tracker.cancelled_state"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Đơn hàng đã bị huỷ.
          </div>
        ) : (
          <ol className="mt-4 space-y-1">
            {TIMELINE.map((step, i) => {
              const Icon = step.icon;
              const isDone = i < currentStep;
              const isCurrent = i === currentStep;
              const isFuture = i > currentStep;
              return (
                <li
                  key={step.key}
                  data-ocid={`order_tracker.timeline.step.${i + 1}`}
                  className="relative flex gap-3 pb-4 last:pb-0"
                >
                  {/* Connector line */}
                  {i < TIMELINE.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5",
                        isDone ? "bg-success" : "bg-border",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-smooth",
                      isDone &&
                        "border-success bg-success text-success-foreground",
                      isCurrent &&
                        "border-primary bg-primary text-primary-foreground",
                      isFuture && "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isFuture && "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Hành động */}
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        data-ocid="order_tracker.actions_panel"
      >
        <h2 className="font-display text-lg font-semibold">Hành động</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/* Theo dõi hành trình — mở Ahamove shared_link */}
          <a
            href={hasSharedLink ? status.sharedLink : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!hasSharedLink}
            data-ocid="order_tracker.track_link"
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-smooth",
              hasSharedLink
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
            onClick={(e) => {
              if (!hasSharedLink) e.preventDefault();
            }}
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Theo dõi hành trình
            {hasSharedLink && (
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </a>
          {!hasSharedLink && (
            <p className="text-xs text-muted-foreground sm:self-center">
              Chưa có liên kết theo dõi Ahamove.
            </p>
          )}

          {/* Tải hoá đơn — VPS /order/:id/invoice */}
          <button
            type="button"
            onClick={onDownloadInvoice}
            disabled={!canDownloadInvoice || invoiceState.kind === "loading"}
            data-ocid="order_tracker.invoice_button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {invoiceState.kind === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Tải hoá đơn
          </button>
        </div>

        {/* Invoice feedback */}
        {invoiceState.kind === "error" && (
          <p
            className="mt-3 flex items-center gap-1.5 text-sm text-destructive"
            data-ocid="order_tracker.invoice_error"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {invoiceState.message}
          </p>
        )}
        {invoiceState.kind === "success" && (
          <p
            className="mt-3 flex items-center gap-1.5 text-sm text-success"
            data-ocid="order_tracker.invoice_success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Đã mở hoá đơn trong tab mới.
          </p>
        )}
        {!canDownloadInvoice && invoiceState.kind === "idle" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Hoá đơn sẽ khả dụng sau khi đơn hoàn tất thanh toán.
          </p>
        )}
      </div>
    </div>
  );
}
