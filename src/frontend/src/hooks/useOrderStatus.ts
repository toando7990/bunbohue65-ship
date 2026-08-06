// Poll getOrderStatus every 5s for OrderTracker.
// Canister is the source of truth for status/QR — no HTTP outcalls.

import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export function useOrderStatus(orderId: string | undefined) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["order", "status", orderId],
    queryFn: async () => {
      if (!actor || !orderId) return null;
      const r = await actor.getOrderStatus(orderId);
      if (r.__kind__ === "ok") return r.ok;
      throw new Error(r.err);
    },
    enabled: !!actor && !isFetching && !!orderId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}
