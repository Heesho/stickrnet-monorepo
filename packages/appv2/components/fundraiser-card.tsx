"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import type { CoinListItem } from "@/hooks/useAllFundraisers";
import { cn } from "@/lib/utils";
import { ipfsToHttp } from "@/lib/constants";
import { getCoinMinuteData, getCoinHourData } from "@/lib/subgraph-launchpad";

type ChannelCardProps = {
  coin: CoinListItem;
  isTopBump?: boolean;
  isNewBump?: boolean;
};

const renderEpochSeconds = Math.floor(Date.now() / 1000);

const formatUsd = (value: number | undefined | null) => {
  if (value == null || value === 0) return "$0.00";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.0001) return `<$0.0001`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(2)}`;
};

// Mini sparkline chart component (takes pre-fetched candle prices)
function MiniSparkline({ prices }: { prices: number[] }) {
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
    <svg width="60" height="24" className="overflow-visible text-muted-foreground">
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

export function ChannelCard({ coin, isTopBump = false, isNewBump = false }: ChannelCardProps) {
  const marketCapUsd = coin.marketCapUsd;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch candle data — use minute candles for tokens < 24h old, hourly otherwise
  const tokenAge = coin.createdAt ? renderEpochSeconds - coin.createdAt : Infinity;
  const { data: candles } = useQuery({
    queryKey: ["miniSparkline", coin.coinAddress, tokenAge < 86400 ? "minute" : "hour"],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const since = now - 86400;
      if (tokenAge < 86400) {
        return getCoinMinuteData(coin.coinAddress.toLowerCase(), since);
      }
      return getCoinHourData(coin.coinAddress.toLowerCase(), since);
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
      ? ((coin.priceUsd - oldPrice) / oldPrice) * 100
      : 0;
    return { prices: p, change24h: change };
  }, [candles, coin.priceUsd]);

  // Fetch metadata to get image URL
  useEffect(() => {
    if (!coin.uri) return;

    const metadataUrl = ipfsToHttp(coin.uri);
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
  }, [coin.uri]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
    <Link href={`/channel/${coin.address}`} className="block">
      <div
        className={cn(
          "data-row hover-slab flex items-center gap-3 px-3 py-4 rounded-[var(--radius)]",
          isNewBump && "light-leak animate-bump-in",
          isTopBump && !isNewBump && "light-leak"
        )}
      >
        {/* Token Logo */}
        <div className="border border-[hsl(var(--foreground)/0.1)] rounded-[var(--radius)] flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-[hsl(var(--foreground)/0.04)]">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={coin.tokenSymbol}
              className="w-10 h-10 object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">
              {coin.tokenSymbol.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Token Name & Symbol */}
        <div className="flex-1 min-w-0">
          <div className="truncate font-display text-[15px] font-semibold uppercase tracking-[-0.02em]">
            {coin.tokenSymbol}
          </div>
          <div className="text-[13px] text-muted-foreground truncate mt-0.5">
            {coin.tokenName}
          </div>
        </div>

        {/* Mini Sparkline Chart */}
        <div className="flex-shrink-0 px-2">
          <MiniSparkline prices={prices} />
        </div>

        {/* Market Cap & 24h Change */}
        <div className="flex-shrink-0 text-right min-w-[70px]">
          <div className="text-[15px] font-medium tabular-nums">
            {formatUsd(marketCapUsd)}
          </div>
          <div className={cn("mt-0.5 text-[13px] tabular-nums", change24h >= 0 ? "positive-value" : "negative-value")}>
            {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
          </div>
        </div>
      </div>
    </Link>
    </motion.div>
  );
}
