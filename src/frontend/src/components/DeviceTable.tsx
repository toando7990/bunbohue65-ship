// DeviceTable — bảng thiết bị (trang Quản lý thiết bị, giao diện đã duyệt):
// Nhân viên (tên + SĐT + ngày kích hoạt + mã thiết bị) · Vai trò · Nhà hàng
// (hoặc Phạm vi cho thiết bị doanh nghiệp) · Trạng thái · Thao tác.
// Thiết bị đang hoạt động → "Thu hồi"; đã thu hồi → "Xoá" (xoá hẳn khỏi
// canister). Việc xác nhận do trang cha đảm nhiệm.

import { type Device, DeviceRole } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldOff, Trash2 } from "lucide-react";

const ROLE_LABELS: Record<DeviceRole, string> = {
  [DeviceRole.admin]: "Quản trị",
  [DeviceRole.cashier]: "Thu ngân",
  [DeviceRole.driver]: "Tài xế",
  [DeviceRole.paymentQueue]: "Hàng đợi thanh toán",
  [DeviceRole.accounting]: "Kế toán",
  [DeviceRole.salesPromoReporting]: "Báo cáo bán hàng & KM",
};

function formatTimestamp(ns: bigint): string {
  if (!ns || ns <= 0n) return "—";
  try {
    // Backend stores nanoseconds since epoch.
    const ms = Number(ns / 1_000_000n);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function truncateId(id: string, max = 14): string {
  if (!id) return "—";
  if (id.length <= max) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export interface DeviceTableProps {
  devices: Device[];
  isLoading?: boolean;
  onRevoke?: (device: Device) => void;
  onDelete?: (device: Device) => void;
  busyDeviceId?: string | null;
  emptyMessage?: string;
  // "restaurant": cột Nhà hàng (tên lấy từ restaurantNames); "scope": cột
  // Phạm vi = "Toàn chuỗi" khi thiết bị không gắn nhà hàng (Kế toán/Báo cáo),
  // còn Hàng đợi thanh toán gắn nhà hàng thì hiện tên nhà hàng.
  placeColumn?: "restaurant" | "scope";
  restaurantNames?: Map<string, string>;
}

export function DeviceTable({
  devices,
  isLoading = false,
  onRevoke,
  onDelete,
  busyDeviceId = null,
  emptyMessage = "Chưa có thiết bị nào.",
  placeColumn = "restaurant",
  restaurantNames,
}: DeviceTableProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        data-ocid="device.table.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải danh sách thiết bị…
      </div>
    );
  }

  if (!devices || devices.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center"
        data-ocid="device.table.empty_state"
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-card"
      data-ocid="device.table"
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="pl-3">Nhân viên</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>
              {placeColumn === "scope" ? "Phạm vi" : "Nhà hàng"}
            </TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="pr-3 text-right">
              <span className="sr-only">Thao tác</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((device, index) => {
            const busy = busyDeviceId === device.deviceId;
            return (
              <TableRow
                key={device.deviceId}
                className={device.active ? "" : "text-muted-foreground"}
                data-ocid={`device.table.row.${index}`}
              >
                <TableCell className="pl-3">
                  <p
                    className={`text-sm font-medium ${device.active ? "text-foreground" : ""}`}
                  >
                    {device.name || "Chưa có tên"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {device.phone || "—"} · kích hoạt{" "}
                    {formatTimestamp(device.activatedAt)}
                  </p>
                  <span
                    className="font-mono text-[11px] text-muted-foreground"
                    title={device.deviceId}
                  >
                    {truncateId(device.deviceId)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs text-info">
                    {ROLE_LABELS[device.role] ?? device.role}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {device.restaurantId
                    ? restaurantNames?.get(device.restaurantId) ||
                      device.restaurantId
                    : placeColumn === "scope"
                      ? "Toàn chuỗi"
                      : "—"}
                </TableCell>
                <TableCell>
                  {device.active ? (
                    <span
                      className="badge-success inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                      data-ocid={`device.table.status.${index}`}
                    >
                      Đang hoạt động
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      data-ocid={`device.table.status.${index}`}
                    >
                      Đã thu hồi
                    </span>
                  )}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {device.active && onRevoke && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRevoke(device)}
                      disabled={busy}
                      data-ocid={`device.table.revoke_button.${index}`}
                      aria-label={`Thu hồi thiết bị ${device.name || truncateId(device.deviceId)}`}
                    >
                      {busy ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Thu hồi
                    </Button>
                  )}
                  {!device.active && onDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(device)}
                      disabled={busy}
                      className="border-destructive/40 text-destructive hover:text-destructive"
                      data-ocid={`device.table.delete_button.${index}`}
                      aria-label={`Xoá thiết bị ${device.name || truncateId(device.deviceId)}`}
                    >
                      {busy ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Xoá
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { ROLE_LABELS, formatTimestamp, truncateId };
