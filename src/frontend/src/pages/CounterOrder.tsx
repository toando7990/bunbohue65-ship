// CounterOrder — app quầy cho nhân viên đặt món hộ khách đến trực tiếp
// (walk-in). Cài đặt cố định theo thiết bị (kích hoạt 1 lần, gắn với 1 nhà
// hàng cụ thể — dùng chung cơ chế activateDevice với "Hàng đợi thanh toán",
// vai trò 'cashier'). Không xác thực email, không có bước "Mã nhận hàng"
// (khách đứng ngay tại quầy) — đặt xong hiện QR thanh toán ngay lập tức.
//
// GIAO DIỆN DESKTOP (15-21 inch, theo mockup đã duyệt) — bố cục 2 cột:
// menu bên trái (toàn bộ 4 danh mục, groupByCategory — không giới hạn chỉ
// "Món chính" như trước), giỏ hàng bên phải LUÔN CỐ ĐỊNH (sticky, không
// cuộn theo trang) — nhân viên thấy tổng tiền + nút "Đặt đơn" mọi lúc mà
// không cần cuộn xuống cuối trang.
//
// Banner Giờ Vàng ở đầu trang (dùng usePromotionCountdown/useCurrentPromotion
// đã có sẵn) — ĐƠN GIẢN HƠN PromotionBanner.tsx: KHÔNG có phần nhắc xác
// thực email (đơn quầy không cần email để hưởng Giờ Vàng — xem
// applyPromotionCounter ở canister/VPS, áp dụng tự động chỉ theo giờ).
// discountAmount hiển thị ở đây là ƯỚC TÍNH client-side (tìm tier cao nhất
// mà itemsTotal đạt) — số tiền THẬT do canister applyPromotionCounter
// quyết định lúc tạo đơn (VPS), có thể khác nếu giới hạn tổng đơn/ngày đã
// đầy giữa lúc ước tính và lúc tạo đơn thật.
//
// cusName/cusPhone: VPS routes/create.js BẮT BUỘC 2 trường này không rỗng
// (từ chối tạo đơn nếu thiếu) — vì không còn ô nhập, dùng giá trị CỐ ĐỊNH
// (COUNTER_CUS_NAME/COUNTER_CUS_PHONE bên dưới) cho MỌI đơn tại quầy. Đây
// chỉ là dữ liệu nội bộ để hệ thống chấp nhận đơn, không ảnh hưởng gì tới
// thanh toán hay các chương trình khuyến mại (dùng email riêng, không liên
// quan tên/SĐT).

import { DeviceRole } from "@/backend";
import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { CounterQRDisplay } from "@/components/CounterQRDisplay";
import { MenuPicker } from "@/components/MenuPicker";
import { Button } from "@/components/ui/button";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import { useCurrentPromotion, useMenus } from "@/hooks/useQueries";
import { getOrder as getOrderFn, useCanister } from "@/lib/canister";
import { create as vpsCreate } from "@/lib/vps-client";
import type { CreateOrderPayload } from "@/types";
import { Flame, Loader2, ShoppingCart, Smartphone, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const COUNTER_STORAGE_KEY = "bbh_counter_activation";

// Giá trị cố định cho MỌI đơn tại quầy — xem giải thích ở comment đầu file.
const COUNTER_CUS_NAME = "Khách tại quầy";
const COUNTER_CUS_PHONE = "0000000000";

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
  name: string;
} | null {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
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

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

// Banner Giờ Vàng — bản rút gọn cho quầy (không có phần xác thực email,
// khác PromotionBanner.tsx dùng ở trang đặt online).
function CounterGoldenHourBanner() {
  const { data: promotion } = useCurrentPromotion();
  const countdown = usePromotionCountdown(promotion);

  if (countdown.kind === "hidden" || !promotion) {
    return null;
  }

  const sortedTiers = [...promotion.tiers].sort(
    (a, b) => Number(a.minOrderValue) - Number(b.minOrderValue),
  );
  const isActive = countdown.kind === "active";

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 to-warning/10 px-5 py-3.5"
      data-ocid="counter.golden_hour_banner"
    >
      <div className="flex items-center gap-3">
        <Flame className="h-7 w-7 text-primary" aria-hidden="true" />
        <div>
          <p className="font-display text-base font-bold text-primary">
            {isActive ? "Đang trong Giờ Vàng!" : "Sắp tới Giờ Vàng"}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {sortedTiers.map((t) => (
              <span
                key={t.minOrderValue.toString()}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold"
              >
                Từ {formatVnd(Number(t.minOrderValue))} giảm{" "}
                {formatVnd(Number(t.discountAmount))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div
        className={`flex flex-col items-center rounded-xl px-4 py-2 text-white ${isActive ? "bg-primary" : "bg-warning"}`}
      >
        <span className="text-[10px] uppercase tracking-wide opacity-85">
          {isActive ? "Còn lại" : "Bắt đầu sau"}
        </span>
        <span className="font-display text-lg font-bold">
          {countdown.formatted}
        </span>
      </div>
    </div>
  );
}

export default function CounterOrder() {
  const stored = loadStoredActivation();
  const [restaurantId, setRestaurantId] = useState<string | null>(
    stored?.restaurantId ?? null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    stored?.deviceId ?? null,
  );
  const [deviceName, setDeviceName] = useState<string>(stored?.name ?? "");

  const { actor } = useCanister();
  const { data: menu, isLoading: menuLoading } = useMenus();
  const { data: promotion } = useCurrentPromotion();
  const countdown = usePromotionCountdown(promotion);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  function handleActivated(restId: string, devId: string, name: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    setDeviceName(name);
    try {
      localStorage.setItem(
        COUNTER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId, name }),
      );
    } catch {
      // localStorage không khả dụng — vẫn hoạt động trong phiên hiện tại.
    }
    toast.success("Thiết bị quầy đã sẵn sàng nhận đơn");
  }

  const cartLines = useMemo(() => {
    if (!menu) return [];
    return menu
      .filter((m) => (cart[m.itemId] ?? 0) > 0)
      .map((m) => ({ item: m, quantity: cart[m.itemId] }));
  }, [menu, cart]);

  const mainDishLines = useMemo(
    () => cartLines.filter((l) => l.item.category === "Món chính"),
    [cartLines],
  );

  // Món dụng cụ tự động thêm theo số lượng món chính — cùng logic nghiệp vụ
  // với CreateOrder.tsx (xem giải thích chi tiết ở đó).
  const utensilItem = useMemo(
    () =>
      menu?.find(
        (m) => m.category === "Khác" && m.name === "Dụng cụ đựng đồ ăn",
      ),
    [menu],
  );
  const utensilQty = useMemo(
    () => mainDishLines.reduce((sum, l) => sum + l.quantity, 0),
    [mainDishLines],
  );
  const utensilLine = useMemo(() => {
    if (!utensilItem || utensilQty <= 0) return null;
    return { item: utensilItem, quantity: utensilQty };
  }, [utensilItem, utensilQty]);

  const displayCartLines = useMemo(() => {
    if (!utensilLine) return cartLines;
    return [...cartLines, utensilLine];
  }, [cartLines, utensilLine]);

  const itemsTotal = useMemo(
    () =>
      displayCartLines.reduce(
        (sum, l) => sum + Number(l.item.price) * l.quantity,
        0,
      ),
    [displayCartLines],
  );

  const itemCount = useMemo(
    () => displayCartLines.reduce((sum, l) => sum + l.quantity, 0),
    [displayCartLines],
  );

  // Ước tính giảm giá Giờ Vàng (client-side, chỉ để HIỂN THỊ THAM KHẢO
  // trước khi đặt đơn) — tìm mức (tier) cao nhất mà itemsTotal đạt được.
  // Số tiền THẬT do canister applyPromotionCounter quyết định lúc tạo đơn.
  const estimatedDiscount = useMemo(() => {
    if (countdown.kind !== "active" || !promotion || itemsTotal <= 0) {
      return 0;
    }
    const eligible = promotion.tiers.filter(
      (t) => itemsTotal >= Number(t.minOrderValue),
    );
    if (eligible.length === 0) return 0;
    return Math.max(...eligible.map((t) => Number(t.discountAmount)));
  }, [countdown.kind, promotion, itemsTotal]);

  function handleQuantityChange(itemId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  async function handleSubmit() {
    if (mainDishLines.length === 0) {
      toast.error("Vui lòng chọn ít nhất một món chính.");
      return;
    }
    if (!restaurantId || !actor) return;

    setSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        restaurantId,
        pickupAddress: "",
        cusName: COUNTER_CUS_NAME,
        cusPhone: COUNTER_CUS_PHONE,
        cusAddress: "",
        cusTaxCode: "",
        receiverEmail: "",
        items: displayCartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        shippingFee: 0,
        ahamoveOrderId: "",
        isCounterOrder: true,
      };
      const res = await vpsCreate(payload);
      if (!res.ok) {
        throw new Error(res.error ?? "VPS từ chối tạo đơn.");
      }
      // Lấy đầy đủ Order từ canister để CounterQRDisplay có amount/paymentStatus.
      const order = await getOrderFn(actor, res.orderId);
      setActiveOrder(order);
      toast.success("Đặt đơn thành công!", {
        description: `Mã đơn: ${res.orderId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function handleCloseQr() {
    setActiveOrder(null);
  }

  function handlePaid(order: Order) {
    setActiveOrder(null);
    toast.success(`Đã thanh toán đơn ${order.orderId}`);
    // Reset để nhân viên đặt đơn tiếp theo.
    setCart({});
  }

  if (!restaurantId || !deviceId) {
    return (
      <ActivationForm
        onActivated={handleActivated}
        expectedRole={DeviceRole.cashier}
        expectedRoleLabel="thu ngân / quầy"
      />
    );
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      data-ocid="counter.page"
    >
      <div
        className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:px-6"
        data-ocid="counter.status_bar"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {deviceName || "Thiết bị quầy đã kích hoạt"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {deviceId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Đặt món tại quầy
          </h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 md:px-6 xl:px-8">
        <CounterGoldenHourBanner />

        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <MenuPicker
              menu={menu}
              isLoading={menuLoading}
              cart={cart}
              onQuantityChange={handleQuantityChange}
              disabled={submitting}
              groupByCategory
            />
          </div>

          <div
            className="sticky top-4 hidden w-[340px] shrink-0 lg:block"
            data-ocid="counter.cart_panel"
          >
            <div className="rounded-2xl border border-border bg-card p-4 shadow-lg">
              <p className="mb-2 flex items-center gap-2 font-display text-base font-bold">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Giỏ hàng — {itemCount} món
              </p>

              {displayCartLines.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Chưa chọn món nào
                </p>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto">
                  {displayCartLines.map((l) => (
                    <div
                      key={l.item.itemId}
                      className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-none"
                    >
                      <div>
                        <p className="font-semibold">{l.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.quantity} × {formatVnd(Number(l.item.price))}
                        </p>
                      </div>
                      <p className="font-bold">
                        {formatVnd(Number(l.item.price) * l.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {estimatedDiscount > 0 && (
                <div className="my-2.5 flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-xs font-semibold text-primary">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  Đơn này đủ điều kiện Giờ Vàng — giảm{" "}
                  {formatVnd(estimatedDiscount)}
                </div>
              )}

              <div className="mt-2 flex items-baseline justify-between border-t-2 border-border pt-2.5">
                <span className="text-xs text-muted-foreground">Tổng cộng</span>
                <span className="font-display text-2xl font-bold">
                  {formatVnd(itemsTotal - estimatedDiscount)}
                </span>
              </div>
              {estimatedDiscount > 0 && (
                <div className="mt-1 flex justify-between text-xs text-success">
                  <span>Đã giảm Giờ Vàng</span>
                  <span>−{formatVnd(estimatedDiscount)}</span>
                </div>
              )}

              <Button
                size="lg"
                className="mt-3.5 w-full"
                onClick={handleSubmit}
                disabled={submitting || mainDishLines.length === 0}
                data-ocid="counter.submit_button"
              >
                {submitting ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Đang đặt đơn…
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Đặt đơn · {formatVnd(itemsTotal - estimatedDiscount)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Thanh dưới cùng cho màn hình nhỏ (< lg) — cột giỏ hàng ẩn ở trên
            không hiện được (không đủ chỗ cho bố cục 2 cột). */}
        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-border bg-card px-4 py-3 md:-mx-6 md:px-6 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{itemCount} món</p>
              <p className="font-display text-2xl font-bold text-foreground">
                {formatVnd(itemsTotal - estimatedDiscount)}
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || mainDishLines.length === 0}
              data-ocid="counter.submit_button_mobile"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              )}
              Đặt đơn · {formatVnd(itemsTotal - estimatedDiscount)}
            </Button>
          </div>
        </div>
      </div>

      {activeOrder && (
        <CounterQRDisplay
          order={activeOrder}
          onClose={handleCloseQr}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}
