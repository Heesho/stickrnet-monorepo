"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTokenMetadata } from "@/hooks/useMetadata";
import { CONTRACT_ADDRESSES, ERC20_ABI, MOCK_MINT_ABI, QUOTE_TOKEN_DECIMALS } from "@/lib/contracts";
import type { UserHolding, UserLaunchedChannel } from "@/hooks/useUserProfile";
import { Wallet, Rocket } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { TokenLogo } from "@/components/token-logo";
import { useSparklineData } from "@/hooks/useSparklineData";

type Tab = "holdings" | "launched";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 0.01) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value > 0) return `<$0.01`;
  return "$0.00";
}

/** Mini sparkline chart */
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const pad = 4;

  const divisor = data.length > 1 ? data.length - 1 : 1;
  const points = data
    .map((value, i) => {
      const x = pad + (i / divisor) * (300 - pad * 2);
      const y = range === 0 ? 50 : pad + (1 - (value - min) / range) * (100 - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 300 100"
      className={`w-24 h-8 ${isPositive ? "text-[#A78BFA]" : "text-[#2DD4BF]"}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HoldingRow
// ---------------------------------------------------------------------------

function HoldingRow({ holding, sparklineData }: { holding: UserHolding; sparklineData: number[] }) {
  const { logoUrl } = useTokenMetadata(holding.uri);
  const isPositive = holding.change24h >= 0;

  return (
    <Link
      href={`/channel/${holding.address}`}
      className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 py-4 transition-colors duration-200 hover:bg-zinc-800"
    >
      <div className="flex items-center gap-3">
        <TokenLogo name={holding.tokenName} logoUrl={logoUrl} size="md-lg" />
        <div>
          <div className="font-semibold text-[15px] font-display">
            {holding.tokenSymbol.length > 6
              ? `${holding.tokenSymbol.slice(0, 6)}...`
              : holding.tokenSymbol}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {holding.tokenName.length > 12
              ? `${holding.tokenName.slice(0, 12)}...`
              : holding.tokenName}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Sparkline data={sparklineData} isPositive={isPositive} />
      </div>
      <div className="text-right">
        <div className="font-medium text-[15px] tabular-nums font-mono">
          {holding.valueUsd > 0 ? formatUsd(holding.valueUsd) : "--"}
        </div>
        <div className={`text-[13px] tabular-nums font-mono ${
          holding.priceUsd > 0
            ? isPositive ? "text-[#A78BFA]" : "text-[#2DD4BF]"
            : "text-foreground/60"
        }`}>
          {holding.priceUsd > 0
            ? `${isPositive ? "+" : ""}${holding.change24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : "--"}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// LaunchedRow
// ---------------------------------------------------------------------------

function LaunchedRow({ channel, sparklineData }: { channel: UserLaunchedChannel; sparklineData: number[] }) {
  const { logoUrl } = useTokenMetadata(channel.uri);
  const isPositive = channel.change24h >= 0;

  return (
    <Link
      href={`/channel/${channel.address}`}
      className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 py-4 transition-colors duration-200 hover:bg-zinc-800"
    >
      <div className="flex items-center gap-3">
        <TokenLogo name={channel.tokenName} logoUrl={logoUrl} size="md-lg" />
        <div>
          <div className="font-semibold text-[15px] font-display">
            {channel.tokenSymbol.length > 6
              ? `${channel.tokenSymbol.slice(0, 6)}...`
              : channel.tokenSymbol}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {channel.tokenName.length > 12
              ? `${channel.tokenName.slice(0, 12)}...`
              : channel.tokenName}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Sparkline data={sparklineData} isPositive={isPositive} />
      </div>
      <div className="text-right">
        <div className="font-medium text-[15px] tabular-nums font-mono">
          {channel.marketCapUsd > 0 ? formatUsd(channel.marketCapUsd) : "--"}
        </div>
        <div className={`text-[13px] tabular-nums font-mono ${
          channel.coinPrice > 0
            ? isPositive ? "text-[#A78BFA]" : "text-[#2DD4BF]"
            : "text-foreground/60"
        }`}>
          {channel.coinPrice > 0
            ? `${isPositive ? "+" : ""}${channel.change24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : "--"}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 py-4">
            <div className="w-12 h-12 rounded-full bg-secondary animate-pulse" />
            <div>
              <div className="w-28 h-5 bg-secondary rounded-none animate-pulse mb-1" />
              <div className="w-20 h-4 bg-secondary rounded-none animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex border-b border-secondary mx-4 mb-4">
          <div className="w-24 h-8 bg-secondary rounded-none animate-pulse mr-4" />
          <div className="w-24 h-8 bg-secondary rounded-none animate-pulse" />
        </div>
        <div className="flex-1 px-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="w-10 h-10 rounded-none bg-secondary animate-pulse" />
              <div className="flex-1">
                <div className="w-24 h-4 bg-secondary rounded-none animate-pulse mb-1" />
                <div className="w-16 h-3 bg-secondary rounded-none animate-pulse" />
              </div>
              <div className="text-right">
                <div className="w-16 h-4 bg-secondary rounded-none animate-pulse mb-1" />
                <div className="w-12 h-3 bg-secondary rounded-none animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <NavBar />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Not Connected state
// ---------------------------------------------------------------------------

function NotConnected() {
  const { isInFrame, isConnecting, connect } = useFarcaster();

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-none bg-secondary flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          {isInFrame ? (
            <>
              <div className="text-[17px] font-semibold mb-1 font-display">
                Connecting...
              </div>
              <div className="text-[14px] text-muted-foreground">
                Connecting your Farcaster wallet
              </div>
            </>
          ) : (
            <>
              <div className="text-[17px] font-semibold mb-1 font-display">
                Connect your wallet
              </div>
              <div className="text-[14px] text-muted-foreground mb-4">
                Connect a browser wallet to continue
              </div>
              <button
                onClick={() => connect()}
                disabled={isConnecting}
                className="px-6 py-2.5 rounded-none bg-white text-black text-[14px] font-semibold font-display hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </>
          )}
        </div>
        <NavBar />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main Profile Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>("holdings");

  // Data hooks
  const { user, address } = useFarcaster();
  const { holdings, launchedChannels, totalHoldingsValueUsd, isLoading } = useUserProfile(address);

  // Sparkline data for holdings + launched
  const allCoinAddresses = [
    ...holdings.map((h) => h.coinAddress),
    ...launchedChannels.map((c) => c.coinAddress),
  ];
  const { getSparkline } = useSparklineData(allCoinAddresses);

  // USDC balance
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Mock USDC mint (staging only)
  const {
    writeContract: mintUsdc,
    data: usdcTxHash,
    isPending: isUsdcMintPending,
    reset: resetUsdcMint,
  } = useWriteContract();

  const { isLoading: isUsdcTxConfirming, isSuccess: isUsdcTxSuccess } =
    useWaitForTransactionReceipt({ hash: usdcTxHash });

  useEffect(() => {
    if (isUsdcTxSuccess) {
      refetchUsdc();
      resetUsdcMint();
    }
  }, [isUsdcTxSuccess, refetchUsdc, resetUsdcMint]);

  if (!address) {
    return <NotConnected />;
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  const usdcNum = usdcBalance != null ? Number(formatUnits(usdcBalance as bigint, QUOTE_TOKEN_DECIMALS)) : 0;
  const formattedUsdc = usdcBalance != null
    ? usdcNum.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "--";

  const isUsdcMinting = isUsdcMintPending || isUsdcTxConfirming;
  const totalValueUsd = usdcNum + totalHoldingsValueUsd;
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = user?.displayName || user?.username || shortAddress;
  const pfpUrl = user?.pfpUrl || null;
  const username = user?.username ? `@${user.username}` : null;
  const isAddressFallbackAvatar = !user?.displayName && !user?.username;
  const avatarFallback = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user?.username
      ? user.username.charAt(0).toUpperCase()
      : address.slice(-2).toUpperCase();

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Header */}
        <div className="px-4 pb-2">
          <div className="mb-3">
            <h1 className="text-2xl font-bold tracking-tight font-display">Profile</h1>
            <p className="text-[13px] text-muted-foreground mt-1">Your portfolio, holdings, and launched channels</p>
          </div>
          <div className="flex items-center gap-3 py-3">
            {pfpUrl ? (
              <img
                src={pfpUrl}
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-12 h-12 rounded-none flex items-center justify-center text-white ${
                  isAddressFallbackAvatar
                    ? "font-mono text-[15px] tracking-wide bg-zinc-800"
                    : "font-semibold text-lg bg-zinc-800"
                }`}
              >
                {avatarFallback}
              </div>
            )}
            <div>
              <div className="text-[17px] font-semibold font-display">{displayName}</div>
              {username && (
                <div className="text-[13px] text-muted-foreground">
                  {username}
                </div>
              )}
            </div>
          </div>

          {/* Portfolio value */}
          <div className="pb-3">
            <div className="text-[12px] text-muted-foreground mb-0.5">
              Portfolio value
            </div>
            <div className="text-[28px] font-bold tabular-nums font-mono">
              {totalValueUsd > 0 ? formatUsd(totalValueUsd) : "$0.00"}
            </div>
          </div>

          {/* Cash Balance */}
          <div className="pb-3">
            <div className="text-[12px] text-muted-foreground mb-1">
              Cash Balance
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[18px] font-semibold tabular-nums font-mono">
                ${formattedUsdc}
              </div>
              <button
                onClick={() =>
                  mintUsdc({
                    address: CONTRACT_ADDRESSES.usdc as `0x${string}`,
                    abi: MOCK_MINT_ABI,
                    functionName: "mint",
                    args: [address!, parseUnits("1000", QUOTE_TOKEN_DECIMALS)],
                  })
                }
                disabled={isUsdcMinting}
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {isUsdcMinting ? "Minting..." : "Mint 1000"}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pb-3">
          <button
            onClick={() => setActiveTab("holdings")}
            className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-none text-[13px] font-medium font-display transition-all ${
              activeTab === "holdings"
                ? "bg-white text-black"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Coins
          </button>
          <button
            onClick={() => setActiveTab("launched")}
            className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-none text-[13px] font-medium font-display transition-all ${
              activeTab === "launched"
                ? "bg-white text-black"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            Channels
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4">
          {activeTab === "holdings" && (
            <>
              {holdings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-none bg-secondary flex items-center justify-center mb-3">
                    <svg
                      className="w-6 h-6 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 9h16.5m-16.5 6h16.5m-15-9h13.5A2.25 2.25 0 0121 8.25v7.5A2.25 2.25 0 0118.75 18H5.25A2.25 2.25 0 013 15.75v-7.5A2.25 2.25 0 015.25 6z"
                      />
                    </svg>
                  </div>
                  <div className="text-[15px] font-medium mb-1 font-display">
                    No holdings yet
                  </div>
                  <div className="text-[13px] text-muted-foreground mb-4">
                    Collect content or trade to earn coins
                  </div>
                  <Link
                    href="/explore"
                    className="px-4 py-2 rounded-none bg-white text-black text-[13px] font-semibold font-display hover:bg-zinc-200 transition-colors"
                  >
                    Explore channels
                  </Link>
                </div>
              ) : (
                <div className="py-1">
                  {holdings.map((holding) => {
                    const hourly = getSparkline(holding.coinAddress, holding.priceUsd);
                    const sparklineData = hourly.length > 1 ? hourly
                      : holding.sparklinePrices.length > 1 ? holding.sparklinePrices
                      : [holding.priceUsd, holding.priceUsd];
                    return (
                      <HoldingRow
                        key={holding.coinAddress}
                        holding={holding}
                        sparklineData={sparklineData}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "launched" && (
            <>
              {launchedChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 rounded-none bg-secondary flex items-center justify-center mb-3">
                    <svg
                      className="w-6 h-6 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-[15px] font-medium mb-1 font-display">
                    No launches yet
                  </div>
                  <div className="text-[13px] text-muted-foreground mb-4">
                    You haven&apos;t launched any channels yet
                  </div>
                  <Link
                    href="/launch"
                    className="px-4 py-2 rounded-none bg-white text-black text-[13px] font-semibold font-display hover:bg-zinc-200 transition-colors"
                  >
                    Launch a channel
                  </Link>
                </div>
              ) : (
                <div className="py-1">
                  {launchedChannels.map((channel) => {
                    const hourly = getSparkline(channel.coinAddress, channel.coinPrice);
                    const sparklineData = hourly.length > 1 ? hourly
                      : channel.sparklinePrices.length > 1 ? channel.sparklinePrices
                      : [channel.coinPrice, channel.coinPrice];
                    return (
                      <LaunchedRow
                        key={channel.address}
                        channel={channel}
                        sparklineData={sparklineData}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <NavBar />
      </div>
    </main>
  );
}
