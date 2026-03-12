"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Flame, ArrowRight, Check } from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import { useAuctions, type AuctionItem } from "@/hooks/useAuctions";
import { useBatchMetadata } from "@/hooks/useMetadata";
import { TokenLogo } from "@/components/token-logo";

function SkeletonRow() {
  return (
    <div
      className="flex items-center justify-between py-4 border-b border-border"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary animate-pulse" />
        <div className="space-y-2">
          <div className="w-16 h-4 rounded bg-secondary animate-pulse" />
          <div className="w-24 h-3 rounded bg-secondary animate-pulse" />
        </div>
      </div>
      <div className="space-y-2 text-right">
        <div className="w-14 h-4 rounded bg-secondary animate-pulse ml-auto" />
        <div className="w-10 h-3 rounded bg-secondary animate-pulse ml-auto" />
      </div>
    </div>
  );
}

function formatProfit(profit: number): string {
  const sign = profit >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(profit).toFixed(2)}`;
}

export default function AuctionsPage() {
  const { auctions, isLoading } = useAuctions();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Collect channel URIs for batch metadata fetch
  const channelUris = useMemo(
    () => auctions.map((a) => a.uri),
    [auctions]
  );
  const { getLogoUrl } = useBatchMetadata(channelUris);

  const selectedAuction: AuctionItem | undefined = auctions[selectedIndex];

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 180px)",
        }}
      >
        {/* Header */}
        <div className="px-4 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Auctions</h1>
          <p className="text-[13px] text-muted-foreground">
            Trade LP tokens for USDC rewards
          </p>
        </div>

        {/* Auction List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4">
          <div>
            {isLoading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}

            {!isLoading &&
              auctions.map((auction, index) => (
                <button
                  key={auction.contentAddress}
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full py-4 transition-all text-left ${
                    selectedIndex === index
                      ? "bg-zinc-800"
                      : "hover:bg-zinc-800/80"
                  }${index < auctions.length - 1 ? " border-b border-border" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <TokenLogo
                          name={auction.tokenName}
                          logoUrl={getLogoUrl(auction.uri)}
                          size="md-lg"
                        />
                        {selectedIndex === index && (
                          <div className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                            <Check className="w-3 h-3 text-black" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-[15px]">
                          {auction.tokenSymbol.length > 8
                            ? `${auction.tokenSymbol.slice(0, 8)}...`
                            : auction.tokenSymbol}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {auction.tokenName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-medium text-[15px] tabular-nums ${
                          auction.isProfitable ? "text-foreground/70" : "text-foreground/50"
                        }`}
                      >
                        {formatProfit(auction.profit)}
                      </div>
                      <div className="text-[13px] text-muted-foreground">profit</div>
                    </div>
                  </div>
                </button>
              ))}

            {!isLoading && auctions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                  <Flame className="w-6 h-6 opacity-50" />
                </div>
                <p className="text-[15px] font-medium">No active auctions</p>
                <p className="text-[13px] mt-1 opacity-70">Check back later</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Action Bar */}
        {selectedAuction && (
          <div
            className="fixed left-0 right-0 bg-background border-t border-zinc-800"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)",
            }}
          >
            <div className="max-w-[520px] mx-auto px-4 py-4">
              {/* Trade Summary */}
              <div
                className="pb-4 mb-4 border-b border-border"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[12px] text-muted-foreground mb-1">
                      You Pay
                    </div>
                    <div className="flex items-center gap-2">
                      <TokenLogo
                        name={selectedAuction.tokenName}
                        logoUrl={getLogoUrl(selectedAuction.uri)}
                        size="md-lg"
                      />
                      <div>
                        <span className="font-semibold text-[17px] tabular-nums">
                          ${selectedAuction.lpCostUsd.toFixed(2)}
                        </span>
                        <div className="text-[11px] text-muted-foreground">
                          {selectedAuction.tokenSymbol}-USDC LP
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-foreground/50" />
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] text-muted-foreground mb-1">
                      You Receive
                    </div>
                    <div className="font-semibold text-[17px] tabular-nums">
                      ${selectedAuction.rewardUsd.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">USDC</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div
                  className={`text-[15px] font-medium tabular-nums ${
                    selectedAuction.isProfitable ? "text-foreground/70" : "text-foreground/50"
                  }`}
                >
                  {selectedAuction.isProfitable
                    ? `+$${selectedAuction.profit.toFixed(2)} profit`
                    : `-$${Math.abs(selectedAuction.profit).toFixed(2)} loss`}
                </div>
                <Link
                  href={`/channel/${selectedAuction.contentAddress}`}
                  className="h-10 px-6 bg-white text-black text-[14px] font-semibold rounded-none hover:bg-zinc-200 transition-colors inline-flex items-center justify-center"
                >
                  Buy Auction
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}
