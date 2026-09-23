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
import { DeviceRole } from "@/backend";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { getDeviceId } from "@/components/EnterpriseActivationForm";
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
  useActivateDevice,
  useGenerateActivationCode,
  useRestaurants,
} from "@/hooks/useQueries";
import {
  loadEnterpriseActivation,
  saveEnterpriseActivation,
} from "@/lib/enterprise-activation";
import {
  PAYMENT_METHOD_FILTERS,
  type PaymentMethodFilter,
  matchesPaymentMethod,
  paymentMethodLabel,
} from "@/lib/payment-method";
import {
  enterpriseCleanupOrder,
  enterpriseRecordInvoice,
  getEnterpriseHistory,
  getInvoice,
} from "@/lib/vps-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarRange,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
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

// Bộ lọc nhanh "Hôm nay / Tuần này / Tháng này" — tuần bắt đầu từ Thứ Hai
// (cách tính tuần thông dụng ở Việt Nam), kết thúc luôn là hôm nay.
type QuickRange = "today" | "week" | "month";
function quickRangeDates(
  range: QuickRange,
  now = new Date(),
): {
  from: string;
  to: string;
} {
  const start = new Date(now);
  if (range === "week") {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - daysSinceMonday);
  } else if (range === "month") {
    start.setDate(1);
  }
  return { from: toInputDateValue(start), to: toInputDateValue(now) };
}
const QUICK_RANGES: Array<{ value: QuickRange; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
];

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
  // BUG THẬT đã sửa ("Missing deviceId"): admin (Internet Identity) vào
  // trang này KHÔNG có thiết bị Kế toán nào được gắn → deviceId rỗng. VPS
  // (routes/enterprise-history.js) xác thực bằng cách gọi canister
  // callerHasEnterpriseRole — nhưng canister thấy danh tính của VPS chứ
  // KHÔNG phải của admin, nên admin KHÔNG BAO GIỜ qua được, dù trang vẫn
  // mở (EnterpriseGate cho admin qua). Giải pháp an toàn, không cần sửa
  // canister: admin bấm 1 nút để tự gắn trình duyệt đang dùng làm thiết
  // bị Kế toán thật (tạo mã + kích hoạt bằng đúng API sẵn có) — từ đó có
  // deviceId hợp lệ, canister xác nhận đúng role như thiết bị thường.
  const [deviceId, setDeviceId] = useState(readDeviceId);
  const generateCodeMutation = useGenerateActivationCode();
  const activateMutation = useActivateDevice();
  const [binding, setBinding] = useState(false);
  async function handleBindAdminDevice() {
    setBinding(true);
    try {
      const pending = await generateCodeMutation.mutateAsync({
        restaurantId: "",
        role: DeviceRole.accounting,
      });
      const device = await activateMutation.mutateAsync({
        code: pending.code,
        deviceId: getDeviceId(),
        name: "Admin - Kế toán",
        phone: "",
      });
      saveEnterpriseActivation({
        restaurantId: device.restaurantId,
        deviceId: device.deviceId,
        name: "Admin - Kế toán",
      });
      setDeviceId(device.deviceId);
      toast.success("Đã gắn trình duyệt này làm thiết bị Kế toán.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không gắn được thiết bị.",
      );
    } finally {
      setBinding(false);
    }
  }
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
  // Lọc thêm PHÍA TRÌNH DUYỆT (không cần gọi lại API) — dữ liệu nhà hàng/
  // trạng thái hoá đơn đã có sẵn trong từng đơn trả về.
  const [filterRestaurantId, setFilterRestaurantId] = useState<string>("all");
  // Lọc theo hình thức thanh toán (Tiền mặt / Chuyển khoản) — chỉ áp dụng
  // cho đơn ĐÃ thanh toán; lọc phía client như invoiceFilter.
  const [paymentMethodFilter, setPaymentMethodFilter] =
    useState<PaymentMethodFilter>("all");
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | InvoiceStatus.none | InvoiceStatus.invoiced | InvoiceStatus.failed
  >("all");
  // "Tuỳ chọn nâng cao" — thu gọn 2 thao tác thủ công theo mã đơn (dùng cho
  // đơn KHÔNG còn trong danh sách lọc hiện tại, ít dùng) — mặc định đóng.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Đang lấy đường dẫn PDF cho đơn nào (bấm "Xem PDF") — disable đúng 1 nút.
  const [openingPdfOrderId, setOpeningPdfOrderId] = useState<string | null>(
    null,
  );

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
    enabled: statuses.length > 0 && !!deviceId,
  });

  const results = historyQuery.data?.orders ?? [];
  const filteredResults = results.filter((o) => {
    if (filterRestaurantId !== "all" && o.restaurantId !== filterRestaurantId)
      return false;
    if (invoiceFilter !== "all" && o.invoiceStatus !== invoiceFilter)
      return false;
    if (!matchesPaymentMethod(o, paymentMethodFilter)) return false;
    return true;
  });
  const notInvoicedCount = filteredResults.filter(
    (o) => o.invoiceStatus === InvoiceStatus.none,
  ).length;
  const isLoading = historyQuery.isLoading;
  const isError = historyQuery.isError;
  const errorMessage =
    historyQuery.error instanceof Error
      ? historyQuery.error.message
      : "Kiểm tra lại khoảng thời gian hoặc thử lại sau.";

  // Ghi qua VPS (không gọi thẳng canister nữa) — xem routes/enterprise-
  // actions.js: canister chỉ giữ đơn trong ngày nên đơn cũ báo "Order not
  // found", và danh sách (đọc từ VPS) không phản ánh thay đổi.
  const cleanupMutation = useMutation({
    mutationFn: (orderId: string) => enterpriseCleanupOrder(deviceId, orderId),
  });
  const invoiceMutation = useMutation({
    mutationFn: (args: {
      orderId: string;
      invoiceId: string;
      pdfUrl: string;
    }) =>
      enterpriseRecordInvoice(
        deviceId,
        args.orderId,
        args.invoiceId,
        args.pdfUrl,
      ),
  });

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

  // "Xem PDF" cho đơn ĐÃ phát hành — gọi API lúc bấm (không phải tải sẵn
  // cho cả danh sách, tránh gọi Bkav hàng loạt không cần thiết).
  async function handleViewPdf(orderId: string) {
    setOpeningPdfOrderId(orderId);
    try {
      const res = await getInvoice(orderId);
      if (!res.ok || !res.invoiceUrl) {
        throw new Error(res.error || "Không lấy được đường dẫn hoá đơn.");
      }
      window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không mở được hoá đơn.",
      );
    } finally {
      setOpeningPdfOrderId(null);
    }
  }

  // Xuất CSV danh sách đơn ĐANG LỌC (không phải toàn bộ dữ liệu gốc từ
  // API) — tự viết, không cần thêm thư viện cho nhu cầu đơn giản này.
  function handleExportCsv() {
    const header = [
      "Mã đơn",
      "Nhà hàng",
      "Khách hàng",
      "SĐT",
      "Tổng tiền",
      "Trạng thái đơn",
      "Trạng thái hoá đơn",
      "Hình thức thanh toán",
      "Thời gian",
    ];
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredResults.map((o) =>
      [
        o.orderId,
        restaurantNameById.get(o.restaurantId) ?? o.restaurantId,
        o.cusName || "Khách vãng lai",
        o.cusPhone,
        String(o.amount),
        o.bookingStatus === "cancelled" ? "Đã huỷ" : "Đã thanh toán",
        INVOICE_LABELS[o.invoiceStatus as InvoiceStatus] ?? o.invoiceStatus,
        paymentMethodLabel(o.paymentMethod),
        formatDateTime(o.createdAt),
      ]
        .map(escapeCsv)
        .join(","),
    );
    // \uFEFF (BOM) để Excel Windows nhận đúng UTF-8 (tránh lỗi hiển thị dấu
    // tiếng Việt) — vấn đề thường gặp khi mở CSV UTF-8 thuần bằng Excel.
    const csv = `\uFEFF${[header.map(escapeCsv).join(","), ...rows].join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ke-toan_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-6" data-ocid="accounting.page">
      {!deviceId && (
        <Card data-ocid="accounting.bind_admin_card">
          <CardHeader>
            <CardTitle>Trình duyệt này chưa gắn thiết bị Kế toán</CardTitle>
            <CardDescription>
              Bạn đang đăng nhập quản trị. Để xem đơn hàng (lưu trên máy chủ
              VPS), cần gắn trình duyệt này làm thiết bị Kế toán — chỉ làm 1
              lần.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleBindAdminDevice}
              disabled={binding}
              data-ocid="accounting.bind_admin_button"
            >
              {binding && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Gắn trình duyệt này làm thiết bị Kế toán
            </Button>
          </CardContent>
        </Card>
      )}
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
          <div
            className="flex flex-wrap gap-2"
            data-ocid="accounting.quick_ranges"
          >
            {QUICK_RANGES.map(({ value, label }) => {
              const r = quickRangeDates(value);
              const active = fromDate === r.from && toDate === r.to;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFromDate(r.from);
                    setToDate(r.to);
                  }}
                  data-ocid={`accounting.quick_range.${value}`}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary"
                      : "rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
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
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="restaurant-filter"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Nhà hàng
              </Label>
              <select
                id="restaurant-filter"
                value={filterRestaurantId}
                onChange={(e) => setFilterRestaurantId(e.target.value)}
                data-ocid="accounting.restaurant_filter"
                className="h-10 min-w-[170px] rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              >
                <option value="all">Tất cả nhà hàng</option>
                {(restaurants ?? []).map((r) => (
                  <option key={r.restaurantId} value={r.restaurantId}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trạng thái hoá đơn
              </span>
              <div className="flex gap-2">
                {(
                  [
                    ["all", "Tất cả"],
                    [InvoiceStatus.none, "Chưa phát hành"],
                    [InvoiceStatus.invoiced, "Đã phát hành"],
                    [InvoiceStatus.failed, "Thất bại"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setInvoiceFilter(value)}
                    data-ocid={`accounting.invoice_filter.${value}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                      invoiceFilter === value
                        ? "border-info bg-info/15 text-info"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Hình thức thanh toán
              </span>
              <div className="flex gap-2">
                {PAYMENT_METHOD_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethodFilter(value)}
                    aria-pressed={paymentMethodFilter === value}
                    data-ocid={`accounting.payment_method_filter.${value}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                      paymentMethodFilter === value
                        ? "border-info bg-info/15 text-info"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {historyQuery.data && (
            <div
              className="flex flex-wrap gap-2"
              data-ocid="accounting.summary"
            >
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {filteredResults.length} đơn
              </span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                Tổng{" "}
                {formatVnd(
                  filteredResults.reduce((sum, o) => sum + o.amount, 0),
                )}
              </span>
              {notInvoicedCount > 0 && (
                <span
                  className="rounded-full bg-destructive/12 px-3 py-1 text-xs font-semibold text-destructive"
                  data-ocid="accounting.not_invoiced_count"
                >
                  {notInvoicedCount} đơn chưa phát hành hoá đơn
                </span>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                data-ocid="accounting.export_csv_button"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Xuất CSV
              </Button>
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
              <p
                className="mt-1 text-sm text-muted-foreground"
                data-ocid="accounting.lookup.error_message"
              >
                {errorMessage}
              </p>
            </div>
          ) : filteredResults.length === 0 ? (
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
                  {filteredResults.map((order, idx) => {
                    const isCancelled = order.bookingStatus === "cancelled";
                    return (
                      <TableRow
                        key={order.orderId}
                        className="ent-table-row"
                        data-ocid={`accounting.row.${idx + 1}`}
                      >
                        <TableCell className="ent-td">
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {order.orderId}
                              </span>
                              <CopyOrderIdButton
                                orderId={order.orderId}
                                ocid={`accounting.copy_order_id.${idx + 1}`}
                              />
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
                          {!isCancelled &&
                            paymentMethodLabel(order.paymentMethod) && (
                              <span
                                className="mt-1 block text-xs text-muted-foreground"
                                data-ocid={`accounting.payment_method.${idx + 1}`}
                              >
                                {paymentMethodLabel(order.paymentMethod)}
                              </span>
                            )}
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
                            {order.invoiceStatus === InvoiceStatus.invoiced ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={openingPdfOrderId === order.orderId}
                                onClick={() => handleViewPdf(order.orderId)}
                                data-ocid={`accounting.view_pdf_button.${idx + 1}`}
                                className="text-info hover:text-info"
                              >
                                {openingPdfOrderId === order.orderId ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <ExternalLink
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                Xem PDF
                              </Button>
                            ) : (
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
                            )}
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

      {/* Tuỳ chọn nâng cao — thu gọn (dùng cho đơn KHÔNG còn trong danh
          sách lọc hiện tại, ít dùng hơn thao tác trực tiếp từ bảng). */}
      <Card data-ocid="accounting.advanced_card">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-ocid="accounting.advanced_toggle"
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            Tuỳ chọn nâng cao — dọn dẹp / phát hành theo mã đơn
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-smooth ${advancedOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {advancedOpen && (
          <div
            className="grid grid-cols-1 gap-6 border-t border-border px-6 pb-6 pt-4 lg:grid-cols-2"
            data-ocid="accounting.advanced_content"
          >
            <div data-ocid="accounting.cleanup_card">
              <CardTitle className="mb-1 flex items-center gap-2 font-display text-base">
                <Trash2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Dọn dẹp đơn thủ công
              </CardTitle>
              <CardDescription className="mb-3">
                Huỷ/xoá một đơn hàng cũ hoặc hết hạn theo mã đơn.
              </CardDescription>
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
            </div>

            <div data-ocid="accounting.invoice_card">
              <CardTitle className="mb-1 flex items-center gap-2 font-display text-base">
                <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
                Phát hành hoá đơn thủ công
              </CardTitle>
              <CardDescription className="mb-3">
                Phát hành hoá đơn điện tử cho một đơn hàng theo mã đơn.
              </CardDescription>
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
            </div>
          </div>
        )}
      </Card>

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
