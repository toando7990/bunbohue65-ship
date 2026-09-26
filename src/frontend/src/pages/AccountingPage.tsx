// AccountingPage — trang /enterprise/accounting (vai trò Kế toán).
// 3 khả năng, số liệu TOÀN BỘ chuỗi nhà hàng (KHÔNG gắn theo 1 nhà hàng cụ
// thể — đã xác nhận: form tạo mã kích hoạt cho vai trò này không có bước
// chọn nhà hàng, xem components/EnterpriseActivationCodeForm.tsx):
//  1. Danh sách đơn theo khoảng ngày + trạng thái (Đã thanh toán/Đã huỷ) —
//     đọc từ VPS (routes/enterprise-history.js, KHÔNG phải canister — canister
//     chỉ giữ đơn trong ngày, không phù hợp cho khoảng ngày nhiều ngày).
//     Danh sách tự cập nhật khi đổi bộ lọc, không cần bấm nút tìm kiếm.
//  2. Xoá đơn đã huỷ, chưa từng thanh toán, từ hôm trước (VPS — thay cho
//     "Dọn dẹp" = huỷ đơn thủ công trước đây, đã bỏ theo yêu cầu).
//  3. PHÁT HÀNH hoá đơn Bkav — Kế toán tự bấm "Phát hành" (từng đơn hoặc
//     chọn nhiều đơn). Công tắc "Phát hành tự động" (InvoiceAutoToggle):
//     BẬT → đơn tạo sau lúc bật tự phát hành khi thanh toán + lưới an toàn
//     22:00 T2–T6; TẮT → không tự phát hành gì (VPS lib/invoice-settings.js).
//     Thêm MST khách (tuỳ chọn) → hoá đơn công ty.
// Tất cả gọi qua hook/API deviceId-scoped với deviceId của thiết bị kế toán
// (lưu trong localStorage theo mẫu bbh_*_activation). Admin gọi với deviceId
// rỗng vẫn hợp lệ (isAdmin short-circuits ở canister VÀ ở VPS route mới,
// qua callerHasEnterpriseRole).

import { InvoiceStatus, PaymentStatus } from "@/backend";
import { DeviceRole } from "@/backend";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { getDeviceId } from "@/components/EnterpriseActivationForm";
import {
  InvoiceAutoToggle,
  useInvoiceAuto,
} from "@/components/InvoiceAutoToggle";
import { TaxCodeCell } from "@/components/TaxCodeCell";
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
  enterpriseDeleteCancelledOrders,
  enterpriseDeleteOrder,
  enterpriseIssueInvoices,
  getEnterpriseHistory,
  getInvoice,
} from "@/lib/vps-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CalendarRange,
  Download,
  ExternalLink,
  Landmark,
  Loader2,
  MoreHorizontal,
  Play,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

// Lý do KHÔNG được xoá đơn (giống quy tắc VPS routes/enterprise-actions.js
// — VPS là nơi quyết định cuối cùng). null = được xoá.
function deleteBlockedReason(o: {
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  invoiceStatus: string;
  createdAt: number;
}): string | null {
  if (o.bookingStatus !== "cancelled") return "Chỉ xoá được đơn đã huỷ.";
  if (o.paymentStatus === "paid" || o.paymentMethod) {
    return "Đơn đã thanh toán — không thể xoá.";
  }
  if (o.invoiceStatus === "invoiced")
    return "Đơn đã có hoá đơn — không thể xoá.";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (o.createdAt >= todayStart.getTime()) {
    return "Chỉ xoá được đơn từ hôm trước trở về trước.";
  }
  return null;
}

// Đầu ngày làm việc (T2–T6) TRƯỚC hôm nay — cùng khung 1 ngày làm việc với
// cron phát hành bù ở VPS (startOfPreviousWorkingDayUtc7). Chưa tính ngày lễ.
function startOfPreviousWorkingDay(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

// Lý do KHÔNG phát hành được hoá đơn (giống quy tắc VPS routes/enterprise-
// actions.js — VPS quyết định cuối cùng). null = phát hành được.
function issueBlockedReason(o: {
  bookingStatus: string;
  paymentStatus: string;
  invoiceStatus: string;
  invoiceRequested?: boolean;
  hasBkavPdf?: boolean;
  createdAt: number;
}): string | null {
  if (o.bookingStatus === "cancelled") return "Đơn đã huỷ.";
  if (o.paymentStatus !== "paid") return "Đơn chưa thanh toán.";
  if (o.invoiceStatus === InvoiceStatus.invoiced) return "Đơn đã có hoá đơn.";
  if (o.invoiceStatus === InvoiceStatus.none && o.invoiceRequested) {
    return "Đơn đang được phát hành.";
  }
  if (o.invoiceStatus === InvoiceStatus.failed && o.hasBkavPdf) {
    return "Bkav đã có hoá đơn cho đơn này — đối chiếu và ghi nhận số hoá đơn thủ công.";
  }
  if (o.createdAt < startOfPreviousWorkingDay().getTime()) {
    return o.invoiceStatus === InvoiceStatus.failed
      ? "Quá 1 ngày làm việc kể từ khi tạo đơn — không phát hành lại tự động."
      : "Quá hạn phát hành (hết ngày làm việc tiếp theo sau ngày bán).";
  }
  return null;
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
  // Mặc định "Hôm nay" (theo yêu cầu) — trang dùng để theo dõi trực tiếp.
  const [fromDate, setFromDate] = useState(toInputDateValue(today));
  const [toDate, setToDate] = useState(toInputDateValue(today));
  // Trạng thái đơn hàng — chọn 1 trong 3 (giống 2 nhóm lọc còn lại).
  // Mặc định "Đã thanh toán" như trước.
  const [statusFilter, setStatusFilter] = useState<
    "all" | "paid" | "cancelled"
  >("paid");
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
  // Đang lấy đường dẫn PDF cho đơn nào (bấm "Xem PDF") — disable đúng 1 nút.
  const [livePaused, setLivePaused] = useState(false);
  // Hộp thoại xác nhận xoá — xoá là KHÔNG hoàn tác được.
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "one"; orderId: string; cusName: string }
    | { kind: "bulk"; count: number }
    | null
  >(null);
  const [openingPdfOrderId, setOpeningPdfOrderId] = useState<string | null>(
    null,
  );
  // Ô tìm kiếm: mã đơn, SĐT, tên khách, MST (lọc phía trình duyệt).
  const [search, setSearch] = useState("");
  // Menu "⋯" (Xuất CSV, Xoá đơn đã huỷ) + lỗi Bkav đang mở rộng.
  const [moreOpen, setMoreOpen] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const statuses: Array<"paid" | "cancelled"> =
    statusFilter === "all" ? ["paid", "cancelled"] : [statusFilter];

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
    // Tự làm mới mỗi 5 giây THEO ĐÚNG BỘ LỌC ĐANG CHỌN (queryKey chứa bộ lọc
    // ngày/trạng thái; các bộ lọc còn lại lọc phía client trên dữ liệu mới).
    // Dừng khi: nhân viên bấm Tạm dừng, đang mở hộp thoại xác nhận xoá, hoặc
    // tab bị ẩn (React Query mặc định không làm mới khi tab ẩn).
    refetchInterval: () => (livePaused || confirmDelete ? false : 5000),
  });

  // Dòng MỚI xuất hiện sau lần làm mới → tô sáng 2 giây. Lần tải đầu (hoặc
  // đổi bộ lọc) không tính là "mới".
  const seenIdsRef = useRef<{ key: string; ids: Set<string> } | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const filterKey = `${fromDate}|${toDate}|${statuses.join(",")}`;
  useEffect(() => {
    const orders = historyQuery.data?.orders;
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.orderId));
    const prev = seenIdsRef.current;
    seenIdsRef.current = { key: filterKey, ids };
    if (!prev || prev.key !== filterKey) return;
    const fresh = new Set([...ids].filter((id) => !prev.ids.has(id)));
    if (fresh.size === 0) return;
    setNewIds(fresh);
    const t = setTimeout(() => setNewIds(new Set()), 2500);
    return () => clearTimeout(t);
  }, [historyQuery.data, filterKey]);

  const results = historyQuery.data?.orders ?? [];
  // Lọc phía trình duyệt, 3 tầng (giao diện v5 đã duyệt):
  //  1. baseResults: nhà hàng + ô tìm kiếm → dùng cho ô "Doanh thu" (luôn
  //     hiện đủ cả Tiền mặt lẫn Chuyển khoản).
  //  2. scopedResults: + hình thức thanh toán → dùng cho các ô đếm đơn.
  //  3. filteredResults: + trạng thái hoá đơn (bấm ô số liệu) → bảng.
  const searchNorm = search.trim().toLowerCase().replace(/\s+/g, "");
  const baseResults = results.filter((o) => {
    if (filterRestaurantId !== "all" && o.restaurantId !== filterRestaurantId)
      return false;
    if (searchNorm) {
      const hay = [o.orderId, o.cusPhone, o.cusName, o.cusTaxCode, o.cusTaxName]
        .filter(Boolean)
        .join("|")
        .toLowerCase()
        .replace(/\s+/g, "");
      if (!hay.includes(searchNorm)) return false;
    }
    return true;
  });
  const scopedResults = baseResults.filter((o) =>
    matchesPaymentMethod(o, paymentMethodFilter),
  );
  const filteredResults = scopedResults.filter(
    (o) => invoiceFilter === "all" || o.invoiceStatus === invoiceFilter,
  );
  const paidOrders = baseResults.filter((o) => o.paymentStatus === "paid");
  const paidByMethod = (method: "cash" | "transfer") =>
    paidOrders
      .filter((o) => o.paymentMethod === method)
      .reduce((sum, o) => sum + o.amount, 0);
  const revenueTotal = paidOrders.reduce((sum, o) => sum + o.amount, 0);
  const countByMethod = (method: "cash" | "transfer") =>
    scopedResults.filter(
      (o) => o.paymentStatus === "paid" && o.paymentMethod === method,
    ).length;
  const notInvoicedCount = scopedResults.filter(
    (o) =>
      o.paymentStatus === "paid" &&
      o.bookingStatus !== "cancelled" &&
      o.invoiceStatus === InvoiceStatus.none &&
      !o.invoiceRequested, // đang phát hành thì không tính
  ).length;
  const failedCount = scopedResults.filter(
    (o) => o.invoiceStatus === InvoiceStatus.failed,
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
  const deleteMutation = useMutation({
    mutationFn: (orderId: string) => enterpriseDeleteOrder(deviceId, orderId),
  });
  // ---- Phát hành hoá đơn (Kế toán) ----
  // Đơn phát hành được trong danh sách đang lọc + đơn đang chọn (chỉ giữ
  // đơn còn phát hành được — danh sách tự làm mới mỗi 5 giây).
  const issuable = filteredResults.filter((o) => !issueBlockedReason(o));
  // Công tắc phát hành tự động: TẮT thì không còn lưới an toàn 22:00.
  const invoiceAutoOn = useInvoiceAuto(deviceId).data?.enabled === true;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedIssuable = issuable.filter((o) => selected.has(o.orderId));
  const selectedTotal = selectedIssuable.reduce((s, o) => s + o.amount, 0);
  const allIssuableSelected =
    issuable.length > 0 && selectedIssuable.length === issuable.length;
  function toggleSelected(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }
  const issueMutation = useMutation({
    mutationFn: (orderIds: string[]) =>
      enterpriseIssueInvoices(deviceId, orderIds),
  });
  async function handleIssue(orderIds: string[]) {
    if (orderIds.length === 0) return;
    try {
      const r = await issueMutation.mutateAsync(orderIds);
      if (r.queued.length > 0) {
        toast.success(
          `Đang phát hành ${r.queued.length} hoá đơn — thường xong trong khoảng 15 giây.`,
        );
      }
      for (const x of r.rejected) {
        toast.error(`Không phát hành được …${x.orderId.slice(-8)}`, {
          description: x.reason,
        });
      }
      setSelected(new Set());
      historyQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không phát hành được hoá đơn.",
      );
    }
  }
  const bulkDeleteMutation = useMutation({
    mutationFn: () => enterpriseDeleteCancelledOrders(deviceId, false),
  });

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === "one") {
        await deleteMutation.mutateAsync(confirmDelete.orderId);
        toast.success("Đã xoá đơn.");
      } else {
        const r = await bulkDeleteMutation.mutateAsync();
        toast.success(`Đã xoá ${r.deleted ?? 0} đơn đã huỷ.`);
      }
      historyQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xoá đơn.");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleOpenBulkDelete() {
    try {
      const r = await enterpriseDeleteCancelledOrders(deviceId, true);
      if (!r.count) {
        toast.info("Không có đơn đã huỷ nào đủ điều kiện để xoá.");
        return;
      }
      setConfirmDelete({ kind: "bulk", count: r.count });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không đếm được đơn cần xoá.",
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
      "MST khách",
      "Tên công ty (MST)",
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
        o.cusTaxCode ?? "",
        o.cusTaxName ?? "",
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

  // Ô số liệu bấm được (giao diện v5): bấm lại ô đang chọn = bỏ lọc.
  const kpiBase =
    "flex flex-col items-start rounded-lg border px-3.5 py-2.5 text-left transition-smooth";
  const kpiCls = (active: boolean) =>
    `${kpiBase} ${active ? "border-primary bg-primary/5" : "border-transparent bg-muted/60 hover:bg-muted"}`;
  const orderCountLabel =
    statusFilter === "paid"
      ? "Đơn đã thanh toán"
      : statusFilter === "cancelled"
        ? "Đơn đã huỷ"
        : "Tất cả đơn";
  const togglePayment = (method: "cash" | "transfer") =>
    setPaymentMethodFilter((cur) => (cur === method ? "all" : method));

  return (
    <section className="flex flex-col gap-4" data-ocid="accounting.page">
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

      {/* ---- Thanh công cụ 1 dòng: nhà hàng · khoảng ngày | làm mới ·
          tự phát hành · ⋯ ---- */}
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-ocid="accounting.filter_row_1"
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="restaurant-filter"
            aria-label="Nhà hàng"
            value={filterRestaurantId}
            onChange={(e) => setFilterRestaurantId(e.target.value)}
            data-ocid="accounting.restaurant_filter"
            className="h-9 min-w-[160px] rounded-md border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            <option value="all">Tất cả nhà hàng</option>
            {(restaurants ?? []).map((r) => (
              <option key={r.restaurantId} value={r.restaurantId}>
                {r.name}
              </option>
            ))}
          </select>
          <div
            className="flex flex-wrap gap-1.5"
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
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex h-9 items-center gap-1 rounded-md border border-input bg-card px-2">
            <CalendarRange
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="from-date"
              type="date"
              aria-label="Từ ngày"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-ocid="accounting.from_date_input"
              className="w-[118px] bg-transparent text-xs text-foreground outline-none"
            />
            <span className="text-muted-foreground">–</span>
            <input
              id="to-date"
              type="date"
              aria-label="Đến ngày"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-ocid="accounting.to_date_input"
              className="w-[118px] bg-transparent text-xs text-foreground outline-none"
            />
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLivePaused((v) => !v)}
            data-ocid="accounting.live_toggle"
            aria-pressed={livePaused}
            title={
              livePaused
                ? "Đã tạm dừng tự làm mới — bấm để tiếp tục"
                : "Tự làm mới mỗi 5 giây — bấm để tạm dừng"
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary"
          >
            {historyQuery.isFetching ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : livePaused ? (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {historyQuery.dataUpdatedAt > 0 && (
              <span data-ocid="accounting.last_updated">
                {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString(
                  "vi-VN",
                )}
              </span>
            )}
            {livePaused && <span>· đã tạm dừng</span>}
          </button>
          {deviceId && <InvoiceAutoToggle deviceId={deviceId} compact />}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Thêm thao tác"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            data-ocid="accounting.more_button"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
          {moreOpen && (
            <div
              className="absolute right-0 top-11 z-30 w-64 rounded-md border border-border bg-popover py-1 text-sm shadow-elevated"
              data-ocid="accounting.more_menu"
            >
              <button
                type="button"
                disabled={results.length === 0}
                onClick={() => {
                  setMoreOpen(false);
                  handleExportCsv();
                }}
                data-ocid="accounting.export_csv_button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Xuất CSV (theo bộ lọc)
              </button>
              <button
                type="button"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  setMoreOpen(false);
                  handleOpenBulkDelete();
                }}
                data-ocid="accounting.bulk_delete_button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-secondary"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Xoá tất cả đơn đã huỷ trước hôm nay
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---- 4 ô số liệu — bấm để lọc ---- */}
      <div
        className="grid grid-cols-3 gap-2 lg:grid-cols-[1fr_1fr_1fr_1.9fr]"
        data-ocid="accounting.summary"
      >
        <button
          type="button"
          onClick={() => setInvoiceFilter("all")}
          aria-pressed={invoiceFilter === "all"}
          data-ocid="accounting.invoice_filter.all"
          className={kpiCls(invoiceFilter === "all")}
        >
          <span className="text-xs text-muted-foreground">
            {orderCountLabel}
          </span>
          <span className="text-xl font-semibold">{scopedResults.length}</span>
          <span className="text-[11px] text-muted-foreground">
            Tiền mặt {countByMethod("cash")} · CK {countByMethod("transfer")}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            setInvoiceFilter((f) =>
              f === InvoiceStatus.none ? "all" : InvoiceStatus.none,
            )
          }
          aria-pressed={invoiceFilter === InvoiceStatus.none}
          data-ocid={`accounting.invoice_filter.${InvoiceStatus.none}`}
          className={kpiCls(invoiceFilter === InvoiceStatus.none)}
        >
          <span className="text-xs text-muted-foreground">Chưa phát hành</span>
          <span
            className={`text-xl font-semibold ${notInvoicedCount > 0 ? "text-warning" : ""}`}
            data-ocid="accounting.not_invoiced_count"
          >
            {notInvoicedCount}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {invoiceAutoOn
              ? "Còn sót: tự phát hành 22:00 ngày hạn chót"
              : "Hạn: hết ngày làm việc tiếp theo"}
          </span>
        </button>
        <button
          type="button"
          onClick={() =>
            setInvoiceFilter((f) =>
              f === InvoiceStatus.failed ? "all" : InvoiceStatus.failed,
            )
          }
          aria-pressed={invoiceFilter === InvoiceStatus.failed}
          data-ocid={`accounting.invoice_filter.${InvoiceStatus.failed}`}
          className={kpiCls(invoiceFilter === InvoiceStatus.failed)}
        >
          <span className="text-xs text-muted-foreground">Thất bại</span>
          <span
            className={`text-xl font-semibold ${failedCount > 0 ? "text-destructive" : ""}`}
            data-ocid="accounting.failed_count"
          >
            {failedCount}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Cần phát hành lại
          </span>
        </button>
        <div
          className="col-span-3 flex flex-col rounded-lg bg-muted/60 px-3.5 py-2.5 lg:col-span-1"
          data-ocid="accounting.revenue"
        >
          <span className="text-xs text-muted-foreground">Doanh thu</span>
          <span
            className="text-xl font-semibold"
            data-ocid="accounting.revenue_total"
          >
            {formatVnd(revenueTotal)}
          </span>
          <div
            className="mt-1.5 grid grid-cols-2 gap-1.5"
            data-ocid="accounting.method_split"
          >
            {(
              [
                ["cash", "Tiền mặt", Banknote],
                ["transfer", "Chuyển khoản", Landmark],
              ] as const
            ).map(([method, label, Icon]) => {
              const active = paymentMethodFilter === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => togglePayment(method)}
                  aria-pressed={active}
                  title={
                    active
                      ? "Bấm lại để bỏ lọc"
                      : `Chỉ xem đơn ${label.toLowerCase()}`
                  }
                  data-ocid={`accounting.payment_method_filter.${method}`}
                  className={`flex flex-col items-start rounded-md border bg-card px-2.5 py-1.5 text-left ${
                    active
                      ? "border-primary"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {label}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatVnd(paidByMethod(method))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Trạng thái đơn + tìm kiếm ---- */}
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        data-ocid="accounting.filter_row_2"
      >
        <fieldset
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Trạng thái đơn hàng"
        >
          {(
            [
              ["paid", "Đã thanh toán"],
              ["cancelled", "Đã huỷ"],
              ["all", "Tất cả"],
            ] as const
          ).map(([value, label]) => {
            const active = statusFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                aria-pressed={active}
                data-ocid={`accounting.status_chip.${value}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? "border-info bg-info/15 text-info"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            );
          })}
        </fieldset>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã đơn, SĐT, MST"
            aria-label="Tìm đơn"
            data-ocid="accounting.search_input"
            className="h-9 w-[220px] bg-card pl-8 text-sm"
          />
        </div>
      </div>

      {selectedIssuable.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info/10 px-3.5 py-2 text-sm text-info"
          data-ocid="accounting.bulk_issue_bar"
        >
          <span>
            Đã chọn <b>{selectedIssuable.length}</b> đơn ·{" "}
            {formatVnd(selectedTotal)}
          </span>
          <span className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              data-ocid="accounting.bulk_clear_button"
            >
              Bỏ chọn
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={issueMutation.isPending}
              onClick={() =>
                handleIssue(selectedIssuable.map((o) => o.orderId))
              }
              data-ocid="accounting.bulk_issue_button"
            >
              {issueMutation.isPending ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Phát hành đã chọn ({selectedIssuable.length})
            </Button>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4" data-ocid="accounting.lookup_card">
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
            className="overflow-x-auto rounded-lg border border-border bg-card"
            data-ocid="accounting.lookup_table"
          >
            <Table className="min-w-[860px] table-fixed">
              <colgroup>
                <col className="w-10" />
                <col className="w-[27%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col />
                <col className="w-[132px]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="ent-th">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      aria-label="Chọn tất cả đơn phát hành được"
                      checked={allIssuableSelected}
                      disabled={issuable.length === 0}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(issuable.map((o) => o.orderId))
                            : new Set(),
                        )
                      }
                      data-ocid="accounting.select_all_checkbox"
                    />
                  </TableHead>
                  <TableHead className="ent-th">Đơn</TableHead>
                  <TableHead className="ent-th">Khách hàng</TableHead>
                  <TableHead className="ent-th">Tổng tiền</TableHead>
                  <TableHead className="ent-th">Hoá đơn</TableHead>
                  <TableHead className="ent-th">
                    <span className="sr-only">Thao tác</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((order, idx) => {
                  const isCancelled = order.bookingStatus === "cancelled";
                  const blocked = issueBlockedReason(order);
                  const issuing =
                    order.invoiceStatus === InvoiceStatus.none &&
                    !!order.invoiceRequested;
                  const isSelected = !blocked && selected.has(order.orderId);
                  const errorOpen = expandedErrors.has(order.orderId);
                  const canIssue =
                    !isCancelled &&
                    order.paymentStatus === "paid" &&
                    (order.invoiceStatus === InvoiceStatus.failed ||
                      (order.invoiceStatus === InvoiceStatus.none && !issuing));
                  const isReissue =
                    order.invoiceStatus === InvoiceStatus.failed;
                  return (
                    <TableRow
                      key={order.orderId}
                      className={`ent-table-row transition-colors duration-1000 ${newIds.has(order.orderId) ? "bg-warning/15" : isSelected ? "bg-info/5" : ""}`}
                      data-ocid={`accounting.row.${idx + 1}`}
                      data-new={newIds.has(order.orderId) ? "true" : undefined}
                    >
                      <TableCell className="ent-td align-top">
                        {!blocked && (
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-primary"
                            aria-label={`Chọn đơn ${order.orderId}`}
                            checked={isSelected}
                            onChange={() => toggleSelected(order.orderId)}
                            data-ocid={`accounting.select_checkbox.${idx + 1}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="ent-td align-top">
                        <span className="flex items-start gap-1">
                          <span className="break-all font-mono text-xs font-semibold text-foreground">
                            {order.orderId}
                          </span>
                          <CopyOrderIdButton
                            orderId={order.orderId}
                            ocid={`accounting.copy_order_id.${idx + 1}`}
                          />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDateTime(order.createdAt)} ·{" "}
                          {restaurantNameById.get(order.restaurantId) ??
                            order.restaurantId}
                        </span>
                      </TableCell>
                      <TableCell className="ent-td align-top">
                        <span className="block text-sm font-medium text-foreground">
                          {order.cusName || "Khách vãng lai"}
                        </span>
                        {order.cusPhone && (
                          <span className="block text-xs text-muted-foreground">
                            {order.cusPhone}
                          </span>
                        )}
                        <div className="mt-0.5">
                          <TaxCodeCell
                            key={`${order.orderId}:${order.cusTaxCode ?? ""}`}
                            deviceId={deviceId}
                            orderId={order.orderId}
                            taxCode={order.cusTaxCode ?? ""}
                            taxName={order.cusTaxName ?? ""}
                            editable={
                              !isCancelled &&
                              order.invoiceStatus !== InvoiceStatus.invoiced &&
                              !issuing
                            }
                            onSaved={() => historyQuery.refetch()}
                            ocid={`accounting.tax_code.${idx + 1}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="ent-td align-top">
                        <span className="block font-mono text-sm font-semibold text-foreground">
                          {formatVnd(order.amount)}
                        </span>
                        {isCancelled ? (
                          <span
                            className="ent-pill badge-destructive mt-1"
                            data-ocid={`accounting.status_badge.${idx + 1}`}
                          >
                            Đã huỷ
                          </span>
                        ) : (
                          paymentMethodLabel(order.paymentMethod) && (
                            <span
                              className="block text-xs text-muted-foreground"
                              data-ocid={`accounting.payment_method.${idx + 1}`}
                            >
                              {paymentMethodLabel(order.paymentMethod)}
                            </span>
                          )
                        )}
                      </TableCell>
                      <TableCell className="ent-td align-top">
                        {issuing ? (
                          <span
                            className="ent-pill badge-warning inline-flex items-center gap-1"
                            data-ocid={`accounting.invoice_badge.${idx + 1}`}
                          >
                            <Loader2
                              className="h-3 w-3 animate-spin"
                              aria-hidden="true"
                            />
                            Đang phát hành…
                          </span>
                        ) : (
                          <span
                            className={`ent-pill ${invoiceBadgeClass(order.invoiceStatus)}`}
                            data-ocid={`accounting.invoice_badge.${idx + 1}`}
                          >
                            {INVOICE_LABELS[
                              order.invoiceStatus as InvoiceStatus
                            ] ?? order.invoiceStatus}
                          </span>
                        )}
                        {order.invoiceStatus === InvoiceStatus.invoiced &&
                          order.invoiceId && (
                            <span className="block text-xs text-muted-foreground">
                              Số {order.invoiceId}
                            </span>
                          )}
                        {/* Lý do THẬT Bkav từ chối — thu gọn 1 dòng, bấm
                            "Xem chi tiết" để mở đủ. */}
                        {order.invoiceStatus === InvoiceStatus.failed &&
                          order.invoiceError && (
                            <>
                              <span
                                className={`mt-1 block text-xs text-destructive ${errorOpen ? "whitespace-normal break-words" : "truncate"}`}
                                title={order.invoiceError}
                                data-ocid={`accounting.invoice_error.${idx + 1}`}
                              >
                                {order.invoiceError}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedErrors((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(order.orderId))
                                      next.delete(order.orderId);
                                    else next.add(order.orderId);
                                    return next;
                                  })
                                }
                                data-ocid={`accounting.invoice_error_toggle.${idx + 1}`}
                                className="text-xs font-medium text-info hover:underline"
                              >
                                {errorOpen ? "Thu gọn" : "Xem chi tiết"}
                              </button>
                            </>
                          )}
                      </TableCell>
                      <TableCell className="ent-td align-top">
                        <div className="flex justify-end">
                          {isCancelled &&
                            (() => {
                              const reason = deleteBlockedReason(order);
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    !!reason || deleteMutation.isPending
                                  }
                                  title={reason ?? "Xoá vĩnh viễn đơn này"}
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: "one",
                                      orderId: order.orderId,
                                      cusName:
                                        order.cusName || "Khách vãng lai",
                                    })
                                  }
                                  data-ocid={`accounting.delete_button.${idx + 1}`}
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Xoá
                                </Button>
                              );
                            })()}
                          {canIssue && (
                            <Button
                              type="button"
                              size="sm"
                              variant={isReissue ? "outline" : "default"}
                              disabled={!!blocked || issueMutation.isPending}
                              title={
                                blocked ?? "Phát hành hoá đơn Bkav cho đơn này"
                              }
                              onClick={() => handleIssue([order.orderId])}
                              data-ocid={
                                isReissue
                                  ? `accounting.reissue_button.${idx + 1}`
                                  : `accounting.issue_button.${idx + 1}`
                              }
                            >
                              {isReissue ? (
                                <RefreshCw
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Receipt
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {isReissue ? "Phát hành lại" : "Phát hành"}
                            </Button>
                          )}
                          {order.invoiceStatus === InvoiceStatus.invoiced && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={openingPdfOrderId === order.orderId}
                              onClick={() => handleViewPdf(order.orderId)}
                              data-ocid={`accounting.view_pdf_button.${idx + 1}`}
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
      </div>

      {/* Tuỳ chọn nâng cao — thu gọn (dùng cho đơn KHÔNG còn trong danh
          sách lọc hiện tại, ít dùng hơn thao tác trực tiếp từ bảng). */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="accounting.delete_confirm_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá vĩnh viễn?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "one"
                ? `Xoá đơn ${confirmDelete.orderId} (${confirmDelete.cusName}) khỏi máy chủ.`
                : `Xoá ${confirmDelete?.kind === "bulk" ? confirmDelete.count : 0} đơn đã huỷ, chưa từng thanh toán, từ hôm trước trở về trước.`}{" "}
              Thao tác này KHÔNG hoàn tác được. Hệ thống vẫn lưu nhật ký xoá (mã
              đơn, số tiền, khách, thời điểm).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="accounting.delete_cancel_button">
              Không xoá
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-ocid="accounting.delete_confirm_button"
            >
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
