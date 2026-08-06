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
  type Restaurant,
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
): Promise<Device> {
  return unwrap(await actor.activateDevice(code, deviceId));
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
      item.imageUrl,
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
      item.imageUrl,
      item.visible,
    ),
  );
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

// ---- Auth / authorization ----
export async function isCallerAdmin(actor: Backend): Promise<boolean> {
  return actor.isCallerAdmin();
}

export async function getCallerUserRole(actor: Backend) {
  return actor.getCallerUserRole();
}

// Re-export enums for convenience in components.
export { BookingStatus, DeviceRole, InvoiceStatus, PaymentStatus };
