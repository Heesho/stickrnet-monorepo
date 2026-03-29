"use client";

import { memo } from "react";
import { formatUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useBatchProfiles";
import { viewProfile } from "@/hooks/useFarcaster";
import { formatNumber } from "@/lib/format";
import { TokenLogo } from "@/components/token-logo";

type DonationHistoryItemProps = {
  donation: {
    id: string;
    donor: string;
    uri?: string;
    amount: bigint;
    estimatedTokens: bigint;
    timestamp: number;
  };
  timeAgo: (ts: number) => string;
  tokenSymbol?: string;
  logoUrl?: string;
  isNew?: boolean;
};

export const DonationHistoryItem = memo(function DonationHistoryItem({
  donation,
  timeAgo,
  tokenSymbol = "TOKEN",
  logoUrl,
  isNew,
}: DonationHistoryItemProps) {
  const { displayName, avatarUrl, fid } = useProfile(donation.donor);

  const handleProfileClick = () => {
    if (fid) viewProfile(fid);
  };

  const amount = Number(formatUnits(donation.amount, 6));
  const tokens = Number(formatUnits(donation.estimatedTokens, 18));

  return (
    <div
      className={`grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-2.5 px-0 py-2 transition-colors duration-1000 ${
        isNew ? "light-leak animate-bump-in" : ""
      }`}
    >
      <button
        onClick={handleProfileClick}
        disabled={!fid}
        className={fid ? "cursor-pointer" : "cursor-default"}
      >
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="text-xs">
            {donation.donor.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>

      <div className="flex-1 min-w-0">
        <div className="truncate text-[13px] font-medium leading-tight">
          <button
            onClick={handleProfileClick}
            disabled={!fid}
            className={`truncate ${fid ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
          >
            {displayName}
          </button>
        </div>
        <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
          {donation.uri ? `${donation.uri} • ${timeAgo(donation.timestamp)}` : timeAgo(donation.timestamp)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3.5 flex-shrink-0 text-right">
        <div className="min-w-[52px]">
          <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Funded</div>
          <div className="mt-0.5 text-[12px] font-medium font-mono tabular-nums">${amount.toFixed(2)}</div>
        </div>
        <div className="min-w-[60px]">
          <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Mining</div>
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[12px] font-medium font-mono tabular-nums">
            <TokenLogo name={tokenSymbol} logoUrl={logoUrl} size="xs" variant="circle" />
            {formatNumber(tokens, 0)}
          </div>
        </div>
      </div>
    </div>
  );
});
