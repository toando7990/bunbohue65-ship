// AddressFormFields — phần nhập liệu dùng chung của mọi form thêm/sửa
// địa chỉ nhận hàng (DeliveryAddressPanel, GuestAddressPanel,
// DeliveryAddressSelector): địa chỉ + bản đồ (AddressPicker), ô "số
// tầng/phòng/ghi chú cho tài xế", và nhãn nhanh Nhà / Công ty / Khác.
// Mỗi form tự lo phần lưu (API máy chủ hay lưu cục bộ).

import { AddressPicker } from "@/components/AddressPicker";
import { Input } from "@/components/ui/input";

export interface AddressFormValue {
  label: string;
  address: string;
  detail: string;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_ADDRESS_FORM: AddressFormValue = {
  label: "Nhà",
  address: "",
  detail: "",
  lat: null,
  lng: null,
};

const PRESET_LABELS = ["Nhà", "Công ty"] as const;

// Kiểm tra trước khi lưu — trả câu báo lỗi, hoặc null nếu hợp lệ.
export function validateAddressForm(v: AddressFormValue): string | null {
  if (!v.address.trim()) return "Vui lòng nhập địa chỉ.";
  if (v.lat === null || v.lng === null) {
    return "Vui lòng chọn 1 gợi ý địa chỉ hoặc ghim vị trí trên bản đồ.";
  }
  return null;
}

interface AddressFormFieldsProps {
  value: AddressFormValue;
  onChange: (next: AddressFormValue) => void;
  idPrefix: string;
}

export function AddressFormFields({
  value,
  onChange,
  idPrefix,
}: AddressFormFieldsProps) {
  const isPreset = (PRESET_LABELS as readonly string[]).includes(value.label);
  // "Khác" đang chọn khi nhãn không phải Nhà/Công ty (kể cả khi khách vừa
  // bấm "Khác" và chưa gõ gì — lưu tạm bằng khoảng trắng để phân biệt với
  // "không chọn nhãn nào").
  const otherActive = !isPreset && value.label !== "";

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth ${
      active
        ? "border-primary bg-primary/10 font-semibold text-primary"
        : "border-border bg-card text-muted-foreground hover:bg-secondary"
    }`;

  return (
    <div className="flex flex-col gap-3" data-ocid="address_form_fields">
      <AddressPicker
        inputId={`${idPrefix}-address`}
        value={{ address: value.address, lat: value.lat, lng: value.lng }}
        onChange={(v) => onChange({ ...value, ...v })}
      />

      <Input
        id={`${idPrefix}-detail`}
        value={value.detail}
        onChange={(e) => onChange({ ...value, detail: e.target.value })}
        placeholder="Số tầng / phòng / ghi chú cho tài xế (tuỳ chọn)"
        maxLength={200}
        data-ocid="address_form_fields.detail_input"
      />

      <div className="flex flex-wrap items-center gap-2">
        {PRESET_LABELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() =>
              onChange({ ...value, label: value.label === l ? "" : l })
            }
            aria-pressed={value.label === l}
            className={chip(value.label === l)}
            data-ocid={`address_form_fields.label_chip.${l === "Nhà" ? "home" : "work"}`}
          >
            {l === "Nhà" ? "🏠 Nhà" : "💼 Công ty"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...value, label: otherActive ? "" : " " })}
          aria-pressed={otherActive}
          className={chip(otherActive)}
          data-ocid="address_form_fields.label_chip.other"
        >
          ＋ Khác
        </button>
        {otherActive && (
          <Input
            id={`${idPrefix}-label`}
            value={value.label.trimStart()}
            onChange={(e) =>
              onChange({ ...value, label: e.target.value || " " })
            }
            placeholder="Đặt tên, VD: Nhà bố mẹ"
            className="h-8 w-44 text-xs"
            autoFocus
            data-ocid="address_form_fields.label_input"
          />
        )}
      </div>
    </div>
  );
}
