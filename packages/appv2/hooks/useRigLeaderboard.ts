import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getCollects, type SubgraphCollect } from "@/lib/subgraph-launchpad";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardEntry = {
  donor: string;
  donated: bigint;
  // Extended fields used by the Leaderboard component
  rank: number;
  address: string;
  donatedFormatted: string;
  spent: bigint;
  spentFormatted: string;
  earnedFormatted: string;
  isCurrentUser: boolean;
  isFriend: boolean;
  profile: {
    displayName?: string;
    username?: string;
    pfpUrl?: string;
  } | null;
};

// ---------------------------------------------------------------------------
// Aggregate donations by donor to build a leaderboard
// ---------------------------------------------------------------------------

function aggregateDonors(
  collects: SubgraphCollect[],
  account: string | undefined,
  limit: number
): LeaderboardEntry[] {
  const donorMap = new Map<string, { donated: number }>();

  for (const d of collects) {
    const donorId = d.collector.id.toLowerCase();
    const prev = donorMap.get(donorId) ?? { donated: 0 };
    prev.donated += parseFloat(d.price);
    donorMap.set(donorId, prev);
  }

  // Sort by total donated descending
  const sorted = [...donorMap.entries()]
    .sort((a, b) => b[1].donated - a[1].donated)
    .slice(0, limit);

  return sorted.map(([addr, stats], index) => {
    const donated = BigInt(Math.floor(stats.donated * 1e6));
    const donatedNum = Number(formatUnits(donated, 6));
    return {
      donor: addr,
      donated,
      rank: index + 1,
      address: addr,
      donatedFormatted: `$${donatedNum >= 1_000
        ? `${(donatedNum / 1_000).toFixed(1)}K`
        : donatedNum.toFixed(2)}`,
      spent: donated,
      spentFormatted: `$${donatedNum.toFixed(2)}`,
      earnedFormatted: "",
      isCurrentUser: account
        ? addr.toLowerCase() === account.toLowerCase()
        : false,
      isFriend: false,
      profile: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRigLeaderboard(
  channelAddress: string | undefined,
  account: string | undefined,
  limit: number = 10,
): {
  entries: LeaderboardEntry[] | undefined;
  userRank: number | undefined;
  isLoading: boolean;
} {
  const {
    data: raw,
    isLoading,
  } = useQuery({
    queryKey: ["channelLeaderboard", channelAddress, limit],
    queryFn: () => getCollects(channelAddress!, 1000),
    enabled: !!channelAddress,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const entries = useMemo(() => raw ? aggregateDonors(raw, account, limit) : undefined, [raw, account, limit]);

  // Compute user rank from the leaderboard data
  const userRank = useMemo(() =>
    account && entries
      ? (() => {
          const idx = entries.findIndex(
            (e: LeaderboardEntry) => e.donor.toLowerCase() === account.toLowerCase()
          );
          return idx >= 0 ? idx + 1 : undefined;
        })()
      : undefined,
    [account, entries]
  );

  return {
    entries,
    userRank,
    isLoading,
  };
}
