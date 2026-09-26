// DriverScreenScan — nút "Chụp màn hình tài xế" ở tab Hàng đợi (/driver).
// Nhân viên chụp phần ghi chú đơn trên điện thoại tài xế Lalamove → VPS
// đọc chữ (routes/driver-pickup-lookup.js) → tìm đúng đơn → mở màn thanh
// toán với mã nhận hàng đã điền sẵn (giống quét "QR nhận hàng"). Không
// đọc được → chụp lại hoặc nhập tay mã nhận hàng tài xế đọc.
//
// Dùng camera GỐC của máy (input capture="environment") — không cần xin
// quyền camera cho trình duyệt. Ảnh được thu nhỏ trước khi gửi (nhanh hơn,
// đọc chữ vẫn đủ nét) và KHÔNG được lưu lại trên VPS.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type PickupLookupMatch,
  lookupPickupByCode,
  lookupPickupByPhoto,
} from "@/lib/vps-client";
import { Camera, CheckCircle2, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const AUTO_OPEN_MS = 2000;
const MAX_SIDE = 2000;

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "found"; matches: PickupLookupMatch[] }
  | { kind: "notFound"; error?: string };

function formatVnd(v: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v);
}

// Thu nhỏ ảnh chụp (điện thoại thường 3–8MB) về cạnh dài tối đa 2000px,
// JPEG. Lỗi bất kỳ (trình duyệt cũ, định dạng lạ) → gửi nguyên ảnh.
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3_000_000 && file.type === "image/jpeg") {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Không tìm được đơn lúc này, vui lòng thử lại.";
}

interface DriverScreenScanProps {
  restaurantId: string;
  deviceId: string;
  // Mở màn thanh toán của đơn — pickupCode null khi chưa xác nhận được mã
  // (màn thanh toán sẽ hỏi mã như bình thường).
  onOpenOrder: (orderId: string, pickupCode: string | null) => void;
}

export function DriverScreenScan({
  restaurantId,
  deviceId,
  onOpenOrder,
}: DriverScreenScanProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [searchingCode, setSearchingCode] = useState(false);

  function openMatch(m: PickupLookupMatch) {
    setOpen(false);
    setPhase({ kind: "idle" });
    onOpenOrder(m.orderId, m.pickupCode || null);
  }

  // Tìm thấy đúng 1 đơn → tự mở màn thanh toán sau 2 giây.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ hẹn giờ lại khi kết quả tìm đổi
  useEffect(() => {
    if (phase.kind !== "found" || phase.matches.length !== 1) return;
    const timer = setTimeout(() => openMatch(phase.matches[0]), AUTO_OPEN_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  function showResult(matches: PickupLookupMatch[]) {
    setPhase(
      matches.length > 0 ? { kind: "found", matches } : { kind: "notFound" },
    );
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setOpen(true);
    setCode("");
    setPhase({ kind: "reading" });
    try {
      const image = await shrinkImage(file);
      showResult(await lookupPickupByPhoto(restaurantId, deviceId, image));
    } catch (err) {
      setPhase({ kind: "notFound", error: errorMessage(err) });
    }
  }

  async function searchByCode() {
    const c = code.replace(/\s+/g, "").toUpperCase();
    if (c.length !== 6) return;
    setSearchingCode(true);
    try {
      const matches = await lookupPickupByCode(restaurantId, deviceId, c);
      setPhase(
        matches.length > 0
          ? { kind: "found", matches }
          : {
              kind: "notFound",
              error: `Không có đơn chưa thanh toán hôm nay với mã ${c}.`,
            },
      );
    } catch (err) {
      setPhase({ kind: "notFound", error: errorMessage(err) });
    } finally {
      setSearchingCode(false);
    }
  }

  function retake() {
    fileRef.current?.click();
  }

  return (
    <>
      <button
        type="button"
        onClick={retake}
        data-ocid="driver.screen_scan_button"
        className="flex w-full items-center gap-3 rounded-xl bg-gradient-primary p-3.5 text-left text-primary-foreground shadow-md transition-smooth hover:opacity-95"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-base font-bold">
            Chụp màn hình tài xế
          </span>
          <span className="block text-xs opacity-90">
            Tự tìm đơn + tự điền mã nhận hàng
          </span>
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-ocid="driver.screen_scan_input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // chụp lại cùng ảnh vẫn kích hoạt onChange
          void handleFile(file);
        }}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl"
          data-ocid="driver.screen_scan_sheet"
        >
          {phase.kind === "reading" && (
            <SheetHeader>
              <SheetTitle>Đang đọc mã trên ảnh…</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thường mất 1–3 giây
              </SheetDescription>
            </SheetHeader>
          )}

          {phase.kind === "found" && (
            <div
              className="flex flex-col gap-3 p-4 pt-0"
              data-ocid="driver.screen_scan_found"
            >
              <SheetHeader className="px-0">
                <SheetTitle className="flex items-center gap-2">
                  <CheckCircle2
                    className="h-5 w-5 text-success"
                    aria-hidden="true"
                  />
                  {phase.matches.length === 1
                    ? "Đã tìm thấy đơn"
                    : "Có nhiều đơn khớp — chọn đúng đơn"}
                </SheetTitle>
                {phase.matches.length === 1 && (
                  <SheetDescription>
                    Tự chuyển sang màn thanh toán sau 2 giây…
                  </SheetDescription>
                )}
              </SheetHeader>
              {phase.matches.map((m) => (
                <button
                  key={m.orderId}
                  type="button"
                  onClick={() => openMatch(m)}
                  data-ocid="driver.screen_scan_match"
                  className="rounded-xl border border-success/30 bg-success/10 p-3 text-left"
                >
                  <span className="block font-semibold">
                    {m.cusName || "Khách"} · {formatVnd(m.amount)}
                  </span>
                  <span className="mt-1 flex gap-4 font-mono text-xs text-muted-foreground">
                    <span>…{m.orderId.slice(-8)}</span>
                    <span>
                      {m.pickupCode
                        ? `Mã ${m.pickupCode} ✓`
                        : "Chưa đọc được mã — hỏi tài xế"}
                    </span>
                  </span>
                </button>
              ))}
              {phase.matches.length === 1 && (
                <Button
                  type="button"
                  onClick={() => openMatch(phase.matches[0])}
                  className="min-h-[46px] bg-success text-white hover:bg-success/90"
                  data-ocid="driver.screen_scan_open_now"
                >
                  Mở thanh toán ngay
                </Button>
              )}
            </div>
          )}

          {phase.kind === "notFound" && (
            <div
              className="flex flex-col gap-3 p-4 pt-0"
              data-ocid="driver.screen_scan_not_found"
            >
              <SheetHeader className="px-0">
                <SheetTitle>Chưa đọc được mã</SheetTitle>
              </SheetHeader>
              <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                {phase.error ??
                  "Ảnh bị loá hoặc mờ. Nghiêng điện thoại tài xế để tránh loá rồi chụp lại — hoặc nhập mã nhận hàng tài xế đọc cho bạn."}
              </p>
              <label
                htmlFor="driver-screen-scan-code"
                className="text-center text-xs text-muted-foreground"
              >
                Nhập mã nhận hàng (6 ký tự)
              </label>
              <Input
                id="driver-screen-scan-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().slice(0, 6))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchByCode();
                }}
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                placeholder="VD: AB23CD"
                className="h-12 text-center font-mono text-xl font-bold tracking-[0.4em]"
                data-ocid="driver.screen_scan_code_input"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px] flex-1"
                  onClick={retake}
                  data-ocid="driver.screen_scan_retake"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Chụp lại
                </Button>
                <Button
                  type="button"
                  className="min-h-[44px] flex-1"
                  onClick={() => void searchByCode()}
                  disabled={code.length !== 6 || searchingCode}
                  data-ocid="driver.screen_scan_search_code"
                >
                  {searchingCode ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                  Tìm đơn
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
