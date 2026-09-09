// PaymentQueuePage — Mô-đun doanh nghiệp "Hàng đợi thanh toán".
// Hiển thị danh sách đơn chờ thanh toán của nhà hàng được gắn (qua mã kích
// hoạt) và cho phép xác nhận/đánh dấu trạng thái thanh toán của từng đơn.
// Component này là phần thân trang, được bọc bởi EnterpriseGate (requiredRole
// paymentQueue) trong App.tsx — gate đã cung cấp nền bbh-enterprise-theme.

import { type Order, PaymentStatus } from "@/backend";
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
  useConfirmPaymentByDevice,
  useListPendingPaymentOrders,
} from "@/hooks/useQueries";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import {
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Format VND từ bigint (amount tính bằng đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Format thời gian từ bigint nanoseconds → HH:mm.
function formatTime(ns: bigint): string {
  const ms = Number(ns) / 1_000_000;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

// Đơn chưa thanh toán (unpaid) hoặc QR hết hạn chưa thanh toán (expired) —
// canister đã lọc, đây chỉ là phòng thủ.
function isPending(o: Order): boolean {
  return (
    o.paymentStatus === PaymentStatus.unpaid ||
    o.paymentStatus === PaymentStatus.expired
  );
}

export function PaymentQueuePage() {
  const stored = loadEnterpriseActivation();
  const restaurantId = stored?.restaurantId;
  const deviceId = stored?.deviceId;

  const [searchQuery, setSearchQuery] = useState("");
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);

  // Poll 5s để hàng đợi tự cập nhật khi đơn mới xuất hiện / đã thanh toán.
  const ordersQuery = useListPendingPaymentOrders(restaurantId, deviceId, 5000);
  const confirmMutation = useConfirmPaymentByDevice(deviceId);

  const orders = (ordersQuery.data ?? []).filter((o) => isPending(o));
  const filtered = orders.filter(
    (o) =>
      !searchQuery.trim() ||
      o.cusName.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      o.cusPhone.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      o.orderId.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );
  const totalPendingAmount = filtered.reduce((sum, o) => sum + o.amount, 0n);

  // Chưa có thiết bị doanh nghiệp được kích hoạt trên trình duyệt này.
  if (!restaurantId || !deviceId) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center"
        data-ocid="payment_queue.no_device_state"
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <ShoppingBag className="h-7 w-7" />
        </div>
        <h2 className="font-display text-lg font-semibold">
          Chưa kích hoạt thiết bị
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Thiết bị này chưa được gắn vai trò "Hàng đợi thanh toán". Vui lòng
          kích hoạt thiết bị bằng mã kích hoạt do quản trị viên cấp.
        </p>
      </div>
    );
  }

  async function handleConfirm(order: Order) {
    try {
      await confirmMutation.mutateAsync(order.orderId);
      toast.success(
        `Đã xác nhận thanh toán đơn ${order.cusName || order.orderId}`,
      );
      setConfirmOrder(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể xác nhận thanh toán.";
      toast.error(message);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-ocid="payment_queue.page">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="payment_queue.title"
        >
          Hàng đợi thanh toán
        </h1>
        <p className="text-sm text-muted-foreground">
          Danh sách đơn chờ thanh toán của nhà hàng được gắn. Xác nhận thanh
          toán khi khách đã chuyển khoản.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="ent-kpi" data-ocid="payment_queue.kpi_count">
          <p className="ent-kpi-label">Đơn chờ thanh toán</p>
          <p className="ent-kpi-value">{filtered.length}</p>
        </div>
        <div className="ent-kpi" data-ocid="payment_queue.kpi_amount">
          <p className="ent-kpi-label">Tổng tiền chờ xác nhận</p>
          <p className="ent-kpi-value text-primary">
            {formatVnd(totalPendingAmount)}
          </p>
        </div>
        <div className="ent-kpi" data-ocid="payment_queue.kpi_device">
          <p className="ent-kpi-label">Thiết bị</p>
          <p className="truncate font-mono text-sm font-semibold text-foreground">
            {stored.name || deviceId}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ent-toolbar" data-ocid="payment_queue.toolbar">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, SĐT hoặc mã đơn…"
            data-ocid="payment_queue.search_input"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <span className="ent-pill badge-info" data-ocid="payment_queue.count">
          {filtered.length} đơn
        </span>
      </div>

      {/* Error */}
      {ordersQuery.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-ocid="payment_queue.error_state"
        >
          Không tải được danh sách đơn. Đang thử lại tự động mỗi 5 giây…
        </div>
      )}

      {/* Loading */}
      {ordersQuery.isLoading && filtered.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
          data-ocid="payment_queue.loading_state"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Đang tải đơn chờ…</p>
        </div>
      )}

      {/* Empty */}
      {!ordersQuery.isLoading &&
        filtered.length === 0 &&
        !ordersQuery.isError && (
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center"
            data-ocid="payment_queue.empty_state"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-hidden="true"
            >
              {searchQuery.trim() ? (
                <Search className="h-7 w-7" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )}
            </div>
            <h2 className="font-display text-lg font-semibold">
              {searchQuery.trim()
                ? `Không tìm thấy đơn khớp "${searchQuery.trim()}"`
                : "Không có đơn chờ thanh toán"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {searchQuery.trim()
                ? "Thử tìm theo tên, SĐT hoặc mã đơn khác."
                : "Hàng đợi trống. Đơn mới sẽ xuất hiện tự động mỗi 5 giây."}
            </p>
          </div>
        )}

      {/* Table */}
      {filtered.length > 0 && (
        <div
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          data-ocid="payment_queue.table"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="ent-th">Khách hàng</th>
                  <th className="ent-th">Mã đơn</th>
                  <th className="ent-th">Thời gian</th>
                  <th className="ent-th text-right">Tổng tiền</th>
                  <th className="ent-th text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, idx) => (
                  <tr
                    key={order.orderId}
                    className="ent-table-row"
                    data-ocid={`payment_queue.row.${idx + 1}`}
                  >
                    <td className="ent-td">
                      <p className="font-medium text-foreground">
                        {order.cusName || "Khách vãng lai"}
                      </p>
                      {order.cusPhone && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {order.cusPhone}
                        </p>
                      )}
                    </td>
                    <td className="ent-td">
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.orderId}
                      </span>
                    </td>
                    <td className="ent-td">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatTime(order.createdAt)}
                      </span>
                    </td>
                    <td className="ent-td text-right">
                      <span className="font-display text-base font-bold text-primary">
                        {formatVnd(order.amount - order.shippingFee)}
                      </span>
                    </td>
                    <td className="ent-td text-right">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setConfirmOrder(order)}
                        disabled={confirmMutation.isPending}
                        data-ocid={`payment_queue.confirm_button.${idx + 1}`}
                        className="inline-flex min-h-[36px] items-center gap-1.5"
                      >
                        <Banknote className="h-4 w-4" aria-hidden="true" />
                        Xác nhận thanh toán
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog
        open={!!confirmOrder}
        onOpenChange={(open) => {
          if (!open) setConfirmOrder(null);
        }}
      >
        <DialogContent data-ocid="payment_queue.confirm_dialog">
          <DialogHeader>
            <DialogTitle className="font-display">
              Xác nhận thanh toán
            </DialogTitle>
            <DialogDescription>
              Xác nhận đơn hàng này đã được thanh toán? Thao tác này sẽ đánh dấu
              trạng thái thanh toán của đơn là đã thanh toán.
            </DialogDescription>
          </DialogHeader>
          {confirmOrder && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Khách hàng</span>
                <span className="font-medium text-foreground">
                  {confirmOrder.cusName || "Khách vãng lai"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Mã đơn</span>
                <span className="font-mono text-xs text-foreground">
                  {confirmOrder.orderId}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Số tiền</span>
                <span className="font-display text-base font-bold text-primary">
                  {formatVnd(confirmOrder.amount - confirmOrder.shippingFee)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOrder(null)}
              disabled={confirmMutation.isPending}
              data-ocid="payment_queue.cancel_button"
            >
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => confirmOrder && handleConfirm(confirmOrder)}
              disabled={confirmMutation.isPending || !confirmOrder}
              data-ocid="payment_queue.confirm_submit_button"
            >
              {confirmMutation.isPending ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Đang xác nhận…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Xác nhận đã thanh toán
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
