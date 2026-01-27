# Content Engine Security Audit Suite

**Audit Date**: January 2026
**Auditor**: Claude Code with Trail of Bits Skills
**Codebase**: Content Engine Hardhat
**Status**: REVIEWED AND REMEDIATED

---

## Audit Reports

This directory contains a comprehensive security audit performed using Trail of Bits audit methodologies:

| Report | Skill Used | Purpose |
|--------|------------|---------|
| [TrailOfBitsContextAudit.md](TrailOfBitsContextAudit.md) | `audit-context-building` | Deep context building, invariant mapping, system architecture |
| [EntryPointAnalysis.md](EntryPointAnalysis.md) | `entry-point-analyzer` | State-changing function identification, access control mapping |
| [SemgrepAnalysis.md](SemgrepAnalysis.md) | `static-analysis:semgrep` | Pattern-based vulnerability detection |
| [SharpEdgesAnalysis.md](SharpEdgesAnalysis.md) | `sharp-edges` | API misuse potential, dangerous defaults, footguns |

---

## Findings Summary & Resolutions

### High Severity

| ID | Finding | Resolution |
|----|---------|------------|
| H-01 | Unbounded loop over rewardTokens array - DoS risk | **FIXED** - Added `MAX_REWARD_TOKENS = 10` limit in Rewarder.sol |
| H-02 | LP front-running during launch | **INVALID** - Core is the only entity with Unit tokens at LP creation time |

### Medium Severity

| ID | Finding | Resolution |
|----|---------|------------|
| M-01 | Zero price collection allows free NFT acquisition | **INTENTIONAL DESIGN** - Allows abandoned content recovery |
| M-02 | Fee-on-transfer token incompatibility | **DOCUMENTED** - Added NatSpec to Core.sol, Content.sol, Rewarder.sol |
| M-03 | External calls in loop (Auction assets) | **INTENTIONAL DESIGN** - Buyer controls asset array |
| M-04 | Missing upper bound validation in launch params | **FIXED** - Added upfront validation mirroring Minter/Auction constructors |
| M-05 | First depositor reward capture when totalSupply=0 | **ACCEPTABLE RISK** - Unlikely scenario in practice |

### Low Severity

| ID | Finding | Resolution |
|----|---------|------------|
| L-01 | Inconsistent zero-address validation (team vs treasury) | **INTENTIONAL DESIGN** - Team/protocol can be address(0) to disable fees |
| L-02 | Empty try/catch blocks hide errors | **INTENTIONAL DESIGN** - Multicall helper; users can claim directly |
| L-03 | Multicall residual balance risk | **ACCEPTABLE RISK** - Very unlikely scenario |
| L-04 | Factory creates orphan contracts if called directly | **ACCEPTABLE** - User's responsibility |
| L-05 | Magic numbers (LP deadline) | **FIXED** - Added `LP_DEADLINE_BUFFER` constant |

### Informational

| ID | Finding | Resolution |
|----|---------|------------|
| I-01 | Centralization risk - owner privileges | **KNOWN/ACCEPTED** - By design |
| I-02 | 32 state-changing entry points identified | **DOCUMENTED** |
| I-03 | 14 unrestricted public functions | **DOCUMENTED** |
| I-04 | 6 global invariants documented | **DOCUMENTED** |

---

## Code Changes Made

### Rewarder.sol
```solidity
// Added constant
uint256 public constant MAX_REWARD_TOKENS = 10;

// Added error
error Rewarder__MaxRewardTokensReached();

// Added check in addReward()
if (rewardTokens.length >= MAX_REWARD_TOKENS) revert Rewarder__MaxRewardTokensReached();

// Updated NatSpec to document fee-on-transfer/rebase token restriction
```

### Core.sol
```solidity
// Added constants for upfront validation
uint256 public constant LP_DEADLINE_BUFFER = 20 minutes;
uint256 public constant MINTER_MIN_HALVING_PERIOD = 7 days;
uint256 public constant MINTER_MAX_INITIAL_UPS = 1e24;
uint256 public constant AUCTION_MIN_EPOCH_PERIOD = 1 hours;
uint256 public constant AUCTION_MAX_EPOCH_PERIOD = 365 days;
uint256 public constant AUCTION_MIN_PRICE_MULTIPLIER = 1.1e18;
uint256 public constant AUCTION_MAX_PRICE_MULTIPLIER = 3e18;
uint256 public constant AUCTION_ABS_MIN_INIT_PRICE = 1e6;
uint256 public constant AUCTION_ABS_MAX_INIT_PRICE = type(uint192).max;

// Added errors for validation
error Core__InvalidInitialUps();
error Core__InvalidTailUps();
error Core__InvalidHalvingPeriod();
error Core__InvalidAuctionInitPrice();
error Core__InvalidAuctionEpochPeriod();
error Core__InvalidAuctionPriceMultiplier();
error Core__InvalidAuctionMinInitPrice();
error Core__InvalidContentMinInitPrice();

// Added upfront validation in launch() - fail fast before any state changes
// Updated NatSpec to document fee-on-transfer/rebase token restriction
```

### Content.sol
```solidity
// Updated NatSpec to document fee-on-transfer/rebase token restriction
```

### IRewarder.sol
```solidity
// Added MAX_REWARD_TOKENS() to interface
```

---

## Token Restrictions

The following token types are **NOT SUPPORTED**:
- Fee-on-transfer tokens
- Rebase tokens

All tokens (DONUT, quote token, reward tokens) must be standard ERC20 implementations without transfer fees or rebasing mechanics. This is documented in the NatSpec of Core.sol, Content.sol, and Rewarder.sol.

---

## Key Metrics

### Attack Surface
- **Total Entry Points**: 32 state-changing functions
- **Public (Unrestricted)**: 14 functions
- **Role-Restricted**: 18 functions
- **Disabled Functions**: 5 (ERC721 transfers)

### Code Quality
- **Reentrancy Protection**: Good (nonReentrant on critical functions)
- **SafeERC20 Usage**: Consistent
- **Explicit Visibility**: All functions
- **Fixed Pragma**: 0.8.19
- **Upfront Validation**: Comprehensive (fail-fast pattern)

### Trust Assumptions
- DONUT/Quote tokens are standard ERC20 (no fee-on-transfer, no rebase)
- UniswapV2 Router/Factory are authentic
- Content owner is trusted (can redirect fees, add rewards up to limit)
- Core owner is trusted (can redirect protocol fees)

---

## Invariants

### Global Invariants
1. Unit minter is permanently locked to Minter contract after launch
2. Total Rewarder stake equals sum of content stakes
3. Initial LP tokens are permanently burned
4. Fee percentages sum to exactly 100%
5. Epoch IDs are strictly monotonically increasing
6. Weekly emissions follow deterministic halving schedule
7. **NEW**: Reward tokens limited to MAX_REWARD_TOKENS (10)

---

## Verification

All changes compile and tests pass:
```bash
npx hardhat compile
# Compiled successfully (evm target: paris)

npx hardhat test
# 284 passing (35s)
```

---

## Disclaimer

This audit is a point-in-time assessment based on the code provided. It does not guarantee the absence of vulnerabilities. Smart contract security is an ongoing process requiring continuous monitoring and updates.

---

## Contact

For questions about this audit, please open an issue in the repository.
