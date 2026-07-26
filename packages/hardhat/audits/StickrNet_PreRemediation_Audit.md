# StickrNet Pre-Remediation Security and Economic Audit

**Assessment date:** 2026-07-25  
**Repository:** `stickrnet-monorepo`  
**Baseline commit:** `5009638333b17aa17f26ba13c92207fa4123dfb9` (`main`)  
**Assessment target:** the working tree at the start of this audit, including the uncommitted reserve-backed Sticker economics redesign  
**Deployment context:** clean Base testnet cutover; no legacy-state migration or backward-compatibility requirement

## 1. Purpose and Gate

This report captures the protocol before the hardening changes requested in the audit brief. It is intentionally written before modifying contracts. It records the current architecture, trust boundaries, baseline evidence, initial findings, economic assumptions, and the prioritized remediation plan that will govern the next phase.

This is not the final audit opinion. Finding status and residual risk will be reassessed after remediation, adversarial tests, coverage, deployment-size checks, and downstream integration validation.

## 2. Scope

### In-scope contracts

- `Core.sol`: channel launch orchestration, factory wiring, initial AMM liquidity, registry, protocol configuration.
- `Content.sol`: Sticker minting/moderation, reserve/premium collection, surrender, claims, and Rewarder stake synchronization.
- `Rewarder.sol`: multi-token streaming reward accounting and reserve-weight balances.
- `Minter.sol`: permissionless weekly Coin emissions and halving schedule.
- `Auction.sol`: treasury asset Dutch auction paid in LP tokens.
- `Multicall.sol`: transactional convenience methods and aggregated application views.
- `Coin.sol` and all five deployment factories.
- All Solidity interfaces and test mocks.

### In-scope downstream surfaces

- Hardhat deployment script and network configuration.
- Hardhat unit, integration, boundary, stress, exploit, and invariant tests.
- Subgraph ABI, manifest, schema, and mappings.
- Web application contract ABI/state adapters and collection/launch flows.
- Protocol documentation and prior audit artifacts.

### Exclusions and assumptions

- No production deployment or historical migration is in scope; the requested target is a clean testnet deployment.
- Canonical Base USDC and canonical Uniswap V2-compatible contracts are assumed at deployment, but configuration is still required to fail closed.
- Private-key custody, multisig signer security, Base consensus, and the correctness of canonical external protocol bytecode are outside this source-code audit.
- Economic simulations establish accounting properties and attack costs; they cannot prove future market liquidity, bidder participation, or token value.

## 3. System Architecture and Asset Flow

### Launch

1. A launcher supplies quote tokens to `Core.launch`.
2. `Core` deploys a `Coin`, mints the configured initial Coin amount, and supplies Coin plus quote to a Uniswap V2 pair.
3. Initial LP tokens are transferred to `0x...dEaD`, permanently removing redemption control but not reducing ERC20 `totalSupply`.
4. `Core` deploys an LP-denominated `Auction`, a `Content` collection, its `Rewarder`, and a `Minter`.
5. Coin minting authority is transferred to `Minter`; Content ownership is transferred to the channel launcher.
6. The deployed addresses are recorded in the Core registry.

### Sticker lifecycle

1. `Content.create` mints a non-transferable Sticker and starts a one-day decaying premium at `minInitPrice`.
2. `Content.collect` charges `nextReserve + premium`.
3. The old reserve plus 40% of premium is owed to the previous owner; 20% of premium is owed to the creator; 30%/5%/5% goes to treasury/team/protocol, with disabled shares and rounding dust routed to treasury.
4. The refundable reserve grows by 10% per collection. Only that reserve becomes Rewarder mining weight.
5. After a 24-hour cooldown, the owner may surrender, burn the Sticker, remove its Rewarder weight, and receive the entire reserve.

### Rewards and treasury

- `Minter.updatePeriod` mints one current weekly Coin emission and calls `Rewarder.notifyRewardAmount`.
- Rewarder streams each notified reward over seven days, pro rata to reserve-backed balances controlled only by Content.
- Treasury premium is pushed to Auction. A buyer supplies an arbitrary list of Auction-held ERC20 assets and pays a linearly decaying amount of LP tokens, which are sent to the dead address.

## 4. Roles, Permissions, and Trust Boundaries

| Actor | Authority | Principal risk |
|---|---|---|
| Core owner | Change global protocol fee recipient and minimum launch quote | Immediate global configuration change; no timelock or two-step handoff |
| Content owner / launcher | Change treasury/team, moderation, moderators, URI, and reward-token set | Can redirect future channel revenue, censor moderated content, or add problematic reward tokens |
| Moderators | Approve currently unapproved Stickers | Censorship/approval discretion only |
| Minter contract | Sole Coin minter after launch | Emission integrity depends on immutable Minter code and correct wiring |
| Content contract | Sole Rewarder stake depositor/withdrawer and reward-token registrar | Cross-contract reserve invariant depends on this exclusive authority |
| Any account | Create/collect/surrender its Sticker, claim for any beneficiary, update emissions, notify rewards, buy auctions | Permissionless paths must be safe under adversarial ordering and calldata |
| Configured factories/router/token | External calls during launch and transfers | Misconfiguration or non-standard behavior can invalidate accounting or deployment |

Admin authority is operationally significant. For a public deployment, Core ownership and channel ownership should be multisigs; address changes should be monitored; a timelock should be considered for global protocol changes. Those governance controls are not substitutes for contract-level validation.

## 5. Baseline Verification

### Tests and coverage

- `npx hardhat compile`: passed; no compilation work was required from the existing artifacts.
- `npx hardhat test`: **292 passing** in approximately 21 seconds.
- `npx hardhat coverage`: **80.78% statements, 64.10% branches, 80.00% functions, 82.88% lines** across all Solidity files.
- Production-contract aggregate (excluding interfaces/mocks): **87.59% statements, 70.37% branches, 91.14% functions, 90.66% lines**.
- Material weak point: `Multicall.sol` has 53.19% statement coverage and 59.09% branch coverage.

The existing suite provides useful regression coverage, but several named “security” tests only prove a happy-path property. In particular, it accepts free Auction purchases and does not test global-balance contamination in Multicall, reward notifier authorization, exact reward-token receipt, router/factory mismatch, or real deployment-size enforcement.

### Static and dependency tooling

- Slither, Semgrep, Mythril, Echidna, and Solhint were not installed in the environment; no result from those tools is claimed.
- Foundry `forge` is installed, but the repository has no Foundry project or Solidity invariant harness at baseline.
- `npm audit --omit=dev` reports 55 advisories: 16 high, 10 moderate, 29 low, including direct advisories through the old Hardhat, Axios, ethers, and verification packages. These are primarily build/deployment-tool risks, not on-chain runtime vulnerabilities, but they materially reduce release-tooling readiness.

### Bytecode and deployment viability

Runtime bytecode was measured from the compiled artifacts against the 24,576-byte EIP-170 limit:

| Contract | Runtime bytes | Headroom |
|---|---:|---:|
| ContentFactory | **27,994** | **-3,418** |
| Content | 23,331 | 1,245 |
| Multicall | 17,377 | 7,199 |
| CoinFactory | 14,197 | 10,379 |
| Rewarder | 10,896 | 13,680 |
| Core | 8,740 | 15,836 |

`hardhat.config.js` enables `allowUnlimitedContractSize`, masking the fact that the current ContentFactory cannot deploy on a standard EVM network. This is release-blocking.

## 6. Positive Security Properties

- Sticker transfer approvals and user-initiated ERC721 transfers are disabled; ownership changes only through collection and burn through surrender.
- Collection and Auction purchase use deadlines, expected epoch IDs, and maximum price/payment bounds.
- Content collection, claim, surrender, Rewarder notification/claim, Core launch, and Auction purchase use reentrancy protection where value-bearing external calls occur.
- Content explicitly enforces `Rewarder.totalSupply == totalReserved` and quote balance coverage for `totalReserved + totalClaimable` after critical operations.
- Previous-owner reserve/proceeds and creator premium already use a pull balance, preventing those recipients from blocking collection.
- Only Content can alter Rewarder stake, and the new reserve—not speculative premium—is the mining weight.
- Per-token Rewarder claiming allows a healthy reward token to be claimed even if another registered token fails.
- Arithmetic uses Solidity 0.8 checked operations, with an explicit reserve-growth precheck.

## 7. Initial Findings

Severity reflects impact and likelihood in the clean testnet-to-production design, not the value presently deployed on testnet.

### H-01 — ContentFactory exceeds the EIP-170 runtime-code limit

**Severity:** High / release blocker  
**Location:** `ContentFactory.sol`; `hardhat.config.js:31-39`

ContentFactory embeds Content creation code and compiles to 27,994 runtime bytes, 3,418 bytes above the network limit. Local tests pass only because unlimited contract size is enabled. A clean deployment of the redesigned factory will revert on Base.

**Remediation plan:** reduce Content deployment bytecode without changing reserve economics, remove unnecessary enumerable/legacy surface where testnet compatibility is not required, disable unlimited-size testing, and add an automated artifact-size assertion with safety headroom.

### H-02 — Multicall refunds its global quote balance to the current collector

**Severity:** High  
**Location:** `Multicall.sol` transactional `collect` flow

Multicall pulls `maxPrice`, lets Content consume the current price, then sends the Multicall contract's entire remaining quote balance to the caller. Any quote accidentally transferred, left by another integration path, or produced by a non-standard interaction is claimable by the next collector. The same contract has multiple token approvals and value-bearing entry points without a reentrancy guard, increasing composability risk.

**Remediation plan:** use per-call before/after balance deltas, refund only the caller's unspent amount, require zero residual allowance/balance assumptions where appropriate, add `nonReentrant`, and test prefunded balances plus malicious callback tokens.

### M-01 — Push fee payments can block all collections

**Severity:** Medium  
**Location:** `Content.sol:253-276`

Treasury, team, and protocol premium is transferred synchronously during collection. ERC20 recipient contracts do not receive callbacks, but a pausable/blacklistable quote token such as USDC can reject a configured address. One rejected transfer reverts the entire ownership/reserve transition. Previous-owner and creator payments already avoid this problem through pull accounting.

**Remediation plan:** accrue every reserve refund and premium share as a pull liability. Preserve the exact 40/20/30/5/5 economics, disabled-share routing, and dust routing. Make best-effort convenience claims outside the core state transition so a blocked recipient cannot halt collection.

### M-02 — Reward schedules are permissionlessly reset and token receipt is not verified

**Severity:** Medium  
**Location:** `Rewarder.sol:146-167`

Any address may notify any registered reward. Near the end of a period, an attacker can add a relatively small amount, combine it with leftovers, and restart a seven-day stream, repeatedly changing distribution timing. More seriously for non-standard reward tokens, Rewarder promises the requested amount without verifying the actual balance increase, which can create underfunded accounting.

**Remediation plan:** assign an explicit notifier per reward token under Content control, wire the Coin notifier to the deployed Minter before Content ownership handoff, require exact balance-delta receipt, emit notifier changes, and test unauthorized/reset/fee-on-transfer paths.

### M-03 — Auction assets become free at epoch expiry

**Severity:** Medium / economic  
**Location:** `Auction.sol:129-149,170-173`

The Dutch price reaches zero at exactly the epoch duration and remains zero. A searcher can then transfer all caller-selected Auction assets for no LP payment. The next epoch restarts at `minInitPrice`, but the accumulated treasury assets are already gone. Existing tests explicitly accept this behavior. This creates a liveness-dependent loss mode and weakens the intended LP-removal mechanism.

**Remediation plan:** clamp the live price to `minInitPrice`, validate a nonzero asset receiver and nonzero/code-bearing asset addresses, use exact payment receipt checks, and update tests/docs. This is an explicit economic hardening change: the auction remains a linear Dutch auction, but no epoch can settle below its configured floor.

### M-04 — Core does not fail closed on router/factory or liquidity-output mismatch

**Severity:** Medium  
**Location:** `Core.sol` constructor and `launch` liquidity path

Core stores both router and factory but does not verify that `router.factory()` matches the configured factory. It also trusts the router's returned amounts/liquidity and independently looks up the LP token. A wrong or malicious configuration can route assets elsewhere, report a misleading pair, or leave funds/allowances behind while the registry is populated.

**Remediation plan:** validate contract code and router/factory consistency at construction, require exact desired amounts and nonzero liquidity, require a nonzero pair matching the router factory, clear approvals after use, and verify no launch assets remain in Core.

### M-05 — Global-week emissions create launch-timing and missed-period discontinuities

**Severity:** Medium / economic design  
**Location:** `Minter.sol:83-111`

`activePeriod` is rounded down to the global week. A channel launched shortly before a boundary can mint a full weekly emission almost immediately. If calls are delayed for multiple weeks, only one current weekly emission is minted and skipped weeks are permanently omitted. This is not a direct theft vector, but supply depends on wall-clock launch timing and keeper liveness in a way that is easy to misunderstand or game.

**Remediation decision for this pass:** do not silently change the emission curve. Preserve the current global-week/skipped-emission behavior, document it explicitly, and add boundary tests. A change to anniversary-based or catch-up emissions requires an intentional tokenomics decision.

### L-01 — Collection can send a non-transferable Sticker to an incompatible contract

**Severity:** Low  
**Location:** `Content.sol:258`

Collection uses internal `_transfer`, bypassing ERC721 receiver acceptance. Because all regular transfers are disabled, an NFT collected to a contract with no recovery path can be permanently stuck and its reserve can only be surrendered if that contract can call back into Content.

**Remediation plan:** use receiver-safe transfer semantics after effects are committed, retaining reentrancy protection and atomic rollback.

### L-02 — Core administration is immediate and single-step

**Severity:** Low / governance  
**Location:** `Core.sol` owner setters and inherited ownership transfer

The owner can immediately redirect all future protocol fees or reduce launch cost, and ownership transfer is single-step. A compromised key or address typo has immediate protocol-wide impact.

**Remediation plan:** preserve configurability but use two-step ownership where bytecode permits, reject unchanged/invalid critical configuration, emit complete old/new events, and document multisig/timelock deployment requirements. If code-size constraints or OpenZeppelin version make two-step ownership disproportionate, leave it as an explicit operational residual risk.

### L-03 — Unbounded dynamic metadata and moderation batches create self-DoS/operational edges

**Severity:** Low  
**Location:** `Core.launch`, `Content.create`, `setModerators`, `approveContents`

Token names, symbols, URIs, and moderation arrays have no explicit size bounds. Callers pay their own gas, so this is not a permissionless global drain, but extreme metadata can make deployment/indexing/UI paths impractical and oversized admin batches can revert.

**Remediation plan:** add reasonable metadata limits at launch/create/update boundaries and retain batchability. The selected limits will be documented and tested.

### L-04 — Auction and application price views are manipulable spot balances

**Severity:** Low / integration  
**Location:** `Multicall.getCoinState`, `getAuctionState`

Market cap, liquidity, and payment-token price are derived from current token balances in the pair. Direct donations and same-block reserve manipulation can distort these UI values. They are not used by contracts for settlement, so the risk is display/integration misuse rather than on-chain loss.

**Remediation plan:** clearly label them as non-oracle spot estimates, handle zero reserves safely, and ensure downstream code never treats them as a trusted oracle.

### I-01 — Legacy aliases and enumerable inheritance add ambiguity and deployment cost

**Severity:** Informational  
**Location:** `Content.sol` inheritance and `idToStake` / `idToInitPrice`

The testnet-only target does not require compatibility with the prior wash-mining model. Retaining aliases whose meanings changed invites integration errors, while ERC721Enumerable adds deployment/runtime cost despite no in-repository use of token enumeration.

**Remediation plan:** remove the obsolete aliases from contracts/interfaces/downstream code and replace enumerable inheritance with explicit live-supply accounting if needed.

### I-02 — Build dependencies are substantially stale

**Severity:** Informational for on-chain code; Medium for release tooling  
**Location:** `packages/hardhat/package.json` and lockfiles

The dependency audit reports numerous advisories in Hardhat/ethers/verification/HTTP transitive trees. Exploitation generally requires malicious build inputs, endpoints, archives, or dependency behavior, but deployment keys and verification workflows are high-value environments.

**Remediation plan:** minimize runtime dependencies, remove unused Axios if confirmed, upgrade within a tested compatibility boundary, lock the package manager, and rerun the complete suite. A major Hardhat/ethers migration will not be mixed into contract remediation unless required; unresolved advisories will be reported precisely.

## 8. Economic Review

### Reserve solvency

For each active Sticker `i`, let `R_i` be its refundable reserve. The intended global invariants are:

```text
totalReserved = sum(R_i)
Rewarder.totalSupply = totalReserved
quote.balanceOf(Content) >= totalReserved + totalClaimable
```

At collection, the liability increase equals the payment:

```text
new total liabilities - old total liabilities
= (newReserve - oldReserve) + oldReserve + premium
= newReserve + premium
= price
```

Therefore pull-accounting every premium share preserves exact solvency while eliminating recipient-induced collection failure. Surrender decreases both reserve custody and Rewarder supply by the same amount.

### Wash-mining resistance

Only reserve is rewarded, not the decaying premium or gross turnover. Repeated self-controlled collections must increase locked capital by 10% and pay premium shares that leave the controller unless identities overlap. Surrender cannot occur until the cooldown and only returns the reserve, not premium. The design materially removes the previous “volume creates mining power” loop.

The remaining economic risks are capital concentration, reward-token market value, self-dealing where fee identities overlap, transaction ordering, and whether emissions exceed genuine demand. Those are economic/governance risks rather than an accounting insolvency in the reserve model.

### Auction mechanism

Transferring LP tokens to the dead address locks LP redemption rights; it does not immediately change AMM reserves or reduce ERC20 LP `totalSupply`. The benefit is permanent removal of claims on the pool, not automatic spot-price appreciation. Allowing settlement at zero breaks even that limited LP-removal guarantee and is therefore scheduled for remediation.

## 9. Prioritized Remediation Plan

### Priority 0 — Restore deployability and make the test environment honest

1. Reduce Content/ContentFactory bytecode below EIP-170 with meaningful headroom.
2. Remove `allowUnlimitedContractSize`.
3. Add automated deployed-bytecode size assertions.

### Priority 1 — Protect funds and accounting

1. Isolate Multicall refunds by per-call balance delta and add reentrancy protection.
2. Convert every Content payout to pull accounting without changing fee percentages or reserve growth.
3. Authorize Rewarder notifiers and verify exact token receipt.
4. Validate Core external wiring and exact liquidity outputs.

### Priority 2 — Harden economic and user-safety edges

1. Enforce the configured Auction floor and receiver/asset/payment validation.
2. Use receiver-safe NFT collection.
3. Add metadata bounds and clarify global-week emission behavior.
4. Improve events for payout/notifier/configuration reconstruction.

### Priority 3 — Professional verification and downstream synchronization

1. Add regression exploits for every confirmed issue.
2. Add deterministic state-machine sequences for collect/claim/surrender/reward operations and cross-contract invariants.
3. Add boundary/economic scenarios for truncation, zero premium, repeated self-collection, fee overlap, delayed emissions, and Auction floors.
4. Run compile, complete tests, coverage, bytecode limits, dependency audit, subgraph codegen/build, and frontend lint/build.
5. Update ABIs, subgraph mappings/schema, application adapters, deployment script, and protocol docs.
6. Produce `StickrNet_Final_Audit.md` with before/after finding status, exact command results, remaining centralization assumptions, and deployment readiness.

## 10. No-Change Decisions Requiring Explicit Tokenomics Approval

The following are documented but will not be changed in this pass unless required to fix a confirmed vulnerability:

- 10% reserve growth.
- One-day premium decay and one-day surrender cooldown.
- 40/20/30/5/5 premium split and treasury routing of disabled shares/dust.
- Reward weight equal to reserve.
- Seven-day reward streaming.
- Current halving parameters and the global-week/skipped-emission semantics described in M-05.
- LP-token Auction denomination and the configured per-channel `minInitPrice` value.

The only scheduled settlement-curve change is enforcing the already configured Auction minimum as the live floor, because the current zero-price path defeats the stated LP-payment mechanism. That change will be highlighted in the final report and documentation.
