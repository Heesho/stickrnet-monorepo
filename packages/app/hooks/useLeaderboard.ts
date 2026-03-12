import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { getChannelAccounts, type SubgraphChannelAccount } from "@/lib/subgraph-launchpad";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardEntry = {
  rank: number;
  address: string;
  collectCount: number;
  collectSpent: bigint;
  collectSpentFormatted: string;
  ownerEarned: bigint;
  ownerEarnedFormatted: string;
  creatorEarned: bigint;
  creatorEarnedFormatted: string;
  staked: bigint;
  rewardsClaimed: bigint;
  isCurrentUser: boolean;
  isFriend: boolean;
  profile: {
    displayName?: string;
    username?: string;
    pfpUrl?: string;
  } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsdAmount(amount: bigint): string {
  const num = Number(formatUnits(amount, 6));
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return `$${num.toFixed(2)}`;
}

function mapAccountToEntry(
  acct: SubgraphChannelAccount,
  index: number,
  currentAccount: string | undefined,
): LeaderboardEntry {
  const collectSpent = BigInt(Math.floor(parseFloat(acct.collectSpent) * 1e6));
  const ownerEarned = BigInt(Math.floor(parseFloat(acct.ownerEarned) * 1e6));
  const creatorEarned = BigInt(Math.floor(parseFloat(acct.creatorEarned) * 1e6));
  const staked = BigInt(Math.floor(parseFloat(acct.staked) * 1e18));
  const rewardsClaimed = BigInt(Math.floor(parseFloat(acct.rewardsClaimed) * 1e18));
  const addr = acct.account.id.toLowerCase();

  return {
    rank: index + 1,
    address: addr,
    collectCount: parseInt(acct.collectCount) || 0,
    collectSpent,
    collectSpentFormatted: formatUsdAmount(collectSpent),
    ownerEarned,
    ownerEarnedFormatted: formatUsdAmount(ownerEarned),
    creatorEarned,
    creatorEarnedFormatted: formatUsdAmount(creatorEarned),
    staked,
    rewardsClaimed,
    isCurrentUser: currentAccount
      ? addr === currentAccount.toLowerCase()
      : false,
    isFriend: false,
    profile: null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLeaderboard(
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
    queryFn: () => getChannelAccounts(channelAddress!, limit, "collectSpent"),
    enabled: !!channelAddress,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const entries = useMemo(
    () => raw?.map((acct, i) => mapAccountToEntry(acct, i, account)),
    [raw, account],
  );

  // Compute user rank from the leaderboard data
  const userRank = useMemo(() =>
    account && entries
      ? (() => {
          const idx = entries.findIndex(
            (e: LeaderboardEntry) => e.address.toLowerCase() === account.toLowerCase()
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
