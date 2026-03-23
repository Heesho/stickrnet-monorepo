"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowLeftRight, Share2, Loader2, CheckCircle, ImagePlus, Flame, Clock, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits } from "viem";
import { NavBar } from "@/components/nav-bar";
import { CollectModal } from "@/components/collect-modal";
import { TradeModal } from "@/components/trade-modal";
import { AuctionModal } from "@/components/auction-modal";
import { LiquidityModal } from "@/components/liquidity-modal";
import { AdminModal } from "@/components/admin-modal";
import { CreateContentModal } from "@/components/create-content-modal";
import { useChannelState } from "@/hooks/useChannelState";
import { useTokenMetadata, useBatchMetadata } from "@/hooks/useMetadata";
import type { TokenMetadata } from "@/hooks/useMetadata";
import { useContentFeed } from "@/hooks/useContentFeed";
import { useFarcaster, composeCast } from "@/hooks/useFarcaster";
import { useDexScreener } from "@/hooks/useDexScreener";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import {
  useBatchedTransaction,
  encodeContractCall,
  type Call,
} from "@/hooks/useBatchedTransaction";
import {
  QUOTE_TOKEN_DECIMALS,
} from "@/lib/contracts";
import {
  getChannel,
  getChannelAccount,
  getContentPositions,
  type SubgraphContentPosition,
} from "@/lib/subgraph-launchpad";
import { ipfsToHttp } from "@/lib/constants";
import { truncateAddress, formatPrice, formatNumber, formatMarketCap } from "@/lib/format";
import { PriceChart, type HoverData } from "@/components/price-chart";
import { TokenLogo } from "@/components/token-logo";

type Timeframe = "1H" | "1D" | "1W" | "1M" | "ALL";

// Clickable address component
function AddressLink({ address }: { address: string | null }) {
  if (!address) return <span>None</span>;
  return (
    <a
      href={`https://basescan.org/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline hover:text-white transition-colors"
    >
      {truncateAddress(address)}
    </a>
  );
}

// Dutch auction price decay (linear over 1 day)
const CONTENT_EPOCH_PERIOD = 86400; // 1 day in seconds

function getDecayedPrice(initPrice: string, startTime: string): number {
  const now = Math.floor(Date.now() / 1000);
  const timePassed = now - parseInt(startTime);
  // initPrice from subgraph is already in human-readable USDC (convertTokenToDecimal)
  const init = parseFloat(initPrice);
  if (timePassed >= CONTENT_EPOCH_PERIOD) return 0;
  if (timePassed <= 0) return init;
  return init - (init * timePassed) / CONTENT_EPOCH_PERIOD;
}

// Format UPS emission (per period) - BigInt string with 18 decimals
function formatEmission(ups: string | undefined): string {
  if (!ups) return "0";
  const value = parseFloat(ups) / 1e18;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M/week`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K/week`;
  return `${value.toFixed(2)}/week`;
}

// Format time period (seconds to human readable)
function formatPeriod(seconds: string | undefined): string {
  if (!seconds) return "0";
  const secs = parseInt(seconds);
  const formatUnit = (value: number, singular: string, plural: string) =>
    `${value} ${value === 1 ? singular : plural}`;

  if (secs >= 86400 * 365) {
    const years = secs / (86400 * 365);
    const roundedYears = years >= 10 ? Math.round(years) : Number(years.toFixed(1));
    return formatUnit(roundedYears, "year", "years");
  }
  if (secs >= 86400 * 30) return formatUnit(Math.round(secs / (86400 * 30)), "month", "months");
  if (secs >= 86400 * 7) return formatUnit(Math.round(secs / (86400 * 7)), "week", "weeks");
  if (secs >= 86400) return formatUnit(Math.round(secs / 86400), "day", "days");
  if (secs >= 3600) return formatUnit(Math.round(secs / 3600), "hour", "hours");
  if (secs >= 60) return formatUnit(Math.round(secs / 60), "min", "min");
  return `${secs}s`;
}

const REWARDER_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Loading skeleton for the page
function LoadingSkeleton() {
  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <Link
            href="/explore"
            className="p-2 -ml-2 rounded-none hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="text-center opacity-0">
            <div className="text-[15px] font-semibold">--</div>
          </div>
          <div className="p-2 -mr-2" />
        </div>

        {/* Content skeleton */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4">
          {/* Token info skeleton */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-none bg-secondary animate-pulse" />
              <div>
                <div className="w-16 h-4 bg-secondary rounded animate-pulse mb-1" />
                <div className="w-24 h-5 bg-secondary rounded animate-pulse" />
              </div>
            </div>
            <div className="text-right">
              <div className="w-20 h-6 bg-secondary rounded animate-pulse mb-1" />
              <div className="w-14 h-4 bg-secondary rounded animate-pulse" />
            </div>
          </div>

          {/* Chart skeleton */}
          <div className="h-44 mb-2 -mx-4 bg-secondary/30 animate-pulse rounded" />

          {/* Timeframe selector skeleton */}
          <div className="flex justify-between mb-5 px-2">
            {["1H", "1D", "1W", "1M", "ALL"].map((tf) => (
              <div key={tf} className="px-3.5 py-1.5 rounded-none bg-secondary/50 text-[13px] text-muted-foreground">
                {tf}
              </div>
            ))}
          </div>

          {/* Stats skeleton */}
          <div className="mb-6">
            <div className="w-16 h-6 bg-secondary rounded animate-pulse mb-3" />
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <div className="w-20 h-3 bg-secondary rounded animate-pulse mb-1" />
                  <div className="w-16 h-5 bg-secondary rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* About skeleton */}
          <div className="mb-6">
            <div className="w-16 h-6 bg-secondary rounded animate-pulse mb-3" />
            <div className="w-full h-4 bg-secondary rounded animate-pulse mb-2" />
            <div className="w-3/4 h-4 bg-secondary rounded animate-pulse mb-2" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ChannelDetailPage() {
  const params = useParams();
  const address = (params?.address as string)?.toLowerCase() || "";
  const contentAddress = address as `0x${string}`;

  // Farcaster context for connected wallet
  const { address: account, isConnected, isInFrame, isConnecting, connect } = useFarcaster();
  const [view, setView] = useState<"channel" | "trade">("channel");
  const tradeViewChainRefetchInterval = view === "trade" ? 1_000 : 5_000;
  const tradeViewSubgraphRefetchInterval = view === "trade" ? 5_000 : 30_000;

  // Fetch channel data from subgraph
  const { data: subgraphChannel, isLoading: isSubgraphLoading } = useQuery({
    queryKey: ["channel", address],
    queryFn: () => getChannel(address),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: tradeViewSubgraphRefetchInterval,
  });

  const { data: channelAccount, refetch: refetchChannelAccount } = useQuery({
    queryKey: ["channel-account", address, account],
    queryFn: () => getChannelAccount(address, account!),
    enabled: !!address && !!account,
    staleTime: 30_000,
    refetchInterval: isConnected ? tradeViewSubgraphRefetchInterval : false,
  });

  const totalContentCount = Number(subgraphChannel?.contentCount ?? "0");
  const { data: channelContentPositions = [] } = useQuery({
    queryKey: ["channel-content-positions", address, totalContentCount],
    queryFn: async () => {
      const pageSize = 200;
      const positions: SubgraphContentPosition[] = [];
      for (let skip = 0; skip < totalContentCount; skip += pageSize) {
        const page = await getContentPositions(address, pageSize, skip);
        positions.push(...page);
        if (page.length < pageSize) break;
      }
      return positions;
    },
    enabled: !!address && !!account && totalContentCount > 0,
    staleTime: 30_000,
    refetchInterval: view === "trade" ? 15_000 : false,
  });

  // Fetch on-chain coin state via multicall
  const {
    coinState,
    refetch: refetchState,
    isLoading: isCoinStateLoading,
  } = useChannelState(contentAddress, account, true, tradeViewChainRefetchInterval);

  // Normalize fields
  const coinPrice = coinState?.priceInQuote;
  const channelUri = subgraphChannel?.uri || coinState?.uri;
  const accountCoinBalance = coinState?.accountCoinBalance;
  const accountQuoteBalance = coinState?.accountQuoteBalance;

  // Coin address from subgraph
  const coinAddress = subgraphChannel?.coin as `0x${string}` | undefined;

  // Prefer subgraph metadata and fall back to the app resolver while metadata backfills
  const { metadata: fallbackMetadata, logoUrl: fallbackLogoUrl } = useTokenMetadata(
    subgraphChannel?.metadata ? undefined : channelUri
  );
  const metadata = subgraphChannel?.metadata ?? fallbackMetadata;
  const logoUrl = subgraphChannel?.metadata?.imageUri
    ? ipfsToHttp(subgraphChannel.metadata.imageUri)
    : fallbackLogoUrl;
  const adminMetadata = useMemo<TokenMetadata | undefined>(() => {
    if (!metadata) return undefined;

    let image: string | undefined;
    if ("imageUri" in metadata) {
      image = metadata.imageUri ?? undefined;
    } else {
      image = (metadata as TokenMetadata).image ?? undefined;
    }

    return {
      name: metadata.name ?? undefined,
      symbol: metadata.symbol ?? undefined,
      image: image ?? undefined,
      description: metadata.description ?? undefined,
      defaultMessage: metadata.defaultMessage ?? undefined,
      recipientName: metadata.recipientName ?? undefined,
      links: metadata.links ?? undefined,
    };
  }, [metadata]);

  // Fetch DexScreener data for liquidity/volume/price change
  const { pairData } = useDexScreener(contentAddress, coinAddress);

  // Content feed (stickers) — fast polling after creation to catch subgraph indexing
  const [contentFastPoll, setContentFastPoll] = useState(false);
  const { contents, isLoading: isContentLoading, refetch: refetchContent } = useContentFeed(address, 20, 0, contentFastPoll);
  const contentUris = useMemo(
    () => contents.filter((c) => !c.metadata).map((c) => c.uri).filter(Boolean),
    [contents]
  );
  const { metadataMap } = useBatchMetadata(contentUris);

  // Claim transactions
  const {
    execute: executeTokenClaim,
    status: tokenClaimStatus,
    error: tokenClaimError,
    reset: resetTokenClaim,
  } = useBatchedTransaction();

  // Derived values
  const tokenName = subgraphChannel?.name || "Loading...";
  const tokenSymbol = subgraphChannel?.symbol || "--";

  // Price in USD = priceInQuote (scaled by quote decimals, USDC = 6)
  const priceUsd = coinPrice
    ? Number(formatUnits(coinPrice, QUOTE_TOKEN_DECIMALS))
    : 0;

  // Total supply from coinState
  const totalSupplyRaw = coinState?.totalSupply
    ? Number(formatEther(coinState.totalSupply))
    : 0;
  const totalSupply = totalSupplyRaw;

  // Market cap = totalSupply * priceUsd
  const marketCapUsd =
    priceUsd > 0 && totalSupplyRaw > 0
      ? totalSupplyRaw * priceUsd
      : 0;

  // User position
  const userCoinBalance = accountCoinBalance
    ? Number(formatEther(accountCoinBalance))
    : 0;
  const positionBalanceUsd = userCoinBalance * priceUsd;

  // User quote balance (USDC, 6 decimals)
  const userQuoteBalance = accountQuoteBalance
    ? Number(formatUnits(accountQuoteBalance, QUOTE_TOKEN_DECIMALS))
    : 0;

  // Content stats from coinState
  const contentOwned = coinState?.accountContentOwned
    ? Number(coinState.accountContentOwned)
    : 0;
  const coinEarned = coinState?.accountCoinClaimable
    ? Number(formatEther(coinState.accountCoinClaimable))
    : 0;

  const normalizedAccount = account?.toLowerCase();
  const ownedContentPositions = useMemo(
    () =>
      normalizedAccount
        ? channelContentPositions.filter((content) => content.owner.id.toLowerCase() === normalizedAccount)
        : [],
    [channelContentPositions, normalizedAccount]
  );
  const createdContentPositions = useMemo(
    () =>
      normalizedAccount
        ? channelContentPositions.filter((content) => content.creator.id.toLowerCase() === normalizedAccount)
        : [],
    [channelContentPositions, normalizedAccount]
  );

  const getContentMarketValue = useCallback(
    (content: SubgraphContentPosition) =>
      content.isApproved ? getDecayedPrice(content.initPrice, content.startTime) : 0,
    []
  );

  const collectionStickerCount = Math.max(contentOwned, ownedContentPositions.length);
  const collectionMarketValue = useMemo(
    () => ownedContentPositions.reduce((sum, content) => sum + getContentMarketValue(content), 0),
    [ownedContentPositions, getContentMarketValue]
  );
  const creationStickerCount = Math.max(
    channelAccount?.contentCreated ? Number(channelAccount.contentCreated) : 0,
    createdContentPositions.length
  );
  const creationsMarketValue = useMemo(
    () => createdContentPositions.reduce((sum, content) => sum + getContentMarketValue(content), 0),
    [createdContentPositions, getContentMarketValue]
  );
  const creationsCollectCount = useMemo(
    () => createdContentPositions.reduce((sum, content) => sum + Number(content.collectCount), 0),
    [createdContentPositions]
  );
  const totalSpent = channelAccount?.collectSpent
    ? parseFloat(channelAccount.collectSpent)
    : 0;
  const ownerEarned = channelAccount?.ownerEarned
    ? parseFloat(channelAccount.ownerEarned)
    : 0;
  const totalMined = (channelAccount?.rewardsClaimed
    ? parseFloat(channelAccount.rewardsClaimed)
    : 0) + coinEarned;
  const creatorEarned = channelAccount?.creatorEarned
    ? parseFloat(channelAccount.creatorEarned)
    : 0;
  const collectCount = channelAccount?.collectCount
    ? Number(channelAccount.collectCount)
    : 0;
  const hasCollectionSection =
    collectionStickerCount > 0 ||
    collectCount > 0 ||
    totalSpent > 0 ||
    ownerEarned > 0 ||
    totalMined > 0 ||
    coinEarned > 0;
  const hasCreationsSection =
    creationStickerCount > 0 ||
    creatorEarned > 0;

  // Stats from subgraph (primary) + DexScreener (fallback)
  const liquidityUsd = coinState?.liquidityInQuote
    ? Number(formatEther(coinState.liquidityInQuote)) * 2
    : (pairData?.liquidity?.usd ?? 0);
  const volume24h = pairData?.volume?.h24 ?? 0;

  // Revenue from subgraph (BigDecimal strings already in quote token units)
  const treasuryRevenue = subgraphChannel?.treasuryRevenue
    ? parseFloat(subgraphChannel.treasuryRevenue)
    : 0;
  const teamRevenue = subgraphChannel?.teamRevenue
    ? parseFloat(subgraphChannel.teamRevenue)
    : 0;

  // Launcher address from subgraph
  const launcherAddress = subgraphChannel?.launcher?.id || null;

  // Ownership check: compare connected wallet to launcher address
  const isOwner = !!(
    account &&
    launcherAddress &&
    account.toLowerCase() === launcherAddress.toLowerCase()
  );

  // Created date from subgraph (needed for chart)
  const createdAtTimestamp = subgraphChannel?.createdAt
    ? Number(subgraphChannel.createdAt)
    : undefined;
  const createdAt = createdAtTimestamp
    ? new Date(createdAtTimestamp * 1000)
    : null;
  const launchDateStr = createdAt ? getRelativeTime(createdAt) : "--";

  // Initial LP price: quoteAmount / coinAmount from launch params
  const initialPrice = useMemo(() => {
    const usdc = parseFloat(subgraphChannel?.quoteAmount ?? "0");
    const coin = parseFloat(subgraphChannel?.coinAmount ?? "0");
    if (coin > 0) return usdc / coin;
    return 0;
  }, [subgraphChannel?.quoteAmount, subgraphChannel?.coinAmount]);

  // Chart data from subgraph price history
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const { data: chartData } = usePriceHistory(
    contentAddress,
    timeframe,
    priceUsd,
    createdAtTimestamp,
    initialPrice,
  );

  // Timeframe-based price change: compare first chart data point to current price
  const displayChange = useMemo(() => {
    if (!chartData || chartData.length === 0 || priceUsd === 0) return 0;
    const firstPoint = chartData.find(d => d.value > 0);
    if (!firstPoint || firstPoint.value === 0) return 0;
    return ((priceUsd - firstPoint.value) / firstPoint.value) * 100;
  }, [chartData, priceUsd]);
  const isPositiveTrend = displayChange >= 0;
  const trendColor = isPositiveTrend ? "#A78BFA" : "#2DD4BF";
  const trendButtonClass = isPositiveTrend
    ? "bg-[#A78BFA] text-black hover:bg-[#9575D9]"
    : "bg-[#2DD4BF] text-black hover:bg-[#26B8A5]";

  const [hoverData, setHoverData] = useState<HoverData>(null);
  const handleChartHover = useCallback((data: HoverData) => setHoverData(data), []);

  const [feedSort, setFeedSort] = useState<"bump" | "top" | "new">("bump");
  const [showCreateContentModal, setShowCreateContentModal] = useState(false);

  // Tick every 5s to update decaying prices
  const [, setTick] = useState(0);
  useEffect(() => {
    if (view !== "channel") return;
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [view]);
  const [showHeaderPrice, setShowHeaderPrice] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [collectTokenId, setCollectTokenId] = useState<bigint>(0n);
  const [collectEpochId, setCollectEpochId] = useState<bigint>(0n);
  const [collectPrice, setCollectPrice] = useState<bigint>(0n);
  const [collectImageUrl, setCollectImageUrl] = useState<string | null>(null);
  const [collectCaption, setCollectCaption] = useState<string | null>(null);
  const [collectCreator, setCollectCreator] = useState<string | undefined>();
  const [collectOwner, setCollectOwner] = useState<string | undefined>();
  const [collectCreatedAt, setCollectCreatedAt] = useState<string | undefined>();
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [showAuctionModal, setShowAuctionModal] = useState(false);
  const [showLiquidityModal, setShowLiquidityModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tokenInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const tokenInfo = tokenInfoRef.current;

    if ((isSubgraphLoading || (!!address && isCoinStateLoading)) || !scrollContainer || !tokenInfo) return;

    const handleScroll = () => {
      const tokenInfoBottom = tokenInfo.getBoundingClientRect().bottom;
      const containerTop = scrollContainer.getBoundingClientRect().top;
      setShowHeaderPrice(tokenInfoBottom < containerTop + 10);
    };

    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [address, isCoinStateLoading, isSubgraphLoading, view]);

  // Reset scroll position when switching views
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [view]);

  // Auto-refetch after token claim success, auto-reset after error
  useEffect(() => {
    if (tokenClaimStatus === "success") {
      const timer = setTimeout(() => {
        refetchState();
        refetchChannelAccount();
        resetTokenClaim();
      }, 3000);
      return () => clearTimeout(timer);
    }
    if (tokenClaimStatus === "error") {
      const timer = setTimeout(() => resetTokenClaim(), 2000);
      return () => clearTimeout(timer);
    }
  }, [tokenClaimStatus, refetchState, refetchChannelAccount, resetTokenClaim]);

  const handleCollectionClaim = useCallback(async () => {
    if (!account || !coinState?.rewarder || coinEarned <= 0 || tokenClaimStatus === "pending" || tokenClaimStatus === "confirming") return;
    const calls: Call[] = [
      encodeContractCall(
        coinState.rewarder,
        REWARDER_ABI,
        "getReward",
        [account]
      ),
    ];
    await executeTokenClaim(calls);
  }, [account, coinState?.rewarder, coinEarned, executeTokenClaim, tokenClaimStatus]);

  // Show loading skeleton while critical data loads
  const isLoading = isSubgraphLoading || (!!address && isCoinStateLoading);

  if (isLoading && !subgraphChannel) {
    return <LoadingSkeleton />;
  }

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <Link
            href="/explore"
            className="p-2 -ml-2 rounded-none hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {/* Center - Price appears on scroll */}
          <div className={`text-center transition-opacity duration-200 ${showHeaderPrice ? "opacity-100" : "opacity-0"}`}>
            <div className="text-[15px] font-semibold font-mono">{formatPrice(priceUsd)}</div>
            <div className="text-[15px] font-semibold font-display">{tokenSymbol}</div>
          </div>
          <button
            onClick={() => {
              const url = typeof window !== "undefined" ? window.location.href : "";
              composeCast({ text: `Check out $${tokenSymbol} on Stickrnet`, embeds: [url] });
            }}
            className="p-2 -mr-2 rounded-none hover:bg-secondary transition-colors"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pb-28">
          {/* Token Info Section */}
          <div ref={tokenInfoRef} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <TokenLogo name={tokenName} logoUrl={logoUrl} size="lg" loading="eager" />
              <div>
                <div className="text-[13px] text-muted-foreground">{tokenName}</div>
                <div className="text-[15px] font-medium font-display">{tokenSymbol}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="price-large">
                {hoverData && hoverData.value > 0
                  ? formatPrice(hoverData.value)
                  : formatPrice(priceUsd)}
              </div>
              {hoverData ? (
                <div className="text-[13px] font-medium font-mono text-foreground/60">
                  {new Date(hoverData.time * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              ) : (
                <div className={`text-[13px] font-medium font-mono ${isPositiveTrend ? "text-[#A78BFA]" : "text-[#2DD4BF]"}`}>
                  {`${isPositiveTrend ? "+" : ""}${displayChange.toFixed(2)}%`}
                </div>
              )}
            </div>
          </div>

          {/* Channel View — sticker feed */}
          {view === "channel" && (
            <>
              {/* Sort tabs */}
              {contents.length > 0 && (
                <div className="flex pb-3">
                  {[
                    { key: "bump" as const, label: "Bump", icon: Flame },
                    { key: "new" as const, label: "New", icon: Clock },
                    { key: "top" as const, label: "Top", icon: TrendingUp },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setFeedSort(tab.key)}
                      className={`flex-1 flex items-center justify-center gap-1 h-10 rounded-none text-[12px] font-medium transition-all ${
                        feedSort === tab.key
                          ? "bg-white text-black"
                          : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <tab.icon className="w-3 h-3" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {isContentLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : contents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-12 h-12 rounded-none bg-secondary flex items-center justify-center mb-3">
                    <ImagePlus className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="text-[15px] font-semibold font-display mb-1">No stickers yet</div>
                  <div className="text-[13px] text-muted-foreground max-w-[240px]">
                    Be the first to add a sticker to this channel
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 items-start gap-2 pb-4">
                  {contents
                    .filter((c) => c.isApproved || c.creator.id.toLowerCase() === account?.toLowerCase())
                    .sort((a, b) => {
                      if (feedSort === "bump") return parseInt(b.startTime) - parseInt(a.startTime);
                      if (feedSort === "top") return parseFloat(b.collectVolume) - parseFloat(a.collectVolume);
                      return parseInt(b.createdAt) - parseInt(a.createdAt);
                    })
                    .map((content) => {
                      const fallbackMeta = metadataMap[content.uri];
                      const imageUrl = content.metadata?.imageUri
                        ? ipfsToHttp(content.metadata.imageUri)
                        : fallbackMeta?.imageUrl ?? (fallbackMeta?.image ? ipfsToHttp(fallbackMeta.image) : null);
                      const description = content.metadata?.description || fallbackMeta?.description || null;
                      const hasText = !!description && !imageUrl;

                      const livePrice = getDecayedPrice(content.initPrice, content.startTime);

                      return (
                        <button
                          key={content.id}
                          onClick={() => {
                            setCollectTokenId(BigInt(content.tokenId));
                            setCollectEpochId(BigInt(content.epochId));
                            setCollectPrice(parseUnits(livePrice.toFixed(6), QUOTE_TOKEN_DECIMALS));
                            setCollectImageUrl(imageUrl);
                            setCollectCaption(description);
                            setCollectCreator(content.creator.id);
                            setCollectOwner(content.owner.id);
                            setCollectCreatedAt(content.createdAt);
                            setShowCollectModal(true);
                          }}
                          className="h-fit w-full self-start rounded-none overflow-hidden bg-secondary text-left"
                        >
                          {/* Image */}
                          {imageUrl && (
                            <div className="relative">
                              <img
                                src={imageUrl}
                                alt={description || "Sticker"}
                                className={`w-full object-cover${!content.isApproved ? " opacity-50" : ""}`}
                                loading="lazy"
                                decoding="async"
                              />
                              <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 text-[11px] text-white font-mono">
                                {livePrice > 0 ? `$${formatNumber(livePrice)}` : "Free"}
                              </div>
                              {!content.isApproved && (
                                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 text-[10px] text-white/70 font-mono">
                                  Pending
                                </div>
                              )}
                            </div>
                          )}

                          {/* Text-only sticker */}
                          {hasText && (
                            <div className="p-3">
                              <p className="text-[12px] text-muted-foreground leading-relaxed">
                                {description}
                              </p>
                              <div className="mt-2 text-[11px] text-muted-foreground font-mono">
                                {livePrice > 0 ? `$${formatNumber(livePrice)}` : "Free"}
                              </div>
                            </div>
                          )}

                          {/* Loading placeholder */}
                          {!imageUrl && !hasText && !content.metadata && fallbackMeta === undefined && (
                            <div className="aspect-square flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </>
          )}

          {/* === Trade View === */}
          {view === "trade" && (
            <>
              {/* Chart */}
              <div className="mb-2 -mx-4">
                <PriceChart
                  data={chartData}
                  height={176}
                  color={trendColor}
                  onHover={handleChartHover}
                  tokenFirstActiveTime={timeframe !== "ALL" ? createdAtTimestamp : undefined}
                  initialPrice={timeframe !== "ALL" ? initialPrice : undefined}
                />
              </div>

              {/* Timeframe Selector */}
              <div className="flex justify-between mb-5 px-2">
                {(["1H", "1D", "1W", "1M", "ALL"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3.5 py-1.5 rounded-none text-[13px] font-medium font-mono transition-all ${
                      timeframe === tf
                        ? isPositiveTrend
                          ? "bg-[#A78BFA] text-black"
                          : "bg-[#2DD4BF] text-black"
                        : isPositiveTrend
                          ? "text-[#A78BFA] hover:bg-[#A78BFA]/10"
                          : "text-[#2DD4BF] hover:bg-[#2DD4BF]/10"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              {/* Your Position Section */}
              <div className="mb-6">
                <div className="mb-3">
                  <div className="font-semibold text-[18px] font-display">Your Position</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">Your token balance and current market value</div>
                </div>

                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-1">Token balance</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono flex items-center gap-1.5">
                      <TokenLogo name={tokenName} logoUrl={logoUrl} size="sm" variant="circle" />
                      <span>{formatNumber(userCoinBalance)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-1">Market value</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono text-foreground">
                      ${positionBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Your Collection Section */}
              {hasCollectionSection && (
                <div className="mb-6">
                  <div className="mb-3">
                    <div className="font-semibold text-[18px] font-display">Your Collection</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">Stickers you hold, their stake, and the tokens they are mining</div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Stickers owned</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        {collectionStickerCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Market value</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        ${collectionMarketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Total spent</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        ${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Total earned</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        ${ownerEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Total mined</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono flex items-center gap-1.5">
                        <TokenLogo name={tokenName} logoUrl={logoUrl} size="sm" variant="circle" />
                        <span>{formatNumber(totalMined)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Claimable</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono flex items-center gap-1.5">
                        <TokenLogo name={tokenName} logoUrl={logoUrl} size="sm" variant="circle" />
                        <span>{formatNumber(coinEarned)}</span>
                      </div>
                    </div>
                  </div>

                  {coinEarned > 0 && (
                    <button
                      onClick={handleCollectionClaim}
                      disabled={tokenClaimStatus === "pending" || tokenClaimStatus === "confirming" || tokenClaimStatus === "success"}
                      className={`w-full mt-4 h-10 text-[14px] font-semibold font-display rounded-none transition-all flex items-center justify-center gap-1.5 ${
                        tokenClaimStatus === "success"
                          ? "bg-foreground text-black"
                          : tokenClaimStatus === "error"
                          ? "bg-zinc-800 text-white"
                          : tokenClaimStatus === "pending" || tokenClaimStatus === "confirming"
                          ? "bg-zinc-800 text-foreground/60 cursor-not-allowed"
                          : trendButtonClass
                      }`}
                    >
                      {(tokenClaimStatus === "pending" || tokenClaimStatus === "confirming") && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {tokenClaimStatus === "success" && <CheckCircle className="w-3.5 h-3.5" />}
                      {tokenClaimStatus === "pending" || tokenClaimStatus === "confirming"
                        ? "Claiming..."
                        : tokenClaimStatus === "success"
                        ? "Claimed!"
                        : tokenClaimStatus === "error"
                        ? tokenClaimError?.message?.includes("cancelled") ? "Rejected" : "Failed"
                        : "Claim"}
                    </button>
                  )}
                </div>
              )}

              {/* Your Creations Section */}
              {hasCreationsSection && (
                <div className="mb-6">
                  <div className="mb-3">
                    <div className="font-semibold text-[18px] font-display">Your Creations</div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">Stickers you made, their current value, and the earnings they generated</div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Stickers created</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        {creationStickerCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Market value</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        ${creationsMarketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Collects</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        {creationsCollectCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[12px] mb-1">Total earned</div>
                      <div className="font-semibold text-[15px] tabular-nums font-mono">
                        ${creatorEarned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* About Section */}
              <div className="mb-6">
                <div className="mb-3">
                  <div className="font-semibold text-[18px] font-display">About</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">Channel details, links, and team actions</div>
                </div>

                <div className="flex items-center gap-2 text-[13px] text-muted-foreground mb-2">
                  <span>Deployed by</span>
                  {launcherAddress ? (
                    <span className="text-foreground font-medium font-mono">
                      <AddressLink address={launcherAddress} />
                    </span>
                  ) : (
                    <span className="text-foreground font-medium">--</span>
                  )}
                  <span className="text-muted-foreground/60">·</span>
                  <span className="text-muted-foreground/60">{launchDateStr}</span>
                </div>

                {metadata?.description && (
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-2">
                    {metadata.description}
                  </p>
                )}
                {!metadata?.description && (
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-2">
                    A Stickrnet channel. Collect content stickers, earn coin rewards through staking.
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {coinAddress && (
                    <a
                      href={`https://basescan.org/token/${coinAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-secondary text-[12px] text-muted-foreground hover:bg-secondary/80 transition-colors"
                    >
                      {tokenSymbol}
                    </a>
                  )}
                  {subgraphChannel?.lpToken && (
                    <a
                      href={`https://basescan.org/address/${subgraphChannel.lpToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-secondary text-[12px] text-muted-foreground hover:bg-secondary/80 transition-colors"
                    >
                      {tokenSymbol}-USDC LP
                    </a>
                  )}
                  {metadata?.links && metadata.links.length > 0 && metadata.links.map((link, i) => {
                    let label: string;
                    try {
                      const hostname = new URL(link).hostname.replace("www.", "");
                      if (hostname.includes("twitter.com") || hostname.includes("x.com")) label = "Twitter";
                      else if (hostname.includes("t.me") || hostname.includes("telegram")) label = "Telegram";
                      else if (hostname.includes("discord")) label = "Discord";
                      else if (hostname.includes("github.com")) label = "GitHub";
                      else if (hostname.includes("warpcast.com")) label = "Warpcast";
                      else label = hostname;
                    } catch {
                      label = link;
                    }
                    return (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-secondary text-[12px] text-muted-foreground hover:bg-secondary/80 transition-colors"
                      >
                        {label}
                      </a>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                {isConnected && (
                  <div className="flex">
                    <button
                      onClick={() => setShowLiquidityModal(true)}
                      className={`flex-1 h-10 text-[14px] font-semibold font-display rounded-none transition-colors ${trendButtonClass}`}
                    >
                      Liquidity
                    </button>
                    <button
                      onClick={() => setShowAuctionModal(true)}
                      className={`flex-1 h-10 text-[14px] font-semibold font-display rounded-none transition-colors ${trendButtonClass}`}
                    >
                      Auction
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => setShowAdminModal(true)}
                        className={`flex-1 h-10 text-[14px] font-semibold font-display rounded-none transition-colors ${trendButtonClass}`}
                      >
                        Admin
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="mb-6">
                <div className="mb-3">
                  <div className="font-semibold text-[18px] font-display">Stats</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">Key metrics and coin economics for this channel</div>
                </div>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">Market cap</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      {formatMarketCap(marketCapUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">Total supply</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      {formatNumber(totalSupply)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">Liquidity</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      ${formatNumber(liquidityUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">24h volume</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      ${formatNumber(volume24h)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">Treasury</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      ${treasuryRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[12px] mb-0.5">Team</div>
                    <div className="font-semibold text-[15px] tabular-nums font-mono">
                      ${teamRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  {subgraphChannel && (
                    <>
                      <div>
                        <div className="text-muted-foreground text-[12px] mb-0.5">Initial UPS</div>
                        <div className="font-semibold text-[15px] tabular-nums font-mono">{formatEmission(subgraphChannel.initialUps)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[12px] mb-0.5">Tail UPS</div>
                        <div className="font-semibold text-[15px] tabular-nums font-mono">{formatEmission(subgraphChannel.tailUps)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[12px] mb-0.5">Halving</div>
                        <div className="font-semibold text-[15px] tabular-nums font-mono">
                          {formatPeriod(subgraphChannel.halvingPeriod)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[12px] mb-0.5">Content count</div>
                        <div className="font-semibold text-[15px] tabular-nums font-mono">{subgraphChannel.contentCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[12px] mb-0.5">Collect count</div>
                        <div className="font-semibold text-[15px] tabular-nums font-mono">{subgraphChannel.collectCount}</div>
                      </div>
                      {coinState?.minter && (
                        <div>
                          <div className="text-muted-foreground text-[12px] mb-0.5">Minter</div>
                          <div className="font-semibold text-[15px] font-mono">
                            <AddressLink address={coinState.minter} />
                          </div>
                        </div>
                      )}
                      {coinState?.rewarder && (
                        <div>
                          <div className="text-muted-foreground text-[12px] mb-0.5">Rewarder</div>
                          <div className="font-semibold text-[15px] font-mono">
                            <AddressLink address={coinState.rewarder} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

        </div>


        {/* Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-800 flex justify-center" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}>
          <div className="flex items-center w-full max-w-[520px] px-4 py-2 bg-background">
            {!isConnected ? (
              <button
                onClick={() => connect()}
                disabled={isConnecting || isInFrame === true}
                className="flex-1 h-10 text-[14px] font-semibold font-display rounded-none bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setView(view === "channel" ? "trade" : "channel")}
                  className="flex-1 h-10 text-[14px] font-semibold font-display rounded-none bg-white text-black hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {view === "channel" ? "Trade" : "Channel"}
                </button>
                {view === "channel" ? (
                  <button
                    onClick={() => setShowCreateContentModal(true)}
                    className="flex-[2] h-10 text-[14px] font-semibold font-display rounded-none bg-[#A78BFA] text-black hover:bg-[#9575D9] transition-colors"
                  >
                    Create
                  </button>
                ) : userCoinBalance > 0 ? (
                  <>
                    <button
                      onClick={() => {
                        setTradeMode("sell");
                        setShowTradeModal(true);
                      }}
                      className="flex-1 h-10 text-[14px] font-semibold font-display rounded-none bg-[#2DD4BF] text-black hover:bg-[#26B8A5] transition-colors"
                    >
                      Sell
                    </button>
                    <button
                      onClick={() => {
                        setTradeMode("buy");
                        setShowTradeModal(true);
                      }}
                      className="flex-1 h-10 text-[14px] font-semibold font-display rounded-none bg-[#A78BFA] text-black hover:bg-[#9575D9] transition-colors"
                    >
                      Buy
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setTradeMode("buy");
                      setShowTradeModal(true);
                    }}
                    className="flex-[2] h-10 text-[14px] font-semibold font-display rounded-none bg-[#A78BFA] text-black hover:bg-[#9575D9] transition-colors"
                  >
                    Buy
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>
      <NavBar />

      {/* Collect Modal */}
      <CollectModal
        isOpen={showCollectModal}
        onClose={() => setShowCollectModal(false)}
        contentAddress={contentAddress}
        tokenId={collectTokenId}
        epochId={collectEpochId}
        currentPrice={collectPrice}
        imageUrl={collectImageUrl}
        caption={collectCaption}
        channelName={tokenName}
        channelLogoUrl={logoUrl}
        tokenSymbol={tokenSymbol}
        creatorAddress={collectCreator}
        ownerAddress={collectOwner}
        createdAt={collectCreatedAt}
        priceUsd={priceUsd}
        isPositiveTrend={isPositiveTrend}
        onSuccess={() => refetchState()}
      />

      {/* Trade Modal (Buy/Sell) */}
      <TradeModal
        isOpen={showTradeModal}
        onClose={() => setShowTradeModal(false)}
        mode={tradeMode}
        tokenSymbol={tokenSymbol}
        tokenName={tokenName}
        unitAddress={(coinAddress ?? "0x0") as `0x${string}`}
        marketPrice={priceUsd}
        userQuoteBalance={accountQuoteBalance ?? 0n}
        userUnitBalance={accountCoinBalance ?? 0n}
        logoUrl={logoUrl ?? undefined}
      />

      {/* Auction Modal */}
      <AuctionModal
        isOpen={showAuctionModal}
        onClose={() => setShowAuctionModal(false)}
        contentAddress={contentAddress}
        tokenSymbol={tokenSymbol}
        tokenName={tokenName}
        isPositiveTrend={isPositiveTrend}
      />

      {/* Liquidity Modal */}
      <LiquidityModal
        isOpen={showLiquidityModal}
        onClose={() => setShowLiquidityModal(false)}
        unitAddress={(coinAddress ?? "0x0") as `0x${string}`}
        tokenSymbol={tokenSymbol}
        tokenName={tokenName}
        tokenBalance={userCoinBalance}
        usdcBalance={userQuoteBalance}
        tokenPrice={priceUsd}
        isPositiveTrend={isPositiveTrend}
      />

      {/* Admin Modal */}
      {showAdminModal && (
        <AdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          contentAddress={contentAddress}
          tokenSymbol={tokenSymbol}
          tokenName={tokenName}
          initialTreasury={coinState?.auction ?? ""}
          initialTeam={coinState?.launcher ?? ""}
          initialUri={channelUri ?? ""}
          initialIsModerated={coinState?.isModerated ?? false}
          initialMetadata={adminMetadata}
          initialLogoUrl={logoUrl ?? undefined}
          isPositiveTrend={isPositiveTrend}
        />
      )}

      {/* Create Content Modal */}
      <CreateContentModal
        isOpen={showCreateContentModal}
        onClose={() => setShowCreateContentModal(false)}
        contentAddress={contentAddress}
        isModerated={coinState?.isModerated}
        onSuccess={() => {
          refetchState();
          refetchContent();
          // Poll every 5s for 30s to catch subgraph indexing
          setContentFastPoll(true);
          setTimeout(() => setContentFastPoll(false), 30_000);
        }}
        tokenSymbol={tokenSymbol}
        logoUrl={logoUrl}
        isPositiveTrend={isPositiveTrend}
      />

    </main>
  );
}

/** Returns a relative time string like "2d ago", "3h ago", etc. */
function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "just now";
}
