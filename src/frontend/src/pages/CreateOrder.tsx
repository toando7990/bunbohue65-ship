// CreateOrder page — Đặt hàng.
// Flow: chọn nhà hàng → chọn món (MenuPicker) → nhập thông tin khách (CustomerForm)
//       → xem phí ship + tổng tiền (VPS /quote) → đặt đơn (VPS /order/create).
// UI tiếng Việt. Mobile-first. Canister chỉ poll cho status/QR (không ở page này).

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
import { Skeleton } from "@/components/ui/skeleton";
import { useMenuForRestaurant, useRestaurants } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { create as vpsCreate, quote as vpsQuote } from "@/lib/vps-client";
import type {
  CreateOrderPayload,
  MenuItem,
  QuoteRequest,
  QuoteResponse,
  Restaurant,
} from "@/types";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  Loader2,
  Minus,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  const [restaurantId, setRestaurantId] = useState<string>("");
  const { data: menu, isLoading: menuLoading } = useMenuForRestaurant(
    restaurantId || undefined,
  );

  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRestaurant: Restaurant | undefined = restaurants?.find(
    (r) => r.restaurantId === restaurantId,
  );

  const cartLines = useMemo(() => {
    if (!menu) return [];
    return menu
      .filter((m) => (cart[m.itemId] ?? 0) > 0)
      .map((m) => ({ item: m, quantity: cart[m.itemId] }));
  }, [menu, cart]);

  const itemsTotal = useMemo(
    () =>
      cartLines.reduce((sum, l) => sum + Number(l.item.price) * l.quantity, 0),
    [cartLines],
  );

  const itemCount = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.quantity, 0),
    [cartLines],
  );

  const customerErrors: CustomerFormErrors = touched
    ? validateCustomerForm(customer)
    : {};

  function handleQuantityChange(itemId: string, delta: number) {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[itemId];
      else copy[itemId] = next;
      return copy;
    });
    // Cart changed → stale quote.
    setQuote(null);
    setQuoteError(null);
  }

  function handleCustomerChange<K extends keyof CustomerFormValues>(
    field: K,
    value: string,
  ) {
    setCustomer((prev) => ({ ...prev, [field]: value }));
    // Address change invalidates quote.
    if (field === "cusAddress") {
      setQuote(null);
      setQuoteError(null);
    }
  }

  function handleRestaurantChange(id: string) {
    setRestaurantId(id);
    setCart({});
    setQuote(null);
    setQuoteError(null);
  }

  function canRequestQuote(): boolean {
    return (
      !!restaurantId &&
      cartLines.length > 0 &&
      !!customer.cusAddress.trim() &&
      !!selectedRestaurant?.address &&
      !quoteLoading
    );
  }

  async function handleQuote() {
    if (!canRequestQuote()) return;
    setTouched(true);
    const errs = validateCustomerForm(customer);
    // For quote we only strictly need address; but warn on others.
    if (errs.cusAddress) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const payload: QuoteRequest = {
        restaurantId,
        pickupAddress: selectedRestaurant!.address,
        dropAddress: customer.cusAddress.trim(),
        items: cartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
        })),
      };
      const res = await vpsQuote(payload);
      setQuote(res);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Không lấy được phí ship.";
      setQuoteError(msg);
      toast.error("Lấy phí ship thất bại", { description: msg });
    } finally {
      setQuoteLoading(false);
    }
  }

  async function handleSubmit() {
    setTouched(true);
    const errs = validateCustomerForm(customer);
    if (Object.keys(errs).length > 0) {
      toast.error("Vui lòng kiểm tra thông tin khách hàng.");
      return;
    }
    if (!restaurantId || cartLines.length === 0) {
      toast.error("Vui lòng chọn nhà hàng và ít nhất một món.");
      return;
    }
    if (!quote) {
      toast.error("Vui lòng lấy phí ship trước khi đặt đơn.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        restaurantId,
        cusName: customer.cusName.trim(),
        cusPhone: customer.cusPhone.trim(),
        cusAddress: customer.cusAddress.trim(),
        cusTaxCode: customer.cusTaxCode.trim(),
        receiverEmail: customer.receiverEmail.trim(),
        items: cartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        shippingFee: quote.shippingFee,
        ahamoveOrderId: quote.ahamoveOrderId,
      };
      const res = await vpsCreate(payload);
      if (!res.ok) {
        throw new Error(res.error ?? "VPS từ chối tạo đơn.");
      }
      toast.success("Đặt đơn thành công!", {
        description: `Mã đơn: ${res.orderId}`,
      });
      // Reset and navigate to tracking.
      setCart({});
      setCustomer(EMPTY_CUSTOMER);
      setQuote(null);
      setTouched(false);
      navigate({ to: "/track/$orderId", params: { orderId: res.orderId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const totalAmount = quote?.amount ?? itemsTotal;

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-10"
      data-ocid="create_order.page"
    >
      <header className="mb-6 flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="create_order.title"
        >
          Đặt hàng
        </h1>
        <p className="text-sm text-muted-foreground">
          Chọn nhà hàng, chọn món, nhập thông tin khách và xem phí ship trước
          khi đặt đơn.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: restaurant + menu + customer */}
        <div className="flex flex-col gap-6 lg:col-span-2">
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

          {/* Step 2: Menu */}
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
              {!restaurantId ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
                  data-ocid="create_order.menu_empty_state"
                >
                  <Package
                    className="h-8 w-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-foreground">
                    Chọn nhà hàng để xem menu
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bước 1 ở trên để hiển thị danh sách món.
                  </p>
                </div>
              ) : (
                <MenuPicker
                  menu={menu}
                  isLoading={menuLoading}
                  cart={cart}
                  onQuantityChange={handleQuantityChange}
                  disabled={submitting}
                />
              )}
            </CardContent>
          </Card>

          {/* Step 3: Customer */}
          <Card data-ocid="create_order.customer_card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                Thông tin khách
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerForm
                values={customer}
                errors={customerErrors}
                onChange={handleCustomerChange}
                disabled={submitting}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: order summary (sticky on desktop) */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <Card data-ocid="create_order.summary_card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Đơn hàng
                  </span>
                  <span
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                    data-ocid="create_order.summary_count"
                  >
                    {itemCount} món
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {cartLines.length === 0 ? (
                  <p
                    className="py-6 text-center text-sm text-muted-foreground"
                    data-ocid="create_order.summary_empty_state"
                  >
                    Chưa có món nào được chọn.
                  </p>
                ) : (
                  <ul
                    className="flex flex-col gap-2"
                    data-ocid="create_order.summary_list"
                  >
                    {cartLines.map((l, idx) => (
                      <li
                        key={l.item.itemId}
                        className="flex items-start justify-between gap-2 text-sm"
                        data-ocid={`create_order.summary_item.${idx}`}
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="line-clamp-1 font-medium text-foreground">
                            {l.item.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatVnd(Number(l.item.price))} × {l.quantity}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-sm font-medium">
                          {formatVnd(Number(l.item.price) * l.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <Separator />

                {/* Quote section */}
                <div
                  className="flex flex-col gap-2"
                  data-ocid="create_order.quote_panel"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Tạm tính (chưa VAT)
                    </span>
                    <span className="font-mono font-medium">
                      {formatVnd(itemsTotal)}
                    </span>
                  </div>

                  {quote ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                          Phí ship
                        </span>
                        <span className="font-mono font-medium">
                          {formatVnd(quote.shippingFee)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          VAT ({quote.vatRate}%)
                        </span>
                        <span className="font-mono font-medium">
                          {formatVnd(quote.taxTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Tiền hàng + VAT
                        </span>
                        <span className="font-mono font-medium">
                          {formatVnd(quote.goodsAmount + quote.taxTotal)}
                        </span>
                      </div>
                    </>
                  ) : quoteError ? (
                    <div
                      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                      data-ocid="create_order.quote_error_state"
                      role="alert"
                    >
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 break-words">{quoteError}</span>
                    </div>
                  ) : quoteLoading ? (
                    <div
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      data-ocid="create_order.quote_loading_state"
                    >
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      Đang tính phí ship…
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nhấn “Lấy phí ship” để xem phí giao hàng và tổng tiền.
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={handleQuote}
                    disabled={!canRequestQuote()}
                    data-ocid="create_order.quote_button"
                  >
                    {quoteLoading ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Đang tính…
                      </>
                    ) : (
                      <>
                        <Truck className="h-4 w-4" aria-hidden="true" />
                        Lấy phí ship
                      </>
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Total */}
                <div
                  className="flex items-center justify-between"
                  data-ocid="create_order.total_panel"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                    Tổng tiền
                  </span>
                  <span
                    className="font-mono text-lg font-bold text-primary"
                    data-ocid="create_order.total_amount"
                  >
                    {formatVnd(totalAmount)}
                  </span>
                </div>

                <Button
                  type="button"
                  className="min-h-[44px] w-full bg-gradient-primary text-primary-foreground"
                  onClick={handleSubmit}
                  disabled={
                    submitting ||
                    cartLines.length === 0 ||
                    !quote ||
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
                      <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                      Đặt đơn
                    </>
                  )}
                </Button>

                {!quote && cartLines.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Cần lấy phí ship trước khi đặt đơn.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </section>
  );
}
