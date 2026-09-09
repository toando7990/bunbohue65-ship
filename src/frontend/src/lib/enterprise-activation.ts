// Enterprise device activation storage — SINGLE consistent localStorage key
// shared by the enterprise gate (App.tsx) and enterprise module pages
// (EnterpriseManagementPage — gộp Kế toán + Báo cáo bán hàng & KM; vai trò
// "Hàng đợi thanh toán"/PaymentQueuePage đã BỎ HẲN — /driver là nơi duy nhất
// xử lý thanh toán, đúng cơ chế QR Tingee + webhook + xác nhận ảnh sẵn có).
// A device binds to one enterprise role at activation time (via an admin-
// generated activation code) and remembers its restaurantId + deviceId
// across reloads, mirroring the bbh_driver_activation / bbh_counter_activation
// pattern for driver/cashier.

export const ENTERPRISE_STORAGE_KEY = "bbh_enterprise_activation";

export interface EnterpriseActivation {
  restaurantId: string;
  deviceId: string;
  name: string;
}

// Read the stored enterprise activation, or null when this browser has no
// enterprise device bound yet.
export function loadEnterpriseActivation(): EnterpriseActivation | null {
  try {
    const raw = localStorage.getItem(ENTERPRISE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.restaurantId && parsed?.deviceId) {
      return {
        restaurantId: parsed.restaurantId,
        deviceId: parsed.deviceId,
        name: typeof parsed.name === "string" ? parsed.name : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Persist the enterprise activation after a successful device activation.
export function saveEnterpriseActivation(
  activation: EnterpriseActivation,
): void {
  try {
    localStorage.setItem(ENTERPRISE_STORAGE_KEY, JSON.stringify(activation));
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
}

// Clear the stored enterprise activation (e.g. when the device is revoked).
export function clearEnterpriseActivation(): void {
  try {
    localStorage.removeItem(ENTERPRISE_STORAGE_KEY);
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
}
