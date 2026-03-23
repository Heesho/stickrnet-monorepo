import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  getAccount,
  getAllChannels,
  getOwnedContentPositions,
  type SubgraphContentPosition,
  type SubgraphMetadata,
} from "@/lib/subgraph-launchpad";
import { ERC20_ABI } from "@/lib/contracts";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const CONTENT_EPOCH_PERIOD = 86400;

function getDecayedContentPrice(initPrice: string, startTime: string): number {
  const now = Math.floor(Date.now() / 1000);
  const timePassed = now - parseInt(startTime, 10);
  const init = parseFloat(initPrice);

  if (timePassed >= CONTENT_EPOCH_PERIOD) return 0;
  if (timePassed <= 0) return init;
  return init - (init * timePassed) / CONTENT_EPOCH_PERIOD;
}

export type UserHolding = {
  address: `0x${string}`;
  coinAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  imageUri: string | null;
  balance: bigint;
  balanceNum: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number;
  sparklinePrices: number[];
};

export type UserCollectionItem = {
  id: string;
  channelAddress: `0x${string}`;
  channelName: string;
  channelSymbol: string;
  contentUri: string;
  metadata: SubgraphMetadata | null;
  tokenId: bigint;
  isApproved: boolean;
  collectCount: number;
  marketValueUsd: number;
  createdAt: number;
};

export function useUserProfile(accountAddress: `0x${string}` | undefined) {
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

  const { data: allChannels, isLoading: isLoadingChannels } = useQuery({
    queryKey: ["allChannels"],
    queryFn: () => getAllChannels(100),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const {
    data: ownedContentPositions,
    isLoading: isLoadingCollection,
  } = useQuery({
    queryKey: ["ownedContentPositions", accountAddress],
    queryFn: async () => {
      if (!accountAddress) return [];

      const pageSize = 100;
      const positions: SubgraphContentPosition[] = [];

      for (let skip = 0; ; skip += pageSize) {
        const page = await getOwnedContentPositions(accountAddress, pageSize, skip);
        positions.push(...page);
        if (page.length < pageSize) break;
      }

      return positions;
    },
    enabled: !!accountAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

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
        imageUri: channel.metadata?.imageUri ?? null,
        balance,
        balanceNum,
        priceUsd,
        valueUsd,
        change24h: 0,
        sparklinePrices: [],
      });
    }

    items.sort((a, b) => b.valueUsd - a.valueUsd);

    return items;
  }, [allChannels, balanceResults]);

  const collection: UserCollectionItem[] = useMemo(() => {
    if (!ownedContentPositions?.length) return [];

    const channelMap = new Map(
      (allChannels ?? []).map((channel) => [channel.id.toLowerCase(), channel])
    );

    return ownedContentPositions
      .map((position) => {
        const channel = channelMap.get(position.channel.id.toLowerCase());

        return {
          id: position.id,
          channelAddress: position.channel.id.toLowerCase() as `0x${string}`,
          channelName: channel?.name ?? "Channel",
          channelSymbol: channel?.symbol ?? "--",
          contentUri: position.uri ?? "",
          metadata: position.metadata ?? null,
          tokenId: BigInt(position.tokenId),
          isApproved: position.isApproved,
          collectCount: parseInt(position.collectCount, 10) || 0,
          marketValueUsd: position.isApproved
            ? getDecayedContentPrice(position.initPrice, position.startTime)
            : 0,
          createdAt: parseInt(position.createdAt, 10) || 0,
        };
      })
      .sort((a, b) => b.marketValueUsd - a.marketValueUsd || b.createdAt - a.createdAt);
  }, [allChannels, ownedContentPositions]);

  const totalCoinValueUsd = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.valueUsd, 0),
    [holdings]
  );

  const totalCollectionValueUsd = useMemo(
    () => collection.reduce((sum, item) => sum + item.marketValueUsd, 0),
    [collection]
  );

  const isLoading =
    isLoadingAccount ||
    isLoadingChannels ||
    isLoadingBalances ||
    isLoadingCollection;

  return {
    accountData,
    holdings,
    collection,
    totalCoinValueUsd,
    totalCollectionValueUsd,
    isLoading,
  };
}
