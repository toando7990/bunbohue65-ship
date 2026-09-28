// DeviceManager — trang /admin/devices (giao diện đã duyệt):
//  - 2 tab: "Cấp nhà hàng" (Quản trị / Thu ngân / Tài xế) và "Cấp doanh
//    nghiệp" (Kế toán / Báo cáo bán hàng & KM / Hàng đợi thanh toán);
//  - thống kê Đang hoạt động / Đã thu hồi; lọc nhà hàng (tab nhà hàng), chip
//    vai trò, chip trạng thái (mặc định Đang hoạt động);
//  - "Tạo mã kích hoạt" mở form theo tab; ⋯ → "Thu hồi theo mã thiết bị";
//  - "Dọn dẹp" (badge = số mục có thể dọn) mở DeviceCleanupDialog;
//  - mỗi dòng: Thu hồi (đang hoạt động) / Xoá (đã thu hồi), đều có xác nhận.
// Danh sách lấy theo vai trò (useDevicesByRole) vì canister chỉ nhận 1 vai
// trò mỗi lần gọi; lọc nhà hàng làm ở client.

import { type Device, DeviceRole } from "@/backend";
import { ActivationCodeForm } from "@/components/ActivationCodeForm";
import { DeviceCleanupDialog } from "@/components/DeviceCleanupDialog";
import { DeviceTable, ROLE_LABELS, truncateId } from "@/components/DeviceTable";
import { EnterpriseActivationCodeForm } from "@/components/EnterpriseActivationCodeForm";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeleteRevokedDevice,
  useDeviceCleanupCounts,
  useDevicesByRole,
  useRestaurants,
  useRevokeDevice,
} from "@/hooks/useQueries";
import {
  Building2,
  KeyRound,
  Loader2,
  MoreHorizontal,
  ShieldOff,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Tab = "restaurant" | "enterprise";
type StatusFilter = "active" | "revoked" | "all";
type RoleFilter = "all" | DeviceRole;

const RESTAURANT_ROLES: DeviceRole[] = [
  DeviceRole.admin,
  DeviceRole.cashier,
  DeviceRole.driver,
];
const ENTERPRISE_ROLES: DeviceRole[] = [
  DeviceRole.accounting,
  DeviceRole.salesPromoReporting,
  DeviceRole.paymentQueue,
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "active", label: "Đang hoạt động" },
  { value: "revoked", label: "Đã thu hồi" },
  { value: "all", label: "Tất cả" },
];

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
      data-ocid={testId}
    >
      {children}
    </button>
  );
}

function useRoleDevices(roles: DeviceRole[]) {
  // Số hook cố định (3 vai trò mỗi nhóm) → gọi tuần tự an toàn.
  const q0 = useDevicesByRole(roles[0]);
  const q1 = useDevicesByRole(roles[1]);
  const q2 = useDevicesByRole(roles[2]);
  const devices = [...(q0.data ?? []), ...(q1.data ?? []), ...(q2.data ?? [])];
  return {
    devices,
    isLoading: !!(q0.isLoading || q1.isLoading || q2.isLoading),
  };
}

export function DeviceManager() {
  const { data: restaurants } = useRestaurants();
  const restaurantNames = useMemo(
    () =>
      new Map((restaurants ?? []).map((r) => [r.restaurantId, r.name || ""])),
    [restaurants],
  );

  const [tab, setTab] = useState<Tab>("restaurant");
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("active");

  const [createOpen, setCreateOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [revokeByIdOpen, setRevokeByIdOpen] = useState(false);
  const [revokeIdInput, setRevokeIdInput] = useState("");
  const [confirm, setConfirm] = useState<{
    kind: "revoke" | "delete";
    device: Device;
  } | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);

  const restaurantQ = useRoleDevices(RESTAURANT_ROLES);
  const enterpriseQ = useRoleDevices(ENTERPRISE_ROLES);
  const countsQuery = useDeviceCleanupCounts();
  const revokeMutation = useRevokeDevice();
  const deleteMutation = useDeleteRevokedDevice();

  const counts = countsQuery.data;
  const cleanupTotal = counts
    ? Number(counts.expiredCodes) +
      Number(counts.restaurantDevices) +
      Number(counts.enterpriseDevices)
    : 0;

  const isRestaurantTab = tab === "restaurant";
  const current = isRestaurantTab ? restaurantQ : enterpriseQ;
  const roles = isRestaurantTab ? RESTAURANT_ROLES : ENTERPRISE_ROLES;

  // Phạm vi tab (+ nhà hàng) → thống kê; thêm vai trò + trạng thái → bảng.
  const scoped = current.devices.filter(
    (d) =>
      !isRestaurantTab ||
      restaurantFilter === "all" ||
      d.restaurantId === restaurantFilter,
  );
  const activeCount = scoped.filter((d) => d.active).length;
  const revokedCount = scoped.length - activeCount;
  const visible = scoped
    .filter((d) => roleFilter === "all" || d.role === roleFilter)
    .filter((d) =>
      status === "all" ? true : status === "active" ? d.active : !d.active,
    )
    .sort((a, b) =>
      a.active !== b.active
        ? a.active
          ? -1
          : 1
        : Number(b.activatedAt - a.activatedAt),
    );

  function switchTab(next: Tab) {
    setTab(next);
    setRoleFilter("all");
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, device } = confirm;
    setConfirm(null);
    setBusyDeviceId(device.deviceId);
    try {
      if (kind === "revoke") {
        await revokeMutation.mutateAsync(device.deviceId);
        toast.success("Đã thu hồi thiết bị.");
      } else {
        await deleteMutation.mutateAsync(device.deviceId);
        toast.success("Đã xoá thiết bị khỏi hệ thống.");
      }
    } catch (err) {
      toast.error(
        errMsg(
          err,
          kind === "revoke"
            ? "Không thể thu hồi thiết bị."
            : "Không thể xoá thiết bị.",
        ),
      );
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function handleRevokeById(e: React.FormEvent) {
    e.preventDefault();
    const id = revokeIdInput.trim();
    if (!id) return;
    try {
      await revokeMutation.mutateAsync(id);
      toast.success("Đã thu hồi thiết bị.");
      setRevokeIdInput("");
      setRevokeByIdOpen(false);
    } catch (err) {
      toast.error(errMsg(err, "Không thể thu hồi thiết bị."));
    }
  }

  const emptyMessage =
    current.devices.length === 0
      ? isRestaurantTab
        ? "Chưa có thiết bị nhà hàng nào được kích hoạt."
        : "Chưa có thiết bị doanh nghiệp nào được kích hoạt."
      : "Không có thiết bị nào khớp với bộ lọc.";

  const confirmName = confirm
    ? confirm.device.name || truncateId(confirm.device.deviceId)
    : "";

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="device.page"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            data-ocid="device.title"
          >
            Quản lý thiết bị
          </h1>
          <p className="text-sm text-muted-foreground">
            Cấp mã kích hoạt, thu hồi và dọn dẹp thiết bị theo cấp nhà hàng và
            cấp doanh nghiệp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCleanupOpen(true)}
            data-ocid="device.cleanup.button"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Dọn dẹp
            {cleanupTotal > 0 && (
              <span
                className="ml-0.5 rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning"
                data-ocid="device.cleanup.badge"
              >
                {cleanupTotal}
              </span>
            )}
          </Button>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            data-ocid="device.create_code.button"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Tạo mã kích hoạt
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Thao tác khác"
                data-ocid="device.more_menu"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setRevokeByIdOpen(true)}
                data-ocid="device.revoke_by_id.menu_item"
              >
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
                Thu hồi theo mã thiết bị
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="mt-6 flex gap-1 border-b border-border"
        role="tablist"
        data-ocid="device.tabs"
      >
        {(
          [
            {
              value: "restaurant",
              label: "Cấp nhà hàng",
              icon: Store,
              n: restaurantQ.devices.filter((d) => d.active).length,
            },
            {
              value: "enterprise",
              label: "Cấp doanh nghiệp",
              icon: Building2,
              n: enterpriseQ.devices.filter((d) => d.active).length,
            },
          ] as const
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => switchTab(t.value)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium sm:px-4 ${
              tab === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-ocid={`device.tab.${t.value}`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            <span className="rounded-full bg-muted px-1.5 text-xs">{t.n}</span>
          </button>
        ))}
      </div>

      {/* Stats + filters */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div
            className="rounded-lg border border-border bg-card px-4 py-3"
            data-ocid="device.stat.active"
          >
            <p className="text-xs text-muted-foreground">Đang hoạt động</p>
            <p className="text-2xl font-semibold text-success">{activeCount}</p>
          </div>
          <div
            className="rounded-lg border border-border bg-card px-4 py-3"
            data-ocid="device.stat.revoked"
          >
            <p className="text-xs text-muted-foreground">Đã thu hồi</p>
            <p className="text-2xl font-semibold text-muted-foreground">
              {revokedCount}
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          data-ocid="device.filters"
        >
          {isRestaurantTab && (
            <Select
              value={restaurantFilter}
              onValueChange={setRestaurantFilter}
            >
              <SelectTrigger
                className="h-8 w-full sm:w-[220px]"
                aria-label="Lọc theo nhà hàng"
                data-ocid="device.restaurant_select"
              >
                <SelectValue placeholder="Tất cả nhà hàng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhà hàng</SelectItem>
                {restaurants?.map((r) => (
                  <SelectItem key={r.restaurantId} value={r.restaurantId}>
                    {r.name || r.restaurantId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Chip
            active={roleFilter === "all"}
            onClick={() => setRoleFilter("all")}
            testId="device.role_chip.all"
          >
            Tất cả vai trò
          </Chip>
          {roles.map((r) => (
            <Chip
              key={r}
              active={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              testId={`device.role_chip.${r}`}
            >
              {ROLE_LABELS[r]}
            </Chip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <span className="basis-full sm:hidden" />
          {STATUS_OPTIONS.map((s) => (
            <Chip
              key={s.value}
              active={status === s.value}
              onClick={() => setStatus(s.value)}
              testId={`device.status_chip.${s.value}`}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div
        className="mt-4"
        data-ocid={
          isRestaurantTab
            ? "device.restaurant_devices_card"
            : "device.enterprise_devices_card"
        }
      >
        <DeviceTable
          devices={visible}
          isLoading={current.isLoading}
          onRevoke={(device) => setConfirm({ kind: "revoke", device })}
          onDelete={(device) => setConfirm({ kind: "delete", device })}
          busyDeviceId={busyDeviceId}
          emptyMessage={emptyMessage}
          placeColumn={isRestaurantTab ? "restaurant" : "scope"}
          restaurantNames={restaurantNames}
        />
      </div>

      {/* Tạo mã kích hoạt — form theo tab đang mở */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg" data-ocid="device.create_dialog">
          <DialogHeader>
            <DialogTitle>
              {isRestaurantTab
                ? "Tạo mã kích hoạt — cấp nhà hàng"
                : "Tạo mã kích hoạt — cấp doanh nghiệp"}
            </DialogTitle>
            <DialogDescription>
              {isRestaurantTab
                ? "Mã 6 ký tự, hiệu lực 15 phút, cho Quản trị / Thu ngân / Tài xế của một nhà hàng."
                : "Mã cho Kế toán hoặc Báo cáo bán hàng & KM — không gắn nhà hàng, số liệu toàn chuỗi."}
            </DialogDescription>
          </DialogHeader>
          {isRestaurantTab ? (
            <ActivationCodeForm />
          ) : (
            <EnterpriseActivationCodeForm />
          )}
        </DialogContent>
      </Dialog>

      {/* Thu hồi theo mã thiết bị */}
      <Dialog open={revokeByIdOpen} onOpenChange={setRevokeByIdOpen}>
        <DialogContent className="max-w-md" data-ocid="device.revoke_dialog">
          <form
            onSubmit={handleRevokeById}
            className="flex flex-col gap-4"
            data-ocid="device.revoke_form"
          >
            <DialogHeader>
              <DialogTitle>Thu hồi theo mã thiết bị</DialogTitle>
              <DialogDescription>
                Thiết bị mất quyền truy cập ngay lập tức.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="revoke-device">Mã thiết bị</Label>
              <Input
                id="revoke-device"
                value={revokeIdInput}
                onChange={(e) => setRevokeIdInput(e.target.value)}
                placeholder="VD: dev-abc123"
                data-ocid="device.revoke_input"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                disabled={revokeMutation.isPending || !revokeIdInput.trim()}
                data-ocid="device.revoke.submit_button"
              >
                {revokeMutation.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                )}
                Thu hồi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Xác nhận Thu hồi / Xoá từng thiết bị */}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent data-ocid="device.confirm_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "delete"
                ? `Xoá thiết bị "${confirmName}"?`
                : `Thu hồi thiết bị "${confirmName}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "Thiết bị đã thu hồi sẽ bị xoá hẳn khỏi canister để giải phóng bộ nhớ. Không thể hoàn tác."
                : "Thiết bị mất quyền truy cập ngay. Muốn dùng lại phải kích hoạt bằng mã mới."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void runConfirm()}
              data-ocid="device.confirm_button"
            >
              {confirm?.kind === "delete" ? (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              {confirm?.kind === "delete" ? "Xoá" : "Thu hồi"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeviceCleanupDialog
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        revokedRestaurantDevices={restaurantQ.devices.filter((d) => !d.active)}
        revokedEnterpriseDevices={enterpriseQ.devices.filter((d) => !d.active)}
        restaurantNames={restaurantNames}
      />
    </section>
  );
}
