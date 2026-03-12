import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  getAccount,
  getAllChannels,
  type SubgraphChannel,
} from "@/lib/subgraph-launchpad";
import { ERC20_ABI } from "@/lib/contracts";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export type UserHolding = {
  address: `0x${string}`;       // Channel/content address (channel.id)
  coinAddress: `0x${string}`;   // Coin token address
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  balance: bigint;              // Raw token balance (18 decimals)
  balanceNum: number;           // Formatted balance
  priceUsd: number;             // Price per token in USD
  valueUsd: number;             // balance * price
  change24h: number;
  sparklinePrices: number[];
};

export type UserLaunchedChannel = {
  address: `0x${string}`;
  coinAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  totalMinted: number;
  coinPrice: number;
  marketCapUsd: number;
  change24h: number;
  sparklinePrices: number[];
};

export function useUserProfile(accountAddress: `0x${string}` | undefined) {
  // Fetch user account data from subgraph
  const {
    data: accountData,
    isLoading: isLoadingAccount,
  } = useQuery({
    queryKey: ["userProfile", accountAddress],
    queryFn: async () => {
      if (!accountAddress) return null;
      return getAccount(accountAddress);
    },
    enabled: !!accountAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Fetch all channels from subgraph (to know which tokens exist + prices)
  const { data: allChannels, isLoading: isLoadingChannels } = useQuery({
    queryKey: ["allChannels"],
    queryFn: () => getAllChannels(100),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Build balanceOf calls for every coin token
  const balanceOfCalls = useMemo(() => {
    if (!accountAddress || !allChannels?.length) return [];
    return allChannels.map((channel) => ({
      address: channel.coin.toLowerCase() as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [accountAddress] as const,
      chainId: DEFAULT_CHAIN_ID,
    }));
  }, [accountAddress, allChannels]);

  const { data: balanceResults, isLoading: isLoadingBalances } = useReadContracts({
    contracts: balanceOfCalls,
    query: {
      enabled: balanceOfCalls.length > 0,
      staleTime: 15_000,
      refetchInterval: 30_000,
    },
  });

  // Combine balances with channel metadata, filter non-zero, sort by USD value
  const holdings: UserHolding[] = useMemo(() => {
    if (!allChannels?.length || !balanceResults?.length) return [];

    const items: UserHolding[] = [];

    for (let i = 0; i < allChannels.length; i++) {
      const channel = allChannels[i];
      const result = balanceResults[i];
      if (!result || result.status !== "success") continue;

      const balance = result.result as bigint;
      if (balance === 0n) continue;

      const balanceNum = Number(formatEther(balance));
      const priceUsd = parseFloat(channel.price) || 0;
      const valueUsd = balanceNum * priceUsd;

      items.push({
        address: channel.id.toLowerCase() as `0x${string}`,
        coinAddress: channel.coin.toLowerCase() as `0x${string}`,
        tokenName: channel.name,
        tokenSymbol: channel.symbol,
        uri: channel.uri ?? "",
        balance,
        balanceNum,
        priceUsd,
        valueUsd,
        change24h: 0,
        sparklinePrices: [],
      });
    }

    // Sort by USD value descending
    items.sort((a, b) => b.valueUsd - a.valueUsd);

    return items;
  }, [allChannels, balanceResults]);

  // Launched channels: filter channels where launcher matches account
  const launchedChannels: UserLaunchedChannel[] = useMemo(() => {
    if (!allChannels?.length || !accountAddress) return [];

    return allChannels
      .filter((channel) => channel.launcher?.id?.toLowerCase() === accountAddress.toLowerCase())
      .map((channel) => {
        const totalMinted = parseFloat(channel.totalMinted || "0");
        const coinPrice = parseFloat(channel.price) || 0;
        const liquidityUsd = parseFloat(channel.liquidity) || 0;

        return {
          address: channel.id.toLowerCase() as `0x${string}`,
          coinAddress: channel.coin.toLowerCase() as `0x${string}`,
          tokenName: channel.name,
          tokenSymbol: channel.symbol,
          uri: channel.uri ?? "",
          totalMinted,
          coinPrice,
          marketCapUsd: liquidityUsd, // Use liquidity as proxy
          change24h: 0,
          sparklinePrices: [],
        };
      })
      .sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  }, [allChannels, accountAddress]);

  const totalHoldingsValueUsd = useMemo(
    () => holdings.reduce((sum, h) => sum + h.valueUsd, 0),
    [holdings]
  );

  const isLoading = isLoadingAccount || isLoadingChannels || isLoadingBalances;

  return {
    accountData,
    holdings,
    launchedChannels,
    totalHoldingsValueUsd,
    isLoading,
  };
}
