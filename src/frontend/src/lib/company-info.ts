// Thông tin doanh nghiệp CỐ ĐỊNH — dùng cho phiếu in tại quầy
// (PrintReceipt). Lấy đúng theo trang "Giới thiệu" (GioiThieu.tsx) đã
// hiển thị công khai — KHÔNG hardcode lại số liệu khác, giữ đồng bộ 1
// nguồn duy nhất.
export const COMPANY_INFO = {
  name: "Công ty TNHH Thực phẩm Gia Khánh (Gia Khánh Foods)",
  taxCode: "0111063397",
  address: "69 đường Láng, P. Đống Đa, Tp. Hà Nội",
  phone: "0838 656 865",
} as const;
