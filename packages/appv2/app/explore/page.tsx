"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Flame, Clock, TrendingUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { InteractiveGridPattern } from "@/components/ui/interactive-grid-pattern";
import { useExploreChannels, type SortOption } from "@/hooks/useAllChannels";
import { useBatchMetadata } from "@/hooks/useMetadata";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useFarcaster } from "@/hooks/useFarcaster";
import { ipfsToHttp } from "@/lib/constants";
import { formatMarketCap } from "@/lib/format";
import { TokenLogo } from "@/components/token-logo";
import { cn } from "@/lib/utils";

type ChannelItem = ReturnType<typeof useExploreChannels>["channels"][number];

/** Mini sparkline chart */
function Sparkline({
  data,
  isPositive,
  className,
}: {
  data: number[];
  isPositive: boolean;
  className?: string;
}) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;
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

  const fillPoints = data.map((value, i) => {
    const x = pad + (i / divisor) * (300 - pad * 2);
    const y = range === 0 ? 50 : pad + (1 - (value - min) / range) * (100 - pad * 2);
    return `${x},${y}`;
  });
  const fillPath = [...fillPoints, `${pad + ((data.length - 1) / divisor) * (300 - pad * 2)},100`, `${pad},100`].join(" ");

  return (
    <svg
      viewBox="0 0 300 100"
      className={cn(
        "h-8 w-24 lg:h-10 lg:w-32",
        isPositive ? "positive-value" : "negative-value",
        className
      )}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`fill-${isPositive ? "pos" : "neg"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#fill-${isPositive ? "pos" : "neg"})`}
        points={fillPath}
      />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="slab-panel flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 bg-secondary animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-20 bg-secondary animate-pulse" />
          <div className="h-3.5 w-28 bg-secondary animate-pulse" />
        </div>
        <div className="h-5 w-16 bg-secondary animate-pulse" />
      </div>
      <div className="slab-inset h-28 animate-pulse" />
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <div className="h-3 w-16 bg-secondary animate-pulse" />
          <div className="h-6 w-20 bg-secondary animate-pulse" />
        </div>
        <div className="h-4 w-12 bg-secondary animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 px-3 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(140px,0.8fr)_120px] lg:gap-6 lg:px-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-secondary animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 w-16 bg-secondary animate-pulse" />
          <div className="h-3 w-24 bg-secondary animate-pulse" />
        </div>
      </div>
      <div className="flex justify-center">
        <div className="h-8 w-16 bg-secondary animate-pulse" />
      </div>
      <div className="text-right space-y-2">
        <div className="ml-auto h-4 w-14 bg-secondary animate-pulse" />
        <div className="ml-auto h-3 w-10 bg-secondary animate-pulse" />
      </div>
    </div>
  );
}

function ChannelCard({ channel, sparklineData, logoUrl }: { channel: ChannelItem; sparklineData: number[]; logoUrl: string | null }) {
  const isPositive = channel.change24h >= 0;
  const changeStr = channel.marketCapUsd > 0
    ? `${isPositive ? "+" : ""}${channel.change24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : "--";

  const displayLogoUrl = logoUrl ?? (channel.imageUri ? ipfsToHttp(channel.imageUri) : null);

  return (
    <Link
      href={`/channel/${channel.address}`}
      className={`group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
        isPositive ? "slab-panel signal-slab-positive" : "slab-panel signal-slab-negative"
      }`}
      style={{ transition: "transform 200ms ease, box-shadow 200ms ease" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px hsl(var(--foreground) / 0.1), 0 28px 64px hsl(0 0% 0% / 0.22)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Hero image */}
      <div className="relative h-[172px] w-full overflow-hidden bg-[hsl(var(--surface-container-lowest))]">
        {displayLogoUrl ? (
          <img
            src={displayLogoUrl}
            alt={channel.tokenName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(var(--surface-container-high)) 0%, hsl(var(--surface-container-lowest)) 100%)" }}
          >
            <span className="font-display text-[56px] font-bold uppercase tracking-[-0.04em] text-muted-foreground/15">
              {channel.tokenSymbol.slice(0, 4)}
            </span>
          </div>
        )}
      </div>

      {/* Content: 2x2 grid */}
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 p-4">
        <div className="min-w-0">
          <div className="truncate font-display text-[18px] font-semibold uppercase leading-none tracking-[-0.03em]">
            {channel.tokenSymbol.length > 10 ? `${channel.tokenSymbol.slice(0, 10)}...` : channel.tokenSymbol}
          </div>
          <div className="mt-1 truncate text-[13px] text-muted-foreground">
            {channel.tokenName}
          </div>
        </div>
        <div className="flex items-center">
          <Sparkline data={sparklineData} isPositive={isPositive} className="h-9 w-[100px]" />
        </div>
        <div>
          <div className="font-mono text-[20px] font-semibold tabular-nums leading-none">
            {channel.marketCapUsd > 0 ? formatMarketCap(channel.marketCapUsd) : "--"}
          </div>
        </div>
        <div className={cn(
          "flex items-center justify-end font-mono text-[15px] font-semibold tabular-nums",
          isPositive ? "positive-value" : "negative-value"
        )}>
          {changeStr}
        </div>
      </div>
    </Link>
  );
}

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("bump");
  const { address: account } = useFarcaster();

  const { channels, isLoading } = useExploreChannels(sortBy, searchQuery, account);

  // Fallback metadata fetch for channels without indexed metadata
  const channelUris = channels.filter((c) => !c.imageUri).map((c) => c.uri).filter(Boolean);
  const { getLogoUrl } = useBatchMetadata(channelUris);

  // Batch fetch sparkline data
  const coinAddresses = channels.map((c) => c.coinAddress);
  const { getSparkline } = useSparklineData(coinAddresses);

  const isSearching = searchQuery.length > 0;
  const showEmpty = !isLoading && channels.length === 0;

  return (
    <main className="min-h-screen bg-background">
      <InteractiveGridPattern
        className="!fixed inset-0 -z-10 bg-transparent"
        effectIntensity={0.3}
        centerGlowOpacity={0.1}
      />
      <div
        className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 76px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide lg:pb-0 lg:pt-[88px]">
          <div className="mx-auto w-full">
            {/* Mobile: sticky header */}
            <div className="sticky top-0 z-10 -mx-4 px-4 pb-3 lg:hidden"
              style={{ background: "linear-gradient(180deg, hsl(var(--background)) 80%, transparent 100%)" }}
            >
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by ticker or name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="field-input h-11 pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:bg-[hsl(var(--foreground)/0.08)] hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "bump" as const, label: "Bump", icon: Flame },
                  { key: "new" as const, label: "New", icon: Clock },
                  { key: "top" as const, label: "Top", icon: TrendingUp },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setSortBy(tab.key)}
                    className={`border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] flex h-11 items-center justify-center gap-1.5 px-2.5 font-display text-[12px] font-semibold tracking-[0.02em] transition-all ${
                      sortBy === tab.key
                        ? "bg-primary text-primary-foreground shadow-glass"
                        : "bg-[hsl(var(--foreground)/0.06)] text-muted-foreground hover:bg-[hsl(var(--foreground)/0.08)] hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop header */}
            <section className="hidden lg:block">
              <div className="flex items-end justify-between gap-8">
                <div>
                  <h1 className="page-title">Explore</h1>
                  <p className="page-subtitle">
                    Discover sticker channels and collect content to earn coin rewards.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search channels..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 w-[260px] rounded-[var(--radius)] bg-[hsl(var(--foreground)/0.04)] border border-[hsl(var(--foreground)/0.1)] pl-10 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 backdrop-blur-sm transition-all focus:outline-none focus:w-[320px] focus:border-[hsl(var(--primary)/0.4)] focus:bg-[hsl(var(--foreground)/0.06)]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {[
                      { key: "bump" as const, label: "Bump", icon: Flame },
                      { key: "new" as const, label: "New", icon: Clock },
                      { key: "top" as const, label: "Top", icon: TrendingUp },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setSortBy(tab.key)}
                        className={cn(
                          "flex h-10 items-center gap-1.5 px-3.5 font-display text-[11px] font-semibold tracking-[0.02em] transition-all rounded-[var(--radius)] border",
                          sortBy === tab.key
                            ? "bg-primary text-primary-foreground border-transparent shadow-glass"
                            : "bg-[hsl(var(--foreground)/0.04)] border-[hsl(var(--foreground)/0.1)] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--foreground)/0.08)]"
                        )}
                      >
                        <tab.icon className="h-3 w-3" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {isSearching && (
                <div className="mt-5 text-[13px] text-muted-foreground">
                  Showing results for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </section>

            {/* Mobile: channel rows */}
            <section className="overflow-hidden lg:hidden">
              {isLoading && (
                <div>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              )}

              {!isLoading && channels.length > 0 && (
                <div>
                  <AnimatePresence initial={false}>
                    {channels.map((channel, index) => {
                      const logoUrl = channel.imageUri ? ipfsToHttp(channel.imageUri) : getLogoUrl(channel.uri);
                      return (
                        <motion.div
                          key={channel.address}
                          layout
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <Link
                            href={`/channel/${channel.address}`}
                            className={`grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 py-4 transition-colors duration-200 ${
                              index > 0 ? "border-t border-[hsl(var(--foreground)/0.1)]" : ""
                            } hover-slab`}
                          >
                            <div className="flex items-center gap-3">
                              <TokenLogo
                                name={channel.tokenName}
                                logoUrl={logoUrl}
                                size="md-lg"
                              />
                              <div className="min-w-0">
                                <div className="truncate font-display text-[15px] font-semibold uppercase tracking-[-0.02em]">
                                  {channel.tokenSymbol.length > 10
                                    ? `${channel.tokenSymbol.slice(0, 10)}...`
                                    : channel.tokenSymbol}
                                </div>
                                <div className="truncate text-[13px] text-muted-foreground">
                                  {channel.tokenName}
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end">
                              <Sparkline
                                data={(() => {
                                  const hourly = getSparkline(channel.coinAddress, channel.priceUsd);
                                  if (hourly.length > 1) return hourly;
                                  if (channel.sparklinePrices.length > 1) return channel.sparklinePrices;
                                  return [channel.priceUsd, channel.priceUsd];
                                })()}
                                isPositive={channel.change24h >= 0}
                              />
                            </div>

                            <div className="text-right">
                              <div className="font-medium text-[15px] tabular-nums font-mono">
                                {channel.marketCapUsd > 0 ? formatMarketCap(channel.marketCapUsd) : "--"}
                              </div>
                              <div className={cn(
                                "text-[13px] tabular-nums font-mono",
                                channel.marketCapUsd > 0
                                  ? channel.change24h >= 0 ? "positive-value" : "negative-value"
                                  : "text-muted-foreground"
                              )}>
                                {channel.marketCapUsd > 0
                                  ? `${channel.change24h >= 0 ? "+" : ""}${channel.change24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                  : "--"}
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {showEmpty && isSearching && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Search className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-[15px] font-medium">No channels found</p>
                  <p className="mt-1 text-[13px] opacity-70">Try a different search term</p>
                </div>
              )}

              {showEmpty && !isSearching && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Flame className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-[15px] font-medium">No channels yet</p>
                  <p className="mt-1 text-[13px] opacity-70">Be the first to launch a channel</p>
                </div>
              )}
            </section>

            {/* Desktop card grid */}
            <div className="mt-5 hidden lg:block">
              {isLoading && (
                <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {!isLoading && channels.length > 0 && (
                <div className="grid auto-rows-min grid-cols-2 gap-5 xl:grid-cols-3">
                  <AnimatePresence initial={false}>
                    {channels.map((channel) => {
                      const logoUrl = channel.imageUri ? ipfsToHttp(channel.imageUri) : getLogoUrl(channel.uri);
                      return (
                        <motion.div
                          key={channel.address}
                          layout
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <ChannelCard
                            channel={channel}
                            logoUrl={logoUrl}
                            sparklineData={(() => {
                              const hourly = getSparkline(channel.coinAddress, channel.priceUsd);
                              if (hourly.length > 1) return hourly;
                              if (channel.sparklinePrices.length > 1) return channel.sparklinePrices;
                              return [channel.priceUsd, channel.priceUsd];
                            })()}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}

              {showEmpty && isSearching && (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <Search className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-[15px] font-medium">No channels found</p>
                  <p className="mt-1 text-[13px] opacity-70">Try a different search term</p>
                </div>
              )}

              {showEmpty && !isSearching && (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <Flame className="mb-3 h-10 w-10 opacity-30" />
                  <p className="text-[15px] font-medium">No channels yet</p>
                  <p className="mt-1 text-[13px] opacity-70">Be the first to launch a channel</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
