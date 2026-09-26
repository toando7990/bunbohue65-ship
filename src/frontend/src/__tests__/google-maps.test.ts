// Coverage cho lib/google-maps — các hàm bọc Google Maps JS API, chạy với
// 1 đối tượng google.maps giả lập (không tải script thật).

import {
  createPickerMap,
  loadGoogleMaps,
  resolvePlace,
  reverseGeocode,
  searchPlaces,
} from "@/lib/google-maps";
import { describe, expect, it, vi } from "vitest";

const mockGetMapsConfig = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getMapsConfig: () => mockGetMapsConfig(),
}));

const latLng = (lat: number, lng: number) => ({
  lat: () => lat,
  lng: () => lng,
});

describe("google-maps helpers", () => {
  it("loadGoogleMaps returns null (fallback) when the VPS has no key configured", async () => {
    mockGetMapsConfig.mockResolvedValue({ browserKey: "" });
    expect(await loadGoogleMaps()).toBeNull();
    expect(
      document.querySelector('script[src*="maps.googleapis.com"]'),
    ).toBeNull();
  });

  it("searchPlaces restricts to Vietnam, biases near the pin, and maps predictions", async () => {
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: "p1",
            mainText: { text: "69 Láng Hạ" },
            secondaryText: { text: "Ba Đình, Hà Nội" },
            text: { text: "69 Láng Hạ, Ba Đình, Hà Nội, Việt Nam" },
          },
        },
        { queryPrediction: { text: { text: "bỏ qua" } } },
      ],
    });
    const g = {
      places: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } },
    };
    const res = await searchPlaces(g, "69 Láng", "tok", { lat: 21, lng: 105 });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "69 Láng",
        sessionToken: "tok",
        includedRegionCodes: ["vn"],
        locationBias: { center: { lat: 21, lng: 105 }, radius: 50000 },
      }),
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: "p1",
      mainText: "69 Láng Hạ",
      secondaryText: "Ba Đình, Hà Nội",
      fullText: "69 Láng Hạ, Ba Đình, Hà Nội, Việt Nam",
    });
    expect(await searchPlaces(g, "69", "tok", { lat: 21, lng: 105 })).toEqual(
      [],
    );
  });

  it("resolvePlace fetches only the location field and uses the picked text as address", async () => {
    const fetchFields = vi.fn().mockResolvedValue(undefined);
    const place = { fetchFields, location: latLng(21.0187, 105.8157) };
    const r = await resolvePlace({
      id: "p1",
      mainText: "69 Láng Hạ",
      secondaryText: "",
      fullText: "69 Láng Hạ, Ba Đình, Hà Nội, Việt Nam",
      raw: { toPlace: () => place },
    });
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["location"] });
    expect(r).toEqual({
      address: "69 Láng Hạ, Ba Đình, Hà Nội",
      lat: 21.0187,
      lng: 105.8157,
    });
  });

  it("reverseGeocode returns the tidied first result", async () => {
    const geocode = vi.fn().mockResolvedValue({
      results: [
        {
          formatted_address:
            "12 Ngõ 88 Thái Hà, Đống Đa, Hà Nội 100000, Việt Nam",
        },
      ],
    });
    const g = {
      Geocoder: class {
        geocode = geocode;
      },
    };
    expect(await reverseGeocode(g, { lat: 21, lng: 105 })).toBe(
      "12 Ngõ 88 Thái Hà, Đống Đa, Hà Nội",
    );
  });

  it("createPickerMap reports clicks and marker drags, and moves the pin on setPosition", () => {
    const listeners: Record<string, (e?: unknown) => void> = {};
    const map = {
      addListener: (ev: string, fn: (e?: unknown) => void) => {
        listeners[`map:${ev}`] = fn;
        return { remove: vi.fn() };
      },
      panTo: vi.fn(),
      getZoom: () => 12,
      setZoom: vi.fn(),
    };
    let markerPos = latLng(0, 0);
    const marker = {
      setPosition: vi.fn(),
      setMap: vi.fn(),
      getPosition: () => markerPos,
      addListener: (ev: string, fn: () => void) => {
        listeners[`marker:${ev}`] = fn;
        return { remove: vi.fn() };
      },
    };
    const g = {
      Map: vi.fn(() => map),
      Marker: vi.fn(() => marker),
    };
    const onMove = vi.fn();
    const ctl = createPickerMap(g, document.createElement("div"), null, onMove);

    listeners["map:click"]({ latLng: latLng(21.01, 105.81) });
    expect(onMove).toHaveBeenLastCalledWith({ lat: 21.01, lng: 105.81 });

    markerPos = latLng(21.02, 105.82);
    listeners["marker:dragend"]();
    expect(onMove).toHaveBeenLastCalledWith({ lat: 21.02, lng: 105.82 });

    ctl.setPosition({ lat: 21.03, lng: 105.83 });
    expect(map.panTo).toHaveBeenCalledWith({ lat: 21.03, lng: 105.83 });
    expect(map.setZoom).toHaveBeenCalledWith(17);
    expect(onMove).toHaveBeenCalledTimes(2); // setPosition từ code không báo onMove
  });
});
