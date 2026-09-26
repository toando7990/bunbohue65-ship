// TaxCodeCell — ô "MST khách" trong bảng trang Kế toán. Kế toán thêm/sửa
// mã số thuế của khách (tuỳ chọn) cho đơn CHƯA có hoá đơn: nhập MST →
// "Tra cứu" (Bkav, tên + địa chỉ đã đăng ký với cơ quan thuế) → "Lưu".
// Đơn có MST được phát hành hoá đơn CÔNG TY; không có → hoá đơn bán lẻ.

import { Button } from "@/components/ui/button";
import {
  enterpriseLookupTaxCode,
  enterpriseSetOrderTaxCode,
} from "@/lib/vps-client";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// 10 số, 10 số-3 số (chi nhánh), 12 số (CCCD dùng làm MST cá nhân), 14 số
// — cùng quy tắc VPS (routes/enterprise-actions.js).
const TAX_CODE_RE = /^(\d{10}(-\d{3})?|\d{12}|\d{14})$/;

interface TaxCodeCellProps {
  deviceId: string;
  orderId: string;
  taxCode: string;
  taxName: string;
  // false: đơn đã có hoá đơn / đang phát hành / đã huỷ — chỉ hiển thị.
  editable: boolean;
  onSaved: () => void;
  ocid: string;
}

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; name: string; address: string }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

export function TaxCodeCell({
  deviceId,
  orderId,
  taxCode,
  taxName,
  editable,
  onSaved,
  ocid,
}: TaxCodeCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(taxCode);
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  const normalized = value.replace(/\s+/g, "");
  const valid = TAX_CODE_RE.test(normalized);

  function open() {
    setValue(taxCode);
    setLookup({ kind: "idle" });
    setEditing(true);
  }

  async function handleLookup() {
    if (!valid) return;
    setLookup({ kind: "loading" });
    try {
      const r = await enterpriseLookupTaxCode(deviceId, normalized);
      setLookup(
        r.found
          ? { kind: "found", name: r.name, address: r.address }
          : { kind: "notFound" },
      );
    } catch (err) {
      setLookup({
        kind: "error",
        message: err instanceof Error ? err.message : "Không tra cứu được.",
      });
    }
  }

  async function save(code: string, name: string) {
    setSaving(true);
    try {
      await enterpriseSetOrderTaxCode(deviceId, orderId, code, name);
      toast.success(code ? "Đã lưu mã số thuế." : "Đã xoá mã số thuế.");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không lưu được mã số thuế.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div
        className="flex min-w-[240px] flex-col gap-1.5"
        data-ocid={`${ocid}.editor`}
      >
        <div className="flex gap-1.5">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setLookup({ kind: "idle" });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleLookup();
              if (e.key === "Escape") setEditing(false);
            }}
            inputMode="numeric"
            placeholder="Mã số thuế"
            aria-label="Mã số thuế khách"
            // biome-ignore lint/a11y/noAutofocus: ô vừa được mở theo yêu cầu của Kế toán
            autoFocus
            className="h-8 w-36 rounded-md border border-input bg-card px-2 font-mono text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            data-ocid={`${ocid}.input`}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!valid || lookup.kind === "loading"}
            onClick={() => void handleLookup()}
            data-ocid={`${ocid}.lookup_button`}
          >
            {lookup.kind === "loading" && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            Tra cứu
          </Button>
        </div>
        {!valid && normalized.length > 0 && (
          <p className="text-[11px] text-destructive">
            MST gồm 10, 12, 14 số hoặc dạng 0123456789-001.
          </p>
        )}
        {lookup.kind === "found" && (
          <p
            className="rounded-md bg-success/10 px-2 py-1.5 text-[11px] text-success"
            data-ocid={`${ocid}.lookup_result`}
          >
            ✓ <b>{lookup.name}</b>
            {lookup.address && (
              <>
                <br />
                {lookup.address}
              </>
            )}
          </p>
        )}
        {lookup.kind === "notFound" && (
          <p className="text-[11px] text-warning">
            Không tìm thấy MST này trên hệ thống thuế — kiểm tra lại trước khi
            lưu.
          </p>
        )}
        {lookup.kind === "error" && (
          <p className="text-[11px] text-destructive">{lookup.message}</p>
        )}
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={!valid || saving || lookup.kind !== "found"}
            title={
              lookup.kind !== "found" ? "Tra cứu MST trước khi lưu" : undefined
            }
            onClick={() =>
              void save(normalized, lookup.kind === "found" ? lookup.name : "")
            }
            data-ocid={`${ocid}.save_button`}
          >
            {saving && (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            Lưu
          </Button>
          {taxCode && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive"
              disabled={saving}
              onClick={() => void save("", "")}
              data-ocid={`${ocid}.remove_button`}
            >
              Xoá MST
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setEditing(false)}
          >
            Huỷ
          </Button>
        </div>
      </div>
    );
  }

  if (taxCode) {
    return (
      <div className="flex flex-col" data-ocid={ocid}>
        <span className="flex items-center gap-1 font-mono text-xs font-semibold">
          {taxCode}
          {editable && (
            <button
              type="button"
              onClick={open}
              aria-label="Sửa mã số thuế"
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary"
              data-ocid={`${ocid}.edit_button`}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </span>
        {taxName && (
          <span
            className="max-w-[200px] truncate text-[11px] text-muted-foreground"
            title={taxName}
          >
            {taxName}
          </span>
        )}
      </div>
    );
  }

  if (!editable) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
      data-ocid={`${ocid}.add_button`}
    >
      <Plus className="h-3 w-3" aria-hidden="true" />
      Thêm MST
    </button>
  );
}
