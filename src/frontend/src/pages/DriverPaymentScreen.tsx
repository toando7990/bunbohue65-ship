// DriverPaymentScreen — Trang thanh toán cho tài xế (mobile-first).
// Bước 1: Kích hoạt thiết bị (nhập mã 6 ký tự, 15 phút) → activateDevice.
// Bước 2: Poll listPendingPaymentOrders(restaurantId) 5s → hàng đợi FIFO.
// Bước 3: Bấm [Thanh toán] → QR full screen → poll getOrderStatus 5s → tự ẩn khi #paid.

import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { PaymentQueue } from "@/components/PaymentQueue";
import { PickupQueue } from "@/components/PickupQueue";
import { QRDisplay } from "@/components/QRDisplay";
import { usePaidOrdersForPickup } from "@/hooks/usePendingOrders";
import { usePendingOrders } from "@/hooks/usePendingOrders";
import { Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DRIVER_STORAGE_KEY = "bbh_driver_activation";
type DriverTab = "payment" | "pickup";

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
} | null {
  try {
    const raw = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.restaurantId && parsed?.deviceId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function DriverPaymentScreen() {
  // Trạng thái kích hoạt: restaurantId + deviceId sau khi activateDevice thành công.
  // Lưu thêm vào localStorage để thiết bị nhớ trạng thái qua các lần tải lại trang/
  // tắt mở app — tài xế không phải kích hoạt lại mỗi lần.
  const stored = loadStoredActivation();
  const [restaurantId, setRestaurantId] = useState<string | null>(
    stored?.restaurantId ?? null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    stored?.deviceId ?? null,
  );
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  // Tab active sau kích hoạt: "payment" (Thanh toán, mặc định) | "pickup" (Hàng đợi nhận hàng).
  const [activeTab, setActiveTab] = useState<DriverTab>("payment");

  const ordersQuery = usePendingOrders(restaurantId ?? undefined);
  // Pickup query chỉ poll khi tab pickup đang active — tiết kiệm cycle.
  const pickupQuery = usePaidOrdersForPickup(activeTab === "pickup");

  function handleActivated(restId: string, devId: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    try {
      localStorage.setItem(
        DRIVER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId }),
      );
    } catch {
      // localStorage không khả dụng (chế độ ẩn danh...) — vẫn hoạt động bình thường
      // trong phiên hiện tại, chỉ là không nhớ được qua lần tải lại sau.
    }
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
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
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
        </div>
      </div>

      {/* Bước 2: tab Thanh toán (mặc định) / Hàng đợi nhận hàng */}
      <nav
        className="border-b border-border bg-card"
        data-ocid="driver.tabs"
        aria-label="Chức năng tài xế"
      >
        <div className="mx-auto flex w-full max-w-2xl">
          <button
            type="button"
            onClick={() => setActiveTab("payment")}
            data-ocid="driver.tab.payment"
            aria-selected={activeTab === "payment"}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              activeTab === "payment"
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Thanh toán
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pickup")}
            data-ocid="driver.tab.pickup"
            aria-selected={activeTab === "pickup"}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              activeTab === "pickup"
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Hàng đợi tài xế nhận hàng
          </button>
        </div>
      </nav>

      <div className="flex-1">
        {activeTab === "payment" ? (
          <PaymentQueue
            orders={ordersQuery.data ?? []}
            isLoading={ordersQuery.isLoading}
            isError={ordersQuery.isError}
            onPay={handlePay}
            payingOrderId={activeOrder?.orderId ?? null}
          />
        ) : (
          <PickupQueue
            orders={pickupQuery.data ?? []}
            isLoading={pickupQuery.isLoading}
            isError={pickupQuery.isError}
          />
        )}
      </div>

      {/* Bước 3: QR full screen overlay — ngoài tab switch để hoạt động mọi lúc */}
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
