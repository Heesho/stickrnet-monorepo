import { useQuery } from "@tanstack/react-query";
import { getCollects, type SubgraphCollect } from "@/lib/subgraph-launchpad";

export type DonationEvent = {
  donor: string;
  day: bigint;
  amount: bigint;           // USDC 6 decimals
  uri: string;
  recipientAmount: bigint;  // USDC 6 decimals
  timestamp: bigint;
  txHash: string;
};

export function useFundHistory(
  channelAddress: string | undefined,
  limit: number = 20,
) {
  const { data, isLoading } = useQuery({
    queryKey: ["fundHistory", channelAddress, limit],
    queryFn: async () => {
      const raw = await getCollects(channelAddress!, limit);
      return raw.map((d: SubgraphCollect): DonationEvent => ({
        donor: d.collector.id,
        day: BigInt(Math.floor(parseInt(d.timestamp) / 86400)),
        amount: BigInt(Math.floor(parseFloat(d.price) * 1e6)),
        uri: "",
        recipientAmount: BigInt(Math.floor(parseFloat(d.creatorFee) * 1e6)),
        timestamp: BigInt(d.timestamp),
        txHash: d.txHash,
      }));
    },
    enabled: !!channelAddress,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return { donations: data ?? [], isLoading };
}
