// Characterization tests for the driver Tingee QR payment flow (QRDisplay).
//
// QRDisplay is the full-screen step-3 overlay of DriverPaymentScreen. On mount
// it calls requestQr(order.orderId) (VPS POST /order/:id/qr, idempotent) and
// renders the returned QR from response requestQr.qrCode. It then polls
// getOrderStatus every 5s and keeps the order in a pending state until Tingee
// confirms the payment (paymentStatus === paid), at which point it shows the
// success state and calls onPaid.
//
// These tests protect the accepted behavior: requestQr is called with the
// order id on mount, the QR is rendered from res.qrCode, and the order stays
// pending until the canister reports paid.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  PaymentStatus,
} from "@/backend";
import { QRDisplay } from "@/components/QRDisplay";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRequestQr = vi.fn();
const mockGetOrderStatus = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  requestQr: (...args: unknown[]) => mockRequestQr(...args),
}));

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {}, isFetching: false }),
  getOrderStatus: (...args: unknown[]) => mockGetOrderStatus(...args),
}));

// qrcode.react draws to a real canvas, which jsdom cannot do. The QR value
// itself is the behavior under test, so render a lightweight element that
// exposes the value prop.
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <canvas data-qr-value={value} />
  ),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "ORD-1",
    restaurantId: "R1",
    cusName: "Nguyen Van A",
    cusPhone: "0901234567",
    cusAddress: "123 Le Loi",
    cusTaxCode: "",
    receiverEmail: "a@example.com",
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    amount: 100000n,
    goodsAmount: 90000n,
    shippingFee: 10000n,
    taxTotal: 0n,
    ahamoveOrderId: "AH-1",
    items: [],
    paymentStatus: PaymentStatus.unpaid,
    bookingStatus: BookingStatus.confirmed,
    invoiceStatus: InvoiceStatus.none,
    tingeeQrCode: "",
    tingeeQrId: "",
    invoiceId: "",
    sharedLink: "",
    pdfUrl: "",
    ...overrides,
  };
}

function makeStatus(paymentStatus: PaymentStatus) {
  return {
    paymentStatus,
    tingeeQrCode: "",
    invoiceId: "",
    sharedLink: "",
    bookingStatus: BookingStatus.confirmed,
    pdfUrl: "",
    tingeeQrId: "",
    invoiceStatus: InvoiceStatus.none,
  };
}

describe("QRDisplay driver Tingee QR payment flow", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("calls requestQr(order.orderId) on mount and renders the QR from res.qrCode", async () => {
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder();

    render(<QRDisplay order={order} onClose={onClose} onPaid={onPaid} />);

    // requestQr must be called with the order id on mount.
    expect(mockRequestQr).toHaveBeenCalledWith("ORD-1");

    // The QR card (only rendered when the QR is ready) appears and the QR
    // value passed to the canvas is the response's qrCode.
    await waitFor(() => {
      expect(screen.getByTestId("qr.card")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("qr.canvas").querySelector("canvas"),
    ).toHaveAttribute("data-qr-value", "TINGEE-QR-ABC");
  });

  it("keeps the order pending until Tingee confirms payment, then shows success", async () => {
    vi.useFakeTimers();
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    // First poll returns unpaid → order stays pending.
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder();

    render(<QRDisplay order={order} onClose={onClose} onPaid={onPaid} />);

    // Flush the requestQr microtask so the QR card renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("qr.card")).toBeInTheDocument();

    // While unpaid, the pending badge is shown and onPaid is not called.
    expect(screen.getByTestId("qr.pending_state")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();

    // Tingee confirms the payment on the next poll.
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.paid));

    // Advance past the 5s poll interval and flush the async check.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The success state is shown once Tingee confirms the payment.
    expect(screen.getByTestId("qr.success_state")).toBeInTheDocument();
    expect(screen.queryByTestId("qr.pending_state")).not.toBeInTheDocument();

    // The success screen auto-closes: onPaid fires after the 1.5s success
    // timeout even though setPolling(false) stopped the poll loop. This is the
    // regression the production fix addressed — the auto-close lives in its own
    // effect keyed on [status, order, onPaid], so stopping polling no longer
    // cancels the timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith(order);
  });

  it("shows a retryable error state when requestQr fails, without leaving the queue", async () => {
    mockRequestQr.mockRejectedValue(new Error("network down"));
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();

    render(<QRDisplay order={makeOrder()} onClose={onClose} onPaid={onPaid} />);

    // The not-ready card with a retry button is shown; the order is not
    // marked paid and onPaid is never called.
    await waitFor(() => {
      expect(screen.getByTestId("qr.not_ready_card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("qr.retry_button")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();
  });
});
