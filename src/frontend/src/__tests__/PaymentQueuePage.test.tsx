// Cover tests for the enterprise "Hàng đợi thanh toán" (payment queue) module.
//
// Accepted behavior:
//   - a payment-queue device (bound via bbh_enterprise_activation) shows the
//     pending orders for its attached restaurant;
//   - confirming an order calls useConfirmPaymentByDevice with that order id;
//   - a device with no stored enterprise activation sees the "Chưa kích hoạt
//     thiết bị" state instead of the table;
//   - the search box filters the pending list by name/phone/order id.
//
// The actor and React Query hooks are mocked; this is component-level coverage
// of the payment-queue page, not a real backend call.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  PaymentStatus,
} from "@/backend";
import { PaymentQueuePage } from "@/pages/PaymentQueuePage";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListPending = vi.fn();
const mockConfirm = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useListPendingPaymentOrders: (...args: unknown[]) => mockListPending(...args),
  useConfirmPaymentByDevice: () => ({
    mutateAsync: mockConfirm,
    isPending: false,
  }),
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
    pickupCode: "AB23CD",
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
    paymentVerificationImage: "",
    kmDiscountAmount: 0n,
    voucherDiscountAmount: 0n,
    ...overrides,
  };
}

function setActivation() {
  localStorage.setItem(
    "bbh_enterprise_activation",
    JSON.stringify({
      restaurantId: "R1",
      deviceId: "dev-pq",
      name: "Thu ngan A",
    }),
  );
}

describe("PaymentQueuePage enterprise payment queue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the no-device state when no enterprise activation is stored", () => {
    mockListPending.mockReturnValue({ data: [], isLoading: false });

    render(<PaymentQueuePage />);

    expect(
      screen.getByTestId("payment_queue.no_device_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chưa kích hoạt thiết bị")).toBeInTheDocument();
  });

  it("lists pending orders for the attached restaurant", () => {
    setActivation();
    mockListPending.mockReturnValue({
      data: [makeOrder({ orderId: "ORD-1", cusName: "Nguyen Van A" })],
      isLoading: false,
    });

    render(<PaymentQueuePage />);

    expect(screen.getByTestId("payment_queue.page")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("ORD-1")).toBeInTheDocument();
    // KPI shows the pending count.
    expect(screen.getByTestId("payment_queue.kpi_count")).toHaveTextContent(
      "1",
    );
  });

  it("calls confirmPaymentByDevice with the order id when confirming", async () => {
    setActivation();
    mockListPending.mockReturnValue({
      data: [makeOrder({ orderId: "ORD-1" })],
      isLoading: false,
    });
    mockConfirm.mockResolvedValue(makeOrder({ orderId: "ORD-1" }));

    render(<PaymentQueuePage />);

    fireEvent.click(screen.getByTestId("payment_queue.confirm_button.1"));

    // The confirm dialog opens.
    expect(
      screen.getByTestId("payment_queue.confirm_dialog"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("payment_queue.confirm_submit_button"));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("ORD-1");
    });
  });

  it("filters the pending list by the search query", () => {
    setActivation();
    mockListPending.mockReturnValue({
      data: [
        makeOrder({ orderId: "ORD-1", cusName: "Nguyen Van A" }),
        makeOrder({ orderId: "ORD-2", cusName: "Tran Thi B" }),
      ],
      isLoading: false,
    });

    render(<PaymentQueuePage />);

    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("payment_queue.search_input"), {
      target: { value: "Tran" },
    });

    expect(screen.queryByText("Nguyen Van A")).not.toBeInTheDocument();
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
  });
});
