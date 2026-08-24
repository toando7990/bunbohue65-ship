// OrderHistory — tra cứu lịch sử đơn hàng theo email đã xác thực. Đây là nơi
// DUY NHẤT trong app yêu cầu xác thực OTP (chuyển từ CreateOrder.tsx sang
// đây — đặt món giờ không cần xác thực gì nữa, xem CreateOrder.tsx). Khách
// muốn tra cứu lại lịch sử thì mới cần chứng minh kiểm soát email qua OTP,
// tránh việc gõ email người khác vào cũng xem được lịch sử đơn của họ.
//
// Nguồn dữ liệu: VPS GET /orders/history?email= — trả đơn TRƯỚC ngày hôm
// nay, sắp mới nhất lên đầu. KHÔNG dùng canister getOrdersByEmail() vì
// canister chủ động xoá đơn từ ngày hôm trước trở về trước mỗi lần đọc/ghi
// (pruneOldOrders, xem lib/core.mo) — canister chỉ giữ đơn TRONG NGÀY. Đơn
// trong ngày hôm nay xem ở "Theo dõi đơn" (/track, canister qua
// localStorage) — 2 tab không trùng dữ liệu, không có khoảng trống.
//
// VPS không trả pickupCode/cusAddress/cusTaxCode cho endpoint này (tối giản
// PII) — OrderCard được truyền hidePickupCode + disableDetailLink vì mã
// nhận hàng của đơn cũ đã hết hạn và /track/:orderId cũng không tra được
// đơn đã bị canister xoá.

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { OrderCard } from "@/components/OrderCard";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { getOrderHistory } from "@/lib/vps-client";
import type {
  BookingStatus,
  Order,
  PaymentStatus,
  VpsHistoryOrder,
} from "@/types";
import { InvoiceStatus } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, ShieldCheck } from "lucide-react";
import { useState } from "react";

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

// VPS trả dữ liệu tối giản (number/string thuần) — chuyển sang shape Order
// mà OrderCard cần (bigint, enum). Các field canister-only không có ở VPS
// (pickupCode, cusAddress, cusTaxCode, receiverEmail, qrCode, billId...) đặt
// giá trị rỗng/mặc định — OrderCard không hiển thị chúng khi hidePickupCode/
// disableDetailLink=true.
function toOrder(h: VpsHistoryOrder): Order {
  const createdAtNs = BigInt(h.createdAt) * 1_000_000n;
  return {
    orderId: h.orderId,
    restaurantId: h.restaurantId,
    cusName: h.cusName,
    cusPhone: h.cusPhone,
    cusAddress: "",
    cusTaxCode: "",
    receiverEmail: "",
    pickupCode: "",
    items: h.items.map((it) => ({
      itemId: it.itemId,
      name: it.name,
      price: BigInt(it.price),
      quantity: BigInt(it.quantity),
      unitName: it.unitName,
      vatRate: 0n,
    })),
    amount: BigInt(h.amount),
    goodsAmount: BigInt(h.amount),
    shippingFee: 0n,
    taxTotal: 0n,
    bookingStatus: h.bookingStatus as BookingStatus,
    paymentStatus: h.paymentStatus as PaymentStatus,
    invoiceStatus: InvoiceStatus.none,
    ahamoveOrderId: "",
    tingeeQrId: "",
    sharedLink: "",
    tingeeQrCode: "",
    invoiceId: "",
    pdfUrl: "",
    createdAt: createdAtNs,
    updatedAt: createdAtNs,
  };
}

export default function OrderHistory() {
  // State (không chỉ đọc 1 lần) vì việc xác thực giờ có thể xảy ra NGAY
  // TRÊN trang này — cần re-render lại khi khách vừa xác thực xong.
  const [searchedEmail, setSearchedEmail] = useState<string | null>(() => {
    const verified = getVerifiedEmail();
    return verified ? normalizeEmail(verified.email) : null;
  });
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["orderHistory", searchedEmail],
    queryFn: () =>
      searchedEmail ? getOrderHistory(searchedEmail) : Promise.resolve([]),
    enabled: !!searchedEmail,
    // Danh sách lịch sử ít khi đổi trong 1 phiên xem — không cần refetch lại
    // mỗi khi quay lại tab trình duyệt. Tắt để giảm khả năng gặp lỗi mạng
    // thoáng qua ngay sau khi danh sách đã tải thành công.
    refetchOnWindowFocus: false,
  });

  const results = (data ?? []).map(toOrder);
  // QUAN TRỌNG: kiểm tra results.length TRƯỚC isError. React Query giữ lại
  // `data` của lần tải thành công gần nhất kể cả khi 1 lần refetch nền sau
  // đó bị lỗi (isError=true nhưng data vẫn còn) — nếu ưu tiên isError trước,
  // danh sách đã hiện đúng sẽ bị thay bằng "Không tải được đơn hàng" chỉ vì
  // 1 lần refetch nền chập chờn, dù dữ liệu đã có sẵn không cần vứt bỏ.

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
      data-ocid="order_history.page"
    >
      <header className="mb-6">
        <h1
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight md:text-3xl"
          data-ocid="order_history.title"
        >
          <History className="h-6 w-6 text-primary" aria-hidden="true" />
          Lịch sử đặt đơn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {searchedEmail
            ? `Các đơn hàng trước hôm nay đã đặt bằng email ${searchedEmail}. Đơn hôm nay xem ở "Theo dõi đơn".`
            : "Xác thực email để tra cứu lại các đơn hàng trước hôm nay đã đặt bằng email đó."}
        </p>
      </header>

      {!searchedEmail ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.no_verified_email_state"
        >
          <ShieldCheck
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Xác thực email để xem lịch sử đặt đơn
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Nhập và xác thực email đã dùng lúc đặt món (mã OTP gửi qua email) để
            tra cứu lại các đơn hàng trước hôm nay.
          </p>
          <button
            type="button"
            onClick={() => setVerifyDialogOpen(true)}
            data-ocid="order_history.verify_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Xác thực email
          </button>
        </div>
      ) : results.length > 0 ? (
        <>
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-ocid="order_history.count"
          >
            {results.length} đơn hàng
          </p>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-ocid="order_history.grid"
          >
            {results.map((order, i) => (
              <OrderCard
                key={order.orderId}
                order={order}
                index={i + 1}
                hidePickupCode
                disableDetailLink
              />
            ))}
          </div>
        </>
      ) : isError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="order_history.error_state"
          role="alert"
        >
          <p className="font-medium text-destructive">
            Không tải được đơn hàng
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="order_history.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      ) : !isLoading ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_history.empty_state"
        >
          <History
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Chưa có đơn hàng nào trước hôm nay
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Đơn hàng bạn đặt hôm nay xem ở "Theo dõi đơn". Đơn của những ngày
            trước sẽ xuất hiện tại đây.
          </p>
        </div>
      ) : null}

      <EmailVerificationDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        onVerified={(email) => {
          setVerifyDialogOpen(false);
          setSearchedEmail(normalizeEmail(email));
        }}
      />
    </section>
  );
}
