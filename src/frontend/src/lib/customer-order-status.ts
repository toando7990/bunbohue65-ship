// Trạng thái đơn hiển thị cho KHÁCH (Theo dõi / Lịch sử) — gộp trạng thái
// đơn (canister) + lượt giao hàng Lalamove/Ahamove (VPS) thành 1 nhãn duy
// nhất dễ hiểu, thay cho 2 nhãn rời "Chờ xác nhận" + "Chưa thanh toán".

import type { DeliveryInfo } from "@/lib/vps-client";
import type { Order } from "@/types";
import { BookingStatus } from "@/types";

export type StatusTone =
  | "warning"
  | "info"
  | "success"
  | "destructive"
  | "muted";

export interface CustomerStatus {
  label: string;
  tone: StatusTone;
  /** Thanh 4 bước Đã đặt → Có tài xế → Lấy món → Đã giao: số bước đã xong. */
  done: number;
  /** Bước đang diễn ra (0-3), -1 = không có (đã xong / đã huỷ). */
  current: number;
  /** Khách cần bấm "Đặt tài xế" / "Huỷ đơn". */
  needsAction: boolean;
  /** Đơn đã kết thúc (giao xong / hoàn thành / huỷ) — hiển thị mờ, xếp cuối. */
  finished: boolean;
}

export function customerStatus(
  order: Pick<Order, "bookingStatus" | "paymentStatus">,
  delivery?: DeliveryInfo | null,
): CustomerStatus {
  const bs = order.bookingStatus as BookingStatus;
  if (bs === BookingStatus.cancelled) {
    return {
      label: "Đã huỷ",
      tone: "destructive",
      done: 0,
      current: -1,
      needsAction: false,
      finished: true,
    };
  }
  if (bs === BookingStatus.pending) {
    return {
      label: "Chờ bạn đặt tài xế",
      tone: "warning",
      done: 0,
      current: 0,
      needsAction: true,
      finished: false,
    };
  }
  if (delivery && !delivery.allFailed) {
    switch (delivery.status) {
      case "finding":
        return {
          label: "Đang tìm tài xế",
          tone: "info",
          done: 1,
          current: 1,
          needsAction: false,
          finished: false,
        };
      case "to_pickup":
      case "at_pickup":
        return {
          label: delivery.statusLabel || "Tài xế đang đến quán",
          tone: "info",
          done: 2,
          current: 2,
          needsAction: false,
          finished: false,
        };
      case "delivering":
      case "near_drop":
        return {
          label: delivery.statusLabel || "Đang giao đến bạn",
          tone: "info",
          done: 3,
          current: 3,
          needsAction: false,
          finished: false,
        };
      case "delivered":
        return {
          label: "Đã giao",
          tone: "success",
          done: 4,
          current: -1,
          needsAction: false,
          finished: true,
        };
      default:
        break;
    }
  }
  if (bs === BookingStatus.completed) {
    return {
      label: "Hoàn thành",
      tone: "success",
      done: 4,
      current: -1,
      needsAction: false,
      finished: true,
    };
  }
  if (bs === BookingStatus.pickedUp || bs === BookingStatus.shipping) {
    return {
      label: "Tài xế đã nhận món",
      tone: "info",
      done: 3,
      current: 3,
      needsAction: false,
      finished: false,
    };
  }
  return {
    label: "Đang chờ tài xế",
    tone: "info",
    done: 1,
    current: 1,
    needsAction: false,
    finished: false,
  };
}

export const TONE_CLASS: Record<StatusTone, string> = {
  warning: "bg-warning/15 text-[oklch(0.5_0.14_60)]",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

/** "2× Bún bò Huế đặc biệt, 1× Chả cua" — bỏ dòng dụng cụ tự động. */
export function itemsSummary(items: Order["items"]): string {
  return items
    .filter((i) => i.name !== "Dụng cụ đựng đồ ăn")
    .map((i) => `${Number(i.quantity)}× ${i.name}`)
    .join(", ");
}

export function formatClockNs(ns: bigint): string {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(
    new Date(Number(ns / 1_000_000n)),
  );
}

/** Nhãn ngày nhóm đơn lịch sử: "Hôm nay", "Hôm qua", hoặc "dd/mm". */
export function dayLabel(ns: bigint, now = Date.now()): string {
  const d = new Date(Number(ns / 1_000_000n));
  const key = (x: Date) =>
    new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(x);
  const today = key(new Date(now));
  const yesterday = key(new Date(now - 86_400_000));
  const k = key(d);
  if (k === today) return "Hôm nay";
  const short = k.slice(0, 5);
  if (k === yesterday) return `Hôm qua · ${short}`;
  return short;
}

export function shortId(orderId: string): string {
  return orderId.length > 6 ? `…${orderId.slice(-4)}` : orderId;
}
