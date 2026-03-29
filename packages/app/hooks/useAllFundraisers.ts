import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCoinsByActivity,
  getCoinsByMarketCap,
  getCoinsByCreatedAt,
  searchCoins,
  type SubgraphCoinListItem,
} from "@/lib/subgraph-launchpad";
import { ipfsToHttp } from "@/lib/constants";

export type CoinListItem = {
  address: `0x${string}`;         // Fundraiser contract address
  coinAddress: `0x${string}`;     // Coin token address
  lpPairAddress: `0x${string}`;   // LP pair address
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  logoUrl: string | null;
  launcher: `0x${string}`;
  // Market data (from subgraph)
  priceUsd: number;
  change24h: number;
  marketCapUsd: number;
  volume24h: number;           // 24h volume in USDC
  liquidityUsd: number;
  // Sparkline (daily close prices, chronological order)
  sparklinePrices: number[];
  // Subgraph data
  totalMinted: bigint;
  lastActivityAt: number;         // Unix timestamp
  createdAt: number;
};

export type SortOption = "bump" | "top" | "new";

// Hook to get coin list from subgraph with sorting
export function useCoinList(sortBy: SortOption = "top", first = 50) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["coinList", sortBy, first],
    queryFn: async () => {
      if (sortBy === "bump") return getCoinsByActivity(first);
      if (sortBy === "top") return getCoinsByMarketCap(first);
      return getCoinsByCreatedAt(first); // "new"
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return { coins: data ?? [], isLoading, error };
}

// Hook to search coins by name/symbol
export function useSearchCoins(searchQuery: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["searchCoins", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      return searchCoins(searchQuery, 20);
    },
    enabled: searchQuery.length >= 2,
    staleTime: 10_000,
    retry: false,
  });

  return { coins: data ?? [], isLoading, error };
}

// Convert SubgraphCoinListItem to CoinListItem
function coinToCoinListItem(u: SubgraphCoinListItem): CoinListItem {
  // Price: prefer priceUSD, fallback to price (which is in USDC ≈ USD)
  const priceUsd = parseFloat(u.priceUSD) || parseFloat(u.price) || 0;
  const totalSupply = parseFloat(u.totalSupply || "0");
  const totalMinted = parseFloat(u.totalMinted || "0");

  // Calculate market cap: prefer subgraph value, fallback to price × totalSupply
  let marketCapUsd = parseFloat(u.marketCapUSD) || 0;
  if (marketCapUsd === 0 && priceUsd > 0 && totalSupply > 0) {
    marketCapUsd = priceUsd * totalSupply;
  }

  // Compute 24h change from day candle data:
  // dayData is ordered desc, so [0] = today, [1] = yesterday
  let change24h = 0;
  if (u.dayData && u.dayData.length >= 2) {
    // Compare current price to yesterday's close
    const yesterdayClose = parseFloat(u.dayData[1].close);
    if (yesterdayClose > 0 && priceUsd > 0) {
      change24h = ((priceUsd - yesterdayClose) / yesterdayClose) * 100;
    }
  } else if (u.dayData && u.dayData.length === 1) {
    // Only today's candle — compare current price to today's open
    const todayOpen = parseFloat(u.dayData[0].open);
    if (todayOpen > 0 && priceUsd > 0) {
      change24h = ((priceUsd - todayOpen) / todayOpen) * 100;
    }
  }

  // Build sparkline from day candle close prices (reverse to chronological order)
  // Then append current price as the latest point
  const sparklinePrices: number[] = [];
  if (u.dayData && u.dayData.length > 0) {
    const reversed = [...u.dayData].reverse(); // oldest first
    for (const d of reversed) {
      sparklinePrices.push(parseFloat(d.close));
    }
    sparklinePrices.push(priceUsd); // current price as last point
  }

  return {
    address: u.fundraiser.id.toLowerCase() as `0x${string}`,
    coinAddress: u.id.toLowerCase() as `0x${string}`,
    lpPairAddress: (u.lpPair?.toLowerCase() ?? "0x0") as `0x${string}`,
    tokenName: u.name,
    tokenSymbol: u.symbol,
    uri: u.fundraiser.uri,
    logoUrl: u.fundraiser.metadata?.image ? ipfsToHttp(u.fundraiser.metadata.image) : null,
    launcher: u.fundraiser.launcher.id.toLowerCase() as `0x${string}`,
    priceUsd,
    change24h,
    marketCapUsd,
    volume24h: parseFloat(u.volume24h) || 0,
    liquidityUsd: parseFloat(u.liquidityUSD) || parseFloat(u.liquidity) || 0,
    sparklinePrices,
    totalMinted: BigInt(Math.floor(totalMinted * 1e18)),
    lastActivityAt: parseInt(u.lastActivityAt) || 0,
    createdAt: parseInt(u.createdAt) || 0,
  };
}

// Combined hook for explore page
export function useExploreFundraisers(
  sortBy: SortOption = "top",
  searchQuery = "",
  _account: `0x${string}` | undefined // keep param for compat, not used
) {
  const { coins: searchResults, isLoading: isSearchLoading } = useSearchCoins(searchQuery);
  const { coins: listCoins, isLoading: isListLoading } = useCoinList(sortBy);

  const isSearching = searchQuery.length >= 2;
  const coins = isSearching ? searchResults : listCoins;
  const isLoadingCoins = isSearching ? isSearchLoading : isListLoading;

  // Convert subgraph data to CoinListItem[]
  const items: CoinListItem[] = useMemo(() => {
    return coins
      .filter(u => !!u.fundraiser)
      .map(coinToCoinListItem);
  }, [coins]);

  return {
    coins: items,
    isLoading: isLoadingCoins,
    isUsingFallback: false,
  };
}
