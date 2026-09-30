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

// Chủ doanh nghiệp + người vận hành website đặt món — CHỈ hiện ở trang
// "Giới thiệu" (không in trên phiếu thanh toán — theo yêu cầu).
export const BUSINESS_PEOPLE = {
  owner: "Đỗ Thành Nam",
  websiteOperator: "Đỗ Huy Toàn",
  websiteOperatorPhone: "0903 437 990",
} as const;

// Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm (trang "Giới
// thiệu"). Ảnh gốc: public/assets/images/giay-chung-nhan-attp.jpg — chỉ
// tải khi khách bấm "Xem giấy chứng nhận gốc". Hiệu lực 3 năm kể từ ngày
// ký 10/01/2026; nhãn hiệu lực tự đổi "Đã hết hạn" sau ngày này.
export const FOOD_SAFETY_CERT = {
  number: "70/2026/ATTP-CNĐK",
  issuer: "Sở Y tế Hà Nội (Chi cục An toàn vệ sinh thực phẩm Hà Nội)",
  issuedText: "10/01/2026",
  // Hết hạn sau hết ngày 10/01/2029 giờ Việt Nam.
  validUntil: new Date("2029-01-11T00:00:00+07:00"),
  validUntilText: "10/01/2029",
  scope: "Kinh doanh dịch vụ ăn uống — loại hình nhà hàng",
  imageUrl: "/assets/images/giay-chung-nhan-attp.jpg",
} as const;
