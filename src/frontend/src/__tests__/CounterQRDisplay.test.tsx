// Coverage cho CounterQRDisplay:
//   1. QR "Ghi nhận" CHỈ hiện khi ĐỦ CẢ 3 điều kiện: đã thanh toán
//      (paymentStatus=paid), chương trình "Khách hàng thân thiết" đang
//      active + enabledCounter=true, và receiverEmail còn rỗng.
//   2. Tự ẩn (thay bằng dòng xác nhận) ngay khi poll phát hiện
//      order.receiverEmail đã có giá trị.
//   3. KHÔNG cho đóng dialog thủ công khi QR đã sẵn sàng và chưa thanh
//      toán — chỉ tự đóng qua onPaid khi paymentStatus=paid.

import { PaymentStatus } from "@/backend";
import { CounterQRDisplay } from "@/components/CounterQRDisplay";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetOrder = vi.fn();
const mockRequestQr = vi.fn();
const mockUseCurrentSalesPromo = vi.fn();

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {} }),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

vi.mock("@/lib/vps-client", () => ({
  requestQr: (...args: unknown[]) => mockRequestQr(...args),
}));

vi.mock("@/hooks/useQueries", () => ({
  useCurrentSalesPromo: () => mockUseCurrentSalesPromo(),
}));

const ENABLED_SALES_PROMO = {
  code: "SP001",
  name: "Khách hàng thân thiết",
  weeklyTiers: [],
  monthlyTiers: [],
  voucherValidDays: 30n,
  active: true,
  enabledCounter: true,
  termsUrl: "",
  startDate: "20260101",
  endDate: "20261231",
};

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

  it("does NOT show the claim QR before payment, even if the program is enabled for counter", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(makeOrder()); // vẫn unpaid
    mockUseCurrentSalesPromo.mockReturnValue({ data: ENABLED_SALES_PROMO });

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
      screen.queryByTestId("counter_qr.claim_block"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("counter_qr.claimed_state"),
    ).not.toBeInTheDocument();
  });

  it("shows the claim QR after payment succeeds, when the program is enabled for counter", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(
      makeOrder({ paymentStatus: PaymentStatus.paid }),
    );
    mockUseCurrentSalesPromo.mockReturnValue({ data: ENABLED_SALES_PROMO });

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
  });

  it("does NOT show the claim QR after payment if enabledCounter=false for the program", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(
      makeOrder({ paymentStatus: PaymentStatus.paid }),
    );
    mockUseCurrentSalesPromo.mockReturnValue({
      data: { ...ENABLED_SALES_PROMO, enabledCounter: false },
    });

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
      screen.queryByTestId("counter_qr.claim_block"),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the claim QR after payment if no sales promo is currently active", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(
      makeOrder({ paymentStatus: PaymentStatus.paid }),
    );
    mockUseCurrentSalesPromo.mockReturnValue({ data: null });

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
      screen.queryByTestId("counter_qr.claim_block"),
    ).not.toBeInTheDocument();
  });

  it("hides the claim QR and shows the confirmed state once receiverEmail is set (polled)", async () => {
    mockRequestQr.mockResolvedValue({ ok: true, qrCode: "qr-data" });
    mockGetOrder.mockResolvedValue(
      makeOrder({
        paymentStatus: PaymentStatus.paid,
        receiverEmail: "khach@test.com",
      }),
    );
    mockUseCurrentSalesPromo.mockReturnValue({ data: ENABLED_SALES_PROMO });

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
    mockUseCurrentSalesPromo.mockReturnValue({ data: null });

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
    mockUseCurrentSalesPromo.mockReturnValue({ data: null });

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
