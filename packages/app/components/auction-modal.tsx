"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

const LP_PRICE_SCALE = 10n ** 18n;

function formatLpAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  if (amount === 0) return "0";
  if (amount < 0.001) return amount.toFixed(8);
  if (amount < 0.01) return amount.toFixed(6);
  if (amount < 1) return amount.toFixed(4);
  return amount.toFixed(3);
}

type AuctionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contentAddress: `0x${string}`;
  tokenSymbol: string;
  tokenName: string;
  isPositiveTrend?: boolean;
};

export function AuctionModal({
  isOpen,
  onClose,
  contentAddress,
  tokenSymbol,
  tokenName,
  isPositiveTrend = true,
}: AuctionModalProps) {
  const { address: account } = useFarcaster();
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;

  const { auctionState, isLoading, refetch: refetchAuction } = useAuctionState(
    contentAddress,
    account
  );

  const { execute, status, txHash, error, reset } = useBatchedTransaction();

  // Allowance check -- skip approve when sufficient
  const paymentTokenAddress = auctionState?.paymentToken;
  const auctionPrice = auctionState?.price ?? 0n;
  const { data: currentAllowance } = useReadContract({
    address: paymentTokenAddress!,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, multicallAddr],
    query: {
      enabled: !!account && !!paymentTokenAddress && auctionPrice > 0n,
    },
  });

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

  // Auto-refetch after successful tx
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        refetchAuction();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, refetchAuction]);

  // Auto-close on success after a short delay
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Derived display values
  const paymentPriceFormatted = auctionState
    ? formatEther(auctionState.price)
    : "0";
  const paymentPriceDisplay = formatLpAmount(paymentPriceFormatted);

  const userPaymentTokenBalance = auctionState
    ? formatEther(auctionState.accountPaymentTokenBalance)
    : "0";

  const treasuryUsdc = auctionState
    ? formatUnits(auctionState.quoteAccumulated, QUOTE_TOKEN_DECIMALS)
    : "0";

  const lpCostInQuoteRaw = auctionState
    ? (auctionState.price * auctionState.paymentTokenPrice) / LP_PRICE_SCALE
    : 0n;
  const lpCostUsd = Number(formatUnits(lpCostInQuoteRaw, QUOTE_TOKEN_DECIMALS));

  const hasEnoughPaymentToken = auctionState
    ? auctionState.price === 0n || auctionState.accountPaymentTokenBalance >= auctionState.price
    : false;

  const isAuctionActive = auctionState
    ? auctionState.startTime > 0n
    : false;

  // Buy handler -- approve payment token then call buy on multicall
  const handleBuy = useCallback(async () => {
    if (!auctionState || !account) return;

    const calls: Call[] = [];
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
    );

    // Approve payment token spending (skip if price is 0 or allowance is sufficient)
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

    // Buy call: buy(content, epochId, deadline, maxPaymentTokenAmount)
    calls.push(
      encodeContractCall(
        multicallAddr,
        MULTICALL_ABI,
        "buy",
        [contentAddress, auctionState.epochId, deadline, auctionState.price],
        0n
      )
    );

    await execute(calls);
  }, [auctionState, account, multicallAddr, contentAddress, execute, currentAllowance]);

  if (!isOpen) return null;

  const isPending = status === "pending";
  const isSuccess = status === "success";
  const isError = status === "error";
  const accentButtonClass = isPositiveTrend
    ? "bg-[#A78BFA] text-black hover:bg-[#9575D9]"
    : "bg-[#2DD4BF] text-black hover:bg-[#26B8A5]";
  const accentSolidClass = isPositiveTrend
    ? "bg-[#A78BFA] text-black"
    : "bg-[#2DD4BF] text-black";
  const accentDisabledClass = isPositiveTrend
    ? "bg-[#A78BFA] text-black/60 opacity-50 cursor-not-allowed"
    : "bg-[#2DD4BF] text-black/60 opacity-50 cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[100] flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-none hover:bg-secondary transition-colors"
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
                  {Number(userPaymentTokenBalance).toFixed(8)} {tokenSymbol}-USDC LP available
                </p>
              </div>

              {/* You Pay */}
              <div className="py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground font-display">You pay</span>
                  <span className="text-lg font-semibold font-mono tabular-nums">
                    {isAuctionActive ? `${paymentPriceDisplay} LP` : "\u2014"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground">{tokenSymbol}-USDC LP</span>
                  {isAuctionActive && auctionState && (
                    <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      ~${lpCostUsd.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* You Receive */}
              <div className="py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-muted-foreground font-display">You receive</span>
                  <span className="text-lg font-semibold font-mono tabular-nums">
                    {isAuctionActive ? `$${Number(treasuryUsdc).toFixed(2)}` : "\u2014"}
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
                      const usdcReceive = Number(treasuryUsdc);
                      const profit = usdcReceive - lpCostUsd;
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
                  disabled={!account || !isAuctionActive || !hasEnoughPaymentToken || isPending || isSuccess}
                  className={`w-full h-10 rounded-none font-semibold font-display text-[14px] transition-all flex items-center justify-center gap-2 ${
                    isSuccess
                      ? accentSolidClass
                      : isError
                      ? "bg-zinc-800 text-white"
                      : !account || !isAuctionActive || !hasEnoughPaymentToken || isPending
                      ? accentDisabledClass
                      : accentButtonClass
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
                    : !hasEnoughPaymentToken
                    ? "Insufficient LP"
                    : "Sell LP"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
