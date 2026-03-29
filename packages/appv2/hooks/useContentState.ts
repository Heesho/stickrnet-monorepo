import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, type ContentState } from "@/lib/contracts";

export function useContentState(
  contentAddress: `0x${string}` | undefined,
  tokenId: bigint | undefined,
) {
  const { data, refetch, isLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.multicall as `0x${string}`,
    abi: MULTICALL_ABI,
    functionName: "getContentState",
    args: contentAddress && tokenId !== undefined ? [contentAddress, tokenId] : undefined,
    chainId: base.id,
    query: {
      enabled: !!contentAddress && tokenId !== undefined,
      refetchInterval: 5_000,
    },
  });

  return {
    contentState: data as ContentState | undefined,
    refetch,
    isLoading,
  };
}
