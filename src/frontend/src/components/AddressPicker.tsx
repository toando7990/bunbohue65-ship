// AddressPicker — ô địa chỉ + bản đồ ghim vị trí giao hàng, dùng chung
// cho mọi form thêm/sửa địa chỉ nhận hàng của khách (AddressFormFields).
//
// Có Google Maps (VPS đã cấu hình GOOGLE_MAPS_BROWSER_KEY): khách gõ →
// Google gợi ý (chỉ trong VN) → chọn 1 dòng → bản đồ tự bay tới và ghim
// đúng toạ độ. Kéo ghim / bấm lên bản đồ / "Vị trí của tôi" → tự điền lại
// địa chỉ chữ theo vị trí mới. Toạ độ ghim được gửi thẳng cho Lalamove.
//
// Không có Google (chưa có key, lỗi tải, key bị từ chối): quay về cách
// cũ — ô địa chỉ gõ tay + bản đồ OpenStreetMap (MapPicker.tsx) ghim tay.

import { MapPicker } from "@/components/MapPicker";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_CENTER,
  type LatLng,
  type PickerMapController,
  type PlaceSuggestion,
  createPickerMap,
  isGoogleMapsAuthFailed,
  loadGoogleMaps,
  newSessionToken,
  onGoogleMapsAuthFailure,
  resolvePlace,
  reverseGeocode,
  searchPlaces,
} from "@/lib/google-maps";
import { Loader2, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface AddressPickerValue {
  address: string;
  lat: number | null;
  lng: number | null;
}

interface AddressPickerProps {
  value: AddressPickerValue;
  onChange: (next: AddressPickerValue) => void;
  inputId?: string;
}

type Mode = "loading" | "google" | "fallback";

export function AddressPicker({
  value,
  onChange,
  inputId,
}: AddressPickerProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [gmaps, setGmaps] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled) return;
      if (g && !isGoogleMapsAuthFailed()) {
        setGmaps(g);
        setMode("google");
      } else {
        setMode("fallback");
      }
    });
    const off = onGoogleMapsAuthFailure(() => {
      if (!cancelled) setMode("fallback");
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (mode === "google" && gmaps) {
    return (
      <GoogleAddressPicker
        g={gmaps}
        value={value}
        onChange={onChange}
        inputId={inputId}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2" data-ocid="address_picker.fallback">
      <Input
        id={inputId}
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        placeholder="Số nhà, đường, phường/xã, quận/huyện…"
        data-ocid="address_picker.address_input"
      />
      {mode === "loading" ? (
        <div
          className="flex h-64 items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-xs text-muted-foreground"
          data-ocid="address_picker.loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải bản đồ…
        </div>
      ) : (
        <MapPicker
          lat={value.lat}
          lng={value.lng}
          onChange={(lat, lng) => onChange({ ...value, lat, lng })}
        />
      )}
    </div>
  );
}

function GoogleAddressPicker({
  g,
  value,
  onChange,
  inputId,
}: {
  g: any;
  value: AddressPickerValue;
  onChange: (next: AddressPickerValue) => void;
  inputId?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const controller = useRef<PickerMapController | null>(null);
  const sessionToken = useRef<any>(null);
  // Giá trị mới nhất cho các callback của bản đồ (tạo 1 lần lúc mount).
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // Chỉ tìm gợi ý khi khách GÕ — không tìm khi địa chỉ được điền bởi code
  // (chọn gợi ý, kéo ghim, "Vị trí của tôi").
  const [query, setQuery] = useState<string | null>(null);

  const hasPin = value.lat !== null && value.lng !== null;

  async function fillAddressFrom(pos: LatLng, note: string) {
    const { value: v, onChange: change } = latest.current;
    change({ ...v, lat: pos.lat, lng: pos.lng });
    try {
      const addr = await reverseGeocode(g, pos);
      if (addr) {
        const cur = latest.current;
        cur.onChange({
          ...cur.value,
          address: addr,
          lat: pos.lat,
          lng: pos.lng,
        });
      }
      setHint(note);
    } catch (err) {
      console.warn("[AddressPicker] reverse geocode lỗi:", err);
      setHint("Đã ghim vị trí — vui lòng kiểm tra lại địa chỉ chữ.");
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: tạo bản đồ đúng 1 lần khi mount; vị trí về sau đồng bộ qua effect bên dưới
  useEffect(() => {
    if (!mapEl.current) return;
    const initial =
      value.lat !== null && value.lng !== null
        ? { lat: value.lat, lng: value.lng }
        : null;
    controller.current = createPickerMap(g, mapEl.current, initial, (pos) => {
      setOpen(false);
      fillAddressFrom(
        pos,
        "Đã cập nhật địa chỉ theo vị trí ghim — kiểm tra lại số nhà nếu cần.",
      );
    });
    return () => {
      controller.current?.destroy();
      controller.current = null;
    };
  }, [g]);

  // Toạ độ đổi (chọn gợi ý, GPS, mở form sửa) → dời ghim + bản đồ theo.
  useEffect(() => {
    controller.current?.setPosition(
      value.lat !== null && value.lng !== null
        ? { lat: value.lat, lng: value.lng }
        : null,
    );
  }, [value.lat, value.lng]);

  // Gợi ý khi gõ — chờ khách ngừng gõ 300ms mới gọi Google.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ tìm lại khi chữ khách gõ đổi
  useEffect(() => {
    if (query === null) return;
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        if (!sessionToken.current) sessionToken.current = newSessionToken(g);
        const bias = hasPin
          ? { lat: value.lat as number, lng: value.lng as number }
          : DEFAULT_CENTER;
        const res = await searchPlaces(g, query, sessionToken.current, bias);
        if (!cancelled) {
          setSuggestions(res);
          setOpen(true);
        }
      } catch (err) {
        console.warn("[AddressPicker] gợi ý địa chỉ lỗi:", err);
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, g]);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    setSuggestions([]);
    setQuery(null);
    setResolving(true);
    try {
      const r = await resolvePlace(s);
      sessionToken.current = null; // session kết thúc sau khi lấy toạ độ
      if (r) {
        onChange({ address: r.address, lat: r.lat, lng: r.lng });
        setHint("Đã ghim đúng địa chỉ — kéo ghim nếu cần chỉnh tới cổng/ngõ.");
      } else {
        setHint(
          "Không lấy được vị trí của địa chỉ này — hãy bấm lên bản đồ để ghim.",
        );
      }
    } catch (err) {
      console.warn("[AddressPicker] lấy toạ độ lỗi:", err);
      setHint(
        "Không lấy được vị trí của địa chỉ này — hãy bấm lên bản đồ để ghim.",
      );
    } finally {
      setResolving(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setHint("Trình duyệt không hỗ trợ lấy vị trí.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        setOpen(false);
        await fillAddressFrom(
          { lat: p.coords.latitude, lng: p.coords.longitude },
          "Đã lấy vị trí GPS và tự điền địa chỉ — kiểm tra lại số nhà, kéo ghim nếu cần.",
        );
        setLocating(false);
      },
      () => {
        setLocating(false);
        setHint(
          "Không lấy được vị trí — hãy cho phép quyền vị trí, hoặc gõ địa chỉ ở trên.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-col gap-2" data-ocid="address_picker.google">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          value={value.address}
          onChange={(e) => {
            onChange({ ...value, address: e.target.value });
            setQuery(e.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && open && suggestions[0]) {
              e.preventDefault();
              pick(suggestions[0]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Nhập địa chỉ, tên toà nhà, ngõ…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="pl-9 pr-9"
          data-ocid="address_picker.address_input"
        />
        {(searching || resolving) && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
        {!searching && !resolving && value.address && (
          <button
            type="button"
            aria-label="Xoá địa chỉ"
            onClick={() => {
              onChange({ ...value, address: "" });
              setQuery("");
              setSuggestions([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary"
            data-ocid="address_picker.clear_button"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {open && suggestions.length > 0 && (
          <ul
            className="absolute inset-x-0 top-full z-[1000] mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg"
            data-ocid="address_picker.suggestions"
          >
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className="flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left hover:bg-secondary"
                  data-ocid="address_picker.suggestion"
                >
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {s.mainText}
                    </span>
                    {s.secondaryText && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.secondaryText}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            <li className="bg-muted/40 px-3 py-1 text-right text-[11px] text-muted-foreground">
              powered by <span className="font-semibold">Google</span>
            </li>
          </ul>
        )}
      </div>

      <div className="relative">
        <div
          ref={mapEl}
          className="h-64 w-full overflow-hidden rounded-md border border-border"
          data-ocid="address_picker.map"
        />
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-md hover:bg-secondary disabled:opacity-60"
          data-ocid="address_picker.locate_button"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Vị trí của tôi
        </button>
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-ocid="address_picker.hint"
      >
        {hint ??
          (hasPin
            ? "Kéo ghim hoặc bấm lên bản đồ nếu cần chỉnh vị trí."
            : "Gõ địa chỉ rồi chọn 1 gợi ý — ghim sẽ tự đặt đúng chỗ.")}
      </p>
    </div>
  );
}
