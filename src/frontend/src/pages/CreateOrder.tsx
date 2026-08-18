// CreateOrder page — Đặt hàng.
// Flow: chọn nhà hàng → chọn món (MenuPicker) → nhập thông tin khách (CustomerForm)
//       → tự động tính phí ship (VPS /quote, debounce) → đặt đơn (VPS /order/create).
// Theme: bọc trong .bbh-order-theme (sơn mài đỏ / vàng hoàng cung, xem index.css).
// UI tiếng Việt. Mobile-first.
//
// Hai chế độ thanh toán (paymentMode từ backend):
//   - 'driver' (mặc định): khách nhập địa chỉ → Ahamove /quote → phí ship →
//     "Đặt đơn" → chuyển đến /track/$orderId. (luồng gốc, không đổi)
//   - 'customer': ẩn địa chỉ, bỏ /quote, ẩn phí ship → "Đặt đơn và Thanh toán" →
//     VPS tạo đơn + Tingee QR → hiển thị QR inline + nút copy ảnh PNG → poll
//     getOrderStatus 5s → khi paid đợi 1.5s rồi ẩn QR, hiện khối hậu thanh toán
//     (địa chỉ nhà hàng + nút sao chép + hướng dẫn Grab Express). Không chuyển trang.

import { type Order, PaymentStatus } from "@/backend";
import {
  CustomerForm,
  type CustomerFormErrors,
  type CustomerFormValues,
  validateCustomerForm,
} from "@/components/CustomerForm";
import { MenuPicker } from "@/components/MenuPicker";
import { RestaurantSelect } from "@/components/RestaurantSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGetPaymentMode,
  useIsStoreOpen,
  useMenus,
  useRestaurants,
} from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import { getOrder as canisterGetOrder, getOrderStatus } from "@/lib/canister";
import { cn } from "@/lib/utils";
import { getVerifiedEmail } from "@/lib/verification-storage";
import {
  create as vpsCreate,
  getCustomer as vpsGetCustomer,
  quote as vpsQuote,
} from "@/lib/vps-client";
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
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MapPin,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatVndBigint(value: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value))}đ`;
}

const EMPTY_CUSTOMER: CustomerFormValues = {
  cusName: "",
  cusPhone: "",
  cusAddress: "",
  cusTaxCode: "",
  receiverEmail: "",
};

const QUOTE_DEBOUNCE_MS = 900;

// Hướng dẫn Grab Express — text chính xác, giữ nguyên xuống dòng.
const GRAB_EXPRESS_INSTRUCTIONS = `Bước tiếp theo: Đặt Grab Express để nhận hàng
1. Mở app Grab trên điện thoại
2. Chọn dịch vụ "GrabExpress"
3. Điểm đón: dán địa chỉ nhà hàng (đã copy ở trên)
4. Điểm đến: nhập địa chỉ nhận hàng của bạn
5. Khi tài xế liên hệ, cung cấp tên + số điện thoại đặt hàng của bạn để nhà hàng đối chiếu và giao hàng
Lưu ý: đây là bước bạn tự thực hiện trên app Grab của mình — Bunbohue65 không đặt tài xế hộ trong chế độ này.`;

export default function CreateOrder() {
  const navigate = useNavigate();
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const { actor } = useCanister();
  // paymentMode: 'customer' → luồng khách tự thanh toán; mọi giá trị khác
  // (kể cả đang loading hoặc 'driver') → giữ nguyên luồng gốc.
  const { data: paymentModeRaw } = useGetPaymentMode();
  const isCustomerMode = paymentModeRaw === "customer";
  // A1: trạng thái mở/đóng cửa hàng (toàn cục). data===false → cửa hàng đang
  // đóng → chặn CẢ hai luồng (driver + customer) và hiện màn hình chờ thay vì
  // cho phép chọn món.
  const { data: storeOpen } = useIsStoreOpen();
  const storeClosed = storeOpen === false;
  // Cổng chấp nhận chế độ khách tự thanh toán: mặc định false, chỉ chuyển true
  // khi khách bấm "Tôi hiểu và đồng ý" trong AlertDialog. Reset mỗi lần vào trang.
  const [customerModeAccepted, setCustomerModeAccepted] = useState(false);

  const [restaurantId, setRestaurantId] = useState<string>("");
  // Menu dùng chung cho toàn bộ chuỗi nhà hàng — hiện ngay từ đầu, không phụ thuộc
  // vào việc đã chọn nhà hàng hay chưa. Chỉ chặn ở bước THÊM MÓN (xem handleQuantityChange).
  const { data: menu, isLoading: menuLoading } = useMenus();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerFormValues>(EMPTY_CUSTOMER);
  const [touched, setTouched] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Gợi ý gọi thêm — hiện 1 lần khi khách thêm món đầu tiên vào giỏ.
  const [upsellItems, setUpsellItems] = useState<MenuItem[]>([]);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Trạng thái luồng khách tự thanh toán (customer mode) ----
  // paidOrder: đơn vừa tạo + đã lấy từ canister (có tingeeQrCode/amount).
  // qrPolling: còn true khi đang chờ khách quét QR thanh toán.
  // showPostPayment: true sau khi paid + 1.5s → ẩn QR, hiện khối hậu thanh toán.
  const [paidOrder, setPaidOrder] = useState<Order | null>(null);
  const [qrPolling, setQrPolling] = useState(true);
  const [showPostPayment, setShowPostPayment] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // A3: chống tạo đơn trùng. Sau khi đặt đơn thành công ở customer mode, đặt
  // orderPlaced=true → reset giỏ + khóa nút "Đặt đơn và Thanh toán" để không
  // bấm nhiều lần tạo đơn trùng.
  const [orderPlaced, setOrderPlaced] = useState(false);

  // A7: đếm ngược QR hết hạn (15 phút) + xử lý thanh toán không bao giờ paid.
  // qrExpiresAt = thời điểm hết hạn (ms). qrExpired = đã hết hạn → thông báo.
  // qrTimeout = đã quá 15 phút mà chưa paid → hiện tùy chọn hủy/thông báo.
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [, setQrExpired] = useState(false);
  const [qrTimeout, setQrTimeout] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const qrTimeoutNotifiedRef = useRef(false);

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
    ? validateCustomerForm(customer, { hideAddress: isCustomerMode })
    : {};
  function handleQuantityChange(itemId: string, delta: number) {
    // Chế độ khách tự thanh toán: chặn mọi thao tác thêm/bớt món (kể cả từ
    // giỏ hàng và gợi ý gọi thêm) cho đến khi khách xác nhận cảnh báo.
    if (isCustomerMode && !customerModeAccepted) {
      return;
    }
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
    setQuote(null);
    setQuoteError(null);

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
    if (field === "cusAddress") {
      setQuote(null);
      setQuoteError(null);
    }
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
    setQuote(null);
    setQuoteError(null);
    setUpsellItems([]);
  }

  const canRequestQuote = useCallback((): boolean => {
    return (
      !!restaurantId &&
      cartLines.length > 0 &&
      !!customer.cusAddress.trim() &&
      !!selectedRestaurant?.address
    );
  }, [
    restaurantId,
    cartLines.length,
    customer.cusAddress,
    selectedRestaurant?.address,
  ]);

  const runQuote = useCallback(async () => {
    if (!canRequestQuote() || quoteLoading) return;
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
    } finally {
      setQuoteLoading(false);
    }
  }, [
    canRequestQuote,
    quoteLoading,
    restaurantId,
    selectedRestaurant,
    customer.cusAddress,
    cartLines,
  ]);

  // Tự động tính phí ship: debounce sau khi địa chỉ/giỏ hàng thay đổi.
  // Không còn nút "Lấy phí ship" thủ công — khách chỉ cần điền địa chỉ.
  // CHỈ chạy ở luồng driver. Luồng customer bỏ qua hoàn toàn (không /quote).
  useEffect(() => {
    if (isCustomerMode) return;
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    if (
      !restaurantId ||
      !customer.cusAddress.trim() ||
      cartLines.length === 0 ||
      !selectedRestaurant?.address
    ) {
      return;
    }
    quoteDebounceRef.current = setTimeout(() => {
      runQuote();
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [
    isCustomerMode,
    customer.cusAddress,
    restaurantId,
    cartLines.length,
    selectedRestaurant?.address,
    runQuote,
  ]);

  // ---- Poll getOrderStatus 5s cho đơn ở luồng customer (giống QRDisplay.tsx) ----
  // Khi paymentStatus === 'paid': tắt polling, đợi 1.5s (giữ trạng thái thành công
  // cho khách thấy) rồi ẩn QR + hiện khối hậu thanh toán. Cơ chế 1.5s được nhân
  // bản inline ở đây theo yêu cầu — không sửa QRDisplay.tsx.
  // A8: khi poll lỗi → hiện toast thay vì nuốt im lặng.
  // A7: nếu quá 15 phút mà chưa paid → tắt polling + hiện tùy chọn hủy/thông báo.
  useEffect(() => {
    if (!actor || !paidOrder || !qrPolling) return;
    let cancelled = false;

    async function check() {
      if (!actor || !paidOrder || cancelled) return;
      try {
        const s = await getOrderStatus(actor, paidOrder.orderId);
        if (cancelled) return;
        if (s.paymentStatus === PaymentStatus.paid) {
          setQrPolling(false);
          setTimeout(() => {
            if (!cancelled) setShowPostPayment(true);
          }, 1500);
        }
      } catch (err) {
        // A8: hiện thông báo thay vì nuốt im lặng — khách biết đang có lỗi
        // kiểm tra trạng thái và sẽ thử lại ở lần sau.
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Không kiểm tra được trạng thái thanh toán.";
        toast.error("Lỗi kiểm tra thanh toán", { description: msg });
      }
    }

    void check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [actor, paidOrder, qrPolling]);

  // ---- A7: đếm ngược QR hết hạn (15 phút) + xử lý thanh toán không bao giờ paid ----
  // Cập nhật `now` mỗi giây để render đếm ngược. Khi hết 15 phút mà chưa paid:
  //   - qrExpired=true → thông báo QR đã hết hạn (1 lần).
  //   - qrTimeout=true → tắt polling + hiện tùy chọn hủy/thông báo thay vì treo.
  useEffect(() => {
    if (!paidOrder || showPostPayment) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paidOrder, showPostPayment]);

  useEffect(() => {
    if (!paidOrder || !qrExpiresAt || showPostPayment) return;
    if (now >= qrExpiresAt) {
      setQrExpired(true);
      if (!qrTimeoutNotifiedRef.current) {
        qrTimeoutNotifiedRef.current = true;
        setQrPolling(false);
        setQrTimeout(true);
        toast.error("QR thanh toán đã hết hạn", {
          description:
            "Đơn chưa được thanh toán trong 15 phút. Bạn có thể hủy đơn hoặc liên hệ nhà hàng để được hỗ trợ.",
        });
      }
    }
  }, [now, qrExpiresAt, paidOrder, showPostPayment]);

  async function handleSubmit() {
    setTouched(true);
    const errs = validateCustomerForm(customer, {
      hideAddress: isCustomerMode,
    });
    if (Object.keys(errs).length > 0) {
      toast.error("Vui lòng kiểm tra thông tin khách hàng.");
      return;
    }
    if (!restaurantId || cartLines.length === 0) {
      toast.error("Vui lòng chọn nhà hàng và ít nhất một món.");
      return;
    }
    // Luồng driver cần quote trước khi đặt. Luồng customer bỏ qua (không phí ship).
    if (!isCustomerMode && !quote) {
      toast.error("Đang chờ tính phí ship, vui lòng đợi trong giây lát.");
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
        items: cartLines.map((l) => ({
          itemId: l.item.itemId,
          name: l.item.name,
          quantity: l.quantity,
          price: Number(l.item.price),
          vatRate: Number(l.item.vatRate),
          unitName: l.item.unitName,
        })),
        // Luồng customer: không có phí ship (VPS sẽ branch trên paymentMode).
        shippingFee: isCustomerMode ? 0 : quote!.shippingFee,
        ahamoveOrderId: isCustomerMode ? "" : quote!.ahamoveOrderId,
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

      if (isCustomerMode) {
        // A3: đánh dấu đã đặt đơn để khóa nút "Đặt đơn và Thanh toán" ngay lập
        // tức, chống bấm nhiều lần tạo đơn trùng. Đồng thời reset giỏ hàng để
        // không còn món nào có thể bấm đặt lại.
        setOrderPlaced(true);
        setCart({});
        // Lấy đơn từ canister để có tingeeQrCode + amount (VPS vừa tạo QR Tingee).
        if (!actor) {
          toast.error("Không kết nối được canister để tải QR thanh toán.");
          return;
        }
        try {
          // A5: nếu VPS báo pendingSync (push canister thất bại, đơn đang ở
          // retry queue) → chờ đồng bộ: poll canisterGetOrder cho đến khi lấy
          // được đơn thay vì hiện "Không tải được QR" ngay.
          let order: Order | null = null;
          if (res.pendingSync) {
            toast.info("Đang đồng bộ đơn hàng…", {
              description:
                "Hệ thống đang đồng bộ đơn với máy chủ. Vui lòng đợi trong giây lát.",
            });
            const syncDeadline = Date.now() + 30_000;
            while (Date.now() < syncDeadline) {
              try {
                order = await canisterGetOrder(actor, res.orderId);
                break;
              } catch {
                // Chưa sync xong — đợi 2s rồi thử lại.
                await new Promise((r) => setTimeout(r, 2000));
              }
            }
            if (!order) {
              throw new Error(
                "Đơn chưa đồng bộ xong với máy chủ. Vui lòng thử lại sau.",
              );
            }
          } else {
            order = await canisterGetOrder(actor, res.orderId);
          }
          setPaidOrder(order);
          setQrPolling(true);
          setShowPostPayment(false);
          // A7: mốc hết hạn QR = createdAt (ns) + 15 phút.
          setQrExpiresAt(Number(order.createdAt) / 1_000_000 + 15 * 60 * 1000);
          setQrExpired(false);
          setQrTimeout(false);
          qrTimeoutNotifiedRef.current = false;
          setNow(Date.now());
          toast.success("Đặt đơn thành công!", {
            description: "Vui lòng quét QR để thanh toán.",
          });
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Không tải được QR thanh toán.";
          toast.error("Không tải được QR thanh toán", { description: msg });
        }
        // Giỏ đã reset ở trên; giữ lại để khách thấy QR ngay trên cùng trang.
        // KHÔNG navigate — ở lại trang hiện tại.
      } else {
        toast.success("Đặt đơn thành công!", {
          description: `Mã đơn: ${res.orderId}`,
        });
        setCart({});
        setCustomer(EMPTY_CUSTOMER);
        setQuote(null);
        setTouched(false);
        setCartOpen(false);
        navigate({ to: "/track/$orderId", params: { orderId: res.orderId } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đặt đơn thất bại.";
      toast.error("Đặt đơn thất bại", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // Copy ảnh QR (PNG) vào clipboard — fallback tải file cho trình duyệt cũ.
  async function handleCopyQrPng() {
    const canvas = qrCanvasRef.current;
    if (!canvas) {
      toast.error("QR chưa sẵn sàng để copy.");
      return;
    }
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) {
        throw new Error("Không tạo được ảnh PNG từ QR.");
      }
      // Clipboard API với ClipboardItem (Chrome/Edge/Safari hiện đại).
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.success("Đã copy ảnh QR vào clipboard.");
        return;
      }
      // Fallback: tải file PNG về máy.
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "qr-thanh-toan.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(
        "Trình duyệt không hỗ trợ copy ảnh — đã tải file qr-thanh-toan.png.",
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Không copy được ảnh QR.";
      toast.error("Copy ảnh QR thất bại", { description: msg });
    }
  }

  // Copy địa chỉ nhà hàng (text) vào clipboard.
  async function handleCopyRestaurantAddress() {
    const addr = selectedRestaurant?.address ?? paidOrder?.cusAddress ?? "";
    if (!addr) {
      toast.error("Không có địa chỉ nhà hàng để copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(addr);
      toast.success("Đã copy địa chỉ nhà hàng.");
    } catch {
      // Fallback: chọn + copy qua execCommand cho trình duyệt cũ.
      try {
        const ta = document.createElement("textarea");
        ta.value = addr;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success("Đã copy địa chỉ nhà hàng.");
      } catch {
        toast.error("Không copy được địa chỉ.");
      }
    }
  }

  const totalAmount = quote?.amount ?? itemsTotal;
  // shippingFee = 0 ở customer mode nên thực tế = order.amount.
  const qrPayAmount = paidOrder ? paidOrder.amount - paidOrder.shippingFee : 0n;
  const restaurantAddressForPost =
    selectedRestaurant?.address ?? paidOrder?.cusAddress ?? "";

  // A7: đếm ngược QR hết hạn (15 phút). remainingMs = thời gian còn lại.
  const remainingMs = qrExpiresAt ? Math.max(0, qrExpiresAt - now) : 0;
  const remainingSec = Math.floor(remainingMs / 1000);
  const countdownText = `${String(Math.floor(remainingSec / 60)).padStart(
    2,
    "0",
  )}:${String(remainingSec % 60).padStart(2, "0")}`;

  // A7: khách xác nhận đã biết QR hết hạn / thanh toán không thành công.
  // Đóng khối thông báo timeout, giữ QR để khách có thể thử lại hoặc copy.
  function handleQrTimeoutDismiss() {
    setQrTimeout(false);
    setQrExpired(false);
  }

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
            {isCustomerMode
              ? "Chọn nhà hàng, chọn món, nhập tên + SĐT — thanh toán QR rồi tự đặt Grab Express nhận hàng."
              : "Chọn nhà hàng, chọn món, nhập thông tin khách — phí ship sẽ tự động tính khi bạn điền địa chỉ."}
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
                  {isCustomerMode && !customerModeAccepted ? (
                    // Cổng chấp nhận: thay menu bằng cảnh báo bắt buộc. Khách phải
                    // bấm "Tôi hiểu và đồng ý" mỗi lần vào trang trước khi chọn món.
                    <AlertDialog
                      open={isCustomerMode && !customerModeAccepted}
                      onOpenChange={() => {
                        // Không cho đóng bằng Escape/click nền — chấp nhận chỉ được
                        // cấp khi bấm nút "Tôi hiểu và đồng ý" bên dưới.
                      }}
                    >
                      <AlertDialogContent data-ocid="create_order.customer_accept_dialog">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Xác nhận chế độ tự thanh toán
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Bạn đang ở chế độ tự thanh toán: quý khách tự quét
                            QR thanh toán và tự đặt Grab Express nhận hàng. Phí
                            ship do quý khách tự chịu.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogAction
                            onClick={() => setCustomerModeAccepted(true)}
                            data-ocid="create_order.customer_accept_button"
                          >
                            Tôi hiểu và đồng ý
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <MenuPicker
                      menu={menu}
                      isLoading={menuLoading}
                      cart={cart}
                      onQuantityChange={handleQuantityChange}
                      disabled={submitting}
                      fixedCategory="Món chính"
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Gợi ý gọi thêm */}
            {upsellItems.length > 0 &&
              (!isCustomerMode || customerModeAccepted) && (
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
            {itemCount > 0 &&
              !paidOrder &&
              (!isCustomerMode || customerModeAccepted) && (
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
                    {cartLines.map((l) => (
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
                      </li>
                    ))}
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
                      hideAddress={isCustomerMode}
                    />
                  </div>

                  {/* Trạng thái phí ship — tự động, không có nút bấm.
                  CHỈ hiện ở luồng driver. Luồng customer bỏ qua hoàn toàn. */}
                  {!isCustomerMode && (
                    <div
                      className="rounded-lg border border-dashed border-border bg-card p-3"
                      data-ocid="create_order.quote_panel"
                    >
                      {quoteLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          Đang tính phí ship…
                        </div>
                      ) : quoteError ? (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">{quoteError}</span>
                          <button
                            type="button"
                            className="shrink-0 underline"
                            onClick={() => runQuote()}
                          >
                            Thử lại
                          </button>
                        </div>
                      ) : quote ? (
                        <div className="flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              Tạm tính (đã gồm VAT)
                            </span>
                            <span className="font-mono font-medium">
                              {formatVnd(itemsTotal)}
                            </span>
                          </div>
                          {quote.packagingQty > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Package
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                {quote.packagingItemName ||
                                  "Dụng cụ đựng đồ ăn"}{" "}
                                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Bắt buộc
                                </span>
                              </span>
                              <span className="font-mono font-medium">
                                {formatVnd(quote.packagingFee)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Truck
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Phí ship
                            </span>
                            <span className="font-mono font-medium">
                              {formatVnd(quote.shippingFee)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Nhập địa chỉ giao hàng ở trên — phí ship sẽ tự động
                          hiện ở đây.
                        </p>
                      )}
                    </div>
                  )}

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
                        orderPlaced ||
                        cartLines.length === 0 ||
                        (!isCustomerMode && !quote) ||
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
                      ) : isCustomerMode ? (
                        <>
                          <ShoppingCart
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Đặt đơn và Thanh toán · {formatVnd(totalAmount)}
                        </>
                      ) : !quote ? (
                        "Đang chờ tính phí ship…"
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

            {/* ---- Khối QR thanh toán inline (luồng customer) ----
            Hiện sau khi vpsCreate thành công + lấy được order từ canister.
            Ẩn khi showPostPayment=true (đã paid + 1.5s). */}
            {paidOrder && !showPostPayment && (
              <div
                className="mt-6 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-6 shadow-elevated"
                data-ocid="create_order.qr_card"
              >
                <div className="text-center">
                  <h2
                    className="font-display text-xl font-bold text-foreground"
                    data-ocid="create_order.qr_title"
                  >
                    Quét QR để thanh toán
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Số tiền thanh toán
                  </p>
                  <p
                    className="font-display text-3xl font-bold tracking-tight text-[oklch(var(--bbh-gold))]"
                    data-ocid="create_order.qr_amount"
                  >
                    {formatVndBigint(qrPayAmount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tiền hàng — phí ship = 0 ở chế độ khách tự thanh toán
                  </p>
                </div>

                {/* A7: đếm ngược QR hết hạn (15 phút) — cập nhật mỗi giây */}
                {!qrTimeout && (
                  <div
                    className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground"
                    data-ocid="create_order.qr_countdown"
                    role="timer"
                    aria-live="polite"
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    QR hết hạn sau {countdownText}
                  </div>
                )}

                {/* A7: thanh toán không bao giờ paid (quá 15 phút) → cảnh báo + hủy */}
                {qrTimeout && (
                  <div
                    className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
                    data-ocid="create_order.qr_timeout_warning"
                    role="alert"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-destructive">
                          QR thanh toán đã hết hạn
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Đơn chưa được thanh toán trong 15 phút nên mã QR không
                          còn hiệu lực. Bạn có thể hủy đơn hoặc liên hệ nhà hàng
                          để được hỗ trợ.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-[44px] w-full"
                      onClick={handleQrTimeoutDismiss}
                      data-ocid="create_order.qr_timeout_dismiss_button"
                    >
                      Đã hiểu
                    </Button>
                  </div>
                )}

                {paidOrder.tingeeQrCode ? (
                  <div
                    className="rounded-xl bg-foreground p-4 md:p-6"
                    data-ocid="create_order.qr_canvas"
                  >
                    <QRCodeCanvas
                      // qrcode.react v4: ref trỏ thẳng tới <canvas> (RefAttributes<HTMLCanvasElement>).
                      // Dùng để copy PNG.
                      ref={(node) => {
                        qrCanvasRef.current = node;
                      }}
                      value={paidOrder.tingeeQrCode}
                      size={256}
                      level="M"
                      includeMargin={false}
                      bgColor="#000000"
                      fgColor="#ffffff"
                      aria-label="Mã QR thanh toán Tingee"
                    />
                  </div>
                ) : (
                  <div
                    className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl bg-secondary p-4 text-center"
                    data-ocid="create_order.qr_not_ready"
                    role="alert"
                  >
                    <Loader2
                      className="h-6 w-6 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      Mã QR đang được tạo. Vui lòng đợi trong giây lát…
                    </p>
                  </div>
                )}

                <div className="flex w-full max-w-sm flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={handleCopyQrPng}
                    disabled={!paidOrder.tingeeQrCode}
                    data-ocid="create_order.copy_qr_png_button"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy ảnh QR
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự đóng khi nhận
                    được xác nhận thanh toán.
                  </p>
                </div>
              </div>
            )}

            {/* ---- Khối hậu thanh toán (luồng customer, sau khi paid + 1.5s) ---- */}
            {showPostPayment && paidOrder && (
              <div
                className="mt-6 flex flex-col gap-4"
                data-ocid="create_order.post_payment"
              >
                <div
                  className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/15 px-4 py-3 text-success"
                  data-ocid="create_order.paid_banner"
                >
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  <h2 className="font-display text-lg font-bold">
                    Đơn đã thanh toán
                  </h2>
                </div>

                {/* Địa chỉ nhà hàng + nút sao chép */}
                <div
                  className="rounded-xl border border-border bg-card p-4"
                  data-ocid="create_order.restaurant_address_card"
                >
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Địa chỉ nhà hàng
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {restaurantAddressForPost || "Không có địa chỉ nhà hàng."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={handleCopyRestaurantAddress}
                    disabled={!restaurantAddressForPost}
                    data-ocid="create_order.copy_address_button"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Sao chép
                  </Button>
                </div>

                {/* Hướng dẫn Grab Express — text chính xác, giữ nguyên xuống dòng */}
                <div
                  className="rounded-xl border border-border bg-secondary/40 p-4"
                  data-ocid="create_order.grab_instructions"
                >
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Truck className="h-4 w-4" aria-hidden="true" />
                    Hướng dẫn đặt Grab Express
                  </h3>
                  <pre
                    className="whitespace-pre-wrap font-body text-sm leading-relaxed text-foreground"
                    data-ocid="create_order.grab_instructions_text"
                  >
                    {GRAB_EXPRESS_INSTRUCTIONS}
                  </pre>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  Đơn hàng đã lưu vào "Theo dõi đơn" — bạn có thể xem lại ở
                  menu.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
