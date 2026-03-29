"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { useAuctionState } from "@/hooks/useAuctionState";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import { useFarcaster } from "@/hooks/useFarcaster";
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  MULTICALL_ABI,
  QUOTE_TOKEN_DECIMALS,
} from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS } from "@/lib/constants";
import { formatPrice, formatTokenAmount } from "@/lib/format";

type AuctionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  channelAddress: `0x${string}`;
  tokenSymbol: string;
  colorPositive?: boolean;
};

export function AuctionModal({
  isOpen,
  onClose,
  channelAddress,
  tokenSymbol,
  colorPositive = true,
}: AuctionModalProps) {
  const { address: account } = useFarcaster();
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;

  const { auctionState, isLoading, refetch: refetchAuction } = useAuctionState(
    channelAddress,
    account
  );

  const { execute, status, error, reset } = useBatchedTransaction();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Allowance check — skip approve when sufficient
  const lpTokenAddress = auctionState?.paymentToken;
  const auctionPrice = auctionState?.price ?? 0n;
  const { data: currentAllowance } = useReadContract({
    address: lpTokenAddress!,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, multicallAddr],
    query: {
      enabled: !!account && !!lpTokenAddress && auctionPrice > 0n,
    },
  });

  // Lock scroll and restore position when modal opens (useLayoutEffect to run before paint)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    // Restore scroll position synchronously (browser may have jumped)
    window.scrollTo(0, scrollY);
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Reset transaction state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  // Auto-reset on error (fast for user rejection, slower for real errors)
  useEffect(() => {
    if (status !== "error") return;
    const isRejection = error?.message?.includes("User rejected") || error?.message?.includes("User denied");
    const timer = setTimeout(() => reset(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [status, error, reset]);

  // Auto-refetch and close after successful tx
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        refetchAuction();
        onCloseRef.current();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, refetchAuction]);

  // Derived display values
  const lpPrice = auctionState ? Number(formatEther(auctionState.price)) : 0;
  const userLpBalance = auctionState ? Number(formatEther(auctionState.accountPaymentTokenBalance)) : 0;
  const treasuryUsdc = auctionState ? Number(formatUnits(auctionState.quoteAccumulated, QUOTE_TOKEN_DECIMALS)) : 0;
  const lpCostUsd = useMemo(() => {
    if (!auctionState) return 0;

    const lpCostInQuote = (auctionState.price * auctionState.paymentTokenPrice) / (10n ** 18n);
    const lpCostScaled = lpCostInQuote / (10n ** 12n);

    return Number(formatUnits(lpCostScaled, QUOTE_TOKEN_DECIMALS));
  }, [auctionState]);

  const hasEnoughLp = auctionState
    ? auctionState.price === 0n || auctionState.accountPaymentTokenBalance >= auctionState.price
    : false;

  const isAuctionActive = auctionState
    ? auctionState.startTime > 0n
    : false;

  // Buy handler -- approve LP token then call buy on multicall
  const handleBuy = useCallback(async () => {
    if (!auctionState || !account) return;

    const calls: Call[] = [];
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
    );

    // Approve LP token spending (skip if price is 0 or allowance is sufficient)
    const needsApproval = auctionState.price > 0n && (currentAllowance === undefined || currentAllowance < auctionState.price);
    if (needsApproval) {
      calls.push(
        encodeApproveCall(
          auctionState.paymentToken,
          multicallAddr,
          auctionState.price
        )
      );
    }

    // Buy call: buy(channel, epochId, deadline, maxPaymentTokenAmount)
    calls.push(
      encodeContractCall(
        multicallAddr,
        MULTICALL_ABI,
        "buy",
        [channelAddress, auctionState.epochId, deadline, auctionState.price],
        0n
      )
    );

    await execute(calls);
  }, [auctionState, account, multicallAddr, channelAddress, execute, currentAllowance]);

  if (!isOpen) return null;

  const isPending = status === "pending";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden overscroll-none bg-[hsl(var(--background)/0.6)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`${colorPositive ? "signal-theme-positive signal-theme-positive" : "signal-theme-negative"} relative flex w-full max-w-[520px] flex-col h-full lg:h-auto lg:max-h-[90vh] lg:rounded-[var(--radius)] bg-background lg:glass-panel`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={onClose}
            className="border border-[hsl(var(--foreground)/0.1)] rounded-full -ml-2 p-2 transition-colors hover:bg-[hsl(var(--foreground)/0.08)]"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold font-display">Auction</span>
          <div className="w-9" />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (
            <>
              {/* Title */}
              <div className="mt-4 mb-6">
                <h1 className="text-2xl font-semibold font-display tracking-tight">
                  Buy USDC
                </h1>
                <p className="text-[13px] text-muted-foreground mt-1 font-mono tabular-nums">
                  {formatTokenAmount(userLpBalance)} {tokenSymbol}-USDC LP available
                </p>
              </div>

              {/* You Pay */}
              <div className="slab-inset px-3 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground font-display">You pay</span>
                  <span className="text-lg font-semibold font-mono tabular-nums">
                    {isAuctionActive ? `${formatTokenAmount(lpPrice)} LP` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground">{tokenSymbol}-USDC LP</span>
                  {isAuctionActive && auctionState && (
                    <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      ~{formatPrice(lpCostUsd)}
                    </span>
                  )}
                </div>
              </div>

              {/* You Receive */}
              <div className="slab-inset mt-2 px-3 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground font-display">You receive</span>
                  <span className="text-lg font-semibold font-mono tabular-nums">
                    {isAuctionActive ? `$${treasuryUsdc.toFixed(2)}` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground">USDC</span>
                </div>
              </div>

              {/* Profit indicator */}
              {isAuctionActive && auctionState && (
                <div className="flex items-center justify-end gap-3 py-3 text-[11px] text-muted-foreground font-mono tabular-nums">
                  <span>
                    {(() => {
                      const profit = treasuryUsdc - lpCostUsd;
                      return `${profit >= 0 ? "+" : ""}${profit.toFixed(2)} ${profit >= 0 ? "profit" : "loss"}`;
                    })()}
                  </span>
                </div>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Info text */}
              <p className="text-[11px] text-muted-foreground text-center mb-4">
                Auction price decays over time. Buy when profitable.
              </p>

              {/* Action button */}
              <div
                className="pb-4"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
              >
                <button
                  onClick={handleBuy}
                  disabled={!account || !isAuctionActive || !hasEnoughLp || isPending || isSuccess}
                  className={`flex h-11 w-full items-center justify-center gap-2 px-4 text-[11px] ${
                    isSuccess
                      ? colorPositive ? "slab-button opacity-70" : "slab-button slab-button-loss opacity-70"
                      : isError
                      ? "slab-button-ghost text-loss"
                      : !account || !isAuctionActive || !hasEnoughLp || isPending
                      ? colorPositive ? "slab-button opacity-50" : "slab-button slab-button-loss opacity-50"
                      : colorPositive ? "slab-button" : "slab-button slab-button-loss"
                  }`}
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSuccess && <CheckCircle className="w-4 h-4" />}
                  {isPending
                    ? "Selling..."
                    : isSuccess
                    ? "Sold!"
                    : isError
                    ? "Failed"
                    : !account
                    ? "Connect wallet"
                    : !isAuctionActive
                    ? "No active auction"
                    : !hasEnoughLp
                    ? "Insufficient LP"
                    : "Sell LP"}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
