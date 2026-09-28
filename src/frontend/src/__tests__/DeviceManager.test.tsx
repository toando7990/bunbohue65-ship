// DeviceManager (giao diện đã duyệt): 2 tab Cấp nhà hàng / Cấp doanh nghiệp,
// chip trạng thái (mặc định Đang hoạt động), Thu hồi / Xoá có xác nhận, và
// nút "Dọn dẹp" gộp (badge + dialog chọn mục).

import { DeviceManager } from "@/pages/DeviceManager";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseDevicesByRole = vi.fn();
const revokeAsync = vi.fn();
const deleteAsync = vi.fn();
const cleanupAsync = vi.fn();
let counts = { expiredCodes: 0n, restaurantDevices: 0n, enterpriseDevices: 0n };

vi.mock("@/hooks/useQueries", () => ({
  useDevicesByRole: (...args: unknown[]) => mockUseDevicesByRole(...args),
  useRestaurants: () => ({
    data: [{ restaurantId: "R1", name: "Bún bò Quận 1" }],
  }),
  useRevokeDevice: () => ({ mutateAsync: revokeAsync, isPending: false }),
  useDeleteRevokedDevice: () => ({
    mutateAsync: deleteAsync,
    isPending: false,
  }),
  useDeviceCleanupCounts: () => ({ data: counts, isLoading: false }),
  useCleanupDeviceStore: () => ({
    mutateAsync: cleanupAsync,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ActivationCodeForm", () => ({
  ActivationCodeForm: () => <div>form-nha-hang</div>,
}));

vi.mock("@/components/EnterpriseActivationCodeForm", () => ({
  EnterpriseActivationCodeForm: () => <div>form-doanh-nghiep</div>,
}));

function makeDevice(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Thiết bị",
    role: "cashier",
    restaurantId: "R1",
    deviceId: "dev-1",
    phone: "",
    ...overrides,
  };
}

const DEVICES: Record<string, ReturnType<typeof makeDevice>[]> = {
  cashier: [
    makeDevice({ deviceId: "dev-c1", name: "Thu ngân A" }),
    makeDevice({ deviceId: "dev-c2", name: "Thu ngân cũ", active: false }),
  ],
  driver: [
    makeDevice({ deviceId: "dev-d1", name: "Tài xế B", role: "driver" }),
  ],
  accounting: [
    makeDevice({
      deviceId: "dev-acc-1",
      name: "Kế toán A",
      role: "accounting",
      restaurantId: "",
    }),
  ],
  salesPromoReporting: [
    makeDevice({
      deviceId: "dev-sales-1",
      name: "Báo cáo B",
      role: "salesPromoReporting",
      restaurantId: "",
    }),
  ],
};

describe("DeviceManager", () => {
  beforeEach(() => {
    counts = { expiredCodes: 0n, restaurantDevices: 0n, enterpriseDevices: 0n };
    mockUseDevicesByRole.mockImplementation((role: string) => ({
      data: DEVICES[role] ?? [],
      isLoading: false,
    }));
    revokeAsync.mockResolvedValue(undefined);
    deleteAsync.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("tab Cấp nhà hàng mặc định chỉ hiện thiết bị đang hoạt động, kèm tên nhà hàng", () => {
    render(<DeviceManager />);

    expect(screen.getByText("Thu ngân A")).toBeInTheDocument();
    expect(screen.getByText("Tài xế B")).toBeInTheDocument();
    expect(screen.queryByText("Thu ngân cũ")).not.toBeInTheDocument();
    expect(screen.queryByText("Kế toán A")).not.toBeInTheDocument();
    expect(screen.getAllByText("Bún bò Quận 1").length).toBeGreaterThan(0);
    expect(screen.getByTestId("device.stat.active")).toHaveTextContent("2");
    expect(screen.getByTestId("device.stat.revoked")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("device.status_chip.revoked"));
    expect(screen.getByText("Thu ngân cũ")).toBeInTheDocument();
    expect(screen.queryByText("Thu ngân A")).not.toBeInTheDocument();
  });

  it("tab Cấp doanh nghiệp gộp Kế toán + Báo cáo bán hàng & KM", () => {
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.tab.enterprise"));

    expect(
      screen.getByTestId("device.enterprise_devices_card"),
    ).toBeInTheDocument();
    expect(screen.getByText("Kế toán A")).toBeInTheDocument();
    expect(screen.getByText("Báo cáo B")).toBeInTheDocument();
    expect(screen.getAllByText("Toàn chuỗi")).toHaveLength(2);
    expect(screen.queryByText("Thu ngân A")).not.toBeInTheDocument();
  });

  it("hiện thông báo trống khi chưa có thiết bị doanh nghiệp", () => {
    mockUseDevicesByRole.mockReturnValue({ data: [], isLoading: false });
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.tab.enterprise"));

    expect(
      screen.getByText("Chưa có thiết bị doanh nghiệp nào được kích hoạt."),
    ).toBeInTheDocument();
  });

  it("lọc theo chip vai trò", () => {
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.role_chip.driver"));

    expect(screen.getByText("Tài xế B")).toBeInTheDocument();
    expect(screen.queryByText("Thu ngân A")).not.toBeInTheDocument();
  });

  it("Thu hồi cần xác nhận trước khi gọi canister", async () => {
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.table.revoke_button.0"));

    expect(revokeAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("device.confirm_dialog")).toHaveTextContent(
      "Thu hồi thiết bị",
    );
    fireEvent.click(screen.getByTestId("device.confirm_button"));

    await waitFor(() => expect(revokeAsync).toHaveBeenCalledWith("dev-c1"));
  });

  it("Xoá thiết bị đã thu hồi cần xác nhận rồi gọi deleteRevokedDevice", async () => {
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.status_chip.revoked"));
    fireEvent.click(screen.getByTestId("device.table.delete_button.0"));

    expect(deleteAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("device.confirm_dialog")).toHaveTextContent(
      "Không thể hoàn tác",
    );
    fireEvent.click(screen.getByTestId("device.confirm_button"));

    await waitFor(() => expect(deleteAsync).toHaveBeenCalledWith("dev-c2"));
    expect(revokeAsync).not.toHaveBeenCalled();
  });

  it("Tạo mã kích hoạt mở form đúng theo tab", () => {
    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.create_code.button"));
    expect(screen.getByText("form-nha-hang")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    cleanup();

    render(<DeviceManager />);
    fireEvent.click(screen.getByTestId("device.tab.enterprise"));
    fireEvent.click(screen.getByTestId("device.create_code.button"));
    expect(screen.getByText("form-doanh-nghiep")).toBeInTheDocument();
  });

  it("Dọn dẹp: badge = tổng, mặc định chọn mã hết hạn + thiết bị nhà hàng", async () => {
    counts = {
      expiredCodes: 12n,
      restaurantDevices: 1n,
      enterpriseDevices: 2n,
    };
    cleanupAsync.mockResolvedValue({
      expiredCodes: 12n,
      restaurantDevices: 1n,
      enterpriseDevices: 0n,
    });
    render(<DeviceManager />);

    expect(screen.getByTestId("device.cleanup.badge")).toHaveTextContent("15");
    fireEvent.click(screen.getByTestId("device.cleanup.button"));

    expect(
      screen.getByTestId("device.cleanup_check.expiredCodes"),
    ).toBeChecked();
    expect(
      screen.getByTestId("device.cleanup_check.restaurantDevices"),
    ).toBeChecked();
    expect(
      screen.getByTestId("device.cleanup_check.enterpriseDevices"),
    ).not.toBeChecked();
    expect(screen.getByTestId("device.cleanup_submit")).toHaveTextContent(
      "Dọn dẹp 13 mục",
    );

    // Xem trước danh sách thiết bị nhà hàng sắp xoá.
    fireEvent.click(
      screen.getByTestId("device.cleanup_preview.restaurantDevices"),
    );
    expect(
      screen.getByTestId("device.cleanup_item.restaurantDevices"),
    ).toHaveTextContent("Thu ngân cũ");

    fireEvent.click(screen.getByTestId("device.cleanup_submit"));
    await waitFor(() =>
      expect(cleanupAsync).toHaveBeenCalledWith({
        expiredCodes: true,
        restaurantDevices: true,
        enterpriseDevices: false,
      }),
    );
    expect(
      await screen.findByTestId("device.cleanup_result"),
    ).toHaveTextContent("Đã xoá 12 mã hết hạn, 1 thiết bị nhà hàng.");
  });

  it("không có gì để dọn thì không hiện badge", () => {
    render(<DeviceManager />);
    expect(
      screen.queryByTestId("device.cleanup.badge"),
    ).not.toBeInTheDocument();
  });
});
