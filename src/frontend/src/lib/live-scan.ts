// Tính vùng cần cắt trên khung hình camera để lấy ĐÚNG phần nằm trong khung
// ngắm (màn "Quét màn hình tài xế"). Video hiển thị kiểu object-fit: cover
// (phủ kín khung, cắt bớt 2 bên hoặc trên/dưới) nên phải quy đổi toạ độ
// khung ngắm trên màn hình → toạ độ trong khung hình gốc của camera.

import type { PickupLookupMatch } from "@/lib/vps-client";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function coverCropRect(
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number,
  box: Rect,
): Rect | null {
  if (!videoW || !videoH || !containerW || !containerH) return null;
  // object-fit: cover → tỉ lệ phóng = lớn hơn trong 2 chiều.
  const scale = Math.max(containerW / videoW, containerH / videoH);
  const visibleW = containerW / scale;
  const visibleH = containerH / scale;
  const offX = (videoW - visibleW) / 2;
  const offY = (videoH - visibleH) / 2;
  let x = offX + box.x / scale;
  let y = offY + box.y / scale;
  let w = box.w / scale;
  let h = box.h / scale;
  // Kẹp trong khung hình gốc.
  x = Math.max(0, Math.min(x, videoW));
  y = Math.max(0, Math.min(y, videoH));
  w = Math.max(0, Math.min(w, videoW - x));
  h = Math.max(0, Math.min(h, videoH - y));
  if (w < 8 || h < 8) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

// Kích thước ảnh gửi đi: cạnh ngang tối đa maxW (chữ vẫn đủ nét để đọc,
// ảnh nhỏ → đọc nhanh hơn nhiều so với ảnh chụp 2000px).
export function fitWidth(
  w: number,
  h: number,
  maxW = 1200,
): { w: number; h: number } {
  if (w <= maxW) return { w: Math.round(w), h: Math.round(h) };
  const k = maxW / w;
  return { w: maxW, h: Math.round(h * k) };
}

export function canLiveScan(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

// Quyết định sau mỗi khung đã đọc:
//  - có đơn KÈM mã nhận hàng đã khớp → xong ngay;
//  - thấy đơn nhưng CHƯA đọc được mã → quét thêm tối đa extraLimit khung
//    (nhanh hơn, 300ms) để lấy cả mã; hết lượt → xong với đơn đã thấy
//    (màn thanh toán sẽ hỏi mã như bình thường);
//  - chưa thấy gì → quét tiếp.
export interface ScanState {
  pending: PickupLookupMatch[] | null;
  extra: number;
}
export type ScanDecision =
  | { action: "finish"; matches: PickupLookupMatch[] }
  | { action: "continue"; state: ScanState; delayMs: number };

export function decideAfterFrame(
  state: ScanState,
  matches: PickupLookupMatch[],
  opts: { intervalMs?: number; extraLimit?: number } = {},
): ScanDecision {
  const intervalMs = opts.intervalMs ?? 700;
  const extraLimit = opts.extraLimit ?? 3;
  if (matches.some((m) => m.pickupCode)) return { action: "finish", matches };
  let { pending, extra } = state;
  if (matches.length > 0) {
    pending = matches;
    extra += 1;
  } else if (pending) {
    extra += 1;
  }
  if (pending && extra > extraLimit)
    return { action: "finish", matches: pending };
  return {
    action: "continue",
    state: { pending, extra },
    delayMs: pending ? 300 : intervalMs,
  };
}
