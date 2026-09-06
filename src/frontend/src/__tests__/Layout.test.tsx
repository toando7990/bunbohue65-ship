// Cover tests for the admin-only "Đăng xuất" (logout) button in Layout.
//
// The accepted behavior:
//   - the logout button shows ONLY on /admin and /admin/* pages, and only when
//     the user is authenticated AND an admin;
//   - it does NOT show on any non-admin page (/, /track, /profile);
//   - clicking it clears the auth session and navigates to the home page (/).
//
// Layout pulls auth from useAuth() and the current route from the router, so
// both are mocked here; the button's visibility and click behavior are the
// observable contract under test.

import { Layout } from "@/components/Layout";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockClear = vi.fn();
const mockNavigate = vi.fn();

// Mock the auth hook so each test can control isAuthenticated / isAdmin.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: mockAuth.isAuthenticated,
    isAdmin: mockAuth.isAdmin,
    isInitializing: false,
    login: vi.fn(),
    clear: mockClear,
    isAdminLoading: false,
  }),
}));

// Store-hours hooks are not part of this behavior; keep them inert.
vi.mock("@/hooks/useQueries", () => ({
  useGetStoreHours: () => ({ data: undefined }),
  useIsStoreOpen: () => ({ data: undefined }),
}));

// Mock the router so the test can set the current pathname and observe the
// navigate call made on logout.
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ location: { pathname: mockPathname } }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockAuth = { isAuthenticated: false, isAdmin: false };
let mockPathname = "/";

function renderLayout() {
  return render(
    <Layout>
      <div>page content</div>
    </Layout>,
  );
}

describe("Layout logout button", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = false;
    mockPathname = "/";
  });

  it("shows the logout button on /admin when authenticated and admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.getByRole("button", { name: /Đăng xuất/i }),
    ).toBeInTheDocument();
  });

  it("shows the logout button on an /admin sub-page when authenticated and admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin/devices";

    renderLayout();

    expect(
      screen.getByRole("button", { name: /Đăng xuất/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show the logout button on the home page", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the logout button on /track or /profile", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;

    for (const pathname of ["/track", "/profile"]) {
      mockPathname = pathname;
      cleanup();
      renderLayout();
      expect(
        screen.queryByRole("button", { name: /Đăng xuất/i }),
      ).not.toBeInTheDocument();
    }
  });

  it("does NOT show the logout button on /admin when not authenticated", () => {
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the logout button on /admin when not an admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = false;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the auth session and navigates to / when clicked", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: /Đăng xuất/i }));

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});
