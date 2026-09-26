// Ghép địa chỉ + ghi chú (số tầng/phòng/ghi chú cho tài xế) thành 1
// dòng — dùng làm địa chỉ giao hàng gửi Lalamove/đơn hàng, và hiển thị
// địa chỉ đã chọn trong giỏ hàng.
export function fullAddress(a: { address: string; detail?: string }): string {
  const address = a.address.trim();
  const detail = (a.detail ?? "").trim();
  return detail ? `${address} — ${detail}` : address;
}

// Bỏ phần đuôi thừa Google hay trả về (", Việt Nam", mã bưu chính 5-6
// số) cho địa chỉ gọn, dễ đọc với tài xế.
export function tidyGoogleAddress(formatted: string): string {
  return formatted
    .replace(/,\s*(Việt Nam|Vietnam|Viet Nam)\s*$/i, "")
    .replace(/\s+\d{5,6}(?=\s*(,|$))/g, "")
    .replace(/\s*,\s*,/g, ",")
    .trim();
}
