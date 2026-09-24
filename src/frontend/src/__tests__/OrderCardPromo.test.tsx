// Thẻ đơn phía KHÁCH: tách khuyến mại / phiếu (kèm tên), phí ship luôn hiện,
// tổng = tiền món sau giảm + ship. Phía NHÂN VIÊN (staffView) giữ như cũ.
import type { Order } from "@/backend";
import { OrderCard } from "@/components/OrderCard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPromo = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getOrderPromoInfo: (...a: unknown[]) => mockPromo(...a),
}));
vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => ({ data: [] }),
  useDevicesByRestaurant: () => ({ data: [] }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#x">{children}</a>
  ),
}));

function makeOrder(o: Partial<Order> = {}): Order {
  return {
    orderId: "ORD-1",
    restaurantId: "R1",
    cusName: "Do Thanh Nam",
    cusPhone: "0914658365",
    cusAddress: "123 Láng",
    cusTaxCode: "",
    receiverEmail: "",
    pickupCode: "",
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    amount: 70000n,
    goodsAmount: 100000n,
    shippingFee: 28000n,
    taxTotal: 0n,
    ahamoveOrderId: "",
    items: [
      {
        itemId: "I1",
        name: "Bát Đỏ",
        quantity: 1n,
        price: 100000n,
        vatRate: 8n,
        unitName: "tô",
      },
    ],
    paymentStatus: "unpaid",
    bookingStatus: "confirmed",
    invoiceStatus: "none",
    kmDiscountAmount: 20000n,
    voucherDiscountAmount: 10000n,
    ...o,
  } as unknown as Order;
}

function renderCard(order: Order, staffView = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderCard order={order} index={1} staffView={staffView} />
    </QueryClientProvider>,
  );
}

describe("OrderCard — khuyến mại & phí ship", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("customer view: separate promo/voucher lines WITH names, shipping line, total = after-discount + ship, promo chip and savings", async () => {
    mockPromo.mockResolvedValue({
      kmProgramCode: "GV01",
      kmProgramName: "Giờ Vàng",
      voucherCode: "NEWUSER10",
    });
    renderCard(makeOrder());
    await waitFor(() =>
      expect(screen.getByTestId("order.card.1.km_line")).toHaveTextContent(
        "Giờ Vàng",
      ),
    );
    expect(screen.getByTestId("order.card.1.km_line")).toHaveTextContent(
      "20.000",
    );
    expect(screen.getByTestId("order.card.1.voucher_line")).toHaveTextContent(
      "NEWUSER10",
    );
    expect(
      screen.getByTestId("order.card.1.shipping_fee_line"),
    ).toHaveTextContent("28.000");
    expect(screen.getByTestId("order.card.1.total")).toHaveTextContent(
      "98.000",
    );
    expect(screen.getByTestId("order.card.1.promo_chip")).toBeInTheDocument();
    expect(screen.getByTestId("order.card.1.savings")).toHaveTextContent(
      "30.000",
    );
  });

  it("delivery order without a shipping quote shows 'Tài xế báo khi giao' instead of hiding the line", () => {
    renderCard(
      makeOrder({
        shippingFee: 0n,
        kmDiscountAmount: 0n,
        voucherDiscountAmount: 0n,
      }),
    );
    expect(
      screen.getByTestId("order.card.1.shipping_fee_line"),
    ).toHaveTextContent("Tài xế báo khi giao");
    expect(mockPromo).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("order.card.1.promo_chip"),
    ).not.toBeInTheDocument();
  });

  it("counter order (no delivery address) does not mention shipping", () => {
    renderCard(makeOrder({ cusAddress: "", shippingFee: 0n }));
    expect(
      screen.queryByTestId("order.card.1.shipping_fee_line"),
    ).not.toBeInTheDocument();
  });

  it("staff view (/driver history) keeps the old layout: total = goods amount only, no promo lookup", () => {
    renderCard(makeOrder(), true);
    expect(screen.getByTestId("order.card.1.total")).toHaveTextContent(
      "70.000",
    );
    expect(
      screen.getByTestId("order.card.1.discount_line"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("order.card.1.breakdown"),
    ).not.toBeInTheDocument();
    expect(mockPromo).not.toHaveBeenCalled();
  });
});
