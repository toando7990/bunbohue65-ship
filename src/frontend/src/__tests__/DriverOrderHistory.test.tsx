// Cấp nhà hàng: lọc Lịch sử đơn /driver theo hình thức thanh toán, số liệu
// tổng hợp tính lại theo tập đã lọc.
import { DriverOrderHistory } from "@/components/DriverOrderHistory";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetRestaurantHistory = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getRestaurantHistory: (...a: unknown[]) => mockGetRestaurantHistory(...a),
}));
vi.mock("@/components/OrderCard", () => ({
  OrderCard: ({ order }: { order: { orderId: string } }) => (
    <div data-ocid="mock-order-card">{order.orderId}</div>
  ),
}));

const row = (
  orderId: string,
  amount: number,
  paymentStatus: string,
  paymentMethod: string,
) => ({
  orderId,
  restaurantId: "R1",
  cusName: "Khách",
  cusPhone: "0900000000",
  amount,
  bookingStatus: "confirmed",
  paymentStatus,
  paymentMethod,
  createdAt: Date.now(),
  kmDiscountAmount: 0,
  voucherDiscountAmount: 0,
  items: [],
});

describe("DriverOrderHistory — lọc theo hình thức thanh toán", () => {
  afterEach(() => cleanup());

  it("filters by cash / transfer and recomputes the order count and paid total", async () => {
    mockGetRestaurantHistory.mockResolvedValue({
      totalOrders: 3,
      totalPaidAmount: 120000,
      orders: [
        row("O-CASH", 50000, "paid", "cash"),
        row("O-TRANSFER", 70000, "paid", "transfer"),
        row("O-UNPAID", 30000, "unpaid", ""),
      ],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DriverOrderHistory restaurantId="R1" period="today" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("O-CASH")).toBeInTheDocument());
    expect(screen.getByTestId("driver_history.total_orders")).toHaveTextContent(
      "3 đơn",
    );

    fireEvent.click(
      screen.getByTestId("driver_history.payment_method_filter.cash"),
    );
    expect(screen.getByText("O-CASH")).toBeInTheDocument();
    expect(screen.queryByText("O-TRANSFER")).not.toBeInTheDocument();
    expect(screen.queryByText("O-UNPAID")).not.toBeInTheDocument();
    expect(screen.getByTestId("driver_history.total_orders")).toHaveTextContent(
      "1 đơn",
    );
    expect(screen.getByTestId("driver_history.total_paid")).toHaveTextContent(
      "50.000",
    );

    fireEvent.click(
      screen.getByTestId("driver_history.payment_method_filter.transfer"),
    );
    expect(screen.getByText("O-TRANSFER")).toBeInTheDocument();
    expect(screen.getByTestId("driver_history.total_paid")).toHaveTextContent(
      "70.000",
    );
  });
});
