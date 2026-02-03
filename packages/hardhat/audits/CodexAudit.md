# Codex Audit

Below is a deep, adversarial audit of the provided contracts. I focused on line-by-line behavior, system-wide risks, and edge cases. I explicitly call out assumptions, trust boundaries, and why certain areas are safe.

**Scope**
1. `packages/hardhat/contracts/Core.sol`
2. `packages/hardhat/contracts/Content.sol`
3. `packages/hardhat/contracts/Unit.sol`
4. `packages/hardhat/contracts/Minter.sol`
5. `packages/hardhat/contracts/Rewarder.sol`
6. `packages/hardhat/contracts/Auction.sol`
7. `packages/hardhat/contracts/Multicall.sol`
8. `packages/hardhat/contracts/UnitFactory.sol`
9. `packages/hardhat/contracts/MinterFactory.sol`
10. `packages/hardhat/contracts/RewarderFactory.sol`
11. `packages/hardhat/contracts/ContentFactory.sol`
12. `packages/hardhat/contracts/AuctionFactory.sol`
13. All interfaces in `packages/hardhat/contracts/interfaces`

**Architecture**
The system is a launchpad that instantiates a "channel" (Unit + Content + Rewarder + Minter + Auction) per launch:

1. `Core.launch` pulls quote from the caller, deploys a new `Unit`, mints `unitAmount` to itself, and creates a Uniswap V2 pool with `quote` and `unit` using `addLiquidity`. LP tokens are transferred to `DEAD_ADDRESS` (effectively burned). `packages/hardhat/contracts/Core.sol:188` through `packages/hardhat/contracts/Core.sol:235`.
2. `Core` deploys an `Auction` for treasury fees, with LP token as the payment token and burn address as the payment receiver. `packages/hardhat/contracts/Core.sol:237` through `packages/hardhat/contracts/Core.sol:245`.
3. `Core` deploys a `Content` NFT collection, which in its constructor deploys a `Rewarder` and registers `unit` as a reward token. `packages/hardhat/contracts/Core.sol:247` through `packages/hardhat/contracts/Core.sol:260`, and `packages/hardhat/contracts/Content.sol:120` through `packages/hardhat/contracts/Content.sol:151`.
4. `Core` deploys a `Minter` and transfers `Unit` minting rights to it, then hands `Content` ownership to the launcher. `packages/hardhat/contracts/Core.sol:266` through `packages/hardhat/contracts/Core.sol:279`.
5. `Content` manages a per-token Dutch auction. `collect` transfers the NFT to a new owner, updates epoch state and stake, distributes fees, and updates the `Rewarder` stake. `packages/hardhat/contracts/Content.sol:187` through `packages/hardhat/contracts/Content.sol:256`.
6. `Rewarder` handles reward accounting and distribution for stakers (measured by stake amounts in `Content`). `packages/hardhat/contracts/Rewarder.sol:72` through `packages/hardhat/contracts/Rewarder.sol:246`.
7. `Auction` sells accumulated treasury assets (typically `quote` sent to it by `Content`) in exchange for LP tokens using a Dutch auction that decays linearly to zero each epoch. `packages/hardhat/contracts/Auction.sol:118` through `packages/hardhat/contracts/Auction.sol:174`.
8. `Multicall` is a convenience wrapper that batches common flows and aggregates read state. It is trustless in the sense that it does not validate content addresses. `packages/hardhat/contracts/Multicall.sol:115` through `packages/hardhat/contracts/Multicall.sol:221`.

**Trust & Privilege Boundaries**
1. `Core` owner can set the global `protocolFeeAddress` and `minQuoteForLaunch`. `packages/hardhat/contracts/Core.sol:325` through `packages/hardhat/contracts/Core.sol:335`.
2. Each `Content` is owned by the launcher. The owner can set `treasury`, `team`, moderation parameters, and add reward tokens. `packages/hardhat/contracts/Content.sol:303` through `packages/hardhat/contracts/Content.sol:373`.
3. `Rewarder` allows only `Content` to deposit/withdraw and add reward tokens, but anyone can notify rewards. `packages/hardhat/contracts/Rewarder.sol:85` through `packages/hardhat/contracts/Rewarder.sol:195`.
4. Factory contracts are permissionless and assumed to deploy the exact expected bytecode. If a factory is upgradeable or malicious, minting rights and reward accounting can be compromised.
5. The Uniswap V2 router/factory addresses are immutable, but if they are proxies or non-canonical deployments, liquidity and LP behavior are not guaranteed.

**Assumptions (explicit)**
1. The quote token is a standard ERC20 with no fee-on-transfer, no rebase, and no blacklisting behavior. This is relied upon across `Core`, `Content`, `Rewarder`, and `Multicall`. `packages/hardhat/contracts/Core.sol:31` through `packages/hardhat/contracts/Core.sol:32`, and `packages/hardhat/contracts/Content.sol:21` through `packages/hardhat/contracts/Content.sol:22`.
2. All reward tokens are standard ERC20s, not pausable/blacklistable, and not fee-on-transfer. `packages/hardhat/contracts/Rewarder.sol:14` through `packages/hardhat/contracts/Rewarder.sol:16`.
3. Factories and the Uniswap router/factory are non-malicious and not upgradeable behind proxies.
4. Launchers and protocol owners are trusted to not maliciously configure team/treasury/protocolFeeAddress.

---

## Findings

### High

#### [H-01] Push-based fee transfers can permanently DoS `collect` if any recipient rejects or is blacklisted

- **Status:** RESOLVED — Creator fee converted to pull model. Treasury/team/protocol remain push but are all settable by their respective owners, so DoS is recoverable by updating the address.
- **Description:** `Content.collect` pushes fees to creator, treasury, team, and protocol in-line. If any of those transfers revert (blacklisted address, paused token, or recipient contract that reverts), the entire `collect` call reverts, making that token (or the entire protocol) uncollectable. The protocol fee address is globally mutable and can also cause system-wide DoS if misconfigured or blacklisted.
- **Root cause:** Direct `safeTransfer` to `creator`, `treasury`, `team`, and `protocol` inside `collect` with no fallback path. `packages/hardhat/contracts/Content.sol:225` through `packages/hardhat/contracts/Content.sol:247`. Global fee address controlled by owner. `packages/hardhat/contracts/Core.sol:325`.
- **Exploit scenario:**
  1. Attacker creates a content token with `to` set to a contract that reverts on ERC20 `transfer`.
  2. Any future `collect` on that token hits `safeTransfer(creator, ...)` and reverts, permanently freezing the NFT.
  3. Alternatively, protocol owner sets `protocolFeeAddress` to a blacklisted address; every `collect` across all content reverts.
- **Impact:** Permanent DoS for individual NFTs or the entire protocol's collection mechanism. Revenue flow and staking updates halt.
- **Likelihood:** Moderate if using blacklistable tokens like USDC or if a malicious creator exists.
- **Recommendation:** Convert all fee recipients to a pull model (claimable balances) instead of push. If push transfers must remain, wrap each transfer in try/catch and accumulate unpaid balances for later claim. Consider allowing creators/teams/protocol to update their payout address if a transfer fails.

#### [H-02] A single bad reward token can permanently block all reward claims

- **Status:** RESOLVED — Added per-token `getReward(account, token)` with `tokenToIsReward` validation. Users can claim individual good tokens if the all-at-once version reverts.
- **Description:** `Rewarder.getReward` transfers each reward token in a loop; if any transfer reverts, the entire claim reverts. Content owners can add arbitrary reward tokens. If a token later pauses, blacklists, or reverts on transfer, all rewards become unclaimable, including `Unit` emissions.
- **Root cause:** All-or-nothing transfer loop in `Rewarder.getReward` with no per-token error handling, and the ability for the content owner to add arbitrary tokens. `packages/hardhat/contracts/Rewarder.sol:111` through `packages/hardhat/contracts/Rewarder.sol:120`, `packages/hardhat/contracts/Rewarder.sol:189` through `packages/hardhat/contracts/Rewarder.sol:194`, `packages/hardhat/contracts/Content.sol:370` through `packages/hardhat/contracts/Content.sol:372`.
- **Exploit scenario:**
  1. Owner adds a reward token that reverts on `transfer` or is blacklistable.
  2. Users call `getReward` to claim `Unit` rewards.
  3. The bad token transfer reverts, blocking all reward claims permanently.
- **Impact:** Rewards (including `Unit`) become unclaimable with no recovery mechanism.
- **Likelihood:** Moderate; highly likely if a reward token is pauseable/blacklistable or misconfigured.
- **Recommendation:** Add per-token `getReward(token)` or wrap each transfer in try/catch, skipping failed tokens while allowing others to be claimed. Add a `disableRewardToken` function with governance constraints to remove faulty tokens.

---

### Medium

#### [M-01] Auction price decays to zero, enabling free extraction of all treasury assets

- **Status:** ACKNOWLEDGED — Intentional design; price discovery is expected to ensure someone buys before zero.
- **Description:** The Dutch auction decays linearly to zero; after the epoch ends, `getPrice()` returns zero, and `buy()` allows payment of zero LP tokens. This lets anyone claim all accumulated assets for free if no one buys earlier.
- **Root cause:** `getPrice` returns zero when `timePassed > epochPeriod`, and `buy` does not enforce a positive payment. `packages/hardhat/contracts/Auction.sol:129` through `packages/hardhat/contracts/Auction.sol:135` and `packages/hardhat/contracts/Auction.sol:170` through `packages/hardhat/contracts/Auction.sol:173`.
- **Exploit scenario:**
  1. Wait until `epochPeriod` has elapsed.
  2. Call `buy` with `maxPaymentTokenAmount = 0`.
  3. Receive all accumulated `quote` tokens from the auction without paying LP tokens.
- **Impact:** Treasury assets are drained without any LP burn; protocol revenue or buyback mechanism collapses for that epoch.
- **Likelihood:** Medium, especially if no active bidders or monitoring bots.
- **Recommendation:** Add a minimum price floor per epoch (e.g., clamp current price to `minInitPrice`), or require `paymentAmount > 0`. Alternatively, restart the epoch without transferring assets once the price hits zero.

#### [M-02] LP-token payment makes auction value manipulable in low-liquidity conditions

- **Status:** ACKNOWLEDGED — Auction is priced in LP token quantity, not quote value. Manipulating the pool to mint LP cheaply incurs an equivalent loss on the Unit side.
- **Description:** The auction accepts LP tokens at face value, without pricing them in quote terms. If the Unit/quote pool is thin, an attacker can manipulate pool reserves and LP token value, allowing them to acquire LP tokens cheaply and drain treasury assets at a discount.
- **Root cause:** Auction pricing is denominated purely in LP tokens; no oracle or TWAP is used to reflect the LP's quote value. `packages/hardhat/contracts/Auction.sol:118` through `packages/hardhat/contracts/Auction.sol:141`.
- **Exploit scenario:**
  1. Attacker accumulates Unit tokens from rewards or OTC.
  2. Attacker dumps Unit into the pool to lower quote reserves and depress LP token quote value.
  3. Attacker mints or buys LP tokens cheaply under the manipulated ratio.
  4. Attacker pays LP tokens to the auction and receives treasury `quote` at a discount.
- **Impact:** Treasury assets are sold below fair value; protocol loses value on every auction.
- **Likelihood:** Medium to high if liquidity is thin or the Unit token has volatile price.
- **Recommendation:** Use a TWAP oracle for the LP token's quote value and price the auction in quote terms, or accept direct quote payments. Consider enforcing minimum quote-equivalent payment based on TWAP.

#### [M-03] Emission schedule loses rewards if `updatePeriod` is not called regularly

- **Status:** ACKNOWLEDGED — Intentional design; `updatePeriod` is permissionless so anyone can call it, and skipped emissions reducing total supply is acceptable behavior.
- **Description:** `Minter.updatePeriod` mints at most one week of emissions, regardless of how much time has passed. Missed weeks are permanently lost, and anyone can strategically delay calls to change emission timing.
- **Root cause:** The function only checks `block.timestamp >= period + WEEK`, updates `activePeriod` once, and mints a single week. `packages/hardhat/contracts/Minter.sol:96` through `packages/hardhat/contracts/Minter.sol:116`.
- **Exploit scenario:**
  1. No one calls `updatePeriod` for multiple weeks.
  2. Emissions for missed weeks are never minted.
  3. A large staker calls `updatePeriod` after building a position, reducing total emissions and altering reward distribution timing.
- **Impact:** Emission schedule deviates from intended policy; stakers can lose rewards; supply dynamics become unpredictable.
- **Likelihood:** Medium.
- **Recommendation:** Mint for all missed weeks (bounded loop with a cap) or track accumulated emissions using `weeksElapsed` and mint accordingly.

---

### Low

#### [L-01] `Multicall.collect` is a footgun with untrusted content addresses

- **Status:** RESOLVED — Added `isDeployedContent` validation before any token transfer or approval in `Multicall.collect`.
- **Description:** `Multicall.collect` transfers `maxPrice` into the contract and then approves the `content` address for that amount, without verifying that the address is a Core-deployed Content. A malicious `content` can abuse the allowance and drain `maxPrice`.
- **Root cause:** No check for `ICore(core).isDeployedContent(content)` before transferring/approving. `packages/hardhat/contracts/Multicall.sol:115` through `packages/hardhat/contracts/Multicall.sol:128`, and `packages/hardhat/contracts/Core.sol:59`.
- **Exploit scenario:**
  1. Attacker deploys a fake Content contract that ignores parameters and drains the allowance.
  2. Victim uses a phishing UI to call `Multicall.collect` with the fake content address.
  3. The fake content transfers the approved `maxPrice` from Multicall.
- **Impact:** User funds can be stolen; not a protocol-level bug if UI is safe, but a significant footgun.
- **Likelihood:** Moderate in hostile UX environments.
- **Recommendation:** Validate `content` via `isDeployedContent` or store an allowlist. Consider sending `price` directly (after reading from Content) rather than approving `maxPrice`.

#### [L-02] Permissionless minting of non-transferable NFTs enables griefing

- **Status:** ACKNOWLEDGED — Cosmetic/UX only; no functional impact on minting, staking, or rewards. Similar to spam ERC20 airdrops.
- **Description:** Anyone can mint content to any address, and transfers are disabled. This allows adversaries to spam wallets with non-transferable tokens the recipient cannot remove.
- **Root cause:** `create` is permissionless and accepts arbitrary `to`, while `transferFrom` and approvals are disabled. `packages/hardhat/contracts/Content.sol:161` through `packages/hardhat/contracts/Content.sol:176` and `packages/hardhat/contracts/Content.sol:281` through `packages/hardhat/contracts/Content.sol:298`.
- **Exploit scenario:**
  1. Attacker mints many NFTs to a victim's address.
  2. Victim cannot transfer or burn them.
  3. Wallets and indexers are cluttered or manipulated.
- **Impact:** UX and indexing griefing; no direct fund loss.
- **Likelihood:** Medium in open systems.
- **Recommendation:** Require `msg.sender == to`, or add a `burn` function for owners, or implement opt-in minting.

#### [L-03] `Rewarder.addReward` lacks token validation, enabling phantom rewards and wasted slots

- **Status:** RESOLVED — Added `address(0)` check in `addReward`. Non-contract addresses waste a slot but don't brick the contract, especially with the per-token `getReward` from H-02.
- **Description:** Tokens with `address(0)` or EOA addresses can be added as reward tokens. Because `SafeERC20` tolerates empty return data, `notifyRewardAmount` can "succeed" without moving real tokens, leading to phantom rewards and wasted `MAX_REWARD_TOKENS` slots.
- **Root cause:** No checks on token address or contract code. `packages/hardhat/contracts/Rewarder.sol:189` through `packages/hardhat/contracts/Rewarder.sol:194`, `packages/hardhat/contracts/Content.sol:370` through `packages/hardhat/contracts/Content.sol:372`.
- **Exploit scenario:**
  1. Owner adds `address(0)` or an EOA as a reward token.
  2. Anyone calls `notifyRewardAmount`, which "succeeds" but transfers nothing.
  3. Reward accounting runs for a token that can never be paid.
- **Impact:** Confusion and gas overhead; consumes reward slots permanently.
- **Likelihood:** Low but possible due to misconfiguration.
- **Recommendation:** Add `require(token != address(0) && token.code.length > 0)` in `addReward`.

#### [L-04] Unbounded content creation can bloat state and stress moderation functions

- **Status:** ACKNOWLEDGED — Loops are over caller-controlled calldata arrays; moderation can be batched into smaller calls. No bricking risk.
- **Description:** Content creation is free and unbounded; `setModerators` and `approveContents` loop over unbounded arrays. Attackers can spam content creation, and owners may not be able to moderate large batches in a single transaction.
- **Root cause:** No creation fee/rate limiting; unbounded loops. `packages/hardhat/contracts/Content.sol:161` through `packages/hardhat/contracts/Content.sol:176` and `packages/hardhat/contracts/Content.sol:345` through `packages/hardhat/contracts/Content.sol:363`.
- **Exploit scenario:**
  1. Attacker creates thousands of content tokens.
  2. Storage and enumeration bloat; moderation batches exceed block gas limits.
- **Impact:** Increased gas costs and operational difficulty for moderation.
- **Likelihood:** Medium for permissionless deployments.
- **Recommendation:** Add a creation fee, rate limiting, or pagination for moderation approval.

---

### Informational

#### [I-01] Centralization and trust assumptions are strong and unmitigated

- **Status:** ACKNOWLEDGED
- **Description:** Core owner can change `protocolFeeAddress` and `minQuoteForLaunch` globally, and each Content owner can set treasury/team and add reward tokens. No timelock or multisig is enforced on-chain.
- **Reference:** `packages/hardhat/contracts/Core.sol:325` through `packages/hardhat/contracts/Core.sol:335`, `packages/hardhat/contracts/Content.sol:316` through `packages/hardhat/contracts/Content.sol:373`.
- **Impact:** Governance/admin key compromise can redirect fees or freeze collections.
- **Recommendation:** Use a multisig and timelock; consider immutable protocol fee rules or delayed changes.

#### [I-02] No emergency pause or circuit breaker

- **Status:** ACKNOWLEDGED
- **Description:** There are no pause mechanisms in `Core`, `Content`, `Rewarder`, or `Auction`.
- **Impact:** In a live incident, there is no on-chain mechanism to halt harmful operations.
- **Recommendation:** Add a `pause`/`unpause` mechanism in `Content.collect` and possibly `Auction.buy` to contain incidents.

#### [I-03] Strong reliance on standard ERC20 behavior

- **Status:** ACKNOWLEDGED
- **Description:** Fee-on-transfer or rebasing tokens break accounting and can cause reverts during distribution. This is only documented in comments, not enforced.
- **Reference:** `packages/hardhat/contracts/Core.sol:31` through `packages/hardhat/contracts/Core.sol:32`, `packages/hardhat/contracts/Content.sol:21` through `packages/hardhat/contracts/Content.sol:22`, `packages/hardhat/contracts/Rewarder.sol:14` through `packages/hardhat/contracts/Rewarder.sol:16`.
- **Recommendation:** Document clearly in user-facing docs; optionally add runtime checks or reject known fee-on-transfer tokens.

---

## Safety Observations (Why These Areas Are Safe)
1. Reentrancy is materially mitigated by `nonReentrant` on state-changing external functions that touch balances (`Core.launch`, `Content.collect`, `Content.claim`, `Rewarder.getReward`, `Rewarder.notifyRewardAmount`, `Auction.buy`). This makes classic reentrancy against fee distribution and reward accounting hard to exploit. `packages/hardhat/contracts/Core.sol:188`, `packages/hardhat/contracts/Content.sol:187`, `packages/hardhat/contracts/Content.sol:268`, `packages/hardhat/contracts/Rewarder.sol:111`, `packages/hardhat/contracts/Rewarder.sol:129`, `packages/hardhat/contracts/Auction.sol:118`.
2. NFT transfers do not call `onERC721Received` during `collect` because `_transfer` is used rather than `safeTransferFrom`, removing a common reentrancy surface. `packages/hardhat/contracts/Content.sol:222` through `packages/hardhat/contracts/Content.sol:223`.
3. Arithmetic overflow/underflow risks are minimized by Solidity 0.8 checked arithmetic and bounded price logic (e.g., price multipliers are capped). `packages/hardhat/contracts/Content.sol:206` through `packages/hardhat/contracts/Content.sol:213`, `packages/hardhat/contracts/Auction.sol:144` through `packages/hardhat/contracts/Auction.sol:149`.

---

## Testing Gaps & Suggested Tests
1. Blacklist or revert-on-transfer recipients for `creator`, `team`, and `protocolFeeAddress`, including system-wide DoS on `collect`.
2. Rewarder with multiple reward tokens, where one token is paused/blacklisted, verifying `getReward` reverts and blocks all claims.
3. Auction epoch expiry leading to `getPrice() == 0` and free asset drain.
4. LP-token manipulation scenarios in low liquidity pools and auction value extraction simulations.
5. `updatePeriod` behavior when called after multiple weeks, verifying skipped emissions and economic impact.
6. `Multicall.collect` misuse with malicious content address and allowance abuse.
7. Griefing via minting non-transferable NFTs to arbitrary addresses and inability to dispose.
