// Main layout with Vietnamese nav, responsive, admin-gated links.
// Header: bg-card border-b shadow-subtle. Main: bg-background. Footer: bg-muted/40 border-t.

import { useAuth } from "@/hooks/useAuth";
import { useGetStoreHours, useIsStoreOpen } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Clock,
  History,
  type LucideIcon,
  Percent,
  Phone,
  ShieldCheck,
  Store,
  Truck,
  User,
  UtensilsCrossed,
  Video,
} from "lucide-react";
import { type ReactNode, useState } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  // Đường dẫn (prefix) mà mục nav này bị ẩn — dùng cho thiết bị nhân viên
  // (ví dụ /driver) không cần thấy các mục dành cho khách hàng.
  hideOnPrefixes?: string[];
}

const PRIMARY_NAV: NavItem[] = [
  {
    to: "/",
    label: "Đặt món",
    icon: UtensilsCrossed,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/track",
    label: "Theo dõi đơn",
    icon: Truck,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/history",
    label: "Lịch sử đặt đơn",
    icon: History,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/profile",
    label: "Thông tin của bạn",
    icon: User,
    hideOnPrefixes: ["/driver"],
  },
  { to: "/grab-guide", label: "Hướng dẫn đặt Grab giao hàng", icon: Video },
  { to: "/ordering-partners", label: "Đối tác đặt món", icon: Store },
];
const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Quản lý", icon: ShieldCheck, adminOnly: true },
  {
    to: "/admin/devices",
    label: "Thiết bị",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { to: "/admin/menu", label: "Menu", icon: ShieldCheck, adminOnly: true },
  {
    to: "/admin/restaurants",
    label: "Nhà hàng",
    icon: ShieldCheck,
    adminOnly: true,
  },
  {
    to: "/admin/promotions",
    label: "Khuyến mại",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/registration-promo",
    label: "KM đăng ký",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/sales-promo",
    label: "KM doanh số",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/analytics",
    label: "Báo cáo",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const router = useRouterState();
  // "/" và "/admin" phải khớp CHÍNH XÁC — nếu không, "/admin" sẽ luôn sáng cùng
  // với mọi route con của nó (/admin/devices, /admin/menu...) vì "/admin/devices"
  // cũng bắt đầu bằng "/admin".
  const isActive =
    item.to === "/" || item.to === "/admin"
      ? router.location.pathname === item.to
      : router.location.pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      data-ocid={`nav.link.${item.to.replace(/\//g, "_") || "home"}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-smooth",
        "min-h-[44px] md:min-h-0",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-secondary hover:text-secondary-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function StoreHoursBar() {
  const { data: storeOpen } = useIsStoreOpen();
  const { data: storeHours } = useGetStoreHours();
  if (storeOpen === undefined || !storeHours) return null;

  const storeClosed = storeOpen === false;
  const pad = (n: bigint) => String(Number(n)).padStart(2, "0");

  return (
    <div
      className={cn(
        "border-t px-4 py-1.5 md:px-6",
        storeClosed
          ? "border-destructive/30 bg-destructive/10"
          : "border-success/30 bg-success/10",
      )}
      data-ocid="nav.store_hours_bar"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            storeClosed ? "text-destructive" : "text-success",
          )}
          data-ocid="nav.store_hours_bar.hours"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Giờ mở cửa: {pad(storeHours.openHour)}:{pad(storeHours.openMinute)} -{" "}
          {pad(storeHours.closeHour)}:{pad(storeHours.closeMinute)} hằng ngày
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold",
            storeClosed ? "text-destructive" : "text-success",
          )}
          data-ocid="nav.store_hours_bar.status"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              storeClosed ? "bg-destructive" : "bg-success",
            )}
            aria-hidden="true"
          />
          {storeClosed ? "Đang đóng cửa" : "Đang mở cửa"}
        </span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showAdmin = isAuthenticated && isAdmin;
  const router = useRouterState();

  const visibleAdminNav = showAdminNav();
  // Lọc mục nav theo route hiện tại — ví dụ /driver (thiết bị nhân viên
  // thanh toán) không cần thấy "Đặt món"/"Theo dõi đơn"/"Lịch sử đặt đơn".
  const visiblePrimaryNav = PRIMARY_NAV.filter(
    (item) =>
      !item.hideOnPrefixes?.some((p) => router.location.pathname.startsWith(p)),
  );

  function showAdminNav() {
    return ADMIN_NAV;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link
            to="/"
            data-ocid="nav.brand_link"
            className="flex items-center gap-2"
          >
            <img
              src="/assets/images/logo-mark.png"
              alt="Bún Bò Huế 65"
              className="h-9 w-9 shrink-0 rounded-full object-contain md:h-10 md:w-10"
            />
            <span className="font-display text-lg font-bold tracking-tight text-primary md:text-xl">
              Bún Bò Huế 65
            </span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              Ship
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 md:flex"
            data-ocid="nav.desktop"
            aria-label="Điều hướng chính"
          >
            {visiblePrimaryNav.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
            {showAdmin &&
              visibleAdminNav.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
          </nav>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            data-ocid="nav.mobile.toggle"
            aria-label="Mở menu"
            aria-expanded={mobileOpen}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border p-2 text-foreground md:hidden"
          >
            <span className="text-sm font-semibold">Menu</span>
          </button>
        </div>

        {mobileOpen && (
          <nav
            className="flex flex-col gap-1 border-t border-border bg-card px-4 py-3 md:hidden"
            data-ocid="nav.mobile"
            aria-label="Điều hướng di động"
          >
            {visiblePrimaryNav.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                onClick={() => setMobileOpen(false)}
              />
            ))}
            {showAdmin &&
              visibleAdminNav.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
          </nav>
        )}

        <StoreHoursBar />
      </header>

      <main className="flex-1 bg-background" data-ocid="page.main">
        {children}
      </main>

      <footer
        className="border-t border-border bg-muted/40 px-4 py-4 md:px-6"
        data-ocid="page.footer"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
          <a
            href="tel:0838656865"
            data-ocid="page.footer.phone_link"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-smooth hover:opacity-80"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            0838 656 865
          </a>
          <p>© 2026 CÔNG TY TNHH THỰC PHẨM GIA KHÁNH - GIA KHÁNH FOODS</p>
          <p>69 đường Láng, P. Đống Đa, Tp. Hà nội.</p>
        </div>
      </footer>
    </div>
  );
}
