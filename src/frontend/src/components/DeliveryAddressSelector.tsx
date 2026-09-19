// DeliveryAddressSelector — chọn 1 địa chỉ nhận hàng (BẮT BUỘC) trong
// trang đặt món từ xa (CreateOrder.tsx). Phần 3/6 tái cấu trúc đặt món
// từ xa: khách không còn gõ tay địa chỉ, chỉ chọn từ danh sách đã lưu ở
// mục "Tôi" > "Địa chỉ nhận hàng" (xem DeliveryAddressPanel.tsx).
//
// 3 trạng thái:
//   1. Chưa xác thực email — hiện nút "Xác thực email" (mở
//      EmailVerificationDialog, cùng cơ chế Profile.tsx/OrderHistory.tsx).
//   2. Đã xác thực nhưng CHƯA có địa chỉ nào đã lưu — hướng dẫn khách
//      sang mục "Tôi" thêm địa chỉ trước.
//   3. Có >= 1 địa chỉ — chọn 1 (tự chọn địa chỉ ĐẦU nếu khách chưa chọn
//      gì), hiện địa chỉ đang chọn + nút "Sửa" (dẫn tới /profile).

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCustomerAddresses } from "@/lib/vps-client";
import type { CustomerAddress } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

interface DeliveryAddressSelectorProps {
  verifiedEmail: string | null;
  onVerified: (email: string) => void;
  selectedAddressId: number | null;
  onSelectAddress: (address: CustomerAddress | null) => void;
}

export function DeliveryAddressSelector({
  verifiedEmail,
  onVerified,
  selectedAddressId,
  onSelectAddress,
}: DeliveryAddressSelectorProps) {
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  const addressesQuery = useQuery({
    queryKey: ["customerAddresses", verifiedEmail],
    queryFn: () =>
      verifiedEmail
        ? listCustomerAddresses(verifiedEmail)
        : Promise.resolve([]),
    enabled: !!verifiedEmail,
  });

  const addresses = addressesQuery.data ?? [];
  const selected =
    addresses.find((a) => a.id === selectedAddressId) ?? addresses[0] ?? null;

  // Tự động chọn địa chỉ ĐẦU TIÊN khi danh sách vừa tải xong và khách
  // chưa chọn gì (VD lần đầu vào trang) — không ghi đè nếu khách đã tự
  // chọn 1 địa chỉ khác trong danh sách.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy lại khi addresses/selectedAddressId đổi, onSelectAddress là setter ổn định
  useEffect(() => {
    if (selectedAddressId === null && addresses.length > 0) {
      onSelectAddress(addresses[0]);
    }
  }, [addresses, selectedAddressId]);

  if (!verifiedEmail) {
    return (
      <div
        className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4"
        data-ocid="delivery_address_selector.unverified_state"
      >
        <p className="text-sm text-muted-foreground">
          Xác thực email để chọn địa chỉ nhận hàng.
        </p>
        <button
          type="button"
          onClick={() => setVerifyDialogOpen(true)}
          data-ocid="delivery_address_selector.verify_button"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Xác thực email
        </button>
        <EmailVerificationDialog
          open={verifyDialogOpen}
          onOpenChange={setVerifyDialogOpen}
          onVerified={onVerified}
        />
      </div>
    );
  }

  if (addressesQuery.isLoading) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        data-ocid="delivery_address_selector.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải địa chỉ…
      </div>
    );
  }

  if (addresses.length === 0) {
    return (
      <div
        className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4"
        data-ocid="delivery_address_selector.empty_state"
      >
        <p className="text-sm text-muted-foreground">
          Bạn chưa có địa chỉ nhận hàng nào — thêm 1 địa chỉ ở mục "Tôi" trước
          khi đặt món.
        </p>
        <Link
          to="/profile"
          data-ocid="delivery_address_selector.add_link"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Thêm địa chỉ nhận hàng
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      data-ocid="delivery_address_selector.panel"
    >
      {addresses.length > 1 && (
        <Select
          value={String(selected?.id ?? "")}
          onValueChange={(v) => {
            const found = addresses.find((a) => a.id === Number(v));
            if (found) onSelectAddress(found);
          }}
        >
          <SelectTrigger
            data-ocid="delivery_address_selector.select"
            aria-label="Chọn địa chỉ nhận hàng"
            className="min-h-[44px] w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {addresses.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.label ? `${a.label} — ${a.address}` : a.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selected && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {selected.label && (
                <p className="text-sm font-semibold">{selected.label}</p>
              )}
              <p
                className="text-sm text-muted-foreground"
                data-ocid="delivery_address_selector.selected_address_text"
              >
                {selected.address}
              </p>
            </div>
          </div>
          <Link
            to="/profile"
            data-ocid="delivery_address_selector.edit_link"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Sửa
          </Link>
        </div>
      )}
    </div>
  );
}
