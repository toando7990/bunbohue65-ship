// Trang Điều khoản giao dịch — các mục đã duyệt phải có mặt.
import DieuKhoan from "@/pages/DieuKhoan";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

describe("DieuKhoan", () => {
  afterEach(() => cleanup());

  it("renders the 3-party summary and all 11 sections", () => {
    render(<DieuKhoan />);
    expect(screen.getByTestId("dieu_khoan.summary")).toBeTruthy();
    for (let n = 1; n <= 11; n++) {
      expect(screen.getByTestId(`dieu_khoan.section.${n}`)).toBeTruthy();
    }
    expect(
      screen.getByText("Trách nhiệm của khách hàng", { exact: false }),
    ).toBeTruthy();
  });

  it("states the agreed complaint deadlines and the no-show policy", () => {
    render(<DieuKhoan />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("2 giờ");
    expect(text).toContain("24 giờ");
    expect(text).toContain("7 ngày làm việc");
    expect(text).toContain("ghi nhận địa chỉ IP");
    expect(text).toContain("02/10/2026");
  });
});
