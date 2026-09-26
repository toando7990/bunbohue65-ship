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

  it("shows goods total, promotion and voucher discounts, and the VAT included (never 'Tổng tiền thuế 0đ')", () => {
    const html = buildInvoiceReceiptHtml("ORD-1", {
      ...BASE,
      invoiced: false,
      invoiceId: "",
      items: [
        { name: "Bát Xanh", price: 60000, quantity: 1, unitName: "tô" },
        { name: "Quẩy", price: 5000, quantity: 4, unitName: "đĩa" },
      ],
      goodsAmount: 80000,
      kmProgramName: "Giờ vàng",
      kmDiscountAmount: 15000,
      voucherCode: "VC10",
      voucherDiscountAmount: 5000,
      amount: 60000,
      taxTotal: 4444,
      vatRate: 8,
    });
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Tổng tiền hàng 80.000đ");
    expect(text).toContain("Khuyến mãi (Giờ vàng) -15.000đ");
    expect(text).toContain("Phiếu giảm giá (VC10) -5.000đ");
    expect(text).toContain("TỔNG THANH TOÁN 60.000đ");
    expect(text).toContain("Trong đó thuế GTGT 8% 4.444đ");
    expect(text).not.toContain("Tổng tiền thuế");
  });

  it("omits discount lines when the order has none", () => {
    const html = buildInvoiceReceiptHtml("ORD-1", {
      ...BASE,
      invoiced: false,
      invoiceId: "",
    });
    expect(html).not.toContain("Khuyến mãi");
    expect(html).not.toContain("Phiếu giảm giá");
    expect(html).toContain("Trong đó thuế GTGT 8%");
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
