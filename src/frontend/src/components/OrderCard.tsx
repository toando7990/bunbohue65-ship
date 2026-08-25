// OrderCard — card tóm tắt đơn hàng: orderId, cusName, amount, status badges.
// Mobile-first, dùng trong OrderList. Phần nội dung bấm được nằm trong <Link>
// đến /track/:orderId; footer chứa <QrPayment> (nút "Thanh toán" / QR / badge).
// Card là <div> bọc ngoài để tránh thẻ tương tác lồng nhau (Link chứa button).

import { StatusBadge } from "@/components/StatusBadge";
import { useDevicesByRestaurant, useRestaurants } from "@/hooks/useQueries";
import { PaymentStatus } from "@/types";
import type {
  BookingStatus,
  Order,
  PaymentStatus as PaymentStatusType,
} from "@/types";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  MapPin,
  Phone,
  Receipt,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Định dạng số tiền VND từ bigint (đơn vị đồng).
function formatVnd(amount: bigint): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

// Định dạng đơn giá mỗi món (đồng / đơn vị).
function formatUnitPrice(price: bigint, unitName: string): string {
  const base = formatVnd(price);
  return unitName ? `${base}/${unitName}` : base;
}

// Rút gọn orderId để hiển thị (giữ 8 ký tự đầu + 4 cuối).
function shortOrderId(orderId: string): string {
  if (orderId.length <= 16) return orderId;
  return `${orderId.slice(0, 8)}…${orderId.slice(-4)}`;
}

// Nút copy nhỏ — sao chép giá trị vào clipboard để dán vào app ngoài.
function CopyButton({
  value,
  label,
  ocid,
}: {
  value: string;
  label: string;
  ocid: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Đã sao chép ${label}.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không sao chép được. Vui lòng sao chép thủ công.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-ocid={ocid}
      aria-label={`Sao chép ${label}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

export interface OrderCardProps {
  order: Order;
  /** Index trong list (1-based) cho deterministic marker. */
  index: number;
  /**
   * Khi true: ẩn khối "Mã nhận hàng" dù đơn chưa thanh toán. Dùng cho danh
   * sách lịch sử (đơn trước ngày hôm nay) — mã đã hết hạn, không còn ý nghĩa.
   */
  hidePickupCode?: boolean;
  /**
   * Khi true: bỏ liên kết "Xem chi tiết" tới /track/:orderId — thẻ vẫn hiển
   * thị đầy đủ nhưng không bấm được. Dùng cho lịch sử vì canister đã xoá đơn
   * cũ (pruneOldOrders), /track/:orderId sẽ báo không tìm thấy nếu bấm vào.
   */
  disableDetailLink?: boolean;
  /**
   * Khi true: bỏ 2 khối riêng "Địa chỉ nhà hàng"/"SĐT liên hệ" (chiếm nhiều
   * chỗ), thay bằng hiển thị gọn — địa chỉ nằm dưới mã đơn (chữ nhỏ), SĐT
   * liên hệ nằm bên phải cùng hàng với tên khách. Dùng cho "Lịch sử đơn
   * hàng" trên /driver — danh sách dài, cần gọn để xem nhiều đơn cùng lúc.
   */
  compactRestaurantInfo?: boolean;
}

export function OrderCard({
  order,
  index,
  hidePickupCode,
  disableDetailLink,
  compactRestaurantInfo,
}: OrderCardProps) {
  // Tra cứu địa chỉ nhà hàng theo restaurantId để hiển thị + copy.
  const { data: restaurants } = useRestaurants();
  const restaurant = restaurants?.find(
    (r) => r.restaurantId === order.restaurantId,
  );
  const restaurantAddress = restaurant?.address ?? "";

  // SĐT liên hệ cho khách — ưu tiên SĐT nhân viên của thiết bị kích hoạt
  // GẦN NHẤT tại nhà hàng này (nhân viên đang trực thực tế), vì 1 nhà hàng
  // có thể có nhiều thiết bị active cùng lúc. Nếu nhà hàng chưa có thiết bị
  // nào active (hoặc thiết bị active chưa nhập SĐT — thiết bị cũ trước khi
  // có tính năng này), fallback về Restaurant.phone (số chung của quán, đã
  // có sẵn từ trước, luôn có giá trị).
  const { data: devices } = useDevicesByRestaurant(order.restaurantId);
  const latestActiveDevice = devices
    ?.filter((d) => d.active && d.phone)
    .sort((a, b) => Number(b.activatedAt - a.activatedAt))[0];
  const contactPhone = latestActiveDevice?.phone || restaurant?.phone || "";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Receipt
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={order.orderId}
            >
              {shortOrderId(order.orderId)}
            </span>
          </div>
          {compactRestaurantInfo && restaurantAddress && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{restaurantAddress}</span>
            </p>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate font-display text-base font-semibold text-foreground">
              {order.cusName || "Khách vãng lai"}
            </h3>
            {compactRestaurantInfo && contactPhone && (
              <span className="shrink-0 text-sm text-muted-foreground">
                {contactPhone}
              </span>
            )}
          </div>
          {order.cusPhone && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {order.cusPhone}
            </p>
          )}
        </div>
        <div className="flex items-start gap-1.5">
          <div className="text-right">
            <p className="font-display text-base font-semibold text-foreground">
              {formatVnd(order.amount)}
            </p>
            <p className="text-xs text-muted-foreground">Tổng cộng</p>
          </div>
          <CopyButton
            value={formatVnd(order.amount)}
            label="tổng tiền"
            ocid={`order.card.${index}.copy_amount_button`}
          />
        </div>
      </div>

      {/* Địa chỉ nhà hàng — copy để dán vào app ngoài. Ẩn khi
          compactRestaurantInfo (đã hiện gọn dưới mã đơn ở trên). */}
      {!compactRestaurantInfo && restaurantAddress && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
          <MapPin
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {restaurantAddress}
          </span>
          <CopyButton
            value={restaurantAddress}
            label="địa chỉ nhà hàng"
            ocid={`order.card.${index}.copy_address_button`}
          />
        </div>
      )}

      {/* SĐT liên hệ — ưu tiên nhân viên đang trực (thiết bị active gần
          nhất), fallback SĐT chung của quán nếu chưa có thiết bị nào. Ẩn khi
          compactRestaurantInfo (đã hiện gọn cùng hàng tên khách ở trên). */}
      {!compactRestaurantInfo && contactPhone && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
          <Phone
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {contactPhone}
          </span>
          <CopyButton
            value={contactPhone}
            label="số điện thoại liên hệ"
            ocid={`order.card.${index}.copy_phone_button`}
          />
        </div>
      )}

      {/* Mã nhận hàng — khách tự báo cho tài xế (gọi điện, nhắn tin...),
          tài xế đọc lại cho nhân viên quán khi đến lấy hàng để xác nhận
          thanh toán. Chỉ hiện khi đơn còn cần thanh toán — hết tác dụng
          sau khi đã #paid nên ẩn đi cho gọn. Luôn ẩn khi hidePickupCode
          (danh sách lịch sử — mã của đơn cũ chắc chắn đã hết hạn). */}
      {!hidePickupCode &&
        order.pickupCode &&
        order.paymentStatus !== PaymentStatus.paid && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
            <KeyRound
              className="h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground">
                Mã nhận hàng — báo tài xế khi đến lấy hàng
              </p>
              <p
                className="font-mono text-base font-bold tracking-[0.2em] text-foreground"
                data-ocid={`order.card.${index}.pickup_code`}
              >
                {order.pickupCode}
              </p>
            </div>
            <CopyButton
              value={order.pickupCode}
              label="mã nhận hàng"
              ocid={`order.card.${index}.copy_pickup_code_button`}
            />
          </div>
        )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={order.bookingStatus as BookingStatus} />
        <StatusBadge status={order.paymentStatus as PaymentStatusType} />
      </div>

      <ul className="mt-3 divide-y divide-border border-t border-border">
        {order.items.map((item, i) => (
          <li
            key={item.itemId || i}
            data-ocid={`order.card.${index}.item.${i + 1}`}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              {item.name}
              <span className="ml-1.5 text-muted-foreground">
                × {Number(item.quantity)}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {formatUnitPrice(item.price, item.unitName)}
            </span>
          </li>
        ))}
      </ul>

      {!disableDetailLink && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {order.items.length} mặt hàng
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-smooth group-hover:gap-2">
            Xem chi tiết
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      )}
      {disableDetailLink && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {order.items.length} mặt hàng
        </p>
      )}
    </>
  );

  return (
    <div
      data-ocid={`order.card.${index}`}
      className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-smooth hover:border-primary/40 hover:shadow-md"
    >
      {disableDetailLink ? (
        <div className="block">{content}</div>
      ) : (
        <Link
          to="/track/$orderId"
          params={{ orderId: order.orderId }}
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {content}
        </Link>
      )}
    </div>
  );
}
