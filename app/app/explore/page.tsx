"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Zap, Clock, Star, X } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { useExploreChannels, type SortOption, type ChannelListItem } from "@/hooks/useChannels";
import { useBatchMetadata } from "@/hooks/useMetadata";
import { useFarcaster } from "@/hooks/useFarcaster";
import { STICKRNET_SUBGRAPH_URL } from "@/lib/subgraph";

function formatMarketCap(mcap: number): string {
  if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(2)}B`;
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(0)}K`;
  return `$${mcap.toFixed(0)}`;
}

function ChannelLogo({
  channel,
  getLogoUrl,
}: {
  channel: ChannelListItem;
  getLogoUrl: (uri: string) => string | null;
}) {
  const logoUrl = getLogoUrl(channel.uri);
  const [imgError, setImgError] = useState(false);

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={channel.name}
        className="w-10 h-10 rounded-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-gradient-to-br from-zinc-500 to-zinc-700 text-white shadow-lg">
      {channel.name.charAt(0).toUpperCase()}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="w-10 h-10 rounded-full bg-secondary animate-pulse" />
      <div className="space-y-2">
        <div className="w-20 h-4 rounded bg-secondary animate-pulse" />
        <div className="w-24 h-3 rounded bg-secondary animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="w-14 h-4 rounded bg-secondary animate-pulse" />
        <div className="w-10 h-3 rounded bg-secondary animate-pulse" />
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("bump");
  const { address: account, isConnected, isInFrame, isConnecting, connect } = useFarcaster();

  const { channels, isLoading } = useExploreChannels(sortBy, searchQuery);

  const channelUris = channels.map((c) => c.uri).filter(Boolean);
  const { getLogoUrl } = useBatchMetadata(channelUris);

  const isSearching = searchQuery.length > 0;
  const showEmpty = !isLoading && channels.length === 0;
  const isSubgraphReady = STICKRNET_SUBGRAPH_URL.length > 0;

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
            {isConnected && account ? (
              <div className="px-3 py-1.5 rounded-full bg-secondary text-[13px] text-muted-foreground font-mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
            ) : (
              !isInFrame && (
                <button
                  onClick={() => connect()}
                  disabled={isConnecting}
                  className="px-4 py-2 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
            <input
              type="text"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20 text-[15px] transition-shadow"
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

          <div className="flex gap-2 mt-3">
            {[
              { key: "bump" as const, label: "Active", icon: Zap },
              { key: "new" as const, label: "New", icon: Clock },
              { key: "top" as const, label: "Top", icon: Star },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSortBy(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-all ${
                  sortBy === tab.key
                    ? "bg-white text-black"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-2">
          {!isSubgraphReady && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[15px] font-medium">Subgraph not configured</p>
              <p className="text-[13px] mt-1 opacity-70">Set NEXT_PUBLIC_STICKRNET_SUBGRAPH_URL</p>
            </div>
          )}

          {isSubgraphReady && isLoading && (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {isSubgraphReady && !isLoading && channels.length > 0 && (
            <div>
              {channels.map((channel, index) => {
                const marketCap = channel.priceUsd * channel.totalMinted;
                return (
                  <Link
                    key={channel.address}
                    href={`/channel/${channel.address}`}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4 transition-all duration-200 hover:bg-white/[0.02]"
                    style={{
                      borderBottom:
                        index < channels.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <ChannelLogo channel={channel} getLogoUrl={getLogoUrl} />
                      <div>
                        <div className="font-semibold text-[15px]">
                          {channel.symbol.length > 6 ? `${channel.symbol.slice(0, 6)}...` : channel.symbol}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {channel.name.length > 14 ? `${channel.name.slice(0, 14)}...` : channel.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-zinc-200">
                        {channel.contentCount} stickers
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="font-medium text-[15px] tabular-nums">
                        {marketCap > 0 ? formatMarketCap(marketCap) : "--"}
                      </div>
                      <div className="text-[13px] tabular-nums text-zinc-400">
                        {channel.collectVolumeUsd > 0 ? `$${channel.collectVolumeUsd.toFixed(0)} vol` : "--"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {isSubgraphReady && showEmpty && isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[15px] font-medium">No channels found</p>
              <p className="text-[13px] mt-1 opacity-70">Try a different search term</p>
            </div>
          )}

          {isSubgraphReady && showEmpty && !isSearching && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Zap className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[15px] font-medium">No channels launched yet</p>
              <p className="text-[13px] mt-1 opacity-70">Be the first to launch a channel</p>
            </div>
          )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
