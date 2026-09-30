// OrderTracker — poll getOrderStatus canister 5s, hiển thị trạng thái realtime.
// Khách tự đặt tài xế bằng app ngoài nên trang này chỉ cung cấp thông tin để dán
// vào app ngoài: địa chỉ nhà hàng + tổng tiền (nút copy), trạng thái "Thanh toán"
// và tiến trình 2 bước (Chờ tài xế thanh toán -> Tài xế đã thanh toán và
// nhận hàng). Không có
// nút "Thanh toán" cho khách. Nút "Theo dõi hành trình" mở Ahamove shared_link.
// Nút "Tải hoá đơn" tải Bkav PDF qua VPS /order/:id/invoice. UI tiếng Việt.

import type { Restaurant } from "@/backend";
import { ChangeRestaurantDialog } from "@/components/ChangeRestaurantDialog";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { CustomerStepPanel } from "@/components/CustomerStepPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryTrackingPanel } from "@/components/delivery/DeliveryTrackingPanel";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { useGetOrder, useRestaurants } from "@/hooks/useQueries";
import { customerStatus } from "@/lib/customer-order-status";
import { cn } from "@/lib/utils";
import {
  getCustomerStep,
  getDeliveryStatus,
  getInvoice,
} from "@/lib/vps-client";
import type { CustomerStepState, DeliveryInfo } from "@/lib/vps-client";
import type { Order, OrderStatus } from "@/types";
import { BookingStatus, InvoiceStatus, PaymentStatus } from "@/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";

// Trạng thái tải hoá đơn.
type InvoiceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

// Thanh 4 bước ở khối trạng thái (khi chưa có tài xế).
const PROGRESS_LABELS = ["Đã đặt", "Có tài xế", "Lấy món", "Đã giao"];

// Định dạng số tiền VND từ bigint (đơn vị đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Nút copy dùng chung — copy chuỗi vào clipboard để dán vào app ngoài.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback cho trình duyệt không hỗ trợ Clipboard API.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-ocid="order_tracker.copy_button"
      aria-label={label}
      className={cn(
        "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        copied
          ? "border-success/40 bg-success/15 text-success"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Đã sao chép" : "Sao chép"}
    </button>
  );
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
  // Full Order (createdAt/amount/restaurantId/...) — OrderStatus không mang các
  // trường này, cần để hiển thị địa chỉ nhà hàng và tổng tiền.
  const { data: order } = useGetOrder(orderId);
  // Tra cứu địa chỉ nhà hàng theo restaurantId của đơn.
  const { data: restaurants } = useRestaurants();
  // Hành trình giao Lalamove / Ahamove (VPS lib/delivery.js) — poll 10s
  // (VPS tự làm mới từ hãng tối đa 20 giây/lần; webhook Ahamove tức thì).
  const { data: deliveryInfo } = useQuery({
    queryKey: ["deliveryStatus", orderId],
    queryFn: () => getDeliveryStatus(orderId as string),
    enabled: !!orderId,
    refetchInterval: 10000,
  });
  // Bước khách chọn "Đặt tài xế" / "Huỷ đơn" (VPS lib/customer-step.js) —
  // poll 5s để đồng hồ đếm ngược và trạng thái tự huỷ luôn khớp VPS.
  const { data: customerStep, refetch: refetchCustomerStep } = useQuery({
    queryKey: ["customerStep", orderId],
    queryFn: () => getCustomerStep(orderId as string),
    enabled: !!orderId,
    refetchInterval: 5000,
    retry: false,
  });
  const queryClient = useQueryClient();
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
          Đơn của tôi
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
        className="font-display text-xl font-semibold tracking-tight md:text-2xl"
        data-ocid="order_tracker.title"
      >
        Theo dõi đơn
      </h1>
      <div className="mt-1 flex items-center gap-2">
        <p
          className="break-all font-mono text-sm text-muted-foreground"
          data-ocid="order_tracker.order_id"
        >
          {orderId}
        </p>
        {orderId && <CopyOrderIdButton orderId={orderId} />}
      </div>

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
          order={order}
          restaurants={restaurants ?? []}
          restaurantAddress={
            restaurants?.find((r) => r.restaurantId === order?.restaurantId)
              ?.address
          }
          lastUpdated={lastUpdated}
          isFetching={isFetching}
          invoiceState={invoiceState}
          onDownloadInvoice={handleDownloadInvoice}
          onRestaurantChanged={() =>
            queryClient.invalidateQueries({ queryKey: ["order", orderId] })
          }
          deliveryInfo={deliveryInfo}
          customerStep={customerStep}
          onCustomerStepChanged={() => {
            refetchCustomerStep();
            refetch();
            queryClient.invalidateQueries({
              queryKey: ["deliveryStatus", orderId],
            });
          }}
        />
      )}
    </section>
  );
}

interface OrderStatusViewProps {
  status: OrderStatus;
  order: Order | null | undefined;
  restaurants: Restaurant[];
  restaurantAddress: string | undefined;
  lastUpdated: string;
  isFetching: boolean;
  invoiceState: InvoiceState;
  onDownloadInvoice: () => void;
  onRestaurantChanged: () => void;
  // Hành trình giao Lalamove / Ahamove — undefined khi chưa tải xong/lỗi
  // mạng, null khi đơn chưa gọi tài xế (chưa bật tự đặt hoặc đơn tự đặt
  // tài xế bằng app ngoài) → giữ timeline 2 bước dự phòng.
  deliveryInfo: DeliveryInfo | null | undefined;
  // Bước "Đặt tài xế" / "Huỷ đơn" của khách — undefined khi chưa tải/lỗi
  // hoặc đơn không áp dụng (đơn cũ, đơn quầy).
  customerStep?: CustomerStepState;
  onCustomerStepChanged?: () => void;
}

export function OrderStatusView({
  status,
  order,
  restaurants,
  restaurantAddress,
  lastUpdated,
  isFetching,
  invoiceState,
  onDownloadInvoice,
  onRestaurantChanged,
  deliveryInfo,
  customerStep,
  onCustomerStepChanged,
}: OrderStatusViewProps) {
  const [changeRestaurantOpen, setChangeRestaurantOpen] = useState(false);
  const booking = status.bookingStatus as BookingStatus;
  const payment = status.paymentStatus as PaymentStatus;
  const invoice = status.invoiceStatus as InvoiceStatus;
  const isCancelled = booking === BookingStatus.cancelled;
  // Chỉ bật nút khi hoá đơn ĐÃ phát hành thành công.
  const canDownloadInvoice = invoice === InvoiceStatus.invoiced;
  // Đơn còn chờ khách chọn / đã bị huỷ ở bước này → chưa có tài xế nào
  // được gọi: ẩn mã nhận hàng/QR và hành trình giao.
  const step = customerStep?.step ?? "";
  const waitingChoice = step === "awaiting";
  const stoppedByCustomer = step === "cancelled" || step === "expired";
  const cs = customerStatus(status, deliveryInfo);
  const showDeliveryPanel = !isCancelled && !!deliveryInfo;
  const showPickup =
    !!order?.pickupCode &&
    payment !== PaymentStatus.paid &&
    !waitingChoice &&
    !stoppedByCustomer &&
    !isCancelled;
  const restaurantName =
    restaurants.find((r) => r.restaurantId === order?.restaurantId)?.name ?? "";

  return (
    <div className="mt-4 space-y-4">
      {/* Khối trạng thái ở đầu (bản xem trước đã duyệt). Đã gọi tài xế →
          dùng DeliveryTrackingPanel (4 bước, tài xế + nút Gọi, bản đồ);
          chưa có tài xế → khối trạng thái gọn với thanh 4 bước. */}
      {showDeliveryPanel && deliveryInfo ? (
        <DeliveryTrackingPanel info={deliveryInfo} />
      ) : (
        <div
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
          data-ocid="order_tracker.timeline_panel"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Trạng thái</p>
              <p
                className={cn(
                  "font-display text-lg font-bold",
                  isCancelled ? "text-destructive" : "text-foreground",
                )}
                data-ocid="order_tracker.status_label"
              >
                {cs.label}
              </p>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
              data-ocid="order_tracker.poll_indicator"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isFetching ? "bg-warning" : "bg-success",
                )}
                aria-hidden="true"
              />
              {isFetching ? "Đang cập nhật…" : lastUpdated}
            </span>
          </div>
          {isCancelled ? (
            <div
              className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              data-ocid="order_tracker.cancelled_state"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Đơn hàng đã bị huỷ.
            </div>
          ) : (
            <div className="mt-3" data-ocid="order_tracker.progress">
              <div className="grid grid-cols-4 gap-1">
                {PROGRESS_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "h-1.5 rounded-full",
                      i < cs.done
                        ? "bg-accent"
                        : i === cs.current
                          ? "bg-gradient-to-r from-accent from-50% to-border to-50%"
                          : "bg-border",
                    )}
                  />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-4 text-center text-[10.5px] text-muted-foreground">
                {PROGRESS_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      i === cs.current && "font-bold text-foreground",
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Thanh toán tiền món</span>
            <StatusBadge status={payment} size="sm" />
          </div>
        </div>
      )}

      {order && (
        <CustomerStepPanel
          orderId={order.orderId}
          state={customerStep}
          shippingFee={Number(order.shippingFee)}
          onChanged={() => onCustomerStepChanged?.()}
        />
      )}

      {/* Đơn hàng — danh sách món + tổng (trước đây màn hình chi tiết chưa
          có). */}
      {order && (
        <details
          open
          className="group rounded-xl border border-border bg-card px-4 shadow-sm"
          data-ocid="order_tracker.order_summary"
        >
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 font-semibold">
            <span>
              Đơn hàng ·{" "}
              <span data-ocid="order_tracker.total_amount">
                {formatVnd(order.amount + order.shippingFee)}
              </span>
            </span>
            <ChevronDown
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex flex-col gap-1.5 pb-4 text-sm">
            {order.items.map((it, i) => (
              <div
                key={it.itemId || i}
                className={cn(
                  "flex justify-between gap-3",
                  it.name === "Dụng cụ đựng đồ ăn" &&
                    "text-xs text-muted-foreground",
                )}
              >
                <span>
                  {Number(it.quantity)}× {it.name}
                </span>
                <span className="shrink-0 font-mono">
                  {formatVnd(it.price * it.quantity)}
                </span>
              </div>
            ))}
            {order.kmDiscountAmount + order.voucherDiscountAmount > 0n && (
              <div className="flex justify-between gap-3 text-destructive">
                <span>Khuyến mại + phiếu giảm giá</span>
                <span className="shrink-0 font-mono">
                  −
                  {formatVnd(
                    order.kmDiscountAmount + order.voucherDiscountAmount,
                  )}
                </span>
              </div>
            )}
            {order.shippingFee > 0n && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Phí ship</span>
                <span className="shrink-0 font-mono">
                  {formatVnd(order.shippingFee)}
                </span>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-bold">
              <span>Tổng thanh toán</span>
              <span className="font-mono text-[oklch(var(--bbh-gold))]">
                {formatVnd(order.amount + order.shippingFee)}
              </span>
            </div>
          </div>
        </details>
      )}

      {/* Mã nhận hàng + QR cho tài xế — thu gọn (tài xế đọc mã / nhân viên
          quét QR bằng camera điện thoại khi tới lấy món). */}
      {order && showPickup && (
        <details
          className="group rounded-xl border border-border bg-card px-4 shadow-sm"
          data-ocid="order_tracker.pickup_section"
        >
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 font-semibold">
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Mã nhận hàng & QR cho tài xế
            </span>
            <ChevronDown
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex flex-col gap-3 pb-4">
            <div className="flex items-center justify-between gap-3">
              <p
                className="font-mono text-lg font-bold tracking-[0.2em] text-foreground"
                data-ocid="order_tracker.pickup_code"
              >
                {order.pickupCode}
              </p>
              <CopyButton
                value={order.pickupCode}
                label="Sao chép mã nhận hàng"
              />
            </div>
            <div
              className="flex flex-col items-center gap-2"
              data-ocid="order_tracker.pickup_qr"
            >
              <p className="text-xs text-muted-foreground">
                Nhân viên quán quét QR này bằng camera điện thoại
              </p>
              <div className="rounded-lg bg-white p-2">
                <QRCodeCanvas
                  value={`${window.location.origin}/driver?scan_order=${encodeURIComponent(order.orderId)}&scan_code=${encodeURIComponent(order.pickupCode)}`}
                  size={160}
                />
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Nhà hàng — địa chỉ + đổi nhà hàng khi đặt nhầm. */}
      {order && (
        <details
          className="group rounded-xl border border-border bg-card px-4 shadow-sm"
          data-ocid="order_tracker.copy_panel"
        >
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 font-semibold">
            <span className="min-w-0 truncate">
              Nhà hàng{restaurantName ? ` · ${restaurantName}` : ""}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex flex-col gap-3 pb-4">
            <div className="flex items-start justify-between gap-3">
              <p
                className="flex min-w-0 items-start gap-1.5 break-words text-sm text-foreground"
                data-ocid="order_tracker.restaurant_address"
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {restaurantAddress || "—"}
              </p>
              {restaurantAddress && (
                <CopyButton
                  value={restaurantAddress}
                  label="Sao chép địa chỉ nhà hàng"
                />
              )}
            </div>
            {/* Ẩn khi đã gọi tài xế (hoặc chưa biết chắc — đang tải/lỗi
                mạng): tài xế đã được điều tới nhà hàng hiện tại. VPS cũng
                chặn thêm 1 lớp (routes/order-restaurant.js). */}
            {payment === PaymentStatus.unpaid &&
              !isCancelled &&
              deliveryInfo !== undefined &&
              !deliveryInfo && (
                <button
                  type="button"
                  onClick={() => setChangeRestaurantOpen(true)}
                  data-ocid="order_tracker.change_restaurant_button"
                  className="self-start text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Đặt nhầm nhà hàng? Chuyển sang nhà hàng khác
                </button>
              )}
          </div>
        </details>
      )}

      {/* Hoá đơn — cuối trang. */}
      <div data-ocid="order_tracker.actions_panel">
        <button
          type="button"
          onClick={onDownloadInvoice}
          disabled={!canDownloadInvoice || invoiceState.kind === "loading"}
          data-ocid="order_tracker.invoice_button"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {invoiceState.kind === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {canDownloadInvoice
            ? "Tải hoá đơn"
            : "Tải hoá đơn (sau khi thanh toán)"}
        </button>
        {invoiceState.kind === "error" && (
          <p
            className="mt-2 flex items-center gap-1.5 text-sm text-destructive"
            data-ocid="order_tracker.invoice_error"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {invoiceState.message}
          </p>
        )}
        {invoiceState.kind === "success" && (
          <p
            className="mt-2 flex items-center gap-1.5 text-sm text-success"
            data-ocid="order_tracker.invoice_success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Đã mở hoá đơn trong tab mới.
          </p>
        )}
      </div>

      {order && (
        <ChangeRestaurantDialog
          open={changeRestaurantOpen}
          onOpenChange={setChangeRestaurantOpen}
          orderId={order.orderId}
          currentRestaurantId={order.restaurantId}
          restaurants={restaurants}
          onChanged={onRestaurantChanged}
        />
      )}
    </div>
  );
}
