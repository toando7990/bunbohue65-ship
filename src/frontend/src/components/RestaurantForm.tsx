// Form thêm/sửa nhà hàng — fields: name, address, phone, visible.
// UI tiếng Việt. RestaurantId do frontend generate (UUID) khi thêm mới.

import type { Restaurant } from "@/backend";
import { cn } from "@/lib/utils";
import { Loader2, LocateFixed } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

export interface RestaurantFormValues {
  restaurantId: string;
  name: string;
  address: string;
  phone: string;
  visible: boolean;
  lat: number;
  lng: number;
}

interface RestaurantFormProps {
  /** Khi có giá trị → chế độ sửa; không → chế độ thêm. */
  initial?: Restaurant;
  /** Đang submit. */
  submitting?: boolean;
  /** Lỗi submit từ mutation (optional). */
  submitError?: string | null;
  onSubmit: (values: RestaurantFormValues) => void;
  onCancel?: () => void;
}

const EMPTY: RestaurantFormValues = {
  restaurantId: "",
  name: "",
  address: "",
  phone: "",
  visible: true,
  lat: 0,
  lng: 0,
};

function genId(): string {
  // UUID v4 — frontend-generated restaurantId cho addRestaurant.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function RestaurantForm({
  initial,
  submitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: RestaurantFormProps) {
  const isEdit = !!initial;
  const [values, setValues] = useState<RestaurantFormValues>(() =>
    initial
      ? {
          restaurantId: initial.restaurantId,
          name: initial.name,
          address: initial.address,
          phone: initial.phone,
          visible: initial.visible,
          lat: initial.lat,
          lng: initial.lng,
        }
      : { ...EMPTY, restaurantId: genId() },
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof RestaurantFormValues, string>>
  >({});

  // Reset khi chuyển giữa thêm/sửa hoặc đổi initial.
  useEffect(() => {
    if (initial) {
      setValues({
        restaurantId: initial.restaurantId,
        name: initial.name,
        address: initial.address,
        phone: initial.phone,
        visible: initial.visible,
        lat: initial.lat,
        lng: initial.lng,
      });
    } else {
      setValues({ ...EMPTY, restaurantId: genId() });
    }
    setErrors({});
  }, [initial]);

  function validate(v: RestaurantFormValues) {
    const e: Partial<Record<keyof RestaurantFormValues, string>> = {};
    if (!v.name.trim()) e.name = "Vui lòng nhập tên nhà hàng";
    if (!v.address.trim()) e.address = "Vui lòng nhập địa chỉ";
    if (!v.phone.trim()) e.phone = "Vui lòng nhập số điện thoại";
    else if (!/^[0-9+\-\s()]{6,20}$/.test(v.phone.trim()))
      e.phone = "Số điện thoại không hợp lệ";
    // Toạ độ dùng cho Lalamove "Get Quotation" (phí ship/thời gian giao) và
    // tính nhà hàng gần nhất — bắt buộc phải hợp lệ, không cho lưu 0/0 (giá
    // trị mặc định cũ chưa nhập) hay ngoài phạm vi toạ độ thật.
    if (v.lat === 0 && v.lng === 0) {
      e.lat = "Vui lòng nhập toạ độ (chưa nhập hoặc đang là 0,0)";
    } else {
      if (v.lat < -90 || v.lat > 90)
        e.lat = "Vĩ độ phải trong khoảng -90 đến 90";
      if (v.lng < -180 || v.lng > 180)
        e.lng = "Kinh độ phải trong khoảng -180 đến 180";
    }
    return e;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = {
      ...values,
      name: values.name.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
    };
    const eMap = validate(v);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    onSubmit(v);
  }

  const fieldBase =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-smooth focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-50";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-ocid="restaurant.form"
      aria-label={isEdit ? "Sửa nhà hàng" : "Thêm nhà hàng"}
    >
      <div className="space-y-1.5">
        <label
          htmlFor="restaurant-name"
          className="text-sm font-medium text-foreground"
        >
          Tên <span className="text-destructive">*</span>
        </label>
        <input
          id="restaurant-name"
          type="text"
          value={values.name}
          onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
          placeholder="VD: Bún Bò Huế 65 - Cơ sở 1"
          disabled={submitting}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "restaurant-name-error" : undefined}
          data-ocid="restaurant.form.name_input"
          className={cn(
            fieldBase,
            errors.name && "border-destructive focus:ring-destructive",
          )}
        />
        {errors.name && (
          <p
            id="restaurant-name-error"
            className="text-xs text-destructive"
            data-ocid="restaurant.form.name_error"
          >
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="restaurant-address"
          className="text-sm font-medium text-foreground"
        >
          Địa chỉ <span className="text-destructive">*</span>
        </label>
        <input
          id="restaurant-address"
          type="text"
          value={values.address}
          onChange={(e) =>
            setValues((s) => ({ ...s, address: e.target.value }))
          }
          placeholder="VD: 123 Lê Lợi, Q.1, TP.HCM"
          disabled={submitting}
          aria-invalid={!!errors.address}
          aria-describedby={
            errors.address ? "restaurant-address-error" : undefined
          }
          data-ocid="restaurant.form.address_input"
          className={cn(
            fieldBase,
            errors.address && "border-destructive focus:ring-destructive",
          )}
        />
        {errors.address && (
          <p
            id="restaurant-address-error"
            className="text-xs text-destructive"
            data-ocid="restaurant.form.address_error"
          >
            {errors.address}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="restaurant-phone"
          className="text-sm font-medium text-foreground"
        >
          Điện thoại <span className="text-destructive">*</span>
        </label>
        <input
          id="restaurant-phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => setValues((s) => ({ ...s, phone: e.target.value }))}
          placeholder="VD: 0901234567"
          disabled={submitting}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? "restaurant-phone-error" : undefined}
          data-ocid="restaurant.form.phone_input"
          className={cn(
            fieldBase,
            errors.phone && "border-destructive focus:ring-destructive",
          )}
        />
        {errors.phone && (
          <p
            id="restaurant-phone-error"
            className="text-xs text-destructive"
            data-ocid="restaurant.form.phone_error"
          >
            {errors.phone}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            Toạ độ (dùng tính phí ship & thời gian giao){" "}
            <span className="text-destructive">*</span>
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (!navigator.geolocation) {
                setErrors((s) => ({
                  ...s,
                  lat: "Trình duyệt không hỗ trợ lấy vị trí.",
                }));
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setValues((s) => ({
                    ...s,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                  }));
                  setErrors((s) => ({ ...s, lat: undefined, lng: undefined }));
                },
                () => {
                  setErrors((s) => ({
                    ...s,
                    lat: "Không lấy được vị trí — vui lòng cho phép quyền vị trí hoặc nhập tay.",
                  }));
                },
              );
            }}
            data-ocid="restaurant.form.locate_button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
            Lấy vị trí hiện tại
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <input
              id="restaurant-lat"
              type="number"
              step="any"
              value={values.lat}
              onChange={(e) =>
                setValues((s) => ({ ...s, lat: Number(e.target.value) }))
              }
              placeholder="Vĩ độ (VD: 21.0285)"
              disabled={submitting}
              aria-label="Vĩ độ"
              aria-invalid={!!errors.lat}
              data-ocid="restaurant.form.lat_input"
              className={cn(
                fieldBase,
                errors.lat && "border-destructive focus:ring-destructive",
              )}
            />
          </div>
          <div>
            <input
              id="restaurant-lng"
              type="number"
              step="any"
              value={values.lng}
              onChange={(e) =>
                setValues((s) => ({ ...s, lng: Number(e.target.value) }))
              }
              placeholder="Kinh độ (VD: 105.8542)"
              disabled={submitting}
              aria-label="Kinh độ"
              aria-invalid={!!errors.lng}
              data-ocid="restaurant.form.lng_input"
              className={cn(
                fieldBase,
                errors.lng && "border-destructive focus:ring-destructive",
              )}
            />
          </div>
        </div>
        {(errors.lat || errors.lng) && (
          <p
            className="text-xs text-destructive"
            data-ocid="restaurant.form.coordinates_error"
          >
            {errors.lat || errors.lng}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor="restaurant-visible"
          className="text-sm font-medium text-foreground"
        >
          Hiện trên app
        </label>
        <button
          id="restaurant-visible"
          type="button"
          role="switch"
          aria-checked={values.visible}
          aria-label="Ẩn/hiện nhà hàng"
          disabled={submitting}
          onClick={() => setValues((s) => ({ ...s, visible: !s.visible }))}
          data-ocid="restaurant.form.visible_toggle"
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-smooth focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
            values.visible ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-smooth",
              values.visible ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {values.visible ? "Hiện" : "Ẩn"}
        </span>
      </div>

      {submitError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="restaurant.form.submit_error"
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          data-ocid="restaurant.form.save_button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isEdit ? "Lưu thay đổi" : "Thêm nhà hàng"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            data-ocid="restaurant.form.cancel_button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
          >
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}
