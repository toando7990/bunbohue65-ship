// CounterQRDisplay — QR thanh toán full màn hình cho app quầy (CounterOrder).
// Khác với QRDisplay.tsx (dùng cho "Hàng đợi thanh toán" — nhân viên phải
// nhập đúng "Mã nhận hàng" trước khi tạo QR, để đảm bảo tài xế đã thực sự có
// mặt): ở app quầy, khách đứng ngay tại chỗ khi nhân viên đặt đơn, không có
// khái niệm "tài xế chưa đến" — nên tạo QR ngay lập tức, không cần cổng mã.
//
// Gọi requestQr(orderId) KHÔNG kèm pickupCode — routes/qr.js (VPS) chỉ kiểm
// tra mã khi request có gửi kèm field này, nên luồng quầy không bị chặn,
// giống hệt cách QrPayment.tsx (khách tự thanh toán) hoạt động.

import { type Order, PaymentStatus } from "@/backend";
import { useCanister } from "@/lib/canister";
import { getOrderStatus } from "@/lib/canister";
import { requestQr } from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import { CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";

interface CounterQRDisplayProps {
  order: Order;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

type QrState =
  | { kind: "loading" }
  | { kind: "ready"; qrCode: string }
  | { kind: "error"; retryable: boolean; message: string };

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

export function CounterQRDisplay({
  order,
  onClose,
  onPaid,
}: CounterQRDisplayProps) {
  const { actor } = useCanister();
  const [status, setStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [polling, setPolling] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [qrState, setQrState] = useState<QrState>({ kind: "loading" });

  // Tạo QR ngay khi mở — không có bước nhập mã (khác QRDisplay.tsx).
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
  }, [actor, order, polling]);

  useEffect(() => {
    if (status !== PaymentStatus.paid) return;
    const id = setTimeout(() => onPaid(order), 1500);
    return () => clearTimeout(id);
  }, [status, order, onPaid]);

  const isPaid = status === PaymentStatus.paid;
  const qrReady = qrState.kind === "ready";
  const qrValue = qrState.kind === "ready" ? qrState.qrCode : "";

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-full max-h-full w-full max-w-full flex-col bg-foreground/95 p-0"
      aria-label="Thanh toán QR"
      data-ocid="counter_qr.dialog"
    >
      <div className="flex items-center justify-between px-4 py-4 md:px-6">
        <p className="font-display text-lg font-semibold text-background">
          Thanh toán tại quầy
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          data-ocid="counter_qr.close_button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-background/80 transition-smooth hover:bg-background/10 hover:text-background"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
        {qrReady ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="counter_qr.card"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Số tiền thanh toán
              </p>
              <p
                className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl"
                data-ocid="counter_qr.amount"
              >
                {formatVnd(order.amount)}
              </p>
            </div>
            <div
              className="rounded-xl bg-foreground p-4 md:p-6"
              data-ocid="counter_qr.canvas"
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
            {isPaid ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
                data-ocid="counter_qr.success_state"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Đã thanh toán
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/20 px-4 py-1.5 text-sm font-semibold text-warning-foreground"
                data-ocid="counter_qr.pending_state"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang chờ
              </span>
            )}
          </div>
        ) : (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="counter_qr.not_ready_card"
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
                  ? qrState.message
                  : "Mã QR đang được tạo…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRetryTick((t) => t + 1)}
              data-ocid="counter_qr.retry_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>
          </div>
        )}

        <p className="max-w-sm text-center text-xs text-background/70">
          {isPaid
            ? "Thanh toán thành công. Đang đóng…"
            : "Đang kiểm tra trạng thái mỗi 5 giây."}
        </p>
      </div>
    </dialog>
  );
}
