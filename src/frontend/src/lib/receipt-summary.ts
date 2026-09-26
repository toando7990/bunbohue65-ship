// Các dòng tổng kết của phiếu thanh toán — tách module riêng để bản in USB
// (lib/printer.ts) và bản in qua hộp thoại (lib/invoice-receipt.ts) dùng
// CHUNG một nguồn, không phụ thuộc thư viện máy in.

import type { InvoiceResponse } from "@/types";

function formatVnd(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;
}

/** Các dòng tổng kết của phiếu thanh toán — DÙNG CHUNG cho bản in USB
 * (ESC/POS) và bản in qua hộp thoại (lib/invoice-receipt.ts), để 2 bản
 * luôn giống nhau. before: trước dòng TỔNG THANH TOÁN; after: sau dòng đó.
 * Thuế GTGT đã gồm trong giá — VPS tính đúng như hoá đơn Bkav. */
export function receiptSummary(invoice: InvoiceResponse): {
  before: Array<[string, string]>;
  total: [string, string];
  after: Array<[string, string]>;
} {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
  const goods =
    invoice.goodsAmount ??
    items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const before: Array<[string, string]> = [
    ["Tổng SL món", String(totalQty)],
    ["Tổng tiền hàng", formatVnd(goods)],
  ];
  const km = Number(invoice.kmDiscountAmount ?? 0);
  if (km > 0) {
    before.push([
      invoice.kmProgramName
        ? `Khuyến mãi (${invoice.kmProgramName})`
        : "Khuyến mãi",
      `-${formatVnd(km)}`,
    ]);
  }
  const voucher = Number(invoice.voucherDiscountAmount ?? 0);
  if (voucher > 0) {
    before.push([
      invoice.voucherCode
        ? `Phiếu giảm giá (${invoice.voucherCode})`
        : "Phiếu giảm giá",
      `-${formatVnd(voucher)}`,
    ]);
  }
  const rate = invoice.vatRate ?? 8;
  return {
    before,
    total: ["TỔNG THANH TOÁN", formatVnd(invoice.amount ?? 0)],
    after: [[`Trong đó thuế GTGT ${rate}%`, formatVnd(invoice.taxTotal ?? 0)]],
  };
}
