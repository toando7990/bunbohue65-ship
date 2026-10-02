// Tạm ngưng nhận đơn trực tuyến khi giờ mở = giờ đóng.
import { StorePausedNotice } from "@/components/StorePausedNotice";
import { isStorePaused } from "@/lib/store-paused";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    ...rest
  }: { children: React.ReactNode; to?: string } & Record<string, unknown>) => (
    <a href="/" {...rest}>
      {children}
    </a>
  ),
}));

const h = (oh: number, om: number, ch: number, cm: number) => ({
  openHour: BigInt(oh),
  openMinute: BigInt(om),
  closeHour: BigInt(ch),
  closeMinute: BigInt(cm),
});

describe("isStorePaused", () => {
  it("is true when opening time equals closing time", () => {
    expect(isStorePaused(h(0, 0, 0, 0))).toBe(true);
    expect(isStorePaused(h(9, 30, 9, 30))).toBe(true);
  });
  it("is false for normal or overnight hours and missing data", () => {
    expect(isStorePaused(h(7, 0, 21, 0))).toBe(false);
    expect(isStorePaused(h(18, 0, 2, 0))).toBe(false);
    expect(isStorePaused(undefined)).toBe(false);
  });
});

describe("StorePausedNotice", () => {
  afterEach(() => cleanup());
  it("shows the approved message, hotline and store list — no Grab/Shopee", () => {
    render(<StorePausedNotice />);
    expect(screen.getByText("Tạm ngưng nhận đơn trực tuyến")).toBeTruthy();
    expect(screen.getByTestId("create_order.paused_hotline")).toBeTruthy();
    expect(screen.getByTestId("create_order.paused_stores")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GrabFood|ShopeeFood/);
  });
});
