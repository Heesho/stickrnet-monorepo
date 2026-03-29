import { useQuery } from "@tanstack/react-query";
import { getContentPositions, type SubgraphContentPosition } from "@/lib/subgraph-launchpad";

export function useContentFeed(
  channelAddress: string | undefined,
  first: number = 20,
  skip: number = 0,
  fastPolling: boolean = false,
) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["contentFeed", channelAddress, first, skip],
    queryFn: () => getContentPositions(channelAddress!, first, skip),
    enabled: !!channelAddress,
    staleTime: fastPolling ? 0 : 15_000,
    refetchInterval: fastPolling ? 5_000 : 30_000,
  });

  return { contents: data ?? [], isLoading, refetch };
}
