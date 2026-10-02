// Khối thông báo "Tạm ngưng nhận đơn trực tuyến" ở đầu trang Đặt món (bản
// xem trước đã duyệt; không có nút đặt qua GrabFood/ShopeeFood).
import { COMPANY_INFO } from "@/lib/company-info";
import { PAUSED_MESSAGE, PAUSED_TITLE } from "@/lib/store-paused";
import { Link } from "@tanstack/react-router";
import { MapPin, Pause, Phone } from "lucide-react";

export function StorePausedNotice() {
  return (
    <section
      aria-live="polite"
      className="mt-4 flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-5 text-center shadow-sm"
      data-ocid="create_order.paused_notice"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/20 text-[oklch(0.5_0.14_60)]">
        <Pause className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="font-display text-lg font-bold text-foreground">
        {PAUSED_TITLE}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {PAUSED_MESSAGE}
      </p>
      <div className="mt-1 grid w-full max-w-sm gap-2">
        <a
          href={`tel:${COMPANY_INFO.phone.replace(/\s/g, "")}`}
          data-ocid="create_order.paused_hotline"
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 text-sm font-bold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          Gọi hotline {COMPANY_INFO.phone}
        </a>
        <Link
          to="/gioi-thieu"
          data-ocid="create_order.paused_stores"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Xem địa chỉ các cửa hàng
        </Link>
      </div>
    </section>
  );
}
