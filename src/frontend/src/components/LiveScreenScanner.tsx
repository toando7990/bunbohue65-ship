// LiveScreenScanner — "Quét màn hình tài xế" (/driver): mở camera ngay
// trong trang, cứ ~0,7 giây cắt phần nằm trong khung ngắm gửi VPS đọc chữ
// (lookupPickupByFrame) cho tới khi tìm thấy đơn. Mỗi lúc chỉ 1 khung đang
// gửi. Tìm thấy đơn nhưng chưa đọc được mã nhận hàng → quét thêm vài khung
// để lấy cả mã. Đóng / tìm thấy → tắt camera ngay.

import { Button } from "@/components/ui/button";
import {
  type ScanState,
  coverCropRect,
  decideAfterFrame,
  fitWidth,
} from "@/lib/live-scan";
import {
  type PickupLookupMatch,
  VpsHttpError,
  lookupPickupByFrame,
} from "@/lib/vps-client";
import { Camera, Flashlight, Keyboard, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const INTERVAL_MS = 700;
const HINT_AFTER = 15; // ~10–15 giây chưa đọc được → gợi ý
const EXTRA_FOR_CODE = 3; // đã thấy đơn, quét thêm tối đa 3 khung để lấy mã

interface Props {
  restaurantId: string;
  deviceId: string;
  onFound: (matches: PickupLookupMatch[]) => void;
  onError: (message: string) => void;
  onManual: () => void;
  onPhoto: () => void;
}

type TorchTrack = MediaStreamTrack;

export function LiveScreenScanner({
  restaurantId,
  deviceId,
  onFound,
  onError,
  onManual,
  onPhoto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [attempts, setAttempts] = useState(0);
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchTrack, setTorchTrack] = useState<TorchTrack | null>(null);

  // Giữ callback mới nhất cho vòng quét (không khởi động lại camera).
  const cbRef = useRef({ onFound, onError });
  cbRef.current = { onFound, onError };

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let count = 0;
    let scan: ScanState = { pending: null, extra: 0 }; // đã thấy đơn, chưa có mã
    const canvas = document.createElement("canvas");

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
    const finish = (matches: PickupLookupMatch[]) => {
      stop();
      navigator.vibrate?.(120);
      cbRef.current.onFound(matches);
    };
    const schedule = (ms = INTERVAL_MS) => {
      if (!stopped) timer = setTimeout(() => void tick(), ms);
    };

    async function grabFrame(): Promise<Blob | null> {
      const v = videoRef.current;
      const area = areaRef.current?.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      if (!v || !area || !box || v.readyState < 2) return null;
      const crop = coverCropRect(
        v.videoWidth,
        v.videoHeight,
        area.width,
        area.height,
        {
          x: box.left - area.left,
          y: box.top - area.top,
          w: box.width,
          h: box.height,
        },
      );
      if (!crop) return null;
      const out = fitWidth(crop.w, crop.h);
      canvas.width = out.w;
      canvas.height = out.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, out.w, out.h);
      return new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
    }

    async function tick() {
      if (stopped) return;
      if (document.hidden) return schedule();
      const frame = await grabFrame();
      if (stopped) return;
      if (!frame) return schedule(300);
      count += 1;
      setAttempts(count);
      let matches: PickupLookupMatch[] = [];
      try {
        matches = await lookupPickupByFrame(restaurantId, deviceId, frame);
      } catch (err) {
        if (stopped) return;
        if (
          err instanceof VpsHttpError &&
          (err.status === 403 || err.status === 400)
        ) {
          stop();
          cbRef.current.onError(err.message);
          return;
        }
        // Quá nhanh / mạng chập chờn → nghỉ rồi quét tiếp.
        return schedule(
          err instanceof VpsHttpError && err.status === 429 ? 3000 : 1500,
        );
      }
      if (stopped) return;
      const d = decideAfterFrame(scan, matches, {
        intervalMs: INTERVAL_MS,
        extraLimit: EXTRA_FOR_CODE,
      });
      if (d.action === "finish") return finish(d.matches);
      scan = d.state;
      schedule(d.delayMs);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      } catch {
        if (!stopped) {
          cbRef.current.onError(
            'Không mở được camera trong trang (chưa cho phép quyền camera). Bấm "Chụp ảnh" hoặc cho phép camera trong cài đặt trình duyệt.',
          );
        }
        return;
      }
      if (stopped) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        // Một số trình duyệt cũ không trả Promise từ play().
        try {
          await v.play();
        } catch {
          // autoPlay + muted vẫn phát được.
        }
      }
      // Đèn pin: chỉ một số máy Android (Chrome) hỗ trợ "torch".
      const track = stream.getVideoTracks()[0] as TorchTrack | undefined;
      const caps = track?.getCapabilities?.() as
        | { torch?: boolean }
        | undefined;
      if (track && caps?.torch) setTorchTrack(track);
      setReady(true);
      schedule(400);
    })();

    return stop;
  }, [restaurantId, deviceId]);

  async function toggleTorch() {
    if (!torchTrack) return;
    const next = !torchOn;
    try {
      await torchTrack.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchTrack(null);
    }
  }

  const slow = attempts >= HINT_AFTER;

  return (
    <div className="flex flex-col gap-3" data-ocid="driver.live_scan">
      <div
        ref={areaRef}
        className="relative h-[52vh] max-h-[460px] overflow-hidden rounded-xl bg-black"
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          data-ocid="driver.live_scan_video"
        />
        <div
          ref={boxRef}
          className="pointer-events-none absolute inset-x-[6%] top-[28%] h-[36%] rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        >
          {ready && (
            <span className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-success" />
          )}
        </div>
        <p className="absolute inset-x-0 bottom-[22%] text-center text-sm font-medium text-white">
          Đưa phần ghi chú của tài xế vào khung
        </p>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        )}
        {torchTrack && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? "Tắt đèn" : "Bật đèn"}
            aria-pressed={torchOn}
            className={`absolute right-3 top-3 rounded-full p-2 ${torchOn ? "bg-warning text-black" : "bg-black/50 text-white"}`}
            data-ocid="driver.live_scan_torch"
          >
            <Flashlight className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <p
        className={`flex items-center gap-2 text-sm ${slow ? "text-warning" : "text-muted-foreground"}`}
        data-ocid="driver.live_scan_status"
      >
        {slow ? (
          "Chưa đọc được — nghiêng màn hình tài xế tránh loá, đưa gần hơn, hoặc nhập mã tài xế đọc."
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {ready ? `Đang đọc… (lần ${attempts})` : "Đang mở camera…"}
          </>
        )}
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] flex-1"
          onClick={onManual}
          data-ocid="driver.live_scan_manual"
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
          Nhập mã tay
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] flex-1"
          onClick={onPhoto}
          data-ocid="driver.live_scan_photo"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Chụp ảnh
        </Button>
      </div>
    </div>
  );
}
