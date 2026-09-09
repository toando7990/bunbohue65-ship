// Cover tests for the enterprise "Kế toán" (accounting) module.
//
// Accepted behavior:
//   - lookup by order code calls useGetOrder and shows the order's payment
//     verification image for reconciliation;
//   - manual cleanup by code calls useCleanupOrderByDevice with the order id;
//   - manual invoice issuance calls useIssueInvoiceByDevice with
//     (orderId, invoiceId, pdfUrl).
//
// The actor and React Query hooks are mocked; this is component-level coverage
// of the accounting page, not a real backend call.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  PaymentStatus,
} from "@/backend";
import { AccountingPage } from "@/pages/AccountingPage";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrder = vi.fn();
const mockOrdersByEmail = vi.fn();
const mockOrders = vi.fn();
const mockCleanup = vi.fn();
const mockIssueInvoice = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useGetOrder: (...args: unknown[]) => mockGetOrder(...args),
  useOrdersByEmail: (...args: unknown[]) => mockOrdersByEmail(...args),
  useOrders: (...args: unknown[]) => mockOrders(...args),
  useCleanupOrderByDevice: () => ({
    mutateAsync: mockCleanup,
    isPending: false,
  }),
  useIssueInvoiceByDevice: () => ({
    mutateAsync: mockIssueInvoice,
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
    paymentStatus: PaymentStatus.paid,
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
      deviceId: "dev-acc",
      name: "Ke toan A",
    }),
  );
}

describe("AccountingPage enterprise accounting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("looks up an order by code and shows its payment verification image", async () => {
    setActivation();
    mockGetOrder.mockReturnValue({
      data: makeOrder({
        orderId: "ORD-1",
        paymentVerificationImage: "https://img/payment.png",
      }),
      isLoading: false,
    });

    render(<AccountingPage />);

    fireEvent.change(screen.getByTestId("accounting.code_input"), {
      target: { value: "ORD-1" },
    });
    fireEvent.click(screen.getByTestId("accounting.code_search_button"));

    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalledWith("ORD-1", "dev-acc");
    });

    // The order row shows the payment verification image button.
    expect(screen.getByTestId("accounting.image_button.1")).toBeInTheDocument();
  });

  it("cleans up an order by code via useCleanupOrderByDevice", async () => {
    setActivation();
    mockGetOrder.mockReturnValue({ data: undefined, isLoading: false });
    mockCleanup.mockResolvedValue(makeOrder());

    render(<AccountingPage />);

    fireEvent.change(screen.getByTestId("accounting.cleanup_input"), {
      target: { value: "ORD-1" },
    });
    fireEvent.click(screen.getByTestId("accounting.cleanup_submit_button"));

    await waitFor(() => {
      expect(mockCleanup).toHaveBeenCalledWith("ORD-1");
    });
  });

  it("issues an invoice manually via useIssueInvoiceByDevice", async () => {
    setActivation();
    mockGetOrder.mockReturnValue({ data: undefined, isLoading: false });
    mockIssueInvoice.mockResolvedValue(makeOrder());

    render(<AccountingPage />);

    // Open the invoice dialog by entering an order code.
    fireEvent.change(screen.getByTestId("accounting.invoice_code_input"), {
      target: { value: "ORD-1" },
    });
    fireEvent.click(screen.getByTestId("accounting.invoice_open_button"));

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.invoice_dialog"),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("accounting.invoice_id_input"), {
      target: { value: "INV-2026-0001" },
    });
    fireEvent.change(screen.getByTestId("accounting.invoice_pdf_input"), {
      target: { value: "https://pdf/hoa-don.pdf" },
    });
    fireEvent.click(screen.getByTestId("accounting.invoice_submit_button"));

    await waitFor(() => {
      expect(mockIssueInvoice).toHaveBeenCalledWith({
        orderId: "ORD-1",
        invoiceId: "INV-2026-0001",
        pdfUrl: "https://pdf/hoa-don.pdf",
      });
    });
  });
});
