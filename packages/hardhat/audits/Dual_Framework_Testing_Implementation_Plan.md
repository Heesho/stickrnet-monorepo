# StickrNet Dual-Framework Testing Implementation Plan

**Prepared before implementation:** 2026-07-25  
**Baseline commit:** `5009638333b17aa17f26ba13c92207fa4123dfb9` (`main`)  
**Canonical source root:** `packages/hardhat/contracts`

## Baseline

- Hardhat: 301 tests passing.
- Compiler: Solidity 0.8.19 (`0.8.19+commit.7dd6d404`), optimizer enabled with 200 runs, via-IR enabled, compiler-default Paris EVM.
- Production contracts: `Auction`, `AuctionFactory`, `Coin`, `CoinFactory`, `Content`, `ContentFactory`, `Core`, `Minter`, `MinterFactory`, `Multicall`, `Rewarder`, and `RewarderFactory`.
- Interfaces: all protocol and Uniswap V2 interfaces under `contracts/interfaces`.
- Test dependencies: protocol mocks under `contracts/mocks`; OpenZeppelin Contracts 4.9.6 resolves from the monorepo dependency tree.
- Foundry 1.2.3 is installed, but no `foundry.toml`, Foundry test tree, or second-framework CI commands exist.
- No baseline Hardhat failures or compiler warnings were observed.

## Non-Negotiable Architecture

1. `contracts/` remains the sole production Solidity implementation.
2. Foundry's `src` points directly at `contracts`; no protocol source is copied or symlinked.
3. Foundry-only fixtures and adversarial helpers live below `foundry/` and may import production contracts from `contracts`.
4. Both compilers use Solidity 0.8.19, optimizer 200, via-IR, Paris EVM, identical source paths, and the same OpenZeppelin files.
5. Automated equivalence checks compare compiler inputs, ABIs, selectors, events, errors, storage layouts, and metadata-normalized bytecode.

## Implementation Phases

### 1. Shared toolchain

- Add `foundry.toml` with fast CI and deep local profiles, persistent failures, gas reporting, and canonical source configuration.
- Add a dependency-light Foundry test base exposing only documented cheatcodes and assertion helpers required by the suite.
- Document compiler and environment equivalence.

### 2. Foundry deterministic and fuzz coverage

- Build one production-path fixture that launches through Core and every factory.
- Add deterministic tests for Coin, Core/factories, Content, Rewarder/Minter, Auction, and Multicall.
- Add bounded fuzz tests for reserves, timing, role overlap, repeated trading, rounding, surrender, rewards, and Auction boundaries.
- Use exact balance, liability, event, ownership, error-selector, and reward-weight assertions.

### 3. Stateful invariants

- Build a handler that creates, collects, claims, surrenders, advances time, updates emissions, claims rewards, and changes permitted recipients.
- Maintain independent ghost state for active tokens, owners, reserves, expected account reward weight, quote inflow/outflow, reserve/claim liabilities, and surrender status.
- Assert aggregate reserves, aggregate reward weight, owner allocation, solvency, asset/liability conservation, and inactive-token properties.

### 4. Differential scenarios

- Execute shared named scenarios in Hardhat and Foundry with the same actors, timestamp, balances, production deployment path, and constructor/launch parameters.
- Emit normalized JSON using stable actor labels and decimal strings.
- Compare launch, initial collection, resale, self-collection, ten trades, rewards, surrender, zero premium, Auction settlement, and role overlap.
- Include normalized success state, events, and custom-error selectors.

### 5. Compiler-output equivalence

- Build standard JSON compiler inputs from the canonical source set for each framework.
- Compare contract inventory, ABI entries, function/event/error signatures and selectors, storage layout, creation bytecode, and runtime bytecode after CBOR metadata removal.
- Fail if a Foundry production artifact originates outside `contracts/` or if any compared output differs.

### 6. Reproducibility and CI

- Add package commands for compilation, Hardhat, Foundry, fuzz, invariant, differential, equivalence, coverage, and gas tests.
- Add a pull-request workflow with moderate fuzz/invariant settings and a manual/nightly deep workflow.
- Preserve Foundry failure corpora locally while ignoring generated cache/output directories.

### 7. Validation and reporting

- Run all fast and deep commands in the available environment.
- Record exact run counts, invariant depth, coverage, gas, discrepancies, and residual assumptions in `Hardhat_Foundry_Verification_Report.md`.
- Do not claim equivalence unless normalized scenarios and compiler outputs both match.

