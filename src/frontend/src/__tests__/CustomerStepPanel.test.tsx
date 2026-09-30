// CustomerStepPanel — khối "Đặt tài xế" / "Huỷ đơn" sau khi đặt món từ xa.
import { CustomerStepPanel } from "@/components/CustomerStepPanel";
import type { CustomerStepState } from "@/lib/vps-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

function state(over: Partial<CustomerStepState>): CustomerStepState {
  const now = Date.now();
  return {
    ok: true,
    step: "awaiting",
    deadline: now + 5 * 60 * 1000,
    serverNow: now,
    canDispatch: true,
    canCancel: true,
    cancelReason: "",
    cancelledAt: null,
    ...over,
  };
}

describe("CustomerStepPanel", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.setItem("bbh_my_orders", JSON.stringify(["ORD-1"]));
  });

  it("shows Đặt tài xế + Huỷ đơn and the countdown while awaiting", () => {
    render(
      <CustomerStepPanel
        orderId="ORD-1"
        state={state({})}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Đặt tài xế")).toBeTruthy();
    expect(screen.getByText("Huỷ đơn")).toBeTruthy();
    expect(screen.getByText(/0[45]:\d\d/)).toBeTruthy();
  });

  it("hides the buttons from a browser that did not place the order", () => {
    render(
      <CustomerStepPanel
        orderId="ORD-2"
        state={state({})}
        onChanged={() => {}}
      />,
    );
    expect(screen.queryByText("Đặt tài xế")).toBeNull();
  });

  it("shows the auto-cancel message after 10 minutes", () => {
    render(
      <CustomerStepPanel
        orderId="ORD-1"
        state={state({ step: "expired", canDispatch: false, canCancel: false })}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Đơn đã tự huỷ")).toBeTruthy();
  });

  it("renders nothing for orders outside this flow", () => {
    const { container } = render(
      <CustomerStepPanel
        orderId="ORD-1"
        state={state({ step: "" })}
        onChanged={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
