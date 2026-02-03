import { useQuery } from "@tanstack/react-query";
import { getChannel, type SubgraphChannel, type SubgraphContent } from "@/lib/subgraph";

export type ChannelDetail = SubgraphChannel & { contents: SubgraphContent[] };

export function useChannel(channelId: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      if (!channelId) return null;
      return getChannel(channelId, 40, 0);
    },
    enabled: !!channelId,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });

  return { channel: data as ChannelDetail | null, isLoading, error };
}
