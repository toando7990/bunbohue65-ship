// RegistrationPromoBanner — banner "Khuyến mại đăng ký" (chào mừng khách
// mới) trên trang đặt món. CHỈ hiện khi CẢ 2 điều kiện đúng:
//   1. Có chương trình đăng ký đang trong hiệu lực hôm nay (canister
//      getCurrentRegistrationPromo — đã lọc active + khoảng ngày).
//   2. Khách CHƯA TỪNG xác thực email trên máy này (getVerifiedEmail()
//      localStorage === null — khớp đúng ý nghĩa "khách mới": phiếu
//      đăng ký chỉ phát 1 lần duy nhất trong đời khi xác thực OTP LẦN
//      ĐẦU, xem mixins/email-verification-api.mo).
// Khách đã từng xác thực (dù ở máy khác) mà máy này chưa lưu verified
// state vẫn sẽ thấy banner — chấp nhận được vì canister sẽ tự chặn phát
// trùng phiếu (RegistrationBonusIssuedStore theo dõi theo email suốt
// lịch sử), banner chỉ là gợi ý hiển thị, không phải điều kiện phát
// thưởng thật.

import { useCurrentRegistrationPromo } from "@/hooks/useQueries";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { CalendarRange, PartyPopper } from "lucide-react";

function formatVnd(n: bigint | number): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `${n} đ`;
  }
}

// "YYYYMMDD" -> "dd/mm/yyyy" (cùng công thức đã dùng ở
// PromotionTable.tsx/PromotionBanner.tsx/SalesProgressPanel.tsx).
function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

export function RegistrationPromoBanner() {
  const { data: promo } = useCurrentRegistrationPromo();
  // Đọc mỗi lần render — cùng quy ước đã dùng ở PromotionBanner.tsx (đủ
  // dùng, component không render lại liên tục ngoài lúc xác thực xong).
  const alreadyVerified = getVerifiedEmail() !== null;

  if (!promo || alreadyVerified) {
    return null;
  }

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-md border border-accent/30 bg-gradient-to-br from-accent/10 to-card p-3"
      data-ocid="registration_promo_banner"
    >
      <span
        className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-accent-foreground"
        data-ocid="registration_promo_banner.badge"
      >
        Khách mới
      </span>

      <div className="flex items-center gap-1.5 pr-16">
        <PartyPopper
          className="h-4 w-4 shrink-0 text-accent"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-foreground">
          Ưu đãi chào mừng bạn mới!
        </span>
      </div>

      <p className="ml-6 mt-1 text-xs text-muted-foreground">
        Xác thực email lần đầu, nhận ngay phiếu giảm giá{" "}
        {formatVnd(promo.voucherValue)} cho đơn tiếp theo — có hiệu lực{" "}
        {promo.voucherValidDays.toString()} ngày kể từ lúc nhận.
      </p>

      {/* Ưu đãi kèm theo (đã xác nhận với người dùng): ngoài phiếu của
          chính chương trình đăng ký, khách mới vẫn được tham gia đầy đủ
          các chương trình khuyến mại khác đang chạy (Hệ 1/Doanh số) như
          mọi khách hàng khác — không bị giới hạn chỉ 1 chương trình. */}
      <p className="ml-6 mt-1 text-xs text-muted-foreground">
        Ngoài ưu đãi này, bạn vẫn được tham gia đầy đủ các chương trình khuyến
        mại khác đang diễn ra.
      </p>

      <p
        className="ml-6 mt-1.5 flex items-center gap-1 border-t border-dashed border-border pt-1.5 text-[11px] text-muted-foreground"
        data-ocid="registration_promo_banner.validity"
      >
        <CalendarRange className="h-3 w-3 shrink-0" aria-hidden="true" />
        Chương trình áp dụng: từ {formatDate(promo.startDate)} đến{" "}
        {formatDate(promo.endDate)}
      </p>

      {promo.termsUrl && (
        <a
          href={promo.termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-6 mt-1 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          data-ocid="registration_promo_banner.terms_link"
        >
          Điều khoản
        </a>
      )}
    </div>
  );
}
