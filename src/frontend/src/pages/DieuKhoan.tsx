// DieuKhoan — "Điều khoản giao dịch" (/dieu-khoan): quyền và nghĩa vụ của
// khách hàng, tài xế (hãng vận chuyển) và doanh nghiệp cho đơn đặt món từ
// xa. Nội dung đã được người dùng duyệt (bản xem trước 3, chốt "theo đề
// xuất": báo lỗi 2 giờ, trả lời 24 giờ, hoàn tiền 7 ngày làm việc, hiệu lực
// 02/10/2026, đồng ý bằng dòng chữ dưới nút Đặt đơn, liên hệ qua hotline;
// khách bỏ đơn: cảnh báo + ghi nhận IP, không chặn).
//
// Căn cứ: Luật Thương mại điện tử 2025 (122/2025/QH15), Nghị định
// 248/2026/NĐ-CP, Luật Bảo vệ quyền lợi người tiêu dùng 2023 (19/2023/QH15),
// Luật Bảo vệ dữ liệu cá nhân 2025 (91/2025/QH15).
//
// #thong-tin-ca-nhan mở sẵn mục 8 (liên kết "Chính sách thông tin cá nhân"
// trong giỏ hàng).

import { BUSINESS_PEOPLE, COMPANY_INFO } from "@/lib/company-info";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE = "02/10/2026";

function Section({
  n,
  title,
  id,
  defaultOpen = false,
  children,
}: {
  n: number;
  title: string;
  id?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card px-4 shadow-sm"
      data-ocid={`dieu_khoan.section.${n}`}
    >
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-foreground">
        {n}. {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-4 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </details>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
      {children}
    </ul>
  );
}

export default function DieuKhoan() {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const privacyFromLink = hash === "#thong-tin-ca-nhan";

  return (
    <section
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8"
      data-ocid="dieu_khoan.page"
    >
      <Link
        to="/profile"
        className="inline-flex min-h-[36px] w-fit items-center gap-1.5 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tôi
      </Link>
      <header>
        <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
          Điều khoản giao dịch
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Áp dụng cho đơn đặt món từ xa tại bunbohue65.com · Phiên bản{" "}
          {TERMS_VERSION} · hiệu lực từ {TERMS_EFFECTIVE}
        </p>
      </header>

      <div
        className="rounded-xl border border-border bg-card p-3 shadow-sm"
        data-ocid="dieu_khoan.summary"
      >
        <h2 className="mb-2 px-1 text-sm font-bold">Tóm tắt 1 phút</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <th className="border-b border-border px-1.5 py-2">Bên</th>
                <th className="border-b border-border px-1.5 py-2">Làm gì</th>
                <th className="border-b border-border px-1.5 py-2">Tiền</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr>
                <td className="border-b border-border px-1.5 py-2 font-bold">
                  Khách
                </td>
                <td className="border-b border-border px-1.5 py-2">
                  Cung cấp đúng thông tin, bấm Đặt tài xế trong 10 phút, có mặt
                  nhận và kiểm tra món
                </td>
                <td className="border-b border-border px-1.5 py-2">
                  Trả tài xế tiền món + phí ship khi nhận
                </td>
              </tr>
              <tr>
                <td className="border-b border-border px-1.5 py-2 font-bold">
                  Tài xế
                </td>
                <td className="border-b border-border px-1.5 py-2">
                  Đối tác của Lalamove / Ahamove: lấy món tại quán, giao đến
                  khách
                </td>
                <td className="border-b border-border px-1.5 py-2">
                  Trả quán tiền món qua QR, thu lại của khách
                </td>
              </tr>
              <tr>
                <td className="px-1.5 py-2 font-bold">Quán</td>
                <td className="px-1.5 py-2">
                  Nấu món, xác nhận đơn, xuất hoá đơn, xử lý khiếu nại
                </td>
                <td className="px-1.5 py-2">
                  Nhận tiền món vào tài khoản công ty
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <Section n={1} title="Các bên tham gia" defaultOpen>
        <List>
          <li>
            <b>Người bán:</b> {COMPANY_INFO.name}, MST {COMPANY_INFO.taxCode},{" "}
            {COMPANY_INFO.address} — chủ sở hữu website bunbohue65.com và các
            nhà hàng Bún Bò Huế 65.
          </li>
          <li>
            <b>Khách hàng:</b> người đặt món trên website.
          </li>
          <li>
            <b>Tài xế:</b> người giao hàng của hãng vận chuyển độc lập
            (Lalamove, Ahamove). Tài xế không phải nhân viên của Người bán và
            làm việc theo điều khoản của hãng.
          </li>
        </List>
      </Section>

      <Section n={2} title="Đặt hàng và xác nhận">
        <List>
          <li>
            Giá món niêm yết <b>đã gồm VAT</b>. Trước khi đặt, giỏ hàng hiện đủ:
            tiền món, phí dụng cụ đựng đồ ăn (tính theo số phần món chính), phí
            ship dự kiến, khuyến mại.
          </li>
          <li>
            Mỗi đơn cần ít nhất 1 món chính. Website chỉ nhận đơn trong giờ mở
            cửa.
          </li>
          <li>
            Bấm <b>Đặt đơn</b>: đơn được gửi tới nhà hàng. Bấm <b>Đặt tài xế</b>
            : khách xác nhận mua, hợp đồng mua bán được xác lập và hệ thống gọi
            tài xế.
          </li>
        </List>
      </Section>

      <Section n={3} title="Huỷ đơn">
        <List>
          <li>
            Trước khi bấm Đặt tài xế: huỷ miễn phí. Quá <b>10 phút</b> chưa đặt
            tài xế, đơn tự huỷ.
          </li>
          <li>
            Đã đặt tài xế: vẫn huỷ được trên website cho tới khi tài xế nhận
            đơn.
          </li>
          <li>
            Tài xế đã nhận đơn: không huỷ trên website; vui lòng gọi hotline.
          </li>
          <li>
            Huỷ đơn thì <b>phiếu giảm giá được hoàn lại</b>, giữ nguyên hạn
            dùng.
          </li>
        </List>
      </Section>

      <Section n={4} title="Giao nhận và thanh toán">
        <List>
          <li>
            Tài xế tới quán, đọc mã nhận hàng,{" "}
            <b>thanh toán tiền món bằng QR</b> vào tài khoản công ty rồi nhận
            món.
          </li>
          <li>
            Khách <b>trả tài xế tiền món + phí ship</b> khi nhận hàng. Phí ship
            do hãng vận chuyển tính; số hiện trên website là dự kiến.
          </li>
          <li>
            Thời gian giao là dự kiến, có thể thay đổi do thời tiết, giao thông.
          </li>
          <li>Khách vui lòng kiểm tra món ngay khi nhận.</li>
        </List>
      </Section>

      <Section n={5} title="Khiếu nại, đổi trả, hoàn tiền">
        <List>
          <li>
            Sai món, thiếu món, món hỏng: báo hotline trong <b>2 giờ</b> sau khi
            nhận, kèm ảnh.
          </li>
          <li>
            Người bán trả lời trong <b>24 giờ</b>; nếu lỗi do quán sẽ{" "}
            <b>giao bù hoặc hoàn tiền</b> phần lỗi qua chuyển khoản trong{" "}
            <b>7 ngày làm việc</b>.
          </li>
          <li>
            Sự cố khi giao (đổ vỡ, trễ, thái độ tài xế): Người bán tiếp nhận và
            làm việc với hãng vận chuyển; bồi thường theo chính sách của hãng.
          </li>
          <li>
            Tranh chấp được thương lượng trước; không thành thì giải quyết theo
            pháp luật Việt Nam.
          </li>
        </List>
      </Section>

      <Section n={6} title="Hoá đơn">
        <List>
          <li>
            Mỗi đơn hoàn tất được xuất hoá đơn điện tử. Tải hoá đơn ở Theo dõi
            đơn hoặc Lịch sử.
          </li>
          <li>
            Cần hoá đơn đứng tên công ty: báo mã số thuế qua hotline{" "}
            <b>trong ngày đặt</b>.
          </li>
        </List>
      </Section>

      <Section n={7} title="Khuyến mại và phiếu giảm giá">
        <p>
          Áp dụng theo{" "}
          <a
            href="/gioi-thieu#dieu-khoan"
            className="font-semibold text-primary underline underline-offset-2"
          >
            Điều khoản khuyến mại
          </a>{" "}
          ở trang Giới thiệu. Phiếu không quy đổi thành tiền mặt.
        </p>
      </Section>

      <Section
        n={8}
        title="Bảo vệ thông tin cá nhân"
        id="thong-tin-ca-nhan"
        defaultOpen={privacyFromLink}
      >
        <List>
          <li>
            <b>Thu thập:</b> họ tên, SĐT, email, địa chỉ và vị trí giao, lịch sử
            đơn, <b>địa chỉ IP</b> của thiết bị khi đặt đơn.
          </li>
          <li>
            <b>Mục đích:</b> xử lý và giao đơn, xuất hoá đơn, chăm sóc khách,{" "}
            <b>phòng chống đơn ảo, bỏ đơn</b> và làm bằng chứng khi có tranh
            chấp; gửi khuyến mại chỉ khi khách bật nhận email.
          </li>
          <li>
            <b>Chia sẻ:</b> tên, SĐT, địa chỉ giao cho hãng vận chuyển; thông
            tin hoá đơn cho nhà cung cấp hoá đơn điện tử; cơ quan nhà nước khi
            pháp luật yêu cầu. Không bán dữ liệu.
          </li>
          <li>
            <b>Lưu trữ:</b> theo thời hạn pháp luật về thương mại điện tử, kế
            toán, thuế.
          </li>
          <li>
            <b>Quyền của khách:</b> xem, sửa ở mục Tôi; yêu cầu xoá, rút lại
            đồng ý qua người vận hành website.
          </li>
        </List>
      </Section>

      <Section n={9} title="Trách nhiệm của khách hàng">
        <List>
          <li>
            <b>Thông tin chính xác:</b> cung cấp đúng họ tên, số điện thoại, địa
            chỉ và ghim vị trí giao. Chi phí phát sinh do thông tin sai (giao
            lại, chênh lệch phí ship theo hãng vận chuyển) do khách chịu.
          </li>
          <li>
            <b>Kiểm tra trước khi đặt:</b> xem kỹ món, số lượng, tổng tiền, phí
            ship dự kiến trong giỏ hàng trước khi bấm Đặt đơn và Đặt tài xế.
          </li>
          <li>
            <b>Nhận hàng:</b> giữ máy để tài xế liên lạc, có mặt hoặc nhờ người
            nhận thay tại địa chỉ đã chọn; kiểm tra món ngay khi nhận.
          </li>
          <li>
            <b>Thanh toán:</b> trả tài xế đủ tiền món + phí ship đúng số hiển
            thị khi nhận hàng.
          </li>
          <li>
            <b>Không bỏ đơn:</b> đã bấm Đặt tài xế mà từ chối nhận không có lý
            do chính đáng (món đúng, giao đúng hẹn) thì khách thanh toán phí
            ship đã phát sinh. Người bán sẽ <b>gửi cảnh báo</b> tới khách và{" "}
            <b>ghi nhận địa chỉ IP</b>, số điện thoại, email của đơn đó để theo
            dõi và làm bằng chứng khi có tranh chấp.
          </li>
          <li>
            <b>Sử dụng đúng mục đích:</b> không đặt đơn ảo, đơn giả danh người
            khác, không dùng nhiều email hay thiết bị để nhận khuyến mại trái
            điều khoản. Vi phạm thì Người bán được huỷ phiếu giảm giá và từ chối
            đơn.
          </li>
          <li>
            <b>Bảo mật:</b> giữ kín mã OTP, quản lý email và thiết bị đã xác
            thực; chịu trách nhiệm về đơn đặt từ email/thiết bị của mình.
          </li>
          <li>
            <b>Thông tin người khác:</b> khi nhập tên, SĐT, địa chỉ của người
            nhận thay, khách cần được người đó đồng ý.
          </li>
          <li>
            <b>Khiếu nại trung thực:</b> phản ánh đúng sự việc, kèm hình ảnh;
            không xúc phạm tài xế, nhân viên; không đưa thông tin sai sự thật về
            Người bán.
          </li>
        </List>
      </Section>

      <Section n={10} title="Trách nhiệm của tài xế tại quán và khi giao">
        <List>
          <li>
            Đọc đúng mã nhận hàng, thanh toán đủ tiền món, kiểm đếm món trước
            khi rời quán.
          </li>
          <li>
            Giao đúng người, đúng địa chỉ, giữ nguyên bao bì; thu đúng số tiền
            hiển thị.
          </li>
        </List>
      </Section>

      <Section n={11} title="Liên hệ">
        <p>
          Hotline:{" "}
          <a
            href={`tel:${COMPANY_INFO.phone.replace(/\s/g, "")}`}
            className="font-semibold text-primary"
          >
            {COMPANY_INFO.phone}
          </a>{" "}
          · Vận hành website: {BUSINESS_PEOPLE.websiteOperator},{" "}
          <a
            href={`tel:${BUSINESS_PEOPLE.websiteOperatorPhone.replace(/\s/g, "")}`}
            className="font-semibold text-primary"
          >
            {BUSINESS_PEOPLE.websiteOperatorPhone}
          </a>{" "}
          · {COMPANY_INFO.address}.
        </p>
      </Section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Căn cứ: Luật Thương mại điện tử 2025 (122/2025/QH15), Nghị định
        248/2026/NĐ-CP, Luật Bảo vệ quyền lợi người tiêu dùng 2023
        (19/2023/QH15), Luật Bảo vệ dữ liệu cá nhân 2025 (91/2025/QH15).
      </p>
    </section>
  );
}
