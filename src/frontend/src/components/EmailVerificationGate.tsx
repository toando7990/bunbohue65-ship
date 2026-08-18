// EmailVerificationGate — blocks the menu until the customer verifies their
// email with a 6-digit OTP. Reads localStorage on mount and skips straight to
// children when a verified email is already stored. Uses the .bbh-verify-theme
// and .otp-input design tokens from index.css.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { upsertCustomer } from "@/lib/vps-client";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
// Stable, position-based identifiers for the OTP boxes so React keys are not
// the raw array index.
const OTP_POSITIONS = Array.from({ length: OTP_LENGTH }, (_, i) => i);

interface EmailVerificationGateProps {
  children: React.ReactNode;
}

export function EmailVerificationGate({
  children,
}: EmailVerificationGateProps) {
  const { isVerified, isInitializing, sendCode, verifyCode } =
    useEmailVerification();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Countdown for the "Gửi lại mã" cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  // Focus the first OTP box when the code is sent.
  useEffect(() => {
    if (codeSent) {
      inputsRef.current[0]?.focus();
    }
  }, [codeSent]);

  // On mount, if a verified email is already stored locally, best-effort sync
  // the customer record by email (in case it was not created at verification
  // time, e.g. a network error). Non-blocking — a failure is ignored and the
  // customer is still let into the menu.
  useEffect(() => {
    const stored = getVerifiedEmail();
    if (stored) {
      void upsertCustomer(stored.email);
    }
  }, []);

  // If already verified locally, unlock the menu immediately.
  if (isVerified) {
    return <>{children}</>;
  }

  if (isInitializing) {
    return (
      <div className="bbh-verify-theme flex min-h-[70vh] items-center justify-center bg-background px-4">
        <div
          className="flex items-center gap-3 text-muted-foreground"
          data-ocid="verify.loading_state"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">Đang kiểm tra trạng thái xác nhận…</p>
        </div>
      </div>
    );
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      await sendCode(trimmed);
      setCodeSent(true);
      setOtp(Array(6).fill(""));
      setOtpError(null);
      setResendIn(60);
      toast.success("Mã xác nhận đã được gửi tới email của bạn.");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Không gửi được mã. Vui lòng thử lại.";
      toast.error(msg);
      setEmailError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError(null);
    if (digit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    setOtpError(null);
    inputsRef.current[Math.min(text.length, 5)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      setOtpError("Vui lòng nhập đủ 6 chữ số mã xác nhận.");
      return;
    }
    setVerifying(true);
    try {
      await verifyCode(email.trim(), code);
      setSuccess(true);
      toast.success("Xác nhận email thành công!");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Mã xác nhận không đúng hoặc đã hết hạn.";
      setOtpError(msg);
      setOtp(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // Success state — brief confirmation before revealing the menu.
  if (success) {
    return (
      <div className="bbh-verify-theme flex min-h-[70vh] items-center justify-center bg-background px-4">
        <div
          className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-subtle"
          data-ocid="verify.success_state"
        >
          <span className="verify-success-mark">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            Xác nhận thành công
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cảm ơn bạn đã xác nhận email. Đang đưa bạn vào thực đơn…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bbh-verify-theme flex min-h-[70vh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-card p-6 shadow-subtle md:p-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Xác nhận email
              </h1>
              <p className="text-sm text-muted-foreground">
                Bún Bò Huế 65 — đặt món an toàn
              </p>
            </div>
          </div>

          {!codeSent ? (
            <form onSubmit={handleSendCode} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="verify-email"
                  className="text-sm font-medium text-foreground"
                >
                  Địa chỉ email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="verify-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(null);
                    }}
                    aria-invalid={!!emailError}
                    aria-describedby={
                      emailError ? "verify-email-error" : undefined
                    }
                    className="pl-9"
                    data-ocid="verify.email_input"
                  />
                </div>
                {emailError ? (
                  <p
                    id="verify-email-error"
                    className="text-sm text-destructive"
                    data-ocid="verify.email_error"
                  >
                    {emailError}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={sending}
                data-ocid="verify.send_code_button"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {sending ? "Đang gửi…" : "Gửi mã xác nhận"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Chúng tôi sẽ gửi mã OTP 6 chữ số tới email của bạn. Mã có hiệu
                lực trong 15 phút.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="verify-otp-0"
                  className="text-sm font-medium text-foreground"
                >
                  Nhập mã xác nhận
                </label>
                <p className="text-sm text-muted-foreground">
                  Mã 6 chữ số đã được gửi tới{" "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <fieldset
                  className="flex justify-between gap-2"
                  aria-label="Mã xác nhận 6 chữ số"
                  onPaste={handlePaste}
                >
                  {OTP_POSITIONS.map((i) => (
                    <input
                      key={`otp-pos-${i}`}
                      id={i === 0 ? "verify-otp-0" : undefined}
                      ref={(el) => {
                        inputsRef.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={otp[i]}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      aria-label={`Chữ số ${i + 1}`}
                      aria-invalid={!!otpError}
                      className={`otp-input ${
                        otp[i] ? "otp-input-filled" : ""
                      } ${otpError ? "otp-input-error" : ""}`}
                      data-ocid={`verify.otp_input.${i + 1}`}
                    />
                  ))}
                </fieldset>
                {otpError ? (
                  <p
                    className="text-sm text-destructive"
                    data-ocid="verify.otp_error"
                  >
                    {otpError}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={verifying}
                data-ocid="verify.confirm_button"
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {verifying ? "Đang xác nhận…" : "Xác nhận"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setCodeSent(false)}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  data-ocid="verify.change_email_button"
                >
                  Đổi email
                </button>
                <button
                  type="button"
                  disabled={resendIn > 0}
                  onClick={handleSendCode}
                  className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  data-ocid="verify.resend_button"
                >
                  {resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại mã"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
