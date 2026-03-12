"use client";

import { memo } from "react";
import { formatUnits } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useBatchProfiles";
import { viewProfile } from "@/hooks/useFarcaster";
import type { CollectEvent } from "@/hooks/useCollectHistory";

type CollectHistoryItemProps = {
  collect: CollectEvent;
  timeAgo: (ts: number) => string;
  tokenSymbol?: string;
  isNew?: boolean;
};

export const CollectHistoryItem = memo(function CollectHistoryItem({
  collect,
  timeAgo,
  tokenSymbol = "TOKEN",
  isNew,
}: CollectHistoryItemProps) {
  const { displayName, avatarUrl, fid } = useProfile(collect.collector);

  const handleProfileClick = () => {
    if (fid) viewProfile(fid);
  };

  const price = Number(formatUnits(collect.price, 6));
  const ownerFee = Number(formatUnits(collect.ownerFee, 6));
  const creatorFee = Number(formatUnits(collect.creatorFee, 6));

  return (
    <div
      className={`flex items-center gap-3 py-3 rounded-none transition-colors duration-1000 ${
        isNew ? "bg-zinc-800/50 px-2 -mx-2" : ""
      }`}
    >
      <button
        onClick={handleProfileClick}
        disabled={!fid}
        className={fid ? "cursor-pointer" : "cursor-default"}
      >
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-zinc-800 text-white text-xs">
            {collect.collector.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleProfileClick}
            disabled={!fid}
            className={`text-sm font-medium truncate ${fid ? "hover:text-foreground/70 cursor-pointer" : "cursor-default"}`}
          >
            {displayName}
          </button>
          <span className="text-xs text-foreground/50">{timeAgo(Number(collect.timestamp))}</span>
        </div>
        <div className="text-xs text-foreground/60 mt-0.5">
          Collected #{collect.tokenId.toString()}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0 text-right">
        <div>
          <div className="text-[12px] text-muted-foreground">Price</div>
          <div className="text-[13px] font-medium font-mono tabular-nums">${price.toFixed(2)}</div>
        </div>
        {(ownerFee > 0 || creatorFee > 0) && (
          <div>
            <div className="text-[12px] text-muted-foreground">Fees</div>
            <div className="text-[13px] font-medium font-mono tabular-nums">
              ${(ownerFee + creatorFee).toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
