"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Delete, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { formatUnits, formatEther, parseUnits } from "viem";
import { useReadContract } from "wagmi";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useChannelState } from "@/hooks/useChannelState";
import { useTokenMetadata } from "@/hooks/useMetadata";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  channelAddress: `0x${string}`;
  tokenSymbol?: string;
  onSuccess?: () => void;
  colorPositive?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addCommas(s: string): string {
  const [whole, dec] = s.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${withCommas}.${dec}` : withCommas;
}

function NumPadButton({
  value,
  onClick,
  children,
}: {
  value: string;
  onClick: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className="border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] flex h-12 flex-1 items-center justify-center text-lg font-mono font-medium text-foreground transition-colors hover:bg-[hsl(var(--foreground)/0.08)] active:bg-[hsl(var(--foreground)/0.08)] sm:h-14 sm:text-xl"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MineModal({
  isOpen,
  onClose,
  channelAddress,
  tokenSymbol = "TOKEN",
  onSuccess,
  colorPositive = true,
}: MineModalProps) {
  const [amount, setAmount] = useState("0");
  const [message, setMessage] = useState("");

  const { address: account } = useFarcaster();
  const { execute, status, error: txError, reset } = useBatchedTransaction();

  const { channelState } = useChannelState(channelAddress, account);
  const { metadata } = useTokenMetadata(channelState?.fundraiserUri);
  const defaultMessage = metadata?.defaultMessage || "gm";

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

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("0");
      setMessage("");
      reset();
    }
  }, [isOpen, reset]);

  // Auto-reset on error (fast for user rejection, slower for real errors)
  useEffect(() => {
    if (status !== "error") return;
    const isRejection = txError?.message?.includes("User rejected") || txError?.message?.includes("User denied");
    const timer = setTimeout(() => reset(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [status, txError, reset]);

  // ---- Derived amounts ----------------------------------------------------
  const parsedInput = useMemo(() => {
    try {
      if (!amount || amount === "0" || amount === "0.") return 0n;
      return parseUnits(amount, QUOTE_TOKEN_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  // User USDC balance
  const userBalance = channelState?.accountQuoteBalance ?? 0n;
  const displayBalance = Number(formatUnits(userBalance, QUOTE_TOKEN_DECIMALS));
  const insufficientBalance = parsedInput > 0n && parsedInput > userBalance;

  // Current epoch pool stats
  const todayTotalDonated = channelState
    ? Number(formatUnits(channelState.currentEpochTotalDonated, QUOTE_TOKEN_DECIMALS))
    : 0;
  const todayEmission = channelState
    ? Number(formatEther(channelState.currentEpochEmission))
    : 0;
  const parsedAmount = parseFloat(amount) || 0;
  const costPerToken = todayEmission > 0 ? (todayTotalDonated + parsedAmount) / todayEmission : 0;
  const estimatedTokens =
    parsedAmount > 0 && todayEmission > 0
      ? (parsedAmount / (todayTotalDonated + parsedAmount)) * todayEmission
      : 0;

  // ---- Allowance check ----------------------------------------------------
  const multicallAddr = CONTRACT_ADDRESSES.multicall as `0x${string}`;
  const { data: currentAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, multicallAddr],
    query: {
      enabled: !!account && parsedInput > 0n,
    },
  });

  // ---- Number pad ---------------------------------------------------------
  const handleNumPadPress = useCallback(
    (value: string) => {
      if (status === "pending") return;
      setAmount((prev) => {
        if (value === "backspace") {
          if (prev.length <= 1) return "0";
          return prev.slice(0, -1);
        }
        if (value === ".") {
          if (prev.includes(".")) return prev;
          return prev + ".";
        }
        // Limit to 2 decimal places for USD
        const decimalIndex = prev.indexOf(".");
        if (decimalIndex !== -1) {
          const decimals = prev.length - decimalIndex - 1;
          if (decimals >= 2) return prev;
        }
        // Replace initial 0
        if (prev === "0" && value !== ".") return value;
        // Limit total length
        if (prev.length >= 12) return prev;
        return prev + value;
      });
    },
    [status]
  );

  // ---- Execute mine -------------------------------------------------------
  const handleConfirm = useCallback(async () => {
    if (!account || !channelState || status === "pending") return;
    const amt = parseUnits(amount || "0", QUOTE_TOKEN_DECIMALS);
    if (amt <= 0n) return;

    const calls: Call[] = [];

    // Approve USDC for multicall if needed
    const needsApproval = currentAllowance === undefined || currentAllowance < amt;
    if (needsApproval) {
      calls.push(
        encodeApproveCall(
          CONTRACT_ADDRESSES.usdc as `0x${string}`,
          multicallAddr,
          amt
        )
      );
    }

    // Fund call
    calls.push(
      encodeContractCall(
        multicallAddr,
        MULTICALL_ABI,
        "fund",
        [channelAddress, account, amt, message || defaultMessage]
      )
    );

    await execute(calls);
  }, [account, channelState, amount, channelAddress, execute, status, currentAllowance, multicallAddr, message, defaultMessage]);

  // Notify parent on success
  useEffect(() => {
    if (status === "success") onSuccess?.();
  }, [status, onSuccess]);

  // Auto-close on success after short delay
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (status === "success") {
      const id = setTimeout(() => onCloseRef.current(), 2000);
      return () => clearTimeout(id);
    }
  }, [status]);

  // ---- Button state -------------------------------------------------------
  const buttonDisabled =
    parsedInput === 0n ||
    insufficientBalance ||
    status === "pending";

  const buttonLabel = useMemo(() => {
    if (status === "pending") return "Mining...";
    if (status === "success") return "Success!";
    if (status === "error") return "Try Again";
    if (insufficientBalance) return "Insufficient balance";
    if (parsedInput === 0n) return "Mine";
    return "Mine";
  }, [status, insufficientBalance, parsedInput]);

  // ---- Render -------------------------------------------------------------
  if (!isOpen) return null;

  const isPending = status === "pending";
  const isSuccess = status === "success";

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden overscroll-none bg-[hsl(var(--background)/0.6)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`${colorPositive ? "signal-theme-positive" : "signal-theme-negative"} relative flex w-full max-w-[520px] flex-col h-full lg:h-auto lg:max-h-[90vh] lg:rounded-[var(--radius)] bg-background lg:glass-panel ${colorPositive ? "lg:glass-panel-positive" : "lg:glass-panel-negative"}`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 lg:px-5 lg:pb-3 lg:pt-2">
          <button
            onClick={onClose}
            className="border border-[hsl(var(--foreground)/0.1)] rounded-full -ml-2 p-2 transition-colors hover:bg-[hsl(var(--foreground)/0.08)]"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold font-display">Mine</span>
          <div className="w-9" />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col px-4 lg:px-5 lg:flex-initial">
          {/* Balance */}
          <div className="mt-4 mb-6 lg:mt-2 lg:mb-4">
            <h1 className="text-2xl font-semibold font-display tracking-tight lg:text-xl">
              Mine {tokenSymbol}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 font-mono tabular-nums">
              ${displayBalance.toFixed(2)} available
            </p>
          </div>

          {/* Desktop: text input */}
          <div className="hidden lg:block mb-4">
            <div className="slab-inset px-3 py-3">
              <label className="text-[12px] text-muted-foreground font-display mb-1.5 block">Amount (USD)</label>
              <div className="flex items-center gap-2">
                <span className="text-[15px] text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount === "0" ? "" : amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = val.split(".");
                    if (parts.length > 2) return;
                    if (parts[1] && parts[1].length > 2) return;
                    if (val.length > 12) return;
                    setAmount(val || "0");
                  }}
                  placeholder="0"
                  className="flex-1 bg-transparent text-[20px] font-mono font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Mobile: amount display */}
          <div className="lg:hidden slab-inset px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Pay</span>
              <span className="text-lg font-semibold font-mono tabular-nums">
                ${addCommas(amount)}
              </span>
            </div>
          </div>

          {/* Cost per coin */}
          <div className="slab-inset mt-2 px-3 py-2.5 lg:py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Cost per coin</span>
              <span className="text-[13px] font-medium font-mono tabular-nums">
                {costPerToken > 0 ? `$${costPerToken.toFixed(6)}` : "\u2014"}
              </span>
            </div>
          </div>

          {/* Estimated coins */}
          <div className="slab-inset mt-2 px-3 py-2.5 lg:py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Est. coins</span>
              <span className="text-[13px] font-medium font-mono tabular-nums">
                {estimatedTokens > 0
                  ? `${estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${tokenSymbol}`
                  : "\u2014"}
              </span>
            </div>
          </div>

          {/* Error messages */}
          {txError && (
            <div className="slab-inset mb-3 flex items-start gap-2 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-loss" />
              <span className="text-[12px] text-loss">
                {(() => {
                  const msg = txError?.message || "";
                  if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancelled")) return "Transaction cancelled";
                  if (msg.includes("insufficient")) return "Insufficient balance";
                  return "Something went wrong";
                })()}
              </span>
            </div>
          )}

          {/* Spacer — mobile only */}
          <div className="flex-1 lg:hidden" />

          <div className="mb-3 sm:mb-4 lg:mt-2">
            {/* Message input */}
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={defaultMessage}
              maxLength={100}
              className="field-input h-11 px-4 text-[14px]"
            />

            {/* Action button */}
            <button
              disabled={buttonDisabled}
              onClick={handleConfirm}
              className={`-mt-px flex h-11 w-full items-center justify-center gap-2 px-4 text-[11px] ${
                buttonDisabled
                  ? colorPositive ? "slab-button opacity-50" : "slab-button slab-button-loss opacity-50"
                  : isSuccess
                  ? colorPositive ? "slab-button opacity-70" : "slab-button slab-button-loss opacity-70"
                  : colorPositive ? "slab-button" : "slab-button slab-button-loss"
              }`}
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSuccess && <CheckCircle className="w-4 h-4" />}
              {buttonLabel}
            </button>
          </div>

          {/* Number pad — mobile only */}
          <div
            className="pb-4 lg:hidden"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"].map(
                (key) => (
                  <NumPadButton key={key} value={key} onClick={handleNumPadPress}>
                    {key === "backspace" ? (
                      <Delete className="w-6 h-6" />
                    ) : (
                      key
                    )}
                  </NumPadButton>
                )
              )}
            </div>
          </div>

          {/* Desktop: bottom padding */}
          <div className="hidden lg:block lg:pb-5" />
        </div>
      </motion.div>
    </div>
  );
}
