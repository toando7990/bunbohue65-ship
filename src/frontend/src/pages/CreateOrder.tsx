// CreateOrder page — Đặt hàng.
// Flow: chọn nhà hàng → chọn món (MenuPicker) → nhập thông tin khách (CustomerForm)
//       → đặt đơn (VPS /order/create).
// Theme: bọc trong .bbh-order-theme (sơn mài đỏ / vàng hoàng cung, xem index.css).
// UI tiếng Việt. Mobile-first.
//
// Khách tự đặt tài xế bằng app ngoài (không qua hệ thống này) nên biểu mẫu
// KHÔNG có bước đặt tài xế, KHÔNG nhập địa chỉ giao hàng và KHÔNG tính phí ship
// (khách trả phí trực tiếp bên ngoài). Tổng tiền hiển thị = giá hàng (đã gồm VAT).
//
// Chỉ tạo đơn qua POST /order/create (VPS worker) — KHÔNG tạo QR tại thời điểm
// đặt đơn. QR thanh toán được tạo theo yêu cầu ở trang theo dõi đơn
// (POST /order/:id/qr). Sau khi tạo đơn thành công, chuyển khách sang
// "Theo dõi đơn" (/track/$orderId).

import {
  CustomerForm,
  type CustomerFormErrors,
  type CustomerFormValues,
  validateCustomerForm,
} from "@/components/CustomerForm";
import { MenuPicker } from "@/components/MenuPicker";
import { RestaurantSelect } from "@/components/RestaurantSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsStoreOpen, useMenus, useRestaurants } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { getVerifiedEmail } from "@/lib/verification-storage";
import {
  create as vpsCreate,
  getCustomer as vpsGetCustomer,
} from "@/lib/vps-client";
import type { CreateOrderPayload, MenuItem, Restaurant } from "@/types";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock,
  Loader2,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

const EMPTY_CUSTOMER: CustomerFormValues = {
  cusName: "",
  cusPhone: "",
  cusAddress: "",
  cusTaxCode: "",
  receiverEmail: "",
};

export default function CreateOrder() {
  const navigate = useNavigate();
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  // A1: trạng thái mở/đóng cửa hàng (toàn cục). data===false → cửa hàng đang
  // đóng → chặn đặt đơn và hiện màn hình chờ thay vì cho phép chọn món.
  const { data: storeOpen } = useIsStoreOpen();
  const storeClosed = storeOpen === false;

  const [restaurantId, setRestaurantId] = useState<string>("");
  // Menu dùng chung cho toàn bộ chuỗi nhà hàng — hiện ngay từ đầu, không phụ thuộc
  // vào việc đã chọn nhà hàng hay chưa. Chỉ chặn ở bước THÊM MÓN (xem handleQuantityChange).
  const { data: menu, isLoading: menuLoading } = useMenus();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Gợi ý gọi thêm — hiện 1 lần khi khách thêm món đầu tiên vào giỏ.
  const [upsellItems, setUpsellItems] = useState<MenuItem[]>([]);

  const selectedRestaurant: Restaurant | undefined = restaurants?.find(
    (r) => r.restaurantId === restaurantId,
  );

  const cartLines = useMemo(() => {
    if (!menu) return [];
    return menu
      .filter((m) => (cart[m.itemId] ?? 0) > 0)
      .map((m) => ({ item: m, quantity: cart[m.itemId] }));
  }, [menu, cart]);

  // A1: Món dụng cụ 'Dụng cụ đựng đồ ăn' (danh mục 'Khác') là món thật trong
  // menu, được thêm tự động vào giỏ như món hàng bình thường (KHÔNG gọi là phí).
  // Đây là trạng thái DERIVED — tính lại mỗi khi giỏ thay đổi, không persist riêng.
  //   - mainDishLines: các dòng món chính (category === 'Món chính').
  //   - utensilQty = tổng số lượng món chính trong giỏ.
  //   - utensilLine: nếu món dụng cụ tồn tại trong menu VÀ utensilQty > 0 thì thêm
  //     như một dòng bình thường { item, quantity: utensilQty }.
  // Khi xoá hết món chính → utensilQty = 0 → dòng dụng cụ tự biến mất.
  // Khi giảm số lượng món chính → utensilQty giảm theo.
  const mainDishLines = useMemo(
    () => cartLines.filter((l) => l.item.category === "Món chính"),
    [cartLines],
  );

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

  // Các dòng hiển thị trong giỏ (và gửi lên VPS): món đã chọn + dòng dụng cụ.
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

  const customerErrors: CustomerFormErrors = touched
    ? validateCustomerForm(customer, { hideAddress: true })
    : {};
  function handleQuantityChange(itemId: string, delta: number) {
    // Chưa chọn nhà hàng → chặn thêm món, nhắc khách chọn nhà hàng trước (bước 1).
    if (delta > 0 && !restaurantId) {
      toast.error("Vui lòng chọn nhà hàng trước khi thêm món.");
      document
        .querySelector('[data-ocid="create_order.restaurant_card"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const prevQty = cart[itemId] ?? 0;

    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });

    // Mỗi lần thêm MÓN CHÍNH mới (chưa có trong giỏ trước đó) → gợi ý món phụ.
    // Lặp lại cho từng món chính khác nhau, không giới hạn 1 lần/phiên.
    if (delta > 0 && prevQty === 0 && menu) {
      const addedItem = menu.find((m) => m.itemId === itemId);
      if (addedItem?.category === "Món chính") {
        const suggestions = menu
          .filter(
            (m) =>
              m.visible &&
              m.category === "Món phụ" &&
              (cart[m.itemId] ?? 0) === 0,
          )
          .slice(0, 2);
        if (suggestions.length > 0) {
          setUpsellItems(suggestions);
        }
      }
    }
  }

  function handleCustomerChange<K extends keyof CustomerFormValues>(
    field: K,
    value: string,
  ) {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  }

  // Tự động điền thông tin khách từ email đã xác thực.
  // Khi mở app: đọc email đã xác thực (localStorage) → điền sẵn ô email nhận
  // hoá đơn → gọi VPS GET /customers/:email để lấy tên + số điện thoại đã lưu
  // và điền vào form, giúp khách đặt đơn tiếp theo nhanh hơn.
  useEffect(() => {
    let cancelled = false;
    const verified = getVerifiedEmail();
    if (!verified) return;

    setCustomer((prev) => ({
      ...prev,
      receiverEmail: verified.email,
    }));

    vpsGetCustomer(verified.email)
      .then((customer) => {
        if (cancelled || !customer) return;
        setCustomer((prev) => ({
          ...prev,
          cusName: customer.name || prev.cusName,
          cusPhone: customer.phone || prev.cusPhone,
        }));
      })
      .catch(() => {
        // Không tìm thấy khách (404) hoặc lỗi mạng — bỏ qua, khách tự nhập.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleRestaurantChange(id: string) {
    if (
      restaurantId &&
      id !== restaurantId &&
      itemCount > 0 &&
      !window.confirm(
        "Đổi nhà hàng sẽ xoá các món đã chọn trong giỏ hàng. Tiếp tục?",
      )
    ) {
      return;
    }
    setRestaurantId(id);
    setCart({});
    setUpsellItems([]);
  }

  async function handleSubmit() {
    setTouched(true);
    const errs = validateCustomerForm(customer, { hideAddress: true });
    if (Object.keys(errs).length > 0) {
      toast.error("Vui lòng kiểm tra thông tin khách hàng.");
      return;
    }
    if (!restaurantId || cartLines.length === 0) {
      toast.error("Vui lòng chọn nhà hàng và ít nhất một món.");
      return;
    }
    // A1: Đơn chỉ hợp lệ khi giỏ có ít nhất 1 món chính. Nếu không có món chính
    // (chỉ còn món dụng cụ hoặc giỏ trống) thì chặn đặt đơn với thông báo thân
    // thiện bằng tiếng Việt — không hiện mã lỗi kỹ thuật.
    if (mainDishLines.length === 0) {
      toast.error("Vui lòng chọn ít nhất một món chính để đặt đơn.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        restaurantId,
        pickupAddress: selectedRestaurant!.address,
        cusName: customer.cusName.trim(),
        cusPhone: customer.cusPhone.trim(),
        cusAddress: customer.cusAddress.trim(),
        cusTaxCode: customer.cusTaxCode.trim(),
        receiverEmail: customer.receiverEmail.trim(),
        items: displayCartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        // Không tính phí ship trong hệ thống — khách trả phí trực tiếp bên ngoài.
        shippingFee: 0,
        ahamoveOrderId: "",
      };
      const res = await vpsCreate(payload);
      if (!res.ok) {
        throw new Error(res.error ?? "VPS từ chối tạo đơn.");
      }
      // Lưu orderId vào danh sách "đơn của thiết bị này" — dùng cho trang
      // "Theo dõi đơn" (OrderList.tsx /track) chỉ hiện đúng đơn đã đặt từ trình
      // duyệt này. Áp dụng cho cả hai luồng.
      try {
        const raw = localStorage.getItem("bbh_my_orders");
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        list.push(res.orderId);
        localStorage.setItem("bbh_my_orders", JSON.stringify(list));
      } catch {
        // bỏ qua nếu localStorage không khả dụng
      }

      toast.success("Đặt đơn thành công!", {
        description: `Mã đơn: ${res.orderId}`,
      });
      setCart({});
      setCustomer(EMPTY_CUSTOMER);
      setTouched(false);
      setCartOpen(false);
      navigate({ to: "/track/$orderId", params: { orderId: res.orderId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const totalAmount = itemsTotal;

  return (
    <div className="bbh-order-theme bg-background text-foreground">
      <section
        className="mx-auto w-full max-w-2xl px-4 py-6 pb-28 md:px-6 md:py-10"
        data-ocid="create_order.page"
      >
        <header className="mb-6 flex flex-col gap-1">
          <h1
            className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            data-ocid="create_order.title"
          >
            Đặt món
          </h1>
          <p className="text-sm text-muted-foreground">
            Chọn nhà hàng, chọn món, nhập tên + SĐT — đặt đơn rồi thanh toán QR
            và tự đặt Grab Express nhận hàng.
          </p>
        </header>

        {storeClosed ? (
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-primary/5 px-6 py-12 text-center"
            data-ocid="create_order.closed_state"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Clock className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="font-display text-xl font-bold text-foreground">
              Cửa hàng đang đóng
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Hiện tại ngoài giờ mở cửa nên bạn chưa thể đặt món. Vui lòng quay
              lại trong giờ hoạt động của cửa hàng để đặt hàng.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-6">
              {/* Step 1: Restaurant */}
              <Card data-ocid="create_order.restaurant_card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    Chọn nhà hàng
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RestaurantSelect
                    restaurants={restaurants}
                    isLoading={restaurantsLoading}
                    value={restaurantId}
                    onChange={handleRestaurantChange}
                  />
                </CardContent>
              </Card>

              {/* Step 2: Menu — hiện ngay, chỉ chặn lúc thêm món nếu chưa chọn nhà hàng */}
              <Card data-ocid="create_order.menu_card">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    Chọn món
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!restaurantId && (
                    <div
                      className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
                      data-ocid="create_order.menu_hint"
                    >
                      <Package
                        className="h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      Xem menu thoải mái — chỉ cần chọn nhà hàng ở bước 1 trước
                      khi thêm món vào giỏ.
                    </div>
                  )}
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
            </div>

            {/* Gợi ý gọi thêm */}
            {upsellItems.length > 0 && (
              <div
                className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-2xl rounded-xl border border-border bg-card p-3 shadow-elevated animate-fade-rise"
                data-ocid="create_order.upsell_strip"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[oklch(var(--bbh-gold))]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Gọi thêm cho tròn vị?
                  </span>
                  <button
                    type="button"
                    aria-label="Đóng gợi ý"
                    onClick={() => setUpsellItems([])}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex gap-2">
                  {upsellItems.map((m) => (
                    <div
                      key={m.itemId}
                      className="flex flex-1 items-center justify-between gap-2 rounded-lg bg-secondary p-2"
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-xs font-semibold">
                          {m.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatVnd(Number(m.price))}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Thêm ${m.name}`}
                        onClick={() => {
                          handleQuantityChange(m.itemId, 1);
                          setUpsellItems((prev) =>
                            prev.filter((x) => x.itemId !== m.itemId),
                          );
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thanh giỏ hàng nổi */}
            {itemCount > 0 && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl items-center justify-between rounded-2xl bg-gradient-primary px-5 py-4 text-primary-foreground shadow-elevated"
                data-ocid="create_order.open_cart_button"
              >
                <span className="flex flex-col items-start">
                  <span className="text-xs opacity-90">{itemCount} món</span>
                  <span className="font-display text-base font-bold">
                    {formatVnd(totalAmount)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm font-semibold">
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                  Xem giỏ hàng
                </span>
              </button>
            )}

            {/* Bottom sheet: giỏ hàng + thông tin khách + đặt đơn */}
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetContent
                side="bottom"
                className="bbh-order-theme flex max-h-[92vh] flex-col overflow-y-auto rounded-t-2xl bg-background text-foreground"
                data-ocid="create_order.cart_sheet"
              >
                <SheetHeader>
                  <SheetTitle className="font-display">
                    Giỏ hàng của bạn
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-4 pb-4">
                  <ul
                    className="flex flex-col gap-2"
                    data-ocid="create_order.cart_lines"
                  >
                    {displayCartLines.map((l) => {
                      const isUtensil =
                        !!utensilLine &&
                        l.item.itemId === utensilLine.item.itemId;
                      return (
                        <li
                          key={l.item.itemId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 font-medium">
                              {l.item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatVnd(Number(l.item.price))} × {l.quantity}
                            </p>
                          </div>
                          {isUtensil ? (
                            // Dòng dụng cụ là trạng thái DERIVED — số lượng tự
                            // đồng bộ theo món chính, không chỉnh sửa trực tiếp.
                            <span className="shrink-0 text-xs text-muted-foreground">
                              Tự động
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() =>
                                  handleQuantityChange(l.item.itemId, -1)
                                }
                              >
                                −
                              </Button>
                              <span className="w-6 text-center font-mono">
                                {l.quantity}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() =>
                                  handleQuantityChange(l.item.itemId, 1)
                                }
                              >
                                +
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Thông tin khách hàng
                    </h3>
                    <CustomerForm
                      values={customer}
                      errors={customerErrors}
                      onChange={handleCustomerChange}
                      disabled={submitting}
                      hideAddress
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                      Tổng tiền
                    </span>
                    <span className="font-mono text-lg font-bold text-[oklch(var(--bbh-gold))]">
                      {formatVnd(totalAmount)}
                    </span>
                  </div>

                  <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <Button
                      type="button"
                      className="min-h-[48px] w-full bg-gradient-primary text-primary-foreground"
                      onClick={handleSubmit}
                      disabled={
                        submitting ||
                        cartLines.length === 0 ||
                        Object.keys(customerErrors).length > 0
                      }
                      data-ocid="create_order.submit_button"
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
                          <ShoppingCart
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Đặt đơn · {formatVnd(totalAmount)}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
      </section>
    </div>
  );
}
