// DeviceCleanupDialog — "Dọn dẹp" gộp (giao diện đã duyệt): mã kích hoạt
// hết hạn/đã dùng + thiết bị đã thu hồi cấp nhà hàng / cấp doanh nghiệp.
// Chọn từng loại, xem trước thiết bị sắp xoá, rồi dọn. Mặc định chọn mã hết
// hạn + thiết bị nhà hàng; thiết bị doanh nghiệp (Kế toán / Báo cáo) KHÔNG
// chọn sẵn — cần cẩn thận hơn. Thiết bị đang hoạt động và mã còn hạn không
// bao giờ bị xoá (canister kiểm tra).

import type { Device } from "@/backend";
import { ROLE_LABELS } from "@/components/DeviceTable";
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
  useCleanupDeviceStore,
  useDeviceCleanupCounts,
} from "@/hooks/useQueries";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

type Key = "expiredCodes" | "restaurantDevices" | "enterpriseDevices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revokedRestaurantDevices: Device[];
  revokedEnterpriseDevices: Device[];
  restaurantNames: Map<string, string>;
}

export function DeviceCleanupDialog({
  open,
  onOpenChange,
  revokedRestaurantDevices,
  revokedEnterpriseDevices,
  restaurantNames,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-ocid="device.cleanup_dialog">
        {open && (
          <CleanupBody
            onClose={() => onOpenChange(false)}
            revokedRestaurantDevices={revokedRestaurantDevices}
            revokedEnterpriseDevices={revokedEnterpriseDevices}
            restaurantNames={restaurantNames}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CleanupBody({
  onClose,
  revokedRestaurantDevices,
  revokedEnterpriseDevices,
  restaurantNames,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const countsQuery = useDeviceCleanupCounts();
  const cleanup = useCleanupDeviceStore();
  const counts = countsQuery.data;
  const n = (k: Key) => Number(counts?.[k] ?? 0n);
  const [selected, setSelected] = useState<Record<Key, boolean>>({
    expiredCodes: true,
    restaurantDevices: true,
    enterpriseDevices: false,
  });
  const [expanded, setExpanded] = useState<Key | null>(null);
  const [result, setResult] = useState<Record<Key, number> | null>(null);
  const [error, setError] = useState("");

  const total = (
    ["expiredCodes", "restaurantDevices", "enterpriseDevices"] as Key[]
  )
    .filter((k) => selected[k])
    .reduce((s, k) => s + n(k), 0);

  async function run() {
    setError("");
    try {
      const r = await cleanup.mutateAsync(selected);
      setResult({
        expiredCodes: Number(r.expiredCodes),
        restaurantDevices: Number(r.restaurantDevices),
        enterpriseDevices: Number(r.enterpriseDevices),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không dọn dẹp được.");
    }
  }

  const rows: Array<{
    key: Key;
    title: string;
    hint: string;
    tag: "safe" | "warn";
    list?: Device[];
  }> = [
    {
      key: "expiredCodes",
      title: "Mã kích hoạt hết hạn / đã dùng",
      hint: "Từ nay tự dọn mỗi lần tạo mã mới",
      tag: "safe",
    },
    {
      key: "restaurantDevices",
      title: "Thiết bị đã thu hồi — cấp nhà hàng",
      hint: "Quản trị, Thu ngân, Tài xế",
      tag: "warn",
      list: revokedRestaurantDevices,
    },
    {
      key: "enterpriseDevices",
      title: "Thiết bị đã thu hồi — cấp doanh nghiệp",
      hint: "Kế toán, Báo cáo bán hàng & KM, Hàng đợi thanh toán",
      tag: "warn",
      list: revokedEnterpriseDevices,
    },
  ];

  if (result) {
    const parts = [
      result.expiredCodes && `${result.expiredCodes} mã hết hạn`,
      result.restaurantDevices &&
        `${result.restaurantDevices} thiết bị nhà hàng`,
      result.enterpriseDevices &&
        `${result.enterpriseDevices} thiết bị doanh nghiệp`,
    ].filter(Boolean);
    return (
      <>
        <DialogHeader>
          <DialogTitle>Đã dọn dẹp</DialogTitle>
        </DialogHeader>
        <p
          className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success"
          data-ocid="device.cleanup_result"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {parts.length > 0
            ? `Đã xoá ${parts.join(", ")}.`
            : "Không có gì cần xoá."}
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Xong
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Dọn dẹp bộ nhớ canister</DialogTitle>
        <DialogDescription>
          Chọn mục cần xoá. Thiết bị đang hoạt động và mã còn hạn không bao giờ
          bị xoá.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const checked = selected[row.key];
          return (
            <div
              key={row.key}
              className={`rounded-lg border px-3 py-2.5 ${checked ? "border-primary/50 bg-primary/5" : "border-border"}`}
              data-ocid={`device.cleanup_item.${row.key}`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={checked}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [row.key]: e.target.checked }))
                  }
                  data-ocid={`device.cleanup_check.${row.key}`}
                />
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {row.title}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] ${row.tag === "safe" ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}
                    >
                      {row.tag === "safe" ? "An toàn" : "Không hoàn tác"}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.hint}
                    {row.list && row.list.length > 0 && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="text-info hover:underline"
                          onClick={(e) => {
                            e.preventDefault();
                            setExpanded((x) =>
                              x === row.key ? null : row.key,
                            );
                          }}
                          data-ocid={`device.cleanup_preview.${row.key}`}
                        >
                          {expanded === row.key ? "Ẩn" : "Xem"}
                        </button>
                      </>
                    )}
                  </span>
                </span>
                <span
                  className="text-lg font-semibold"
                  data-ocid={`device.cleanup_count.${row.key}`}
                >
                  {countsQuery.isLoading ? "…" : n(row.key)}
                </span>
              </label>
              {expanded === row.key && row.list && (
                <ul className="ml-7 mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {row.list.map((d) => (
                    <li key={d.deviceId}>
                      {d.name || d.deviceId} · {ROLE_LABELS[d.role] ?? d.role}
                      {row.key === "restaurantDevices" &&
                        ` · ${restaurantNames.get(d.restaurantId) || d.restaurantId}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={total === 0 || cleanup.isPending}
          onClick={() => void run()}
          data-ocid="device.cleanup_submit"
        >
          {cleanup.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {total > 0 ? `Dọn dẹp ${total} mục` : "Chọn mục cần dọn"}
        </Button>
      </DialogFooter>
    </>
  );
}
