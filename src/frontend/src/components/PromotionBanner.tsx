// PromotionBanner — banner khuyến mại (KM) trên trang đặt món. 3 trạng thái
// hiển thị:
//   1. "upcoming" — sắp tới khung giờ KM hôm nay: đếm ngược màu vàng.
//   2. "active" — đang trong khung giờ KM: đếm ngược màu đỏ + nhắc xác
//      thực email nếu máy này chưa từng xác thực (bấm mở EmailVerificationDialog
//      có sẵn, không xây lại).
//   3. "active" + đã xác thực — KHÔNG hiện gì thêm ở vị trí xác thực (đã ẩn
//      theo yêu cầu — trước đây có dòng xác nhận xanh, giờ bỏ để gọn hơn;
//      KM vẫn tự áp dụng lúc đặt đơn như cũ, xử lý ở VPS/canister).
// "hidden" (ngoài mọi khung giờ hôm nay, hoặc không có chương trình nào) —
// component trả về null, không chiếm chỗ.
//
// Bố cục (đã duyệt bản xem trước trước khi build): mỗi mức khuyến mại hiện
// thành 1 dòng riêng (không gộp chung 1 câu như trước) để nổi bật hơn; 2
// thanh tiến trình (tổng hệ thống/của riêng bạn) đặt CÙNG 1 HÀNG, phân biệt
// bằng màu, không kèm câu giải thích dài; thời hạn hiệu lực chuyển xuống
// góc dưới bên phải.

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import {
  useCurrentPromotion,
  useKmDailyCount,
  useKmUsageCount,
} from "@/hooks/useQueries";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { CalendarRange, ChevronDown, Clock, Mail } from "lucide-react";
import { type ReactNode, useState } from "react";

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

// "YYYYMMDD" -> "dd/mm" (bỏ năm — luôn trong năm hiện tại, rút gọn cho
// đúng bố cục góc dưới bên phải).
function formatDateShort(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}`;
}

// collapsible: trang đặt món từ xa — chỉ hiện 1 dòng (tên + mức giảm cao
// nhất + đếm ngược), bấm "Chi tiết" mới mở các mức, thanh tiến trình và
// `details` (dòng chạy KM đăng ký/khách thân thiết). Khi không có Giờ Vàng
// nào hôm nay, hiện `hiddenFallback` thay vào (để dòng chạy KM không mất).
export function PromotionBanner({
  collapsible = false,
  details,
  hiddenFallback,
}: {
  collapsible?: boolean;
  details?: ReactNode;
  hiddenFallback?: ReactNode;
} = {}) {
  const [expanded, setExpanded] = useState(false);
  const { data: promotion } = useCurrentPromotion();
  // Chỉ áp dụng cho kênh đặt từ xa — chương trình có thể đang active nhưng
  // bị tắt riêng cho kênh này (enabledOnline=false, đặt tại quầy vẫn dùng
  // được) — truyền null để usePromotionCountdown tự trả về "hidden".
  const countdown = usePromotionCountdown(
    promotion?.enabledOnline ? promotion : null,
  );
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Đọc mỗi lần render — đủ dùng vì component này không render lại liên
  // tục ngoài nhịp đếm ngược 1s (usePromotionCountdown), và xác thực xong
  // sẽ tự re-render qua state verifyOpen đóng lại + EmailVerificationDialog
  // gọi onVerified.
  const verifiedEmail = getVerifiedEmail();

  // Gọi TRƯỚC nhánh return sớm bên dưới (quy tắc Hook) — bản thân 2 hook
  // này tự bỏ qua (enabled=false) khi chưa có promotion/email, không tốn
  // request thừa.
  const { data: dailyCount } = useKmDailyCount(promotion?.code ?? null);
  const { data: customerCount } = useKmUsageCount(
    verifiedEmail?.email ?? null,
    promotion?.code ?? null,
  );

  if (countdown.kind === "hidden" || !promotion) {
    return hiddenFallback ? <>{hiddenFallback}</> : null;
  }

  const sortedTiers = [...promotion.tiers].sort(
    (a, b) => Number(a.minOrderValue) - Number(b.minOrderValue),
  );

  const isActive = countdown.kind === "active";
  const showDetails = !collapsible || expanded;
  const maxDiscount = sortedTiers.reduce(
    (m, t) => (Number(t.discountAmount) > m ? Number(t.discountAmount) : m),
    0,
  );

  const dailyPercent =
    dailyCount !== undefined && promotion.dailyOrderLimit > 0n
      ? Math.min(
          100,
          (Number(dailyCount) / Number(promotion.dailyOrderLimit)) * 100,
        )
      : 0;
  const customerPercent =
    customerCount !== undefined && promotion.perCustomerDailyLimit > 0n
      ? Math.min(
          100,
          (Number(customerCount) / Number(promotion.perCustomerDailyLimit)) *
            100,
        )
      : 0;

  return (
    <>
      <div
        className={`${collapsible ? "" : "mb-4 "}rounded-md border ${
          isActive
            ? "border-destructive/30 bg-destructive/10"
            : "border-warning/30 bg-warning/10"
        } ${collapsible && !expanded ? "px-3 py-2" : "p-3"}`}
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
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              data-ocid="promotion_banner.toggle"
              className="ml-auto inline-flex min-h-[32px] shrink-0 items-center gap-1 text-xs font-semibold text-primary"
            >
              {expanded ? "Thu gọn" : "Chi tiết"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
        {collapsible && !expanded && maxDiscount > 0 && (
          <p
            className="mt-0.5 pl-6 text-xs text-foreground"
            data-ocid="promotion_banner.summary"
          >
            Giảm tới {formatVnd(maxDiscount)} cho đơn đủ điều kiện
          </p>
        )}

        {showDetails && (
          <>
            {/* Mỗi mức khuyến mại 1 dòng riêng — nổi bật hơn bản gộp chung 1
            câu trước đây. */}
            {sortedTiers.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {sortedTiers.map((t) => (
                  <div
                    key={t.minOrderValue.toString()}
                    className="flex items-center justify-between rounded-md bg-card px-2.5 py-1.5"
                    data-ocid="promotion_banner.tier_row"
                  >
                    <span className="text-xs font-medium text-foreground">
                      Đơn từ {formatVnd(t.minOrderValue)}
                    </span>
                    <span className="font-display text-sm font-bold text-destructive">
                      −{formatVnd(t.discountAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 2 thanh tiến trình cùng 1 hàng, phân biệt màu — chỉ hiện khi
            đang trong khung giờ KM (isActive), giống logic cũ. */}
            {isActive && dailyCount !== undefined && (
              <div className="mt-2.5 flex gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Toàn hệ thống
                    </span>
                    <span className="font-display text-[11px] font-bold text-[oklch(0.5_0.15_250)]">
                      {dailyCount.toString()}/
                      {promotion.dailyOrderLimit.toString()}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-[oklch(0.62_0.14_250)] transition-all"
                      style={{ width: `${dailyPercent}%` }}
                    />
                  </div>
                </div>
                {verifiedEmail && customerCount !== undefined && (
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-baseline justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Của bạn
                      </span>
                      <span className="font-display text-[11px] font-bold text-success">
                        {customerCount.toString()}/
                        {promotion.perCustomerDailyLimit.toString()}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${customerPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Nhắc xác thực — CHỈ hiện khi CHƯA xác thực (giữ nguyên hành
            động cần thiết). Khi ĐÃ xác thực: không hiện gì thay thế ở đây
            nữa (trước đây có dòng xác nhận xanh, đã ẩn theo yêu cầu). */}
        {isActive && !verifiedEmail && (
          <div className="mt-2.5 flex items-center gap-2 rounded-md bg-card px-2.5 py-1.5">
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

        {/* Thời hạn hiệu lực + Điều khoản — chuyển xuống góc dưới bên
            phải (trước đây nằm giữa, ngay dưới các mức KM). */}
        {showDetails && (
          <div className="mt-2.5 flex items-center justify-end gap-3">
            {promotion.termsUrl && (
              <a
                href={promotion.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                data-ocid="promotion_banner.terms_link"
              >
                Điều khoản
              </a>
            )}
            <span
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
              data-ocid="promotion_banner.validity"
            >
              <CalendarRange
                className="h-2.5 w-2.5 shrink-0"
                aria-hidden="true"
              />
              {formatDateShort(promotion.startDate)} –{" "}
              {formatDateShort(promotion.endDate)}
            </span>
          </div>
        )}
        {collapsible && expanded && details && (
          <div className="mt-3">{details}</div>
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
