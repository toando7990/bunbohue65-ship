// Main layout with Vietnamese nav, responsive, admin-gated links.
// Header: bg-card border-b shadow-subtle. Main: bg-background. Footer: bg-muted/40 border-t.

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  type LucideIcon,
  ShieldCheck,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useState } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Đặt hàng", icon: UtensilsCrossed },
  { to: "/track", label: "Theo dõi đơn", icon: Truck },
  { to: "/driver", label: "Thanh toán", icon: ShieldCheck },
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
    to: "/admin/analytics",
    label: "Báo cáo",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const router = useRouterState();
  const isActive =
    item.to === "/"
      ? router.location.pathname === "/"
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

function AdminLoginButton() {
  const { isAuthenticated, login, clear } = useAuth();
  if (isAuthenticated) {
    return (
      <button
        type="button"
        onClick={clear}
        data-ocid="nav.admin.logout_button"
        className="flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary md:min-h-0"
      >
        Đăng xuất
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={login}
      data-ocid="nav.admin.login_button"
      className="flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary md:min-h-0"
    >
      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
      Đăng nhập II
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showAdmin = isAuthenticated && isAdmin;

  const visibleAdminNav = showAdminNav();

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
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.to} item={item} />
            ))}
            {showAdmin &&
              visibleAdminNav.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
            <AdminLoginButton />
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
            {PRIMARY_NAV.map((item) => (
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
            <AdminLoginButton />
          </nav>
        )}
      </header>

      <main className="flex-1 bg-background" data-ocid="page.main">
        {children}
      </main>

      <footer
        className="border-t border-border bg-muted/40 px-4 py-4 md:px-6"
        data-ocid="page.footer"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} Bún Bò Huế 65 Ship. Xây dựng với
            caffeine.ai
          </p>
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(
              typeof window !== "undefined" ? window.location.hostname : "",
            )}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
            data-ocid="footer.caffeine_link"
          >
            caffeine.ai
          </a>
        </div>
      </footer>
    </div>
  );
}
