// Shared React Query hooks for backend reads (non-polling).
// Page tasks import from here; polling hooks live in their own files.

import { type Backend, createActor } from "@/backend";
import type { DeviceRole } from "@/backend";
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
  isCallerAdmin as isCallerAdminFn,
  listDevicesByRestaurant as listDevicesByRestaurantFn,
  listMenus as listMenusFn,
  listOrders as listOrdersFn,
  listRestaurants as listRestaurantsFn,
  revokeDevice as revokeDeviceFn,
  setRestaurantPriceOverride as setOverrideFn,
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
