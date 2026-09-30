// CustomerStepPanel — khối "Đặt tài xế" / "Huỷ đơn" ở đầu trang Theo dõi đơn
// (đơn đặt món từ xa). Đơn mới KHÔNG tự gọi tài xế: khách chọn trong 10
// phút, quá hạn VPS tự huỷ (vps-worker/src/lib/customer-step.js). Nhà hàng
// chỉ thấy đơn ở hàng đợi thanh toán /driver sau khi khách bấm "Đặt tài xế".
//
// Chỉ hiện nút cho trình duyệt đã đặt đơn (danh sách "bbh_my_orders" —
// cùng cơ chế trang Theo dõi đơn). Trạng thái đã huỷ vẫn hiện cho mọi người.

import {
  type CustomerStepState,
  customerCancelOrder,
  customerRequestDispatch,
} from "@/lib/vps-client";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Bike, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const CANCEL_REASONS = [
  "Đặt nhầm món",
  "Phí ship cao",
  "Đổi ý, không đặt nữa",
  "Lý do khác",
];

export function isMyOrder(orderId: string): boolean {
  try {
    const raw = localStorage.getItem("bbh_my_orders");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.includes(orderId);
  } catch {
    return false;
  }
}

function formatClock(ms: number): string {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(
    new Date(ms),
  );
}

// Đếm ngược tới deadline, bù lệch giờ máy khách so với VPS (serverNow).
function useCountdown(state: CustomerStepState | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (state?.serverNow) setOffset(state.serverNow - Date.now());
  }, [state?.serverNow]);
  const active = state?.step === "awaiting" && !!state.deadline;
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  if (!active || !state?.deadline) return null;
  return Math.max(0, state.deadline - (now + offset));
}

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  orderId: string;
  state: CustomerStepState | undefined;
  shippingFee?: number;
  onChanged: () => void;
}

export function CustomerStepPanel({
  orderId,
  state,
  shippingFee,
  onChanged,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [busy, setBusy] = useState<"dispatch" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = useCountdown(state);
  const mine = isMyOrder(orderId);

  if (!state || !state.step) return null;

  async function run(kind: "dispatch" | "cancel") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "dispatch") await customerRequestDispatch(orderId);
      else await customerCancelOrder(orderId, reason);
      setConfirming(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi, vui lòng thử lại.");
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  // Đã huỷ (khách huỷ hoặc tự huỷ quá hạn).
  if (state.step === "cancelled" || state.step === "expired") {
    const expired = state.step === "expired";
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-5"
        data-ocid="customer_step.cancelled"
      >
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-destructive">
          <XCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {expired ? "Đơn đã tự huỷ" : "Đơn đã được huỷ"}
        </p>
        <p className="mt-1 text-sm text-foreground">
          {expired
            ? "Quá 10 phút chưa đặt tài xế nên đơn được huỷ"
            : `Lý do: ${state.cancelReason || "Khách huỷ đơn"}`}
          {state.cancelledAt ? ` lúc ${formatClock(state.cancelledAt)}` : ""}.
          Bạn chưa bị trừ tiền.
        </p>
        <Link
          to="/"
          data-ocid="customer_step.reorder"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          {expired ? "Đặt lại đơn" : "Đặt đơn mới"}
        </Link>
      </div>
    );
  }

  if (!mine) return null;

  // Đã đặt tài xế: chỉ còn nút huỷ khi tài xế chưa nhận đơn.
  if (state.step === "dispatched") {
    if (!state.canCancel) return null;
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 shadow-sm"
        data-ocid="customer_step.dispatched"
      >
        {confirming ? (
          <CancelConfirm
            orderId={orderId}
            reason={reason}
            setReason={setReason}
            busy={busy === "cancel"}
            onBack={() => setConfirming(false)}
            onConfirm={() => run("cancel")}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              data-ocid="customer_step.cancel_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md border-[1.5px] border-destructive px-4 py-2 text-sm font-semibold text-destructive transition-smooth hover:bg-destructive/10"
            >
              Huỷ đơn
            </button>
            <p className="mt-2 text-xs text-muted-foreground">
              Có thể huỷ cho tới khi tài xế nhận đơn.
            </p>
          </>
        )}
        {error && <ErrorLine message={error} />}
      </div>
    );
  }

  // awaiting — khách chọn Đặt tài xế / Huỷ đơn.
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-card p-4 shadow-sm"
      data-ocid="customer_step.choice"
    >
      <div>
        <h2 className="font-display text-lg font-semibold">
          Đơn đã gửi tới nhà hàng
        </h2>
        <p className="text-sm text-muted-foreground">
          Bạn muốn làm gì tiếp theo?
        </p>
      </div>
      {shippingFee !== undefined && shippingFee > 0 && (
        <div className="flex justify-between text-sm">
          <span>Phí ship dự kiến</span>
          <span className="font-semibold">
            {shippingFee.toLocaleString("vi-VN")}đ
          </span>
        </div>
      )}
      {confirming ? (
        <CancelConfirm
          orderId={orderId}
          reason={reason}
          setReason={setReason}
          busy={busy === "cancel"}
          onBack={() => setConfirming(false)}
          onConfirm={() => run("cancel")}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => run("dispatch")}
            disabled={busy !== null || !state.canDispatch}
            data-ocid="customer_step.dispatch_button"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-bold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
          >
            {busy === "dispatch" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Bike className="h-5 w-5" aria-hidden="true" />
            )}
            Đặt tài xế
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
            data-ocid="customer_step.cancel_button"
            className="inline-flex min-h-[48px] items-center justify-center rounded-md border-[1.5px] border-destructive px-4 py-2 text-base font-bold text-destructive transition-smooth hover:bg-destructive/10 disabled:opacity-50"
          >
            Huỷ đơn
          </button>
        </>
      )}
      {remaining !== null && (
        <p
          className="flex items-center gap-1.5 text-sm text-destructive"
          data-ocid="customer_step.countdown"
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Đơn tự huỷ sau{" "}
          <span className="font-mono font-bold">{mmss(remaining)}</span> nếu bạn
          chưa bấm “Đặt tài xế”.
        </p>
      )}
      {error && <ErrorLine message={error} />}
    </div>
  );
}

function CancelConfirm({
  orderId,
  reason,
  setReason,
  busy,
  onBack,
  onConfirm,
}: {
  orderId: string;
  reason: string;
  setReason: (r: string) => void;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4"
      data-ocid="customer_step.cancel_confirm"
    >
      <p className="font-display font-semibold">
        Huỷ đơn <span className="font-mono text-sm">{orderId}</span>?
      </p>
      <p className="text-sm text-muted-foreground">
        Đơn sẽ được huỷ ở nhà hàng. Bạn chưa bị trừ tiền.
      </p>
      <label
        htmlFor="customer-step-reason"
        className="text-xs text-muted-foreground"
      >
        Lý do (không bắt buộc)
      </label>
      <select
        id="customer-step-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-[44px] rounded-md border border-border bg-card px-3 text-sm"
      >
        {CANCEL_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="min-h-[44px] rounded-md border border-border bg-card px-3 text-sm font-semibold transition-smooth hover:bg-secondary"
        >
          Quay lại
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          data-ocid="customer_step.confirm_cancel_button"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-destructive px-3 text-sm font-semibold text-destructive-foreground transition-smooth hover:opacity-90 disabled:opacity-60"
        >
          {busy && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Xác nhận huỷ
        </button>
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p
      className="flex items-center gap-1.5 text-sm text-destructive"
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
