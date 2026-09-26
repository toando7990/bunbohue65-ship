// Coverage cho DriverScreenScan — nút "Chụp màn hình tài xế" ở /driver:
// chụp → VPS đọc mã → tìm thấy thì tự mở thanh toán (mã điền sẵn);
// không đọc được thì nhập tay mã nhận hàng.

import { DriverScreenScan } from "@/components/DriverScreenScan";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockByPhoto = vi.fn();
const mockByCode = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  lookupPickupByPhoto: (...a: unknown[]) => mockByPhoto(...a),
  lookupPickupByCode: (...a: unknown[]) => mockByCode(...a),
}));

const MATCH = {
  orderId: "ORD-1727331200123-a1b2c3d4",
  cusName: "Nguyễn Văn A",
  amount: 95000,
  pickupCode: "Q2WE8R",
};

function renderScan(onOpenOrder = vi.fn()) {
  render(
    <DriverScreenScan
      restaurantId="R1"
      deviceId="dev-1"
      onOpenOrder={onOpenOrder}
    />,
  );
  return onOpenOrder;
}

function takePhoto() {
  const file = new File(["img"], "a.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("driver.screen_scan_input"), {
    target: { files: [file] },
  });
}

describe("DriverScreenScan", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses the device's native camera (capture=environment)", () => {
    renderScan();
    const input = screen.getByTestId("driver.screen_scan_input");
    expect(input).toHaveAttribute("capture", "environment");
    expect(input).toHaveAttribute("accept", "image/*");
  });

  it("reads the photo, finds the order and auto-opens payment with the pickup code filled", async () => {
    mockByPhoto.mockResolvedValue([MATCH]);
    const onOpenOrder = renderScan();
    takePhoto();

    await waitFor(() =>
      expect(
        screen.getByTestId("driver.screen_scan_found"),
      ).toBeInTheDocument(),
    );
    expect(mockByPhoto).toHaveBeenCalledWith("R1", "dev-1", expect.any(Blob));
    expect(screen.getByText(/Mã Q2WE8R/)).toBeInTheDocument();
    await waitFor(
      () =>
        expect(onOpenOrder).toHaveBeenCalledWith(
          "ORD-1727331200123-a1b2c3d4",
          "Q2WE8R",
        ),
      { timeout: 3000 },
    );
  });

  it("opens the order without a code when only the order id was read", async () => {
    mockByPhoto.mockResolvedValue([{ ...MATCH, pickupCode: "" }]);
    const onOpenOrder = renderScan();
    takePhoto();
    await waitFor(() =>
      expect(
        screen.getByTestId("driver.screen_scan_open_now"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("driver.screen_scan_open_now"));
    expect(onOpenOrder).toHaveBeenCalledWith(MATCH.orderId, null);
  });

  it("falls back to typing the pickup code when nothing could be read", async () => {
    mockByPhoto.mockResolvedValue([]);
    mockByCode.mockResolvedValue([MATCH]);
    const onOpenOrder = renderScan();
    takePhoto();

    await waitFor(() =>
      expect(
        screen.getByTestId("driver.screen_scan_not_found"),
      ).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("driver.screen_scan_code_input"), {
      target: { value: "q2we8r" },
    });
    fireEvent.click(screen.getByTestId("driver.screen_scan_search_code"));
    await waitFor(() =>
      expect(mockByCode).toHaveBeenCalledWith("R1", "dev-1", "Q2WE8R"),
    );
    fireEvent.click(await screen.findByTestId("driver.screen_scan_match"));
    expect(onOpenOrder).toHaveBeenCalledWith(MATCH.orderId, "Q2WE8R");
  });

  it("lets staff choose when several orders match (no auto-open)", async () => {
    mockByPhoto.mockResolvedValue([
      MATCH,
      { ...MATCH, orderId: "ORD-1727331200999-ffffffff", cusName: "Trần B" },
    ]);
    const onOpenOrder = renderScan();
    takePhoto();
    await waitFor(() =>
      expect(screen.getAllByTestId("driver.screen_scan_match")).toHaveLength(2),
    );
    await new Promise((r) => setTimeout(r, 2300));
    expect(onOpenOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Trần B/));
    expect(onOpenOrder).toHaveBeenCalledWith(
      "ORD-1727331200999-ffffffff",
      "Q2WE8R",
    );
  });

  it("shows the server error (e.g. revoked device) instead of failing silently", async () => {
    mockByPhoto.mockRejectedValue(
      new Error(
        "Thiết bị chưa được kích hoạt hoặc đã bị thu hồi quyền truy cập.",
      ),
    );
    renderScan();
    takePhoto();
    expect(
      await screen.findByText(/đã bị thu hồi quyền truy cập/),
    ).toBeInTheDocument();
  });
});
