// "Quét màn hình tài xế": cắt đúng vùng trong khung ngắm (object-fit:
// cover) và quyết định khi nào dừng quét.

import { coverCropRect, decideAfterFrame, fitWidth } from "@/lib/live-scan";
import { describe, expect, it } from "vitest";

const m = (orderId: string, pickupCode = "") => ({
  orderId,
  cusName: "A",
  amount: 95000,
  pickupCode,
});

describe("coverCropRect", () => {
  it("maps the on-screen box to camera pixels when a landscape video covers a portrait area", () => {
    // Camera 1920x1080 phủ khung 400x500 → phóng theo chiều cao (500/1080),
    // 2 bên bị cắt. Khung ngắm ở giữa.
    const r = coverCropRect(1920, 1080, 400, 500, {
      x: 24,
      y: 140,
      w: 352,
      h: 180,
    });
    const scale = 500 / 1080;
    expect(r).not.toBeNull();
    expect(r?.w).toBe(Math.round(352 / scale));
    expect(r?.h).toBe(Math.round(180 / scale));
    // Tâm khung ngắm trùng tâm khung hình camera.
    expect(Math.round((r?.x ?? 0) + (r?.w ?? 0) / 2)).toBe(960);
    expect(Math.round((r?.y ?? 0) + (r?.h ?? 0) / 2)).toBe(
      Math.round(230 / scale),
    );
  });

  it("clamps to the frame and rejects empty sizes", () => {
    const r = coverCropRect(640, 480, 640, 480, {
      x: 600,
      y: 400,
      w: 200,
      h: 200,
    });
    expect(r).toEqual({ x: 600, y: 400, w: 40, h: 80 });
    expect(
      coverCropRect(0, 0, 640, 480, { x: 0, y: 0, w: 10, h: 10 }),
    ).toBeNull();
  });

  it("downsizes wide crops to 1200px, keeping the aspect ratio", () => {
    expect(fitWidth(1760, 900)).toEqual({ w: 1200, h: 614 });
    expect(fitWidth(800, 300)).toEqual({ w: 800, h: 300 });
  });
});

describe("decideAfterFrame", () => {
  const empty = { pending: null, extra: 0 };

  it("finishes immediately when the pickup code was read", () => {
    const d = decideAfterFrame(empty, [m("ORD-1", "Q2WE8R")]);
    expect(d).toEqual({ action: "finish", matches: [m("ORD-1", "Q2WE8R")] });
  });

  it("keeps scanning (faster) for a few frames to also read the code, then opens the order anyway", () => {
    let d = decideAfterFrame(empty, [m("ORD-1")]);
    expect(d.action).toBe("continue");
    if (d.action !== "continue") return;
    expect(d.delayMs).toBe(300);
    d = decideAfterFrame(d.state, []);
    if (d.action !== "continue") throw new Error("expected continue");
    d = decideAfterFrame(d.state, [m("ORD-1")]);
    if (d.action !== "continue") throw new Error("expected continue");
    d = decideAfterFrame(d.state, []);
    expect(d).toEqual({ action: "finish", matches: [m("ORD-1")] });
  });

  it("upgrades to the match with the code when a later frame reads it", () => {
    const d1 = decideAfterFrame(empty, [m("ORD-1")]);
    if (d1.action !== "continue") throw new Error("expected continue");
    expect(decideAfterFrame(d1.state, [m("ORD-1", "Q2WE8R")])).toEqual({
      action: "finish",
      matches: [m("ORD-1", "Q2WE8R")],
    });
  });

  it("scans at the normal pace while nothing has been found", () => {
    expect(decideAfterFrame(empty, [])).toEqual({
      action: "continue",
      state: empty,
      delayMs: 700,
    });
  });
});
