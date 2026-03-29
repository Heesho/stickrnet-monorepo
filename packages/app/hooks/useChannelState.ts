import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type FundraiserState,
  type ClaimableEpoch,
} from "@/lib/contracts";

export function useChannelState(
  channelAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
  enabled: boolean = true,
  refetchInterval: number = 5_000,
) {
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;

  const { data: rawState, refetch, isLoading } = useReadContract({
    address: multicallAddr,
    abi: MULTICALL_ABI,
    functionName: "getFundraiser",
    args: channelAddress ? [channelAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!channelAddress && enabled,
      refetchInterval,
    },
  });

  const channelState = rawState as FundraiserState | undefined;
  const currentEpoch = channelState?.currentEpoch ?? 0n;

  // Fetch claimable epochs (from epoch 0 to currentEpoch)
  const { data: rawClaimable } = useReadContract({
    address: multicallAddr,
    abi: MULTICALL_ABI,
    functionName: "getClaimableEpochs",
    args: channelAddress && account
      ? [channelAddress, account, 0n, currentEpoch]
      : undefined,
    chainId: base.id,
    query: {
      enabled: !!channelAddress && !!account && currentEpoch > 0n && enabled,
      refetchInterval: 10_000,
    },
  });

  // Fetch total pending rewards
  const { data: rawPending } = useReadContract({
    address: multicallAddr,
    abi: MULTICALL_ABI,
    functionName: "getTotalPendingRewards",
    args: channelAddress && account
      ? [channelAddress, account, 0n, currentEpoch]
      : undefined,
    chainId: base.id,
    query: {
      enabled: !!channelAddress && !!account && currentEpoch > 0n && enabled,
      refetchInterval: 10_000,
    },
  });

  const claimableEpochs = (rawClaimable as ClaimableEpoch[] | undefined)
    ?.filter(d => !d.hasClaimed && d.pendingReward > 0n) ?? [];

  // rawPending is a tuple: [totalPending, unclaimedDays[]]
  const totalPending = rawPending
    ? (rawPending as [bigint, bigint[]])[0]
    : 0n;

  return {
    channelState,
    claimableEpochs,
    totalPending,
    refetch,
    isLoading,
  };
}
