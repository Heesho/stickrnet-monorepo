"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Delete, Loader2, CheckCircle } from "lucide-react";
import { parseUnits, parseEther } from "viem";
import { useReadContract } from "wagmi";
import { useFarcaster } from "@/hooks/useFarcaster";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  UNIV2_ROUTER_ABI,
  QUOTE_TOKEN_DECIMALS,
} from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS } from "@/lib/constants";

type LiquidityModalProps = {
  isOpen: boolean;
  onClose: () => void;
  unitAddress: `0x${string}`;
  tokenSymbol?: string;
  tokenBalance?: number;
  usdcBalance?: number;
  tokenPrice?: number; // Token price in USDC
  colorPositive?: boolean;
};

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

export function LiquidityModal({
  isOpen,
  onClose,
  unitAddress,
  tokenSymbol = "TOKEN",
  tokenBalance = 0,
  usdcBalance = 0,
  tokenPrice = 0,
  colorPositive = true,
}: LiquidityModalProps) {
  const { address: account } = useFarcaster();
  const { execute, status: txStatus, error: txError, reset: resetTx } = useBatchedTransaction();
  const [tokenAmount, setTokenAmount] = useState("0");

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

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setTokenAmount("0");
      resetTx();
    }
  }, [isOpen, resetTx]);

  // Auto-reset on error (fast for user rejection, slower for real errors)
  useEffect(() => {
    if (txStatus !== "error") return;
    const isRejection = txError?.message?.includes("User rejected") || txError?.message?.includes("User denied");
    const timer = setTimeout(() => resetTx(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [txStatus, txError, resetTx]);

  // Handle number pad input
  const handleNumPadPress = useCallback((value: string) => {
    setTokenAmount((prev) => {
      if (value === "backspace") {
        if (prev.length <= 1) return "0";
        return prev.slice(0, -1);
      }

      if (value === ".") {
        if (prev.includes(".")) return prev;
        return prev + ".";
      }

      // Limit decimal places
      const decimalIndex = prev.indexOf(".");
      if (decimalIndex !== -1) {
        const decimals = prev.length - decimalIndex - 1;
        if (decimals >= 6) return prev;
      }

      // Replace initial 0
      if (prev === "0" && value !== ".") {
        return value;
      }

      // Limit total length
      if (prev.length >= 12) return prev;

      return prev + value;
    });
  }, []);

  // Calculate values
  const tokenInputAmount = parseFloat(tokenAmount) || 0;
  const requiredUsdc = tokenInputAmount * tokenPrice;
  const lpTokensReceived = Math.sqrt(tokenInputAmount * requiredUsdc);

  // Validation
  const hasEnoughToken = tokenInputAmount <= tokenBalance;
  const hasEnoughUsdc = requiredUsdc <= usdcBalance;
  const canCreate = tokenInputAmount > 0 && hasEnoughToken && hasEnoughUsdc && !!account;

  const isPending = txStatus === "pending" || txStatus === "confirming";
  const isSuccess = txStatus === "success";
  const isError = txStatus === "error";

  // Auto-close on success after short delay
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (txStatus === "success") {
      const id = setTimeout(() => onCloseRef.current(), 2000);
      return () => clearTimeout(id);
    }
  }, [txStatus]);

  // Pre-compute amounts for allowance checks
  const routerAddress = CONTRACT_ADDRESSES.uniV2Router as `0x${string}`;
  const usdcAddress = CONTRACT_ADDRESSES.usdc as `0x${string}`;
  const tokenAmountWei = useMemo(() => {
    try {
      return tokenInputAmount > 0 ? parseEther(tokenInputAmount.toString()) : 0n;
    } catch { return 0n; }
  }, [tokenInputAmount]);
  const usdcAmountWei = useMemo(() => {
    try {
      return requiredUsdc > 0 ? parseUnits(requiredUsdc.toFixed(QUOTE_TOKEN_DECIMALS), QUOTE_TOKEN_DECIMALS) : 0n;
    } catch { return 0n; }
  }, [requiredUsdc]);

  // Allowance checks — skip approve when sufficient
  const { data: unitAllowance } = useReadContract({
    address: unitAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, routerAddress],
    query: { enabled: !!account && tokenAmountWei > 0n },
  });
  const { data: usdcAllowance } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account!, routerAddress],
    query: { enabled: !!account && usdcAmountWei > 0n },
  });

  // Add liquidity handler
  const handleAddLiquidity = useCallback(async () => {
    if (!account || !canCreate) return;

    // 1% slippage tolerance
    const tokenAmountMin = (tokenAmountWei * 99n) / 100n;
    const usdcAmountMin = (usdcAmountWei * 99n) / 100n;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

    const calls: Call[] = [];

    // Approve unit token for router (skip if allowance is sufficient)
    if (unitAllowance === undefined || unitAllowance < tokenAmountWei) {
      calls.push(encodeApproveCall(unitAddress, routerAddress, tokenAmountWei));
    }

    // Approve USDC for router (skip if allowance is sufficient)
    if (usdcAllowance === undefined || usdcAllowance < usdcAmountWei) {
      calls.push(encodeApproveCall(usdcAddress, routerAddress, usdcAmountWei));
    }

    // Call addLiquidity on Uniswap V2 Router
    calls.push(
      encodeContractCall(
        routerAddress,
        UNIV2_ROUTER_ABI,
        "addLiquidity",
        [
          unitAddress,
          usdcAddress,
          tokenAmountWei,
          usdcAmountWei,
          tokenAmountMin,
          usdcAmountMin,
          account,
          deadline,
        ],
        0n
      )
    );

    await execute(calls);
  }, [account, canCreate, tokenAmountWei, usdcAmountWei, unitAddress, execute, unitAllowance, usdcAllowance, routerAddress, usdcAddress]);

  if (!isOpen) return null;

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
          <span className="text-base font-semibold font-display">Liquidity</span>
          <div className="w-9" />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col px-4">
          {/* Title */}
          <div className="mt-4 mb-6">
            <h1 className="text-2xl font-semibold font-display tracking-tight">Add Liquidity</h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              Provide {tokenSymbol} and USDC to get LP tokens
            </p>
          </div>

          {/* Desktop: text input */}
          <div className="hidden lg:block mb-4">
            <div className="slab-inset px-3 py-3">
              <label className="text-[12px] text-muted-foreground font-display mb-1.5 block">Amount ({tokenSymbol})</label>
              <input
                type="text"
                inputMode="decimal"
                value={tokenAmount === "0" ? "" : tokenAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "");
                  const parts = val.split(".");
                  if (parts.length > 2) return;
                  if (parts[1] && parts[1].length > 6) return;
                  if (val.length > 12) return;
                  setTokenAmount(val || "0");
                }}
                placeholder="0"
                className="w-full bg-transparent text-[20px] font-mono font-semibold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/40"
                autoFocus
              />
            </div>
          </div>

          {/* Mobile: Token Input */}
          <div className="lg:hidden slab-inset px-3 py-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">You provide</span>
              <span className="text-lg font-semibold font-mono tabular-nums">
                {tokenAmount} {tokenSymbol}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">{tokenSymbol}</span>
              <button
                onClick={() => setTokenAmount(tokenBalance.toFixed(2))}
                className="signal-hover text-[11px] text-muted-foreground font-mono tabular-nums"
              >
                Balance: {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </button>
            </div>
          </div>

          {/* Required USDC */}
          <div className="slab-inset mt-2 px-3 py-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground font-display">Required USDC</span>
              <span className="text-lg font-semibold font-mono tabular-nums">
                {requiredUsdc.toFixed(2)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground">USDC</span>
              <button
                onClick={() => {
                  if (tokenPrice <= 0) return;
                  const maxTokenFromUsdc = usdcBalance / tokenPrice;
                  setTokenAmount(Math.min(tokenBalance, maxTokenFromUsdc).toFixed(2));
                }}
                className="signal-hover text-[11px] text-muted-foreground font-mono tabular-nums"
              >
                Balance: {usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </button>
            </div>
          </div>

          {/* LP Output */}
          {tokenInputAmount > 0 && (
            <div className="flex items-center justify-end gap-3 py-3 text-[11px] text-muted-foreground font-mono tabular-nums">
              <span>
                You receive ~ {lpTokensReceived.toFixed(2)} LP tokens
              </span>
            </div>
          )}

          {/* Spacer — mobile only */}
          <div className="flex-1 lg:hidden" />

          {/* Action button */}
          <button
            onClick={handleAddLiquidity}
            disabled={!canCreate || isPending || isSuccess}
            className={`mb-3 flex h-11 w-full items-center justify-center gap-2 px-4 text-[11px] sm:mb-4 lg:mt-2 ${
              isSuccess
                ? colorPositive ? "slab-button opacity-70" : "slab-button slab-button-loss opacity-70"
                : isError
                ? "slab-button-ghost text-loss"
                : !canCreate || isPending
                ? colorPositive ? "slab-button opacity-50" : "slab-button slab-button-loss opacity-50"
                : colorPositive ? "slab-button" : "slab-button slab-button-loss"
            }`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSuccess && <CheckCircle className="w-4 h-4" />}
            {isPending
              ? "Adding Liquidity..."
              : isSuccess
              ? "Liquidity Added!"
              : isError
              ? "Failed"
              : !account
              ? "Connect wallet"
              : tokenInputAmount === 0
              ? "Enter amount"
              : !hasEnoughToken
              ? `Insufficient ${tokenSymbol}`
              : !hasEnoughUsdc
              ? "Insufficient USDC"
              : "Add Liquidity"}
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
