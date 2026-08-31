// useCartDiscounts — tính chiết khấu real-time cho giỏ hàng (Giai đoạn
// 3e). 2 nguồn chiết khấu ĐỘC LẬP, CỘNG DỒN:
//   1. Hệ 1 (khung giờ) — tự động, dựa trên currentPromotion + trạng thái
//      đếm ngược (usePromotionCountdown, đã có từ Giai đoạn 2) + tổng giỏ
//      hàng đạt mức nào. CHỈ LÀ ƯỚC TÍNH hiển thị — số tiền thật vẫn do
//      canister xác nhận lúc đặt đơn qua applyPromotion (không đổi).
//   2. Phiếu giảm giá — khách tự chọn (tối đa 1 phiếu/đơn), áp vào PHẦN
//      CÒN LẠI sau chiết khấu Hệ 1 (khớp đúng thứ tự VPS xử lý ở
//      routes/create.js).

import type { Voucher } from "@/backend";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import { useCurrentPromotion, useMyVouchers } from "@/hooks/useQueries";
import { useEffect, useMemo, useState } from "react";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnDateKeyNow(): string {
  const shifted = new Date(Date.now() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isVoucherValidNow(v: Voucher, todayKey: string): boolean {
  if (v.used) return false;
  if (todayKey < v.startDate) return false;
  if (todayKey > v.endDate) return false;
  return true;
}

export function useCartDiscounts(
  subtotal: number,
  verifiedEmail: string | null,
) {
  const { data: promotion } = useCurrentPromotion();
  const countdown = usePromotionCountdown(promotion);
  const { data: vouchersRaw } = useMyVouchers(verifiedEmail);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string | null>(
    null,
  );

  const kmTier = useMemo(() => {
    if (countdown.kind !== "active" || !promotion) return null;
    let best: { minOrderValue: bigint; discountAmount: bigint } | null = null;
    for (const t of promotion.tiers) {
      if (subtotal >= Number(t.minOrderValue)) {
        if (!best || t.minOrderValue > best.minOrderValue) best = t;
      }
    }
    return best;
  }, [countdown.kind, promotion, subtotal]);
  const kmDiscount = kmTier ? Number(kmTier.discountAmount) : 0;
  const kmLabel = promotion?.name ?? "";

  const validVouchers = useMemo(() => {
    const today = vnDateKeyNow();
    return (vouchersRaw ?? []).filter((v) => isVoucherValidNow(v, today));
  }, [vouchersRaw]);

  useEffect(() => {
    if (
      selectedVoucherCode &&
      !validVouchers.some((v) => v.code === selectedVoucherCode)
    ) {
      setSelectedVoucherCode(null);
    }
  }, [selectedVoucherCode, validVouchers]);

  const selectedVoucher =
    validVouchers.find((v) => v.code === selectedVoucherCode) ?? null;
  const remainingAfterKm = Math.max(0, subtotal - kmDiscount);
  const voucherDiscount = selectedVoucher
    ? Math.min(Number(selectedVoucher.value), remainingAfterKm)
    : 0;
  const finalTotal = remainingAfterKm - voucherDiscount;

  return {
    kmDiscount,
    kmLabel,
    validVouchers,
    selectedVoucherCode,
    setSelectedVoucherCode,
    voucherDiscount,
    finalTotal,
  };
}
