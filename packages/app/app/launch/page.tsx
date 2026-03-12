"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload, X } from "lucide-react";
import { parseUnits, formatUnits, parseEventLogs } from "viem";
import { useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
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

  // Extract content address from tx receipt
  const [launchedContentAddress, setLaunchedContentAddress] = useState<string | null>(null);
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

  // Parse from sequential tx receipt
  useEffect(() => {
    if (!txReceipt?.logs || launchedContentAddress) return;
    const addr = extractContentAddress(txReceipt.logs);
    if (addr) setLaunchedContentAddress(addr);
  }, [txReceipt, launchedContentAddress]);

  // Parse from EIP-5792 batch receipts (batch mode may not populate txHash)
  useEffect(() => {
    if (!batchReceipts || launchedContentAddress) return;
    for (const receipt of batchReceipts) {
      if (receipt.logs) {
        const addr = extractContentAddress(receipt.logs as never);
        if (addr) {
          setLaunchedContentAddress(addr);
          break;
        }
      }
    }
  }, [batchReceipts, launchedContentAddress]);

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
      } catch (err) {
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
      const auctionEpochPeriodWei = LAUNCH_DEFAULTS.auctionEpochPeriod;
      const auctionPriceMultiplierWei = LAUNCH_DEFAULTS.auctionPriceMultiplier;

      const multicallAddress = CONTRACT_ADDRESSES.multicall as `0x${string}`;
      const quoteToken = CONTRACT_ADDRESSES.usdc as `0x${string}`;

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
        auctionEpochPeriod: auctionEpochPeriodWei,
        auctionPriceMultiplier: auctionPriceMultiplierWei,
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

  // Main form layout
  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
        }}
      >
        {/* Header */}
        <div className="px-4 pb-2">
          <h1 className="text-2xl font-bold tracking-tight font-display">Launch</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Create a channel and start collecting content</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-2">
          {/* All form fields -- uniform 8px gap */}
          <div className="space-y-2">
            {/* Logo + Name + Symbol Row */}
            <div className="flex items-start gap-2">
              <label className="cursor-pointer flex-shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
                <div className="w-[88px] h-[88px] rounded-none bg-secondary flex items-center justify-center overflow-hidden hover:bg-secondary/80 transition-colors">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Coin logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Upload className="w-6 h-6 text-foreground/50" />
                  )}
                </div>
              </label>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="text"
                  placeholder="Coin name"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="w-full h-10 px-3 rounded-none bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-sm"
                />
                <input
                  type="text"
                  placeholder="SYMBOL"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="w-full h-10 px-3 rounded-none bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-sm"
                />
              </div>
            </div>
            <input
              type="text"
              placeholder="Description"
              value={tokenDescription}
              onChange={(e) => setTokenDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-none bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-sm"
            />
          </div>

          {/* Content moderation toggle */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setContentIsModerated(!contentIsModerated)}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-foreground font-display font-medium">Moderated content</span>
                <span className="text-[11px] text-muted-foreground">require approval for new stickers</span>
              </div>
              <div className={`w-9 h-5 rounded-none transition-colors relative ${contentIsModerated ? "bg-white" : "bg-zinc-800"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-none transition-all ${contentIsModerated ? "left-[18px] bg-black" : "left-0.5 bg-zinc-800"}`} />
              </div>
            </button>
          </div>

          {/* Links toggle */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                const next = !showLinks;
                setShowLinks(next);
                if (next && links.length === 0) setLinks([""]);
              }}
              className="flex items-center justify-between w-full py-2"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-foreground font-display font-medium">Add links</span>
                <span className="text-[11px] text-muted-foreground">websites, socials</span>
              </div>
              <div className={`w-9 h-5 rounded-none transition-colors relative ${showLinks ? "bg-white" : "bg-zinc-800"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-none transition-all ${showLinks ? "left-[18px] bg-black" : "left-0.5 bg-zinc-800"}`} />
              </div>
            </button>

            {showLinks && (
              <div className="space-y-2 mt-2">
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
                      className="flex-1 h-10 px-3 rounded-none bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-sm"
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
                      className="px-2 text-foreground/50 hover:text-foreground/70 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {links.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setLinks([...links, ""])}
                    className="text-[12px] text-foreground/50 hover:text-foreground/70 transition-colors"
                  >
                    + Add another
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Action Bar */}
        <div className="mt-auto px-4 py-3 bg-background">
          <div className="flex items-center gap-4 w-full">
            <div className="flex items-center gap-5 shrink-0">
              <div>
                <div className="text-muted-foreground text-[12px]">Pay</div>
                <div className="font-semibold text-[17px] tabular-nums font-mono">
                  ${formatNumber(usdcAmount)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[12px]">Balance</div>
                <div className="font-semibold text-[17px] tabular-nums font-mono">
                  ${formatNumber(usdcBalance ? Number(formatUnits(usdcBalance, QUOTE_TOKEN_DECIMALS)) : 0)}
                </div>
              </div>
            </div>
            {!isConnected ? (
              <button
                onClick={() => connect()}
                disabled={isConnecting}
                className="w-40 h-10 text-[14px] font-semibold font-display rounded-none bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={!isFormValid || isLaunching || isUploading}
                className={`flex-1 h-10 text-[15px] font-semibold font-display rounded-none transition-all ${
                  launchError || txStatus === "error"
                    ? "bg-zinc-800 text-foreground/70"
                    : !isFormValid || isLaunching || isUploading
                    ? "bg-zinc-800 text-foreground/50 cursor-not-allowed"
                    : "bg-white text-black hover:bg-zinc-200"
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
      </div>

      {/* Nav Bar */}
      <NavBar />

      {/* Success */}
      {txStatus === "success" && txHash && (
        <div className="fixed inset-0 bottom-[70px] z-[50] flex w-screen justify-center bg-zinc-800">
          <div
            className="relative flex h-full w-full max-w-[520px] flex-col bg-background items-center justify-center px-6"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            }}
          >
            <div className="text-center space-y-6 max-w-xs">
              {/* Token preview */}
              {logoPreview && (
                <div className="flex justify-center">
                  <img src={logoPreview} alt={tokenName} className="w-24 h-24 rounded-none object-cover ring-2 ring-zinc-800" />
                </div>
              )}

              {/* Message */}
              <div>
                <h2 className="text-2xl font-bold text-white mb-2 font-display">Channel Launched!</h2>
                <p className="text-foreground/60 text-[15px]">
                  <span className="font-semibold text-white font-display">{tokenName}</span>
                  {" "}({tokenSymbol}) is now live
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2 w-full">
                <Link
                  href={launchedContentAddress ? `/channel/${launchedContentAddress}` : "/explore"}
                  className="block w-full py-3.5 px-4 bg-white text-black font-semibold font-display text-[15px] rounded-none hover:bg-zinc-200 transition-colors"
                >
                  View Channel
                </Link>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3.5 px-4 bg-zinc-800 text-white font-semibold font-display text-[15px] rounded-none hover:bg-zinc-800/80 transition-colors"
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
