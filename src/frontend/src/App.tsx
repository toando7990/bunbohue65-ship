// TanStack Router with Vietnamese routes. Admin routes gated by II auth + admin role.

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { AdminPanel } from "@/pages/AdminPanel";
import { AnalyticsDashboard } from "@/pages/AnalyticsDashboard";
import CreateOrder from "@/pages/CreateOrder";
import { DeviceManager } from "@/pages/DeviceManager";
import { DriverPaymentScreen } from "@/pages/DriverPaymentScreen";
import GrabGuide from "@/pages/GrabGuide";
import { MenuManager } from "@/pages/MenuManager";
import OrderList from "@/pages/OrderList";
import OrderTracker from "@/pages/OrderTracker";
import RestaurantManager from "@/pages/RestaurantManager";
import {
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

// Admin gate component — redirects unauthenticated/non-admin users.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing, isAdmin, isAdminLoading, login } =
    useAuth();

  if (isInitializing || isAdminLoading) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.loading_state"
      >
        <p className="text-sm text-muted-foreground">Đang kiểm tra quyền…</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.login_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Yêu cầu đăng nhập
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vui lòng đăng nhập bằng Internet Identity để truy cập khu vực quản lý.
        </p>
        <button
          type="button"
          onClick={login}
          data-ocid="admin.login_button"
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          Đăng nhập Internet Identity
        </button>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.unauthorized_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Không có quyền truy cập
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản của bạn không có vai trò quản trị. Vui lòng liên hệ quản trị
          viên.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}

const rootRoute = createRootRouteWithContext()({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Không còn bọc EmailVerificationGate ở đây — khách vào thẳng menu, chỉ bị
  // yêu cầu xác thực email đúng lúc bấm "Đặt món" lần đầu (xem
  // EmailVerificationDialog trong CreateOrder.tsx).
  component: () => <CreateOrder />,
});

const trackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/track/$orderId",
  component: () => <OrderTracker />,
});

const trackIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/track",
  component: () => <OrderList />,
});

const grabGuideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/grab-guide",
  component: () => <GrabGuide />,
});

const driverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/driver",
  component: () => <DriverPaymentScreen />,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: () => (
    <AdminGate>
      <AdminPanel />
    </AdminGate>
  ),
  beforeLoad: () => {
    // Soft guard — full gate in component for SSR-safety.
    return {};
  },
});

const adminDevicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/devices",
  component: () => (
    <AdminGate>
      <DeviceManager />
    </AdminGate>
  ),
});

const adminMenuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/menu",
  component: () => (
    <AdminGate>
      <MenuManager />
    </AdminGate>
  ),
});

const adminRestaurantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/restaurants",
  component: () => (
    <AdminGate>
      <RestaurantManager />
    </AdminGate>
  ),
});

const adminAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/analytics",
  component: () => (
    <AdminGate>
      <AnalyticsDashboard />
    </AdminGate>
  ),
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    trackIndexRoute,
    trackRoute,
    grabGuideRoute,
    driverRoute,
    adminRoute,
    adminDevicesRoute,
    adminMenuRoute,
    adminRestaurantsRoute,
    adminAnalyticsRoute,
  ]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </>
  );
}
