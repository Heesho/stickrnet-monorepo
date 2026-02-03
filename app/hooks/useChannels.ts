import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChannels, searchChannels, type SubgraphChannel } from "@/lib/subgraph";

export type ChannelListItem = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  uri: string;
  priceUsd: number;
  liquidityUsd: number;
  collectVolumeUsd: number;
  totalStakedUsd: number;
  totalMinted: number;
  contentCount: number;
  collectCount: number;
  createdAt: number;
  lastSwapAt: number;
};

export type SortOption = "bump" | "top" | "new";

function channelToListItem(channel: SubgraphChannel): ChannelListItem {
  return {
    address: channel.id.toLowerCase() as `0x${string}`,
    name: channel.name,
    symbol: channel.symbol,
    uri: channel.uri,
    priceUsd: parseFloat(channel.price) || 0,
    liquidityUsd: parseFloat(channel.liquidity) || 0,
    collectVolumeUsd: parseFloat(channel.collectVolume) || 0,
    totalStakedUsd: parseFloat(channel.totalStaked) || 0,
    totalMinted: parseFloat(channel.totalMinted) || 0,
    contentCount: parseInt(channel.contentCount) || 0,
    collectCount: parseInt(channel.collectCount) || 0,
    createdAt: parseInt(channel.createdAt) || 0,
    lastSwapAt: parseInt(channel.lastSwapAt) || 0,
  };
}

export function useChannelList(sortBy: SortOption = "top", first = 50) {
  const orderBy = sortBy === "bump" ? "lastSwapAt" : sortBy === "new" ? "createdAt" : "collectVolume";
  const { data, isLoading, error } = useQuery({
    queryKey: ["channelList", sortBy, first],
    queryFn: async () => getChannels({ first, orderBy, orderDirection: "desc" }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { channels: data ?? [], isLoading, error };
}

export function useSearchChannels(searchQuery: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["searchChannels", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      return searchChannels(searchQuery, 20);
    },
    enabled: searchQuery.length >= 2,
    staleTime: 10_000,
    retry: false,
  });

  return { channels: data ?? [], isLoading, error };
}

export function useExploreChannels(sortBy: SortOption = "top", searchQuery = "") {
  const { channels: searchResults, isLoading: isSearchLoading } = useSearchChannels(searchQuery);
  const { channels: listChannels, isLoading: isListLoading } = useChannelList(sortBy);

  const isSearching = searchQuery.length >= 2;
  const channels = isSearching ? searchResults : listChannels;
  const isLoading = isSearching ? isSearchLoading : isListLoading;

  const items = useMemo(() => channels.map(channelToListItem), [channels]);

  return { channels: items, isLoading };
}
