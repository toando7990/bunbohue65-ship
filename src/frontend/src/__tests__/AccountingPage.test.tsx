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

import { InvoiceStatus } from "@/backend";
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
const mockGetInvoice = vi.fn();

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
    data: [
      { restaurantId: "R1", name: "Đường Láng" },
      { restaurantId: "R2", name: "Cầu Giấy" },
    ],
  }),
}));

vi.mock("@/lib/vps-client", () => ({
  getEnterpriseHistory: (...args: unknown[]) =>
    mockGetEnterpriseHistory(...args),
  getInvoice: (...args: unknown[]) => mockGetInvoice(...args),
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

    // "Dọn dẹp/Phát hành theo mã" thu gọn trong "Tuỳ chọn nâng cao" — cần
    // bấm mở trước khi tương tác với các ô nhập bên trong.
    fireEvent.click(screen.getByTestId("accounting.advanced_toggle"));

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

    fireEvent.click(screen.getByTestId("accounting.advanced_toggle"));

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

  const sampleOrders = [
    {
      orderId: "ORD-R1-INVOICED",
      restaurantId: "R1",
      cusName: "Nguyễn Văn A",
      cusPhone: "0912345678",
      amount: 220000,
      bookingStatus: "paid",
      paymentStatus: "paid",
      invoiceStatus: InvoiceStatus.invoiced,
      createdAt: Date.now(),
    },
    {
      orderId: "ORD-R2-NONE",
      restaurantId: "R2",
      cusName: "Trần Thị B",
      cusPhone: "0987654321",
      amount: 108400,
      bookingStatus: "paid",
      paymentStatus: "paid",
      invoiceStatus: InvoiceStatus.none,
      createdAt: Date.now(),
    },
  ];

  it("filters the table by restaurant (client-side, không gọi lại API)", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("ORD-R1-INVOICED")).toBeInTheDocument();
      expect(screen.getByText("ORD-R2-NONE")).toBeInTheDocument();
    });

    mockGetEnterpriseHistory.mockClear();
    fireEvent.change(screen.getByTestId("accounting.restaurant_filter"), {
      target: { value: "R1" },
    });

    expect(screen.getByText("ORD-R1-INVOICED")).toBeInTheDocument();
    expect(screen.queryByText("ORD-R2-NONE")).not.toBeInTheDocument();
    // Lọc phía trình duyệt — KHÔNG gọi lại API.
    expect(mockGetEnterpriseHistory).not.toHaveBeenCalled();
  });

  it("filters the table by invoice status and shows the 'chưa phát hành' summary count", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.not_invoiced_count"),
      ).toHaveTextContent("1 đơn chưa phát hành hoá đơn");
    });

    fireEvent.click(
      screen.getByTestId(`accounting.invoice_filter.${InvoiceStatus.none}`),
    );

    expect(screen.queryByText("ORD-R1-INVOICED")).not.toBeInTheDocument();
    expect(screen.getByText("ORD-R2-NONE")).toBeInTheDocument();
  });

  it("shows a 'Xem PDF' link (not the 'Hoá đơn' button) for an already-invoiced order, and fetches the PDF URL on click", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });
    mockGetInvoice.mockResolvedValue({
      ok: true,
      invoiceId: "INV-1",
      invoiceUrl: "https://stg-ehoadon.vn/inv.pdf",
      sharedLink: "",
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.view_pdf_button.1"),
      ).toBeInTheDocument();
    });
    // Đơn CHƯA phát hành vẫn giữ nút "Hoá đơn" cũ.
    expect(
      screen.getByTestId("accounting.invoice_button.2"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("accounting.view_pdf_button.1"));

    await waitFor(() => {
      expect(mockGetInvoice).toHaveBeenCalledWith("ORD-R1-INVOICED");
      expect(openSpy).toHaveBeenCalledWith(
        "https://stg-ehoadon.vn/inv.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });
    openSpy.mockRestore();
  });

  it("exports the currently-filtered list as CSV when 'Xuất CSV' is clicked", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    // jsdom không tự triển khai createObjectURL/revokeObjectURL — gán trực
    // tiếp thay vì spyOn (spyOn cần hàm đã tồn tại sẵn trên object).
    const createUrlSpy = vi.fn().mockReturnValue("blob:mock");
    const revokeUrlSpy = vi.fn();
    URL.createObjectURL = createUrlSpy;
    URL.revokeObjectURL = revokeUrlSpy;

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.export_csv_button"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("accounting.export_csv_button"));

    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });
});
