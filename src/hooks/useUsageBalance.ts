import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getUsageBalance } from "@/lib/usage-balance.functions";

/** The balances the top bar shows; generation updates refresh it too (see useStudioRealtime). */
export const USAGE_BALANCE_KEY = ["usage-balance"] as const;

export type UsageBalance = Awaited<ReturnType<typeof getUsageBalance>>;

/** Midnight where the viewer is, which starts "today" on the top bar. */
export function viewerMidnight(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}

export function useUsageBalance() {
  const { profile } = useAuth();
  const today = viewerMidnight();
  return useQuery({
    queryKey: [...USAGE_BALANCE_KEY, today],
    enabled: !!profile?.is_active,
    queryFn: () => getUsageBalance({ data: { today } }),
    refetchInterval: 60_000,
  });
}
