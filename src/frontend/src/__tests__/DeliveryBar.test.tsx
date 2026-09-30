// DeliveryBar — khối chọn địa chỉ/nhà hàng phải ẨN khi chưa bấm "Đổi" (lỗi
// thật: thuộc tính hidden bị class "flex" đè nên khối vẫn hiện ra).
import { DeliveryBar } from "@/components/DeliveryBar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const address = {
  id: 1,
  email: "a@x.com",
  label: "Home",
  address: "68 Hoa Phượng",
  lat: 21,
  lng: 105,
};

function renderBar(withAddress: boolean) {
  return render(
    <DeliveryBar
      address={withAddress ? address : null}
      restaurantName="Bún Bò Huế 65 Đường Láng"
      isQuoteLoading={false}
      shippingFee={null}
      estimatedDeliveryMinutes={null}
    >
      <p>Khối chọn địa chỉ</p>
    </DeliveryBar>,
  );
}

describe("DeliveryBar", () => {
  afterEach(() => cleanup());

  it("keeps the address/restaurant block hidden until 'Đổi' is tapped", () => {
    renderBar(true);
    const block = screen.getByTestId("create_order.restaurant_card");
    expect(block.className).toContain("hidden");
    expect(block.className).not.toMatch(/(^|\s)flex(\s|$)/);
    fireEvent.click(screen.getByTestId("create_order.delivery_bar.toggle"));
    expect(block.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(block.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("opens the block right away when no address has been chosen yet", () => {
    renderBar(false);
    expect(
      screen.getByTestId("create_order.restaurant_card").className,
    ).toMatch(/(^|\s)flex(\s|$)/);
  });
});
