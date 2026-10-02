// GioiThieu — trang "Giới thiệu": thông tin doanh nghiệp, chuỗi cửa hàng,
// điều khoản khuyến mại. Dùng làm nội dung để dán vào ô "Link Điều khoản"
// ở các trang quản lý khuyến mại (Hệ 1/Đăng ký/Doanh số).
//
// Chuỗi cửa hàng lấy THẬT từ danh sách nhà hàng trong hệ thống (useRestaurants)
// — KHÔNG hardcode số lượng chi nhánh. Trước đây từng có câu "Bún bò Huế 65
// có 10 cơ sở tại Hà Nội" bị xoá (xem OrderingPartners.tsx) vì không xác
// thực được — tránh lặp lại bằng cách hiện đúng dữ liệu thật, tự cập nhật
// khi có thêm/bớt chi nhánh, không cần sửa code mỗi lần đổi.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRestaurants } from "@/hooks/useQueries";
import {
  BUSINESS_PEOPLE,
  COMPANY_INFO,
  FOOD_SAFETY_CERT,
} from "@/lib/company-info";
import {
  BadgeCheck,
  ChevronDown,
  FileImage,
  Loader2,
  Navigation,
  Phone,
} from "lucide-react";
import { type ReactNode, useState } from "react";

const TERMS: string[] = [
  "Các chương trình khuyến mại chỉ áp dụng cho khách hàng đã xác thực email qua mã OTP.",
  "Mỗi đơn hàng chỉ áp dụng tối đa 1 phiếu giảm giá. Khuyến mại theo khung giờ và phiếu giảm giá có thể cộng dồn với nhau.",
  "Mỗi chương trình có giới hạn số lượt/ngày (tổng và theo từng khách hàng). Khi đạt giới hạn, khuyến mại tự động ngừng áp dụng cho các đơn tiếp theo trong ngày.",
  "Phiếu giảm giá không quy đổi thành tiền mặt, không áp dụng cho đơn đã đặt trước khi phiếu được phát hành.",
  "Doanh nghiệp có quyền điều chỉnh hoặc chấm dứt chương trình khuyến mại bất kỳ lúc nào mà không cần báo trước, đối với các chương trình chưa có khách hàng sử dụng.",
  "Quyết định của Doanh nghiệp về các tranh chấp liên quan đến khuyến mại là quyết định cuối cùng.",
];

// Mục mở/đóng dùng chung (bản xem trước đã duyệt: thông tin doanh nghiệp,
// giấy chứng nhận, điều khoản thu gọn; nội dung giữ nguyên).
function Section({
  title,
  ocid,
  id,
  defaultOpen = false,
  children,
}: {
  title: string;
  ocid: string;
  id?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card px-4 shadow-sm"
      data-ocid={ocid}
    >
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-foreground">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function InfoRow({
  label,
  children,
  ocid,
}: {
  label: string;
  children: ReactNode;
  ocid?: string;
}) {
  return (
    <div
      className="grid grid-cols-[7.5rem_1fr] gap-3 border-t border-border py-2.5 text-sm first:border-t-0"
      data-ocid={ocid}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

function tel(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function mapsUrl(r: { lat: number; lng: number; address: string }): string {
  const hasCoords =
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    !(r.lat === 0 && r.lng === 0);
  const q = hasCoords ? `${r.lat},${r.lng}` : r.address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function GioiThieu() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const visibleRestaurants = (restaurants ?? []).filter((r) => r.visible);
  const [certOpen, setCertOpen] = useState(false);
  const certValid = Date.now() < FOOD_SAFETY_CERT.validUntil.getTime();
  // Trang này còn làm "Link Điều khoản" cho các chương trình khuyến mại —
  // mở sẵn mục điều khoản khi link có #dieu-khoan.
  const termsFromLink =
    typeof window !== "undefined" && window.location.hash === "#dieu-khoan";

  return (
    <section
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8"
      data-ocid="gioi_thieu.page"
    >
      <h1 className="sr-only">Giới thiệu</h1>

      {/* Đầu trang: logo + khẩu hiệu + gọi hotline + huy hiệu ATTP. */}
      <header className="flex items-center gap-3">
        <img
          src="/assets/images/logo-mark.png"
          alt=""
          className="h-14 w-14 shrink-0 rounded-full object-contain"
        />
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-foreground">
            Bún Bò Huế 65
          </p>
          <p className="text-sm text-muted-foreground">
            Hương vị Huế truyền thống, gói trọn trong từng tô bún
          </p>
        </div>
      </header>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Bún Bò Huế 65 mang đến hương vị đậm đà, chuẩn vị cố đô — từ nước dùng
        ninh xương nhiều giờ đến từng loại rau thơm được tuyển chọn kỹ lưỡng mỗi
        ngày.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={tel(COMPANY_INFO.phone)}
          data-ocid="gioi_thieu.hotline_button"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-gradient-primary px-3 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          {COMPANY_INFO.phone}
        </a>
        <button
          type="button"
          onClick={() => setCertOpen(true)}
          data-ocid="gioi_thieu.cert_badge"
          className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border bg-card px-3 text-sm font-semibold transition-smooth hover:bg-secondary ${
            certValid
              ? "border-accent text-accent"
              : "border-destructive text-destructive"
          }`}
        >
          <BadgeCheck className="h-4 w-4" aria-hidden="true" />
          ATTP {FOOD_SAFETY_CERT.number.split("/").slice(0, 2).join("/")}
        </button>
      </div>

      {/* Chuỗi cửa hàng — lấy thật từ hệ thống (không hardcode), dạng
          thẻ có nút Gọi + Chỉ đường thay cho bảng phải kéo ngang. */}
      <div
        className="flex flex-col gap-2.5"
        data-ocid="gioi_thieu.restaurant_chain"
      >
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Chuỗi cửa hàng
          {visibleRestaurants.length > 0
            ? ` · ${visibleRestaurants.length} chi nhánh`
            : ""}
        </h2>
        {restaurantsLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải…
          </div>
        ) : visibleRestaurants.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-7 text-center text-sm text-muted-foreground">
            Chưa có thông tin chi nhánh.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {visibleRestaurants.map((r) => (
              <div
                key={r.restaurantId}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 shadow-sm"
                data-ocid={`gioi_thieu.restaurant.${r.restaurantId}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-foreground">{r.name}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-accent">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    Đang hoạt động
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.address || "—"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {r.phone ? (
                    <a
                      href={tel(r.phone)}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-border text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      Gọi
                    </a>
                  ) : (
                    <span />
                  )}
                  <a
                    href={mapsUrl(r)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md border border-border text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    Chỉ đường
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Section title="Thông tin doanh nghiệp" ocid="gioi_thieu.business_info">
        <dl>
          <InfoRow label="Đơn vị">{COMPANY_INFO.name}</InfoRow>
          <InfoRow label="Mã số thuế">
            <span className="font-mono">{COMPANY_INFO.taxCode}</span>
          </InfoRow>
          <InfoRow label="Trụ sở">{COMPANY_INFO.address}</InfoRow>
          <InfoRow label="Chủ doanh nghiệp" ocid="gioi_thieu.owner">
            {BUSINESS_PEOPLE.owner}
          </InfoRow>
          <InfoRow label="Vận hành website" ocid="gioi_thieu.website_operator">
            {BUSINESS_PEOPLE.websiteOperator} ·{" "}
            <a
              href={tel(BUSINESS_PEOPLE.websiteOperatorPhone)}
              className="text-primary underline-offset-2 hover:underline"
            >
              {BUSINESS_PEOPLE.websiteOperatorPhone}
            </a>
          </InfoRow>
          <InfoRow label="Hotline">
            <a
              href={tel(COMPANY_INFO.phone)}
              className="text-primary underline-offset-2 hover:underline"
            >
              {COMPANY_INFO.phone}
            </a>
          </InfoRow>
          <InfoRow label="Đặt món online">
            <a
              href="https://www.bunbohue65.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              www.bunbohue65.com
            </a>
          </InfoRow>
        </dl>
      </Section>

      <Section
        title="Giấy chứng nhận an toàn thực phẩm"
        ocid="gioi_thieu.food_safety_cert"
      >
        <div className="flex flex-col gap-3 text-sm">
          <span
            className={
              certValid
                ? "inline-flex w-fit items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent"
                : "inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-[11px] font-bold text-destructive"
            }
          >
            {certValid
              ? `Còn hiệu lực đến ${FOOD_SAFETY_CERT.validUntilText}`
              : `Đã hết hạn từ ${FOOD_SAFETY_CERT.validUntilText}`}
          </span>
          <dl>
            <InfoRow label="Số">
              <span className="font-mono">{FOOD_SAFETY_CERT.number}</span>
            </InfoRow>
            <InfoRow label="Cơ quan cấp">{FOOD_SAFETY_CERT.issuer}</InfoRow>
            <InfoRow label="Ngày cấp">
              {FOOD_SAFETY_CERT.issuedText} · hiệu lực 3 năm
            </InfoRow>
            <InfoRow label="Loại hình">{FOOD_SAFETY_CERT.scope}</InfoRow>
          </dl>
          <button
            type="button"
            onClick={() => setCertOpen(true)}
            data-ocid="gioi_thieu.view_cert_button"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
          >
            <FileImage className="h-4 w-4" aria-hidden="true" />
            Xem giấy chứng nhận gốc
          </button>
        </div>
      </Section>

      <Section
        title={`Điều khoản khuyến mại (${TERMS.length})`}
        ocid="gioi_thieu.promotion_terms"
        id="dieu-khoan"
        defaultOpen={termsFromLink}
      >
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
      </Section>

      <a
        href="/dieu-khoan"
        data-ocid="gioi_thieu.terms_link"
        className="flex min-h-[48px] items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground shadow-sm"
      >
        Điều khoản giao dịch & thông tin cá nhân
        <span className="text-muted-foreground" aria-hidden="true">
          ›
        </span>
      </a>

      <Dialog open={certOpen} onOpenChange={setCertOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle>Giấy chứng nhận ATTP</DialogTitle>
            <DialogDescription>
              Số {FOOD_SAFETY_CERT.number} — {FOOD_SAFETY_CERT.issuer}
            </DialogDescription>
          </DialogHeader>
          {certOpen && (
            <img
              src={FOOD_SAFETY_CERT.imageUrl}
              alt={`Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm số ${FOOD_SAFETY_CERT.number}`}
              className="w-full rounded-md border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
