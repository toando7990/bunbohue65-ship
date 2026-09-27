// InvoiceCorrectionDialog — Kế toán THAY THẾ (Bkav lệnh 123) hoặc ĐIỀU
// CHỈNH THÔNG TIN (lệnh 124) hoá đơn đã phát hành (giao diện đã duyệt).
// Số tiền / món giữ nguyên như đơn gốc — chỉ đổi thông tin người mua. VPS
// tự lấy mẫu số + ký hiệu hoá đơn gốc (lệnh 800) và gọi Bkav ngay.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  enterpriseCorrectInvoice,
  enterpriseLookupTaxCode,
} from "@/lib/vps-client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12}|\d{14})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CorrectionKind = "replace" | "adjust";

export interface CorrectionTarget {
  orderId: string;
  invoiceId: string;
  invoiceSerial?: string;
  amount: number;
  createdAt: number;
  cusTaxCode?: string;
  cusTaxName?: string;
}

interface Props {
  deviceId: string;
  target: CorrectionTarget | null;
  initialKind: CorrectionKind;
  onClose: () => void;
  onDone: () => void;
}

function vnd(n: number) {
  return `${new Intl.NumberFormat("vi-VN").format(n)}đ`;
}

export function InvoiceCorrectionDialog({
  deviceId,
  target,
  initialKind,
  onClose,
  onDone,
}: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg"
        data-ocid="accounting.correction_dialog"
      >
        {target && (
          <CorrectionForm
            key={`${target.orderId}:${initialKind}`}
            deviceId={deviceId}
            target={target}
            initialKind={initialKind}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CorrectionForm({
  deviceId,
  target,
  initialKind,
  onClose,
  onDone,
}: Props & { target: CorrectionTarget }) {
  const [kind, setKind] = useState<CorrectionKind>(initialKind);
  const [taxCode, setTaxCode] = useState(target.cusTaxCode ?? "");
  const [name, setName] = useState(target.cusTaxName ?? "");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [lookup, setLookup] = useState<
    "idle" | "loading" | "found" | "notFound" | "error"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tax = taxCode.replace(/\s+/g, "");
  const taxValid = !tax || TAX_CODE_RE.test(tax);
  const emailValid = !email.trim() || EMAIL_RE.test(email.trim());
  const reasonValid = reason.trim().length >= 5;
  const canSubmit =
    taxValid &&
    emailValid &&
    reasonValid &&
    (!tax || name.trim().length > 0) &&
    !submitting;

  async function handleLookup() {
    if (!tax || !TAX_CODE_RE.test(tax)) return;
    setLookup("loading");
    try {
      const r = await enterpriseLookupTaxCode(deviceId, tax);
      if (r.found) {
        setName(r.name);
        setAddress(r.address);
        setLookup("found");
      } else {
        setLookup("notFound");
      }
    } catch {
      setLookup("error");
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await enterpriseCorrectInvoice(deviceId, target.orderId, {
        kind,
        buyerTaxCode: tax,
        buyerName: name.trim(),
        buyerAddress: address.trim(),
        receiverEmail: email.trim(),
        reason: reason.trim(),
      });
      toast.success(
        kind === "replace"
          ? `Đã phát hành hoá đơn thay thế${r.invoiceNo ? ` số ${r.invoiceNo}` : ""}.`
          : `Đã phát hành hoá đơn điều chỉnh${r.invoiceNo ? ` số ${r.invoiceNo}` : ""}.`,
      );
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được Bkav.");
    } finally {
      setSubmitting(false);
    }
  }

  const created = new Date(target.createdAt).toLocaleDateString("vi-VN");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sửa hoá đơn đã phát hành</DialogTitle>
        <DialogDescription>
          Số tiền và món giữ nguyên như đơn gốc — chỉ đổi thông tin người mua.
        </DialogDescription>
      </DialogHeader>

      <div
        className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm"
        data-ocid="accounting.correction_original"
      >
        <div>
          <span className="block text-xs text-muted-foreground">
            Hoá đơn gốc
          </span>
          {target.invoiceSerial ? `${target.invoiceSerial} · ` : ""}
          <b>{target.invoiceId}</b>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">
            Ngày · Tổng tiền
          </span>
          {created} · {vnd(target.amount)}
        </div>
      </div>

      <fieldset
        className="grid grid-cols-2 gap-2"
        aria-label="Loại sửa hoá đơn"
      >
        {(
          [
            [
              "replace",
              "Thay thế",
              "Phát hành hoá đơn mới, hoá đơn gốc bị thay thế (lệnh 123).",
            ],
            [
              "adjust",
              "Điều chỉnh thông tin",
              "Chỉ sửa thông tin người mua, số tiền 0đ (lệnh 124).",
            ],
          ] as const
        ).map(([value, label, desc]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            data-ocid={`accounting.correction_kind.${value}`}
            className={`rounded-lg border px-3 py-2 text-left ${
              kind === value
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-secondary"
            }`}
          >
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">{desc}</span>
          </button>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2.5">
        <div>
          <Label htmlFor="corr-tax" className="text-xs">
            Mã số thuế người mua (để trống = bán cho người tiêu dùng)
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="corr-tax"
              inputMode="numeric"
              value={taxCode}
              onChange={(e) => {
                setTaxCode(e.target.value);
                setLookup("idle");
              }}
              data-ocid="accounting.correction_tax_input"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!tax || !taxValid || lookup === "loading"}
              onClick={() => void handleLookup()}
              data-ocid="accounting.correction_lookup_button"
            >
              {lookup === "loading" && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Tra cứu
            </Button>
          </div>
          {!taxValid && (
            <p className="mt-1 text-xs text-destructive">
              MST gồm 10, 12, 14 số hoặc dạng 0123456789-001.
            </p>
          )}
          {lookup === "found" && (
            <p className="mt-1 text-xs text-success">
              ✓ Đã điền tên và địa chỉ đăng ký với cơ quan thuế.
            </p>
          )}
          {lookup === "notFound" && (
            <p className="mt-1 text-xs text-warning">
              Không tìm thấy MST này — kiểm tra lại.
            </p>
          )}
          {lookup === "error" && (
            <p className="mt-1 text-xs text-destructive">
              Không tra cứu được, thử lại sau.
            </p>
          )}
        </div>
        {tax && (
          <>
            <div>
              <Label htmlFor="corr-name" className="text-xs">
                Tên đơn vị mua hàng
              </Label>
              <Input
                id="corr-name"
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-ocid="accounting.correction_name_input"
              />
            </div>
            <div>
              <Label htmlFor="corr-address" className="text-xs">
                Địa chỉ
              </Label>
              <Input
                id="corr-address"
                className="mt-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                data-ocid="accounting.correction_address_input"
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="corr-email" className="text-xs">
            Email nhận hoá đơn (tuỳ chọn)
          </Label>
          <Input
            id="corr-email"
            type="email"
            className="mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-ocid="accounting.correction_email_input"
          />
          {!emailValid && (
            <p className="mt-1 text-xs text-destructive">Email không hợp lệ.</p>
          )}
        </div>
        <div>
          <Label htmlFor="corr-reason" className="text-xs">
            Lý do <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="corr-reason"
            rows={2}
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Khách yêu cầu xuất hoá đơn công ty"
            data-ocid="accounting.correction_reason_input"
          />
        </div>
      </div>

      {error && (
        <p
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="accounting.correction_error"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          title={!reasonValid ? "Nhập lý do (ít nhất 5 ký tự)" : undefined}
          onClick={() => void handleSubmit()}
          data-ocid="accounting.correction_submit_button"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {kind === "replace"
            ? "Phát hành hoá đơn thay thế"
            : "Phát hành hoá đơn điều chỉnh"}
        </Button>
      </DialogFooter>
    </>
  );
}
