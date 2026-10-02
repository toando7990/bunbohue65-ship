// "Tạm ngưng nhận đơn trực tuyến": admin đặt giờ mở cửa BẰNG giờ đóng cửa
// (VD 00:00 – 00:00). Canister coi khoảng [mở, đóng) rỗng → luôn đóng cửa,
// nên đây không phải "ngoài giờ" thông thường (không có giờ mở lại để đếm
// ngược) — trang đặt món hiện thông báo tạm ngưng thay vì đồng hồ.
export interface StoreHoursLike {
  openHour: bigint | number;
  openMinute: bigint | number;
  closeHour: bigint | number;
  closeMinute: bigint | number;
}

export function isStorePaused(h: StoreHoursLike | null | undefined): boolean {
  if (!h) return false;
  return (
    Number(h.openHour) === Number(h.closeHour) &&
    Number(h.openMinute) === Number(h.closeMinute)
  );
}

export const PAUSED_TITLE = "Tạm ngưng nhận đơn trực tuyến";
export const PAUSED_MESSAGE =
  "Bún Bò Huế 65 đang tạm ngưng nhận đơn qua website. Chúng tôi sẽ sớm phục vụ lại, mong bạn thông cảm.";
