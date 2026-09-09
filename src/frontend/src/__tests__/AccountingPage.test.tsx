// Cover tests for the enterprise "Kế toán" (accounting) module.
//
// Accepted behavior (sau khi đổi từ 3-tab tìm kiếm sang bộ lọc khoảng ngày +
// trạng thái, đọc từ VPS thay vì canister):
//   - date-range + status filter calls getEnterpriseHistory with the
//     device's id, the selected date range, and the selected statuses;
//   - manual cleanup by code calls useCleanupOrderByDevice with the order id;
//   - manual invoice issuance calls useIssueInvoiceByDevice with
//     (orderId, invoiceId, pdfUrl).
//
// The actor and React Query hooks are mocked; this is component-level
// coverage of the accounting page, not a real backend call.

import { AccountingPage } from "@/pages/AccountingPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCleanup = vi.fn();
const mockIssueInvoice = vi.fn();
const mockGetEnterpriseHistory = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useCleanupOrderByDevice: () => ({
    mutateAsync: mockCleanup,
    isPending: false,
  }),
  useIssueInvoiceByDevice: () => ({
    mutateAsync: mockIssueInvoice,
    isPending: false,
  }),
  useRestaurants: () => ({
    data: [{ restaurantId: "R1", name: "Đường Láng" }],
  }),
}));

vi.mock("@/lib/vps-client", () => ({
  getEnterpriseHistory: (...args: unknown[]) =>
    mockGetEnterpriseHistory(...args),
}));

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

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AccountingPage />
    </QueryClientProvider>,
  );
}

describe("AccountingPage enterprise accounting", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [],
      count: 0,
      total: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("calls getEnterpriseHistory with the device id and default filters on mount", async () => {
    setActivation();

    renderPage();

    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    const [deviceIdArg, , , statusesArg] =
      mockGetEnterpriseHistory.mock.calls[0];
    expect(deviceIdArg).toBe("dev-acc");
    // Mặc định: chỉ "Đã thanh toán" được chọn (theo mockup đã duyệt).
    expect(statusesArg).toEqual(["paid"]);
  });

  it("re-fetches with both statuses when the 'Đã huỷ' chip is toggled on", async () => {
    setActivation();

    renderPage();
    await waitFor(() => expect(mockGetEnterpriseHistory).toHaveBeenCalled());
    mockGetEnterpriseHistory.mockClear();

    fireEvent.click(screen.getByTestId("accounting.status_chip.cancelled"));

    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    const [, , , statusesArg] = mockGetEnterpriseHistory.mock.calls[0];
    expect(statusesArg.sort()).toEqual(["cancelled", "paid"]);
  });

  it("cleans up an order by code via useCleanupOrderByDevice", async () => {
    setActivation();
    mockCleanup.mockResolvedValue({});

    renderPage();

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
    mockIssueInvoice.mockResolvedValue({});

    renderPage();

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
