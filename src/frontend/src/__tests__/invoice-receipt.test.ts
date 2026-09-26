// Phiếu thanh toán in được NGAY sau khi thanh toán (hoá đơn Bkav do Kế toán
// phát hành sau): phần "Thông tin hoá đơn điện tử" chỉ in khi đơn đã có
// hoá đơn.

import {
  buildInvoiceReceiptHtml,
  printInvoiceReceipt,
} from "@/lib/invoice-receipt";
import { describe, expect, it, vi } from "vitest";

const mockGetReceipt = vi.fn();
const mockPrintViaSystem = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getReceipt: (...a: unknown[]) => mockGetReceipt(...a),
}));
vi.mock("@/lib/payment-slip", () => ({
  getPrintMode: () => "system",
  printViaSystem: (...a: unknown[]) => mockPrintViaSystem(...a),
}));
vi.mock("@/lib/printer", () => ({
  isPrinterConnected: () => false,
  printReceipt: vi.fn(),
  reconnectPrinter: vi.fn(),
}));

const BASE = {
  ok: true,
  invoiceUrl: "",
  sharedLink: "",
  amount: 95000,
  taxTotal: 7037,
  createdAt: Date.now(),
  items: [{ name: "Bún bò", price: 95000, quantity: 1, unitName: "bát" }],
};

describe("invoice-receipt", () => {
  it("prints the e-invoice block when the order already has an invoice", () => {
    const html = buildInvoiceReceiptHtml("ORD-1", {
      ...BASE,
      invoiced: true,
      invoiceId: "0000123",
      maTraCuu: "TC1",
      maCQT: "CQT1",
    });
    expect(html).toContain("Số hoá đơn: 0000123");
    expect(html).toContain("Mã tra cứu: TC1");
    expect(html).not.toContain("phát hành sau");
  });

  it("prints the receipt without invoice info (and says it will be issued later) before the accountant issues it", () => {
    const html = buildInvoiceReceiptHtml("ORD-1", {
      ...BASE,
      invoiced: false,
      invoiceId: "",
    });
    expect(html).not.toContain("Số hoá đơn");
    expect(html).toContain("Hoá đơn điện tử sẽ được phát hành sau.");
    expect(html).toContain("Bún bò");
  });

  it("printInvoiceReceipt uses the receipt endpoint (does not require an issued invoice)", async () => {
    mockGetReceipt.mockResolvedValue({
      ...BASE,
      invoiced: false,
      invoiceId: "",
    });
    await printInvoiceReceipt("ORD-1");
    expect(mockGetReceipt).toHaveBeenCalledWith("ORD-1");
    expect(mockPrintViaSystem).toHaveBeenCalledWith(
      expect.stringContaining("phát hành sau"),
    );
  });
});
