// SalesProgressPanel — thanh tiến độ doanh số tuần/tháng (Giai đoạn 4d).
// Hiện ngay tại trang đặt món, CHỈ khi khách đã xác thực email (hồ sơ đầy
// đủ). Không hiện gì nếu không có chương trình doanh số nào đang chạy,
// hoặc chương trình có nhưng không cấu hình mức nào (weeklyTiers/
// monthlyTiers đều rỗng).

import { Progress } from "@/components/ui/progress";
import { useCurrentSalesPromo } from "@/hooks/useQueries";
import { useSalesProgress } from "@/hooks/useSalesProgress";
import { TrendingUp } from "lucide-react";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

interface SalesProgressBarProps {
  label: string;
  period: "week" | "month";
  email: string;
}

function SalesProgressBar({ label, period, email }: SalesProgressBarProps) {
  const { total, tiers, nextGap, progressPercent, isLoading } =
    useSalesProgress(period, email);

  if (tiers.length === 0 || isLoading) return null;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-ocid={`sales_progress.${period}`}
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">
          {formatVnd(total)}
        </span>
      </div>
      <Progress value={progressPercent} className="h-1.5" />
      {nextGap ? (
        <p className="text-xs text-muted-foreground">
          Còn {formatVnd(nextGap.remaining)} nữa để nhận phiếu{" "}
          {formatVnd(Number(nextGap.tier.voucherValue))}
        </p>
      ) : (
        <p className="text-xs font-medium text-success">
          Đã đạt mức thưởng cao nhất!
        </p>
      )}
    </div>
  );
}

export interface SalesProgressPanelProps {
  email: string;
}

export function SalesProgressPanel({ email }: SalesProgressPanelProps) {
  const { data: salesPromo } = useCurrentSalesPromo();

  if (!salesPromo) return null;
  const hasWeekly = salesPromo.weeklyTiers.length > 0;
  const hasMonthly = salesPromo.monthlyTiers.length > 0;
  if (!hasWeekly && !hasMonthly) return null;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-ocid="sales_progress.panel"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        {salesPromo.name}
      </h3>
      {hasWeekly && (
        <SalesProgressBar
          label="Doanh số tuần này"
          period="week"
          email={email}
        />
      )}
      {hasMonthly && (
        <SalesProgressBar
          label="Doanh số tháng này"
          period="month"
          email={email}
        />
      )}
    </div>
  );
}
