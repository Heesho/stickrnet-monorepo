"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Flame, Clock, TrendingUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { NavBar } from "@/components/nav-bar";
import { useExploreChannels, type ChannelListItem, type SortOption } from "@/hooks/useAllChannels";
import { useBatchMetadata } from "@/hooks/useMetadata";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useFarcaster } from "@/hooks/useFarcaster";
import { formatMarketCap } from "@/lib/format";
import { TokenLogo } from "@/components/token-logo";


/** Mini sparkline chart */
function Sparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const pad = 4; // padding so strokes aren't clipped at edges

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

function SkeletonRow() {
  return (
    <div
      className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 py-4 border-b border-border"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary animate-pulse" />
        <div className="space-y-2">
          <div className="w-16 h-4 rounded bg-secondary animate-pulse" />
          <div className="w-24 h-3 rounded bg-secondary animate-pulse" />
        </div>
      </div>
      <div className="flex justify-center">
        <div className="w-16 h-8 rounded bg-secondary animate-pulse" />
      </div>
      <div className="text-right space-y-2">
        <div className="w-14 h-4 rounded bg-secondary animate-pulse ml-auto" />
        <div className="w-10 h-3 rounded bg-secondary animate-pulse ml-auto" />
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("bump");
  const { address: account } = useFarcaster();

  const { channels, isLoading } = useExploreChannels(sortBy, searchQuery, account);

  // Batch fetch metadata for logos
  const channelUris = channels.map((c) => c.uri).filter(Boolean);
  const { getLogoUrl } = useBatchMetadata(channelUris);

  // Batch fetch hourly sparkline data (7 days, more granular than daily)
  const coinAddresses = channels.map((c) => c.coinAddress);
  const { getSparkline } = useSparklineData(coinAddresses);

  const isSearching = searchQuery.length > 0;
  const showEmpty = !isLoading && channels.length === 0;

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Header */}
        <div className="px-4 pb-2">
          <div className="mb-4">
            <h1 className="text-2xl font-bold tracking-tight font-display">Explore</h1>
            <p className="text-[13px] text-muted-foreground mt-1">Discover channels and collect content to earn coin rewards</p>
          </div>

          {/* Search + Sort */}
          <div className="flex items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 pl-10 pr-10 rounded-none bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-[15px] transition-shadow"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex">
              {[
                { key: "bump" as const, label: "Bump", icon: Flame },
                { key: "new" as const, label: "New", icon: Clock },
                { key: "top" as const, label: "Top", icon: TrendingUp },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSortBy(tab.key)}
                  className={`flex items-center gap-1 px-2.5 h-9 rounded-none text-[12px] font-medium transition-all ${
                    sortBy === tab.key
                      ? "bg-white text-black"
                      : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-2">
          {/* Loading state */}
          {isLoading && (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {/* Loaded - render channel rows */}
          {!isLoading && channels.length > 0 && (
            <div>
              <AnimatePresence initial={false}>
                {channels.map((channel) => (
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
                      className="grid grid-cols-[1.2fr_1fr_0.8fr] items-center gap-2 py-4 transition-colors duration-200 hover:bg-white/[0.03]"
                    >
                      {/* Left side - Logo, Symbol, Name */}
                      <div className="flex items-center gap-3">
                        <TokenLogo
                          name={channel.tokenName}
                          logoUrl={getLogoUrl(channel.uri)}
                          size="md-lg"
                        />
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

                      {/* Middle - Sparkline */}
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

                      {/* Right side - Market cap and 24h change */}
                      <div className="text-right">
                        <div className="font-medium text-[15px] tabular-nums font-mono">
                          {channel.marketCapUsd > 0
                            ? formatMarketCap(channel.marketCapUsd)
                            : "--"}
                        </div>
                        <div className={`text-[13px] tabular-nums font-mono ${
                          channel.marketCapUsd > 0
                            ? channel.change24h >= 0 ? "text-[#A78BFA]" : "text-[#2DD4BF]"
                            : "text-foreground/60"
                        }`}>
                          {channel.marketCapUsd > 0
                            ? `${channel.change24h >= 0 ? "+" : ""}${channel.change24h.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                            : "--"}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Empty states */}
          {showEmpty && isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[15px] font-medium">No channels found</p>
              <p className="text-[13px] mt-1 opacity-70">Try a different search term</p>
            </div>
          )}

          {showEmpty && !isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Flame className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[15px] font-medium">No channels yet</p>
              <p className="text-[13px] mt-1 opacity-70">Be the first to launch a channel</p>
            </div>
          )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
