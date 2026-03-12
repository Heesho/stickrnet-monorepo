"use client";

import { useMemo } from "react";
import { formatUnits, formatEther } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useBatchProfiles";
import { useContentState } from "@/hooks/useContentState";
import { QUOTE_TOKEN_DECIMALS } from "@/lib/contracts";
import { truncateAddress } from "@/lib/format";
import type { SubgraphContentPosition } from "@/lib/subgraph-launchpad";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContentCardProps = {
  content: SubgraphContentPosition;
  channelAddress: `0x${string}`;
  onCollect?: (tokenId: bigint, epochId: bigint, currentPrice: bigint) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContentCard({ content, channelAddress, onCollect }: ContentCardProps) {
  const tokenId = BigInt(content.tokenId);
  const { contentState, isLoading } = useContentState(channelAddress, tokenId);

  const { displayName: creatorName, avatarUrl: creatorAvatar } = useProfile(content.creator.id);
  const { displayName: ownerName } = useProfile(content.owner.id);

  // Current Dutch auction price (live from on-chain)
  const currentPrice = contentState?.price ?? 0n;
  const currentPriceDisplay = Number(formatUnits(currentPrice, QUOTE_TOKEN_DECIMALS));

  // Stake amount
  const stake = contentState?.stake ?? BigInt(Math.floor(parseFloat(content.stake) * 1e18));
  const stakeDisplay = Number(formatEther(stake));

  // Epoch countdown (if auction is active)
  const epochId = contentState?.epochId ?? BigInt(content.epochId);

  // Content URI preview
  const contentUri = content.uri;
  const isIpfs = contentUri.startsWith("ipfs://");
  const displayUri = isIpfs
    ? `ipfs://...${contentUri.slice(-8)}`
    : contentUri.length > 40
    ? `${contentUri.slice(0, 30)}...${contentUri.slice(-8)}`
    : contentUri;

  const handleCollect = () => {
    if (onCollect && contentState) {
      onCollect(tokenId, epochId, currentPrice);
    }
  };

  return (
    <div className="border-b border-border py-4">
      {/* Creator row */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="h-6 w-6 flex-shrink-0">
          <AvatarImage src={creatorAvatar} alt={creatorName} />
          <AvatarFallback className="bg-zinc-800 text-white text-[9px]">
            {content.creator.id.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-[13px] font-medium truncate">{creatorName}</span>
        <span className="text-[11px] text-muted-foreground">created</span>
        <span className="text-[11px] text-muted-foreground font-mono">#{content.tokenId}</span>
      </div>

      {/* Content URI */}
      <div className="mb-3">
        <a
          href={contentUri.startsWith("ipfs://")
            ? `https://gateway.pinata.cloud/ipfs/${contentUri.slice(7)}`
            : contentUri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-foreground/60 font-mono hover:text-foreground/70 transition-colors break-all"
        >
          {displayUri}
        </a>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Current price */}
          <div>
            <div className="text-[11px] text-muted-foreground">Price</div>
            <div className="text-[13px] font-medium font-mono tabular-nums">
              {isLoading ? "..." : `$${currentPriceDisplay.toFixed(2)}`}
            </div>
          </div>

          {/* Stake */}
          <div>
            <div className="text-[11px] text-muted-foreground">Stake</div>
            <div className="text-[13px] font-medium font-mono tabular-nums">
              {stakeDisplay >= 1000
                ? `${(stakeDisplay / 1000).toFixed(1)}K`
                : stakeDisplay.toFixed(0)}
            </div>
          </div>

          {/* Owner */}
          <div>
            <div className="text-[11px] text-muted-foreground">Owner</div>
            <div className="text-[13px] font-medium font-mono tabular-nums">
              {ownerName || truncateAddress(content.owner.id)}
            </div>
          </div>
        </div>

        {/* Collect button */}
        {onCollect && (
          <button
            onClick={handleCollect}
            disabled={isLoading || currentPrice === 0n}
            className={`px-4 py-1.5 rounded-none text-[12px] font-semibold font-display transition-all ${
              isLoading || currentPrice === 0n
                ? "bg-zinc-800 text-foreground/50 cursor-not-allowed"
                : "bg-white text-black hover:bg-zinc-200"
            }`}
          >
            Collect
          </button>
        )}
      </div>

      {/* Approval status for moderated channels */}
      {!content.isApproved && (
        <div className="mt-2 px-2 py-1 bg-zinc-800 rounded-none">
          <span className="text-[11px] text-foreground/50">Pending approval</span>
        </div>
      )}
    </div>
  );
}
