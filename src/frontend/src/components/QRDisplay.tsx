// QRDisplay — Bước 3 của DriverPaymentScreen.
// Hiển thị QR Tingee full screen, poll getOrderStatus 5s, tự ẩn khi #paid.
// Mobile-first: large centered QR, dark container, status badge, nút đóng.
//
// Khi driver bấm [Thanh toán], QRDisplay gọi requestQr(orderId) (VPS POST
// /order/:id/qr, idempotent) để tạo QR động Tingee — giống hệt luồng khách
// hàng (QrPayment.tsx). QR đọc từ phản hồi requestQr (qrCode), chính là trường
// mà updateOrderQr ghi vào Order (qrCode), KHÔNG phải tingeeQrCode (luôn rỗng).

import { type Order, PaymentStatus } from "@/backend";
import { useCanister } from "@/lib/canister";
import { getOrderStatus } from "@/lib/canister";
import { requestQr } from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import { CheckCircle2, Loader2, Phone, RefreshCw, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";

interface QRDisplayProps {
  order: Order;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

// Trạng thái tạo QR.
type QrState =
  | { kind: "loading" }
  | { kind: "ready"; qrCode: string }
  | { kind: "error"; retryable: boolean; message: string };

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

export function QRDisplay({ order, onClose, onPaid }: QRDisplayProps) {
  const { actor } = useCanister();
  const [status, setStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [polling, setPolling] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [qrState, setQrState] = useState<QrState>({ kind: "loading" });

  // Tạo QR động Tingee ngay khi mở modal (và khi bấm "Thử lại" qua retryTick).
  // requestQr idempotent: nếu QR hiện có còn hiệu lực, VPS trả lại QR cũ (reused).
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick là intentional re-trigger cho nút Thử lại
  useEffect(() => {
    let cancelled = false;

    async function generate() {
      setQrState({ kind: "loading" });
      try {
        const res: RequestQrResponse = await requestQr(order.orderId);
        if (cancelled) return;
        if (res.ok) {
          setQrState({ kind: "ready", qrCode: res.qrCode });
        } else {
          setQrState({
            kind: "error",
            retryable: res.retryable,
            message: res.message,
          });
        }
      } catch {
        if (cancelled) return;
        setQrState({
          kind: "error",
          retryable: true,
          message:
            "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau giây lát.",
        });
      }
    }

    void generate();
    return () => {
      cancelled = true;
    };
  }, [order.orderId, retryTick]);

  // Poll getOrderStatus 5s; tự ẩn khi #paid. Polling vẫn chạy kể cả khi QR chưa
  // sẵn sàng — nếu requestQr thất bại, nút "Thử lại" sẽ gọi lại generate.
  // retryTick là INTENTIONAL trigger: khi user bấm "Thử lại", handleRetry tăng
  // retryTick → useEffect re-run → poll ngay lập tức, không cần đợi 5s tiếp theo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick là intentional re-trigger cho nút Thử lại
  useEffect(() => {
    if (!actor || !polling) return;
    let cancelled = false;

    async function check() {
      if (!actor || cancelled) return;
      try {
        const s = await getOrderStatus(actor, order.orderId);
        if (cancelled) return;
        setStatus(s.paymentStatus);
        if (s.paymentStatus === PaymentStatus.paid) {
          setPolling(false);
        }
      } catch {
        // Lỗi poll im lặng — sẽ thử lại ở lần sau.
      }
    }

    void check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [actor, order, polling, retryTick]);

  // Tự đóng khi #paid: effect riêng theo dõi `status`, KHÔNG phụ thuộc `polling`
  // nên cleanup của nó không bị chạy khi setPolling(false) ở trên. Cho driver thấy
  // trạng thái thành công 1.5s rồi gọi onPaid(order) để đóng modal + refresh queue.
  useEffect(() => {
    if (status !== PaymentStatus.paid) return;
    const id = setTimeout(() => onPaid(order), 1500);
    return () => clearTimeout(id);
  }, [status, order, onPaid]);

  const isPaid = status === PaymentStatus.paid;
  const qrReady = qrState.kind === "ready";
  const qrValue = qrState.kind === "ready" ? qrState.qrCode : "";

  // Kích hoạt một lần tạo QR + poll ngay lập tức khi user bấm "Thử lại".
  const handleRetry = () => {
    setRetryTick((t) => t + 1);
  };

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex flex-col bg-foreground/95 backdrop-blur-sm"
      data-ocid="qr.modal"
      aria-label="Quét QR để thanh toán"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <h2 className="font-display text-lg font-semibold text-background">
          Quét QR để thanh toán
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-ocid="qr.close_button"
          aria-label="Đóng QR"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-background/10 text-background transition-smooth hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </header>

      {/* QR center */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
        {qrReady ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.card"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Số tiền thanh toán
              </p>
              <p
                className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl"
                data-ocid="qr.amount"
              >
                {formatVnd(order.amount - order.shippingFee)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tiền hàng (không gồm phí ship — phí ship thuộc về Ahamove)
              </p>
            </div>
            {/* QR container — dark, high contrast per design preview */}
            <div
              className="rounded-xl bg-foreground p-4 md:p-6"
              data-ocid="qr.canvas"
            >
              <QRCodeCanvas
                value={qrValue}
                size={256}
                level="M"
                includeMargin={false}
                bgColor="#000000"
                fgColor="#ffffff"
                aria-label="Mã QR thanh toán Tingee"
              />
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Khách quét mã bằng app ngân hàng để hoàn tất thanh toán
            </p>

            {/* Status badge */}
            {isPaid ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
                data-ocid="qr.success_state"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Đã thanh toán
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/20 px-4 py-1.5 text-sm font-semibold text-warning-foreground"
                data-ocid="qr.pending_state"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang chờ
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.not_ready_card"
            role="alert"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning"
              aria-hidden="true"
            >
              <RefreshCw className="h-7 w-7" />
            </div>

            <div className="text-center">
              <h3 className="font-display text-xl font-semibold text-foreground">
                QR chưa sẵn sàng
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {qrState.kind === "error"
                  ? qrState.retryable
                    ? qrState.message
                    : "Không thể tạo mã thanh toán cho đơn này. Vui lòng liên hệ tổng đài để được hỗ trợ."
                  : 'Mã QR đang được tạo. Vui lòng liên hệ tổng đài để được hỗ trợ hoặc bấm "Thử lại" sau giây lát.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRetry}
              data-ocid="qr.retry_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>

            <a
              href="tel:19006565"
              data-ocid="qr.hotline_link"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-3 text-sm font-semibold text-foreground transition-smooth hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Gọi tổng đài: 1900 6565
            </a>

            <p className="text-center text-xs text-muted-foreground">
              Đơn hàng: {order.orderId}
            </p>
          </div>
        )}

        {/* Footer hint */}
        <p className="max-w-sm text-center text-xs text-background/70">
          {isPaid
            ? "Thanh toán thành công. Đang đóng…"
            : qrReady
              ? "Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự đóng khi nhận được xác nhận."
              : "Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự hiển thị khi sẵn sàng."}
        </p>
      </div>
    </dialog>
  );
}
