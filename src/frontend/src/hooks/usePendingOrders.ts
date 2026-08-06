// Poll listPendingPaymentOrders every 5s for DriverPaymentScreen.
// Mobile-first: returns flat list ready for QR-focused driver UI.

import { createActor } from "@/backend";
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
