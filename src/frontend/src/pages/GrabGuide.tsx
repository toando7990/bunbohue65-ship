// GrabGuide — trang phát video hướng dẫn khách cách tự đặt tài xế (Grab hoặc
// app tương tự) đến nhận hàng tại quán. Video KHÔNG lưu trong canister/git —
// phát trực tiếp từ file tĩnh trên VPS (vps-worker phục vụ qua static route
// /uploads, xem index.js: app.use('/uploads', express.static(UPLOAD_DIR))).
// Muốn đổi/thêm video mới chỉ cần đưa file lên đúng UPLOAD_DIR trên VPS,
// không cần build/deploy lại app.

import { vpsBaseUrl } from "@/lib/vps-client";
import { Video } from "lucide-react";

// Tên file trên UPLOAD_DIR của VPS (vps-worker/uploads/). Đổi đúng tên này
// nếu video được thay bằng file khác.
const GUIDE_VIDEO_FILENAME = "huong-dan-dat-grab.mp4";

export default function GrabGuide() {
  const videoUrl = `${vpsBaseUrl}/uploads/${GUIDE_VIDEO_FILENAME}`;

  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6"
      data-ocid="grab_guide.page"
    >
      <header className="mb-6">
        <h1
          className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight md:text-3xl"
          data-ocid="grab_guide.title"
        >
          <Video className="h-6 w-6 text-primary" aria-hidden="true" />
          Hướng dẫn đặt Grab giao hàng
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Video hướng dẫn từng bước cách tự đặt tài xế đến nhận hàng tại quán
          sau khi đặt món xong.
        </p>
      </header>

      <div
        className="overflow-hidden rounded-xl border border-border bg-black shadow-sm"
        data-ocid="grab_guide.video_wrapper"
      >
        {/* biome-ignore lint/a11y/useMediaCaption: video hướng dẫn thao tác màn hình, không có lời thoại cần phụ đề */}
        <video
          key={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="aspect-[9/16] w-full max-h-[80vh] bg-black md:aspect-video"
          data-ocid="grab_guide.video_player"
        >
          <source src={videoUrl} type="video/mp4" />
          Trình duyệt của bạn không hỗ trợ phát video. Vui lòng cập nhật trình
          duyệt hoặc thử trên thiết bị khác.
        </video>
      </div>
    </section>
  );
}
