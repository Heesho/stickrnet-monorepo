"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Upload, X } from "lucide-react";
import { parseUnits, formatUnits, parseEventLogs } from "viem";
import { useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { Particles } from "@/components/ui/particles";
import { useFarcaster } from "@/hooks/useFarcaster";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  QUOTE_TOKEN_DECIMALS,
  ERC20_ABI,
  LAUNCH_DEFAULTS,
} from "@/lib/contracts";

// Default values for channel launch
const DEFAULTS = {
  usdcAmount: 1,
  coinAmount: 1000,
  auctionTargetUsd: 100, // target $100 min auction price
};

// ABI for parsing the Core__Launched event from tx receipts
const LAUNCHED_EVENT_ABI = [
  {
    type: "event",
    name: "Core__Launched",
    inputs: [
      { name: "launcher", type: "address", indexed: true },
      { name: "content", type: "address", indexed: true },
      { name: "coin", type: "address", indexed: true },
      { name: "minter", type: "address", indexed: false },
      { name: "rewarder", type: "address", indexed: false },
      { name: "auction", type: "address", indexed: false },
      { name: "lpToken", type: "address", indexed: false },
      { name: "tokenName", type: "string", indexed: false },
      { name: "tokenSymbol", type: "string", indexed: false },
      { name: "uri", type: "string", indexed: false },
      { name: "quoteAmount", type: "uint256", indexed: false },
      { name: "coinAmount", type: "uint256", indexed: false },
      { name: "initialUps", type: "uint256", indexed: false },
      { name: "tailUps", type: "uint256", indexed: false },
      { name: "halvingPeriod", type: "uint256", indexed: false },
      { name: "contentMinInitPrice", type: "uint256", indexed: false },
      { name: "contentIsModerated", type: "bool", indexed: false },
      { name: "auctionInitPrice", type: "uint256", indexed: false },
      { name: "auctionEpochPeriod", type: "uint256", indexed: false },
      { name: "auctionPriceMultiplier", type: "uint256", indexed: false },
      { name: "auctionMinInitPrice", type: "uint256", indexed: false },
    ],
  },
] as const;

export default function LaunchPage() {
  const { address: account, isConnected, isConnecting, connect } = useFarcaster();
  const { execute, status: txStatus, txHash, batchReceipts, error: txError, reset: resetTx } = useBatchedTransaction();

  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  // Helper to extract content address from parsed logs
  const extractContentAddress = (logs: readonly { address: string; topics: readonly string[]; data: string }[]) => {
    try {
      const parsed = parseEventLogs({
        abi: LAUNCHED_EVENT_ABI,
        logs: logs as Parameters<typeof parseEventLogs>["0"]["logs"],
      });
      const launchedEvent = parsed.find((e) => e.eventName === "Core__Launched");
      if (launchedEvent?.args && "content" in launchedEvent.args) {
        return launchedEvent.args.content as string;
      }
    } catch (err) {
      console.error("Failed to parse launch event logs:", err);
    }
    return null;
  };

  const launchedContentAddress = useMemo(() => {
    if (txReceipt?.logs) {
      const addr = extractContentAddress(txReceipt.logs);
      if (addr) return addr;
    }

    if (!batchReceipts) return null;

    for (const receipt of batchReceipts) {
      if (receipt.logs) {
        const addr = extractContentAddress(receipt.logs as never);
        if (addr) return addr;
      }
    }

    return null;
  }, [batchReceipts, txReceipt]);

  // Read user's USDC balance
  const { data: usdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account },
  });

  // Basic info
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Content moderation toggle
  const [contentIsModerated, setContentIsModerated] = useState(false);

  // Links (websites, socials)
  const [showLinks, setShowLinks] = useState(false);
  const [links, setLinks] = useState<string[]>([""]);

  // Channel parameters (using defaults)
  const usdcAmount = DEFAULTS.usdcAmount;
  const coinAmount = DEFAULTS.coinAmount;

  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Auto-reset error state so button reverts to normal
  const isUserRejection = txError?.message?.includes("User rejected") || txError?.message?.includes("User denied");
  useEffect(() => {
    if (txStatus !== "error" && !launchError) return;
    if (launchError) console.error("[Launch Error]", launchError);
    if (txStatus === "error") console.error("[Tx Error]", txError);
    const delay = isUserRejection ? 2000 : 10000;
    const timer = setTimeout(() => {
      resetTx();
      setLaunchError(null);
    }, delay);
    return () => clearTimeout(timer);
  }, [txStatus, launchError, resetTx, txError, isUserRejection]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Form validation
  const isFormValid = (() => {
    if (!logoFile) return false;
    if (!tokenName.trim().length || !tokenSymbol.trim().length) return false;
    if (!tokenDescription.trim().length) return false;
    return true;
  })();

  const isLaunching = txStatus === "pending" || txStatus === "confirming";

  const uploadLogoToPinata = async (): Promise<string> => {
    if (!logoFile) return "";
    const formData = new FormData();
    formData.append("file", logoFile);
    formData.append("tokenSymbol", tokenSymbol);

    const res = await fetch("/api/pinata/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data?.ipfsUrl) {
      throw new Error(data?.error || "Logo upload failed");
    }
    return data.ipfsUrl as string;
  };

  const uploadMetadataToPinata = async (imageUrl: string): Promise<string> => {
    const res = await fetch("/api/pinata/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tokenName,
        symbol: tokenSymbol,
        image: imageUrl,
        description: tokenDescription,
        links: links.filter((l) => l.trim() !== ""),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.ipfsUrl) {
      throw new Error(data?.error || "Metadata upload failed");
    }
    return data.ipfsUrl as string;
  };

  const handleLaunch = async () => {
    if (!isFormValid || isLaunching) return;

    setLaunchError(null);

    let launcher = account;
    if (!launcher) {
      try {
        launcher = await connect();
      } catch {
        setLaunchError("Wallet connection failed.");
        return;
      }
    }

    if (!launcher) {
      setLaunchError("Wallet not connected.");
      return;
    }

    try {
      // Upload metadata
      setIsUploading(true);
      const logoIpfsUrl = await uploadLogoToPinata();
      const uri = await uploadMetadataToPinata(logoIpfsUrl);
      setIsUploading(false);

      const usdcAmountWei = parseUnits(usdcAmount.toString(), QUOTE_TOKEN_DECIMALS);
      const coinAmountWei = parseUnits(coinAmount.toString(), 18);

      // Compute auction price in LP tokens to target a dollar value
      const auctionLpPrice = DEFAULTS.auctionTargetUsd / (2_000_000 * Math.sqrt(usdcAmount / coinAmount));
      const auctionInitPriceWei = parseUnits(auctionLpPrice.toFixed(18), 18);
      const auctionMinInitPriceWei = auctionInitPriceWei;

      const quoteToken = CONTRACT_ADDRESSES.usdc as `0x${string}`;
      const multicallAddress = CONTRACT_ADDRESSES.multicall as `0x${string}`;

      const launchParams = {
        launcher,
        tokenName,
        tokenSymbol,
        uri,
        quoteAmount: usdcAmountWei,
        coinAmount: coinAmountWei,
        initialUps: LAUNCH_DEFAULTS.initialUps,
        tailUps: LAUNCH_DEFAULTS.tailUps,
        halvingPeriod: LAUNCH_DEFAULTS.halvingPeriod,
        contentMinInitPrice: LAUNCH_DEFAULTS.contentMinInitPrice,
        contentIsModerated,
        auctionInitPrice: auctionInitPriceWei,
        auctionEpochPeriod: LAUNCH_DEFAULTS.auctionEpochPeriod,
        auctionPriceMultiplier: LAUNCH_DEFAULTS.auctionPriceMultiplier,
        auctionMinInitPrice: auctionMinInitPriceWei,
      };

      const calls: Call[] = [
        encodeApproveCall(quoteToken, multicallAddress, usdcAmountWei),
        encodeContractCall(multicallAddress, MULTICALL_ABI, "launch", [launchParams]),
      ];

      await execute(calls);
    } catch (err) {
      setIsUploading(false);
      setLaunchError(err instanceof Error ? err.message : "Launch failed.");
    }
  };

  // Format helpers
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  // Shared launch button JSX
  const launchButtonBlock = (
    <div className="flex items-center gap-4">
      <div className="flex shrink-0 items-center gap-4">
        <div>
          <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Pay</div>
          <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
            ${formatNumber(usdcAmount)}
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Balance</div>
          <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
            ${formatNumber(usdcBalance ? Number(formatUnits(usdcBalance, QUOTE_TOKEN_DECIMALS)) : 0)}
          </div>
        </div>
      </div>
      {!isConnected ? (
        <button
          onClick={() => connect()}
          disabled={isConnecting}
          className="slab-button flex-1 text-[11px] disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <button
          onClick={handleLaunch}
          disabled={!isFormValid || isLaunching || isUploading}
          className={`flex-1 px-4 text-[11px] ${
            launchError || txStatus === "error"
              ? "slab-button-ghost text-muted-foreground"
              : !isFormValid || isLaunching || isUploading
              ? "slab-button opacity-50"
              : "slab-button"
          }`}
        >
          {launchError || txStatus === "error"
            ? txError?.message?.includes("cancelled") ? "Rejected" : "Failed"
            : isUploading
            ? "Uploading..."
            : isLaunching
            ? "Launching..."
            : "Launch"}
        </button>
      )}
    </div>
  );

  // Content moderation section JSX
  const moderationSection = (
    <div>
      <button
        type="button"
        onClick={() => setContentIsModerated(!contentIsModerated)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="min-w-0 text-left">
          <div className="section-kicker">Content Moderation</div>
          <div className="mt-1 text-[13px] text-foreground font-display font-medium">Moderate stickers</div>
          <div className="text-[11px] text-muted-foreground">Approve stickers before they appear in the channel.</div>
        </div>
        <div className="toggle-track shrink-0" data-state={contentIsModerated ? "on" : "off"}>
          <div className="toggle-thumb" />
        </div>
      </button>
    </div>
  );

  // Shared links section JSX
  const linksSection = (
    <div>
      <button
        type="button"
        onClick={() => {
          const next = !showLinks;
          setShowLinks(next);
          if (next && links.length === 0) setLinks([""]);
        }}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="min-w-0 text-left">
          <div className="section-kicker">Outbound Links</div>
          <div className="mt-1 text-[13px] text-foreground font-display font-medium">Add links</div>
          <div className="text-[11px] text-muted-foreground">Website, social profiles, or docs.</div>
        </div>
        <div className="toggle-track shrink-0" data-state={showLinks ? "on" : "off"}>
          <div className="toggle-thumb" />
        </div>
      </button>

      {showLinks && (
        <div className="mt-3 space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url"
                placeholder="https://..."
                value={link}
                onChange={(e) => {
                  const updated = [...links];
                  updated[i] = e.target.value;
                  setLinks(updated);
                }}
                className="field-input h-10 flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  if (links.length <= 1) {
                    setLinks([""]);
                    return;
                  }
                  setLinks(links.filter((_, j) => j !== i));
                }}
                className="border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-loss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {links.length < 5 && (
            <button
              type="button"
              onClick={() => setLinks([...links, ""])}
              className="text-[12px] font-display tracking-[0.02em] text-muted-foreground transition-colors hover:text-primary"
            >
              + Add another
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Identity section JSX (shared)
  const identitySection = (
    <div className="space-y-3">
      <div>
        <div className="section-kicker">Identity</div>
        <div className="mt-1 text-[13px] text-muted-foreground">
          Set the coin identity and channel details.
        </div>
      </div>

      <div className="flex items-start gap-3">
        <label className="cursor-pointer flex-shrink-0">
          <input
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="hidden"
          />
          <div className="field-input !p-0 flex h-[88px] w-[88px] items-center justify-center overflow-hidden transition-colors hover:bg-[hsl(var(--foreground)/0.08)]">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Coin logo"
                className="h-full w-full object-cover"
              />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        </label>

        <div className="flex-1 min-w-0 space-y-2">
          <input
            type="text"
            placeholder="Coin name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            className="field-input h-10 text-sm"
          />
          <input
            type="text"
            placeholder="SYMBOL"
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
            maxLength={10}
            className="field-input h-10 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <input
          type="text"
          placeholder="Description"
          value={tokenDescription}
          onChange={(e) => setTokenDescription(e.target.value)}
          className="field-input h-10 text-sm"
        />
      </div>
    </div>
  );

  // Main form layout
  return (
    <main className="min-h-screen bg-background">
      <Particles className="!fixed inset-0 -z-10 bg-transparent" quantity={40} size={0.5} />
      <div
        className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 76px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)",
        }}
      >
        {/* Header */}
        <div className="page-header hidden lg:block pt-[88px]">
          <div className="mx-auto w-full">
            <h1 className="page-title">Launch</h1>
            <p className="page-subtitle">Create a new sticker channel with its own coin and community.</p>
          </div>
        </div>

        {/* Mobile: single column */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pt-2 lg:hidden">
          <div className="mx-auto w-full max-w-[1040px] space-y-4 pb-6">
            <div className="slab-panel rounded-[var(--radius)] px-4 py-4 space-y-3">
              {identitySection}
            </div>
            <div className="slab-panel rounded-[var(--radius)] px-4 py-4 space-y-3">
              {moderationSection}
            </div>
            <div className="slab-panel rounded-[var(--radius)] px-4 py-4 space-y-3">
              {linksSection}
            </div>
          </div>
        </div>

        {/* Desktop: two-column layout */}
        <div className="hidden lg:block flex-1 overflow-y-auto scrollbar-hide pt-2">
          <div className="mx-auto w-full space-y-6 pb-10">
            <div className="grid grid-cols-2 gap-6">
              {/* Left column — Identity */}
              <div className="slab-panel rounded-[var(--radius)] px-5 py-5 space-y-4">
                {identitySection}
              </div>

              {/* Right column — Recipient, Links */}
              <div className="slab-panel rounded-[var(--radius)] px-5 py-5 space-y-5">
                {moderationSection}
                <div className="border-t border-[hsl(var(--foreground)/0.1)] pt-5">
                  {linksSection}
                </div>
              </div>
            </div>

            {/* Full-width Launch bar */}
            <div className="slab-panel rounded-[var(--radius)] px-5 py-5">
              {launchButtonBlock}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Action Bar — solid black, no border */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-black lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <div className="flex w-full max-w-[520px] mx-auto items-center gap-3 px-4 py-3">
          <div className="flex shrink-0 items-center gap-4">
            <div>
              <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Pay</div>
              <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
                ${formatNumber(usdcAmount)}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.02em] text-muted-foreground">Balance</div>
              <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
                ${formatNumber(usdcBalance ? Number(formatUnits(usdcBalance, QUOTE_TOKEN_DECIMALS)) : 0)}
              </div>
            </div>
          </div>
          {!isConnected ? (
            <button
              onClick={() => connect()}
              disabled={isConnecting}
              className="slab-button flex-1 text-[11px] disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={!isFormValid || isLaunching || isUploading}
              className={`flex-1 px-4 text-[11px] ${
                launchError || txStatus === "error"
                  ? "slab-button-ghost text-muted-foreground"
                  : !isFormValid || isLaunching || isUploading
                  ? "slab-button opacity-50"
                  : "slab-button"
              }`}
            >
              {launchError || txStatus === "error"
                ? txError?.message?.includes("cancelled") ? "Rejected" : "Failed"
                : isUploading
                ? "Uploading..."
                : isLaunching
                ? "Launching..."
                : "Launch"}
            </button>
          )}
        </div>
      </div>

      {/* Success */}
      {txStatus === "success" && txHash && (
        <div className="fixed inset-0 bottom-[70px] z-[50] flex w-screen justify-center bg-background/80 backdrop-blur-xl">
          <div
            className="glass-panel relative flex h-full w-full max-w-[520px] flex-col items-center justify-center px-6"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            }}
          >
            <div className="text-center space-y-6 max-w-xs">
              {/* Token preview */}
              {logoPreview && (
                <div className="flex justify-center">
                  <img src={logoPreview} alt={tokenName} className="border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] h-24 w-24 object-cover" />
                </div>
              )}

              {/* Message */}
              <div>
                <h2 className="mb-2 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">Channel Launched!</h2>
                <p className="text-[15px] text-muted-foreground">
                  <span className="font-display font-semibold text-foreground">{tokenName}</span>
                  {" "}({tokenSymbol}) is now live
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2 w-full">
                <Link
                  href={launchedContentAddress ? `/channel/${launchedContentAddress}` : "/explore"}
                  className="slab-button block w-full px-4 py-3.5 text-[11px]"
                >
                  View Channel
                </Link>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="slab-button-ghost block w-full px-4 py-3.5 text-[11px]"
                >
                  View on Basescan
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
