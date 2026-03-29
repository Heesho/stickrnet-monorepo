import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type CoinState,
} from "@/lib/contracts";

export function useChannelState(
  channelAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
  enabled: boolean = true,
  refetchInterval: number = 5_000,
) {
  const { data: rawState, refetch, isLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getCoinState",
    args: channelAddress ? [channelAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!channelAddress && enabled,
      refetchInterval,
    },
  });

  const channelState = rawState as CoinState | undefined;

  return {
    channelState,
    claimableEpochs: [] as { pendingReward: bigint; hasClaimed: boolean }[],
    totalPending: 0n,
    refetch,
    isLoading,
  };
}
