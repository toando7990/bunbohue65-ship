// ============================================================
// lib/payment-slip.ts — In "phiếu thanh toán" cho đơn CHỜ tài xế thanh toán
// ============================================================
// Khác printReceipt() (lib/printer.ts — in HOÁ ĐƠN đã phát hành, cần
// InvoiceResponse), phiếu này in từ dữ liệu ĐƠN HÀNG ngay khi đơn còn chờ
// thanh toán (chưa có hoá đơn).
//
// 2 chế độ in (người dùng chọn ở "Cấu hình máy in" trang /driver):
//   - "usb": máy in nhiệt USB qua WebUSB + ESC/POS — chỉ chạy trên Chrome
//     máy tính / Chrome Android (Safari iPhone KHÔNG hỗ trợ WebUSB).
//   - "system": hộp thoại in của hệ điều hành (window.print) — chạy trên
//     MỌI thiết bị kể cả iPhone (AirPrint, máy in Bluetooth qua app hãng,
//     "Lưu PDF"...). Mặc định vì chạy được ở mọi nơi.
//
// KHÔNG in mã nhận hàng — mã này cố ý che với nhân viên quán (chỉ khách/
// tài xế biết, dùng để xác minh đúng người đến lấy hàng).
// ============================================================

import type { Order } from "@/backend";
import { COMPANY_INFO } from "@/lib/company-info";
import { isPrinterConnected, reconnectPrinter, sendBytes } from "@/lib/printer";
import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

export type PrintMode = "usb" | "system";
const PRINT_MODE_KEY = "bbh_print_mode";

export function getPrintMode(): PrintMode {
  try {
    return localStorage.getItem(PRINT_MODE_KEY) === "usb" ? "usb" : "system";
  } catch {
    return "system";
  }
}

export function setPrintMode(mode: PrintMode): void {
  try {
    localStorage.setItem(PRINT_MODE_KEY, mode);
  } catch {
    // localStorage không khả dụng (chế độ riêng tư) — bỏ qua.
  }
}

function vnd(n: bigint | number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(n))}đ`;
}

function orderTime(order: Order): string {
  // createdAt của canister tính bằng NANO giây.
  const d = new Date(Number(order.createdAt / 1_000_000n));
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function discountOf(order: Order): bigint {
  return order.kmDiscountAmount + order.voucherDiscountAmount;
}

export function buildPaymentSlipBytes(
  order: Order,
  columns: 32 | 42 | 48 = 48,
): Uint8Array {
  const encoder = new ReceiptPrinterEncoder({
    language: "esc-pos",
    columns,
    codepageMapping: { windows1258: 27 },
  });
  encoder.initialize().codepage("windows1258");
  encoder
    .align("center")
    .bold(true)
    .line(COMPANY_INFO.name)
    .bold(false)
    .newline()
    .bold(true)
    .line("PHIẾU THANH TOÁN")
    .bold(false)
    .align("left")
    .line(`Mã đơn: ${order.orderId}`)
    .line(`Thời gian: ${orderTime(order)}`)
    .line(`Khách: ${order.cusName}`)
    .line(`SĐT: ${order.cusPhone}`)
    .rule();
  for (const it of order.items) {
    encoder.line(`${it.name} x${it.quantity}`);
    encoder
      .align("right")
      .line(vnd(it.price * it.quantity))
      .align("left");
  }
  encoder.rule();
  const discount = discountOf(order);
  if (discount > 0n) encoder.line(`Đã giảm: -${vnd(discount)}`);
  encoder
    .bold(true)
    .line(`CẦN THANH TOÁN: ${vnd(order.amount)}`)
    .bold(false)
    .newline()
    .align("center")
    .line("Cảm ơn quý khách!")
    .newline()
    .newline()
    .cut();
  return encoder.encode();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

export function buildPaymentSlipHtml(order: Order): string {
  const rows = order.items
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.name)} x${it.quantity}</td><td class="r">${vnd(it.price * it.quantity)}</td></tr>`,
    )
    .join("");
  const discount = discountOf(order);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Phiếu thanh toán ${escapeHtml(order.orderId)}</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: Arial, sans-serif; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
h1 { font-size: 14px; text-align: center; margin: 0 0 4px; }
h2 { font-size: 13px; text-align: center; margin: 8px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 0; vertical-align: top; }
.r { text-align: right; white-space: nowrap; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.total { font-weight: bold; font-size: 14px; }
.c { text-align: center; }
</style></head><body>
<h1>${escapeHtml(COMPANY_INFO.name)}</h1>
<h2>PHIẾU THANH TOÁN</h2>
<div>Mã đơn: ${escapeHtml(order.orderId)}</div>
<div>Thời gian: ${orderTime(order)}</div>
<div>Khách: ${escapeHtml(order.cusName)}</div>
<div>SĐT: ${escapeHtml(order.cusPhone)}</div>
<hr><table>${rows}</table><hr>
${discount > 0n ? `<table><tr><td>Đã giảm</td><td class="r">-${vnd(discount)}</td></tr></table>` : ""}
<table><tr class="total"><td>CẦN THANH TOÁN</td><td class="r">${vnd(order.amount)}</td></tr></table>
<p class="c">Cảm ơn quý khách!</p>
</body></html>`;
}

const PRINT_SLIP_ID = "bbh-print-slip";

/** In qua hộp thoại in của hệ điều hành, không mở tab mới (tránh bị chặn
 * popup trên điện thoại).
 *
 * BUG THẬT đã sửa: trước in qua iframe ẩn 0×0 — Safari iPhone (và một số
 * trình duyệt di động) BỎ QUA iframe, in CẢ TRANG đang mở (bản in "In lại
 * phiếu" ở /driver ra nguyên trang A4 thay vì phiếu). Giờ chèn phiếu vào
 * chính trang + CSS chỉ áp dụng khi in: ẩn mọi thứ khác, chỉ hiện phiếu
 * (khổ 80mm theo CSS của phiếu). Dọn sạch sau khi in (sự kiện afterprint,
 * dự phòng 60 giây). */
export function printViaSystem(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const slipCss = Array.from(parsed.querySelectorAll("style"))
    .map((s) => s.textContent ?? "")
    .join("\n");
  // @page (khổ giấy 80mm) phải nằm NGOÀI @media print — lồng bên trong thì
  // Chrome bỏ qua (thử thực tế: ra khổ Letter). @page chỉ có tác dụng khi in.
  const pageRules = (slipCss.match(/@page\s*\{[^}]*\}/g) ?? []).join("\n");
  const bodyCss = slipCss.replace(/@page\s*\{[^}]*\}/g, "");

  document.getElementById(PRINT_SLIP_ID)?.remove();
  document.getElementById(`${PRINT_SLIP_ID}-style`)?.remove();

  const holder = document.createElement("div");
  holder.id = PRINT_SLIP_ID;
  holder.setAttribute("aria-hidden", "true");
  holder.innerHTML = parsed.body.innerHTML;

  const style = document.createElement("style");
  style.id = `${PRINT_SLIP_ID}-style`;
  style.textContent = `#${PRINT_SLIP_ID}{display:none}
${pageRules}
@media print{
body > *:not(#${PRINT_SLIP_ID}){display:none !important}
#${PRINT_SLIP_ID}{display:block !important}
${bodyCss}
}`;

  document.head.appendChild(style);
  document.body.appendChild(holder);

  // Tên file PDF / tiêu đề bản in = tên phiếu thay vì tên trang web.
  const previousTitle = document.title;
  const slipTitle = parsed.title.trim();
  if (slipTitle) document.title = slipTitle;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    holder.remove();
    style.remove();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60_000);
  try {
    window.print();
  } catch {
    cleanup();
    throw new Error("Trình duyệt không hỗ trợ in.");
  }
}

/** In phiếu thanh toán theo chế độ đã cấu hình. Chế độ USB mà chưa kết
 * nối được máy in → throw, để giao diện báo rõ cho nhân viên. */
export async function printPaymentSlip(order: Order): Promise<void> {
  if (getPrintMode() === "usb") {
    if (!isPrinterConnected()) {
      const ok = await reconnectPrinter();
      if (!ok) {
        throw new Error(
          'Chưa kết nối máy in USB — vào "Cấu hình máy in" để kết nối.',
        );
      }
    }
    await sendBytes(buildPaymentSlipBytes(order));
    return;
  }
  printViaSystem(buildPaymentSlipHtml(order));
}
