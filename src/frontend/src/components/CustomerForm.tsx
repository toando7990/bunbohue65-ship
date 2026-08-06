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
}

// Vietnamese phone: 10 digits starting 0 (mobile), or 11 for some landlines.
const PHONE_RE = /^0\d{9,10}$/;
// Permissive email check — VPS/canister is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomerForm(
  v: CustomerFormValues,
): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!v.cusName.trim()) errors.cusName = "Vui lòng nhập tên khách hàng.";
  else if (v.cusName.trim().length < 2)
    errors.cusName = "Tên phải có ít nhất 2 ký tự.";

  if (!v.cusPhone.trim()) errors.cusPhone = "Vui lòng nhập số điện thoại.";
  else if (!PHONE_RE.test(v.cusPhone.trim()))
    errors.cusPhone = "Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).";

  if (!v.cusAddress.trim())
    errors.cusAddress = "Vui lòng nhập địa chỉ giao hàng.";
  else if (v.cusAddress.trim().length < 5)
    errors.cusAddress = "Địa chỉ quá ngắn.";

  // Tax code optional but if provided, validate length (VN MST: 10 or 14 digits).
  if (
    v.cusTaxCode.trim() &&
    !/^\d{10}$|^\d{10}-\d{3}$|^\d{14}$/.test(v.cusTaxCode.trim())
  ) {
    errors.cusTaxCode = "Mã số thuế không hợp lệ (10 hoặc 14 số).";
  }

  if (!v.receiverEmail.trim())
    errors.receiverEmail = "Vui lòng nhập email nhận hoá đơn.";
  else if (!EMAIL_RE.test(v.receiverEmail.trim()))
    errors.receiverEmail = "Email không hợp lệ.";

  return errors;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
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
}: CustomerFormProps) {
  const inputClass = (hasError?: string) =>
    cn(
      "min-h-[44px] w-full",
      hasError && "border-destructive ring-destructive/30",
    );

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      data-ocid="customer_form.panel"
    >
      <Field id="cus_name" label="Tên khách hàng" error={errors.cusName}>
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

      <Field id="cus_phone" label="Số điện thoại" error={errors.cusPhone}>
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

      <div className="sm:col-span-2">
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

      <Field
        id="cus_tax_code"
        label="Mã số thuế"
        hint="Tuỳ chọn — để xuất hoá đơn VAT."
        error={errors.cusTaxCode}
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

      <Field
        id="receiver_email"
        label="Email nhận hoá đơn"
        error={errors.receiverEmail}
      >
        <Input
          id="receiver_email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={values.receiverEmail}
          onChange={(e) => onChange("receiverEmail", e.target.value)}
          placeholder="khach@example.com"
          disabled={disabled}
          aria-invalid={!!errors.receiverEmail}
          data-ocid="customer_form.receiver_email_input"
          className={inputClass(errors.receiverEmail)}
        />
      </Field>
    </div>
  );
}
