// Coverage cho CounterQRDisplay — 2 hành vi mới:
//   1. QR "Ghi nhận" tự ẩn (thay bằng dòng xác nhận) ngay khi poll phát
//      hiện order.receiverEmail đã có giá trị.
//   2. KHÔNG cho đóng dialog thủ công khi QR đã sẵn sàng và chưa thanh
//      toán — chỉ tự đóng qua onPaid khi paymentStatus=paid.

import { PaymentStatus } from "@/backend";
import { CounterQRDisplay } from "@/components/CounterQRDisplay";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetOrder = vi.fn();
const mockRequestQr = vi.fn();

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {} }),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

vi.mock("@/lib/vps-client", () => ({
  requestQr: (...args: unknown[]) => mockRequestQr(...args),
}));

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "ORD-1",
    amount: 70000n,
    paymentStatus: PaymentStatus.unpaid,
    receiverEmail: "",
    ...overrides,
  } as never;
}

describe("CounterQRDisplay", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the claim QR block when receiverEmail is still empty", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(makeOrder());

    render(
      <CounterQRDisplay
        order={makeOrder()}
        onClose={vi.fn()}
        onPaid={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("counter_qr.claim_block")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("counter_qr.claimed_state"),
    ).not.toBeInTheDocument();
  });

  it("hides the claim QR and shows the confirmed state once receiverEmail is set (polled)", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(
      makeOrder({ receiverEmail: "khach@test.com" }),
    );

    render(
      <CounterQRDisplay
        order={makeOrder()}
        onClose={vi.fn()}
        onPaid={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("counter_qr.claimed_state"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("counter_qr.claim_block"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show a close button while the QR is ready and unpaid (cannot dismiss before payment)", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(makeOrder());

    render(
      <CounterQRDisplay
        order={makeOrder()}
        onClose={vi.fn()}
        onPaid={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("counter_qr.card")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("counter_qr.close_button"),
    ).not.toBeInTheDocument();
  });

  it("shows a close button when the QR failed to generate (so staff isn't stuck)", async () => {
    mockRequestQr.mockResolvedValue({
      ok: false,
      retryable: true,
      message: "Lỗi mạng",
    });
    mockGetOrder.mockResolvedValue(makeOrder());

    render(
      <CounterQRDisplay
        order={makeOrder()}
        onClose={vi.fn()}
        onPaid={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("counter_qr.not_ready_card"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("counter_qr.close_button")).toBeInTheDocument();
  });
});
