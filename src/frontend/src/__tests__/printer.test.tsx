// Coverage cho buildReceiptBytes (lib/printer.ts) — phần logic dựng nội
// dung phiếu ESC/POS có thể kiểm tra được mà KHÔNG cần phần cứng thật
// (pairPrinter/reconnectPrinter/printReceipt cần navigator.usb thật,
// không test được trong môi trường CI). Xác nhận: hàm chạy không lỗi,
// trả về Uint8Array không rỗng, và không throw với dữ liệu hoá đơn đầy
// đủ theo đúng shape thật từ vps-worker/src/routes/invoice.js.

import { buildReceiptBytes } from "@/lib/printer";
import { describe, expect, it } from "vitest";

const BASE_INVOICE = {
  invoiceId: "INV-001",
  invoiceUrl: "https://stg-ehoadon.vn/test.pdf",
  sharedLink: "https://tra-cuu-hoa-don.vn/TC001",
  ok: true,
  maCQT: "CQT-ABC-123",
  maTraCuu: "TC001",
  cusName: "Khách tại quầy",
  amount: 70000,
  goodsAmount: 90000,
  taxTotal: 5555,
  createdAt: Date.now(),
  items: [
    {
      name: "Bún bò Huế truyền thống",
      price: 45000,
      quantity: 2,
      unitName: "tô",
    },
    { name: "Quẩy to", price: 10000, quantity: 1, unitName: "cái" },
  ],
};

describe("buildReceiptBytes", () => {
  it("prints the voucher discount and the VAT line (ESC/POS bytes)", () => {
    const bytes = buildReceiptBytes({
      orderId: "ORD-1",
      invoice: {
        ...BASE_INVOICE,
        voucherCode: "VC20",
        voucherDiscountAmount: 20000,
        vatRate: 8,
      },
    });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("(VC20)");
    expect(text).toContain("-20.000");
    expect(text).toContain("GTGT 8%");
    expect(text).toContain("5.555");
  });

  it("returns a non-empty Uint8Array for a fully-issued invoice", () => {
    const bytes = buildReceiptBytes({
      orderId: "ORD-1",
      invoice: BASE_INVOICE,
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("does not throw when maCQT/maTraCuu/sharedLink are missing (not yet issued case guarded elsewhere)", () => {
    const bytes = buildReceiptBytes({
      orderId: "ORD-2",
      invoice: { ...BASE_INVOICE, maCQT: "", maTraCuu: "", sharedLink: "" },
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("does not throw with an empty items list", () => {
    const bytes = buildReceiptBytes({
      orderId: "ORD-3",
      invoice: { ...BASE_INVOICE, items: [] },
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("works with the 58mm paper width (32 columns)", () => {
    const bytes = buildReceiptBytes({
      orderId: "ORD-4",
      invoice: BASE_INVOICE,
      columns: 32,
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
