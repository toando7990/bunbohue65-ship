// google-maps — nạp Google Maps JavaScript API (bản đồ + Places API (New)
// + Geocoding) cho AddressPicker.tsx: khách gõ địa chỉ → Google gợi ý →
// chọn 1 dòng → tự ghim đúng toạ độ (toạ độ này gửi thẳng cho Lalamove).
//
// Key lấy từ VPS (GET /maps-config, .env GOOGLE_MAPS_BROWSER_KEY). Chưa
// cấu hình key, VPS không trả lời, script Google không tải được hoặc key
// bị Google từ chối → loadGoogleMaps() trả null / báo authFailure, và
// AddressPicker tự quay về bản đồ OpenStreetMap cũ (ghim tay) — không
// bao giờ chặn khách lưu địa chỉ.
//
// Chi phí (xem báo giá Google Maps Platform): gợi ý khi gõ dùng session
// token nên KHÔNG tính tiền khi khách chọn 1 gợi ý; mỗi lần chọn = 1 lượt
// Place Details Essentials (chỉ lấy field "location"); mỗi lần mở form =
// 1 lượt Dynamic Maps; bấm "Vị trí của tôi"/kéo ghim = 1 lượt Geocoding.

import { tidyGoogleAddress } from "@/lib/address-format";
import { getMapsConfig } from "@/lib/vps-client";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceSuggestion {
  id: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  // google.maps.places.PlacePrediction — giữ nguyên để gọi toPlace().
  raw: any;
}

// Trung tâm Hà Nội — điểm bắt đầu bản đồ + ưu tiên gợi ý quanh đây.
export const DEFAULT_CENTER: LatLng = { lat: 21.0285, lng: 105.8542 };

const CALLBACK_NAME = "__bbhGoogleMapsReady";
const LOAD_TIMEOUT_MS = 15000;

let loadPromise: Promise<any | null> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

function notifyAuthFailure() {
  authFailed = true;
  for (const l of authFailureListeners) l();
}

// Google gọi window.gm_authFailure khi key sai/hết hạn/không được phép
// cho tên miền này — lúc đó bản đồ hiện màn "Oops", nên AddressPicker
// lắng nghe để chuyển sang bản đồ dự phòng.
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

export function isGoogleMapsAuthFailed(): boolean {
  return authFailed;
}

// Trả google.maps (đã sẵn Places) hoặc null nếu không dùng được. Chỉ nạp
// 1 lần cho cả trang, các lần gọi sau dùng lại kết quả.
export function loadGoogleMaps(): Promise<any | null> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }
    const w = window as any;
    if (w.google?.maps?.places?.AutocompleteSuggestion) return w.google.maps;

    const { browserKey } = await getMapsConfig();
    if (!browserKey) return null;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Google Maps load timeout")),
        LOAD_TIMEOUT_MS,
      );
      w[CALLBACK_NAME] = () => {
        clearTimeout(timer);
        resolve();
      };
      w.gm_authFailure = notifyAuthFailure;
      const script = document.createElement("script");
      const params = new URLSearchParams({
        key: browserKey,
        v: "weekly",
        libraries: "places",
        language: "vi",
        region: "VN",
        loading: "async",
        callback: CALLBACK_NAME,
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Google Maps script failed to load"));
      };
      document.head.appendChild(script);
    });

    const maps = w.google?.maps;
    if (!maps) return null;
    if (!maps.places?.AutocompleteSuggestion && maps.importLibrary) {
      await maps.importLibrary("places");
    }
    if (!maps.places?.AutocompleteSuggestion || authFailed) return null;
    return maps;
  })().catch((err) => {
    console.warn("[google-maps] không dùng được Google Maps:", err);
    return null;
  });
  return loadPromise;
}

export function newSessionToken(g: any): any {
  return new g.places.AutocompleteSessionToken();
}

// Gợi ý địa chỉ khi khách gõ — chỉ trong Việt Nam, ưu tiên quanh `bias`.
export async function searchPlaces(
  g: any,
  input: string,
  sessionToken: any,
  bias: LatLng,
): Promise<PlaceSuggestion[]> {
  const text = input.trim();
  if (text.length < 3) return [];
  const { suggestions } =
    await g.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: text,
      sessionToken,
      includedRegionCodes: ["vn"],
      language: "vi",
      region: "vn",
      locationBias: { center: bias, radius: 50000 },
    });
  return (suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 5)
    .map((p: any, i: number) => {
      const mainText = p.mainText?.text ?? p.text?.text ?? "";
      const secondaryText = p.secondaryText?.text ?? "";
      const fullText =
        p.text?.text ?? [mainText, secondaryText].filter(Boolean).join(", ");
      return {
        id: p.placeId ?? String(i),
        mainText,
        secondaryText,
        fullText,
        raw: p,
      };
    });
}

// Khách chọn 1 gợi ý → lấy toạ độ (kết thúc session gợi ý). Địa chỉ chữ
// dùng đúng dòng khách vừa chọn (dễ nhận ra hơn formattedAddress).
export async function resolvePlace(
  s: PlaceSuggestion,
): Promise<{ address: string; lat: number; lng: number } | null> {
  const place = s.raw.toPlace();
  await place.fetchFields({ fields: ["location"] });
  const loc = place.location;
  if (!loc) return null;
  return {
    address: tidyGoogleAddress(s.fullText),
    lat: loc.lat(),
    lng: loc.lng(),
  };
}

// Toạ độ → địa chỉ chữ (bấm "Vị trí của tôi", kéo ghim, bấm lên bản đồ).
export async function reverseGeocode(
  g: any,
  pos: LatLng,
): Promise<string | null> {
  const geocoder = new g.Geocoder();
  const { results } = await geocoder.geocode({
    location: pos,
    language: "vi",
  });
  const formatted: string | undefined = results?.[0]?.formatted_address;
  return formatted ? tidyGoogleAddress(formatted) : null;
}

export interface PickerMapController {
  setPosition: (pos: LatLng | null) => void;
  destroy: () => void;
}

// Bản đồ Google + 1 ghim kéo được. onMove gọi khi khách bấm lên bản đồ
// hoặc kéo ghim xong (KHÔNG gọi khi setPosition từ code).
export function createPickerMap(
  g: any,
  el: HTMLElement,
  initial: LatLng | null,
  onMove: (pos: LatLng) => void,
): PickerMapController {
  const center = initial ?? DEFAULT_CENTER;
  const map = new g.Map(el, {
    center,
    zoom: initial ? 17 : 12,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    gestureHandling: "greedy",
  });
  const marker = new g.Marker({
    map: initial ? map : null,
    position: center,
    draggable: true,
  });
  const clickListener = map.addListener("click", (e: any) => {
    if (!e?.latLng) return;
    const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    marker.setPosition(pos);
    marker.setMap(map);
    onMove(pos);
  });
  const dragListener = marker.addListener("dragend", () => {
    const p = marker.getPosition();
    if (p) onMove({ lat: p.lat(), lng: p.lng() });
  });
  return {
    setPosition(pos) {
      if (!pos) {
        marker.setMap(null);
        return;
      }
      marker.setPosition(pos);
      marker.setMap(map);
      map.panTo(pos);
      if ((map.getZoom?.() ?? 0) < 16) map.setZoom(17);
    },
    destroy() {
      clickListener?.remove?.();
      dragListener?.remove?.();
      marker.setMap(null);
    },
  };
}
