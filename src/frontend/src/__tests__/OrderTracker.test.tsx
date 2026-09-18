// Coverage cho OrderStatusView (OrderTracker.tsx) — tập trung vào khối QR
// "nhận hàng" mới thêm: hiện đúng QR mã hoá {orderId, pickupCode} khi có
// mã nhận hàng và CHƯA thanh toán; ẩn hẳn sau khi đã thanh toán hoặc khi
// đơn không có mã nhận hàng — cùng điều kiện đã áp dụng cho khối text mã
// nhận hàng đã có từ trước.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  type OrderStatus,
  PaymentStatus,
} from "@/backend";
import { OrderStatusView } from "@/pages/OrderTracker";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ChangeRestaurantDialog", () => ({
  ChangeRestaurantDialog: () => null,
}));

vi.mock("@/hooks/useOrderStatus", () => ({
  useOrderStatus: () => ({}),
}));

vi.mock("@/hooks/useQueries", () => ({
  useGetOrder: () => ({ data: undefined }),
  useRestaurants: () => ({ data: [] }),
}));

vi.mock("@/lib/vps-client", () => ({
  getInvoice: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ orderId: "ORD-1" }),
  Link: ({ children }: { children: React.ReactNode }) => (
    // biome-ignore lint/a11y/useValidAnchor: mock đơn giản cho test, không cần href thật
    <a>{children}</a>
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <canvas data-qr-value={value} />
  ),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "ORD-1",
    restaurantId: "R1",
    cusName: "Nguyen Van A",
    cusPhone: "0901234567",
    cusAddress: "123 Le Loi",
    cusTaxCode: "",
    receiverEmail: "a@example.com",
    pickupCode: "AB23CD",
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    amount: 100000n,
    goodsAmount: 90000n,
    shippingFee: 10000n,
    taxTotal: 0n,
    ahamoveOrderId: "AH-1",
    items: [],
    paymentStatus: PaymentStatus.unpaid,
    bookingStatus: BookingStatus.confirmed,
    invoiceStatus: InvoiceStatus.none,
    tingeeQrCode: "",
    tingeeQrId: "",
    invoiceId: "",
    sharedLink: "",
    pdfUrl: "",
    paymentVerificationImage: "",
    kmDiscountAmount: 0n,
    voucherDiscountAmount: 0n,
    ...overrides,
  };
}

function makeStatus(order: Order): OrderStatus {
  return {
    paymentStatus: order.paymentStatus,
    tingeeQrCode: "",
    invoiceId: "",
    sharedLink: "",
    bookingStatus: order.bookingStatus,
    pdfUrl: "",
    tingeeQrId: "",
    invoiceStatus: order.invoiceStatus,
  };
}

function renderView(order: Order) {
  return render(
    <OrderStatusView
      status={makeStatus(order)}
      order={order}
      restaurants={[]}
      restaurantAddress="69 đường Láng, Hà Nội"
      lastUpdated="10:00"
      isFetching={false}
      invoiceState={{ kind: "idle" }}
      onDownloadInvoice={vi.fn()}
      onRestaurantChanged={vi.fn()}
    />,
  );
}

describe("OrderStatusView — QR nhận hàng", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the pickup QR, encoding {orderId, pickupCode} as JSON, when there is a pickup code and payment is not yet paid", () => {
    renderView(
      makeOrder({ pickupCode: "AB23CD", paymentStatus: PaymentStatus.unpaid }),
    );

    const wrapper = screen.getByTestId("order_tracker.pickup_qr");
    expect(wrapper).toBeInTheDocument();
    const canvas = wrapper.querySelector("canvas");
    expect(canvas).toHaveAttribute(
      "data-qr-value",
      JSON.stringify({ orderId: "ORD-1", pickupCode: "AB23CD" }),
    );
  });

  it("hides the pickup QR once the order is already paid", () => {
    renderView(
      makeOrder({ pickupCode: "AB23CD", paymentStatus: PaymentStatus.paid }),
    );

    expect(
      screen.queryByTestId("order_tracker.pickup_qr"),
    ).not.toBeInTheDocument();
  });

  it("hides the pickup QR when the order has no pickup code", () => {
    renderView(
      makeOrder({ pickupCode: "", paymentStatus: PaymentStatus.unpaid }),
    );

    expect(
      screen.queryByTestId("order_tracker.pickup_qr"),
    ).not.toBeInTheDocument();
  });
});
