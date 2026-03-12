"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ChannelListItem } from "@/hooks/useAllChannels";
import { cn } from "@/lib/utils";
import { ipfsToHttp } from "@/lib/constants";
import { getChannelMinuteData, getChannelHourData } from "@/lib/subgraph-launchpad";

type ChannelCardProps = {
  channel: ChannelListItem;
  isTopBump?: boolean;
  isNewBump?: boolean;
};

const formatUsd = (value: number | undefined | null) => {
  if (value == null || value === 0) return "$0.00";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.0001) return `<$0.0001`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
};

// Mini sparkline chart component (takes pre-fetched candle prices)
function MiniSparkline({ prices, positive }: { prices: number[]; positive: boolean }) {
  const points = (() => {
    const width = 60;
    const height = 24;
    const padding = 3;

    if (prices.length === 0) {
      const y = height / 2;
      return `${padding},${y} ${width - padding},${y}`;
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // If all prices are the same, draw a flat line in the middle
    if (priceRange === 0) {
      const y = height / 2;
      return prices
        .map((_, i) => {
          const x = padding + (i / (prices.length - 1)) * (width - padding * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    }

    return prices
      .map((price, i) => {
        const x = padding + (i / (prices.length - 1)) * (width - padding * 2);
        const y = height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  return (
    <svg width="60" height="24" className={`overflow-visible ${positive ? "text-gain" : "text-loss"}`}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChannelCard({ channel, isTopBump = false, isNewBump = false }: ChannelCardProps) {
  const marketCapUsd = channel.marketCapUsd;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch candle data -- use minute candles for tokens < 24h old, hourly otherwise
  const tokenAge = channel.createdAt ? Math.floor(Date.now() / 1000) - channel.createdAt : Infinity;
  const { data: candles } = useQuery({
    queryKey: ["miniSparkline", channel.coinAddress, tokenAge < 86400 ? "minute" : "hour"],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const since = now - 86400;
      if (tokenAge < 86400) {
        return getChannelMinuteData(channel.address.toLowerCase(), since);
      }
      return getChannelHourData(channel.address.toLowerCase(), since);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Compute sparkline prices and 24h change from candles
  const { prices, change24h } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { prices: [], change24h: 0 };
    }
    const p = candles.map((c) => parseFloat(c.close));
    const oldPrice = parseFloat(candles[0].close);
    const change = oldPrice > 0
      ? ((channel.priceUsd - oldPrice) / oldPrice) * 100
      : 0;
    return { prices: p, change24h: change };
  }, [candles, channel.priceUsd]);

  // Fetch metadata to get image URL
  useEffect(() => {
    if (!channel.uri) return;

    const metadataUrl = ipfsToHttp(channel.uri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {
        // Silently fail - will show fallback
      });
  }, [channel.uri]);

  return (
    <Link href={`/channel/${channel.address}`} className="block">
      <div
        className={cn(
          "flex items-center gap-3 py-4 transition-colors border-b border-border",
          isNewBump && "animate-bump-enter",
          isTopBump && !isNewBump && "animate-bump-glow"
        )}
      >
        {/* Token Logo */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={channel.tokenSymbol}
              className="w-10 h-10 object-cover"
            />
          ) : (
            <span className="text-foreground/60 font-semibold text-sm">
              {channel.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Token Name & Symbol */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] truncate">
            {channel.tokenSymbol}
          </div>
          <div className="text-[13px] text-muted-foreground truncate mt-0.5">
            {channel.tokenName}
          </div>
        </div>

        {/* Mini Sparkline Chart */}
        <div className="flex-shrink-0 px-2">
          <MiniSparkline prices={prices} positive={change24h >= 0} />
        </div>

        {/* Market Cap & 24h Change */}
        <div className="flex-shrink-0 text-right min-w-[70px]">
          <div className="text-[15px] font-medium tabular-nums">
            {formatUsd(marketCapUsd)}
          </div>
          <div className={`text-[13px] tabular-nums mt-0.5 ${change24h >= 0 ? "text-gain" : "text-loss"}`}>
            {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
          </div>
        </div>
      </div>
    </Link>
  );
}
