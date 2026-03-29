"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Medal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaderboardEntry } from "@/hooks/useRigLeaderboard";

type LeaderboardProps = {
  entries: LeaderboardEntry[];
  userRank: number | null;
  tokenSymbol: string;
  tokenName: string;
  channelUrl: string;
  isLoading?: boolean;
};

function LeaderboardShell({ children }: { children: React.ReactNode }) {
  return <div className="slab-panel mb-6 px-3 py-4">{children}</div>;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-4 w-4 text-primary" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-loss" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-muted-foreground" />;
  return <span className="w-4 text-center text-xs text-muted-foreground">#{rank}</span>;
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const displayName = entry.profile?.displayName
    ?? entry.profile?.username
    ?? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;

  const avatarUrl = entry.profile?.pfpUrl
    ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${entry.address.toLowerCase()}`;

  return (
    <div className="flex items-center gap-2.5 px-0 py-2.5">
      {/* Rank */}
      <div className="w-6 flex justify-center flex-shrink-0">
        {getRankIcon(entry.rank)}
      </div>

      {/* Avatar */}
      <Avatar className="h-7 w-7 flex-shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback className="text-[10px]">
          {entry.address.slice(2, 4).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "truncate text-[13px]",
            entry.isCurrentUser && "font-semibold text-primary",
            entry.isFriend && !entry.isCurrentUser && "text-muted-foreground"
          )}>
            {displayName}
          </span>
          {entry.isCurrentUser && (
            <span className="border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] bg-[hsl(var(--foreground)/0.04)] px-1.5 py-0.5 text-[10px] tracking-[0.02em] text-primary">You</span>
          )}
          {entry.isFriend && !entry.isCurrentUser && (
            <Users className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Funded amount */}
      <div className="text-right flex-shrink-0">
        <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Funded</div>
        <div className="mt-0.5 text-[12px] font-medium font-mono tabular-nums">{entry.donatedFormatted}</div>
      </div>
    </div>
  );
}

export function Leaderboard({
  entries,
  userRank,
  isLoading,
}: LeaderboardProps) {
  if (isLoading) {
    return (
      <LeaderboardShell>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold font-display tracking-[-0.02em]">Leaderboard</h2>
          <div className="mt-0.5 text-[12px] text-muted-foreground">Top supporters ranked by total contribution</div>
        </div>
        <div className="ledger-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-11 animate-pulse bg-transparent" />
          ))}
        </div>
      </LeaderboardShell>
    );
  }

  if (entries.length === 0) {
    return (
      <LeaderboardShell>
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold font-display tracking-[-0.02em]">Leaderboard</h2>
          <div className="text-[12px] text-muted-foreground mt-0.5">Top supporters ranked by total contribution</div>
        </div>
        <div className="text-center py-4 text-muted-foreground text-[13px]">
          No supporters yet
        </div>
      </LeaderboardShell>
    );
  }

  return (
    <LeaderboardShell>
      <div className="mb-3">
        <h2 className="text-[18px] font-semibold font-display tracking-[-0.02em]">Leaderboard</h2>
        <div className="text-[12px] text-muted-foreground mt-0.5">Top supporters ranked by total contribution</div>
      </div>

      {/* User rank summary if not in top entries */}
      {userRank && userRank > entries.length && (
        <div className="slab-inset mb-3 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your rank</span>
            <span className="text-sm font-semibold text-primary">#{userRank}</span>
          </div>
        </div>
      )}

      <div className="ledger-list">
        {entries.map((entry) => (
          <LeaderboardRow key={entry.address} entry={entry} />
        ))}
      </div>
    </LeaderboardShell>
  );
}
