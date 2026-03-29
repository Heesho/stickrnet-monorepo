"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Delete, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useReadContract } from "wagmi";
import { formatUnits, formatEther, parseUnits } from "viem";
import { useSwapQuote } from "@/hooks/useSwapQuote";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import { useFarcaster } from "@/hooks/useFarcaster";
import {
  CONTRACT_ADDRESSES,
  QUOTE_TOKEN_DECIMALS,
  ERC20_ABI,
  UNIV2_ROUTER_ABI,
  UNIV2_FACTORY_ABI,
  UNIV2_PAIR_ABI,
} from "@/lib/contracts";
import { formatCoin } from "@/lib/format";
import { TokenLogo } from "@/components/token-logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TradeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mode: "buy" | "sell";
  tokenSymbol: string;
  unitAddress: `0x${string}`;
  marketPrice: number;
  userQuoteBalance: bigint;
  userUnitBalance: bigint;
  logoUrl?: string;
  colorPositive?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Buffer added on top of price impact for auto slippage (0.1%)
const SLIPPAGE_BUFFER_BPS = 10;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function addCommas(s: string): string {
  const [whole, dec] = s.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${withCommas}.${dec}` : withCommas;
}

// Number pad button component
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

export function TradeModal({
  isOpen,
  onClose,
  mode,
  tokenSymbol,
  unitAddress,
  marketPrice,
  userQuoteBalance,
  userUnitBalance,
  logoUrl,
  colorPositive = true,
}: TradeModalProps) {
  // ---- Local state --------------------------------------------------------
  const [amount, setAmount] = useState("0");

  const { address: taker } = useFarcaster();
  const { execute, status, error: txError, reset } = useBatchedTransaction();

  const isBuy = mode === "buy";
  const usdcAddress = CONTRACT_ADDRESSES.usdc as `0x${string}`;

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

  // Reset input when modal opens / mode changes
  useEffect(() => {
    if (isOpen) {
      setAmount("0");
      reset();
    }
  }, [isOpen, mode, reset]);

  // Auto-reset on error (fast for user rejection, slower for real errors)
  useEffect(() => {
    if (status !== "error") return;
    const isRejection = txError?.message?.includes("User rejected") || txError?.message?.includes("User denied");
    const timer = setTimeout(() => reset(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [status, txError, reset]);

  // ---- Derived amounts ----------------------------------------------------
  const sellDecimals = isBuy ? QUOTE_TOKEN_DECIMALS : 18;
  const outDecimals = isBuy ? 18 : QUOTE_TOKEN_DECIMALS;
  const sellToken = isBuy ? usdcAddress : unitAddress;
  const buyToken = isBuy ? unitAddress : usdcAddress;

  const parsedInput = useMemo(() => {
    try {
      if (!amount || amount === "0" || amount === "0.") return 0n;
      return parseUnits(amount, sellDecimals);
    } catch {
      return 0n;
    }
  }, [amount, sellDecimals]);

  const debouncedInput = useDebounced(parsedInput, 500);

  // ---- Balance display ----------------------------------------------------
  const displayBalance = isBuy
    ? formatUnits(userQuoteBalance, QUOTE_TOKEN_DECIMALS)
    : formatEther(userUnitBalance);

  const userBalanceWei = isBuy ? userQuoteBalance : userUnitBalance;
  const insufficientBalance = parsedInput > 0n && parsedInput > userBalanceWei;

  const availableDisplay = isBuy
    ? `$${Number(displayBalance).toFixed(2)} available`
    : `${formatCoin(Number(displayBalance))} ${tokenSymbol} available`;

  // ---- Allowance check (skip approve if sufficient) -----------------------
  const routerAddress = CONTRACT_ADDRESSES.uniV2Router as `0x${string}`;
  const { data: currentAllowance } = useReadContract({
    address: sellToken,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [taker!, routerAddress],
    query: {
      enabled: !!taker && parsedInput > 0n,
    },
  });

  // ---- LP reserves for spot price -----------------------------------------
  const { data: pairAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.uniV2Factory as `0x${string}`,
    abi: UNIV2_FACTORY_ABI,
    functionName: "getPair",
    args: [usdcAddress, unitAddress],
  });

  const hasPair =
    !!pairAddress &&
    pairAddress !== "0x0000000000000000000000000000000000000000";

  const { data: reserves } = useReadContract({
    address: pairAddress as `0x${string}`,
    abi: UNIV2_PAIR_ABI,
    functionName: "getReserves",
    query: {
      enabled: hasPair,
      refetchInterval: 10_000,
      staleTime: 5_000,
    },
  });

  const { data: token0 } = useReadContract({
    address: pairAddress as `0x${string}`,
    abi: UNIV2_PAIR_ABI,
    functionName: "token0",
    query: { enabled: hasPair },
  });

  // Spot price from LP reserves (USDC per Unit)
  const { spotPrice, reserveIn, reserveOut } = useMemo(() => {
    if (!reserves || !token0) return { spotPrice: null, reserveIn: 0n, reserveOut: 0n };
    const [reserve0, reserve1] = reserves;
    const isToken0Usdc = token0.toLowerCase() === usdcAddress.toLowerCase();
    const reserveUsdc = isToken0Usdc ? reserve0 : reserve1;
    const reserveUnit = isToken0Usdc ? reserve1 : reserve0;
    if (reserveUnit === 0n) return { spotPrice: 0, reserveIn: 0n, reserveOut: 0n };
    // USDC per Unit = (reserveUsdc / 1e6) / (reserveUnit / 1e18)
    const price = (Number(reserveUsdc) * 1e12) / Number(reserveUnit);
    // reserveIn/Out relative to the trade direction
    const rIn = isBuy ? reserveUsdc : reserveUnit;
    const rOut = isBuy ? reserveUnit : reserveUsdc;
    return { spotPrice: price, reserveIn: rIn, reserveOut: rOut };
  }, [reserves, token0, usdcAddress, isBuy]);

  // ---- Swap quote (V2 Router getAmountsOut) --------------------------------
  const {
    data: buyAmountWei,
    isLoading: isQuoteLoading,
    error: quoteError,
  } = useSwapQuote({
    sellToken,
    buyToken,
    sellAmountWei: debouncedInput,
  });

  // ---- Spot output, price impact, auto slippage ----------------------------
  // Spot output = theoretical output at spot price (no fee, no impact)
  const spotOutputWei = useMemo(() => {
    if (!reserveIn || reserveIn === 0n || !reserveOut || debouncedInput === 0n) return null;
    return (debouncedInput * reserveOut) / reserveIn;
  }, [debouncedInput, reserveIn, reserveOut]);

  // Price impact = (spotOutput - actualOutput) / spotOutput
  const priceImpactBps = useMemo(() => {
    if (!spotOutputWei || spotOutputWei === 0n || buyAmountWei === null) return null;
    // Basis points: (spot - actual) * 10000 / spot
    const diff = spotOutputWei - buyAmountWei;
    if (diff <= 0n) return 0;
    const rawBps = Number((diff * 10000n) / spotOutputWei);
    if (!Number.isFinite(rawBps)) return 10000;
    return Math.min(Math.max(rawBps, 0), 10000);
  }, [spotOutputWei, buyAmountWei]);

  // Auto slippage = price impact + buffer
  const autoSlippageBps = useMemo(() => {
    if (priceImpactBps === null) return SLIPPAGE_BUFFER_BPS;
    return Math.min(priceImpactBps + SLIPPAGE_BUFFER_BPS, 10000);
  }, [priceImpactBps]);

  // Minimum output should follow the quoted output, not the idealized spot output.
  const amountOutMin = useMemo(() => {
    if (buyAmountWei === null) return null;
    return (buyAmountWei * BigInt(10000 - autoSlippageBps)) / 10000n;
  }, [buyAmountWei, autoSlippageBps]);

  // ---- Display values -----------------------------------------------------
  const estimatedOutput = useMemo(() => {
    if (buyAmountWei !== null) return formatUnits(buyAmountWei, outDecimals);
    return null;
  }, [buyAmountWei, outDecimals]);

  const pricePerToken = spotPrice ?? marketPrice;

  const minReceivedDisplay = useMemo(() => {
    if (amountOutMin === null) return null;
    return Number(formatUnits(amountOutMin, outDecimals));
  }, [amountOutMin, outDecimals]);

  const priceImpactDisplay = useMemo(() => {
    if (priceImpactBps === null || debouncedInput === 0n) return null;
    return (priceImpactBps / 100).toFixed(2);
  }, [priceImpactBps, debouncedInput]);

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

        // Limit decimal places: 2 for USD (buy), 6 for coins (sell)
        const maxDecimals = isBuy ? 2 : 6;
        const decimalIndex = prev.indexOf(".");
        if (decimalIndex !== -1) {
          const decimals = prev.length - decimalIndex - 1;
          if (decimals >= maxDecimals) return prev;
        }

        // Replace initial 0
        if (prev === "0" && value !== ".") {
          return value;
        }

        // Limit total length
        if (prev.length >= 12) return prev;

        return prev + value;
      });
    },
    [status, isBuy]
  );

  // ---- Execute swap -------------------------------------------------------
  const handleConfirm = useCallback(async () => {
    if (buyAmountWei === null || buyAmountWei <= 0n || amountOutMin === null || !taker) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min
    const path = [sellToken, buyToken] as readonly `0x${string}`[];

    const calls: Call[] = [];

    // 1. Approve sell token to router (skip if allowance is already sufficient)
    const needsApproval = currentAllowance === undefined || currentAllowance < parsedInput;
    if (needsApproval) {
      calls.push(
        encodeApproveCall(sellToken, routerAddress, parsedInput)
      );
    }

    // 2. Swap via V2 Router
    calls.push(
      encodeContractCall(
        routerAddress,
        UNIV2_ROUTER_ABI,
        "swapExactTokensForTokens",
        [parsedInput, amountOutMin, path, taker, deadline],
      )
    );

    try {
      await execute(calls);
    } catch {
      // Error is captured by useBatchedTransaction
    }
  }, [buyAmountWei, amountOutMin, taker, sellToken, buyToken, parsedInput, execute, currentAllowance, routerAddress]);

  // Auto-close on success after a short delay
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
    buyAmountWei === null ||
    buyAmountWei <= 0n ||
    amountOutMin === null ||
    isQuoteLoading ||
    status === "pending";

  const buttonLabel = useMemo(() => {
    if (status === "pending") return "Confirming...";
    if (status === "success") return "Success!";
    if (status === "error") return "Try Again";
    if (insufficientBalance) return "Insufficient balance";
    if (isQuoteLoading && parsedInput > 0n) return "Fetching quote...";
    if (parsedInput === 0n) return isBuy ? "Buy" : "Sell";
    if (buyAmountWei === null || buyAmountWei <= 0n) return "No liquidity";
    return isBuy ? "Buy" : "Sell";
  }, [
    status,
    insufficientBalance,
    isQuoteLoading,
    parsedInput,
    buyAmountWei,
    isBuy,
  ]);

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
        className={`${colorPositive ? "signal-theme-positive signal-theme-positive" : "signal-theme-negative"} relative flex w-full max-w-[520px] flex-col h-full lg:h-auto lg:max-h-[90vh] lg:rounded-[var(--radius)] bg-background lg:glass-panel`}
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
          <span className="text-base font-semibold font-display">{isBuy ? "Buy" : "Sell"}</span>
          <div className="w-9" />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col px-4 lg:px-5 lg:flex-initial">
          {/* Title */}
          <div className="mt-4 mb-6 lg:mt-2 lg:mb-4">
            <h1 className="text-2xl font-semibold font-display tracking-tight lg:text-xl">
              {isBuy ? "Buy" : "Sell"} {tokenSymbol}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1 font-mono tabular-nums">
              {availableDisplay}
            </p>
          </div>

          {/* Desktop: text input for amount */}
          <div className="hidden lg:block mb-4">
            <div className="slab-inset px-3 py-3">
              <label className="text-[12px] text-muted-foreground font-display mb-1.5 block">
                {isBuy ? "Amount (USD)" : `Amount (${tokenSymbol})`}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[15px] text-muted-foreground">{isBuy ? "$" : ""}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount === "0" ? "" : amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    // Enforce decimal limits
                    const maxDecimals = isBuy ? 2 : 6;
                    const parts = val.split(".");
                    if (parts.length > 2) return;
                    if (parts[1] && parts[1].length > maxDecimals) return;
                    if (val.length > 12) return;
                    setAmount(val || "0");
                  }}
                  placeholder="0"
                  className="flex-1 bg-transparent text-[20px] font-mono font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                  autoFocus
                />
                {!isBuy && <TokenLogo name={tokenSymbol} logoUrl={logoUrl} size="sm" variant="circle" />}
              </div>
            </div>
          </div>

          {/* Mobile: amount display (driven by numpad) */}
          <div className="lg:hidden slab-inset px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Pay</span>
              <span className="text-lg font-semibold font-mono tabular-nums flex items-center gap-1.5">
                {isBuy ? `$${addCommas(amount)}` : (
                  <>
                    <TokenLogo name={tokenSymbol} logoUrl={logoUrl} size="xs" variant="circle" />
                    {addCommas(amount)}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Market price */}
          <div className="slab-inset mt-2 px-3 py-2.5 lg:py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Market price</span>
              <span className="text-[13px] font-medium font-mono tabular-nums">
                ${pricePerToken.toFixed(6)}
              </span>
            </div>
          </div>

          {/* Estimated output */}
          <div className="slab-inset mt-2 px-3 py-2.5 lg:py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Est. received</span>
              <span className="text-[13px] font-medium font-mono tabular-nums">
                {isQuoteLoading && parsedInput > 0n ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : estimatedOutput ? (
                  isBuy
                    ? `${formatCoin(Number(estimatedOutput))} ${tokenSymbol}`
                    : `$${Number(estimatedOutput).toFixed(2)}`
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>

          {/* Price impact and minimum received */}
          <div className="flex items-center justify-end gap-3 py-3 text-[11px] text-muted-foreground font-mono tabular-nums">
            <span>
              {priceImpactDisplay !== null
                ? `~${priceImpactDisplay}% price impact`
                : "—"}
            </span>
            <span>·</span>
            <span>
              {minReceivedDisplay !== null
                ? isBuy
                  ? `${formatCoin(minReceivedDisplay)} ${tokenSymbol}`
                  : `$${minReceivedDisplay.toFixed(2)}`
                : "—"}{" "}
              min
            </span>
          </div>

          {/* Error messages */}
          {(quoteError || txError) && (
            <div className="slab-inset mb-3 flex items-start gap-2 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-loss" />
              <span className="text-[12px] text-loss">
                {(() => {
                  const msg = txError?.message || quoteError?.message || "";
                  if (msg.includes("rejected") || msg.includes("denied")) return "Transaction cancelled";
                  if (msg.includes("insufficient")) return "Insufficient balance";
                  if (msg.includes("INSUFFICIENT_OUTPUT_AMOUNT")) return "Price moved too much, try again";
                  return "Something went wrong";
                })()}
              </span>
            </div>
          )}

          {/* Spacer — mobile only */}
          <div className="flex-1 lg:hidden" />

          {/* Action button */}
          <button
            disabled={buttonDisabled}
            onClick={handleConfirm}
            className={`mb-3 flex h-11 w-full items-center justify-center gap-2 px-4 text-[11px] sm:mb-4 lg:mt-2 ${
              buttonDisabled
                ? isBuy ? "slab-button opacity-50" : "slab-button slab-button-loss opacity-50"
                : isSuccess
                ? isBuy ? "slab-button opacity-70" : "slab-button slab-button-loss opacity-70"
                : isBuy ? "slab-button" : "slab-button slab-button-loss"
            }`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSuccess && <CheckCircle className="w-4 h-4" />}
            {buttonLabel}
          </button>

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
