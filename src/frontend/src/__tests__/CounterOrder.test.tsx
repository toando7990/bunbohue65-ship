// Coverage cho CounterOrder (giao diện desktop mới) — xác nhận: đã kích
// hoạt thiết bị thì bỏ qua ActivationForm; banner Giờ Vàng hiện đúng khi
// có chương trình active và ước tính giảm giá đúng; đặt đơn gửi đúng
// payload isCounterOrder=true, KHÔNG có receiverEmail/cusName rỗng (dùng
// giá trị cố định).

import CounterOrder from "@/pages/CounterOrder";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockGetOrder = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {} }),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

const mainDish = {
  itemId: "I1",
  name: "Bun bo Hue",
  visible: true,
  category: "Món chính",
  image: new Uint8Array(),
  price: 45000n,
  vatRate: 8n,
  unitName: "tô",
};

vi.mock("@/hooks/useQueries", () => ({
  useMenus: () => ({ data: [mainDish], isLoading: false }),
  useCurrentPromotion: () => ({
    data: {
      code: "GV001",
      name: "Giờ Vàng",
      tiers: [{ minOrderValue: 80000n, discountAmount: 20000n }],
      timeSlots: [],
      active: true,
      startDate: "20260101",
      endDate: "20261231",
    },
  }),
}));

vi.mock("@/hooks/usePromotionCountdown", () => ({
  usePromotionCountdown: () => ({
    kind: "active",
    remainingMs: 600000,
    formatted: "10:00",
  }),
}));

// MenuPicker thật khá phức tạp (ảnh, lazy load...) — stub đơn giản chỉ
// cần đủ để tăng số lượng món chính lên 2 (đủ điều kiện tier 80.000đ).
vi.mock("@/components/MenuPicker", () => ({
  MenuPicker: ({
    onQuantityChange,
  }: { onQuantityChange: (id: string, d: number) => void }) => (
    <button
      type="button"
      data-ocid="mock-add-item"
      onClick={() => onQuantityChange("I1", 1)}
    >
      + Bun bo Hue
    </button>
  ),
}));

vi.mock("@/components/CounterQRDisplay", () => ({
  CounterQRDisplay: () => <div data-ocid="mock-qr-display" />,
}));

vi.mock("@/contexts/DeviceHeaderContext", () => ({
  useDeviceHeader: () => ({ setDeviceHeader: vi.fn() }),
}));

describe("CounterOrder (desktop layout)", () => {
  beforeEach(() => {
    localStorage.setItem(
      "bbh_counter_activation",
      JSON.stringify({ restaurantId: "R1", deviceId: "dev-1", name: "Quầy 1" }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("skips ActivationForm when already activated, shows the Golden Hour banner", () => {
    render(<CounterOrder />);
    expect(
      screen.getByTestId("counter.golden_hour_banner"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Đang trong Giờ Vàng/)).toBeInTheDocument();
  });

  it("shows the estimated Golden Hour discount once the cart qualifies", () => {
    render(<CounterOrder />);
    // 2 món x 45.000 = 90.000 (đủ điều kiện tier 80.000 -> giảm 20.000)
    fireEvent.click(screen.getByTestId("mock-add-item"));
    fireEvent.click(screen.getByTestId("mock-add-item"));
    expect(
      screen.getByText(/đủ điều kiện Giờ Vàng — giảm/),
    ).toBeInTheDocument();
  });

  it("submits with isCounterOrder=true and fixed cusName/cusPhone (no email)", async () => {
    mockCreate.mockResolvedValue({ ok: true, orderId: "ORD-1" });
    mockGetOrder.mockResolvedValue({ orderId: "ORD-1", amount: 70000n });

    render(<CounterOrder />);
    fireEvent.click(screen.getByTestId("mock-add-item"));
    fireEvent.click(screen.getByTestId("mock-add-item"));

    const submitButtons = screen.getAllByTestId(/counter\.submit_button/);
    fireEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.isCounterOrder).toBe(true);
    expect(payload.receiverEmail).toBe("");
    expect(payload.cusName).toBe("Khách tại quầy");
    expect(payload.cusPhone).not.toBe("");
  });
});
