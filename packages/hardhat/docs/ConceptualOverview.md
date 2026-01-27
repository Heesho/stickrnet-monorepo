# 0) Identity

StickrNet is a marketplace where creative works are always in motion: every piece can be taken over by someone else at a declining price, and the last price paid becomes that holder’s skin in the game. It sits inside the Donut ecosystem as one of the rigs designed to route activity back to $DONUT: launching a new marketplace instance requires locking up DONUT liquidity, and ongoing trading sends value to a shared treasury that can be auctioned for the DONUT-facing liquidity token. We at GlazeCorp built and maintain this product as contributors to DonutDAO; the protocol rules live on-chain, and DonutDAO’s structures sit above us for high-stakes decisions.

# 1) The core idea

Think of each piece of content as a museum exhibit behind sliding glass. Anyone can pay to open the case and move the exhibit to their own gallery, but the price of opening that case starts high and slowly falls to zero over about a month. The last person who opened the case left their payment behind as their “stake,” and that stake qualifies them for streamed rewards until someone else opens the case again. The few concepts that matter most:
- **Ever-collectible exhibits:** ownership is temporary because another visitor can always step in and take over.
- **Falling asking price:** the asking price for a takeover falls linearly from a set start down to free if nobody acts in time.
- **Stake-linked rewards:** what you last paid is your weight for pooled rewards.
- **Revenue split on every takeover:** the outgoing holder, the creator, the launcher’s team, a protocol address, and the treasury all receive fixed slices.
- **Treasury auctions:** the treasury portion is periodically buyable by burning the liquidity token tied to DONUT.

# 2) Why this exists

Traditional collectibles reward long-term holders for waiting. Here, activity itself is the feature: frequent handoffs surface demand signals, keep liquidity moving, and create an always-on reward stream for people willing to fund content they believe others will want. Previous approaches either froze assets (slow markets) or demanded bidding wars (friction for newcomers). Our design invites participation at any time: you simply decide when the asking price feels fair and act. The guiding principle is to align curiosity, support for creators, and treasury growth without opaque knobs.

# 3) The cast of characters

- **Creators:** publish works and receive a small slice every time their work changes hands. They want reach and recurring income; they risk waiting for someone to value their work enough to collect it.
- **Collectors:** pay to take over a piece, gain reward weight equal to their payment, and receive most of the next buyer’s payment if collected from. They want upside from future interest and steady rewards; they risk paying too much before demand materializes.
- **Launchers (teams spinning up new marketplaces):** lock up DONUT and seed liquidity to create a new instance, then receive the “team” slice on every trade. They want the marketplace to stay active; they risk their upfront DONUT if the market stays quiet.
- **Treasury participants:** can burn the liquidity token in exchange for the accumulated treasury assets. They want to capture value from marketplace activity; they risk overpaying if they time the auction poorly.
- **Protocol owner role:** can adjust the address that receives the protocol slice and the minimum DONUT needed to launch. Influence is narrow and transparent; if set to zero, the protocol slice disappears.

# 4) The system loop

1. A creator posts a piece; it starts with a minimum asking price and is instantly takeable unless moderation is turned on.
2. A collector pays the current asking price and takes the piece; their payment becomes their stake for rewards.
3. Rewards accumulate in the background from two sources: external tokens sent in and newly minted incentive tokens that stream out each week on a declining schedule. Anyone can trigger the weekly mint and the handoff of accrued balances into the reward pool.
4. If another collector arrives, they pay the then-current asking price (which may have decayed), the outgoing collector receives most of it, and the new payment replaces the old stake.
5. Each takeover resets the asking price to roughly double what was just paid (never below the configured minimum) and restarts the price decay timer.
6. A portion of every takeover piles into a treasury, which can be bought out by burning the DONUT-paired liquidity token in a separate falling-price auction; that auction’s price also resets upward after each purchase.
7. The loop repeats as long as people are willing to time the price decay and chase rewards.

# 5) Incentives and value flow

- **Who pays:** collectors pay the quote token when they take over a piece. Treasury buyers pay with the DONUT liquidity token when they empty the treasury auction.
- **How it is split on a takeover:** about four-fifths goes to the outgoing holder, a modest slice goes to the creator, another slice goes to the launcher’s team, a small slice can go to a protocol address if set, and the remainder flows to the treasury auction. These percentages are fixed in code.
- **Who earns rewards:** anyone currently holding a stake (i.e., the last payer for any piece) earns from the shared reward pool in proportion to what they paid relative to everyone else’s stakes.
- **Where rewards come from:** external deposits of the quote token and a native reward token that is minted weekly with a halving schedule until it reaches a perpetual tail rate.
- **Simple example:** if total stakes across all pieces sum to 100 and you paid 5, you hold 5% of the reward weight. If 10 tokens are streamed over the current period, you can claim roughly 0.5 when you ask for your rewards.

# 6) The rules of the system

- **Allowed:** anyone can create content; anyone can take over approved pieces by paying the asking price before the deadline they set; anyone can trigger reward minting and distribution to keep accruals flowing; anyone can buy the treasury auction by burning the liquidity token.
- **Discouraged or impossible:** you cannot transfer pieces through standard NFT transfers; moderation, when enabled, must approve pieces before they can be taken; you cannot bypass paying the asking price; you cannot mint the reward token outside the emission schedule.
- **Enforced automatically:** price decay, fee splits, stake updates, and reward math run deterministically on-chain. Reward weights move only when a piece is collected.
- **Left open on purpose:** moderation can be toggled and delegated; the protocol fee address and launch threshold can change; creators choose their own metadata.

# 7) A concrete walkthrough (with numbers)

1. Riley creates an illustration. Its asking price starts at 0.01 of the quote token and will glide to zero over 30 days.
2. Sam watches the price drop for a week until it hits 0.008. Sam pays 0.008 to take over. The split looks like this:
   - 0.0064 back to Riley if Riley was the previous holder (80%)
   - 0.0012 to the treasury auction (15%)
   - 0.00016 to Riley as the creator (2%)
   - 0.00016 to the launcher’s team (2%)
   - 0.00008 to the protocol address if one is set (1%)
   Sam’s stake is now 0.008 for reward weighting, and the asking price resets to roughly 0.016 before it starts falling again.
3. Jamie arrives three days later when the asking price has decayed to 0.012 and pays it. Sam receives 0.0096 back (80% of Jamie’s payment), and Jamie’s stake becomes 0.012. Rewards now stream to Jamie instead of Sam.
4. Meanwhile, the treasury auction has been filling. Casey burns liquidity tokens tied to DONUT to buy out the treasury balance at the current auction price, which also falls over its own timer.

# 8) What this solves (and what it does not)

**Solves:**
- Keeps content markets lively by making takeover always possible and pricing predictable.
- Gives creators recurring earnings without manual royalty enforcement.
- Routes activity-driven fees into a treasury that can be reclaimed by DONUT-aligned participants.
- Distributes rewards automatically to those who commit capital to content.

**Does NOT:**
- Guarantee profit or stable prices; paying early or late can lose money if demand fades.
- Prevent low-quality or harmful content on its own; moderation must be enabled and staffed to filter.
- Replace broader governance; protocol-level addresses and thresholds still rely on human choices.
- Promise future features beyond what exists in the code today.

# 9) Power, incentives, and trust

- **Influence points:** the deployer of the main launch system can set the protocol fee address and launch threshold; each marketplace launcher owns their instance and can toggle moderation, set moderators, and update treasury or team addresses.
- **What users must trust:** that moderation, if enabled, is exercised responsibly; that the launcher keeps treasury and team addresses sensible; that auction buyers bring enough liquidity token to clear the treasury when they want to.
- **What users do not need to trust:** fee splits, price decay, stake tracking, and reward math—they are enforced by code and visible on-chain. The reward token’s emission pace is pre-set by the halving schedule and only needs someone to trigger the weekly minting call.
- **Incentives reducing trust:** outgoing holders want fair future buyers, so they tend to welcome attention; treasury buyers burn liquidity tokens, tying value back to DONUT; reward seekers are motivated to keep minting and distribution calls running so everyone accrues fairly.

# 10) What keeps this system honest

- **Rewarded behaviors:** creating compelling content that others will want to take; timing takeovers when prices feel right; triggering weekly minting and distributions so rewards do not sit idle; buying the treasury when it is full and the auction price is attractive.
- **Discouraged behaviors:** trying to transfer outside the takeover flow (blocked); attempting to bypass price checks or stale deadlines (reverted); submitting empty or unapproved content when moderation is on (blocked).
- **If people act selfishly:** selfish collectors still have to pay the asking price, so they indirectly top up rewards and treasury. If someone overpays, the next buyer benefits from the higher reset and larger potential payout.
- **If participation slows:** asking prices decay toward free, making it cheaper for the next curious buyer to step in; reward emissions continue at the tail rate, so there is always some drip for whoever holds stakes.

# 11) FAQ

1. **Is this just an NFT marketplace?** It is a marketplace where items can always be taken; the focus is on continuous turnover and reward sharing, not permanent ownership.
2. **Do I need to know crypto jargon?** No. You pay the displayed price, and the system handles the splits and rewards.
3. **Why would I want my piece taken from me?** You receive most of the next buyer’s payment and can profit if the next price is higher.
4. **What happens if nobody buys after me?** The asking price falls toward zero, and you keep earning rewards based on what you paid until someone else acts.
5. **Can I give my piece to a friend?** Standard transfers are disabled; a friend would need to take it through the normal purchase flow.
6. **Where do rewards come from?** From two pools: outside funds sent into the system and a native reward token that mints weekly and tapers over time.
7. **Who controls the rules?** Each marketplace launcher controls moderation and address settings for their instance; a central owner can change the protocol fee address and the DONUT required to launch.
8. **What is the treasury auction for?** It lets people burn the DONUT liquidity token to claim accumulated fees, recycling value back toward DONUT.
9. **What if the protocol fee address is empty?** Then the protocol slice (1%) simply is not taken; the rest of the split continues.
10. **How long does the asking price take to hit zero?** About 30 days after each reset if nobody buys sooner.
11. **How often do new reward tokens appear?** Anyone can trigger the mint once per week; the amount halves after fixed periods until it reaches a minimum trickle.
12. **Can moderation block bad content?** Yes, if the launcher enables moderation and assigns reviewers; otherwise, content is immediately takeable.

# 12) Glossary

- **Asking price decay:** the steady fall from a starting price to zero over a fixed window for each piece.
- **Takeover:** paying the current asking price to move a piece into your ownership.
- **Stake:** the amount you last paid for a piece; used to weigh your share of rewards.
- **Reward pool:** the bucket of tokens shared among current stakeholders.
- **Quote token:** the asset people pay with when taking over pieces; also used for part of the rewards.
- **Native reward token:** the incentive token minted on a weekly, halving schedule and streamed to stakeholders.
- **Halving schedule:** a rule that cuts the minting rate by half after each set period until a minimum rate is reached.
- **Treasury:** the portion of every takeover set aside for later purchase via auction.
- **Treasury auction:** a separate falling-price sale where buyers burn the DONUT liquidity token to claim treasury assets.
- **Liquidity token:** the pooled token representing DONUT paired with the native reward token; burned to buy treasury assets.
- **Launcher:** the team that seeds DONUT liquidity and configures a new marketplace instance.
- **Moderation:** an optional review step that must approve content before it can be taken over.
- **Protocol fee address:** an address that can receive a small slice of each takeover; can be turned off by setting it to zero.
- **Team share:** the launcher’s ongoing slice from every takeover in their marketplace.
- **Creator share:** the recurring payment to the person who published the content.
- **Quote reward stream:** the flow of the quote token into the reward pool when balances accumulate.
- **Tail emission:** the minimum ongoing minting rate that continues after many halvings.
