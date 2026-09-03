// GioiThieu — trang "Giới thiệu": thông tin doanh nghiệp, chuỗi cửa hàng,
// điều khoản khuyến mại. Dùng làm nội dung để dán vào ô "Link Điều khoản"
// ở các trang quản lý khuyến mại (Hệ 1/Đăng ký/Doanh số).
//
// Chuỗi cửa hàng lấy THẬT từ danh sách nhà hàng trong hệ thống (useRestaurants)
// — KHÔNG hardcode số lượng chi nhánh. Trước đây từng có câu "Bún bò Huế 65
// có 10 cơ sở tại Hà Nội" bị xoá (xem OrderingPartners.tsx) vì không xác
// thực được — tránh lặp lại bằng cách hiện đúng dữ liệu thật, tự cập nhật
// khi có thêm/bớt chi nhánh, không cần sửa code mỗi lần đổi.

import { useRestaurants } from "@/hooks/useQueries";
import {
  Building2,
  Globe,
  Info,
  Loader2,
  MapPin,
  Phone,
  ScrollText,
  Store,
} from "lucide-react";

const TERMS: string[] = [
  "Các chương trình khuyến mại chỉ áp dụng cho khách hàng đã xác thực email qua mã OTP.",
  "Mỗi đơn hàng chỉ áp dụng tối đa 1 phiếu giảm giá. Khuyến mại theo khung giờ và phiếu giảm giá có thể cộng dồn với nhau.",
  "Mỗi chương trình có giới hạn số lượt/ngày (tổng và theo từng khách hàng). Khi đạt giới hạn, khuyến mại tự động ngừng áp dụng cho các đơn tiếp theo trong ngày.",
  "Phiếu giảm giá không quy đổi thành tiền mặt, không áp dụng cho đơn đã đặt trước khi phiếu được phát hành.",
  "Doanh nghiệp có quyền điều chỉnh hoặc chấm dứt chương trình khuyến mại bất kỳ lúc nào mà không cần báo trước, đối với các chương trình chưa có khách hàng sử dụng.",
  "Quyết định của Doanh nghiệp về các tranh chấp liên quan đến khuyến mại là quyết định cuối cùng.",
];

export default function GioiThieu() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const visibleRestaurants = (restaurants ?? []).filter((r) => r.visible);

  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6"
      data-ocid="gioi_thieu.page"
    >
      <header className="mb-6 flex items-center gap-2">
        <Info className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Giới thiệu
        </h1>
      </header>

      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-accent">
          Về chúng tôi
        </p>
        <h2 className="mb-2 font-display text-lg font-bold leading-snug text-foreground">
          Hương vị Huế truyền thống, gói trọn trong từng tô bún
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Bún Bò Huế 65 mang đến hương vị đậm đà, chuẩn vị cố đô — từ nước dùng
          ninh xương nhiều giờ đến từng loại rau thơm được tuyển chọn kỹ lưỡng
          mỗi ngày.
        </p>
      </div>

      {/* Thông tin doanh nghiệp */}
      <div className="mt-6" data-ocid="gioi_thieu.business_info">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Thông tin doanh nghiệp
        </h3>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          <div className="flex items-start gap-3 px-4 py-3 text-sm">
            <Building2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-muted-foreground">Đơn vị</span>
            <span className="font-medium text-foreground">
              Công ty TNHH Thực phẩm Gia Khánh (Gia Khánh Foods)
            </span>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 text-sm">
            <ScrollText
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-muted-foreground">
              Mã số thuế
            </span>
            <span className="font-medium text-foreground">0111063397</span>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 text-sm">
            <MapPin
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-muted-foreground">Trụ sở</span>
            <span className="font-medium text-foreground">
              69 đường Láng, P. Đống Đa, Tp. Hà Nội
            </span>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 text-sm">
            <Phone
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-muted-foreground">Hotline</span>
            <a
              href="tel:0838656865"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              0838 656 865
            </a>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 text-sm">
            <Globe
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-muted-foreground">
              Đặt món online
            </span>
            <a
              href="https://www.bunbohue65.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              https://www.bunbohue65.com
            </a>
          </div>
        </div>
      </div>

      {/* Chuỗi cửa hàng — lấy thật từ hệ thống, không hardcode */}
      <div className="mt-6" data-ocid="gioi_thieu.restaurant_chain">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <Store className="h-4 w-4 text-primary" aria-hidden="true" />
          Chuỗi cửa hàng
        </h3>
        {restaurantsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải…
          </div>
        ) : visibleRestaurants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có thông tin chi nhánh.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visibleRestaurants.map((r) => (
              <div
                key={r.restaurantId}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                data-ocid={`gioi_thieu.restaurant.${r.restaurantId}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
                  <Store className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{r.name}</p>
                  {r.address && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.address}
                    </p>
                  )}
                  {r.phone && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Điều khoản khuyến mại */}
      <div className="mt-6" data-ocid="gioi_thieu.promotion_terms">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold text-foreground">
          <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
          Điều khoản khuyến mại
        </h3>
        <div className="rounded-xl border border-border bg-card p-4">
          <ol className="flex flex-col gap-3">
            {TERMS.map((term, i) => (
              <li key={term} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-foreground">{term}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
