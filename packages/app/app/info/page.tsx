"use client";

import { NavBar } from "@/components/nav-bar";

const INFO_SECTIONS = [
  {
    title: "What is Stickrnet?",
    content:
      "A content channel platform on Base. Create channels, post content stickers, and build communities around shared interests. Supporters collect stickers and earn coin rewards through staking.",
    bullets: [
      "Channels are launched with their own coin and liquidity pool",
      "Content stickers are NFTs that can be collected and staked",
      "All contracts are immutable -- nobody can change the rules",
    ],
  },
  {
    title: "Content & Collecting",
    content:
      "Each channel hosts content stickers (NFTs). Collecting a sticker pays the current owner and creator, with prices set by a Dutch auction mechanism that resets on each collect.",
    bullets: [
      "Collect stickers to become the new owner",
      "Owners earn fees when their sticker is collected again",
      "Creators earn fees on every collect of their content",
      "Staked stickers earn coin rewards from the rewarder",
    ],
  },
  {
    title: "Coin Rewards",
    content:
      "Channels mint coins over time using a Bitcoin-inspired halving schedule. Coins are distributed to staked content holders proportional to their stake.",
    bullets: [
      "Rewards follow a halving schedule -- early stakers earn the most",
      "Tail rewards ensure coins are minted forever",
      "Stake more content to earn more coins",
      "Claim accumulated rewards at any time",
    ],
  },
  {
    title: "Fee Distribution",
    content:
      "When content is collected, fees are split transparently on-chain between participants in the ecosystem.",
    bullets: [
      "Owner -- the current sticker owner receives the majority",
      "Creator -- the original content creator earns a fee",
      "Treasury -- grows liquidity via auctions",
      "Team -- the channel launcher earns a team fee",
      "Protocol -- small protocol fee",
    ],
  },
  {
    title: "Treasury Auctions",
    content:
      "Treasury fees accumulate as USDC and are auctioned off to LP holders. This permanently deepens liquidity for the coin.",
    bullets: [
      "Dutch auction -- price decays over time",
      "Buy when the price makes it profitable",
      "LP used in auctions gets burned -- liquidity only grows",
    ],
  },
  {
    title: "For Launchers",
    content:
      "Launch a channel in one click. Everything is configured at launch and locked forever -- fully immutable.",
    bullets: [
      "Bitcoin-style coin rewards with customizable parameters",
      "Earn team fees from all collecting activity",
      "Treasury grows liquidity automatically via auctions",
      "Optional content moderation to curate stickers",
    ],
  },
];

export default function InfoPage() {
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
        <div className="px-5 pb-4">
          <h1 className="text-2xl font-bold tracking-tight font-display">About</h1>
          <p className="text-[13px] text-muted-foreground mt-1">How Stickrnet works and why it matters</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
          <div className="space-y-0">
            {INFO_SECTIONS.map((section, index) => (
              <div
                key={index}
                className={`py-6 ${index > 0 ? "border-t border-border" : ""}`}
              >
                <h2 className="text-[17px] font-semibold text-foreground mb-3 font-display">
                  {section.title}
                </h2>
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-4">
                  {section.content}
                </p>
                <ul className="space-y-2">
                  {section.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="text-[14px] text-muted-foreground flex items-start gap-3 leading-snug"
                    >
                      <span className="text-foreground/50 mt-0.5 font-mono text-[12px]">--</span>
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
