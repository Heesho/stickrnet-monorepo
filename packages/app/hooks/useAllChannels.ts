import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getChannelsByActivity,
  getChannelsByLiquidity,
  getChannelsByCreatedAt,
  searchChannels,
  type SubgraphChannel,
} from "@/lib/subgraph-launchpad";
import { HIDDEN_CHANNELS } from "@/lib/constants";

export type ChannelListItem = {
  address: `0x${string}`;         // Content contract address (channel id)
  coinAddress: `0x${string}`;     // Coin token address
  lpPairAddress: `0x${string}`;   // LP pair address
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  imageUri: string | null;
  launcher: `0x${string}`;
  // Market data (from subgraph)
  priceUsd: number;
  change24h: number;
  marketCapUsd: number;
  volume24h: number;           // Approximation from volumeQuote
  liquidityUsd: number;
  // Sparkline (populated separately via useSparklineData)
  sparklinePrices: number[];
  // Subgraph data
  totalMinted: bigint;
  lastActivityAt: number;         // Unix timestamp
  createdAt: number;
  // Sticker data
  contentCount: number;
  collectVolume: number;
  description: string | null;
};

export type SortOption = "bump" | "top" | "new";

// Hook to get channel list from subgraph with sorting
export function useChannelList(sortBy: SortOption = "top", first = 50) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["channelList", sortBy, first],
    queryFn: async () => {
      if (sortBy === "bump") return getChannelsByActivity(first);
      if (sortBy === "top") return getChannelsByLiquidity(first);
      return getChannelsByCreatedAt(first); // "new"
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { channels: data ?? [], isLoading, error };
}

// Hook to search channels by name/symbol
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

// Convert SubgraphChannel to ChannelListItem
function channelToChannelListItem(channel: SubgraphChannel): ChannelListItem {
  const priceUsd = parseFloat(channel.price) || 0;
  const totalMinted = parseFloat(channel.totalMinted || "0");
  const liquidityUsd = parseFloat(channel.liquidity) || 0;

  return {
    address: channel.id.toLowerCase() as `0x${string}`,
    coinAddress: channel.coin.toLowerCase() as `0x${string}`,
    lpPairAddress: (channel.lpToken?.toLowerCase() ?? "0x0") as `0x${string}`,
    tokenName: channel.name,
    tokenSymbol: channel.symbol,
    uri: channel.uri,
    imageUri: channel.metadata?.imageUri ?? null,
    launcher: channel.launcher.id.toLowerCase() as `0x${string}`,
    priceUsd,
    change24h: 0, // No nested dayData; sparkline data comes separately
    marketCapUsd: liquidityUsd, // Use liquidity as proxy for market cap
    volume24h: parseFloat(channel.volumeQuote) || 0,
    liquidityUsd,
    sparklinePrices: [], // Populated via useSparklineData hook
    totalMinted: BigInt(Math.floor(totalMinted * 1e18)),
    lastActivityAt: parseInt(channel.lastSwapAt) || 0,
    createdAt: parseInt(channel.createdAt) || 0,
    contentCount: parseInt(channel.contentCount) || 0,
    collectVolume: parseFloat(channel.collectVolume) || 0,
    description: channel.metadata?.description ?? null,
  };
}

// Combined hook for explore page
export function useExploreChannels(
  sortBy: SortOption = "top",
  searchQuery = "",
  _account: `0x${string}` | undefined // keep param for compat, not used
) {
  const { channels: searchResults, isLoading: isSearchLoading } = useSearchChannels(searchQuery);
  const { channels: listChannels, isLoading: isListLoading } = useChannelList(sortBy);

  const isSearching = searchQuery.length >= 2;
  const rawChannels = isSearching ? searchResults : listChannels;
  const isLoadingChannels = isSearching ? isSearchLoading : isListLoading;

  // Convert subgraph data to ChannelListItem[] and filter hidden channels
  const items: ChannelListItem[] = useMemo(() => {
    return rawChannels
      .filter((c) => !HIDDEN_CHANNELS.includes(c.id.toLowerCase()))
      .map(channelToChannelListItem);
  }, [rawChannels]);

  return {
    channels: items,
    isLoading: isLoadingChannels,
    isUsingFallback: false,
  };
}
