// Coverage cho CreateOrder — tập trung vào logic MỚI thêm (Phần 3/6 tái
// cấu trúc): bắt buộc chọn địa chỉ nhận hàng trước khi đặt đơn, và app
// tự chọn nhà hàng gần nhất thay vì khách tự chọn.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseRestaurants = vi.fn();
const mockUseMenus = vi.fn();
const mockUseIsStoreOpen = vi.fn();
const mockUseGetStoreHours = vi.fn();
const mockCreate = vi.fn();
const mockGetCustomer = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => mockUseRestaurants(),
  useMenus: () => mockUseMenus(),
  useIsStoreOpen: () => mockUseIsStoreOpen(),
  useGetStoreHours: () => mockUseGetStoreHours(),
  useItemImage: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useCartDiscounts", () => ({
  useCartDiscounts: () => ({
    kmDiscount: 0,
    kmLabel: "",
    validVouchers: [],
    selectedVoucherCode: null,
    setSelectedVoucherCode: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOpenCountdown", () => ({
  useOpenCountdown: () => ({ formatted: "" }),
}));

vi.mock("@/lib/vps-client", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
  getCustomer: (...args: unknown[]) => mockGetCustomer(...args),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => ({ email: "a@test.com" }),
}));

vi.mock("@/components/MenuPicker", () => ({
  MenuPicker: () => null,
}));

vi.mock("@/components/OrderProcessFlow", () => ({
  OrderProcessFlow: () => null,
}));
vi.mock("@/components/PromoMarquee", () => ({ PromoMarquee: () => null }));
vi.mock("@/components/PromotionBanner", () => ({
  PromotionBanner: () => null,
}));

let capturedOnSelectAddress:
  | ((
      a: { id: number; lat: number; lng: number; address: string } | null,
    ) => void)
  | null = null;
vi.mock("@/components/DeliveryAddressSelector", () => ({
  DeliveryAddressSelector: ({
    onSelectAddress,
  }: {
    onSelectAddress: (
      a: { id: number; lat: number; lng: number; address: string } | null,
    ) => void;
  }) => {
    capturedOnSelectAddress = onSelectAddress;
    return <div data-ocid="mock-delivery-address-selector" />;
  },
}));

let capturedNearestProps: {
  restaurantName: string | null;
  hasNoResult: boolean;
} | null = null;
vi.mock("@/components/NearestRestaurantDisplay", () => ({
  NearestRestaurantDisplay: (props: {
    restaurantName: string | null;
    hasNoResult: boolean;
  }) => {
    capturedNearestProps = props;
    return <div data-ocid="mock-nearest-restaurant-display" />;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => (
    // biome-ignore lint/a11y/useValidAnchor: mock đơn giản cho test, không cần router thật
    <a>{children}</a>
  ),
}));

import CreateOrder from "@/pages/CreateOrder";

const RESTAURANTS = [
  {
    restaurantId: "R1",
    name: "Bún Bò Huế 65 - Láng",
    address: "69 Láng",
    phone: "0900000000",
    visible: true,
    lat: 21.03,
    lng: 105.85,
  },
  {
    restaurantId: "R2",
    name: "Bún Bò Huế 65 - Cầu Giấy",
    address: "10 Cầu Giấy",
    phone: "0900000001",
    visible: true,
    lat: 10.78,
    lng: 106.7,
  },
];

describe("CreateOrder — chọn địa chỉ bắt buộc + tự chọn nhà hàng gần nhất", () => {
  beforeEach(() => {
    mockUseRestaurants.mockReturnValue({ data: RESTAURANTS, isLoading: false });
    mockUseMenus.mockReturnValue({ data: [], isLoading: false });
    mockUseIsStoreOpen.mockReturnValue({ data: true });
    mockUseGetStoreHours.mockReturnValue({ data: undefined });
    mockGetCustomer.mockResolvedValue(null);
    capturedOnSelectAddress = null;
    capturedNearestProps = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows 'no result' for the nearest restaurant until a delivery address is selected", () => {
    render(<CreateOrder />);
    expect(capturedNearestProps?.hasNoResult).toBe(true);
    expect(capturedNearestProps?.restaurantName).toBeNull();
  });

  it("auto-selects the nearest restaurant once a delivery address is picked", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285, // gần R1 (Hà Nội)
      lng: 105.8542,
    });

    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
  });

  it("picks a DIFFERENT nearest restaurant for a different delivery address", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 2,
      address: "456 Tran Phu",
      lat: 10.7769, // gần R2 (TP.HCM)
      lng: 106.7009,
    });

    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe(
        "Bún Bò Huế 65 - Cầu Giấy",
      );
    });
  });
});
