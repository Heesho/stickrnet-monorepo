"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Medal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { composeCast } from "@/hooks/useFarcaster";

type LeaderboardProps = {
  entries: LeaderboardEntry[];
  userRank: number | null;
  tokenSymbol: string;
  tokenName: string;
  channelUrl: string;
  isLoading?: boolean;
};

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-foreground" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-foreground/70" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-foreground/60" />;
  return <span className="w-4 text-center text-xs text-foreground/50">#{rank}</span>;
}

function LeaderboardRow({ entry, tokenSymbol }: { entry: LeaderboardEntry; tokenSymbol: string }) {
  const displayName = entry.profile?.displayName
    ?? entry.profile?.username
    ?? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;

  const avatarUrl = entry.profile?.pfpUrl
    ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${entry.address.toLowerCase()}`;

  return (
    <div className="flex items-center gap-3 py-3">
      {/* Rank */}
      <div className="w-6 flex justify-center flex-shrink-0">
        {getRankIcon(entry.rank)}
      </div>

      {/* Avatar */}
      <Avatar className="h-7 w-7 flex-shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback className="bg-zinc-800 text-white text-[10px]">
          {entry.address.slice(2, 4).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-sm truncate",
            entry.isCurrentUser && "font-semibold text-white",
            entry.isFriend && !entry.isCurrentUser && "text-foreground/70"
          )}>
            {displayName}
          </span>
          {entry.isCurrentUser && (
            <span className="text-[10px] bg-zinc-800 text-foreground/70 px-1.5 py-0.5 rounded-full">You</span>
          )}
          {entry.isFriend && !entry.isCurrentUser && (
            <Users className="w-3 h-3 text-foreground/60" />
          )}
        </div>
      </div>

      {/* Spent + Collects */}
      <div className="text-right flex-shrink-0">
        <div className="text-[12px] text-muted-foreground">Spent</div>
        <div className="text-[13px] font-medium font-mono tabular-nums">{entry.collectSpentFormatted}</div>
      </div>
      <div className="text-right flex-shrink-0 min-w-[40px]">
        <div className="text-[12px] text-muted-foreground">Collects</div>
        <div className="text-[13px] font-medium font-mono tabular-nums">{entry.collectCount}</div>
      </div>
    </div>
  );
}

export function Leaderboard({
  entries,
  userRank,
  tokenSymbol,
  tokenName,
  channelUrl,
  isLoading,
}: LeaderboardProps) {
  const handleShareChallenge = async () => {
    if (!userRank) return;

    const text = `I'm ranked #${userRank} on the ${tokenName} ($${tokenSymbol}) collector leaderboard on Stickrnet! Join me`;

    await composeCast({
      text,
      embeds: [channelUrl],
    });
  };

  if (isLoading) {
    return (
      <div className="mt-6">
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold font-display">Leaderboard</h2>
          <div className="text-[12px] text-muted-foreground mt-0.5">Top collectors ranked by total spend</div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-background/30 rounded-none animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mt-6">
        <div className="mb-3">
          <h2 className="text-[18px] font-semibold font-display">Leaderboard</h2>
          <div className="text-[12px] text-muted-foreground mt-0.5">Top collectors ranked by total spend</div>
        </div>
        <div className="text-center py-4 text-muted-foreground text-[13px]">
          No collectors yet
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3">
        <h2 className="text-[18px] font-semibold font-display">Leaderboard</h2>
        <div className="text-[12px] text-muted-foreground mt-0.5">Top collectors ranked by total spend</div>
      </div>

      {/* User rank summary if not in top entries */}
      {userRank && userRank > entries.length && (
        <div className="mb-3 p-2.5 rounded-none bg-zinc-800 border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground/60">Your rank</span>
            <span className="text-sm font-semibold text-white">#{userRank}</span>
          </div>
        </div>
      )}

      <div>
        {entries.map((entry) => (
          <LeaderboardRow key={entry.address} entry={entry} tokenSymbol={tokenSymbol} />
        ))}
      </div>
    </div>
  );
}
