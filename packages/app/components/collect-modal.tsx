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
import { encodeFunctionData } from "viem";
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  MULTICALL_ABI,
  CONTENT_ABI,
  QUOTE_TOKEN_DECIMALS,
} from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

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
  isPositiveTrend?: boolean;
  isPendingApproval?: boolean; // Show Approve instead of Collect
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
  isPositiveTrend = true,
  isPendingApproval = false,
  onSuccess,
}: CollectModalProps) {
  const { address: account } = useFarcaster();
  const { execute, status, error: txError, reset } = useBatchedTransaction();
  const [pendingAction, setPendingAction] = useState<"collect" | "approve" | "surrender">("collect");

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
    if (isOpen) setPendingAction("collect");
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
  const currentReserve = contentState?.reserve ?? 0n;
  const nextReserve = contentState?.nextReserve ?? livePrice;
  const currentPremium = contentState?.premium ?? 0n;
  const isOwner = !!account && !!liveOwner && account.toLowerCase() === liveOwner.toLowerCase();

  // Max price = live price (no slippage needed — Dutch auction only decays down)
  const maxPrice = livePrice;

  const currentPriceDisplay = Number(
    formatUnits(livePrice, QUOTE_TOKEN_DECIMALS)
  );
  const reserveDisplay = Number(formatUnits(nextReserve, QUOTE_TOKEN_DECIMALS));
  const premiumDisplay = Number(formatUnits(currentPremium, QUOTE_TOKEN_DECIMALS));
  const currentReserveDisplay = Number(formatUnits(currentReserve, QUOTE_TOKEN_DECIMALS));

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

  // Execute approve (for moderators approving pending content)
  const handleApprove = useCallback(async () => {
    if (!contentAddress || tokenId === undefined) return;
    setPendingAction("approve");
    const data = encodeFunctionData({
      abi: CONTENT_ABI,
      functionName: "approveContents",
      args: [[tokenId]],
    });
    await execute([{ to: contentAddress, data, value: 0n }]);
  }, [contentAddress, tokenId, execute]);

  // Execute collect
  const handleConfirm = useCallback(async () => {
    if (!account || status === "pending") return;
    setPendingAction("collect");

    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
    );

    const calls: Call[] = [];

    const needsApproval =
      maxPrice > 0n &&
      (currentAllowance === undefined || currentAllowance < maxPrice);
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

  const handleSurrender = useCallback(async () => {
    if (!account || !isOwner || currentReserve === 0n || status === "pending") return;
    setPendingAction("surrender");
    const data = encodeFunctionData({
      abi: CONTENT_ABI,
      functionName: "surrender",
      args: [tokenId],
    });
    await execute([{ to: contentAddress, data, value: 0n }]);
  }, [account, isOwner, currentReserve, status, tokenId, contentAddress, execute]);

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
  const buttonDisabled = isPending;
  const accentButtonClass = isPositiveTrend
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : "bg-[hsl(var(--loss))] text-black hover:bg-[hsl(var(--loss)/0.9)]";
  const accentSolidClass = isPositiveTrend
    ? "bg-primary text-primary-foreground"
    : "bg-[hsl(var(--loss))] text-primary-foreground";
  const accentDisabledClass = isPositiveTrend
    ? "bg-primary text-primary-foreground/60 opacity-50 cursor-not-allowed"
    : "bg-[hsl(var(--loss))] text-primary-foreground/60 opacity-50 cursor-not-allowed";

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
    <div className="fixed inset-0 z-[220] flex h-screen w-screen items-center justify-center bg-[hsl(var(--background)/0.6)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background lg:h-auto lg:max-h-[85vh] lg:rounded-[var(--radius)] lg:glass-panel"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Header: X | Channel logo + name + #ID */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-[var(--radius)] hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
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
            <div className="w-full flex-shrink-0">
              <img
                src={imageUrl}
                alt={caption || "Sticker"}
                className="w-full max-h-[50vh] object-contain"
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
              <div className="text-muted-foreground text-[12px] mb-0.5">Collection price</div>
              <div className="font-semibold text-[15px] tabular-nums font-mono">
                ${formatNumber(currentPriceDisplay)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Refundable reserve</div>
              <div className="font-semibold text-[15px] tabular-nums font-mono">
                ${formatNumber(reserveDisplay)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Current premium</div>
              <div className="font-semibold text-[15px] tabular-nums font-mono">
                ${formatNumber(premiumDisplay)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Mining power</div>
              <div className="font-semibold text-[15px] tabular-nums font-mono">
                ${formatNumber(reserveDisplay)}
              </div>
            </div>
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
                {dateDisplay ?? "\u2014"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Creator</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Avatar className="h-4 w-4 flex-shrink-0">
                  <AvatarImage src={creatorAvatar} alt={creatorName} />
                  <AvatarFallback className="bg-[hsl(var(--surface-container-high))] text-foreground text-[7px]">
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
                  <AvatarFallback className="bg-[hsl(var(--surface-container-high))] text-foreground text-[7px]">
                    {liveOwner?.slice(2, 4).toUpperCase() ?? "??"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-semibold truncate">{ownerName}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mx-4 mt-3 px-3 py-2 rounded-[var(--radius)] bg-[hsl(var(--surface-container)/0.1)] border border-[hsl(var(--surface-container)/0.2)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-foreground/60 mt-0.5 flex-shrink-0" />
              <span className="text-[12px] text-foreground/60">{errorMsg}</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />
        </div>

        {/* Bottom bar: Price + Balance | Collect button */}
        <div
          className="px-4 pt-3 pb-4 flex-shrink-0"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          <div className="flex items-center gap-4 w-full">
            <div className="flex items-center gap-5 shrink-0">
              <div>
                <div className="text-muted-foreground text-[12px]">Price</div>
                <div className="font-semibold text-[17px] tabular-nums font-mono">
                  {currentPriceDisplay > 0
                    ? `$${formatNumber(currentPriceDisplay)}`
                    : "$0"}
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

            {isPendingApproval ? (
              <button
                disabled={isPending}
                onClick={handleApprove}
                className={`flex-1 h-10 font-semibold font-display text-[15px] rounded-[var(--radius)] transition-all flex items-center justify-center gap-2 ${
                  isPending ? accentDisabledClass : isSuccess ? accentSolidClass : accentButtonClass
                }`}
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSuccess && <CheckCircle className="w-4 h-4" />}
                {isPending && pendingAction === "approve" ? "Approving..." : isSuccess && pendingAction === "approve" ? "Approved!" : status === "error" && pendingAction === "approve" ? "Try Again" : "Approve"}
              </button>
            ) : (
              <button
                disabled={buttonDisabled}
                onClick={handleConfirm}
                className={`flex-1 h-10 font-semibold font-display text-[15px] rounded-[var(--radius)] transition-all flex items-center justify-center gap-2 ${
                  buttonDisabled
                    ? accentDisabledClass
                    : isSuccess
                      ? accentSolidClass
                      : accentButtonClass
                }`}
              >
                {isPending && pendingAction === "collect" && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSuccess && pendingAction === "collect" && <CheckCircle className="w-4 h-4" />}
                {isPending && pendingAction === "collect"
                  ? "Collecting..."
                  : isSuccess && pendingAction === "collect"
                    ? "Collected!"
                    : status === "error" && pendingAction === "collect"
                      ? "Try Again"
                      : "Collect"}
              </button>
            )}
          </div>
          {isOwner && currentReserve > 0n && !isPendingApproval && (
            <div className="mt-3">
              <button
                disabled={isPending}
                onClick={handleSurrender}
                className="w-full h-9 rounded-[var(--radius)] border border-foreground/15 text-[13px] font-semibold hover:bg-foreground/5 disabled:opacity-50"
              >
                {isPending && pendingAction === "surrender"
                  ? "Surrendering..."
                  : isSuccess && pendingAction === "surrender"
                    ? "Reserve recovered"
                    : "Surrender Sticker"}
              </button>
              <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
                Burn this Sticker and recover its ${formatNumber(currentReserveDisplay)} refundable reserve after the 24-hour cooldown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
