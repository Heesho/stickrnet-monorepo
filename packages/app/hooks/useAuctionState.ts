import { useReadContract, useReadContracts } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type AuctionState,
} from "@/lib/contracts";

export function useAuctionState(
  channelAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
) {
  const { data: rawAuctionState, refetch, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getAuctionState",
    args: channelAddress ? [channelAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!channelAddress,
      refetchInterval: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const auctionState = rawAuctionState as AuctionState | undefined;

  return {
    auctionState,
    refetch,
    isLoading,
    error,
  };
}

export type AuctionListItem = {
  channelAddress: `0x${string}`;
  auctionState: AuctionState;
  profitLoss: bigint; // Quote value - LP cost in USDC equivalent
  isProfitable: boolean;
};

export function useAllAuctionStates(
  channelAddresses: `0x${string}`[],
  account: `0x${string}` | undefined,
) {
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;
  const contracts = channelAddresses.map((address) => ({
    address: multicallAddr,
    abi: MULTICALL_ABI,
    functionName: "getAuctionState" as const,
    args: [address, account ?? zeroAddress] as const,
    chainId: base.id,
  }));

  const { data: states, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: channelAddresses.length > 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const auctionItems: AuctionListItem[] = (states ?? [])
    .map((result, index) => {
      const state = result.result as AuctionState | undefined;
      if (!state) return null;

      const lpCostInQuote =
        (state.price * state.paymentTokenPrice) / BigInt(1e18);
      const lpCostScaled = lpCostInQuote / BigInt(1e12);
      const profitLoss = state.quoteAccumulated - lpCostScaled;
      const isProfitable = profitLoss > 0n;

      return {
        channelAddress: channelAddresses[index],
        auctionState: state,
        profitLoss,
        isProfitable,
      };
    })
    .filter((item): item is AuctionListItem => item !== null);

  // Sort by profitability (most profitable first)
  auctionItems.sort((a, b) => {
    if (a.profitLoss > b.profitLoss) return -1;
    if (a.profitLoss < b.profitLoss) return 1;
    return 0;
  });

  return {
    auctions: auctionItems,
    isLoading,
    error,
    refetch,
  };
}
