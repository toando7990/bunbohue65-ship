// CustomerForm — form nhập cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail.
// Validation tiếng Việt. Mobile-first. Controlled, không submit ở đây (parent owns submit).

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface CustomerFormValues {
  cusName: string;
  cusPhone: string;
  cusAddress: string;
  cusTaxCode: string;
  receiverEmail: string;
}

export type CustomerFormErrors = Partial<
  Record<keyof CustomerFormValues, string>
>;

interface CustomerFormProps {
  values: CustomerFormValues;
  errors: CustomerFormErrors;
  onChange: <K extends keyof CustomerFormValues>(
    field: K,
    value: string,
  ) => void;
  disabled?: boolean;
  // Khi true: ẩn trường địa chỉ giao hàng và bỏ qua validate địa chỉ.
  // Dùng cho luồng "khách tự thanh toán" (paymentMode='customer') — khách
  // không cần nhập địa chỉ vì tự đặt Grab Express để nhận hàng.
  hideAddress?: boolean;
  // Khi true: máy này CHƯA từng xác thực email nào — khoá ô "Email nhận
  // hoá đơn" (không cho gõ tay), vì giá trị sẽ được gán tự động từ email
  // khách xác thực trong EmailVerificationDialog lúc bấm "Đặt món", tránh
  // bắt khách nhập email 2 lần (1 lần ở đây, 1 lần trong hộp thoại xác
  // thực). Khi máy đã từng xác thực, ô này mở khoá bình thường — khách có
  // thể sửa sang email khác tự do, không cần xác thực lại (xem CreateOrder.tsx).
  emailLocked?: boolean;
}

// Vietnamese phone: 10 digits starting 0 (mobile), or 11 for some landlines.
const PHONE_RE = /^0\d{9,10}$/;
// Permissive email check — VPS/canister is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomerForm(
  v: CustomerFormValues,
  options: { hideAddress?: boolean; emailLocked?: boolean } = {},
): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!v.cusName.trim()) errors.cusName = "Vui lòng nhập tên khách hàng.";
  else if (v.cusName.trim().length < 2)
    errors.cusName = "Tên phải có ít nhất 2 ký tự.";

  if (!v.cusPhone.trim()) errors.cusPhone = "Vui lòng nhập số điện thoại.";
  else if (!PHONE_RE.test(v.cusPhone.trim()))
    errors.cusPhone = "Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).";

  if (!options.hideAddress) {
    if (!v.cusAddress.trim())
      errors.cusAddress = "Vui lòng nhập địa chỉ giao hàng.";
    else if (v.cusAddress.trim().length < 5)
      errors.cusAddress = "Địa chỉ quá ngắn.";
  }

  // Tax code optional but if provided, validate length (VN MST: 10 or 14 digits).
  // Skip when hideAddress (customer mode) — field is hidden and will be empty.
  if (
    !options.hideAddress &&
    v.cusTaxCode.trim() &&
    !/^\d{10}$|^\d{10}-\d{3}$|^\d{14}$/.test(v.cusTaxCode.trim())
  ) {
    errors.cusTaxCode = "Mã số thuế không hợp lệ (10 hoặc 14 số).";
  }

  // Skip email validation when hideAddress (customer mode) — field is hidden.
  // Also skip when emailLocked (chưa xác thực) — ô bị khoá rỗng, giá trị sẽ
  // được gán sau khi khách xác thực trong EmailVerificationDialog, không
  // phải lỗi nhập liệu của khách.
  if (!options.hideAddress && !options.emailLocked) {
    if (!v.receiverEmail.trim())
      errors.receiverEmail = "Vui lòng nhập email nhận hoá đơn.";
    else if (!EMAIL_RE.test(v.receiverEmail.trim()))
      errors.receiverEmail = "Email không hợp lệ.";
  }

  return errors;
}

function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p
          className="text-xs font-medium text-destructive"
          data-ocid={`${id}.error`}
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function CustomerForm({
  values,
  errors,
  onChange,
  disabled,
  hideAddress,
  emailLocked,
}: CustomerFormProps) {
  const inputClass = (hasError?: string) =>
    cn(
      "min-h-[44px] w-full",
      hasError && "border-destructive ring-destructive/30",
    );

  return (
    <div
      className="grid grid-cols-5 gap-4 sm:grid-cols-2"
      data-ocid="customer_form.panel"
    >
      <Field
        id="cus_name"
        label="Tên khách hàng"
        error={errors.cusName}
        className="col-span-3 sm:col-span-1"
      >
        <Input
          id="cus_name"
          type="text"
          autoComplete="name"
          value={values.cusName}
          onChange={(e) => onChange("cusName", e.target.value)}
          placeholder="Nguyễn Văn A"
          disabled={disabled}
          aria-invalid={!!errors.cusName}
          data-ocid="customer_form.cus_name_input"
          className={inputClass(errors.cusName)}
        />
      </Field>

      <Field
        id="cus_phone"
        label="Số điện thoại"
        error={errors.cusPhone}
        className="col-span-2 sm:col-span-1"
      >
        <Input
          id="cus_phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={values.cusPhone}
          onChange={(e) => onChange("cusPhone", e.target.value)}
          placeholder="0912345678"
          disabled={disabled}
          aria-invalid={!!errors.cusPhone}
          data-ocid="customer_form.cus_phone_input"
          className={inputClass(errors.cusPhone)}
        />
      </Field>

      {!hideAddress && (
        <div className="col-span-5 sm:col-span-2">
          <Field
            id="cus_address"
            label="Địa chỉ giao hàng"
            error={errors.cusAddress}
            hint="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành."
          >
            <Input
              id="cus_address"
              type="text"
              autoComplete="street-address"
              value={values.cusAddress}
              onChange={(e) => onChange("cusAddress", e.target.value)}
              placeholder="123 Lê Lợi, phường Bến Nghé, Q1, TP. HCM"
              disabled={disabled}
              aria-invalid={!!errors.cusAddress}
              data-ocid="customer_form.cus_address_input"
              className={inputClass(errors.cusAddress)}
            />
          </Field>
        </div>
      )}

      {!hideAddress && (
        <Field
          id="cus_tax_code"
          label="Mã số thuế"
          hint="Tuỳ chọn — để xuất hoá đơn VAT."
          error={errors.cusTaxCode}
          className="col-span-2 sm:col-span-1"
        >
          <Input
            id="cus_tax_code"
            type="text"
            inputMode="numeric"
            value={values.cusTaxCode}
            onChange={(e) => onChange("cusTaxCode", e.target.value)}
            placeholder="0123456789"
            disabled={disabled}
            aria-invalid={!!errors.cusTaxCode}
            data-ocid="customer_form.cus_tax_code_input"
            className={inputClass(errors.cusTaxCode)}
          />
        </Field>
      )}

      {!hideAddress && (
        <Field
          id="receiver_email"
          label="Email nhận hoá đơn"
          error={errors.receiverEmail}
          hint={
            emailLocked
              ? "Sẽ tự động điền sau khi bạn xác thực email lúc đặt đơn."
              : undefined
          }
          className="col-span-3 sm:col-span-1"
        >
          <Input
            id="receiver_email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.receiverEmail}
            onChange={(e) => onChange("receiverEmail", e.target.value)}
            placeholder={
              emailLocked ? "Xác thực lúc bấm Đặt món" : "khach@example.com"
            }
            disabled={disabled || emailLocked}
            aria-invalid={!!errors.receiverEmail}
            data-ocid="customer_form.receiver_email_input"
            className={inputClass(errors.receiverEmail)}
          />
        </Field>
      )}
    </div>
  );
}
