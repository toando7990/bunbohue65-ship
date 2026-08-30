// Profile — "Thông tin của bạn". Yêu cầu xác thực email (giống
// OrderHistory.tsx) — sau đó hiện form email (chỉ đọc) + tên + SĐT (bắt
// buộc), tự điền nếu đã có (GET /customers/:email), lưu qua PUT
// /customers/:email. Đây là hồ sơ dùng chung cho CreateOrder.tsx (giỏ
// hàng không còn hỏi lại tên/SĐT/email, tự lấy từ đây).

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { getCustomer, updateCustomer } from "@/lib/vps-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

const PHONE_RE = /^0\d{9,10}$/;

export default function Profile() {
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(() => {
    const v = getVerifiedEmail();
    return v ? normalizeEmail(v.email) : null;
  });
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const customerQuery = useQuery({
    queryKey: ["customer", verifiedEmail],
    queryFn: () =>
      verifiedEmail ? getCustomer(verifiedEmail) : Promise.resolve(null),
    enabled: !!verifiedEmail,
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  // Tự điền khi tải xong hồ sơ đã có — chỉ điền 1 lần lúc mới tải xong,
  // không ghi đè nếu khách đang gõ dở (cùng nguyên tắc đã áp dụng ở
  // MenuItemForm.tsx khi tải ảnh món ăn từ canister).
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!prefilled && customerQuery.isFetched) {
      if (customerQuery.data) {
        setName(customerQuery.data.name);
        setPhone(customerQuery.data.phone);
      }
      setPrefilled(true);
    }
  }, [prefilled, customerQuery.isFetched, customerQuery.data]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!verifiedEmail) return;
    const nextErrors: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      nextErrors.name = "Vui lòng nhập họ tên (ít nhất 2 ký tự).";
    }
    if (!phone.trim() || !PHONE_RE.test(phone.trim())) {
      nextErrors.phone =
        "Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await updateCustomer(verifiedEmail, name.trim(), phone.trim());
      queryClient.invalidateQueries({ queryKey: ["customer", verifiedEmail] });
      toast.success("Đã lưu thông tin của bạn.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không thể lưu thông tin.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-lg px-4 py-8 md:px-6"
      data-ocid="profile.page"
    >
      <header className="mb-6">
        <h1
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight md:text-3xl"
          data-ocid="profile.title"
        >
          <User className="h-6 w-6 text-primary" aria-hidden="true" />
          Thông tin của bạn
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {verifiedEmail
            ? "Thông tin này dùng để tự điền khi đặt món, không cần nhập lại mỗi lần."
            : "Xác thực email để xem và sửa thông tin của bạn."}
        </p>
      </header>

      {!verifiedEmail ? (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="profile.no_verified_email_state"
        >
          <ShieldCheck
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Xác thực email để tiếp tục
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Nhập và xác thực email (mã OTP gửi qua email) để xem và sửa thông
            tin của bạn.
          </p>
          <button
            type="button"
            onClick={() => setVerifyDialogOpen(true)}
            data-ocid="profile.verify_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Xác thực email
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
          data-ocid="profile.form"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email (đã xác thực)</Label>
            <Input
              id="profile-email"
              type="email"
              value={verifiedEmail}
              disabled
              data-ocid="profile.email_input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Họ tên</Label>
            <Input
              id="profile-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
              aria-invalid={!!errors.name}
              data-ocid="profile.name_input"
            />
            {errors.name && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-phone">Số điện thoại</Label>
            <Input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0912345678"
              aria-invalid={!!errors.phone}
              data-ocid="profile.phone_input"
            />
            {errors.phone && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {errors.phone}
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={saving || customerQuery.isLoading}
            data-ocid="profile.save_button"
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Lưu thông tin
          </Button>
        </form>
      )}

      <EmailVerificationDialog
        open={verifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        onVerified={(email) => {
          setVerifyDialogOpen(false);
          setVerifiedEmail(normalizeEmail(email));
        }}
      />
    </section>
  );
}
