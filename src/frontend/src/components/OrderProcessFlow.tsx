// OrderProcessFlow — thanh quy trình động thay cho tiêu đề "Đặt món", nêu
// bật điểm khác biệt của app: không có đội tài xế riêng, khách tự đặt tài
// xế ngoài, tài xế tới quán trả tiền mặt rồi tự giao. 5 bước, chấm chạy
// dọc đường nối trong 1 chu kỳ 10s (animate-order-flow-run, khai báo ở
// tailwind.config.js) — mỗi bước "sáng" 2s, đủ thời gian đọc câu dài nhất
// mà không quá chậm. Nhãn không cố định dưới từng icon — chỉ 1 dòng chữ
// dùng chung bên dưới, đổi nội dung theo bước đang "sáng" (label-fade,
// cùng chu kỳ/degree lệch với icon để luôn khớp).
//
// Xây từ bản xem trước HTML đã duyệt — giữ nguyên timing, icon, màu sắc.

import { CreditCard, Package, Phone, Receipt, Store } from "lucide-react";

interface FlowStep {
  icon: typeof Receipt;
  label: string;
}

const STEPS: FlowStep[] = [
  { icon: Receipt, label: "Bạn đặt đơn" },
  { icon: Store, label: "Nhà hàng nhận đơn" },
  { icon: Phone, label: "Bạn gọi tài xế" },
  { icon: CreditCard, label: "Tài xế đến quán, trả tiền & nhận hàng" },
  { icon: Package, label: "Hàng giao cho bạn" },
];

// 10s / 5 bước = 2s/bước — khớp đúng % trong keyframes (mỗi bước "sáng"
// 0-20% của chu kỳ, dịch bằng animationDelay riêng từng bước).
const STEP_DELAY_S = 2;

export function OrderProcessFlow() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-ocid="order_process_flow"
    >
      <p className="mb-3.5 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(var(--primary))"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
        Cách Bún Bò Huế 65 giao hàng đến bạn
      </p>

      <div className="relative flex items-start">
        <div className="absolute left-[10%] right-[10%] top-[17px] h-0.5 overflow-visible bg-[repeating-linear-gradient(90deg,oklch(var(--border))_0px,oklch(var(--border))_5px,transparent_5px,transparent_10px)]">
          <div
            className="absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[oklch(var(--primary))] shadow-[0_0_0_3px_color-mix(in_oklch,oklch(var(--primary))_20%,transparent)] animate-order-flow-run"
            aria-hidden="true"
          />
        </div>

        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isOdd = i % 2 === 0;
          return (
            <div
              key={step.label}
              className="relative z-[1] flex flex-1 flex-col items-center text-center"
            >
              <div
                className="animate-order-flow-pulse flex h-[34px] w-[34px] items-center justify-center rounded-full text-primary-foreground"
                style={{
                  backgroundColor: isOdd
                    ? "oklch(var(--primary))"
                    : "oklch(var(--accent))",
                  animationDelay: `${i * STEP_DELAY_S}s`,
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-3 h-[34px] px-1.5 text-center">
        {STEPS.map((step, i) => (
          <span
            key={step.label}
            className="animate-order-flow-label-fade absolute inset-x-1.5 top-0 text-[12.5px] font-semibold leading-tight opacity-0"
            style={{
              color:
                i % 2 === 0 ? "oklch(var(--primary))" : "oklch(var(--accent))",
              animationDelay: `${i * STEP_DELAY_S}s`,
            }}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
