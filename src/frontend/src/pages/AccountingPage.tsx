// AccountingPage — trang /enterprise/accounting (vai trò Kế toán).
// 3 khả năng trong phạm vi nhà hàng được gắn:
//  1. Tra cứu đơn hàng theo mã đơn / email / trạng thái, kèm ẢNH XÁC THỰC
//     THANH TOÁN (paymentVerificationImage) để kế toán đối chiếu.
//  2. Dọn dẹp đơn thủ công (cleanupOrderByDevice).
//  3. Phát hành hoá đơn thủ công (issueInvoiceByDevice).
// Tất cả gọi qua hook deviceId-scoped với deviceId của thiết bị kế toán
// (lưu trong localStorage theo mẫu bbh_*_activation). Admin gọi với deviceId
// rỗng vẫn hợp lệ (isAdmin short-circuits ở canister).

import { InvoiceStatus, type Order, PaymentStatus } from "@/backend";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCleanupOrderByDevice,
  useGetOrder,
  useIssueInvoiceByDevice,
  useOrders,
  useOrdersByEmail,
} from "@/hooks/useQueries";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import {
  ImageIcon,
  Loader2,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Đọc deviceId của thiết bị kế toán đã kích hoạt từ khoá localStorage thống
// nhất bbh_enterprise_activation (xem lib/enterprise-activation.ts). Rỗng →
// admin gọi, canister tự cho qua (isAdmin short-circuits).
function readDeviceId(): string {
  return loadEnterpriseActivation()?.deviceId ?? "";
}

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

function formatDateTime(ns: bigint): string {
  const ms = Number(ns) / 1_000_000;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.paid]: "Đã thanh toán",
  [PaymentStatus.unpaid]: "Chưa thanh toán",
  [PaymentStatus.expired]: "Hết hạn",
  [PaymentStatus.refunded]: "Đã hoàn tiền",
};

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.none]: "Chưa phát hành",
  [InvoiceStatus.invoiced]: "Đã phát hành",
  [InvoiceStatus.failed]: "Thất bại",
};

type SearchMode = "code" | "email" | "status";

const PAYMENT_OPTIONS: Array<{ value: PaymentStatus; label: string }> = [
  { value: PaymentStatus.paid, label: "Đã thanh toán" },
  { value: PaymentStatus.unpaid, label: "Chưa thanh toán" },
  { value: PaymentStatus.expired, label: "Hết hạn" },
  { value: PaymentStatus.refunded, label: "Đã hoàn tiền" },
];

function paymentBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.paid:
      return "badge-success";
    case PaymentStatus.unpaid:
      return "badge-warning";
    case PaymentStatus.expired:
      return "badge-destructive";
    default:
      return "badge-info";
  }
}

function invoiceBadgeClass(status: InvoiceStatus): string {
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

  // ---- Tra cứu đơn hàng ----
  const [mode, setMode] = useState<SearchMode>("code");
  const [codeInput, setCodeInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "">("");
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // ---- Hành động thủ công ----
  const [cleanupCode, setCleanupCode] = useState("");
  const [invoiceManualCode, setInvoiceManualCode] = useState("");
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [imageOrder, setImageOrder] = useState<Order | null>(null);

  const orderByCode = useGetOrder(submittedCode ?? undefined, deviceId);
  const ordersByEmail = useOrdersByEmail(submittedEmail, deviceId);
  const allOrders = useOrders(deviceId);

  const cleanupMutation = useCleanupOrderByDevice(deviceId);
  const invoiceMutation = useIssueInvoiceByDevice(deviceId);

  let results: Order[] = [];
  let isLoading = false;
  let isError = false;
  if (mode === "code") {
    isLoading = orderByCode.isLoading;
    isError = orderByCode.isError;
    if (orderByCode.data) results = [orderByCode.data];
  } else if (mode === "email") {
    isLoading = ordersByEmail.isLoading;
    isError = ordersByEmail.isError;
    results = ordersByEmail.data ?? [];
  } else {
    isLoading = allOrders.isLoading;
    isError = allOrders.isError;
    results = (allOrders.data ?? []).filter(
      (o) => !statusFilter || o.paymentStatus === statusFilter,
    );
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "code") {
      setSubmittedCode(codeInput.trim() || null);
      setSubmittedEmail(null);
    } else if (mode === "email") {
      setSubmittedEmail(emailInput.trim().toLowerCase() || null);
      setSubmittedCode(null);
    }
  }

  async function handleCleanup(orderId: string) {
    try {
      await cleanupMutation.mutateAsync(orderId);
      toast.success("Đã dọn dẹp đơn.");
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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể phát hành hoá đơn.",
      );
    }
  }

  return (
    <section className="flex flex-col gap-6" data-ocid="accounting.page">
      {/* Tra cứu đơn hàng */}
      <Card data-ocid="accounting.lookup_card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Search className="h-4 w-4 text-primary" aria-hidden="true" />
            Tra cứu đơn hàng
          </CardTitle>
          <CardDescription>
            Tìm đơn theo mã đơn, email khách hàng hoặc trạng thái thanh toán.
            Kết quả kèm ảnh xác thực thanh toán để đối chiếu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as SearchMode)}
            data-ocid="accounting.lookup_tabs"
          >
            <TabsList>
              <TabsTrigger value="code" data-ocid="accounting.tab.code">
                Mã đơn
              </TabsTrigger>
              <TabsTrigger value="email" data-ocid="accounting.tab.email">
                Email
              </TabsTrigger>
              <TabsTrigger value="status" data-ocid="accounting.tab.status">
                Trạng thái
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code">
              <form
                onSubmit={handleSearch}
                className="flex flex-col gap-3 sm:flex-row"
                data-ocid="accounting.code_form"
              >
                <Input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Nhập mã đơn…"
                  aria-label="Mã đơn cần tra cứu"
                  data-ocid="accounting.code_input"
                  className="sm:max-w-xs"
                />
                <Button
                  type="submit"
                  disabled={!codeInput.trim()}
                  data-ocid="accounting.code_search_button"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Tra cứu
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="email">
              <form
                onSubmit={handleSearch}
                className="flex flex-col gap-3 sm:flex-row"
                data-ocid="accounting.email_form"
              >
                <Input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Nhập email khách hàng…"
                  aria-label="Email khách hàng cần tra cứu"
                  data-ocid="accounting.email_input"
                  className="sm:max-w-xs"
                />
                <Button
                  type="submit"
                  disabled={!emailInput.trim()}
                  data-ocid="accounting.email_search_button"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  Tra cứu
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="status">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Select
                  value={statusFilter || "all"}
                  onValueChange={(v) =>
                    setStatusFilter(v === "all" ? "" : (v as PaymentStatus))
                  }
                >
                  <SelectTrigger
                    className="sm:max-w-xs"
                    data-ocid="accounting.status_select"
                  >
                    <SelectValue placeholder="Chọn trạng thái thanh toán" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  Hiển thị đơn theo trạng thái thanh toán đã chọn.
                </span>
              </div>
            </TabsContent>
          </Tabs>

          {/* Kết quả tra cứu */}
          {isLoading ? (
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
                Kiểm tra lại mã đơn hoặc thử lại sau.
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
                Chưa có kết quả
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Nhập mã đơn, email hoặc chọn trạng thái để tra cứu đơn hàng.
              </p>
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
                    <TableHead className="ent-th">Khách hàng</TableHead>
                    <TableHead className="ent-th">Tổng tiền</TableHead>
                    <TableHead className="ent-th">Thanh toán</TableHead>
                    <TableHead className="ent-th">Hoá đơn</TableHead>
                    <TableHead className="ent-th">Ảnh xác thực</TableHead>
                    <TableHead className="ent-th text-right">
                      Thao tác
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((order, idx) => (
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
                          className={`ent-pill ${paymentBadgeClass(order.paymentStatus)}`}
                          data-ocid={`accounting.payment_badge.${idx + 1}`}
                        >
                          {PAYMENT_LABELS[order.paymentStatus]}
                        </span>
                      </TableCell>
                      <TableCell className="ent-td">
                        <span
                          className={`ent-pill ${invoiceBadgeClass(order.invoiceStatus)}`}
                          data-ocid={`accounting.invoice_badge.${idx + 1}`}
                        >
                          {INVOICE_LABELS[order.invoiceStatus]}
                        </span>
                      </TableCell>
                      <TableCell className="ent-td">
                        {order.paymentVerificationImage ? (
                          <button
                            type="button"
                            onClick={() => setImageOrder(order)}
                            data-ocid={`accounting.image_button.${idx + 1}`}
                            aria-label={`Xem ảnh xác thực thanh toán đơn ${order.orderId}`}
                            className="group inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 transition-smooth hover:border-primary"
                          >
                            <img
                              src={order.paymentVerificationImage}
                              alt={`Ảnh xác thực thanh toán đơn ${order.orderId}`}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                            data-ocid={`accounting.no_image.${idx + 1}`}
                          >
                            <ImageIcon
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            Chưa có
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="ent-td">
                        <div className="flex items-center justify-end gap-2">
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
                  ))}
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

      {/* Dialog xem ảnh xác thực thanh toán */}
      <Dialog
        open={!!imageOrder}
        onOpenChange={(open) => {
          if (!open) setImageOrder(null);
        }}
      >
        <DialogContent data-ocid="accounting.image_dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <ShieldCheck
                className="h-4 w-4 text-primary"
                aria-hidden="true"
              />
              Ảnh xác thực thanh toán
            </DialogTitle>
            <DialogDescription>
              Đơn{" "}
              <span className="font-mono font-semibold text-foreground">
                {imageOrder?.orderId}
              </span>{" "}
              — {imageOrder ? PAYMENT_LABELS[imageOrder.paymentStatus] : ""}
            </DialogDescription>
          </DialogHeader>
          {imageOrder?.paymentVerificationImage ? (
            <img
              src={imageOrder.paymentVerificationImage}
              alt={`Ảnh xác thực thanh toán đơn ${imageOrder.orderId}`}
              className="mx-auto max-h-[60vh] w-auto rounded-md border border-border object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Đơn này chưa có ảnh xác thực thanh toán.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageOrder(null)}
              data-ocid="accounting.image_close_button"
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
