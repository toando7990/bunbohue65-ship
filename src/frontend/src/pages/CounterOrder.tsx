// CounterOrder — app quầy cho nhân viên đặt món hộ khách đến trực tiếp
// (walk-in). Cài đặt cố định theo thiết bị (kích hoạt 1 lần, gắn với 1 nhà
// hàng cụ thể — dùng chung cơ chế activateDevice với "Hàng đợi thanh toán",
// vai trò 'cashier'). Không xác thực email, không có bước "Mã nhận hàng"
// (khách đứng ngay tại quầy) — đặt xong hiện QR thanh toán ngay lập tức.
//
// Bước 1: Kích hoạt thiết bị (ActivationForm, expectedRole=cashier).
// Bước 2: Chọn món (MenuPicker) + tên/SĐT khách (tối thiểu).
// Bước 3: Tạo đơn (VPS /order/create) → hiện CounterQRDisplay ngay.

import { DeviceRole } from "@/backend";
import type { Order } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import { CounterQRDisplay } from "@/components/CounterQRDisplay";
import {
  CustomerForm,
  type CustomerFormErrors,
  type CustomerFormValues,
  validateCustomerForm,
} from "@/components/CustomerForm";
import { MenuPicker } from "@/components/MenuPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMenus } from "@/hooks/useQueries";
import { getOrder as getOrderFn, useCanister } from "@/lib/canister";
import { create as vpsCreate } from "@/lib/vps-client";
import type { CreateOrderPayload } from "@/types";
import { Loader2, ShoppingCart, Smartphone, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const COUNTER_STORAGE_KEY = "bbh_counter_activation";

function loadStoredActivation(): {
  restaurantId: string;
  deviceId: string;
} | null {
  try {
    const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.restaurantId && parsed?.deviceId) return parsed;
    return null;
  } catch {
    return null;
  }
}

const EMPTY_CUSTOMER: CustomerFormValues = {
  cusName: "",
  cusPhone: "",
  cusAddress: "",
  cusTaxCode: "",
  receiverEmail: "",
};

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CounterOrder() {
  const stored = loadStoredActivation();
  const [restaurantId, setRestaurantId] = useState<string | null>(
    stored?.restaurantId ?? null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(
    stored?.deviceId ?? null,
  );

  const { actor } = useCanister();
  const { data: menu, isLoading: menuLoading } = useMenus();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  function handleActivated(restId: string, devId: string) {
    setRestaurantId(restId);
    setDeviceId(devId);
    try {
      localStorage.setItem(
        COUNTER_STORAGE_KEY,
        JSON.stringify({ restaurantId: restId, deviceId: devId }),
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

  function handleQuantityChange(itemId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
  }

  const customerErrors: CustomerFormErrors = touched
    ? validateCustomerForm(customer, { hideAddress: true, hideEmail: true })
    : {};

  async function handleSubmit() {
    setTouched(true);
    const errs = validateCustomerForm(customer, {
      hideAddress: true,
      hideEmail: true,
    });
    if (Object.keys(errs).length > 0) {
      toast.error("Vui lòng nhập tên và số điện thoại khách.");
      return;
    }
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
        cusName: customer.cusName.trim(),
        cusPhone: customer.cusPhone.trim(),
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
    toast.success(`Đã thanh toán đơn ${order.cusName || order.orderId}`);
    // Reset để nhân viên đặt đơn tiếp theo.
    setCart({});
    setCustomer(EMPTY_CUSTOMER);
    setTouched(false);
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
        className="border-b border-border bg-card px-4 py-3 md:px-6"
        data-ocid="counter.status_bar"
      >
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              Thiết bị quầy đã kích hoạt
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {deviceId}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">
        <header className="mb-4 flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Đặt món tại quầy
          </h1>
        </header>

        <Card className="mb-4" data-ocid="counter.menu_card">
          <CardHeader>
            <CardTitle className="font-display text-base">Chọn món</CardTitle>
          </CardHeader>
          <CardContent>
            <MenuPicker
              menu={menu}
              isLoading={menuLoading}
              cart={cart}
              onQuantityChange={handleQuantityChange}
              disabled={submitting}
              fixedCategory="Món chính"
            />
          </CardContent>
        </Card>

        <Card className="mb-4" data-ocid="counter.customer_card">
          <CardHeader>
            <CardTitle className="font-display text-base">
              Thông tin khách
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm
              values={customer}
              errors={customerErrors}
              onChange={(field, value) =>
                setCustomer((prev) => ({ ...prev, [field]: value }))
              }
              disabled={submitting}
              hideAddress
              hideEmail
            />
          </CardContent>
        </Card>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{itemCount} món</p>
            <p className="font-display text-2xl font-bold text-foreground">
              {formatVnd(itemsTotal)}
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || mainDishLines.length === 0}
            data-ocid="counter.submit_button"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang đặt đơn…
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Đặt đơn · {formatVnd(itemsTotal)}
              </>
            )}
          </Button>
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
