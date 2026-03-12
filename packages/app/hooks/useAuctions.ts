import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress, formatUnits } from "viem";
import {
  MULTICALL_ABI,
  CONTRACT_ADDRESSES,
  QUOTE_TOKEN_DECIMALS,
  type AuctionState,
} from "@/lib/contracts";
import { useChannelList } from "./useAllChannels";
import { useFarcaster } from "./useFarcaster";
import type { SubgraphChannel } from "@/lib/subgraph-launchpad";

export type AuctionItem = {
  contentAddress: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  // Auction state
  lpPrice: bigint; // Current LP cost (18 dec)
  quoteAccumulated: bigint; // USDC in auction (6 dec)
  paymentTokenPrice: bigint; // LP value in USDC (18 dec)
  epochId: bigint;
  // Derived display values
  lpCostUsd: number; // LP cost in USD-ish
  rewardUsd: number; // USDC reward as number
  profit: number; // reward - cost
  isProfitable: boolean;
  isActive: boolean; // Has USDC and price > 0
};

type IndexedChannel = {
  contentAddress: `0x${string}`;
  channel: SubgraphChannel;
};

export function useAuctions() {
  const { channels: allChannels, isLoading: isLoadingList } = useChannelList("top", 100);
  const { address: account } = useFarcaster();

  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;

  // Build flat contract call array using single multicall
  const { contracts, indexToChannel } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contractCalls: any[] = [];
    const mapping: IndexedChannel[] = [];

    for (const channel of allChannels) {
      if (!channel.uri?.startsWith("ipfs://")) continue;
      const contentAddr = channel.id.toLowerCase() as `0x${string}`;

      contractCalls.push({
        address: multicallAddr,
        abi: MULTICALL_ABI,
        functionName: "getAuctionState" as const,
        args: [contentAddr, account ?? zeroAddress] as const,
        chainId: base.id,
      });
      mapping.push({ contentAddress: contentAddr, channel });
    }

    return { contracts: contractCalls, indexToChannel: mapping };
  }, [allChannels, account, multicallAddr]);

  const { data: states, isLoading: isLoadingStates } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const auctions: AuctionItem[] = useMemo(() => {
    if (!states) return [];

    return states
      .map((result, index) => {
        if (result.status !== "success" || !result.result) return null;
        const state = result.result as AuctionState;

        const { contentAddress, channel } = indexToChannel[index];

        // Calculate profit/loss
        const lpCostInQuote = (state.price * state.paymentTokenPrice) / BigInt(1e18);
        const lpCostScaled = lpCostInQuote / BigInt(1e12); // normalize to 6 decimals

        const rewardUsd = Number(formatUnits(state.quoteAccumulated, QUOTE_TOKEN_DECIMALS));
        const lpCostUsd = Number(formatUnits(lpCostScaled, QUOTE_TOKEN_DECIMALS));
        const profit = rewardUsd - lpCostUsd;

        const isActive = state.quoteAccumulated > 0n && state.price > 0n;

        return {
          contentAddress,
          tokenName: channel.name,
          tokenSymbol: channel.symbol,
          uri: channel.uri,
          lpPrice: state.price,
          quoteAccumulated: state.quoteAccumulated,
          paymentTokenPrice: state.paymentTokenPrice,
          epochId: state.epochId,
          lpCostUsd,
          rewardUsd,
          profit,
          isProfitable: profit > 0,
          isActive,
        };
      })
      .filter((item): item is AuctionItem => item !== null && item.isActive)
      .sort((a, b) => b.profit - a.profit); // Most profitable first
  }, [states, indexToChannel]);

  return {
    auctions,
    isLoading: isLoadingList || isLoadingStates,
  };
}
