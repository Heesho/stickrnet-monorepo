# StickrNet Hardhat and Foundry Verification Report

**Report date:** 2026-07-25  
**Reviewed Git HEAD:** `5009638333b17aa17f26ba13c92207fa4123dfb9` (`main`)  
**Verification target:** the current hardening and testing working tree on top of that commit  
**Canonical production source:** `packages/hardhat/contracts`  
**Frameworks:** Hardhat 2.19.5 and Foundry 1.2.3

## Executive conclusion

The dual-framework verification suite is implemented and suitable for external-auditor handoff as a reproducible test harness. Hardhat and Foundry compile the same canonical contracts; there is no second Foundry protocol implementation. The CI-count fuzz, invariant, differential, artifact-equivalence, deterministic, adversarial-token, coverage, and gas runs described below pass.

The suite proves the core reserve-backed economic properties under its modeled actions: Rewarder stake equals independently tracked refundable reserve, reserve plus claim liabilities remain exactly asset-backed, ownership changes remove old mining weight, surrender removes reserve and mining weight atomically, and self-controlled repeated trading does not create unbacked mining power.

This report is not a release-commit attestation because the verified hardening and test changes are currently uncommitted on top of the stated Git HEAD. A final release audit should repeat the same commands against the eventual clean release commit.

## Scope and architecture

Production scope includes `Core`, `Content`, `Rewarder`, `Minter`, `Auction`, `Multicall`, `Coin`, all five factories, and all protocol interfaces. Tests exercise the actual launch chain:

```text
Core -> CoinFactory -> ContentFactory -> RewarderFactory
     -> AuctionFactory -> MinterFactory -> ownership/minter handoffs
```

Foundry uses `src = "contracts"`; its tests, handlers, and helpers live under `packages/hardhat/foundry`. No production Solidity file is copied into that tree. OpenZeppelin imports map to the monorepo's installed OpenZeppelin Contracts 4.9.6 dependency.

The pre-implementation baseline was 301 passing Hardhat tests, no failures, and no compiler warnings at Git HEAD `5009638333b17aa17f26ba13c92207fa4123dfb9`.

## Shared compiler configuration

| Setting | Verified value |
|---|---|
| solc | `0.8.19+commit.7dd6d404` |
| optimizer | enabled |
| optimizer runs | 200 |
| via-IR | enabled |
| EVM | Paris |
| metadata | CBOR with IPFS bytecode hash |
| canonical source root | `packages/hardhat/contracts` |
| OpenZeppelin | 4.9.6 from the monorepo dependency tree |
| linked libraries | none |
| local timestamps | explicit in differential scenarios |

The complete rationale and normalization rules are in `Dual_Framework_Testing_Configuration.md`.

## Deterministic tests

### Hardhat

- Result: **305 passing, 0 failing** in the normal production-artifact run.
- The new adversarial suite adds four exact regressions for blacklistable USDC, false-return tokens, reverting tokens, blacklisted auxiliary rewards, and negative rebasing.
- Existing and hardened suites cover unit behavior, factories, lifecycle integration, fee/reserve economics, role overlap, repeated trading, reward emissions, Auction boundaries, Multicall residual balances, access control, reentrancy, moderation, MEV bounds, stress, and state-machine regressions.

### Foundry

- Deterministic protocol unit suite: **11 passing, 0 failing**.
- Gas-operation suite: **9 passing, 0 failing**.
- Differential writer: **1 passing, 0 failing**.
- Production-path deployment is performed through Core and every factory; implementations are not substituted with direct test deployments for the launch-equivalence assertions.

The deterministic Foundry suite asserts exact custom-error selectors, events, balances, ownership, reserves, premiums, fee claims, reward weight, total liabilities, LP burn, and authority handoffs.

## Fuzz verification

CI profile result: **7 properties × 1,000 runs = 7,000 passing property executions**.

Properties cover:

1. collection payment always decomposes into the required reserve plus premium and remains fully backed;
2. resale removes the previous owner's weight and assigns only the new reserve to the recipient;
3. 1–100 repeated self-controlled trades preserve reserve/stake equality and solvency;
4. surrender behavior is atomic on both sides of the exact cooldown boundary;
5. arbitrary six-decimal reserve values and timing cannot distribute more than the premium or create rounding deficits;
6. arbitrary valid Auction durations, floors, starts, multipliers, and timestamps remain between start and floor; and
7. arbitrary reward amounts and timing accrue proportionally to reserve-backed stake.

Fuzz inputs include role overlap, payer/recipient separation, zero and expired premium, minimum-unit and division boundaries, reserve growth, arbitrary timing, 1–100 trade counts, reward amounts, Auction parameters, and surrender timing.

Configured profiles:

| Profile | Fuzz runs | Invariant runs | Invariant depth |
|---|---:|---:|---:|
| default | 1,000 | 256 | 64 |
| CI | 1,000 | 250 | 50 |
| deep | 10,000 | 1,000 | 128 |

Failure corpora persist under ignored `foundry/failures` paths. Handler actions emit a selector, token ID, actor, and amount to make failing traces readable.

## Stateful invariant verification

CI profile result: **5 invariants passing at 250 runs × depth 50**. Each invariant executed 12,500 randomized handler calls; aggregate execution was 62,500 calls.

The handler independently models create, collect, claim, surrender, time advance, emission update, reward claim, team change, protocol-recipient change, auxiliary reward registration/notification, and treasury Auction purchase.

Independent ghost accounting tracks token activity, owner, creator, reserve, premium start/time, last collection, account reward weight, per-recipient claimable proceeds, total incoming quote, payouts, reserves, claims, premium distribution, reserve-refund liabilities, surrender payouts, emissions, and reward claims.

The five invariant groups prove:

- `rewarder.totalSupply()` and `content.totalReserved()` equal the independent reserve ledger;
- the sum of active Sticker reserves equals total reserve and burned Stickers have no reserve or premium;
- account reward balances equal the independent per-owner allocation and sum to total supply;
- per-recipient claims and Content's quote balance equal an independent cash-conservation ledger; and
- every claim/payout originates only from premium, old-reserve refunds, or surrender refunds.

Together these enforce full quote solvency, one reserve unit backing at most one reward-weight unit, no old-owner residual weight, no capital reuse while old weight survives, no reserve-funded fees, and collateralized role-overlap/self-trading.

## Differential Hardhat/Foundry results

Result: **15 normalized scenarios identical**.

Successful scenarios:

1. channel launch;
2. initial Sticker collection;
3. Sticker resale;
4. creator self-collection;
5. ten controlled trades;
6. reward emission and claim;
7. surrender;
8. premium reaching zero;
9. treasury Auction purchase; and
10. creator/owner/team/protocol role overlap.

Failure scenarios compare exact revert selectors for stale epoch, expired deadline, max-price violation, surrender cooldown, and unauthorized Rewarder deposit.

Each success snapshot compares explicit timestamp, action and stable actor labels, event amounts, token reserve/premium/price, aggregate reserves and claims, Rewarder supply and four actor weights, Content quote assets, seven claim recipients, community-token reward balance, Auction assets/epoch, and burned LP. Raw deployment addresses are normalized; code equivalence is checked separately at artifact level.

## Contract artifact equivalence

Result: **25 production artifacts passed** across a canonical 66-file compiler source graph.

The verifier requires equality of:

- canonical production source target and keccak source hash;
- solc long version, optimizer, optimizer runs, via-IR, EVM, metadata, and libraries;
- normalized ABI, including functions, events, and custom errors;
- function selectors;
- storage layout after removal of non-semantic AST IDs;
- library references; and
- creation and runtime bytecode after CBOR removal and canonical standard-JSON source-graph normalization.

Canonical source-graph SHA-256 for the final run: `d386258ac976712b54358e7d8ffbac19f1db7a8cc02fcd7b195b007866c66dcf`.

Native Forge and Hardhat wrappers package transitive imports differently. With via-IR this changed internal AST/Yul IDs and basic-block order in 11 native Forge artifacts even after CBOR removal. The verifier does not ignore this discrepancy: it first requires semantic artifact equality, then recompiles the exact complete standard-JSON source graph with the pinned native solc and requires creation/runtime bytecode equality. The accepted normalization and its limitation are documented in the configuration document.

## Coverage

Hardhat coverage was run from a clean instrumented build. The command now always removes instrumented artifacts afterward and rebuilds production artifacts.

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Production contracts | 94.93% | 63.90% | 93.67% | 94.40% |
| All contracts including mocks | 87.81% | 59.95% | 81.60% | 86.64% |

Coverage execution: 304 passing and one intentionally skipped EIP-170 bytecode-size assertion, because instrumentation itself changes bytecode size.

Foundry 1.2.3 coverage is unavailable for this contract shape. Its accurate non-via-IR mode fails with stack-too-deep in `Content.collect`; `--ir-minimum` fails with a Yul stack-depth exception. `test:coverage:foundry` detects this exact paired limitation and reports it, while treating any different failure as an error. Hardhat is the authoritative line/branch report.

## Gas baseline

The persistent Foundry snapshot records operation-only gas by pausing metering during fixture preparation:

| Operation | Gas |
|---|---:|
| Channel launch | 8,812,340 |
| Sticker creation | 220,786 |
| First collection | 315,175 |
| Subsequent collection | 116,011 |
| Claim | 5,854 |
| Reward claim | 82,222 |
| Surrender | 19,619 |
| Treasury Auction | 45,460 |
| Minter update | 166,803 |

The baseline is stored at `foundry/snapshots/gas.snap`. Safety and accounting clarity take priority over optimizing these values.

## Discrepancies and fixes discovered while building the suite

No new production-contract defect was found after the prior hardening pass. The dual-framework work found four verification-harness defects:

1. Hardhat pre-transaction `eth_call` quotes used the prior mined timestamp while Foundry read after `vm.warp`. The Hardhat scenario now mines the target timestamp before pre-state reads. Ten success scenarios then matched exactly.
2. A reserve-economics regression hard-coded a 160 USDC max price while its exact rounded price was 160.000348 USDC. The test now uses the sampled exact on-chain price and continues to assert the approximately 50 USDC premium.
3. The initial differential Solidity writer built one very large JSON expression, causing impractically slow compilation. It now writes a deterministic tab-separated snapshot that the comparator normalizes.
4. `solidity-coverage` left instrumented artifacts in the normal artifact directory, causing subsequent factory deployment to exceed EIP-170. The coverage wrapper now cleanly restores production artifacts in all outcomes.

All discovered harness failures have deterministic coverage in the current command paths.

## CI integration

`.github/workflows/contracts-verification.yml` provides:

- pull-request/push verification: compile, 305 Hardhat tests, Foundry unit tests, 1,000-run fuzzing, 250×50 invariants, differential scenarios, artifact equivalence, and Foundry formatting; and
- nightly/manual deep verification: 10,000-run fuzzing, 1,000×128 invariants, both coverage commands, equivalence, differential testing, gas snapshot generation, and artifact upload.

The equivalence command forces clean recompilation in both frameworks and enables Foundry compiler-warning denial.

## Reproduction commands

Run from the repository root:

```bash
yarn contracts:compile
yarn test:hardhat
yarn test:foundry
yarn test:fuzz
yarn test:invariant
yarn test:differential
yarn verify:contract-equivalence
yarn test:coverage
yarn workspace @stickrnet/hardhat test:coverage:foundry
yarn test:gas
yarn test:verification
```

Deep local run:

```bash
cd packages/hardhat
FOUNDRY_PROFILE=deep forge test --match-path 'foundry/test/fuzz/*.t.sol'
FOUNDRY_PROFILE=deep forge test --match-path 'foundry/test/invariant/*.t.sol'
```

## Remaining assumptions and risks

- Rebasing quote or reward tokens are unsupported. A negative rebase can make an auxiliary reward stream unpayable; the regression proves claim failure is atomic, not that rebasing assets are safe.
- A blacklistable quote token can censor a recipient's claim. Pull accounting keeps liabilities and collateral intact, but cannot override token-admin censorship.
- AMM behavior uses realistic six-decimal assets and the repository's Uniswap mocks, not a fork of deployed Base contracts. Pair manipulation and nonstandard live-router behavior should receive separate fork testing before mainnet.
- No Base Sepolia RPC deployment or explorer verification was performed in this local verification run.
- Native wrapper bytecode is not raw-identical before the documented via-IR source-graph normalization.
- Foundry source coverage is blocked by compiler/tool limitations described above.
- The deep 10,000/1,000×128 profile is configured for nightly/manual CI but was not executed in this local run; the meaningful CI profile was executed in full.
- No pre-existing JavaScript lint configuration exists, so CI applies Solidity formatting but does not invent a new JS lint policy.

## Confidence assessment

Confidence is high for the tested reserve, reward-weight, fee-liability, surrender, factory deployment, and deterministic cross-framework behaviors. The suite is ready to hand to an external auditor together with the configuration document and implementation plan. Before treating it as a release attestation, commit the verified working tree, run the deep CI profile against that clean commit, add a live Base fork suite, and obtain independent manual review/static analysis.
