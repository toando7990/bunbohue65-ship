// AccountingPage — trang /enterprise/accounting (vai trò Kế toán).
// 3 khả năng, số liệu TOÀN BỘ chuỗi nhà hàng (KHÔNG gắn theo 1 nhà hàng cụ
// thể — đã xác nhận: form tạo mã kích hoạt cho vai trò này không có bước
// chọn nhà hàng, xem components/EnterpriseActivationCodeForm.tsx):
//  1. Danh sách đơn theo khoảng ngày + trạng thái (Đã thanh toán/Đã huỷ) —
//     đọc từ VPS (routes/enterprise-history.js, KHÔNG phải canister — canister
//     chỉ giữ đơn trong ngày, không phù hợp cho khoảng ngày nhiều ngày).
//     Danh sách tự cập nhật khi đổi bộ lọc, không cần bấm nút tìm kiếm.
//  2. Dọn dẹp đơn thủ công (cleanupOrderByDevice) — không đổi.
//  3. Phát hành hoá đơn thủ công (issueInvoiceByDevice) — không đổi.
// Tất cả gọi qua hook/API deviceId-scoped với deviceId của thiết bị kế toán
// (lưu trong localStorage theo mẫu bbh_*_activation). Admin gọi với deviceId
// rỗng vẫn hợp lệ (isAdmin short-circuits ở canister VÀ ở VPS route mới,
// qua callerHasEnterpriseRole).

import { InvoiceStatus, PaymentStatus } from "@/backend";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCleanupOrderByDevice,
  useIssueInvoiceByDevice,
  useRestaurants,
} from "@/hooks/useQueries";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import { getEnterpriseHistory } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Loader2, Receipt, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Đọc deviceId của thiết bị kế toán đã kích hoạt từ khoá localStorage thống
// nhất bbh_enterprise_activation (xem lib/enterprise-activation.ts). Rỗng →
// admin gọi, canister/VPS tự cho qua (isAdmin short-circuits).
function readDeviceId(): string {
  return loadEnterpriseActivation()?.deviceId ?? "";
}

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

// dd/mm/yyyy — định dạng ngày cho <input type="date"> (yyyy-mm-dd) và cho
// API (dd/mm/yyyy) — 2 chiều chuyển đổi.
function toInputDateValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputDateToApiFormat(v: string): string {
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.none]: "Chưa phát hành",
  [InvoiceStatus.invoiced]: "Đã phát hành",
  [InvoiceStatus.failed]: "Thất bại",
};

function invoiceBadgeClass(status: string): string {
  switch (status) {
    case InvoiceStatus.invoiced:
      return "badge-success";
    case InvoiceStatus.failed:
      return "badge-destructive";
    default:
      return "badge-info";
  }
}

export function AccountingPage() {
  const deviceId = readDeviceId();
  const { data: restaurants } = useRestaurants();
  const restaurantNameById = new Map(
    (restaurants ?? []).map((r) => [r.restaurantId, r.name]),
  );

  // ---- Bộ lọc: khoảng ngày + trạng thái ----
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(toInputDateValue(sevenDaysAgo));
  const [toDate, setToDate] = useState(toInputDateValue(today));
  const [wantPaid, setWantPaid] = useState(true);
  const [wantCancelled, setWantCancelled] = useState(false);

  // ---- Hành động thủ công (không đổi) ----
  const [cleanupCode, setCleanupCode] = useState("");
  const [invoiceManualCode, setInvoiceManualCode] = useState("");
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const statuses: Array<"paid" | "cancelled"> = [
    ...(wantPaid ? (["paid"] as const) : []),
    ...(wantCancelled ? (["cancelled"] as const) : []),
  ];

  const historyQuery = useQuery({
    queryKey: [
      "enterpriseHistory",
      deviceId,
      fromDate,
      toDate,
      statuses.join(","),
    ],
    queryFn: () =>
      getEnterpriseHistory(
        deviceId,
        inputDateToApiFormat(fromDate),
        inputDateToApiFormat(toDate),
        statuses,
      ),
    enabled: statuses.length > 0,
  });

  const results = historyQuery.data?.orders ?? [];
  const isLoading = historyQuery.isLoading;
  const isError = historyQuery.isError;

  const cleanupMutation = useCleanupOrderByDevice(deviceId);
  const invoiceMutation = useIssueInvoiceByDevice(deviceId);

  async function handleCleanup(orderId: string) {
    try {
      await cleanupMutation.mutateAsync(orderId);
      toast.success("Đã dọn dẹp đơn.");
      historyQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể dọn dẹp đơn.",
      );
    }
  }

  async function handleCleanupByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!cleanupCode.trim()) {
      toast.error("Vui lòng nhập mã đơn.");
      return;
    }
    await handleCleanup(cleanupCode.trim());
  }

  async function handleIssueInvoice() {
    if (!invoiceOrderId) return;
    if (!invoiceId.trim() || !pdfUrl.trim()) {
      toast.error("Vui lòng nhập mã hoá đơn và đường dẫn PDF.");
      return;
    }
    try {
      await invoiceMutation.mutateAsync({
        orderId: invoiceOrderId,
        invoiceId: invoiceId.trim(),
        pdfUrl: pdfUrl.trim(),
      });
      toast.success("Đã phát hành hoá đơn.");
      setInvoiceOrderId(null);
      setInvoiceId("");
      setPdfUrl("");
      historyQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể phát hành hoá đơn.",
      );
    }
  }

  return (
    <section className="flex flex-col gap-6" data-ocid="accounting.page">
      <Card data-ocid="accounting.lookup_card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <CalendarRange
              className="h-4 w-4 text-primary"
              aria-hidden="true"
            />
            Danh sách đơn
          </CardTitle>
          <CardDescription>
            Lọc theo khoảng thời gian và trạng thái — danh sách tự cập nhật ngay
            khi đổi bộ lọc, không cần bấm nút tìm kiếm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="from-date"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Từ ngày
              </Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                data-ocid="accounting.from_date_input"
                className="w-[150px]"
              />
            </div>
            <span className="pb-2 text-muted-foreground">—</span>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="to-date"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Đến ngày
              </Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                data-ocid="accounting.to_date_input"
                className="w-[150px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trạng thái
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWantPaid((v) => !v)}
                  data-ocid="accounting.status_chip.paid"
                  className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                    wantPaid
                      ? "border-success bg-success/15 text-success"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Đã thanh toán
                </button>
                <button
                  type="button"
                  onClick={() => setWantCancelled((v) => !v)}
                  data-ocid="accounting.status_chip.cancelled"
                  className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                    wantCancelled
                      ? "border-destructive bg-destructive/15 text-destructive"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  Đã huỷ
                </button>
              </div>
            </div>
          </div>

          {historyQuery.data && (
            <div className="flex gap-2" data-ocid="accounting.summary">
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {historyQuery.data.count} đơn
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                Tổng {formatVnd(historyQuery.data.total)}
              </span>
            </div>
          )}

          {statuses.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center"
              data-ocid="accounting.no_status_state"
            >
              <p className="text-sm text-muted-foreground">
                Chọn ít nhất 1 trạng thái để xem danh sách.
              </p>
            </div>
          ) : isLoading ? (
            <div
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-sm text-muted-foreground"
              data-ocid="accounting.lookup.loading_state"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Đang tải đơn hàng…
            </div>
          ) : isError ? (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center"
              data-ocid="accounting.lookup.error_state"
              role="alert"
            >
              <p className="font-medium text-destructive">
                Không tải được đơn hàng.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Kiểm tra lại khoảng thời gian hoặc thử lại sau.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center"
              data-ocid="accounting.lookup.empty_state"
            >
              <Search
                className="h-10 w-10 text-muted-foreground"
                aria-hidden="true"
              />
              <h3 className="mt-3 font-display text-base font-semibold">
                Không có đơn nào khớp bộ lọc
              </h3>
            </div>
          ) : (
            <div
              className="overflow-x-auto"
              data-ocid="accounting.lookup_table"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ent-th">Mã đơn</TableHead>
                    <TableHead className="ent-th">Nhà hàng</TableHead>
                    <TableHead className="ent-th">Khách hàng</TableHead>
                    <TableHead className="ent-th">Tổng tiền</TableHead>
                    <TableHead className="ent-th">Trạng thái</TableHead>
                    <TableHead className="ent-th">Hoá đơn</TableHead>
                    <TableHead className="ent-th text-right">
                      Thao tác
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((order, idx) => {
                    const isCancelled = order.bookingStatus === "cancelled";
                    return (
                      <TableRow
                        key={order.orderId}
                        className="ent-table-row"
                        data-ocid={`accounting.row.${idx + 1}`}
                      >
                        <TableCell className="ent-td">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs font-semibold text-foreground">
                              {order.orderId}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(order.createdAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="ent-td">
                          <span className="text-xs text-muted-foreground">
                            {restaurantNameById.get(order.restaurantId) ??
                              order.restaurantId}
                          </span>
                        </TableCell>
                        <TableCell className="ent-td">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {order.cusName || "Khách vãng lai"}
                            </span>
                            {order.cusPhone && (
                              <span className="text-xs text-muted-foreground">
                                {order.cusPhone}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="ent-td">
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {formatVnd(order.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="ent-td">
                          <span
                            className={`ent-pill ${isCancelled ? "badge-destructive" : "badge-success"}`}
                            data-ocid={`accounting.status_badge.${idx + 1}`}
                          >
                            {isCancelled ? "Đã huỷ" : "Đã thanh toán"}
                          </span>
                        </TableCell>
                        <TableCell className="ent-td">
                          <span
                            className={`ent-pill ${invoiceBadgeClass(order.invoiceStatus)}`}
                            data-ocid={`accounting.invoice_badge.${idx + 1}`}
                          >
                            {INVOICE_LABELS[
                              order.invoiceStatus as InvoiceStatus
                            ] ?? order.invoiceStatus}
                          </span>
                        </TableCell>
                        <TableCell className="ent-td">
                          <div className="flex items-center justify-end gap-2">
                            {/* Ẩn nút "Dọn dẹp" cho đơn đã thanh toán (theo
                                yêu cầu đã duyệt) — chỉ hiện cho đơn đã huỷ. */}
                            {isCancelled && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={cleanupMutation.isPending}
                                onClick={() => handleCleanup(order.orderId)}
                                data-ocid={`accounting.cleanup_button.${idx + 1}`}
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Dọn dẹp
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={invoiceMutation.isPending}
                              onClick={() => {
                                setInvoiceOrderId(order.orderId);
                                setInvoiceId("");
                                setPdfUrl("");
                              }}
                              data-ocid={`accounting.invoice_button.${idx + 1}`}
                            >
                              <Receipt
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Hoá đơn
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dọn dẹp đơn thủ công + Phát hành hoá đơn thủ công */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card data-ocid="accounting.cleanup_card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Trash2 className="h-4 w-4 text-primary" aria-hidden="true" />
              Dọn dẹp đơn thủ công
            </CardTitle>
            <CardDescription>
              Huỷ/xoá một đơn hàng cũ hoặc hết hạn theo mã đơn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCleanupByCode}
              className="flex flex-col gap-3"
              data-ocid="accounting.cleanup_form"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="cleanup-code" className="text-sm font-medium">
                  Mã đơn
                </Label>
                <Input
                  id="cleanup-code"
                  value={cleanupCode}
                  onChange={(e) => setCleanupCode(e.target.value)}
                  placeholder="Nhập mã đơn cần dọn dẹp…"
                  data-ocid="accounting.cleanup_input"
                />
              </div>
              <Button
                type="submit"
                variant="destructive"
                disabled={cleanupMutation.isPending || !cleanupCode.trim()}
                data-ocid="accounting.cleanup_submit_button"
                className="w-full sm:w-auto"
              >
                {cleanupMutation.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Dọn dẹp đơn
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-ocid="accounting.invoice_card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
              Phát hành hoá đơn thủ công
            </CardTitle>
            <CardDescription>
              Phát hành hoá đơn điện tử cho một đơn hàng theo mã đơn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!invoiceManualCode.trim()) {
                  toast.error("Vui lòng nhập mã đơn.");
                  return;
                }
                setInvoiceOrderId(invoiceManualCode.trim());
                setInvoiceId("");
                setPdfUrl("");
              }}
              className="flex flex-col gap-3"
              data-ocid="accounting.invoice_form"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="invoice-code" className="text-sm font-medium">
                  Mã đơn
                </Label>
                <Input
                  id="invoice-code"
                  value={invoiceManualCode}
                  onChange={(e) => setInvoiceManualCode(e.target.value)}
                  placeholder="Nhập mã đơn cần phát hành hoá đơn…"
                  data-ocid="accounting.invoice_code_input"
                />
              </div>
              <Button
                type="submit"
                disabled={!invoiceManualCode.trim()}
                data-ocid="accounting.invoice_open_button"
                className="w-full sm:w-auto"
              >
                <Receipt className="h-4 w-4" aria-hidden="true" />
                Phát hành hoá đơn
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Dialog phát hành hoá đơn */}
      <Dialog
        open={!!invoiceOrderId}
        onOpenChange={(open) => {
          if (!open) setInvoiceOrderId(null);
        }}
      >
        <DialogContent data-ocid="accounting.invoice_dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
              Phát hành hoá đơn
            </DialogTitle>
            <DialogDescription>
              Nhập thông tin hoá đơn điện tử cho đơn{" "}
              <span className="font-mono font-semibold text-foreground">
                {invoiceOrderId}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invoice-id" className="text-sm font-medium">
                Mã hoá đơn
              </Label>
              <Input
                id="invoice-id"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder="VD: INV-2026-0001"
                data-ocid="accounting.invoice_id_input"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invoice-pdf" className="text-sm font-medium">
                Đường dẫn PDF hoá đơn
              </Label>
              <Input
                id="invoice-pdf"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://…/hoa-don.pdf"
                data-ocid="accounting.invoice_pdf_input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoiceOrderId(null)}
              data-ocid="accounting.invoice_cancel_button"
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={
                invoiceMutation.isPending || !invoiceId.trim() || !pdfUrl.trim()
              }
              onClick={handleIssueInvoice}
              data-ocid="accounting.invoice_submit_button"
            >
              {invoiceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Receipt className="h-4 w-4" aria-hidden="true" />
              )}
              Phát hành
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
