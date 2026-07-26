"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Loader2, CheckCircle, ImagePlus, Flame, Clock, TrendingUp, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatEther, formatUnits, parseUnits } from "viem";
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
import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import {
  QUOTE_TOKEN_DECIMALS,
  CONTENT_ABI,
} from "@/lib/contracts";
import {
  getChannel,
  getChannelAccount,
  getContentPositions,
  type SubgraphContentPosition,
} from "@/lib/subgraph-launchpad";
import { ipfsToHttp } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
    <main className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16 pb-32 lg:pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
      >
      <div className="lg:pt-[88px]">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 -ml-1.5 rounded-[var(--radius)] hover:bg-[hsl(var(--foreground)/0.06)] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-[var(--radius)] bg-secondary animate-pulse flex-shrink-0" />
          <div className="flex items-center gap-3">
            <div>
              <div className="w-16 h-4 bg-secondary rounded animate-pulse mb-1" />
              <div className="w-24 h-5 bg-secondary rounded animate-pulse" />
            </div>
            <div>
              <div className="w-20 h-6 bg-secondary rounded animate-pulse mb-1" />
              <div className="w-14 h-4 bg-secondary rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 min-h-0">

          {/* Chart skeleton */}
          <div className="h-44 mb-2 -mx-4 bg-secondary/30 animate-pulse rounded" />

          {/* Timeframe selector skeleton */}
          <div className="flex justify-between mb-5 px-2">
            {["1H", "1D", "1W", "1M", "ALL"].map((tf) => (
              <div key={tf} className="px-3.5 py-1.5 rounded-[var(--radius)] bg-secondary/50 text-[13px] text-muted-foreground">
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

  // Fetch channel data from subgraph
  const { data: subgraphChannel, isLoading: isSubgraphLoading } = useQuery({
    queryKey: ["channel", address],
    queryFn: () => getChannel(address),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const { data: channelAccount, refetch: refetchChannelAccount } = useQuery({
    queryKey: ["channel-account", address, account],
    queryFn: () => getChannelAccount(address, account!),
    enabled: !!address && !!account,
    staleTime: 30_000,
    refetchInterval: isConnected ? 15_000 : false,
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
    refetchInterval: 15_000,
  });

  // Fetch on-chain coin state via multicall
  const {
    channelState: coinState,
    refetch: refetchState,
    isLoading: isCoinStateLoading,
  } = useChannelState(contentAddress, account, true, 5_000);

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
  const channelCollectVolume = subgraphChannel?.collectVolume
    ? parseFloat(subgraphChannel.collectVolume)
    : 0;
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

  const collectionValueUsd = subgraphChannel?.totalStaked
    ? parseFloat(subgraphChannel.totalStaked) / 1e6
    : 0;

  // Launcher address from subgraph
  const launcherAddress = subgraphChannel?.launcher?.id || null;

  // Portal: inject ticker + price into GlobalNav center slot on mobile
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("nav-center-slot");
    if (el) setNavSlot(el);
  }, []);

  // Ownership check: compare connected wallet to launcher address
  const isOwner = !!(
    account &&
    launcherAddress &&
    account.toLowerCase() === launcherAddress.toLowerCase()
  );

  // Moderator check: read accountToIsModerator from contract
  const { data: isModerator } = useReadContract({
    address: contentAddress,
    abi: CONTENT_ABI,
    functionName: "accountToIsModerator",
    args: account ? [account] : undefined,
    chainId: base.id,
    query: {
      enabled: !!account && !!contentAddress,
    },
  });

  // Show moderate features if channel is moderated AND user is owner or moderator
  // Check both coinState and subgraph for isModerated (either source)
  const channelIsModerated = !!(coinState?.isModerated || subgraphChannel?.isModerated);
  const canModerate = !!(channelIsModerated && (isOwner || isModerator));

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
    coinAddress,
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
  const trendColor = isPositiveTrend ? "hsl(263, 70%, 70%)" : "hsl(195, 80%, 55%)";
  const trendButtonClass = isPositiveTrend
    ? "slab-button"
    : "slab-button slab-button-loss";

  const [hoverData, setHoverData] = useState<HoverData>(null);
  const handleChartHover = useCallback((data: HoverData) => setHoverData(data), []);

  const [feedSort, setFeedSort] = useState<"bump" | "top" | "new" | "pending">("bump");
  const [stickerSearch, setStickerSearch] = useState("");
  const [showCreateContentModal, setShowCreateContentModal] = useState(false);

  // Tick every 5s to update decaying prices
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);
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
  const [collectIsPending, setCollectIsPending] = useState(false);
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
  }, [address, isCoinStateLoading, isSubgraphLoading]);

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

  // --- Shared sticker grid content ---
  const stickerGrid = (columnClass: string) => (
    <>
      {isContentLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : contents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-[var(--radius)] bg-secondary flex items-center justify-center mb-3">
            <ImagePlus className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-[15px] font-semibold font-display mb-1">No stickers yet</div>
          <div className="text-[13px] text-muted-foreground max-w-[240px]">
            Be the first to add a sticker to this channel
          </div>
        </div>
      ) : (
        <div className={`${columnClass} gap-3 pb-2`}>
          {contents
            .filter((c) => {
              if (feedSort === "pending") return !c.isApproved;
              return c.isApproved;
            })
            .filter((c) => {
              if (!stickerSearch) return true;
              const q = stickerSearch.toLowerCase();
              const desc = c.metadata?.description || metadataMap[c.uri]?.description || "";
              return desc.toLowerCase().includes(q);
            })
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
                    setCollectIsPending(!content.isApproved && canModerate);
                    setShowCollectModal(true);
                  }}
                  className="group mb-3 block h-fit w-full break-inside-avoid overflow-hidden rounded-[var(--radius)] bg-secondary text-left align-top relative"
                >
                  {/* Image */}
                  {imageUrl && (
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt={description || "Sticker"}
                        className={`w-full object-cover rounded-[var(--radius)]${!content.isApproved ? " opacity-50" : ""}`}
                        loading="lazy"
                        decoding="async"
                      />
                      {/* Cosmos-style hover overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 rounded-[var(--radius)]" />
                      {/* Price badge — always visible, bottom-left */}
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <span className="inline-block px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-full text-[11px] text-white/90 font-mono">
                          {livePrice > 0 ? `$${formatNumber(livePrice)}` : "Free"}
                        </span>
                      </div>
                      {/* Collect count on hover — top right */}
                      {Number(content.collectCount) > 0 && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <span className="inline-block px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-full text-[10px] text-white/80 font-mono">
                            {content.collectCount} collect{Number(content.collectCount) !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                      {!content.isApproved && (
                        <div className="absolute top-2 left-2">
                          <span className="inline-block px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded-full text-[10px] text-white/70 font-mono">
                            Pending
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Text-only sticker */}
                  {hasText && (
                    <div className="p-3">
                      <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-6">
                        {description}
                      </p>
                      <div className="mt-2">
                        <span className="inline-block px-2 py-0.5 bg-foreground/10 rounded-full text-[11px] text-muted-foreground font-mono">
                          {livePrice > 0 ? `$${formatNumber(livePrice)}` : "Free"}
                        </span>
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
  );

  // --- Shared sort tabs ---
  const sortTabs = (size: "sm" | "md") => {
    if (contents.length === 0) return null;
    const h = size === "sm" ? "h-8" : "h-10";
    const px = size === "sm" ? "px-2.5" : "px-3.5";
    const text = size === "sm" ? "text-[10px]" : "text-[11px]";
    const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
    const tabs: { key: "bump" | "new" | "top" | "pending"; label: string; icon: typeof Flame }[] = [
      { key: "bump", label: "Bump", icon: Flame },
      { key: "new", label: "New", icon: Clock },
      { key: "top", label: "Top", icon: TrendingUp },
    ];
    // Add Pending tab for moderated channels when user can moderate
    if (canModerate) {
      const pendingCount = contents.filter(c => !c.isApproved).length;
      tabs.push({ key: "pending", label: "Pending", icon: Clock });
    }
    return (
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFeedSort(tab.key)}
            className={cn(
              `flex ${h} items-center gap-1.5 ${px} font-display ${text} font-semibold tracking-[0.02em] transition-all rounded-[var(--radius)] border`,
              feedSort === tab.key
                ? `${isPositiveTrend ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--loss))] text-black"} border-transparent shadow-glass`
                : "bg-[hsl(var(--foreground)/0.04)] border-[hsl(var(--foreground)/0.1)] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.08)]"
            )}
          >
            <tab.icon className={iconSize} />
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  // --- Shared About section ---
  const aboutSection = (
    <>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60 mt-0.5">
        <span>Deployed by</span>
        {launcherAddress ? (
          <span className="text-foreground/80 font-medium font-mono">
            <AddressLink address={launcherAddress} />
          </span>
        ) : (
          <span className="text-foreground font-medium">--</span>
        )}
        <span>·</span>
        <span>{launchDateStr}</span>
      </div>

      <p className="text-[13px] text-muted-foreground leading-relaxed mt-2">
        {metadata?.description || "A Stickrnet channel. Collect content stickers, earn coin rewards through staking."}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4">
        {coinAddress && (
          <a href={`https://basescan.org/token/${coinAddress}`} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
            {tokenSymbol} <ArrowUpRight className="inline h-3 w-3" />
          </a>
        )}
        {subgraphChannel?.lpToken && (
          <a href={`https://basescan.org/address/${subgraphChannel.lpToken}`} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
            {tokenSymbol}-USDC LP <ArrowUpRight className="inline h-3 w-3" />
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
          } catch { label = link; }
          return (
            <a key={i} href={link} target="_blank" rel="noopener noreferrer"
              className="text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground">
              {label} <ArrowUpRight className="inline h-3 w-3" />
            </a>
          );
        })}
      </div>
    </>
  );

  // --- Shared Stats grid ---
  const statsGrid = (
    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">Market cap</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">{formatMarketCap(marketCapUsd)}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">Total supply</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">{formatNumber(totalSupply)}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">Liquidity</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">${formatNumber(liquidityUsd)}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">24h volume</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">${formatNumber(volume24h)}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">Treasury</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">${treasuryRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      </div>
      <div>
        <div className="text-muted-foreground text-[12px] mb-0.5">Team</div>
        <div className="font-semibold text-[15px] tabular-nums font-mono">${teamRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
          {subgraphChannel?.team && (
            <div>
              <div className="text-muted-foreground text-[12px] mb-0.5">Team</div>
              <div className="font-semibold text-[15px] font-mono">
                <AddressLink address={subgraphChannel.team as `0x${string}`} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // --- Position card ---
  const positionCard = (
    <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
      <div className="mb-3">
        <div className="font-semibold text-[18px] font-display">Your Position</div>
        <div className="text-[12px] text-muted-foreground mt-0.5">Your token balance and current market value</div>
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-8">
        <div>
          <div className="text-muted-foreground text-[12px] mb-1">Balance</div>
          <div className="font-semibold text-[15px] tabular-nums font-mono flex items-center gap-1.5">
            <TokenLogo name={tokenName} logoUrl={logoUrl} size="sm" variant="circle" />
            <span>{formatNumber(userCoinBalance)}</span>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground text-[12px] mb-1">Value</div>
          <div className="font-semibold text-[15px] tabular-nums font-mono text-foreground">
            ${positionBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );

  // --- Collection card ---
  const collectionCard = hasCollectionSection ? (
    <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
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
          className={`w-full mt-4 h-10 text-[14px] font-semibold font-display rounded-[var(--radius)] transition-all flex items-center justify-center gap-1.5 ${
            tokenClaimStatus === "success"
              ? "bg-foreground text-black"
              : tokenClaimStatus === "error"
              ? "bg-[hsl(var(--surface-container))] text-white"
              : tokenClaimStatus === "pending" || tokenClaimStatus === "confirming"
              ? "bg-[hsl(var(--surface-container))] text-foreground/60 cursor-not-allowed"
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
  ) : null;

  // --- Creations card ---
  const creationsCard = isConnected ? (
    <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
      <div className="mb-3">
        <div className="font-semibold text-[18px] font-display">Your Creations</div>
        <div className="text-[12px] text-muted-foreground mt-0.5">Stickers you made, their current value, and the earnings they generated</div>
      </div>

      {hasCreationsSection && (
        <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-4">
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
      )}

      <button
        onClick={() => setShowCreateContentModal(true)}
        className={`w-full h-10 text-[14px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}
      >
        Create Sticker
      </button>
    </div>
  ) : null;

  // --- Action buttons (Liquidity/Auction/Admin) ---
  const actionButtons = isConnected ? (
    <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowLiquidityModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Liquidity</button>
        <button onClick={() => setShowAuctionModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Auction</button>
        {isOwner && (
          <button onClick={() => setShowAdminModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass} col-span-2`}>Admin</button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-background">
      {/* Ticker + price in nav center slot (mobile) */}
      {navSlot && createPortal(
        <div className="text-center">
          <div className="font-display text-[14px] font-bold uppercase tracking-[-0.01em] text-black leading-none">{tokenSymbol}</div>
          <div className="font-mono text-[11px] font-medium tabular-nums text-black/50 leading-none mt-0.5">{formatPrice(priceUsd)}</div>
        </div>,
        navSlot
      )}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16 pb-32 lg:pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
      >
      <div className="lg:pt-[88px]">
        {/* Mobile top bar — matches stickrnet layout */}
        <div ref={tokenInfoRef} className="lg:hidden flex items-center justify-between mb-2 py-1">
          <div className="flex items-center gap-2.5">
            <button onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <TokenLogo name={tokenName} logoUrl={logoUrl} size="md" />
            <div>
              <div className="font-display text-[15px] font-semibold uppercase tracking-[-0.02em] leading-none">{tokenSymbol}</div>
              <div className="text-[12px] text-muted-foreground leading-none mt-1">{tokenName}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[18px] font-semibold tabular-nums leading-none">
              {hoverData && hoverData.value > 0
                ? formatPrice(hoverData.value)
                : formatPrice(priceUsd)}
            </div>
            {hoverData ? (
              <div className="text-[12px] font-mono font-medium leading-none mt-1 text-foreground/50">
                {new Date(hoverData.time * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : (
              <div className={`text-[12px] font-mono font-medium leading-none mt-1 ${isPositiveTrend ? "positive-value" : "negative-value"}`}>
                {`${isPositiveTrend ? "+" : ""}${displayChange.toFixed(2)}%`}
              </div>
            )}
          </div>
        </div>

        {/* Content area */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0">
          {/* === DESKTOP layout (lg+): two columns === */}
          <div className="hidden lg:flex lg:gap-6">
            {/* Left column — header + chart + timeframes + stickers */}
            <div className="flex-1 min-w-0">
              {/* Desktop header — inside left column like stickrnet */}
              <div className="flex items-center justify-between py-3 pb-5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => window.history.back()}
                    className="p-1.5 -ml-1.5 rounded-[var(--radius)] hover:bg-[hsl(var(--foreground)/0.06)] transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <div className="text-[22px] font-bold font-display leading-tight">{tokenSymbol}</div>
                    <div className="text-[13px] text-muted-foreground truncate">{tokenName}</div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="price-large">
                    {hoverData && hoverData.value > 0
                      ? formatPrice(hoverData.value)
                      : formatPrice(priceUsd)}
                  </div>
                  {hoverData ? (
                    <div className="text-[13px] font-medium font-mono text-foreground/50">
                      {new Date(hoverData.time * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ) : (
                    <div className={`text-[13px] font-medium font-mono ${isPositiveTrend ? "positive-value" : "negative-value"}`}>
                      {`${isPositiveTrend ? "+" : ""}${displayChange.toFixed(2)}%`}
                    </div>
                  )}
                </div>
              </div>

              {/* Chart (280px desktop) */}
              <div className="mb-2">
                <PriceChart
                  data={chartData}
                  height={280}
                  color={trendColor}
                  onHover={handleChartHover}
                  tokenFirstActiveTime={timeframe !== "ALL" ? createdAtTimestamp : undefined}
                  initialPrice={timeframe !== "ALL" ? initialPrice : undefined}
                />
              </div>

              {/* Timeframe selector + inline Buy/Sell */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex gap-1">
                  {(["1H", "1D", "1W", "1M", "ALL"] as Timeframe[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3.5 py-1.5 rounded-[var(--radius)] text-[13px] font-medium font-mono transition-all ${
                        timeframe === tf
                          ? isPositiveTrend
                            ? "bg-primary text-primary-foreground"
                            : "bg-[hsl(var(--loss))] text-black"
                          : isPositiveTrend
                            ? "positive-value hover:bg-primary/10"
                            : "negative-value hover:bg-[hsl(var(--loss))]/10"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                {/* Inline Buy/Sell */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTradeMode("buy"); setShowTradeModal(true); }}
                    className="h-9 w-[120px] text-[13px] font-semibold font-display rounded-[var(--radius)] slab-button transition-colors"
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => { setTradeMode("sell"); setShowTradeModal(true); }}
                    className="h-9 w-[120px] text-[13px] font-semibold font-display rounded-[var(--radius)] slab-button slab-button-loss transition-colors"
                  >
                    Sell
                  </button>
                </div>
              </div>

              {/* About section — under chart */}
              <div className="slab-panel rounded-[var(--radius)] mb-6 px-3 py-4">
                <div className="mb-4">
                  <div className="font-semibold text-[18px] font-display tracking-[-0.03em]">{tokenName}</div>
                  {aboutSection}
                </div>
                {/* Key stats row */}
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Collection Value</div>
                    <div className="font-mono text-[22px] font-bold tabular-nums leading-none">{formatMarketCap(collectionValueUsd)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Collect Volume</div>
                    <div className="font-mono text-[22px] font-bold tabular-nums leading-none">${channelCollectVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Stickers</div>
                    <div className="font-mono text-[22px] font-bold tabular-nums leading-none">{subgraphChannel?.contentCount ?? "0"}</div>
                  </div>
                </div>
              </div>

              {/* Stickers section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-[18px] font-display">Stickers</div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search stickers..."
                        value={stickerSearch}
                        onChange={(e) => setStickerSearch(e.target.value)}
                        className="h-10 w-[200px] rounded-[var(--radius)] bg-[hsl(var(--foreground)/0.04)] border border-[hsl(var(--foreground)/0.1)] pl-10 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 backdrop-blur-sm transition-all focus:outline-none focus:w-[260px] focus:border-[hsl(var(--primary)/0.4)] focus:bg-[hsl(var(--foreground)/0.06)]"
                      />
                      {stickerSearch && (
                        <button
                          onClick={() => setStickerSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {sortTabs("md")}
                  </div>
                </div>
                {stickerGrid("columns-2 sm:columns-3 lg:columns-4")}
              </div>
            </div>

            {/* Right column (380px sidebar) — aligned to top */}
            <div className="lg:w-[380px] flex-shrink-0">
              {/* Token Image — aligned with top of left column header */}
              {logoUrl && (
                <div className="mb-4 rounded-[var(--radius)] overflow-hidden mt-3">
                  <img src={logoUrl} alt={tokenName} className="w-full aspect-square object-cover" />
                </div>
              )}

              {/* Creations card — with Create button */}
              {creationsCard}

              {/* Collection card */}
              {collectionCard}

              {/* Position card */}
              {positionCard}

              {/* Stats card — with action buttons */}
              <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
                <div className="mb-3">
                  <div className="font-semibold text-[18px] font-display">Stats</div>
                </div>
                {statsGrid}
                {isConnected && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => setShowLiquidityModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Liquidity</button>
                    <button onClick={() => setShowAuctionModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Auction</button>
                    {isOwner && (
                      <button onClick={() => setShowAdminModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass} col-span-2`}>Admin</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* === MOBILE layout (< lg): single column === */}
          <div className="lg:hidden">
            {/* Chart (176px mobile) */}
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

            {/* Timeframe selector */}
            <div className="flex items-center justify-between mb-5 px-2">
              <div className="flex gap-1">
                {(["1H", "1D", "1W", "1M", "ALL"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3.5 py-1.5 rounded-[var(--radius)] text-[13px] font-medium font-mono transition-all ${
                      timeframe === tf
                        ? isPositiveTrend
                          ? "bg-primary text-primary-foreground"
                          : "bg-[hsl(var(--loss))] text-black"
                        : isPositiveTrend
                          ? "positive-value hover:bg-primary/10"
                          : "negative-value hover:bg-[hsl(var(--loss))]/10"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* About section — right under chart */}
            <div className="slab-panel rounded-[var(--radius)] mb-6 px-3 py-4">
              <div className="mb-4">
                <div className="font-semibold text-[18px] font-display tracking-[-0.03em]">{tokenName}</div>
                {aboutSection}
              </div>
              {/* Key stats row */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Collection Value</div>
                  <div className="font-mono text-[22px] font-bold tabular-nums leading-none">{formatMarketCap(collectionValueUsd)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Collect Volume</div>
                  <div className="font-mono text-[22px] font-bold tabular-nums leading-none">${channelCollectVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[11px] font-medium tracking-[0.04em] mb-1">Stickers</div>
                  <div className="font-mono text-[22px] font-bold tabular-nums leading-none">{subgraphChannel?.contentCount ?? "0"}</div>
                </div>
              </div>
            </div>

            {/* Creations card — with Create button */}
            {creationsCard}

            {/* Collection card */}
            {collectionCard}

            {/* Position card */}
            {isConnected && positionCard}

            {/* Stats section — with action buttons */}
            <div className="slab-panel rounded-[var(--radius)] mb-4 px-4 py-4">
              <div className="mb-3">
                <div className="font-semibold text-[18px] font-display">Stats</div>
              </div>
              {statsGrid}
              {isConnected && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button onClick={() => setShowLiquidityModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Liquidity</button>
                  <button onClick={() => setShowAuctionModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass}`}>Auction</button>
                  {isOwner && (
                    <button onClick={() => setShowAdminModal(true)} className={`h-10 text-[13px] font-semibold font-display rounded-[var(--radius)] transition-colors ${trendButtonClass} col-span-2`}>Admin</button>
                  )}
                </div>
              )}
            </div>

            {/* Stickers section — sort tabs + grid, no card wrapper */}
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-[18px] font-display">Stickers</div>
              {sortTabs("sm")}
            </div>
            {stickerGrid("columns-2")}
          </div>
        </div>


        {/* Mobile Bottom Action Bar — hidden on desktop */}
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
          <div className="flex items-center gap-2 w-full px-4 pt-3 bg-background" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            {!isConnected ? (
              <button
                onClick={() => connect()}
                disabled={isConnecting || isInFrame === true}
                className="flex-1 h-11 text-[14px] font-semibold font-display rounded-[var(--radius)] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setTradeMode("sell"); setShowTradeModal(true); }}
                  className="flex-1 h-11 text-[14px] font-semibold font-display rounded-[var(--radius)] slab-button slab-button-loss transition-colors"
                >
                  Sell
                </button>
                <button
                  onClick={() => { setTradeMode("buy"); setShowTradeModal(true); }}
                  className="flex-1 h-11 text-[14px] font-semibold font-display rounded-[var(--radius)] slab-button transition-colors"
                >
                  Buy
                </button>
              </>
            )}
          </div>
        </div>

      </div>
      </div>

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
        isPendingApproval={collectIsPending}
        onSuccess={() => { refetchState(); refetchContent(); }}
      />

      {/* Trade Modal (Buy/Sell) — Buy always positive, Sell always negative */}
      <TradeModal
        isOpen={showTradeModal}
        onClose={() => setShowTradeModal(false)}
        mode={tradeMode}
        tokenSymbol={tokenSymbol}
        unitAddress={(coinAddress ?? "0x0") as `0x${string}`}
        marketPrice={priceUsd}
        userQuoteBalance={accountQuoteBalance ?? 0n}
        userUnitBalance={accountCoinBalance ?? 0n}
        logoUrl={logoUrl ?? ""}
        colorPositive={tradeMode === "buy"}
      />

      {/* Auction Modal — follows trend */}
      <AuctionModal
        isOpen={showAuctionModal}
        onClose={() => setShowAuctionModal(false)}
        channelAddress={contentAddress}
        tokenSymbol={tokenSymbol}
        colorPositive={isPositiveTrend}
      />

      {/* Liquidity Modal — follows trend */}
      <LiquidityModal
        isOpen={showLiquidityModal}
        onClose={() => setShowLiquidityModal(false)}
        unitAddress={(coinAddress ?? "0x0") as `0x${string}`}
        tokenSymbol={tokenSymbol}
        tokenBalance={userCoinBalance}
        usdcBalance={userQuoteBalance}
        tokenPrice={priceUsd}
        colorPositive={isPositiveTrend}
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
          currentModerators={(subgraphChannel?.moderators ?? []).map(m => ({ address: m.account.id }))}
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
