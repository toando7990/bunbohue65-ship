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
  type RegistrationPromo,
  type Restaurant,
  type SalesPromo,
  type StoreHours,
  type Voucher,
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

// Chương trình "Khuyến mại đăng ký" (chào mừng khách mới) đang có hiệu
// lực hôm nay — hiện ở trang đặt món CHỈ khi khách chưa từng xác thực
// email (kiểm tra qua getVerifiedEmail() localStorage, xem
// RegistrationPromoBanner.tsx).
export async function getCurrentRegistrationPromo(
  actor: Backend,
): Promise<RegistrationPromo | null> {
  return actor.getCurrentRegistrationPromo();
}

// Tổng số đơn KM Hệ 1 đã dùng hôm nay (toàn hệ thống, không phân biệt
// khách) — dùng cho "Đã dùng X/Y đơn khuyến mại hôm nay".
export async function getKmDailyCount(
  actor: Backend,
  programCode: string,
): Promise<bigint> {
  return actor.getKmDailyCount(programCode);
}

// Số đơn KM Hệ 1 khách NÀY đã dùng hôm nay — dùng cho "Bạn đã dùng X/Y
// lượt hôm nay".
export async function getKmUsageCount(
  actor: Backend,
  email: string,
  programCode: string,
): Promise<bigint> {
  return actor.getKmUsageCount(email, programCode);
}

// Chương trình "Khuyến mại doanh số" đang có hiệu lực hôm nay — canister
// chỉ cung cấp CẤU HÌNH (tiers), frontend tự tính "còn thiếu bao nhiêu"
// từ doanh số hiện tại của khách (xem OrderHistory.tsx, Giai đoạn 3f).
export async function getCurrentSalesPromo(
  actor: Backend,
): Promise<SalesPromo | null> {
  return actor.getCurrentSalesPromo();
}

// ---- Quản lý chương trình KM (admin, /admin/promotions) ----

export interface PromotionInput {
  name: string;
  startDate: string;
  endDate: string;
  daysOfWeek: boolean[];
  timeSlots: {
    startHour: bigint;
    startMinute: bigint;
    durationMinutes: bigint;
  }[];
  dailyOrderLimit: bigint;
  perCustomerDailyLimit: bigint;
  tiers: { minOrderValue: bigint; discountAmount: bigint }[];
  termsUrl: string;
}

export async function listPromotions(actor: Backend): Promise<Promotion[]> {
  return unwrap(await actor.listPromotions());
}

export async function createPromotion(
  actor: Backend,
  input: PromotionInput,
): Promise<Promotion> {
  return unwrap(
    await actor.createPromotion(
      input.name,
      input.startDate,
      input.endDate,
      input.daysOfWeek,
      input.timeSlots,
      input.dailyOrderLimit,
      input.perCustomerDailyLimit,
      input.tiers,
      input.termsUrl,
    ),
  );
}

export async function updatePromotion(
  actor: Backend,
  code: string,
  input: PromotionInput,
  active: boolean,
): Promise<Promotion> {
  return unwrap(
    await actor.updatePromotion(
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.daysOfWeek,
      input.timeSlots,
      input.dailyOrderLimit,
      input.perCustomerDailyLimit,
      input.tiers,
      active,
      input.termsUrl,
    ),
  );
}

export async function deletePromotion(
  actor: Backend,
  code: string,
): Promise<void> {
  unwrap(await actor.deletePromotion(code));
}

// Dừng chương trình (set active=false) — LUÔN dùng được, kể cả chương
// trình đã có khách dùng (Giai đoạn 4f). Cách DUY NHẤT tắt 1 chương trình
// đã dùng — updatePromotion/deletePromotion sẽ bị canister từ chối.
export async function stopPromotion(
  actor: Backend,
  code: string,
): Promise<Promotion> {
  return unwrap(await actor.stopPromotion(code));
}

// Chương trình đã có khách dùng thành công chưa (Giai đoạn 4f) — quyết
// định frontend hiện nút Sửa/Xoá hay chỉ Dừng.
export async function isPromotionUsed(
  actor: Backend,
  code: string,
): Promise<boolean> {
  return unwrap(await actor.isPromotionUsed(code));
}

// ---- Quản lý "Khuyến mại đăng ký" (admin, /admin/registration-promo) ----

export interface RegistrationPromoInput {
  name: string;
  startDate: string;
  endDate: string;
  voucherValue: bigint;
  voucherValidDays: bigint;
  termsUrl: string;
}

export async function listRegistrationPromos(
  actor: Backend,
): Promise<RegistrationPromo[]> {
  return unwrap(await actor.listRegistrationPromos());
}

export async function createRegistrationPromo(
  actor: Backend,
  input: RegistrationPromoInput,
): Promise<RegistrationPromo> {
  return unwrap(
    await actor.createRegistrationPromo(
      input.name,
      input.startDate,
      input.endDate,
      input.voucherValue,
      input.voucherValidDays,
      input.termsUrl,
    ),
  );
}

export async function updateRegistrationPromo(
  actor: Backend,
  code: string,
  input: RegistrationPromoInput,
  active: boolean,
): Promise<RegistrationPromo> {
  return unwrap(
    await actor.updateRegistrationPromo(
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.voucherValue,
      input.voucherValidDays,
      active,
      input.termsUrl,
    ),
  );
}

export async function deleteRegistrationPromo(
  actor: Backend,
  code: string,
): Promise<void> {
  unwrap(await actor.deleteRegistrationPromo(code));
}

export async function stopRegistrationPromo(
  actor: Backend,
  code: string,
): Promise<RegistrationPromo> {
  return unwrap(await actor.stopRegistrationPromo(code));
}

export async function isRegistrationPromoUsed(
  actor: Backend,
  code: string,
): Promise<boolean> {
  return unwrap(await actor.isRegistrationPromoUsed(code));
}

// ---- Quản lý "Khuyến mại doanh số tuần/tháng" (admin, /admin/sales-promo) ----

export interface SalesPromoInput {
  name: string;
  startDate: string;
  endDate: string;
  weeklyTiers: { minSales: bigint; voucherValue: bigint }[];
  monthlyTiers: { minSales: bigint; voucherValue: bigint }[];
  voucherValidDays: bigint;
  termsUrl: string;
}

export async function listSalesPromos(actor: Backend): Promise<SalesPromo[]> {
  return unwrap(await actor.listSalesPromos());
}

export async function createSalesPromo(
  actor: Backend,
  input: SalesPromoInput,
): Promise<SalesPromo> {
  return unwrap(
    await actor.createSalesPromo(
      input.name,
      input.startDate,
      input.endDate,
      input.weeklyTiers,
      input.monthlyTiers,
      input.voucherValidDays,
      input.termsUrl,
    ),
  );
}

export async function updateSalesPromo(
  actor: Backend,
  code: string,
  input: SalesPromoInput,
  active: boolean,
): Promise<SalesPromo> {
  return unwrap(
    await actor.updateSalesPromo(
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.weeklyTiers,
      input.monthlyTiers,
      input.voucherValidDays,
      active,
      input.termsUrl,
    ),
  );
}

export async function deleteSalesPromo(
  actor: Backend,
  code: string,
): Promise<void> {
  unwrap(await actor.deleteSalesPromo(code));
}

export async function stopSalesPromo(
  actor: Backend,
  code: string,
): Promise<SalesPromo> {
  return unwrap(await actor.stopSalesPromo(code));
}

export async function isSalesPromoUsed(
  actor: Backend,
  code: string,
): Promise<boolean> {
  return unwrap(await actor.isSalesPromoUsed(code));
}

// ---- Phiếu giảm giá (khách xem/áp dụng, Giai đoạn 3e) ----

export async function listMyVouchers(
  actor: Backend,
  email: string,
): Promise<Voucher[]> {
  return actor.listMyVouchers(email);
}

// Re-export enums for convenience in components.
export { BookingStatus, DeviceRole, InvoiceStatus, PaymentStatus };
