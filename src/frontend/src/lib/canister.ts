// Canister actor wrapper — thin typed facade over the generated Backend actor.
// createOrder is intentionally NOT exposed here — frontend must go through VPS
// /order/create so the canister can verify HMAC (per architecture contract).

import { type Backend, createActor } from "@/backend";
import {
  BookingStatus,
  type Device,
  DeviceRole,
  InvoiceStatus,
  type MenuItem,
  type Order,
  type OrderStatus,
  PaymentStatus,
  type PendingActivation,
  type Promotion,
  type Restaurant,
  type StoreHours,
} from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";

// Hook returning the live canister actor (or null while fetching).
export function useCanister() {
  const { actor, isFetching } = useActor(createActor);
  return { actor: actor as Backend | null, isFetching };
}

// Unwrap a backend Result variant into either the ok value or an Error.
function unwrap<T>(
  result: { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string },
): T {
  if (result.__kind__ === "ok") return result.ok;
  throw new Error(result.err);
}

// ---- Orders (read-only from canister; createOrder goes via VPS) ----
export async function listOrders(actor: Backend): Promise<Order[]> {
  return actor.listOrders();
}

// Lịch sử đặt đơn — tra cứu theo email đã xác thực (khớp không phân biệt hoa
// thường), hoạt động trên mọi thiết bị (không phụ thuộc localStorage như
// OrderList). Lọc phía canister, chỉ trả về các đơn khớp email.
export async function getOrdersByEmail(
  actor: Backend,
  email: string,
): Promise<Order[]> {
  return actor.getOrdersByEmail(email);
}

export async function getOrder(
  actor: Backend,
  orderId: string,
): Promise<Order> {
  return unwrap(await actor.getOrder(orderId));
}

export async function getOrderStatus(
  actor: Backend,
  orderId: string,
): Promise<OrderStatus> {
  return unwrap(await actor.getOrderStatus(orderId));
}

export async function listPendingPaymentOrders(
  actor: Backend,
  restaurantId: string,
): Promise<Order[]> {
  return actor.listPendingPaymentOrders(restaurantId);
}

// ---- Driver pickup queue (today's paid+confirmed orders, no PII for non-admin) ----
export async function listPaidOrdersForPickup(
  actor: Backend,
): Promise<Order[]> {
  return actor.listPaidOrdersForPickup();
}

// Mark an order as picked up by the driver (sets bookingStatus to #pickedUp).
export async function markPickedUp(
  actor: Backend,
  orderId: string,
): Promise<Order> {
  return unwrap(await actor.markPickedUp(orderId));
}

// ---- Devices ----
export async function generateActivationCode(
  actor: Backend,
  restaurantId: string,
  role: DeviceRole,
): Promise<PendingActivation> {
  return unwrap(await actor.generateActivationCode(restaurantId, role));
}

export async function activateDevice(
  actor: Backend,
  code: string,
  deviceId: string,
  name: string,
  phone: string,
): Promise<Device> {
  return unwrap(await actor.activateDevice(code, deviceId, name, phone));
}

export async function revokeDevice(
  actor: Backend,
  deviceId: string,
): Promise<Device> {
  return unwrap(await actor.revokeDevice(deviceId));
}

export async function cleanupExpiredActivations(
  actor: Backend,
): Promise<bigint> {
  return actor.cleanupExpiredActivations();
}

export async function listDevicesByRestaurant(
  actor: Backend,
  restaurantId: string,
): Promise<Device[]> {
  return actor.listDevicesByRestaurant(restaurantId);
}

export async function listDevicesByRole(
  actor: Backend,
  role: DeviceRole,
): Promise<Device[]> {
  return actor.listDevicesByRole(role);
}

// ---- VPS secret (admin only) ----
export async function setVpsSecret(
  actor: Backend,
  newSecret: string,
): Promise<void> {
  const r = await actor.setVpsSecret(newSecret);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function getCanisterIdText(actor: Backend): Promise<string> {
  return actor.getCanisterIdText();
}

// ---- Menu items ----
export async function addItem(
  actor: Backend,
  item: Omit<MenuItem, "visible"> & { visible?: boolean },
): Promise<MenuItem> {
  return unwrap(
    await actor.addItem(
      item.itemId,
      item.name,
      item.price,
      item.unitName,
      item.vatRate,
      item.category,
      item.image,
    ),
  );
}

export async function updateItem(
  actor: Backend,
  item: Omit<MenuItem, "visible"> & { visible: boolean },
): Promise<MenuItem> {
  return unwrap(
    await actor.updateItem(
      item.itemId,
      item.name,
      item.price,
      item.unitName,
      item.vatRate,
      item.category,
      item.image,
      item.visible,
    ),
  );
}

// Bật/tắt hiển thị món CHỈ đổi field visible, KHÔNG đụng tới ảnh — dùng cho
// MenuItemTable.tsx thay vì updateItem() để tránh gửi nhầm ảnh rỗng (item.image
// từ listMenus() giờ luôn rỗng, xem getItemImage) đè lên ảnh thật đã lưu.
export async function setItemVisible(
  actor: Backend,
  itemId: string,
  visible: boolean,
): Promise<MenuItem> {
  return unwrap(await actor.setItemVisible(itemId, visible));
}

export async function deleteItem(
  actor: Backend,
  itemId: string,
): Promise<void> {
  unwrap(await actor.deleteItem(itemId));
}

export async function listMenus(actor: Backend): Promise<MenuItem[]> {
  return actor.listMenus();
}

export async function getMenu(actor: Backend): Promise<MenuItem[]> {
  return actor.getMenu();
}

export async function getMenuForRestaurant(
  actor: Backend,
  restaurantId: string,
): Promise<MenuItem[]> {
  return actor.getMenuForRestaurant(restaurantId);
}

// Ảnh món ăn lấy RIÊNG theo itemId — listMenus()/getMenu()/getMenuForRestaurant()
// không còn kèm ảnh (tránh vượt giới hạn kích thước phản hồi IC 3MB khi
// catalogue nhiều món). null nếu món không có ảnh hoặc không tìm thấy.
export async function getItemImage(
  actor: Backend,
  itemId: string,
): Promise<Uint8Array | null> {
  return actor.getItemImage(itemId);
}

// ---- Restaurants ----
export async function addRestaurant(
  actor: Backend,
  r: Omit<Restaurant, "visible"> & { visible?: boolean },
): Promise<Restaurant> {
  return unwrap(
    await actor.addRestaurant(r.restaurantId, r.name, r.address, r.phone),
  );
}

export async function updateRestaurant(
  actor: Backend,
  r: Omit<Restaurant, "visible"> & { visible: boolean },
): Promise<Restaurant> {
  return unwrap(
    await actor.updateRestaurant(
      r.restaurantId,
      r.name,
      r.address,
      r.phone,
      r.visible,
    ),
  );
}

export async function deleteRestaurant(
  actor: Backend,
  restaurantId: string,
): Promise<void> {
  unwrap(await actor.deleteRestaurant(restaurantId));
}

export async function listRestaurants(actor: Backend): Promise<Restaurant[]> {
  return actor.listRestaurants();
}

export async function getRestaurants(actor: Backend): Promise<Restaurant[]> {
  return actor.getRestaurants();
}

export async function setRestaurantPriceOverride(
  actor: Backend,
  restaurantId: string,
  itemId: string,
  price: bigint,
): Promise<void> {
  unwrap(await actor.setRestaurantPriceOverride(restaurantId, itemId, price));
}

// ---- Email verification (OTP gate) ----
export async function sendVerificationCode(
  actor: Backend,
  email: string,
): Promise<void> {
  const r = await actor.sendVerificationCode(email);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function verifyEmailCode(
  actor: Backend,
  email: string,
  code: string,
): Promise<void> {
  const r = await actor.verifyEmailCode(email, code);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function isEmailVerified(
  actor: Backend,
  email: string,
): Promise<boolean> {
  return actor.isEmailVerified(email);
}

// ---- Auth / authorization ----
export async function isCallerAdmin(actor: Backend): Promise<boolean> {
  return actor.isCallerAdmin();
}

export async function getCallerUserRole(actor: Backend) {
  return actor.getCallerUserRole();
}

// ---- Payment mode (admin only) ----
export async function getPaymentMode(actor: Backend): Promise<string> {
  return actor.getPaymentMode();
}

export async function setPaymentMode(
  actor: Backend,
  mode: string,
): Promise<void> {
  const r = await actor.setPaymentMode(mode);
  if (r.__kind__ === "err") throw new Error(r.err);
}

// ---- Store hours (global, applies to all restaurants) ----
export async function getStoreHours(actor: Backend): Promise<StoreHours> {
  return actor.getStoreHours();
}

export async function setStoreHours(
  actor: Backend,
  hours: StoreHours,
): Promise<void> {
  const r = await actor.setStoreHours(hours);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function isStoreOpen(actor: Backend): Promise<boolean> {
  return actor.isStoreOpen();
}

// Chương trình KM đang có hiệu lực HÔM NAY (khớp ngày + thứ trong tuần) —
// KHÔNG có nghĩa là đang đúng khung giờ (frontend tự tính khung giờ/đếm
// ngược từ promotion.timeSlots, xem hooks/usePromotionCountdown.ts). null
// nếu không có chương trình nào hợp lệ hôm nay.
export async function getCurrentPromotion(
  actor: Backend,
): Promise<Promotion | null> {
  return actor.getCurrentPromotion();
}

// Re-export enums for convenience in components.
export { BookingStatus, DeviceRole, InvoiceStatus, PaymentStatus };
