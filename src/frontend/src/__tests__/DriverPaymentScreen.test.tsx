// Coverage cho DriverPaymentScreen — tập trung vào luồng MỚI: nút "Quét QR
// nhận hàng" mở QrScannerDialog, sau khi quét thành công gọi đúng
// getOrder(orderId) rồi mở QRDisplay với initialPickupCode đã biết sẵn
// (bỏ qua bước nhập tay). Mock QrScannerDialog/QRDisplay/PaymentQueue
// hoàn toàn — không cần test lại camera thật hay luồng hàng đợi cũ.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseCanister = vi.fn();
const mockGetOrder = vi.fn();

vi.mock("@/lib/canister", () => ({
  useCanister: () => mockUseCanister(),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

vi.mock("@/hooks/usePendingOrders", () => ({
  usePendingOrders: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useQueries", () => ({
  useDevicesByRestaurant: () => ({ data: [] }),
}));

vi.mock("@/contexts/DeviceHeaderContext", () => ({
  useDeviceHeader: () => ({ setDeviceHeader: vi.fn() }),
}));

vi.mock("@/components/PaymentQueue", () => ({
  PaymentQueue: () => <div data-ocid="mock-payment-queue" />,
}));

vi.mock("@/components/DriverOrderHistory", () => ({
  DriverOrderHistory: () => null,
}));

let capturedOnScanned:
  | ((data: { orderId: string; pickupCode: string }) => void)
  | null = null;
vi.mock("@/components/QrScannerDialog", () => ({
  QrScannerDialog: ({
    open,
    onScanned,
  }: {
    open: boolean;
    onScanned: (data: { orderId: string; pickupCode: string }) => void;
  }) => {
    capturedOnScanned = onScanned;
    return open ? <div data-ocid="mock-qr-scanner-dialog" /> : null;
  },
}));

let capturedQRDisplayProps: {
  order: { orderId: string };
  initialPickupCode?: string;
} | null = null;
vi.mock("@/components/QRDisplay", () => ({
  QRDisplay: (props: {
    order: { orderId: string };
    initialPickupCode?: string;
  }) => {
    capturedQRDisplayProps = props;
    return <div data-ocid="mock-qr-display" />;
  },
}));

import { DriverPaymentScreen } from "@/pages/DriverPaymentScreen";

describe("DriverPaymentScreen — QR nhận hàng scan flow", () => {
  beforeEach(() => {
    localStorage.setItem(
      "bbh_driver_activation",
      JSON.stringify({
        restaurantId: "R1",
        deviceId: "dev-1",
        name: "Tài xế A",
      }),
    );
    mockUseCanister.mockReturnValue({ actor: {} });
    capturedOnScanned = null;
    capturedQRDisplayProps = null;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("opens the QR scanner dialog when 'Quét QR nhận hàng' is clicked", () => {
    render(<DriverPaymentScreen />);

    expect(
      screen.queryByTestId("mock-qr-scanner-dialog"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("driver.open_qr_scanner_button"));

    expect(screen.getByTestId("mock-qr-scanner-dialog")).toBeInTheDocument();
  });

  it("fetches the order via getOrder(orderId) and opens QRDisplay with the scanned pickupCode pre-filled", async () => {
    mockGetOrder.mockResolvedValue({
      orderId: "ORD-9",
      cusName: "Khách B",
    });

    render(<DriverPaymentScreen />);
    fireEvent.click(screen.getByTestId("driver.open_qr_scanner_button"));

    expect(capturedOnScanned).not.toBeNull();
    capturedOnScanned?.({ orderId: "ORD-9", pickupCode: "XYZ789" });

    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalledWith({}, "ORD-9");
    });

    await waitFor(() => {
      expect(screen.getByTestId("mock-qr-display")).toBeInTheDocument();
    });
    expect(capturedQRDisplayProps?.order.orderId).toBe("ORD-9");
    expect(capturedQRDisplayProps?.initialPickupCode).toBe("XYZ789");

    // Dialog quét QR tự đóng lại sau khi quét xong.
    expect(
      screen.queryByTestId("mock-qr-scanner-dialog"),
    ).not.toBeInTheDocument();
  });

  it("shows an error toast and does NOT open QRDisplay when getOrder fails (order not found)", async () => {
    mockGetOrder.mockRejectedValue(new Error("Không tìm thấy đơn hàng."));

    render(<DriverPaymentScreen />);
    fireEvent.click(screen.getByTestId("driver.open_qr_scanner_button"));
    capturedOnScanned?.({ orderId: "ORD-MISSING", pickupCode: "AAA111" });

    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalled();
    });

    expect(screen.queryByTestId("mock-qr-display")).not.toBeInTheDocument();
  });
});
