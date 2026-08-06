// DriverPaymentScreen — Trang thanh toán cho tài xế (mobile-first).
// Bước 1: Kích hoạt thiết bị (nhập mã 6 ký tự, 15 phút) → activateDevice.
// Bước 2: Poll listPendingPaymentOrders(restaurantId) 5s → hàng đợi FIFO.
// Bước 3: Bấm [Thanh toán] → QR full screen → poll getOrderStatus 5s → tự ẩn khi #paid.

import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { PaymentQueue } from "@/components/PaymentQueue";
import { QRDisplay } from "@/components/QRDisplay";
import { usePendingOrders } from "@/hooks/usePendingOrders";
import { LogOut, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function DriverPaymentScreen() {
  // Trạng thái kích hoạt: restaurantId + deviceId sau khi activateDevice thành công.
  // Lưu trong React state (UI state), không phải backend-owned data.
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const ordersQuery = usePendingOrders(restaurantId ?? undefined);

  function handleActivated(restId: string, devId: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    toast.success("Thiết bị đã sẵn sàng nhận đơn thanh toán");
  }

  function handlePay(order: Order) {
    setActiveOrder(order);
  }

  function handleCloseQr() {
    setActiveOrder(null);
  }

  function handlePaid(order: Order) {
    setActiveOrder(null);
    toast.success(`Đã thanh toán đơn ${order.cusName || order.orderId}`);
    // Invalidate để queue refresh ngay (usePendingOrders poll 5s sẽ tự cập nhật).
    void ordersQuery.refetch();
  }

  function handleLogout() {
    setRestaurantId(null);
    setDeviceId(null);
    setActiveOrder(null);
    toast.info("Đã đăng xuất thiết bị");
  }

  // Bước 1: chưa kích hoạt.
  if (!restaurantId || !deviceId) {
    return <ActivationForm onActivated={handleActivated} />;
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      data-ocid="driver.page"
    >
      {/* Device status bar */}
      <div
        className="border-b border-border bg-card px-4 py-3 md:px-6"
        data-ocid="driver.status_bar"
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
              aria-hidden="true"
            >
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                Thiết bị đã kích hoạt
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {deviceId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            data-ocid="driver.logout_button"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Đăng xuất thiết bị</span>
            <span className="sm:hidden">Thoát</span>
          </button>
        </div>
      </div>

      {/* Bước 2: hàng đợi thanh toán */}
      <PaymentQueue
        orders={ordersQuery.data ?? []}
        isLoading={ordersQuery.isLoading}
        isError={ordersQuery.isError}
        onPay={handlePay}
        payingOrderId={activeOrder?.orderId ?? null}
      />

      {/* Bước 3: QR full screen overlay */}
      {activeOrder && (
        <QRDisplay
          order={activeOrder}
          onClose={handleCloseQr}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}
