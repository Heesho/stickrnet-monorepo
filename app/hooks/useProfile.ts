import { useQuery } from "@tanstack/react-query";
import { getProfile, type SubgraphProfile } from "@/lib/subgraph";

export function useProfile(account: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", account],
    queryFn: async () => {
      if (!account) return null;
      return getProfile(account, 40);
    },
    enabled: !!account,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  return { profile: data as SubgraphProfile | null, isLoading, error };
}
