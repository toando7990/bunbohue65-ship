// Coverage cho DeliveryAddressSelector — 3 trạng thái: chưa xác thực
// email, đã xác thực nhưng chưa có địa chỉ, có địa chỉ (tự chọn cái
// đầu tiên nếu khách chưa chọn gì).

import { DeliveryAddressSelector } from "@/components/DeliveryAddressSelector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  listCustomerAddresses: (...args: unknown[]) => mockList(...args),
}));

vi.mock("@/components/EmailVerificationDialog", () => ({
  EmailVerificationDialog: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a data-href={to} {...rest}>
      {children}
    </a>
  ),
}));

const SAMPLE_ADDRESSES = [
  {
    id: 1,
    email: "a@test.com",
    label: "Nhà",
    address: "123 Le Loi",
    lat: 21.03,
    lng: 105.85,
  },
  {
    id: 2,
    email: "a@test.com",
    label: "Công ty",
    address: "456 Tran Phu",
    lat: 10.77,
    lng: 106.7,
  },
];

function renderSelector(
  props: Partial<Parameters<typeof DeliveryAddressSelector>[0]> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DeliveryAddressSelector
        verifiedEmail={null}
        onVerified={vi.fn()}
        selectedAddressId={null}
        onSelectAddress={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("DeliveryAddressSelector", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the verify-email prompt when no email is verified yet", () => {
    renderSelector({ verifiedEmail: null });
    expect(
      screen.getByTestId("delivery_address_selector.unverified_state"),
    ).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("shows the empty state (with a link to add one) when verified but no addresses saved", async () => {
    mockList.mockResolvedValue([]);
    renderSelector({ verifiedEmail: "a@test.com" });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.empty_state"),
      ).toBeInTheDocument();
    });
  });

  it("auto-selects the first address when the customer hasn't chosen any yet", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    const onSelectAddress = vi.fn();
    renderSelector({
      verifiedEmail: "a@test.com",
      selectedAddressId: null,
      onSelectAddress,
    });

    await waitFor(() => {
      expect(onSelectAddress).toHaveBeenCalledWith(SAMPLE_ADDRESSES[0]);
    });
  });

  it("shows the currently-selected address and an edit link", async () => {
    mockList.mockResolvedValue(SAMPLE_ADDRESSES);
    renderSelector({ verifiedEmail: "a@test.com", selectedAddressId: 2 });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.selected_address_text"),
      ).toHaveTextContent("456 Tran Phu");
    });
    expect(
      screen.getByTestId("delivery_address_selector.edit_link"),
    ).toBeInTheDocument();
  });

  it("does not show the dropdown when there is only 1 saved address", async () => {
    mockList.mockResolvedValue([SAMPLE_ADDRESSES[0]]);
    renderSelector({ verifiedEmail: "a@test.com", selectedAddressId: 1 });

    await waitFor(() => {
      expect(
        screen.getByTestId("delivery_address_selector.selected_address_text"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("delivery_address_selector.select"),
    ).not.toBeInTheDocument();
  });
});
