"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { formatUnits, formatEther } from "viem";
import { useReadContract } from "wagmi";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TokenLogo } from "@/components/token-logo";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useProfile } from "@/hooks/useBatchProfiles";
import { useContentState } from "@/hooks/useContentState";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  MULTICALL_ABI,
  QUOTE_TOKEN_DECIMALS,
} from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS } from "@/lib/constants";
import { formatNumber, truncateAddress } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CollectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contentAddress: `0x${string}`;
  tokenId: bigint;
  epochId: bigint;
  currentPrice: bigint;
  imageUrl?: string | null;
  caption?: string | null;
  channelName?: string;
  channelLogoUrl?: string | null;
  tokenSymbol?: string;
  creatorAddress?: string;
  ownerAddress?: string;
  createdAt?: string; // Unix timestamp string
  priceUsd?: number; // Coin price in USD for revenue conversion
  onSuccess?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollectModal({
  isOpen,
  onClose,
  contentAddress,
  tokenId,
  epochId,
  currentPrice,
  imageUrl,
  caption,
  channelName = "",
  channelLogoUrl,
  tokenSymbol = "",
  creatorAddress,
  ownerAddress: ownerAddressProp,
  createdAt,
  priceUsd = 0,
  onSuccess,
}: CollectModalProps) {
  const { address: account } = useFarcaster();
  const { execute, status, error: txError, reset } = useBatchedTransaction();

  // Fetch live on-chain state for this sticker
  const { contentState } = useContentState(
    isOpen ? contentAddress : undefined,
    isOpen ? tokenId : undefined
  );

  // Resolve creator and owner profiles
  const liveCreator = contentState?.creator ?? (creatorAddress as `0x${string}`);
  const liveOwner = contentState?.owner ?? (ownerAddressProp as `0x${string}`);
  const { displayName: creatorName, avatarUrl: creatorAvatar } = useProfile(liveCreator);
  const { displayName: ownerName, avatarUrl: ownerAvatar } = useProfile(liveOwner);

  // Mining rate: rewardForDuration is per 7 days, convert to daily in coins
  const dailyMiningRate = useMemo(() => {
    if (!contentState?.rewardForDuration) return 0;
    return Number(formatEther(contentState.rewardForDuration)) / 7;
  }, [contentState?.rewardForDuration]);

  // Format created date
  const dateDisplay = useMemo(() => {
    if (!createdAt) return null;
    const ts = parseInt(createdAt);
    if (isNaN(ts)) return null;
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [createdAt]);

  // Reset on open
  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  // Auto-reset on error
  useEffect(() => {
    if (status !== "error") return;
    const isRejection =
      txError?.message?.includes("User rejected") ||
      txError?.message?.includes("User denied");
    const timer = setTimeout(() => reset(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [status, txError, reset]);

  // Use live on-chain values when available, fall back to props
  const livePrice = contentState?.price ?? currentPrice;
  const liveEpochId = contentState?.epochId ?? epochId;

  // Max price = live price (no slippage needed — Dutch auction only decays down)
  const maxPrice = livePrice;

  const currentPriceDisplay = Number(
    formatUnits(livePrice, QUOTE_TOKEN_DECIMALS)
  );

  // User USDC balance
  const { data: usdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account!],
    query: { enabled: !!account },
  });

  // USDC allowance for multicall
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;
  const { data: currentAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, multicallAddr],
    query: { enabled: !!account && maxPrice > 0n },
  });

  // Execute collect
  const handleConfirm = useCallback(async () => {
    if (!account || status === "pending" || maxPrice === 0n) return;

    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
    );

    const calls: Call[] = [];

    const needsApproval =
      currentAllowance === undefined || currentAllowance < maxPrice;
    if (needsApproval) {
      calls.push(
        encodeApproveCall(
          CONTRACT_ADDRESSES.usdc as `0x${string}`,
          multicallAddr,
          maxPrice
        )
      );
    }

    calls.push(
      encodeContractCall(multicallAddr, MULTICALL_ABI, "collect", [
        contentAddress,
        tokenId,
        liveEpochId,
        deadline,
        maxPrice,
      ])
    );

    await execute(calls);
  }, [
    account,
    maxPrice,
    contentAddress,
    tokenId,
    liveEpochId,
    execute,
    status,
    currentAllowance,
    multicallAddr,
  ]);

  // Notify parent on success
  useEffect(() => {
    if (status === "success") onSuccess?.();
  }, [status, onSuccess]);

  // Auto-close on success
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (status === "success") {
      const id = setTimeout(() => onCloseRef.current(), 2000);
      return () => clearTimeout(id);
    }
  }, [status]);

  if (!isOpen) return null;

  const isPending = status === "pending";
  const isSuccess = status === "success";
  const buttonDisabled = maxPrice === 0n || isPending;

  const errorMsg = txError
    ? (() => {
        const msg = txError?.message || "";
        if (
          msg.includes("rejected") ||
          msg.includes("denied") ||
          msg.includes("cancelled")
        )
          return "Transaction cancelled";
        if (msg.includes("insufficient")) return "Insufficient USDC balance";
        return "Something went wrong";
      })()
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Header: X | Channel logo + name + #ID */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-none hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <Link
            href={`/channel/${contentAddress}`}
            onClick={onClose}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <TokenLogo
              name={channelName || tokenSymbol}
              logoUrl={channelLogoUrl}
              size="sm"
              variant="circle"
            />
            <span className="text-[14px] font-semibold font-display">
              {channelName || tokenSymbol || "Channel"}
            </span>
            <span className="text-[14px] text-muted-foreground font-mono">
              #{tokenId.toString()}
            </span>
          </Link>
          <div className="w-9" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-hide">
          {/* Full-size image */}
          {imageUrl && (
            <div className="w-full">
              <img
                src={imageUrl}
                alt={caption || "Sticker"}
                className="w-full object-contain"
              />
            </div>
          )}

          {/* Caption */}
          {caption && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-[14px] text-foreground leading-relaxed">
                {caption}
              </p>
            </div>
          )}

          {/* Stats grid */}
          <div className="px-4 py-3 grid grid-cols-2 gap-y-4 gap-x-8">
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Mining Rate</div>
              <div className="font-semibold text-[15px] tabular-nums font-mono flex items-center gap-1.5">
                <TokenLogo name={tokenSymbol} logoUrl={channelLogoUrl} size="sm" variant="circle" />
                {dailyMiningRate > 0
                  ? `${formatNumber(dailyMiningRate)}/day`
                  : "0/day"}
              </div>
              <div className="text-[12px] text-muted-foreground font-mono tabular-nums mt-0.5">
                {dailyMiningRate > 0 && priceUsd > 0
                  ? `~$${formatNumber(dailyMiningRate * priceUsd)}/day`
                  : "~$0.00/day"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Created</div>
              <div className="font-semibold text-[15px] font-mono">
                {dateDisplay ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Creator</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Avatar className="h-4 w-4 flex-shrink-0">
                  <AvatarImage src={creatorAvatar} alt={creatorName} />
                  <AvatarFallback className="bg-zinc-700 text-white text-[7px]">
                    {liveCreator?.slice(2, 4).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-semibold truncate">{creatorName}</span>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Owner</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Avatar className="h-4 w-4 flex-shrink-0">
                  <AvatarImage src={ownerAvatar} alt={ownerName} />
                  <AvatarFallback className="bg-zinc-700 text-white text-[7px]">
                    {liveOwner?.slice(2, 4).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-semibold truncate">{ownerName}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mx-4 mt-3 px-3 py-2 rounded-none bg-zinc-800/10 border border-zinc-800/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-foreground/60 mt-0.5 flex-shrink-0" />
              <span className="text-[12px] text-foreground/60">{errorMsg}</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />
        </div>

        {/* Bottom bar: Price + Balance | Collect button */}
        <div
          className="px-4 pb-4"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
          }}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="flex items-center gap-5 shrink-0">
              <div>
                <div className="text-muted-foreground text-[12px]">Price</div>
                <div className="font-semibold text-[17px] tabular-nums font-mono">
                  {currentPriceDisplay > 0
                    ? `$${formatNumber(currentPriceDisplay)}`
                    : "Free"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[12px]">Balance</div>
                <div className="font-semibold text-[17px] tabular-nums font-mono">
                  $
                  {formatNumber(
                    usdcBalance
                      ? Number(formatUnits(usdcBalance, QUOTE_TOKEN_DECIMALS))
                      : 0
                  )}
                </div>
              </div>
            </div>

            <button
              disabled={buttonDisabled}
              onClick={handleConfirm}
              className={`flex-1 h-10 rounded-none font-semibold font-display text-[15px] transition-all flex items-center justify-center gap-2 ${
                buttonDisabled
                  ? "bg-zinc-800 text-foreground/50 cursor-not-allowed"
                  : isSuccess
                    ? "bg-white text-black"
                    : "bg-white text-black hover:bg-zinc-200"
              }`}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSuccess && <CheckCircle className="w-4 h-4" />}
              {isPending
                ? "Collecting..."
                : isSuccess
                  ? "Collected!"
                  : status === "error"
                    ? "Try Again"
                    : "Collect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
