// AdminPanel — trang /admin: setVpsSecret, generateActivationCode,
// revokeDevice, cleanupExpiredActivations, getCanisterIdText,
// cleanupUnpaidOrders. UI tiếng Việt.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCanisterIdText,
  useGetPaymentMode,
  useGetStoreHours,
  useSetPaymentMode,
  useSetStoreHours,
  useSetVpsSecret,
} from "@/hooks/useQueries";
import { cleanupUnpaidOrders } from "@/lib/vps-client";
import type { PaymentMode } from "@/types";
import {
  Clock,
  Copy,
  KeyRound,
  Loader2,
  ShieldOff,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-ocid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AdminPanel() {
  const [newSecret, setNewSecret] = useState<string>("");
  const [secretInputKey, setSecretInputKey] = useState<number>(0);
  const [paymentModeDraft, setPaymentModeDraft] = useState<PaymentMode | null>(
    null,
  );
  const [openHour, setOpenHour] = useState<string>("");
  const [openMinute, setOpenMinute] = useState<string>("");
  const [closeHour, setCloseHour] = useState<string>("");
  const [closeMinute, setCloseMinute] = useState<string>("");
  // Xoá đơn chưa thanh toán trước ngày hiện tại — 2 bước xác nhận liên
  // tiếp (không dùng useMutation/useQueries vì cleanupUnpaidOrders gọi
  // thẳng VPS, không qua canister — cùng quy ước changeOrderRestaurant ở
  // ChangeRestaurantDialog.tsx: gọi trực tiếp lib/vps-client, quản lý
  // trạng thái bằng useState cục bộ).
  const [cleanupStage, setCleanupStage] = useState<
    "idle" | "confirm1" | "confirm2"
  >("idle");
  const [cleanupPending, setCleanupPending] = useState(false);

  const setSecretMutation = useSetVpsSecret();
  const canisterIdQuery = useCanisterIdText();
  const paymentModeQuery = useGetPaymentMode();
  const setPaymentModeMutation = useSetPaymentMode();
  const storeHoursQuery = useGetStoreHours();
  const setStoreHoursMutation = useSetStoreHours();

  // Populate the form from the currently configured hours once loaded.
  useEffect(() => {
    if (storeHoursQuery.data) {
      setOpenHour(storeHoursQuery.data.openHour.toString());
      setOpenMinute(storeHoursQuery.data.openMinute.toString());
      setCloseHour(storeHoursQuery.data.closeHour.toString());
      setCloseMinute(storeHoursQuery.data.closeMinute.toString());
    }
  }, [storeHoursQuery.data]);

  const currentPaymentMode: PaymentMode =
    paymentModeDraft ??
    (paymentModeQuery.data === "customer" ? "customer" : "driver");

  async function handleSetSecret(e: React.FormEvent) {
    e.preventDefault();
    if (!newSecret.trim()) {
      toast.error("Vui lòng nhập secret mới.");
      return;
    }
    if (newSecret.length < 8) {
      toast.error("Secret phải có ít nhất 8 ký tự.");
      return;
    }
    try {
      await setSecretMutation.mutateAsync(newSecret.trim());
      toast.success("Đã cập nhật secret VPS.");
      setNewSecret("");
      // Force the password Input to unmount/remount so the browser cannot
      // re-fill it from its autofill history after React resets state.
      setSecretInputKey((k) => k + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật secret.";
      toast.error(message);
    }
  }

  async function copyCanisterId() {
    const id = canisterIdQuery.data;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Đã sao chép Canister ID.");
    } catch {
      toast.error("Không sao chép được. Vui lòng sao chép thủ công.");
    }
  }

  async function handleUpdatePaymentMode(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setPaymentModeMutation.mutateAsync(currentPaymentMode);
      toast.success("Đã cập nhật chế độ thanh toán đơn.");
      setPaymentModeDraft(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể cập nhật chế độ thanh toán.";
      toast.error(message);
    }
  }

  async function handleUpdateStoreHours(e: React.FormEvent) {
    e.preventDefault();
    const oh = Number(openHour);
    const om = Number(openMinute);
    const ch = Number(closeHour);
    const cm = Number(closeMinute);
    if (
      !Number.isInteger(oh) ||
      oh < 0 ||
      oh > 23 ||
      !Number.isInteger(om) ||
      om < 0 ||
      om > 59 ||
      !Number.isInteger(ch) ||
      ch < 0 ||
      ch > 23 ||
      !Number.isInteger(cm) ||
      cm < 0 ||
      cm > 59
    ) {
      toast.error("Giờ phải nằm trong khoảng hợp lệ (00:00 – 23:59).");
      return;
    }
    try {
      await setStoreHoursMutation.mutateAsync({
        openHour: BigInt(oh),
        openMinute: BigInt(om),
        closeHour: BigInt(ch),
        closeMinute: BigInt(cm),
      });
      toast.success("Đã cập nhật giờ mở/đóng cửa hàng.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể cập nhật giờ mở/đóng cửa hàng.";
      toast.error(message);
    }
  }

  async function handleConfirmCleanup() {
    setCleanupPending(true);
    try {
      const result = await cleanupUnpaidOrders();
      if (result.deletedCount === 0) {
        toast.success("Không có đơn nào cần xoá.");
      } else {
        toast.success(`Đã xoá ${result.deletedCount} đơn chưa thanh toán.`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể xoá đơn chưa thanh toán.";
      toast.error(message);
    } finally {
      setCleanupPending(false);
      setCleanupStage("idle");
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="admin.page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="admin.title"
        >
          Quản lý
        </h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình hệ thống, mã kích hoạt, thiết bị và canister.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Canister ID */}
        <SectionCard
          icon={KeyRound}
          title="Canister ID"
          description="Định danh canister dùng để VPS xác thực HMAC."
          testId="admin.canister_card"
        >
          <div className="flex flex-col gap-3">
            {canisterIdQuery.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-ocid="admin.canister.loading_state"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang tải Canister ID…
              </div>
            ) : canisterIdQuery.isError ? (
              <p
                className="text-sm text-destructive"
                data-ocid="admin.canister.error_state"
              >
                Không tải được Canister ID.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
                  title={canisterIdQuery.data ?? ""}
                  data-ocid="admin.canister.id_value"
                >
                  {canisterIdQuery.data || "—"}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyCanisterId}
                  disabled={!canisterIdQuery.data}
                  data-ocid="admin.canister.copy_button"
                  aria-label="Sao chép Canister ID"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* VPS Secret */}
        <SectionCard
          icon={ShieldOff}
          title="Cập nhật secret VPS"
          description="Đặt lại khóa bí mật dùng để ký HMAC giữa canister và VPS worker."
          testId="admin.secret_card"
        >
          <form
            onSubmit={handleSetSecret}
            className="flex flex-col gap-3"
            data-ocid="admin.secret_form"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="vps-secret" className="text-sm font-medium">
                Secret mới
              </Label>
              <Input
                key={secretInputKey}
                id="vps-secret"
                type="password"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="Ít nhất 8 ký tự"
                minLength={8}
                autoComplete="off"
                data-ocid="admin.secret_input"
              />
            </div>
            <Button
              type="submit"
              disabled={setSecretMutation.isPending || !newSecret.trim()}
              data-ocid="admin.secret.submit_button"
              className="w-full sm:w-auto"
            >
              {setSecretMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              Cập nhật secret
            </Button>
          </form>
        </SectionCard>

        {/* Payment mode */}
        <SectionCard
          icon={Wallet}
          title="Chế độ thanh toán đơn"
          description="Chọn ai là người thanh toán tiền đơn: tài xế trả trước rồi thanh toán lại, hoặc khách trả trực tiếp cho tài xế khi nhận hàng."
          testId="admin.payment_mode_card"
        >
          <form
            onSubmit={handleUpdatePaymentMode}
            className="flex flex-col gap-3"
            data-ocid="admin.payment_mode_form"
          >
            <fieldset
              className="flex flex-col gap-2"
              data-ocid="admin.payment_mode_fieldset"
            >
              <legend className="sr-only">Chế độ thanh toán đơn</legend>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-smooth hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                data-ocid="admin.payment_mode.option.driver"
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="driver"
                  checked={currentPaymentMode === "driver"}
                  onChange={() => setPaymentModeDraft("driver")}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-ocid="admin.payment_mode.radio.driver"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Tài xế trả tiền đơn
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Tài xế thanh toán trước cho đơn, sau đó quyết toán với nhà.
                  </span>
                </span>
              </label>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-smooth hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                data-ocid="admin.payment_mode.option.customer"
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="customer"
                  checked={currentPaymentMode === "customer"}
                  onChange={() => setPaymentModeDraft("customer")}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-ocid="admin.payment_mode.radio.customer"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Khách trả tiền đơn
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Khách thanh toán trực tiếp cho tài xế khi nhận hàng.
                  </span>
                </span>
              </label>
            </fieldset>
            <div
              className="text-xs text-muted-foreground"
              data-ocid="admin.payment_mode.current_value"
            >
              {paymentModeQuery.isLoading
                ? "Đang tải chế độ hiện tại…"
                : `Chế độ hiện tại: ${
                    currentPaymentMode === "driver"
                      ? "Tài xế trả tiền đơn"
                      : "Khách trả tiền đơn"
                  }`}
            </div>
            <Button
              type="submit"
              disabled={
                setPaymentModeMutation.isPending ||
                paymentModeQuery.isLoading ||
                paymentModeDraft === null
              }
              data-ocid="admin.payment_mode.submit_button"
              className="w-full sm:w-auto"
            >
              {setPaymentModeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="h-4 w-4" aria-hidden="true" />
              )}
              Cập nhật
            </Button>
          </form>
        </SectionCard>

        {/* Store open/close hours (global) */}
        <SectionCard
          icon={Clock}
          title="Giờ mở/đóng cửa hàng"
          description="Cấu hình giờ mở và đóng cửa toàn cục, áp dụng chung cho tất cả cửa hàng. Ngoài giờ này, cả tài xế và khách đều không thể đặt hàng."
          testId="admin.store_hours_card"
        >
          <form
            onSubmit={handleUpdateStoreHours}
            className="flex flex-col gap-3"
            data-ocid="admin.store_hours_form"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="store-open-hour"
                  className="text-sm font-medium"
                >
                  Giờ mở cửa
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="store-open-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={openHour}
                    onChange={(e) => setOpenHour(e.target.value)}
                    placeholder="08"
                    inputMode="numeric"
                    aria-label="Giờ mở cửa"
                    data-ocid="admin.store_hours.open_hour_input"
                    className="text-center font-mono"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={openMinute}
                    onChange={(e) => setOpenMinute(e.target.value)}
                    placeholder="00"
                    inputMode="numeric"
                    aria-label="Phút mở cửa"
                    data-ocid="admin.store_hours.open_minute_input"
                    className="text-center font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="store-close-hour"
                  className="text-sm font-medium"
                >
                  Giờ đóng cửa
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="store-close-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={closeHour}
                    onChange={(e) => setCloseHour(e.target.value)}
                    placeholder="22"
                    inputMode="numeric"
                    aria-label="Giờ đóng cửa"
                    data-ocid="admin.store_hours.close_hour_input"
                    className="text-center font-mono"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={closeMinute}
                    onChange={(e) => setCloseMinute(e.target.value)}
                    placeholder="00"
                    inputMode="numeric"
                    aria-label="Phút đóng cửa"
                    data-ocid="admin.store_hours.close_minute_input"
                    className="text-center font-mono"
                  />
                </div>
              </div>
            </div>
            <div
              className="text-xs text-muted-foreground"
              data-ocid="admin.store_hours.current_value"
            >
              {storeHoursQuery.isLoading
                ? "Đang tải giờ hiện tại…"
                : storeHoursQuery.data
                  ? `Giờ hiện tại: ${formatTime(
                      Number(storeHoursQuery.data.openHour),
                      Number(storeHoursQuery.data.openMinute),
                    )} – ${formatTime(
                      Number(storeHoursQuery.data.closeHour),
                      Number(storeHoursQuery.data.closeMinute),
                    )}`
                  : "Chưa cấu hình giờ mở/đóng."}
            </div>
            <Button
              type="submit"
              disabled={
                setStoreHoursMutation.isPending ||
                storeHoursQuery.isLoading ||
                !openHour ||
                !openMinute ||
                !closeHour ||
                !closeMinute
              }
              data-ocid="admin.store_hours.submit_button"
              className="w-full sm:w-auto"
            >
              {setStoreHoursMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4" aria-hidden="true" />
              )}
              Lưu giờ mở/đóng
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          icon={Trash2}
          title="Xoá đơn chưa thanh toán"
          description="Xoá vĩnh viễn mọi đơn CHƯA THANH TOÁN (kể cả hết hạn QR) được tạo TRƯỚC ngày hôm nay trên VPS. Đơn đã thanh toán/hoàn tiền không bao giờ bị đụng tới. Hành động này không thể hoàn tác."
          testId="admin.cleanup_unpaid_orders"
        >
          <Button
            type="button"
            variant="destructive"
            onClick={() => setCleanupStage("confirm1")}
            data-ocid="admin.cleanup_unpaid_orders.open_button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xoá các đơn hàng chưa thanh toán trước ngày hiện tại
          </Button>
        </SectionCard>
      </div>

      {/* Xác nhận LẦN 1 */}
      <AlertDialog
        open={cleanupStage === "confirm1"}
        onOpenChange={(open) => {
          if (!open) setCleanupStage("idle");
        }}
      >
        <AlertDialogContent data-ocid="admin.cleanup_unpaid_orders.confirm1_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá đơn chưa thanh toán?</AlertDialogTitle>
            <AlertDialogDescription>
              Toàn bộ đơn chưa thanh toán (kể cả hết hạn QR) được tạo trước ngày
              hôm nay sẽ bị xoá vĩnh viễn khỏi VPS, kèm log liên quan. Đơn đã
              thanh toán không bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="admin.cleanup_unpaid_orders.confirm1_cancel">
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setCleanupStage("confirm2")}
              data-ocid="admin.cleanup_unpaid_orders.confirm1_continue"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Tiếp tục
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Xác nhận LẦN 2 — cuối cùng, gọi API */}
      <AlertDialog
        open={cleanupStage === "confirm2"}
        onOpenChange={(open) => {
          if (!open) setCleanupStage("idle");
        }}
      >
        <AlertDialogContent data-ocid="admin.cleanup_unpaid_orders.confirm2_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận lần cuối</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này KHÔNG THỂ HOÀN TÁC. Bạn có chắc chắn muốn xoá vĩnh
              viễn các đơn chưa thanh toán này không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="admin.cleanup_unpaid_orders.confirm2_cancel">
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCleanup}
              disabled={cleanupPending}
              data-ocid="admin.cleanup_unpaid_orders.confirm2_confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
