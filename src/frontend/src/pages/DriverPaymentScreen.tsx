// DriverPaymentScreen — Trang thanh toán cho tài xế (mobile-first).
// Bước 1: Kích hoạt thiết bị (nhập mã 6 ký tự, 15 phút) → activateDevice.
// Bước 2: Poll listPendingPaymentOrders(restaurantId) 5s → hàng đợi FIFO.
// Bước 3: Bấm [Thanh toán] → QR full screen → poll getOrderStatus 5s → tự ẩn khi #paid.

import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { DriverOrderHistory } from "@/components/DriverOrderHistory";
import { PaymentQueue } from "@/components/PaymentQueue";
import { QRDisplay } from "@/components/QRDisplay";
import { usePendingOrders } from "@/hooks/usePendingOrders";
import { useDevicesByRestaurant, useRestaurants } from "@/hooks/useQueries";
import type { RestaurantHistoryPeriod } from "@/types";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ListOrdered,
  MapPin,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DRIVER_STORAGE_KEY = "bbh_driver_activation";

type DriverTab = "queue" | RestaurantHistoryPeriod;

const NAV_ITEMS: { tab: DriverTab; label: string; icon: typeof ListOrdered }[] =
  [
    { tab: "queue", label: "Hàng đợi", icon: ListOrdered },
    { tab: "today", label: "Hôm nay", icon: CalendarDays },
    { tab: "week", label: "Tuần này", icon: CalendarRange },
    { tab: "month", label: "Tháng này", icon: Calendar },
  ];

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
  name: string;
} | null {
  try {
    const raw = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.restaurantId && parsed?.deviceId) {
      return { ...parsed, name: parsed.name ?? "" };
    }
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
  const [deviceName, setDeviceName] = useState<string>(stored?.name ?? "");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<DriverTab>("queue");

  const ordersQuery = usePendingOrders(restaurantId ?? undefined);
  const { data: restaurants } = useRestaurants();
  const restaurant = restaurants?.find((r) => r.restaurantId === restaurantId);

  // Việc 9/9: kiểm tra định kỳ (15s) xem thiết bị này có bị admin "Thu
  // hồi" (active=false) hay không — trước đây thiết bị đã kích hoạt hoạt
  // động MÃI MÃI dựa hoàn toàn vào localStorage, KHÔNG BAO GIỜ tự biết đã
  // bị thu hồi (không nơi nào re-check active sau lúc kích hoạt). Phát
  // hiện đúng thiết bị (active=false) → tự đăng xuất về màn hình nhập mã
  // kích hoạt lại. CHỈ đăng xuất khi TÌM THẤY RÕ RÀNG record active=false
  // — không tự đăng xuất nếu danh sách rỗng/chưa tải xong (tránh false
  // positive do lỗi mạng tạm thời).
  const { data: devicesForActiveCheck } = useDevicesByRestaurant(
    restaurantId ?? undefined,
    15000,
  );
  useEffect(() => {
    if (!deviceId || !devicesForActiveCheck) return;
    const thisDevice = devicesForActiveCheck.find(
      (d) => d.deviceId === deviceId,
    );
    if (thisDevice && !thisDevice.active) {
      try {
        localStorage.removeItem(DRIVER_STORAGE_KEY);
      } catch {
        // localStorage không khả dụng — vẫn tiếp tục đăng xuất bình
        // thường trong phiên hiện tại.
      }
      setRestaurantId(null);
      setDeviceId(null);
      setDeviceName("");
      setActiveOrder(null);
      toast.error(
        "Thiết bị này đã bị thu hồi quyền truy cập. Vui lòng kích hoạt lại.",
      );
    }
  }, [deviceId, devicesForActiveCheck]);

  function handleActivated(restId: string, devId: string, name: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    setDeviceName(name);
    try {
      localStorage.setItem(
        DRIVER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId, name }),
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
    <div className="flex h-[calc(100vh-4rem)] flex-col" data-ocid="driver.page">
      {/* Device status bar */}
      <div
        className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6"
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
                {deviceName || "Thiết bị đã kích hoạt"}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {deviceId}
              </p>
              {restaurant && (
                <>
                  <p className="truncate text-xs font-medium text-foreground">
                    {restaurant.name}
                  </p>
                  <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                    <MapPin
                      className="mt-0.5 h-3 w-3 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="line-clamp-2">{restaurant.address}</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bước 2/3: nội dung theo tab đang chọn (Hàng đợi hoặc 1 trong 3
          mốc lịch sử) — cuộn RIÊNG trong khu vực này, để status bar +
          bottom nav luôn cố định (không cuộn theo). */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "queue" ? (
          <PaymentQueue
            orders={ordersQuery.data ?? []}
            isLoading={ordersQuery.isLoading}
            isError={ordersQuery.isError}
            onPay={handlePay}
            payingOrderId={activeOrder?.orderId ?? null}
          />
        ) : (
          <DriverOrderHistory restaurantId={restaurantId} period={activeTab} />
        )}
      </div>

      {/* Thanh điều hướng dưới — thay cho 2 tầng tab cũ (tab lớn "Hàng
          đợi thanh toán"/"Lịch sử đơn hàng" ở đầu trang + 3 nút con
          "Hôm nay/Tuần này/Tháng này" ẩn bên trong tab Lịch sử). Giờ gộp
          thành 1 tầng — 4 mục ngang hàng, cố định ở cuối trang (theo
          yêu cầu tối ưu giao diện đã duyệt). */}
      <nav
        className="flex shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
        data-ocid="driver.bottom_nav"
      >
        {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-current={activeTab === tab ? "page" : undefined}
            data-ocid={`driver.bottom_nav.${tab}`}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-smooth ${
              activeTab === tab
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* Bước 3: QR full screen overlay — hoạt động mọi lúc */}
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
