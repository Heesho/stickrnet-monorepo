"use client";

import { NavBar } from "@/components/nav-bar";
import { useFarcaster } from "@/hooks/useFarcaster";

const INFO_SECTIONS = [
  {
    title: "What is StickrNet?",
    content:
      "StickrNet is a launchpad for onchain content channels. Each channel gets its own token and a living stream of Stickers that can be collected in a Dutch auction.",
    bullets: [
      "Launch a channel with locked liquidity",
      "Post Stickers as NFTs with perpetual royalties",
      "Collect to earn the channel token over time",
    ],
  },
  {
    title: "How Collecting Works",
    content:
      "Every Sticker is always collectible. The price starts high and decays over time until someone collects it.",
    bullets: [
      "Collecting pays the previous owner 80%",
      "Creators earn fees each time their Sticker is collected",
      "Treasury fees fund auctions for token holders",
    ],
  },
  {
    title: "Mining the Channel Token",
    content:
      "Collectors earn the channel token based on how much USDC they stake in Stickers.",
    bullets: [
      "Bigger stakes earn more emissions",
      "Emissions halve on a fixed schedule",
      "Claim rewards any time",
    ],
  },
  {
    title: "Fair Launch Mechanics",
    content:
      "No presales or preferential allocations. Channels are launched with public liquidity and fair auctions.",
    bullets: [
      "Dutch auctions reduce sniping",
      "All liquidity is locked",
      "Everything is onchain and transparent",
    ],
  },
];

export default function InfoPage() {
  const { address } = useFarcaster();

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
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">About</h1>
            {address && (
              <div className="px-3 py-1.5 rounded-full bg-secondary text-[13px] text-muted-foreground font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4">
          <div className="space-y-6">
            {INFO_SECTIONS.map((section, index) => (
              <div key={section.title} className={index < INFO_SECTIONS.length - 1 ? "pb-6 border-b border-white/10" : ""}>
                <h2 className="font-semibold text-foreground mb-2">{section.title}</h2>
                <p className="text-sm text-muted-foreground mb-3">{section.content}</p>
                <ul className="space-y-1.5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-zinc-500 mt-0.5">•</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
