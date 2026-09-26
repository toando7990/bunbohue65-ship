// Coverage cho AddressPicker — chọn địa chỉ bằng Google Maps (gõ → gợi ý
// → chọn → tự ghim; "Vị trí của tôi" → tự điền địa chỉ chữ) và quay về
// bản đồ OpenStreetMap cũ khi không dùng được Google (chưa có key, lỗi
// tải, key bị từ chối). Toàn bộ lib/google-maps được giả lập.

import {
  AddressPicker,
  type AddressPickerValue,
} from "@/components/AddressPicker";
import { fullAddress, tidyGoogleAddress } from "@/lib/address-format";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLoad = vi.fn();
const mockSearch = vi.fn();
const mockResolve = vi.fn();
const mockReverse = vi.fn();
const mockSetPosition = vi.fn();
let authFailureListener: (() => void) | null = null;

vi.mock("@/lib/google-maps", () => ({
  DEFAULT_CENTER: { lat: 21.0285, lng: 105.8542 },
  loadGoogleMaps: () => mockLoad(),
  isGoogleMapsAuthFailed: () => false,
  onGoogleMapsAuthFailure: (l: () => void) => {
    authFailureListener = l;
    return () => {
      authFailureListener = null;
    };
  },
  newSessionToken: () => ({ token: "t" }),
  searchPlaces: (...args: unknown[]) => mockSearch(...args),
  resolvePlace: (...args: unknown[]) => mockResolve(...args),
  reverseGeocode: (...args: unknown[]) => mockReverse(...args),
  createPickerMap: () => ({
    setPosition: mockSetPosition,
    destroy: vi.fn(),
  }),
}));

vi.mock("@/components/MapPicker", () => ({
  MapPicker: ({
    onChange,
  }: { onChange: (lat: number, lng: number) => void }) => (
    <button
      type="button"
      data-ocid="mock-osm-map"
      onClick={() => onChange(21.03, 105.85)}
    >
      OSM
    </button>
  ),
}));

let lastValue: AddressPickerValue | null = null;
function Harness({ initial }: { initial?: AddressPickerValue }) {
  const [value, setValue] = useState<AddressPickerValue>(
    initial ?? { address: "", lat: null, lng: null },
  );
  lastValue = value;
  return <AddressPicker value={value} onChange={setValue} />;
}

const SUGGESTION = {
  id: "p1",
  mainText: "69 Láng Hạ",
  secondaryText: "Thành Công, Ba Đình, Hà Nội",
  fullText: "69 Láng Hạ, Thành Công, Ba Đình, Hà Nội, Việt Nam",
  raw: {},
};

describe("AddressPicker", () => {
  beforeEach(() => {
    lastValue = null;
    authFailureListener = null;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("falls back to the OpenStreetMap picker when Google Maps is unavailable", async () => {
    mockLoad.mockResolvedValue(null);
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId("mock-osm-map")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("address_picker.address_input"), {
      target: { value: "123 Le Loi" },
    });
    fireEvent.click(screen.getByTestId("mock-osm-map"));
    expect(lastValue).toEqual({
      address: "123 Le Loi",
      lat: 21.03,
      lng: 105.85,
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("typing shows Google suggestions; picking one fills the address and pins its coordinates", async () => {
    mockLoad.mockResolvedValue({ fake: "google.maps" });
    mockSearch.mockResolvedValue([SUGGESTION]);
    mockResolve.mockResolvedValue({
      address: "69 Láng Hạ, Thành Công, Ba Đình, Hà Nội",
      lat: 21.0187,
      lng: 105.8157,
    });
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId("address_picker.map")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("address_picker.address_input"), {
      target: { value: "69 Láng" },
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("address_picker.suggestions"),
      ).toBeInTheDocument(),
    );
    expect(mockSearch).toHaveBeenCalledWith(
      { fake: "google.maps" },
      "69 Láng",
      { token: "t" },
      { lat: 21.0285, lng: 105.8542 },
    );
    expect(screen.getByText("powered by")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("address_picker.suggestion"));
    await waitFor(() =>
      expect(lastValue).toEqual({
        address: "69 Láng Hạ, Thành Công, Ba Đình, Hà Nội",
        lat: 21.0187,
        lng: 105.8157,
      }),
    );
    expect(mockResolve).toHaveBeenCalledWith(SUGGESTION);
    expect(mockSetPosition).toHaveBeenLastCalledWith({
      lat: 21.0187,
      lng: 105.8157,
    });
    expect(
      screen.queryByTestId("address_picker.suggestions"),
    ).not.toBeInTheDocument();
  });

  it("does not call Google for fewer than 3 characters", async () => {
    mockLoad.mockResolvedValue({ fake: "google.maps" });
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("address_picker.map")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("address_picker.address_input"), {
      target: { value: "69" },
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("'Vị trí của tôi' pins the GPS position and fills the address text", async () => {
    mockLoad.mockResolvedValue({ fake: "google.maps" });
    mockReverse.mockResolvedValue(
      "12 Ngõ 88 Thái Hà, Trung Liệt, Đống Đa, Hà Nội",
    );
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: 21.012, longitude: 105.82 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("address_picker.map")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("address_picker.locate_button"));
    await waitFor(() =>
      expect(lastValue).toEqual({
        address: "12 Ngõ 88 Thái Hà, Trung Liệt, Đống Đa, Hà Nội",
        lat: 21.012,
        lng: 105.82,
      }),
    );
    expect(mockReverse).toHaveBeenCalledWith(
      { fake: "google.maps" },
      { lat: 21.012, lng: 105.82 },
    );
  });

  it("switches to the fallback map when Google rejects the key", async () => {
    mockLoad.mockResolvedValue({ fake: "google.maps" });
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("address_picker.map")).toBeInTheDocument(),
    );
    act(() => authFailureListener?.());
    await waitFor(() =>
      expect(screen.getByTestId("mock-osm-map")).toBeInTheDocument(),
    );
  });
});

describe("address-format", () => {
  it("fullAddress appends the driver note only when present", () => {
    expect(fullAddress({ address: "69 Láng Hạ", detail: "Tầng 3" })).toBe(
      "69 Láng Hạ — Tầng 3",
    );
    expect(fullAddress({ address: "69 Láng Hạ", detail: "  " })).toBe(
      "69 Láng Hạ",
    );
    expect(fullAddress({ address: "69 Láng Hạ" })).toBe("69 Láng Hạ");
  });

  it("tidyGoogleAddress drops the country suffix and postal code", () => {
    expect(
      tidyGoogleAddress(
        "69 P. Láng Hạ, Thành Công, Ba Đình, Hà Nội 100000, Việt Nam",
      ),
    ).toBe("69 P. Láng Hạ, Thành Công, Ba Đình, Hà Nội");
    expect(tidyGoogleAddress("69 Láng Hạ, Hà Nội, Vietnam")).toBe(
      "69 Láng Hạ, Hà Nội",
    );
  });
});
