// Coverage cho NearestRestaurantDisplay — hiện đúng theo trạng thái
// loading/no-result/có kết quả.

import { NearestRestaurantDisplay } from "@/components/NearestRestaurantDisplay";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

describe("NearestRestaurantDisplay", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading skeleton while loading", () => {
    render(
      <NearestRestaurantDisplay
        restaurantName={null}
        restaurantAddress={null}
        isLoading
        hasNoResult={false}
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.loading_state"),
    ).toBeInTheDocument();
  });

  it("shows the no-result state when there is no nearest restaurant", () => {
    render(
      <NearestRestaurantDisplay
        restaurantName={null}
        restaurantAddress={null}
        isLoading={false}
        hasNoResult
      />,
    );
    expect(
      screen.getByTestId("nearest_restaurant.no_result_state"),
    ).toBeInTheDocument();
  });

  it("shows the nearest restaurant's name, address, and delivery time placeholder", () => {
    render(
      <NearestRestaurantDisplay
        restaurantName="Bún Bò Huế 65 - Láng"
        restaurantAddress="69 đường Láng, Hà Nội"
        isLoading={false}
        hasNoResult={false}
      />,
    );
    expect(screen.getByTestId("nearest_restaurant.name")).toHaveTextContent(
      "Bún Bò Huế 65 - Láng",
    );
    expect(screen.getByText("69 đường Láng, Hà Nội")).toBeInTheDocument();
    expect(
      screen.getByTestId("nearest_restaurant.delivery_time_placeholder"),
    ).toBeInTheDocument();
  });
});
