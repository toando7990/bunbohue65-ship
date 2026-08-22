// Shared React Query hooks for backend reads (non-polling).
// Page tasks import from here; polling hooks live in their own files.

import { type Backend, createActor } from "@/backend";
import type { DeviceRole, StoreHours } from "@/backend";
import {
  activateDevice as activateDeviceFn,
  addItem as addItemFn,
  addRestaurant as addRestaurantFn,
  cleanupExpiredActivations as cleanupFn,
  deleteItem as deleteItemFn,
  deleteRestaurant as deleteRestaurantFn,
  generateActivationCode as genCodeFn,
  getCanisterIdText as getCanisterIdFn,
  getMenuForRestaurant as getMenuForRestaurantFn,
  getOrder as getOrderFn,
  getPaymentMode as getPaymentModeFn,
  getStoreHours as getStoreHoursFn,
  isCallerAdmin as isCallerAdminFn,
  isStoreOpen as isStoreOpenFn,
  listDevicesByRestaurant as listDevicesByRestaurantFn,
  listMenus as listMenusFn,
  listOrders as listOrdersFn,
  listRestaurants as listRestaurantsFn,
  markPickedUp as markPickedUpFn,
  revokeDevice as revokeDeviceFn,
  setRestaurantPriceOverride as setOverrideFn,
  setPaymentMode as setPaymentModeFn,
  setStoreHours as setStoreHoursFn,
  setVpsSecret as setVpsSecretFn,
  updateItem as updateItemFn,
  updateRestaurant as updateRestaurantFn,
} from "@/lib/canister";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function useActorOrNull() {
  const { actor, isFetching } = useActor(createActor);
  return { actor: actor as Backend | null, isFetching };
}

// ---- Orders ----
export function useOrders() {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => (actor ? listOrdersFn(actor) : Promise.resolve([])),
    enabled: !!actor && !isFetching,
  });
}

// Fetch a single full Order (includes createdAt/amount/billId/qrCode/expireAt
// that OrderStatus does not carry). Used by OrderTracker to render QrPayment.
export function useGetOrder(orderId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () =>
      actor && orderId ? getOrderFn(actor, orderId) : Promise.resolve(null),
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

export function useUpdateItem() {
  const qc = useQueryClient();
  const { actor } = useActorOrNull();
  return useMutation({
    mutationFn: (item: Parameters<typeof updateItemFn>[1]) => {
      if (!actor) throw new Error("Actor not ready");
      return updateItemFn(actor, item);
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
export function useDevicesByRestaurant(restaurantId: string | undefined) {
  const { actor, isFetching } = useActorOrNull();
  return useQuery({
    queryKey: ["devices", restaurantId],
    queryFn: () =>
      actor && restaurantId
        ? listDevicesByRestaurantFn(actor, restaurantId)
        : Promise.resolve([]),
    enabled: !!actor && !isFetching && !!restaurantId,
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
    mutationFn: (args: { code: string; deviceId: string }) => {
      if (!actor) throw new Error("Actor not ready");
      return activateDeviceFn(actor, args.code, args.deviceId);
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
