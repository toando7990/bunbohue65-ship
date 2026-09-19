// Coverage cho RestaurantForm — tập trung vào phần toạ độ (lat/lng) mới
// thêm: validate bắt buộc, không cho lưu 0/0 (giá trị mặc định cũ chưa
// nhập), nút "Lấy vị trí hiện tại" (geolocation trình duyệt).

import type { Restaurant } from "@/backend";
import { RestaurantForm } from "@/components/RestaurantForm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function fillRequiredTextFields() {
  fireEvent.change(screen.getByTestId("restaurant.form.name_input"), {
    target: { value: "Nhà hàng A" },
  });
  fireEvent.change(screen.getByTestId("restaurant.form.address_input"), {
    target: { value: "123 Le Loi" },
  });
  fireEvent.change(screen.getByTestId("restaurant.form.phone_input"), {
    target: { value: "0901234567" },
  });
}

describe("RestaurantForm — toạ độ (lat/lng)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("rejects submission when lat/lng are both still 0 (never entered)", () => {
    const onSubmit = vi.fn();
    render(<RestaurantForm onSubmit={onSubmit} />);

    fillRequiredTextFields();
    fireEvent.click(screen.getByTestId("restaurant.form.save_button"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("restaurant.form.coordinates_error"),
    ).toBeInTheDocument();
  });

  it("rejects an out-of-range latitude/longitude", () => {
    const onSubmit = vi.fn();
    render(<RestaurantForm onSubmit={onSubmit} />);

    fillRequiredTextFields();
    fireEvent.change(screen.getByTestId("restaurant.form.lat_input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("restaurant.form.lng_input"), {
      target: { value: "105.85" },
    });
    fireEvent.click(screen.getByTestId("restaurant.form.save_button"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits successfully with valid coordinates", () => {
    const onSubmit = vi.fn();
    render(<RestaurantForm onSubmit={onSubmit} />);

    fillRequiredTextFields();
    fireEvent.change(screen.getByTestId("restaurant.form.lat_input"), {
      target: { value: "21.0285" },
    });
    fireEvent.change(screen.getByTestId("restaurant.form.lng_input"), {
      target: { value: "105.8542" },
    });
    fireEvent.click(screen.getByTestId("restaurant.form.save_button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 21.0285, lng: 105.8542 }),
    );
  });

  it("pre-fills lat/lng from the existing restaurant when editing", () => {
    const initial: Restaurant = {
      restaurantId: "R1",
      name: "Nhà hàng A",
      address: "123 Le Loi",
      phone: "0901234567",
      visible: true,
      lat: 10.7769,
      lng: 106.7009,
    };
    render(<RestaurantForm initial={initial} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("restaurant.form.lat_input")).toHaveValue(
      10.7769,
    );
    expect(screen.getByTestId("restaurant.form.lng_input")).toHaveValue(
      106.7009,
    );
  });

  it("fills lat/lng from navigator.geolocation when 'Lấy vị trí hiện tại' is clicked", () => {
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 16.0544, longitude: 108.2022 } });
    });
    Object.defineProperty(global.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });

    render(<RestaurantForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("restaurant.form.locate_button"));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(screen.getByTestId("restaurant.form.lat_input")).toHaveValue(
      16.0544,
    );
    expect(screen.getByTestId("restaurant.form.lng_input")).toHaveValue(
      108.2022,
    );
  });

  it("shows an error when the browser has no geolocation support", () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });

    render(<RestaurantForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId("restaurant.form.locate_button"));

    expect(
      screen.getByTestId("restaurant.form.coordinates_error"),
    ).toBeInTheDocument();
  });
});
