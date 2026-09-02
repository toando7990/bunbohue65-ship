// PromotionBanner — banner khuyến mại (KM) trên trang đặt món. 3 trạng thái
// hiển thị (xem giao diện mẫu đã duyệt trước khi build):
//   1. "upcoming" — sắp tới khung giờ KM hôm nay: đếm ngược màu vàng.
//   2. "active" — đang trong khung giờ KM: đếm ngược màu đỏ + nhắc xác
//      thực email nếu máy này chưa từng xác thực (bấm mở EmailVerificationDialog
//      có sẵn, không xây lại).
//   3. "active" + đã xác thực — dòng xác nhận xanh, không cần thao tác gì
//      thêm (KM tự áp dụng lúc đặt đơn, xử lý ở VPS/canister).
// "hidden" (ngoài mọi khung giờ hôm nay, hoặc không có chương trình nào) —
// component trả về null, không chiếm chỗ.

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import { useCurrentPromotion } from "@/hooks/useQueries";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { CheckCircle2, Clock, Mail } from "lucide-react";
import { useState } from "react";

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

export function PromotionBanner() {
  const { data: promotion } = useCurrentPromotion();
  const countdown = usePromotionCountdown(promotion);
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Đọc mỗi lần render — đủ dùng vì component này không render lại liên
  // tục ngoài nhịp đếm ngược 1s (usePromotionCountdown), và xác thực xong
  // sẽ tự re-render qua state verifyOpen đóng lại + EmailVerificationDialog
  // gọi onVerified.
  const verifiedEmail = getVerifiedEmail();

  if (countdown.kind === "hidden" || !promotion) {
    return null;
  }

  // Tóm tắt các mức chiết khấu, sắp tăng dần theo mức tối thiểu — ví dụ
  // "Đơn từ 150.000đ giảm 15.000đ · từ 300.000đ giảm 30.000đ".
  const tiersSummary = [...promotion.tiers]
    .sort((a, b) => Number(a.minOrderValue) - Number(b.minOrderValue))
    .map(
      (t) =>
        `${t === promotion.tiers[0] ? "Đơn từ" : "từ"} ${formatVnd(t.minOrderValue)} giảm ${formatVnd(t.discountAmount)}`,
    )
    .join(" · ");

  const isActive = countdown.kind === "active";

  return (
    <>
      <div
        className={
          isActive
            ? "mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3"
            : "mb-4 rounded-md border border-warning/30 bg-warning/10 p-3"
        }
        data-ocid="promotion_banner"
        data-ocid-state={countdown.kind}
      >
        <div className="flex items-center gap-2">
          <Clock
            className={
              isActive
                ? "h-4 w-4 shrink-0 text-destructive"
                : "h-4 w-4 shrink-0 text-warning"
            }
            aria-hidden="true"
          />
          <span
            className={
              isActive
                ? "text-sm font-semibold text-destructive"
                : "text-sm font-semibold text-warning"
            }
            data-ocid="promotion_banner.countdown"
          >
            {isActive
              ? `${promotion.name} — còn ${countdown.formatted}`
              : `${promotion.name} bắt đầu sau ${countdown.formatted}`}
          </span>
        </div>

        {tiersSummary && (
          <p className="ml-6 mt-1 text-xs text-muted-foreground">
            {tiersSummary}
          </p>
        )}

        {promotion.termsUrl && (
          <a
            href={promotion.termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-6 mt-1 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            data-ocid="promotion_banner.terms_link"
          >
            Điều khoản
          </a>
        )}

        {isActive && (
          <div className="ml-6 mt-2">
            {verifiedEmail ? (
              <p
                className="flex items-center gap-1.5 text-xs text-success"
                data-ocid="promotion_banner.verified_notice"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Email đã xác thực — đơn của bạn sẽ tự áp dụng ưu đãi
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5">
                <Mail
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">
                  Xác thực email để nhận ưu đãi này
                </span>
                <button
                  type="button"
                  onClick={() => setVerifyOpen(true)}
                  className="ml-auto shrink-0 rounded-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground transition-smooth hover:opacity-90"
                  data-ocid="promotion_banner.verify_button"
                >
                  Xác thực
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <EmailVerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={() => setVerifyOpen(false)}
      />
    </>
  );
}
