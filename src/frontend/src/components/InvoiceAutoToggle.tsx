// InvoiceAutoToggle — công tắc "Phát hành hoá đơn Bkav tự động" trên trang
// Kế toán (giao diện đã duyệt).
//  - BẬT: đơn TẠO SAU lúc bật được phát hành ngay khi thanh toán (~15 giây).
//    Đơn tạo trước lúc bật vẫn do Kế toán phát hành.
//  - TẮT: không có gì tự gửi Bkav — kể cả lưới an toàn 22:00.
// Bật/tắt đều hỏi xác nhận. Trạng thái lưu trên VPS (dùng chung mọi thiết bị).

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
import { Switch } from "@/components/ui/switch";
import {
  type InvoiceAutoSetting,
  enterpriseGetInvoiceAuto,
  enterpriseSetInvoiceAuto,
} from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const invoiceAutoQueryKey = (deviceId: string) => [
  "invoice-auto",
  deviceId,
];

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

export function useInvoiceAuto(deviceId: string) {
  return useQuery({
    queryKey: invoiceAutoQueryKey(deviceId),
    queryFn: () => enterpriseGetInvoiceAuto(deviceId),
    enabled: !!deviceId,
    refetchInterval: 30000,
  });
}

export function InvoiceAutoToggle({
  deviceId,
  compact = false,
}: {
  deviceId: string;
  // compact: 1 ô nhỏ "Tự phát hành [công tắc]" trên thanh công cụ trang Kế
  // toán (giao diện v5 đã duyệt) — mô tả chi tiết nằm trong tooltip.
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useInvoiceAuto(deviceId);
  const [pending, setPending] = useState<boolean | null>(null);

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      enterpriseSetInvoiceAuto(deviceId, enabled),
    onSuccess: (data: InvoiceAutoSetting) => {
      queryClient.setQueryData(invoiceAutoQueryKey(deviceId), data);
      toast.success(
        data.enabled
          ? "Đã bật phát hành hoá đơn tự động."
          : "Đã tắt phát hành hoá đơn tự động.",
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Không đổi được cài đặt.",
      );
    },
  });

  const setting = query.data;
  const on = setting?.enabled === true;
  const description = on
    ? "Đơn tạo sau lúc bật được phát hành ngay khi thanh toán (khoảng 15 giây), Kế toán không cần bấm. Đơn tạo trước lúc bật vẫn phát hành bằng tay."
    : 'Kế toán tự chọn đơn và bấm "Phát hành". Không đơn nào tự phát hành, kể cả lúc 22:00 ngày hạn chót.';
  const changed = setting?.updatedAt
    ? `${on ? "Bật" : "Tắt"} lúc ${formatTime(setting.updatedAt)}${setting.updatedBy ? ` — thiết bị ${setting.updatedBy}` : ""}`
    : "";

  const confirmDialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(o) => !o && setPending(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending ? "Bật phát hành tự động?" : "Tắt phát hành tự động?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? "Từ giờ, đơn tạo sau lúc bật sẽ được gửi Bkav ngay khi thanh toán. Các đơn đang chờ vẫn do Kế toán phát hành."
              : 'Sau khi tắt, không đơn nào tự phát hành — kể cả lúc 22:00 ngày hạn chót. Kế toán phải tự bấm "Phát hành" trước hạn.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-ocid="accounting.invoice_auto.cancel_button">
            Huỷ
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pending !== null) mutation.mutate(pending);
              setPending(null);
            }}
            data-ocid="accounting.invoice_auto.confirm_button"
          >
            {pending ? "Bật" : "Tắt"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (compact) {
    return (
      <div
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground"
        title={
          query.isError
            ? "Không tải được trạng thái công tắc."
            : `${description}${changed ? `\n${changed}` : ""}`
        }
        data-ocid="accounting.invoice_auto"
      >
        <span>Tự phát hành</span>
        <Switch
          checked={on}
          disabled={!setting || mutation.isPending}
          onCheckedChange={(v) => setPending(v)}
          aria-label="Phát hành hoá đơn Bkav tự động"
          className="data-[state=checked]:bg-success"
          data-ocid="accounting.invoice_auto.switch"
        />
        <span className="sr-only" data-ocid="accounting.invoice_auto.state">
          {setting ? (on ? "Đang bật" : "Đang tắt") : ""}
        </span>
        {(query.isLoading || mutation.isPending) && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
        {confirmDialog}
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
      data-ocid="accounting.invoice_auto"
    >
      <Switch
        checked={on}
        disabled={!setting || mutation.isPending}
        onCheckedChange={(v) => setPending(v)}
        aria-label="Phát hành hoá đơn Bkav tự động"
        className="mt-0.5 data-[state=checked]:bg-success"
        data-ocid="accounting.invoice_auto.switch"
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Phát hành hoá đơn Bkav tự động</span>
          {setting && (
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                on
                  ? "bg-success/15 text-success"
                  : "bg-secondary text-muted-foreground"
              }`}
              data-ocid="accounting.invoice_auto.state"
            >
              {on ? "Đang bật" : "Đang tắt"}
            </span>
          )}
          {(query.isLoading || mutation.isPending) && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        {query.isError ? (
          <p className="mt-1 text-xs text-destructive">
            Không tải được trạng thái công tắc.
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
        {setting?.updatedAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {on ? "Bật" : "Tắt"} lúc {formatTime(setting.updatedAt)}
            {setting.updatedBy ? ` — thiết bị ${setting.updatedBy}` : ""}
          </p>
        ) : null}
      </div>

      {confirmDialog}
    </div>
  );
}
