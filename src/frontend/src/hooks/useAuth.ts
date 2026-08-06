// II auth + authorization role check (admin gate).
// Uses InternetIdentityProvider (already in main.tsx) + canister isCallerAdmin().
// No hardcoded principals — admin role is assigned via backend assignCallerUserRole.

import { createActor } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQuery } from "@tanstack/react-query";

export interface AuthState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: () => void;
  clear: () => void;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

export function useAuth(): AuthState {
  const ii = useInternetIdentity();
  const { actor, isFetching } = useActor(createActor);

  const adminQuery = useQuery({
    queryKey: ["auth", "isAdmin", !!ii.identity],
    queryFn: async () => {
      if (!actor) return false;
      try {
        return await actor.isCallerAdmin();
      } catch {
        return false;
      }
    },
    enabled: !!ii.identity && !!actor && !isFetching,
    staleTime: 60_000,
  });

  return {
    isAuthenticated: ii.isAuthenticated,
    isInitializing: ii.isInitializing,
    login: ii.login,
    clear: ii.clear,
    isAdmin: Boolean(adminQuery.data),
    isAdminLoading: adminQuery.isLoading && !!ii.identity,
  };
}
