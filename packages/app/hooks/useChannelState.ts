import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { zeroAddress } from "viem";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  type CoinState,
} from "@/lib/contracts";

export function useChannelState(
  contentAddress: `0x${string}` | undefined,
  account: `0x${string}` | undefined,
  enabled: boolean = true,
  refetchInterval: number = 5_000,
) {
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;

  const { data: rawState, refetch, isLoading } = useReadContract({
    address: multicallAddr,
    abi: MULTICALL_ABI,
    functionName: "getCoinState",
    args: contentAddress ? [contentAddress, account ?? zeroAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress && enabled,
      refetchInterval,
    },
  });

  const coinState = rawState as CoinState | undefined;

  return {
    coinState,
    refetch,
    isLoading,
  };
}
