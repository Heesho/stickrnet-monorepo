"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { NavBar } from "@/components/nav-bar";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useProfile } from "@/hooks/useProfile";
import { useBatchMetadata } from "@/hooks/useMetadata";
import { ipfsToHttp } from "@/lib/constants";

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

type TabKey = "owned" | "created" | "channels";

export default function ProfilePage() {
  const { address: account, isConnected, isConnecting, isInFrame, connect } = useFarcaster();
  const { profile, isLoading } = useProfile(account);
  const [tab, setTab] = useState<TabKey>("owned");

  const ownedUris = profile?.contentOwned?.map((c) => c.uri) ?? [];
  const createdUris = profile?.contentCreated?.map((c) => c.uri) ?? [];
  const allContentUris = useMemo(() => [...ownedUris, ...createdUris], [ownedUris, createdUris]);
  const { metadataMap } = useBatchMetadata(allContentUris);

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
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

          <div className="flex gap-2">
            {[
              { key: "owned" as const, label: "Collected" },
              { key: "created" as const, label: "Created" },
              { key: "channels" as const, label: "Channels" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-medium transition-all ${
                  tab === item.key
                    ? "bg-white text-black"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4">
          {!account && (
            <div className="text-sm text-muted-foreground">Connect a wallet to view your Stickers.</div>
          )}

          {account && isLoading && (
            <div className="text-sm text-muted-foreground">Loading profile...</div>
          )}

          {account && !isLoading && profile && (
            <div className="space-y-4">
              {tab === "owned" && (
                <div className="space-y-3">
                  {profile.contentOwned.length === 0 && (
                    <div className="text-sm text-muted-foreground">No collected Stickers yet.</div>
                  )}
                  {profile.contentOwned.map((content) => {
                    const metadata = metadataMap[content.uri];
                    const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;
                    const stakeUsd = parseFloat(content.stake) || 0;
                    return (
                      <Link key={content.id} href={`/channel/${content.channel.id}`} className="block">
                        <div className="card-elevated p-4 flex items-center gap-3">
                          {imageUrl ? (
                            <img src={imageUrl} alt={metadata?.name || "Sticker"} className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-[12px] text-muted-foreground">
                              #{content.tokenId}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="text-[14px] font-semibold">
                              {metadata?.name || `Sticker #${content.tokenId}`}
                            </div>
                            <div className="text-[12px] text-muted-foreground">
                              {content.channel.name} · ${content.channel.symbol}
                            </div>
                          </div>
                          <div className="text-[12px] text-muted-foreground tabular-nums">
                            {stakeUsd > 0 ? formatUsd(stakeUsd) : "--"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {tab === "created" && (
                <div className="space-y-3">
                  {profile.contentCreated.length === 0 && (
                    <div className="text-sm text-muted-foreground">No created Stickers yet.</div>
                  )}
                  {profile.contentCreated.map((content) => {
                    const metadata = metadataMap[content.uri];
                    const imageUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;
                    const volumeUsd = parseFloat(content.collectVolume) || 0;
                    return (
                      <Link key={content.id} href={`/channel/${content.channel.id}`} className="block">
                        <div className="card-elevated p-4 flex items-center gap-3">
                          {imageUrl ? (
                            <img src={imageUrl} alt={metadata?.name || "Sticker"} className="w-12 h-12 rounded-lg object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-[12px] text-muted-foreground">
                              #{content.tokenId}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="text-[14px] font-semibold">
                              {metadata?.name || `Sticker #${content.tokenId}`}
                            </div>
                            <div className="text-[12px] text-muted-foreground">
                              {content.channel.name} · ${content.channel.symbol}
                            </div>
                          </div>
                          <div className="text-[12px] text-muted-foreground tabular-nums">
                            {volumeUsd > 0 ? formatUsd(volumeUsd) : "--"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {tab === "channels" && (
                <div className="space-y-3">
                  {profile.channelsLaunched.length === 0 && (
                    <div className="text-sm text-muted-foreground">No channels launched yet.</div>
                  )}
                  {profile.channelsLaunched.map((channel) => (
                    <Link key={channel.id} href={`/channel/${channel.id}`} className="block">
                      <div className="card-elevated p-4 flex items-center justify-between">
                        <div>
                          <div className="text-[14px] font-semibold">{channel.name}</div>
                          <div className="text-[12px] text-muted-foreground">${channel.symbol}</div>
                        </div>
                        <div className="text-[12px] text-muted-foreground">Launched</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
