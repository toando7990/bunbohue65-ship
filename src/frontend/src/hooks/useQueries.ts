// Shared React Query hooks for backend reads (non-polling).
// Page tasks import from here; polling hooks live in their own files.

import { type Backend, createActor } from "@/backend";
import type { DeviceRole, EnterpriseRole, StoreHours } from "@/backend";
import {
  activateDevice as activateDeviceFn,
  addItem as addItemFn,
  addRestaurant as addRestaurantFn,
  cleanupExpiredActivations as cleanupFn,
  cleanupOrderByDevice as cleanupOrderByDeviceFn,
  countVouchersByProgram as countVouchersByProgramFn,
  createPromotion as createPromotionFn,
  createRegistrationPromo as createRegistrationPromoFn,
  createSalesPromo as createSalesPromoFn,
  deleteItem as deleteItemFn,
  deletePromotion as deletePromotionFn,
  deleteRegistrationPromo as deleteRegistrationPromoFn,
  deleteRestaurant as deleteRestaurantFn,
  deleteSalesPromo as deleteSalesPromoFn,
  generateActivationCode as genCodeFn,
  getCanisterIdText as getCanisterIdFn,
  getCurrentPromotion as getCurrentPromotionFn,
  getCurrentRegistrationPromo as getCurrentRegistrationPromoFn,
  getCurrentSalesPromo as getCurrentSalesPromoFn,
  getItemImage as getItemImageFn,
  getKmDailyCount as getKmDailyCountFn,
  getKmUsageCount as getKmUsageCountFn,
  getMenuForRestaurant as getMenuForRestaurantFn,
  getOrder as getOrderFn,
  getOrdersByEmail as getOrdersByEmailFn,
  getPaymentMode as getPaymentModeFn,
  getStoreHours as getStoreHoursFn,
  isCallerAdmin as isCallerAdminFn,
  isPromotionUsed as isPromotionUsedFn,
  isRegistrationPromoUsed as isRegistrationPromoUsedFn,
  isSalesPromoUsed as isSalesPromoUsedFn,
  isStoreOpen as isStoreOpenFn,
  issueInvoiceByDevice as issueInvoiceByDeviceFn,
  listDevicesByRestaurant as listDevicesByRestaurantFn,
  listDevicesByRole as listDevicesByRoleFn,
  listMenus as listMenusFn,
  listMyVouchers as listMyVouchersFn,
  listOrders as listOrdersFn,
  listPromotions as listPromotionsFn,
  listRegistrationPromos as listRegistrationPromosFn,
  listRestaurants as listRestaurantsFn,
  listSalesPromos as listSalesPromosFn,
  markPickedUp as markPickedUpFn,
  revokeDevice as revokeDeviceFn,
  setItemVisible as setItemVisibleFn,
  setRestaurantPriceOverride as setOverrideFn,
  setPaymentMode as setPaymentModeFn,
  setStoreHours as setStoreHoursFn,
  setVpsSecret as setVpsSecretFn,
  stopPromotion as stopPromotionFn,
  stopRegistrationPromo as stopRegistrationPromoFn,
  stopSalesPromo as stopSalesPromoFn,
  updateItem as updateItemFn,
  updatePromotion as updatePromotionFn,
  updateRegistrationPromo as updateRegistrationPromoFn,
  updateRestaurant as updateRestaurantFn,
  updateSalesPromo as updateSalesPromoFn,
} from "@/lib/canister";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function useActorOrNull() {
  const { actor, isFetching } = useActor(createActor);
  return { actor: actor as Backend | null, isFetching };
}

// ---- Orders ----
export function useOrders(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["orders", deviceId],
    queryFn: () =>
      actor ? listOrdersFn(actor, deviceId) : Promise.resolve([]),
    enabled: !!actor && !isFetching,
  });
}

// Lịch sử đặt đơn — tra cứu theo email đã xác thực. Chỉ chạy khi có email
// (đã trim + lowercase phía gọi); hoạt động trên mọi thiết bị vì lọc ở
// canister thay vì dựa vào localStorage như useOrders/OrderList.
export function useOrdersByEmail(email: string | null, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["ordersByEmail", email, deviceId],
    queryFn: () =>
      actor && email
        ? getOrdersByEmailFn(actor, email, deviceId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!email,
  });
}

// Fetch a single full Order (includes createdAt/amount/billId/qrCode/expireAt
// that OrderStatus does not carry). Used by OrderTracker to render QrPayment.
export function useGetOrder(orderId: string | undefined, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["order", orderId, deviceId],
    queryFn: () =>
      actor && orderId
        ? getOrderFn(actor, orderId, deviceId)
        : Promise.resolve(null),
    enabled: !!actor && !isFetching && !!orderId,
    // Poll every 5s so order.paymentStatus (which drives the QrPayment
    // 'Thanh toán' button) refreshes live after a customer pays while on the
    // page, matching the useOrderStatus poll. Without this, the button stays
    // visible until a manual refetch.
    refetchInterval: 5000,
  });
}

// Mark an order as picked up by the driver. Invalidates the paid-for-pickup
// polling query so the order disappears from the pickup queue immediately.
export function useMarkPickedUp() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (orderId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return markPickedUpFn(actor, orderId);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["orders", "paid-for-pickup"] }),
  });
}

// ---- Menu ----
export function useMenus() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["menus"],
    queryFn: () => (actor ? listMenusFn(actor) : Promise.resolve([])),
    enabled: !!actor && !isFetching,
  });
}

export function useMenuForRestaurant(restaurantId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["menu", restaurantId],
    queryFn: () =>
      actor && restaurantId
        ? getMenuForRestaurantFn(actor, restaurantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!restaurantId,
  });
}

// Ảnh món ăn lấy RIÊNG theo itemId (listMenus()/getMenuForRestaurant() không
// còn kèm ảnh — tránh vượt giới hạn kích thước phản hồi IC 3MB). staleTime
// dài vì ảnh món hiếm khi đổi — tránh gọi lại canister mỗi lần component
// remount (mỗi thẻ món trong danh sách đều dùng hook này).
export function useItemImage(itemId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["itemImage", itemId],
    queryFn: () =>
      actor && itemId
        ? getItemImageFn(actor, itemId)
        : Promise.resolve(undefined),
    enabled: !!actor && !isFetching && !!itemId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (item: Parameters<typeof updateItemFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return updateItemFn(actor, item);
    },
    onSuccess: (_data, item) => {
      qc.invalidateQueries({ queryKey: ["menus"] });
      qc.invalidateQueries({ queryKey: ["itemImage", item.itemId] });
    },
  });
}

// Bật/tắt hiển thị món — CHỈ đổi field visible, KHÔNG đụng tới ảnh. Dùng cho
// MenuItemTable.tsx thay vì useUpdateItem() để tránh gửi nhầm ảnh rỗng đè
// lên ảnh thật (item.image từ danh sách giờ luôn rỗng — xem useItemImage).
export function useSetItemVisible() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: { itemId: string; visible: boolean }) => {
      if (!actor) throw new Error("Actor not ready");
      return setItemVisibleFn(actor, args.itemId, args.visible);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

export function useAddItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (item: Parameters<typeof addItemFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return addItemFn(actor, item);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (itemId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteItemFn(actor, itemId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menus"] }),
  });
}

// ---- Restaurants ----
export function useRestaurants() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["restaurants"],
    queryFn: () => (actor ? listRestaurantsFn(actor) : Promise.resolve([])),
    enabled: !!actor && !isFetching,
  });
}

export function useAddRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (r: Parameters<typeof addRestaurantFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return addRestaurantFn(actor, r);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useUpdateRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (r: Parameters<typeof updateRestaurantFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return updateRestaurantFn(actor, r);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useDeleteRestaurant() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (restaurantId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteRestaurantFn(actor, restaurantId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

export function useSetRestaurantPriceOverride() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      restaurantId: string;
      itemId: string;
      price: bigint;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return setOverrideFn(actor, args.restaurantId, args.itemId, args.price);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["menu"] }),
  });
}

// ---- Devices ----
export function useDevicesByRestaurant(
  restaurantId: string | undefined,
  refetchIntervalMs?: number,
) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["devices", restaurantId],
    queryFn: () =>
      actor && restaurantId
        ? listDevicesByRestaurantFn(actor, restaurantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!restaurantId,
    refetchInterval: refetchIntervalMs,
  });
}

export function useGenerateActivationCode() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: { restaurantId: string; role: DeviceRole }) => {
      if (!actor) throw new Error("Actor not ready");
      return genCodeFn(actor, args.restaurantId, args.role);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useActivateDevice() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      code: string;
      deviceId: string;
      name: string;
      phone: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return activateDeviceFn(
        actor,
        args.code,
        args.deviceId,
        args.name,
        args.phone,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (deviceId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return revokeDeviceFn(actor, deviceId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useCleanupExpiredActivations() {
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: () => {
      if (!actor) throw new Error("Actor not ready");
      return cleanupFn(actor);
    },
  });
}

// ---- Enterprise roles ----

// List devices bound to a specific role (admin/driver/cashier or one of the
// 3 enterprise roles). Used by DeviceManager to filter by enterprise role.
export function useDevicesByRole(role: DeviceRole | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["devices", "role", role],
    queryFn: () =>
      actor && role ? listDevicesByRoleFn(actor, role) : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!role,
  });
}

// Whether the current caller holds a specific enterprise role. Used by the
// enterprise gate to scope each role to its own module. deviceId is the
// current device's bound id (from the enterprise activation storage).
export function useCallerHasEnterpriseRole(
  role: EnterpriseRole | undefined,
  deviceId?: string,
) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["auth", "enterpriseRole", role, deviceId],
    queryFn: () =>
      actor && role
        ? actor.callerHasEnterpriseRole(deviceId ?? "", role)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!role,
    staleTime: 60_000,
  });
}

// useListPendingPaymentOrders/useConfirmPaymentByDevice (vai trò "Hàng đợi
// thanh toán") đã XOÁ HẲN — xem giải thích ở mixins/core-api.mo (lỗ hổng tài
// chính: đánh dấu #paid không qua bất kỳ đối chiếu nào). /driver là nơi duy
// nhất xử lý thanh toán, dùng listPendingPaymentOrders (canister, đã khôi
// phục về đúng 1 tham số) qua VPS worker, không qua hook này.

// Accounting role: manually clean up (cancel) an order.
export function useCleanupOrderByDevice(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (orderId: string) => {
      if (!actor) throw new Error("Actor not ready");
      return cleanupOrderByDeviceFn(actor, deviceId ?? "", orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// Accounting role: manually issue an e-invoice for an order.
export function useIssueInvoiceByDevice(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      invoiceId: string;
      pdfUrl: string;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return issueInvoiceByDeviceFn(
        actor,
        deviceId ?? "",
        args.orderId,
        args.invoiceId,
        args.pdfUrl,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ---- Admin / VPS secret ----
export function useIsAdmin() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["auth", "isAdmin"],
    queryFn: () => (actor ? isCallerAdminFn(actor) : Promise.resolve(false)),
    enabled: !!actor && !isFetching,
  });
}

export function useCanisterIdText() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["canister-id"],
    queryFn: () => (actor ? getCanisterIdFn(actor) : Promise.resolve("")),
    enabled: !!actor && !isFetching,
  });
}

export function useSetVpsSecret() {
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (newSecret: string) => {
      if (!actor) throw new Error("Actor not ready");
      return setVpsSecretFn(actor, newSecret);
    },
  });
}

// ---- Admin / payment mode ----
// A9: the payment-mode query drives isCustomerMode on the order page. It
// refetches on mount, window focus, and network reconnect so the frontend
// mode always matches the VPS and never drifts into the wrong payment flow.
export function useGetPaymentMode() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["paymentMode"],
    queryFn: () => (actor ? getPaymentModeFn(actor) : Promise.resolve("")),
    enabled: !!actor && !isFetching,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
}

export function useSetPaymentMode() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (mode: string) => {
      if (!actor) throw new Error("Actor not ready");
      return setPaymentModeFn(actor, mode);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paymentMode"] }),
  });
}

// ---- Store hours (global) ----
export function useGetStoreHours() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["storeHours"],
    queryFn: () => (actor ? getStoreHoursFn(actor) : Promise.resolve(null)),
    enabled: !!actor && !isFetching,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useSetStoreHours() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (hours: StoreHours) => {
      if (!actor) throw new Error("Actor not ready");
      return setStoreHoursFn(actor, hours);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storeHours"] }),
  });
}

// Whether the store is currently open (drives the waiting/closed screen).
// Polls every 30s so the closed screen automatically unlocks the moment the
// store's opening time passes, without the customer needing to refresh.
export function useIsStoreOpen() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["storeOpen"],
    queryFn: () => (actor ? isStoreOpenFn(actor) : Promise.resolve(true)),
    enabled: !!actor && !isFetching,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}

// Chương trình KM đang có hiệu lực hôm nay (banner trang đặt món). Poll
// 30s giống useIsStoreOpen — đủ để banner cập nhật khi admin vừa
// tạo/sửa/tắt chương trình mà không cần khách tự tải lại trang.
export function useCurrentPromotion() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["currentPromotion"],
    queryFn: () =>
      actor ? getCurrentPromotionFn(actor) : Promise.resolve(null),
    enabled: !!actor && !isFetching,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}

// Chương trình "Khuyến mại đăng ký" đang có hiệu lực hôm nay — hiện ở
// trang đặt món cho khách CHƯA TỪNG xác thực email (xem
// RegistrationPromoBanner.tsx, tự kiểm tra localStorage riêng, hook này
// chỉ lấy dữ liệu chương trình, không quyết định hiện/ẩn).
export function useCurrentRegistrationPromo() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["currentRegistrationPromo"],
    queryFn: () =>
      actor ? getCurrentRegistrationPromoFn(actor) : Promise.resolve(null),
    enabled: !!actor && !isFetching,
  });
}

// Tổng số đơn KM Hệ 1 đã dùng hôm nay (toàn hệ thống) — hiện "Đã dùng
// X/Y đơn khuyến mại hôm nay" cạnh banner. Refetch cùng nhịp với
// useCurrentPromotion (30s) — đủ mới, không cần realtime tuyệt đối.
export function useKmDailyCount(programCode: string | null) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["kmDailyCount", programCode],
    queryFn: () =>
      actor && programCode
        ? getKmDailyCountFn(actor, programCode)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!programCode,
    refetchInterval: 30000,
  });
}

// Số phiếu (Đăng ký/Doanh số) đã phát cho 1 chương trình — dùng ở trang
// /admin/theo-doi-km (việc 1).
export function useVoucherCountByProgram(programCode: string | null) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["voucherCountByProgram", programCode],
    queryFn: () =>
      actor && programCode
        ? countVouchersByProgramFn(actor, programCode)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!programCode,
  });
}

// Số đơn KM Hệ 1 khách NÀY đã dùng hôm nay — hiện "Bạn đã dùng X/Y lượt
// hôm nay", chỉ khi khách đã xác thực email (cần email để tra).
export function useKmUsageCount(
  email: string | null,
  programCode: string | null,
) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["kmUsageCount", email, programCode],
    queryFn: () =>
      actor && email && programCode
        ? getKmUsageCountFn(actor, email, programCode)
        : Promise.resolve(0n),
    enabled: !!actor && !isFetching && !!email && !!programCode,
    refetchInterval: 30000,
  });
}

// Chương trình "Khuyến mại doanh số" đang có hiệu lực hôm nay — dùng cho
// dòng gợi ý "còn X đ nữa để đạt mức thưởng tiếp theo" ở tab "Tuần
// này"/"Tháng này" (Giai đoạn 3f).
export function useCurrentSalesPromo() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["currentSalesPromo"],
    queryFn: () =>
      actor ? getCurrentSalesPromoFn(actor) : Promise.resolve(null),
    enabled: !!actor && !isFetching,
  });
}

// ---- Quản lý chương trình KM (admin) ----

export function usePromotions(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["promotions", deviceId],
    queryFn: () =>
      actor ? listPromotionsFn(actor, deviceId) : Promise.resolve([]),
    enabled: !!actor && !isFetching,
  });
}

export function useCreatePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPromotionFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createPromotionFn(actor, deviceId ?? "", input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

export function useUpdatePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createPromotionFn>[2];
      active: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updatePromotionFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

export function useDeletePromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deletePromotionFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

// Chương trình đã có khách dùng thành công chưa (Giai đoạn 4f) — quyết
// định hiện nút Sửa/Xoá hay chỉ Dừng. Gọi riêng theo từng dòng bảng (mỗi
// hàng PromotionTableRow tự gọi hook này cho mã của chính nó).
export function useIsPromotionUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["promotionUsed", code, deviceId],
    queryFn: () =>
      actor
        ? isPromotionUsedFn(actor, deviceId ?? "", code)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code,
  });
}

export function useStopPromotion(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopPromotionFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["currentPromotion"] });
    },
  });
}

// ---- Quản lý "Khuyến mại đăng ký" (admin) ----

export function useRegistrationPromos(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["registrationPromos", deviceId],
    queryFn: () =>
      actor ? listRegistrationPromosFn(actor, deviceId) : Promise.resolve([]),
    enabled: !!actor && !isFetching,
  });
}

export function useCreateRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (input: Parameters<typeof createRegistrationPromoFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createRegistrationPromoFn(actor, deviceId ?? "", input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useUpdateRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createRegistrationPromoFn>[2];
      active: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updateRegistrationPromoFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useDeleteRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteRegistrationPromoFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

export function useIsRegistrationPromoUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["registrationPromoUsed", code, deviceId],
    queryFn: () =>
      actor
        ? isRegistrationPromoUsedFn(actor, deviceId ?? "", code)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code,
  });
}

export function useStopRegistrationPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopRegistrationPromoFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registrationPromos"] });
    },
  });
}

// ---- Quản lý "Khuyến mại doanh số tuần/tháng" (admin) ----

export function useSalesPromos(deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["salesPromos", deviceId],
    queryFn: () =>
      actor ? listSalesPromosFn(actor, deviceId) : Promise.resolve([]),
    enabled: !!actor && !isFetching,
  });
}

export function useCreateSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (input: Parameters<typeof createSalesPromoFn>[2]) => {
      if (!actor) throw new Error("Actor not ready");
      return createSalesPromoFn(actor, deviceId ?? "", input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useUpdateSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (args: {
      code: string;
      input: Parameters<typeof createSalesPromoFn>[2];
      active: boolean;
    }) => {
      if (!actor) throw new Error("Actor not ready");
      return updateSalesPromoFn(
        actor,
        deviceId ?? "",
        args.code,
        args.input,
        args.active,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useDeleteSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return deleteSalesPromoFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

export function useIsSalesPromoUsed(code: string, deviceId?: string) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["salesPromoUsed", code, deviceId],
    queryFn: () =>
      actor
        ? isSalesPromoUsedFn(actor, deviceId ?? "", code)
        : Promise.resolve(false),
    enabled: !!actor && !isFetching && !!code,
  });
}

export function useStopSalesPromo(deviceId?: string) {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (code: string) => {
      if (!actor) throw new Error("Actor not ready");
      return stopSalesPromoFn(actor, deviceId ?? "", code);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salesPromos"] });
    },
  });
}

// ---- Phiếu giảm giá (khách xem/áp dụng) ----

export function useMyVouchers(email: string | null) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["myVouchers", email],
    queryFn: () =>
      actor && email ? listMyVouchersFn(actor, email) : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!email,
  });
}
