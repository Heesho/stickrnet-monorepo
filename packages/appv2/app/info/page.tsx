"use client";

const INFO_SECTIONS = [
  {
    title: "What is stickr.net?",
    content:
      "A launchpad for content communities on Base. Each community gets a content stream, a community coin with halving emissions, a treasury funded by collection fees, and permanent liquidity on Uniswap V2.",
    bullets: [
      "Curators are the miners — own stickers, mine coins",
      "No algorithm, no committee — just what people are willing to pay to own",
      "All contracts are immutable — nobody can change the rules",
      "Liquidity is locked forever — LP is burned on launch",
    ],
  },
  {
    title: "Stickers",
    content:
      "Every post is a single NFT. One post, one owner. Priced in USDC. A sticker can always be collected from the current owner at the current price. Price 2x's after each collection, then decays toward $0 over 24 hours.",
    bullets: [
      "Everything is always collectible — just a matter of when the price is right",
      "Posts nobody cares about drift to $0",
      "Posts people fight over keep getting collected and repriced",
      "The feed sorts itself through market dynamics",
    ],
  },
  {
    title: "Curation Mining",
    content:
      "Owning stickers is how you mine the community coin. Your mining weight equals the price you paid to collect. Find good posts early, collect them before they get expensive, hold them to mine.",
    bullets: [
      "Collecting a sticker automatically stakes it in the mining pool",
      "More valuable stickers mine at a higher rate",
      "If someone wants yours, they pay to take it — you get 80% of the price",
      "Curators are the miners — taste is hashpower",
    ],
  },
  {
    title: "Collection Split",
    content:
      "When a sticker gets collected, the USDC paid splits across five recipients. Creators get paid every time their post changes hands. Make stuff people want, get paid for it.",
    bullets: [
      "80% → previous owner",
      "15% → treasury (defaults to LP buyback/burns)",
      "3% → creator (paid on every collection, forever)",
      "1% → team (channel launcher)",
      "1% → protocol",
    ],
  },
  {
    title: "Halving Emissions",
    content:
      "The community coin follows a Bitcoin-style halving schedule. Early participants mine more. Emissions decrease over time but never stop — perpetual tail rewards ensure ongoing incentives forever.",
    bullets: [
      "~50% of total supply is mined in the first month",
      "Rewards halve every 30 days",
      "Tail rewards kick in after ~7 months — coins are mined forever",
      "Anyone can trigger the weekly mint — it's permissionless",
    ],
  },
  {
    title: "Treasury Auctions",
    content:
      "Treasury fees accumulate as USDC from collection fees. Buyable through a Dutch auction by paying with LP tokens, which get permanently burned — deepening liquidity for everyone.",
    bullets: [
      "Dutch auction — price decays over time",
      "Buy when the price makes it profitable",
      "LP tokens used to pay get burned — liquidity only grows",
      "New auction epoch starts after each purchase at 1.2x the last price",
    ],
  },
];

export default function InfoPage() {
  return (
    <main className="min-h-screen bg-background">
      <div
        className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 lg:px-16"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 76px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {/* Header */}
        <div className="page-header hidden lg:block pt-[88px]">
          <div className="mx-auto w-full">
            <h1 className="page-title">About</h1>
            <p className="page-subtitle">How stickr.net works — sticker channels, coin mining, and onchain collecting.</p>
          </div>
        </div>

        {/* Mobile: glass cards stacked */}
        <div className="flex-1 scrollbar-hide pb-3 pt-2 lg:hidden">
          <div className="mx-auto w-full space-y-4">
            {INFO_SECTIONS.map((section, index) => (
              <div
                key={index}
                className="slab-panel rounded-[var(--radius)] px-4 py-4"
              >
                <h2 className="mb-2 font-display text-[16px] font-semibold tracking-[-0.02em] text-foreground">
                  {section.title}
                </h2>
                <p className="mb-3 text-[14px] leading-relaxed text-muted-foreground">
                  {section.content}
                </p>
                <ul className="space-y-2">
                  {section.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-[13px] leading-snug text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop: card grid */}
        <div className="hidden lg:block flex-1 scrollbar-hide pb-6 pt-2">
          <div className="mx-auto w-full grid grid-cols-2 xl:grid-cols-3 gap-5">
            {INFO_SECTIONS.map((section, index) => (
              <div
                key={index}
                className="slab-panel rounded-[var(--radius)] px-5 py-5"
              >
                <h2 className="mb-3 font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                  {section.title}
                </h2>
                <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">
                  {section.content}
                </p>
                <ul className="space-y-2">
                  {section.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-[13px] leading-snug text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
