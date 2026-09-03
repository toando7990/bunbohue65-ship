// useSalesProgress — tính tiến độ doanh số (tuần/tháng) so với các mức
// thưởng đang cấu hình (Giai đoạn 4d). Tái sử dụng logic tìm mức tiếp
// theo đã có ở PeriodSummaryPanel.tsx (Giai đoạn 3f) — tách riêng thành
// hook dùng chung cho cả "Lịch sử đặt đơn" lẫn trang đặt món.

import { useCurrentSalesPromo } from "@/hooks/useQueries";
import { getPeriodSummary } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";

interface SalesTierLike {
  minSales: bigint;
  voucherValue: bigint;
}

// Mức tiếp theo CHƯA đạt được (thấp nhất trong các mức còn thiếu) — null
// nếu đã đạt mức cao nhất hoặc không có mức nào cấu hình.
function findNextTierGap(
  tiers: SalesTierLike[],
  currentTotal: number,
): { tier: SalesTierLike; remaining: number } | null {
  const sorted = [...tiers].sort((a, b) =>
    a.minSales < b.minSales ? -1 : a.minSales > b.minSales ? 1 : 0,
  );
  for (const t of sorted) {
    if (currentTotal < Number(t.minSales)) {
      return { tier: t, remaining: Number(t.minSales) - currentTotal };
    }
  }
  return null;
}

// % tiến độ (0-100) hướng tới mức tiếp theo — 100 nếu đã đạt mức cao nhất,
// 0 nếu không có mức nào cấu hình.
function computeProgressPercent(
  tiers: SalesTierLike[],
  total: number,
  nextGap: { tier: SalesTierLike; remaining: number } | null,
): number {
  if (tiers.length === 0) return 0;
  if (!nextGap) return 100;
  return Math.min(100, (total / Number(nextGap.tier.minSales)) * 100);
}

export function useSalesProgress(
  period: "week" | "month",
  email: string | null,
) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["periodSummary", email, period],
    queryFn: () =>
      email
        ? getPeriodSummary(email, period)
        : Promise.resolve({ orders: [], total: 0 }),
    enabled: !!email,
    refetchOnWindowFocus: false,
  });
  const { data: salesPromo } = useCurrentSalesPromo();

  const total = data?.total ?? 0;
  const tiers = salesPromo
    ? period === "week"
      ? salesPromo.weeklyTiers
      : salesPromo.monthlyTiers
    : [];
  const nextGap = findNextTierGap(tiers, total);
  const progressPercent = computeProgressPercent(tiers, total, nextGap);

  return { total, tiers, nextGap, progressPercent, isLoading, isError };
}
