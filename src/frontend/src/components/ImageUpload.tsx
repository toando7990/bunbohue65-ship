// ImageUpload — multipart upload to VPS /upload, preview + imageUrl display.
// Used by MenuItemForm. Calls vps-client.uploadImage(formData) → { imageUrl }.

import { cn } from "@/lib/utils";
import { uploadImage } from "@/lib/vps-client";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

interface ImageUploadProps {
  /** Current imageUrl (controlled). Empty string = no image. */
  value: string;
  /** Callback with the new imageUrl returned by VPS, or "" when cleared. */
  onChange: (imageUrl: string) => void;
  /** Optional disabled state (e.g. while parent form is submitting). */
  disabled?: boolean;
  /** Optional aria label override. */
  label?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

export function ImageUpload({
  value,
  onChange,
  disabled = false,
  label = "Ảnh món",
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const previewSrc = localPreview ?? (value || "");
  const hasImage = previewSrc.length > 0;

  async function handleFile(file: File) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Định dạng ảnh không hỗ trợ", {
        description: "Chấp nhận JPG, PNG, WebP.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ảnh quá lớn", {
        description: "Kích thước tối đa 5 MB.",
      });
      return;
    }

    // Local preview via object URL (revoked on replace/clear/unmount).
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const res = await uploadImage(formData);
      if (!res.ok || !res.imageUrl) {
        throw new Error(res.error || "VPS không trả về imageUrl");
      }
      onChange(res.imageUrl);
      toast.success("Tải ảnh thành công");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Tải ảnh thất bại. Vui lòng thử lại.";
      toast.error("Tải ảnh thất bại", { description: message });
      // Revert local preview on failure.
      setLocalPreview(null);
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be re-selected.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function handleClear() {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2" data-ocid="image_upload">
      <span className="text-sm font-medium leading-none select-none">
        {label}
      </span>

      <div className="flex items-start gap-4">
        {/* Preview / dropzone */}
        <div
          data-ocid="image_upload.dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !isUploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-smooth",
            dragOver ? "border-primary ring-2 ring-ring/40" : "border-input",
            disabled && "opacity-60",
          )}
        >
          {hasImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Xem trước ảnh món"
                className="h-full w-full object-cover"
                data-ocid="image_upload.preview"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground">
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-6 w-6" />
              )}
              <span className="text-[11px] leading-tight">
                {isUploading ? "Đang tải…" : "Chưa có ảnh"}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED.join(",")}
            disabled={disabled || isUploading}
            onChange={handleInputChange}
            className="sr-only"
            data-ocid="image_upload.input"
          />
          <label
            htmlFor={inputId}
            className={cn(
              "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-smooth hover:bg-accent hover:text-accent-foreground",
              (disabled || isUploading) && "pointer-events-none opacity-50",
            )}
            data-ocid="image_upload.upload_button"
          >
            <UploadCloud className="h-4 w-4" />
            {hasImage ? "Đổi ảnh" : "Tải ảnh lên"}
          </label>

          {hasImage && !isUploading && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive transition-smooth hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              data-ocid="image_upload.clear_button"
            >
              <Trash2 className="h-4 w-4" />
              Xóa ảnh
            </button>
          )}

          {value && !localPreview && (
            <p
              className="break-all font-mono text-[11px] text-muted-foreground"
              data-ocid="image_upload.url"
              title={value}
            >
              {value}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Kéo thả hoặc chọn ảnh. JPG/PNG/WebP, tối đa 5 MB.
          </p>
        </div>
      </div>
    </div>
  );
}
