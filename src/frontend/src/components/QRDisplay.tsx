// QRDisplay — Bước 3 của DriverPaymentScreen.
// Hiển thị QR Tingee full screen, poll getOrderStatus 5s, tự ẩn khi #paid.
// Mobile-first: large centered QR, dark container, status badge, nút đóng.
//
// TRƯỚC khi gọi requestQr: bắt buộc nhân viên nhập "Mã nhận hàng" (6 ký tự)
// mà tài xế đọc cho nghe khi đến lấy hàng — xem lib/pickup-code.js (VPS) và
// PaymentQueue.tsx. Đây là cổng chặn nhân viên tự bấm "Thanh toán" khi tài
// xế chưa thực sự có mặt. Sai mã → VPS trả 401, hiện lại form nhập mã với
// lỗi, KHÔNG tự động thử lại (khác với lỗi tạo QR — retryable, có nút "Thử
// lại" dùng nguyên mã đã xác nhận đúng).
//
// Khi mã đúng, QRDisplay gọi requestQr(orderId, pickupCode) (VPS POST
// /order/:id/qr, idempotent) để tạo QR động Tingee. QR đọc từ phản hồi
// requestQr (qrCode), chính là trường mà updateOrderQr ghi vào Order
// (qrCode), KHÔNG phải tingeeQrCode (luôn rỗng). QrPayment.tsx (khách tự
// thanh toán, chế độ "customer") KHÔNG dùng component này và KHÔNG bị yêu
// cầu nhập mã — xem ghi chú trong routes/qr.js (VPS).

import { type Order, PaymentStatus } from "@/backend";
import { useCanister } from "@/lib/canister";
import { getOrderStatus } from "@/lib/canister";
import { VpsHttpError, requestQr } from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { type FormEvent, useEffect, useState } from "react";

interface QRDisplayProps {
  order: Order;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

// Trạng thái tạo QR. "needCode" là bước đầu tiên luôn luôn phải qua — chỉ
// chuyển sang "loading" sau khi nhân viên submit mã.
type QrState =
  | { kind: "needCode"; error?: string }
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
  const [qrState, setQrState] = useState<QrState>({ kind: "needCode" });
  const [codeInput, setCodeInput] = useState("");
  // Mã đã gửi lên VPS ở lần gọi requestQr gần nhất (dù thành công hay lỗi
  // tạm thời) — dùng lại khi bấm "Thử lại" ở lỗi tạo QR (không phải lỗi sai
  // mã) để không bắt nhập lại mã đã được VPS chấp nhận là đúng. Chỉ reset về
  // null khi VPS báo sai mã (401) — lúc đó quay lại form nhập từ đầu.
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(
    null,
  );

  async function generate(code: string) {
    setQrState({ kind: "loading" });
    setLastSubmittedCode(code);
    try {
      const res: RequestQrResponse = await requestQr(order.orderId, code);
      if (res.ok) {
        setQrState({ kind: "ready", qrCode: res.qrCode });
      } else {
        setQrState({
          kind: "error",
          retryable: res.retryable,
          message: res.message,
        });
      }
    } catch (e) {
      if (e instanceof VpsHttpError && e.status === 401) {
        // Sai mã nhận hàng — quay lại form nhập, hiện lỗi ngay tại đó.
        setLastSubmittedCode(null);
        setQrState({ kind: "needCode", error: e.message });
        return;
      }
      setQrState({
        kind: "error",
        retryable: true,
        message:
          "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau giây lát.",
      });
    }
  }

  function handleSubmitCode(e: FormEvent) {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      setQrState({ kind: "needCode", error: "Vui lòng nhập đủ mã nhận hàng." });
      return;
    }
    void generate(code);
  }

  // Nút "Thử lại" ở lỗi tạo QR (không phải lỗi sai mã) — dùng lại mã đã gửi
  // ở lần trước (VPS đã chấp nhận là đúng, chỉ là Tingee lỗi tạm thời),
  // không bắt nhân viên gõ lại.
  function handleRetryGenerate() {
    if (lastSubmittedCode) void generate(lastSubmittedCode);
  }

  // Poll getOrderStatus 5s; tự ẩn khi #paid. Polling chạy độc lập với trạng
  // thái tạo QR (kể cả trước khi nhân viên nhập mã) để không bỏ lỡ trường
  // hợp đơn được thanh toán qua đường khác trong lúc modal đang mở.
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
        {qrState.kind === "needCode" ? (
          <form
            onSubmit={handleSubmitCode}
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.code_form"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <KeyRound className="h-7 w-7" />
            </div>
            <div className="text-center">
              <h3 className="font-display text-xl font-semibold text-foreground">
                Nhập mã nhận hàng
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Hỏi tài xế mã 6 ký tự khách đã báo, rồi nhập vào đây trước khi
                tạo QR thanh toán.
              </p>
            </div>
            <div className="w-full">
              <label htmlFor="qr-pickup-code" className="sr-only">
                Mã nhận hàng
              </label>
              <input
                id="qr-pickup-code"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={8}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="VD: 7HJKQ2"
                aria-invalid={!!qrState.error}
                data-ocid="qr.code_input"
                className="h-14 w-full rounded-xl border border-input bg-card px-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em] text-foreground placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {qrState.error && (
                <p
                  className="mt-2 text-center text-sm text-destructive"
                  data-ocid="qr.code_error"
                  role="alert"
                >
                  {qrState.error}
                </p>
              )}
            </div>
            <button
              type="submit"
              data-ocid="qr.code_submit_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Xác nhận, tạo QR
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Đơn hàng: {order.orderId}
            </p>
          </form>
        ) : qrReady ? (
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
              onClick={handleRetryGenerate}
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
              : qrState.kind === "needCode"
                ? "Nhập đúng mã để tạo QR thanh toán."
                : "Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự hiển thị khi sẵn sàng."}
        </p>
      </div>
    </dialog>
  );
}
