// Poll listPendingPaymentOrders every 5s for DriverPaymentScreen.
// Mobile-first: returns flat list ready for QR-focused driver UI.

import { createActor } from "@/backend";
import { listPaidOrdersForPickup as listPaidOrdersForPickupFn } from "@/lib/canister";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export function usePendingOrders(restaurantId: string | undefined) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orders", "pending", restaurantId],
    queryFn: async () => {
      if (!actor || !restaurantId) return [];
      return actor.listPendingPaymentOrders(restaurantId);
    },
    enabled: !!actor && !isFetching && !!restaurantId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

// Poll listPaidOrdersForPickup every 5s — today's paid+confirmed orders ready
// for the driver to pick up. No restaurantId needed (caller-scoped on canister).
export function usePaidOrdersForPickup(enabled: boolean) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["orders", "paid-for-pickup"],
    queryFn: async () => {
      if (!actor) return [];
      return listPaidOrdersForPickupFn(actor);
    },
    enabled: !!actor && !isFetching && enabled,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}
