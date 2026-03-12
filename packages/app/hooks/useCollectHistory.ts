import { useQuery } from "@tanstack/react-query";
import { getCollects, type SubgraphCollect } from "@/lib/subgraph-launchpad";

export type CollectEvent = {
  collector: string;
  prevOwner: string;
  creator: string;
  tokenId: bigint;
  epochId: bigint;
  price: bigint;           // USDC 6 decimals
  ownerFee: bigint;
  creatorFee: bigint;
  timestamp: bigint;
  txHash: string;
};

export function useCollectHistory(
  channelAddress: string | undefined,
  limit: number = 20,
) {
  const { data, isLoading } = useQuery({
    queryKey: ["collectHistory", channelAddress, limit],
    queryFn: async () => {
      const raw = await getCollects(channelAddress!, limit);
      return raw.map((d: SubgraphCollect): CollectEvent => ({
        collector: d.collector.id,
        prevOwner: d.prevOwner.id,
        creator: d.creator.id,
        tokenId: BigInt(d.tokenId),
        epochId: BigInt(d.epochId),
        price: BigInt(Math.floor(parseFloat(d.price) * 1e6)),
        ownerFee: BigInt(Math.floor(parseFloat(d.ownerFee) * 1e6)),
        creatorFee: BigInt(Math.floor(parseFloat(d.creatorFee) * 1e6)),
        timestamp: BigInt(d.timestamp),
        txHash: d.txHash,
      }));
    },
    enabled: !!channelAddress,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return { collects: data ?? [], isLoading };
}
