# StickrNet Final Security and Economic Audit

**Assessment date:** 2026-07-25  
**Repository:** `stickrnet-monorepo`  
**Baseline commit:** `5009638333b17aa17f26ba13c92207fa4123dfb9` (`main`)  
**Assessed target:** the final working tree produced by this remediation pass  
**Deployment context:** fresh Base Sepolia deployment; no legacy-state migration required

## 1. Executive Summary

This pass reviewed StickrNet's launch, Sticker, reserve, reward, emission, treasury-auction, helper, application, and indexing paths. It began with a 292-test baseline and a written pre-remediation report, then addressed the release blockers and the highest-impact accounting and integration risks.

The redesigned Sticker model satisfies its central source-level accounting property:

```text
mining power = refundable USDC reserve
Rewarder.totalSupply = sum(active Sticker reserves) = Content.totalReserved
USDC held by Content >= totalReserved + totalClaimable
```

Neither gross collection price nor speculative premium creates reward weight. Controlled wallets, creator self-collection, role overlap, rapid trading, and payer/recipient separation do not create unbacked mining power. Surrender removes the reserve weight and burns the NFT before refunding the full reserve.

The remediation also fixes an exploitable global-balance refund in Multicall, removes blocking push payouts from collection, restricts and fully funds reward notifications, preserves undistributed rewards while no stake exists, makes treasury auctions settle no lower than their configured LP-token floor, validates launch wiring and liquidity outputs, and restores deployment viability under EIP-170.

The final Solidity suite passes with **301 tests**. Instrumented coverage passes with **300 tests and one intentional bytecode-size skip**, reaching **93.43% statements, 62.83% branches, 92.41% functions, and 93.20% lines for production contracts**. The web application lints with no errors and builds successfully; the subgraph code-generates and builds successfully.

This is a strong **external-audit candidate** after deployment configuration is completed. It is **not yet recommended for mainnet**. Remaining blockers are independent external review, fresh-address deployment rehearsal, dependency/toolchain remediation, live-fork testing against the selected Base contracts and quote token, governance controls, monitoring, and explicit product decisions around emissions and channel-level parameter bounds.

## 2. Scope and Methodology

The review covered:

- `Coin`, `Content`, `Rewarder`, `Minter`, `Auction`, `Core`, `Multicall`, all factories, interfaces, and mocks.
- Contract tests, deployment scripts, Hardhat configuration, compiler output, runtime bytecode, and dependency advisories.
- Frontend ABIs, state hooks, launch defaults, user-facing economic language, network configuration, and explorer links.
- Subgraph ABIs, schema, mappings, manifest, network configuration, and generated build validity.
- Protocol READMEs, conceptual documentation, migration documentation, and prior audit notes.

The methodology combined manual line-by-line review, cross-contract asset-flow reconstruction, adversarial economic reasoning, regression tests, deterministic randomized state-machine testing, boundary and stress tests, compiler-size inspection, coverage, application build/lint validation, subgraph codegen/build validation, and dependency auditing.

Slither, Semgrep, Mythril, Echidna, Aderyn, and Solhint were not installed in the environment. No result from those tools is claimed. Foundry was installed, but this repository is not a Foundry project; the state-machine invariants were implemented in the existing Hardhat harness instead of introducing a second framework during a security-sensitive pass.

## 3. Architecture and Trust Model

### Contract map

| Contract | Purpose | Assets held | Privileged authority |
|---|---|---|---|
| `Core` | Launch orchestration, AMM liquidity, registry, global fee configuration | Quote/Coin transiently during atomic launch | Core owner changes protocol fee recipient and minimum launch quote |
| `Coin` | Channel ERC20 reward token | None | Minter is sole mint authority after launch |
| `Content` | Sticker NFT, reserve/premium accounting, moderation, quote claims | Refundable quote reserves and all unpaid quote liabilities | Channel owner controls metadata, moderation, treasury/team, and reward registration/notifiers |
| `Rewarder` | Streams reward tokens pro rata to reserve-backed balances | Registered reward tokens | Only Content changes stake and reward configuration; configured notifier funds each stream |
| `Minter` | Weekly Coin emissions and halving | None after forwarding emissions | Permissionless period update; immutable schedule and destinations |
| `Auction` | Sells caller-selected treasury assets for LP tokens | Premium-derived quote and any ERC20 sent to it | No admin; any buyer may execute a valid epoch purchase |
| `Multicall` | Convenience transactions and aggregate reads | Tokens only transiently, except accidental transfers | No admin; only Core-registered Content is accepted |
| Factories | Deploy fixed implementations | None | No admin |

### Critical flows

```text
Channel launch
Launcher quote -> Core -> AMM pair
Core-minted Coin -> AMM pair
LP minted to Core -> dead address
Core -> Auction, Content/Rewarder, Minter
Coin mint authority -> Minter; Content ownership -> launcher
```

```text
Sticker create / moderate
Creator -> Content.create -> safe-mint NFT with reserve 0
If moderated: owner/moderator approval required before collection
Creation alone creates no Rewarder weight
```

```text
Sticker collect / resale
Collector -> Content: newReserve + currentPremium
oldReserve -> previous-owner claimable
premium -> 40% previous owner / 20% creator / 30% treasury / 5% team / 5% protocol
disabled shares + integer dust -> treasury claimable
Rewarder: withdraw old reserve weight, deposit new reserve weight
NFT: previous owner -> receiver through safe ERC721 acceptance
```

```text
Surrender
Owner waits 24 hours from latest collection
Rewarder withdraw(reserve) -> burn NFT -> reserve refund to owner
totalReserved and live totalSupply decrease atomically
```

```text
Emissions and claims
Any keeper -> Minter.updatePeriod -> Coin mint -> Rewarder notification
Rewarder streams while stake exists and pauses its finish time while stake is zero
Beneficiary or helper -> Rewarder.getReward / Content.claim
```

```text
Treasury / LP burn
Treasury premium remains a Content claimable liability until claimed to Auction
Buyer supplies explicit Auction asset list and pays current LP-token price
LP payment -> dead address; selected Auction ERC20 balances -> buyer receiver
Price decays linearly but never below configured LP floor
```

There is no on-chain price oracle. AMM reserve-derived values exposed by Multicall and shown by the application are manipulable spot estimates and are not used for contract settlement.

## 4. Asset and Liability Model

For active Sticker `i`, let `R_i` be its reserve and `P_i(t)` its current premium.

```text
nextReserve(0) = minInitPrice
nextReserve(R) = floor(R * 11,000 / 10,000)
premium(t) = premiumStart * remainingSeconds / 86,400
collectionPrice(t) = nextReserve(R) + premium(t)
rewardWeight(i) = R_i
```

At collection, the quote balance and liabilities increase by the same amount:

```text
payment = newReserve + premium
new reserve liability = newReserve
new claim liabilities = oldReserve + premium
released reserve liability = oldReserve
net liability increase = newReserve + premium = payment
```

Every premium wei is assigned exactly once. Basis-point truncation and disabled team/protocol shares are added to treasury, so rounding cannot consume collateral. All fee and reserve-release payments are pull liabilities; a blacklisted recipient can strand only its own claim and cannot block collection.

The quote token is deliberately restricted by behavior: fee-on-transfer and rebasing tokens are unsupported. Exact balance-delta checks reject short receipt. A supported deployment must use a reviewed standard ERC20 with known decimals; the product currently assumes six-decimal USDC for display and launch values.

## 5. Findings and Remediation Status

| ID | Severity | Finding | Status |
|---|---|---|---|
| OPS-01 | High | `ContentFactory` exceeded EIP-170 and local config masked it | **Resolved** |
| SEC-01 | High | Multicall collector could withdraw its entire prefunded quote balance | **Resolved** |
| SEC-02 | Medium | Push fee recipients could block every collection | **Resolved** |
| SEC-03 | Medium | Permissionless reward schedule reset and short token receipt | **Resolved** |
| ECON-01 | Medium | Treasury auction reached zero and allowed free extraction | **Resolved — explicit economic change** |
| SEC-04 | Medium | Core trusted mismatched router/factory and liquidity outputs | **Resolved** |
| ECON-02 | Medium | Global-week emissions have launch timing and missed-week discontinuities | **Accepted; product decision required** |
| SEC-05 | Low | Collection could strand a non-transferable NFT in an incompatible contract | **Resolved** |
| GOV-01 | Low | Immediate single-step administration and ownership transfer | **Open operational risk** |
| OPS-02 | Low | Unbounded metadata and admin/user arrays | **Partially resolved** |
| INT-01 | Low | AMM-derived UI prices can be manipulated | **Accepted display-only risk** |
| CODE-01 | Informational | Enumerable inheritance and legacy accounting aliases inflated/obscured code | **Resolved** |
| OPS-03 | Medium release-tooling | Stale dependencies contain known advisories | **Open** |

### OPS-01 — EIP-170 deployment failure

**Original behavior:** `ContentFactory` compiled to 27,994 runtime bytes; Hardhat enabled `allowUnlimitedContractSize`.  
**Risk:** deployment to Base would fail although local tests passed.  
**Remediation:** removed unused `ERC721Enumerable`, obsolete aliases, and unlimited-size configuration; added a 23,000-byte regression ceiling.  
**Result:** `ContentFactory` is 16,146 bytes, leaving 8,430 bytes below EIP-170.  
**Regression:** `testHardening.js` contract-size test.

### SEC-01 — Global Multicall balance theft

**Original behavior:** collection refunded the helper's complete quote balance.  
**Attack:** pre-existing or accidentally transferred quote could be collected by the next caller.  
**Remediation:** exact incoming balance checks, before/after per-call refund deltas, allowance clearing, Core registry validation, and reentrancy guards on value paths.  
**Regression:** a prefunded 123-USDC balance remains untouched after collection.

### SEC-02 — Blocking push payouts

**Original behavior:** treasury/team/protocol transfers occurred synchronously inside collection.  
**Failure:** a paused or blacklisting quote token could reject one recipient and halt all ownership changes.  
**Remediation:** old reserve and every premium share now accrue into `accountToClaimable`; `totalClaimable` participates in solvency checks. Multicall performs only best-effort convenience claims.  
**Economic effect:** none; the 40/20/30/5/5 premium split, disabled-share routing, and dust routing are unchanged. Only payment delivery timing changes.

### SEC-03 — Reward notification manipulation/undercollateralization

**Original behavior:** anyone could reset a registered token's seven-day stream, and the promised amount was not compared with actual receipt. Rewards elapsed while supply was zero.  
**Remediation:** each reward token has one Content-controlled notifier; Coin is wired to its immutable Minter before ownership handoff; exact receipt is mandatory; stream finish time shifts across zero-supply intervals.  
**Regressions:** unauthorized notifier, fee-token short receipt, and zero-stake pause tests.

### ECON-01 — Free treasury auction settlement

**Original behavior:** Auction price reached zero at epoch expiry.  
**Risk:** a bot could extract selected treasury assets without burning LP, making liveness determine treasury loss.  
**New behavior:** price decays linearly to `minInitPrice` and remains there. Receiver, asset-code, and exact LP-payment checks were added.  
**Classification:** intentional economic hardening. It does not guarantee fair value; it guarantees only a nonzero configured floor.  
**Regression:** expiry-floor and invalid receiver/asset tests.

### SEC-04 — Launch wiring and liquidity mismatch

**Original behavior:** Core trusted the configured router, independently configured factory, and router return values.  
**Remediation:** code-bearing dependency checks; `router.factory()` equality; exact quote receipt; exact desired liquidity amounts; nonzero liquidity/pair; no Coin/quote residue; and allowance clearing.  
**Residual:** deployment operators must independently verify that the selected external bytecode is canonical or otherwise trusted.

### ECON-02 — Emission timing discontinuities

Minter remains aligned to global week boundaries. A launch shortly before a boundary may receive a full emission soon after launch, and skipped keeper periods are not caught up. This was not changed because anniversary-based or catch-up issuance changes token supply. The behavior must be accepted explicitly or redesigned before mainnet.

### SEC-05 — Incompatible NFT receiver

Collection now uses receiver-safe ERC721 transfer after reserve/reward effects. An incompatible receiver reverts the complete transaction, including payment and accounting. Direct transfers and approvals remain disabled.

### GOV-01 — Immediate administration

Core and Content use immediate `Ownable` controls and single-step ownership transfer. A compromised owner can redirect future fees, alter launch minimums, change channel recipients/metadata/moderation, or configure additional reward tokens. Existing reserves cannot be withdrawn by the owner through these functions. Use separate multisigs, verify recipients on-chain, monitor all admin events, and add timelocked/two-step administration before mainnet.

### OPS-02 — Dynamic input bounds

Name (64 bytes), symbol (16 bytes), collection URI (2,048 bytes), and token URI (4,096 bytes) are now bounded. Moderator approvals, moderator lists, and Auction asset lists remain caller-paid dynamic arrays. Large calls may revert from gas exhaustion; integrations must paginate/batch. Content creation remains permissionless and can create indexing spam, but creates no reserve or mining weight.

### INT-01 — Spot-price presentation

Multicall price, liquidity, and market-cap fields use live pair balances. Direct donations, low liquidity, and same-block trades can distort them. They must remain labeled estimates and must never be used as an oracle, collateral value, reward weight, or transaction safety bound.

### OPS-03 — Dependency advisories

The final repository-level `npm audit --omit=dev` reports **65** production advisories (22 high, 14 moderate, 29 low); the Hardhat workspace dependency graph reports **55** (16 high, 10 moderate, 29 low). These primarily affect build, verification, networking, and archive toolchains rather than deployed bytecode, but deployment environments hold valuable credentials. Upgrade Hardhat/ethers/verification and web dependencies on a dedicated branch, regenerate one authoritative lockfile, and rerun all checks before a release ceremony.

## 6. Economic and Game-Theory Assessment

### Wash mining conclusion

Wallet splitting does not bypass the capital constraint. At all times after a successful transaction, the aggregate reward weight is the quote reserve still held for active Stickers. A trader can recycle an old reserve into a larger new reserve, but the incremental reserve remains locked. Premium rebates can reduce permanent trading cost when roles overlap; they cannot back reward weight because premium never enters `Rewarder.deposit`.

Waiting until premium reaches zero makes a trade cheaper, but not free: the buyer must fund the next reserve. This is intended reserve-rollover arbitrage, not unbacked mining. It may concentrate collections among bots at predictable expiry times; epoch ID, deadline, and maximum price protect the submitted trade but cannot promise ordering.

### Numerical scenarios

The following examples use a 100-USDC initial reserve, immediate full premium equal to the new reserve, and ignore reward-token market value unless stated.

| Scenario | Capital/payment result | Mining result | Classification |
|---|---|---|---|
| Honest first collection | Pays 200; 100 becomes reserve; 100 premium is distributed | 100 weight backed by 100 USDC | Intended |
| Creator is prior owner and collector | Can reclaim 60% of premium as owner+creator; more only if it also controls fee roles; full 100 reserve remains locked | 100 backed weight | Subsidized self-trade, not exploit |
| Controlled resale, 100 -> 110 reserve | Pays 220 immediately; receives old 100 plus controlled premium shares; at least treasury share leaves the coalition | 110 backed weight; prior 100 removed | Intended but economically self-subsidized |
| Ten controlled wallets | Wallet count does not change aggregate liabilities or weight | Aggregate weight equals final reserves | Sybil-neutral for backing |
| 100 immediate controlled collections | Final reserve is about 1.253M; sum of full premiums is about 13.780M; treasury alone receives about 4.134M if all other roles collude | About 1.253M weight, fully backed | Extremely costly wash path |
| Premium-zero bot | Pays only next reserve; old reserve is released to seller | Weight equals new reserve; bot locks the growth increment | Intended timing arbitrage |
| Flash-funded collection | New reserve cannot leave for 24 hours; the prior reserve refund belongs to the prior owner | Flash loan cannot be repaid from the locked reserve atomically | Not a viable atomic reserve exploit |
| Reward claim then surrender | Accrued rewards remain earned; reserve is refunded after cooldown | Weight becomes zero at surrender | Intended staking exit |
| Large miner vs many small miners | Equal aggregate reserves earn approximately equal rewards; splitting adds transaction costs and rounding | Pro rata by reserve | No Sybil advantage |
| Thin Coin-liquidity manipulation | May inflate displayed/realisable reward value temporarily | Cannot inflate USDC reserve weight | Market manipulation risk, not reserve exploit |
| Treasury auction at floor | Buyer may buy below off-chain fair value but must burn configured LP floor | No effect on Sticker weight | Intended arbitrage with parameter risk |
| Abandoned Sticker | Reserve stays in Content and continues to weight its owner until collected/surrendered | Still fully backed | Liveness/user-custody risk |
| Surrender and recreate | Old NFT burns after cooldown; new token begins at zero reserve and must be recollected | No duplicated weight | Intended; social history changes |
| Hundreds of uncollected NFTs | Creator pays gas; index/UI load grows | Zero mining weight | Spam/operations risk |
| Malicious moderated channel | Owner can censor approval and change future recipients | Cannot fabricate reserve backing | Governance/product risk |

The 100-trade figures use the geometric series `100 * (1.1^100 - 1) / 0.1` for full premiums and `100 * 1.1^99` for the final reserve. At zero premium the permanent trade fee is zero, but growing reward weight still requires growing locked capital.

### Creator fees

Creator royalties are paid only from premium. A creator-controlled collector can recover its 20% share and, if it is also the prior owner, another 40%. This lowers the coalition's permanent premium cost and can encourage self-promotion or spam. It does not lower the refundable capital needed for weight. Whether 20% produces desirable curation incentives is a product decision, not a solvency issue.

### Reward economics

Accounting is solvent, but profitability depends on Coin price, emissions, and total reserves. If emitted Coin can be sold for more than the opportunity cost and premium of acquiring reserve weight, rational capital will enter until returns compress or liquidity fails. A thin pool can display unrealistic annualized returns. The NFT layer adds ownership, creator, moderation, and discovery behavior, but economically its reward component is reserve-weighted staking. UI and marketing should say this plainly.

### Channel and treasury economics

Channel creators choose emission and reserve parameters within contract-level bounds, and the global minimum launch quote can be low. Disposable-channel farming remains possible if the launcher can cheaply create a pool, dominate its reserve weight, and find external buyers for emitted Coin. This does not steal another channel's reserves, but can create misleading communities and token supply. Mainnet should add reviewed parameter ranges or curated presets, meaningful launch cost, and clear channel-risk labels.

LP sent to the dead address cannot be redeemed by the protocol, but burning/locking LP does not guarantee Coin price appreciation. Treasury auctions transfer value to arbitrageurs in exchange for LP removal. The floor prevents free extraction, not underpricing; auction cadence and floor selection need empirical testnet monitoring.

## 7. Code and Integration Changes

- Reserve-backed Sticker accounting, premium-only fees, total reserve/claim liability accounting, 24-hour surrender, safe receiver handling, explicit live supply, metadata bounds, and removal of obsolete aliases/enumerability.
- Per-token reward notifier authorization, exact token receipt, and zero-supply stream pausing.
- Core external-code/router/factory/liquidity/pair validation and allowance cleanup.
- Auction floor, address/asset validation, and exact LP receipt.
- Multicall registry validation, reentrancy protection, per-call balance isolation, allowance cleanup, best-effort pull claims, and reserve/premium/reward-weight views.
- Base Sepolia-only Hardhat and deployment configuration; no embedded deployer key or old mainnet addresses; explicit environment validation; LP-denominated Auction defaults.
- Frontend Base Sepolia chain/explorer settings, environment-supplied addresses, updated ABIs/state, and reserve/premium/mining language.
- Subgraph regenerated ABIs, reserve/surrender schema and mappings, Base Sepolia manifest, and deployment placeholders.
- Updated protocol and migration documentation.

## 8. Validation Results

### Tests

- Baseline: **292 passing**.
- Final normal run: **301 passing**.
- Coverage run: **300 passing, 1 pending**. The pending test is the runtime-size assertion, intentionally skipped because solidity-coverage inflates bytecode; it passes against normal compiler artifacts.
- Added regressions cover deployment size, router/factory mismatch, notifier authorization, fee-on-transfer rewards, zero-stake streams, pull-liability solvency, Multicall prefund isolation, incompatible NFT receivers, Auction floor validation, and a 48-step deterministic randomized state machine spanning creation, collection, claims, surrender, time, emissions, reward claims, and recipient administration.
- Reserve-specific tests cover initial collection, a 100/110/50 resale, creator self-collection, payer/recipient separation, disabled recipients, ten controlled collections, cooldown/surrender/burn, zero premium, reward proportionality, and liability backing.

### Coverage

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Production contracts | 93.43% | 62.83% | 92.41% | 93.20% |
| All Solidity files including mocks | 86.73% | 58.85% | 80.73% | 85.84% |

Branch coverage remains lower because constructor validation matrices, best-effort catch branches, non-standard token behaviors, and some defensive external-integration branches are not exhaustively enumerated. This is not a formal proof.

### Runtime bytecode

| Contract | Runtime bytes | EIP-170 headroom |
|---|---:|---:|
| Auction | 3,415 | 21,161 |
| Content | 12,858 | 11,718 |
| ContentFactory | 16,146 | 8,430 |
| Core | 7,799 | 16,777 |
| Multicall | 14,986 | 9,590 |
| Rewarder | 5,816 | 18,760 |

### Downstream checks

- Application ESLint: passed with **0 errors** and 46 existing/non-blocking warnings.
- Next.js production build: passed; all 13 pages generated.
- Subgraph code generation: passed.
- Subgraph build: passed.
- `git diff --check`: passed.
- Solidity compiler: 65 files compiled successfully with optimizer (200 runs), via-IR, Solidity 0.8.19.

## 9. Deployment and Migration Requirements

All protocol contracts must be freshly deployed. The changed Content storage/API, Rewarder notifier API, Multicall state shape, Auction behavior, and Core wiring are not backward-compatible with old deployments. Because the environment is testnet-only, no legacy reserve reconstruction or user migration was implemented.

Before deployment:

1. Select and independently verify Base Sepolia quote, router, and factory addresses; confirm router/factory pairing and quote decimals/behavior.
2. Set `PRIVATE_KEY`, `RPC_URL`, `USDC_ADDRESS`, `UNISWAP_V2_FACTORY`, `UNISWAP_V2_ROUTER`, `PROTOCOL_FEE_ADDRESS`, and `MULTISIG_ADDRESS`. The script refuses non-84532 networks and invalid/zero critical addresses.
3. Review every launch parameter, especially USDC reserve values, Coin emission units, halving period, and LP-token-denominated Auction prices/floor.
4. Deploy factories, Core, and Multicall; verify source and constructor arguments; perform a small launch and full Sticker lifecycle rehearsal.
5. Transfer Core/channel ownership to reviewed multisigs and verify resulting owners/notifiers/recipients on-chain.
6. Populate frontend `NEXT_PUBLIC_*` contract/subgraph variables. Zero-address defaults intentionally fail closed.
7. Replace the subgraph's zero Core placeholder and `startBlock: 0` with the new Core address and deployment block, then deploy/reindex from a clean namespace.
8. Run live/fork smoke tests: launch, first/resale/zero-premium collect, every claim recipient, emission, surrender, treasury claim, Auction buy, and UI/subgraph consistency.
9. Publish addresses, bytecode hashes, roles, parameter values, and incident/monitoring contacts.

No deployment was performed during this audit because canonical testnet addresses, funded deployer authorization, multisig recipients, and publication approval were not provided.

## 10. Remaining Risks and Recommendations

### Must complete before mainnet

- Independent external audit and remediation verification.
- Resolve or formally accept dependency advisories; isolate and harden deployment credentials.
- Fork/live tests against the exact quote token, router, factory, explorer, RPC, wallet, and indexer stack.
- Multisig plus timelocked/two-step administration; operational monitoring and incident response.
- Explicit decision on global-week/skipped emissions.
- Economic bounds or curated presets for emissions, reserve minimums, launch cost, and Auction parameters.
- Formal modeling or a dedicated property-fuzzing campaign with Foundry/Echidna for longer arbitrary sequences and malicious-token integrations.

### Accepted or inherent risks

- MEV competition at predictable premium/Auction boundaries.
- Quote-token issuer pause/blacklist risk; a blacklisted claimant may be unable to receive its pull payment or surrender refund.
- Caller-selected Auction lists can omit assets; duplicate entries are safe for standard tokens but waste gas; malicious registered/selected tokens may revert their own path.
- Permissionless NFT creation causes spam and storage/indexing growth.
- AMM spot metrics and low-liquidity Coin value are manipulable.
- Reserve growth can make mature Stickers economically inaccessible; surrender/recreation resets social history rather than preserving a market.
- The owner can change future channel recipients, moderation, metadata, and auxiliary rewards.

## 11. Final Assessment

**Wash-mining objective:** achieved at the contract-accounting level. No tested address arrangement or collection sequence creates more reward weight than refundable quote capital held behind active Stickers.

**Reserve solvency:** enforced synchronously after critical transitions and exercised through unit, integration, stress, repeated-trade, and state-machine tests. This remains contingent on using a standard non-rebasing, non-fee quote token and on the correctness/liveness of that token contract.

**External-audit readiness:** yes, after filling deployment-specific placeholders and packaging the exact reviewed diff/commit. The code and reports are suitable inputs for an independent auditor.

**Mainnet readiness:** no. Source remediation is not a substitute for independent review, dependency cleanup, deployment rehearsal, governance hardening, production monitoring, and the unresolved economic decisions listed above.
