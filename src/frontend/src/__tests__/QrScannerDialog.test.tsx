// Coverage cho QrScannerDialog — Html5Qrcode (camera thật) không thể test
// trong jsdom, mock hoàn toàn class này và xác nhận component gọi đúng
// API + xử lý đúng nội dung quét được.

import { QrScannerDialog } from "@/components/QrScannerDialog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStart = vi.fn();
const mockStop = vi.fn();
let capturedSuccessCallback: ((decodedText: string) => void) | null = null;

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;
    async start(
      _config: unknown,
      _scanConfig: unknown,
      onSuccess: (decodedText: string) => void,
    ) {
      const result = await mockStart();
      capturedSuccessCallback = onSuccess;
      this.isScanning = true;
      return result;
    }
    async stop() {
      this.isScanning = false;
      return mockStop();
    }
  },
}));

describe("QrScannerDialog", () => {
  beforeEach(() => {
    mockStart.mockResolvedValue(null);
    mockStop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    capturedSuccessCallback = null;
  });

  it("starts the camera when opened, targeting the environment-facing camera", async () => {
    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });
    expect(screen.getByTestId("qr_scanner.camera_region")).toBeInTheDocument();
  });

  it("calls onScanned with the parsed {orderId, pickupCode} when a valid pickup QR is decoded", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    capturedSuccessCallback?.(
      JSON.stringify({ orderId: "ORD-1", pickupCode: "AB23CD" }),
    );

    expect(onScanned).toHaveBeenCalledWith({
      orderId: "ORD-1",
      pickupCode: "AB23CD",
    });
  });

  it("ignores a scanned QR that is not valid JSON or missing fields — does not call onScanned", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    capturedSuccessCallback?.("some random text, not a pickup QR");
    capturedSuccessCallback?.(JSON.stringify({ orderId: "ORD-1" })); // missing pickupCode

    expect(onScanned).not.toHaveBeenCalled();
  });

  it("only calls onScanned ONCE even if the success callback somehow fires again for the same scan", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    const payload = JSON.stringify({ orderId: "ORD-1", pickupCode: "AB23CD" });
    capturedSuccessCallback?.(payload);
    capturedSuccessCallback?.(payload);

    expect(onScanned).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error message when the camera fails to start (permission denied, no camera...)", async () => {
    mockStart.mockRejectedValue(new Error("Permission denied"));

    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("qr_scanner.error")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("qr_scanner.camera_region"),
    ).not.toBeInTheDocument();
  });

  it("does not start the camera when closed (open=false)", () => {
    render(
      <QrScannerDialog
        open={false}
        onOpenChange={vi.fn()}
        onScanned={vi.fn()}
      />,
    );
    expect(mockStart).not.toHaveBeenCalled();
  });
});
