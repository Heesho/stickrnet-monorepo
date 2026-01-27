# Sharp Edges Analysis: Content Engine

**Analyzed**: January 2026
**Focus**: API misuse potential, dangerous defaults, configuration footguns
**Principle**: "Pit of Success" - secure usage should be path of least resistance

---

## Executive Summary

| Category | Sharp Edges Found |
|----------|-------------------|
| Dangerous Defaults | 3 |
| Zero/Empty Value Footguns | 4 |
| Configuration Cliffs | 3 |
| Silent Failures | 2 |
| Type Confusion Risks | 1 |
| **Total** | **13** |

---

## Sharp Edge Analysis

### SE-01: Zero Price Collection Footgun

**Category**: Zero/Empty Value Footgun
**Severity**: Medium
**Location**: `Content.sol:224-249`

**The Pattern**:
```solidity
function collect(...) external {
    price = getPrice(tokenId);  // Can be 0 after EPOCH_PERIOD

    if (price > 0) {
        // All fee distribution happens here
        IERC20(quote).safeTransferFrom(msg.sender, address(this), price);
        // ... fee splits ...
        IRewarder(rewarder).deposit(to, price);
    }

    if (prevStake > 0) {
        IRewarder(rewarder).withdraw(prevOwner, prevStake);
    }
}
```

**The Footgun**:
When `price == 0` (after epoch expires):
1. NFT transfers for FREE
2. Previous owner loses their stake (withdrawn)
3. New owner gets NFT with 0 stake (no rewards)
4. Creator gets 0 fees
5. Treasury gets 0 fees

**5 Whys**:
1. Why can price be 0? Linear decay to 0 over EPOCH_PERIOD (1 day)
2. Why is this dangerous? Enables "steal for free" if no one collects for 24h
3. Why would no one collect? Low-value content, forgotten tokens
4. Why does this matter? Economic model breaks - no fees, no staking
5. Why not prevent 0 price? Design choice for "abandoned" content recovery

**Adversary Analysis**:
- **Scoundrel**: Wait for price to hit 0, collect valuable content for free
- **Lazy Developer**: Might not realize time-sensitivity of collections
- **Confused Developer**: Might expect minimum price floor

**Recommendation**: Consider a non-zero minimum price floor, or document this behavior prominently.

---

### SE-02: notifyRewardAmount Zero/Small Amount Edge Cases

**Category**: Zero/Empty Value Footgun
**Severity**: Medium
**Location**: `Rewarder.sol:125-147`

**The Pattern**:
```solidity
function notifyRewardAmount(address token, uint256 amount) external {
    if (amount < DURATION) revert Rewarder__AmountSmallerThanDuration();
    uint256 leftover = left(token);
    if (amount < leftover) revert Rewarder__AmountSmallerThanLeft();

    // ... calculate rewardRate ...
}
```

**Edge Case Analysis**:

| Input | Behavior | Risk |
|-------|----------|------|
| `amount = 0` | Reverts (< DURATION) | Safe |
| `amount = 604799` | Reverts (< DURATION = 604800) | Safe |
| `amount = 604800` | Accepts, rewardRate = 1e18 | Dust attack? |
| `amount < leftover` | Reverts | Prevents dilution |

**The Footgun**:
The `amount >= leftover` check prevents reward rate decrease, but allows extending periods with exact leftover amount:

```solidity
// If leftover = 100e18
notifyRewardAmount(token, 100e18);  // Accepted! Extends period, same rate
```

This could be used to "lock" rewards at a specific rate indefinitely.

**Recommendation**: Consider whether extending with exact leftover should be allowed.

---

### SE-03: addReward Unbounded Growth

**Category**: Configuration Cliff
**Severity**: High
**Location**: `Rewarder.sol:185-190`, `Content.sol:368-371`

**The Pattern**:
```solidity
// Content.sol - Owner can add unlimited rewards
function addReward(address rewardToken) external onlyOwner {
    IRewarder(rewarder).addReward(rewardToken);
}

// Rewarder.sol - No limit on array size
function addReward(address token) external onlyContent {
    if (tokenToIsReward[token]) revert Rewarder__RewardTokenAlreadyAdded();
    tokenToIsReward[token] = true;
    rewardTokens.push(token);  // Unbounded growth
}
```

**The Cliff**:
Every operation uses `updateReward` modifier which loops over ALL reward tokens:
```solidity
modifier updateReward(address account) {
    for (uint256 i; i < rewardTokens.length; i++) {  // O(n) every call
        // Multiple storage reads/writes per token
    }
    _;
}
```

**Breaking Point Calculation**:
- ~30,000 gas per token per operation
- Block gas limit ~30M
- Breaking point: ~1000 tokens
- Realistic concern: >50 tokens causes significant gas costs

**Adversary Analysis**:
- **Scoundrel (Malicious Owner)**: Add 100+ tokens, DoS all users
- **Lazy Developer**: Keep adding tokens without understanding impact
- **Confused Developer**: Expect O(1) operations

**Recommendation**: Add `MAX_REWARD_TOKENS` constant (suggest 10-20).

---

### SE-04: Team Address Zero Disables Fees Silently

**Category**: Silent Failure
**Severity**: Low
**Location**: `Content.sol:231`, `Content.sol:324`

**The Pattern**:
```solidity
function setTeam(address _team) external onlyOwner {
    team = _team;  // No zero check! Can set to address(0)
    emit Content__TeamSet(_team);
}

// In collect():
uint256 teamAmount = team != address(0) ? price * TEAM_FEE / DIVISOR : 0;
```

**The Footgun**:
Setting `team = address(0)`:
1. Silently disables team fees (1%)
2. Those fees go to treasury instead (via remainder calculation)
3. No revert, no warning
4. Could be intentional OR accidental

**Comparison with Treasury**:
```solidity
function setTreasury(address _treasury) external onlyOwner {
    if (_treasury == address(0)) revert Content__InvalidTreasury();  // Protected!
    treasury = _treasury;
}
```

**Inconsistency**: Treasury is protected, team is not.

**Recommendation**: Either:
1. Add zero check to `setTeam()` for consistency, OR
2. Document that `address(0)` is valid for disabling team fees

---

### SE-05: Protocol Fee Address Zero Behavior

**Category**: Silent Failure
**Severity**: Low
**Location**: `Core.sol:326-329`, `Content.sol:232`

**The Pattern**:
```solidity
// Core.sol
function setProtocolFeeAddress(address _protocolFeeAddress) external onlyOwner {
    protocolFeeAddress = _protocolFeeAddress;  // No zero check
    // Comment says: "Can be set to address(0) to disable protocol fees"
}

// Content.sol - collect()
address protocol = ICore(core).protocolFeeAddress();
uint256 protocolAmount = protocol != address(0) ? price * PROTOCOL_FEE / DIVISOR : 0;
```

**Analysis**: This is DOCUMENTED behavior ("Can be set to address(0) to disable").

**Status**: ACCEPTABLE - intentional design with documentation.

---

### SE-06: LaunchParams No Upper Bound Validation

**Category**: Configuration Cliff
**Severity**: Medium
**Location**: `Core.sol:189-206`

**The Pattern**:
```solidity
function launch(LaunchParams calldata params) external {
    if (params.donutAmount < minDonutForLaunch) revert Core__InsufficientDonut();
    if (params.unitAmount == 0) revert Core__InvalidUnitAmount();
    // No upper bounds!
}
```

**Missing Validations**:

| Parameter | Has Min | Has Max | Risk |
|-----------|---------|---------|------|
| `donutAmount` | Yes | No | Could overflow LP calculations |
| `unitAmount` | Yes (>0) | No | Could overflow LP calculations |
| `initialUps` | No | Yes (in Minter) | OK |
| `halvingPeriod` | Yes (in Minter) | No | Very long periods |
| `auctionEpochPeriod` | Yes (in Auction) | Yes | OK |
| `priceMultiplier` | Yes (in Auction) | Yes | OK |

**Downstream Validation**:
Some parameters ARE validated in the deployed contracts (Minter, Auction), but `donutAmount` and `unitAmount` only face LP math constraints.

**The Footgun**:
```solidity
// Extreme values could cause:
params.unitAmount = type(uint256).max;
// -> LP math overflow/revert in addLiquidity
```

**Recommendation**: Add explicit upper bounds in Core.launch() rather than relying on downstream failures.

---

### SE-07: Minter Halving Period Edge Cases

**Category**: Zero/Empty Value Footgun
**Severity**: Low
**Location**: `Minter.sol:74-76`

**The Pattern**:
```solidity
if (_halvingPeriod == 0) revert Minter__InvalidHalvingPeriod();
if (_halvingPeriod < MIN_HALVING_PERIOD) revert Minter__HalvingPeriodBelowMin();
// MIN_HALVING_PERIOD = 7 days
```

**Edge Case - Very Long Halving Period**:
```solidity
// halvingPeriod = type(uint256).max
// Result: Never halves, permanent initialUps emission
```

**Is This a Problem?**
- Economic model assumes eventual halving
- Infinite emission at initialUps could be inflationary
- But it's a launcher choice, not a security vulnerability

**Status**: ACCEPTABLE - launcher's economic decision.

---

### SE-08: EpochId Overflow (Theoretical)

**Category**: Zero/Empty Value Footgun
**Severity**: Informational
**Location**: `Content.sol:213`, `Auction.sol:152`

**The Pattern**:
```solidity
unchecked {
    idToEpochId[tokenId]++;  // or epochId++
}
```

**Analysis**:
- `uint256` can hold 2^256 - 1 values
- Would require 2^256 collections to overflow
- At 1 collection per second: 3.67 × 10^69 years
- Universe age: 1.38 × 10^10 years

**Status**: SAFE - physically impossible to overflow.

---

### SE-09: Create Function - Creator Can Be Contract

**Category**: Type Confusion Risk
**Severity**: Low
**Location**: `Content.sol:159-174`

**The Pattern**:
```solidity
function create(address to, string memory tokenUri) external returns (uint256 tokenId) {
    if (to == address(0)) revert Content__ZeroTo();
    // No check if `to` is a contract

    idToCreator[tokenId] = to;
    // Creator receives 3% of all sales via direct transfer
    IERC20(quote).safeTransfer(creator, creatorAmount);
}
```

**The Footgun**:
If creator is a contract that:
1. Cannot receive ERC20 tokens (no fallback)
2. Has receive restrictions
3. Is a contract that self-destructs

**Mitigation**: `safeTransfer` handles (1). Cases (2) and (3) are edge cases where creator loses fees - their problem.

**Status**: ACCEPTABLE - creator's responsibility to provide valid address.

---

### SE-10: Multicall Residual Balance Risk

**Category**: Silent Failure
**Severity**: Low
**Location**: `Multicall.sol:137-140`

**The Pattern**:
```solidity
function collect(...) external {
    // Transfer maxPrice in
    IERC20(quote).safeTransferFrom(msg.sender, address(this), maxPrice);

    // ... do collection ...

    // Refund unused
    uint256 quoteBalance = IERC20(quote).balanceOf(address(this));
    if (quoteBalance > 0) {
        IERC20(quote).safeTransfer(msg.sender, quoteBalance);
    }
}
```

**The Footgun**:
If Multicall has pre-existing quote token balance (from failed tx, direct transfer, etc.), the current user receives those tokens.

**Scenario**:
1. User A's tx fails after transfer, leaves 100 USDC in Multicall
2. User B calls collect()
3. User B receives their refund + User A's 100 USDC

**Likelihood**: Low - requires specific failure modes.

**Recommendation**: Consider using balance-before/balance-after pattern.

---

### SE-11: Factory Deploy Creates Orphan Contracts

**Category**: Configuration Cliff
**Severity**: Informational
**Location**: All factory contracts

**The Pattern**:
```solidity
// UnitFactory.sol
function deploy(string calldata _tokenName, string calldata _tokenSymbol) external returns (address) {
    Unit unit = new Unit(_tokenName, _tokenSymbol);
    unit.setMinter(msg.sender);
    return address(unit);
}
```

**The Footgun**:
Anyone can call factory.deploy() directly:
1. Creates functional contract
2. NOT registered in Core
3. NOT connected to ecosystem
4. Wastes gas, creates confusion

**Adversary Analysis**:
- **Scoundrel**: Could create fake "official" tokens
- **Lazy Developer**: Might call factory directly instead of Core.launch()
- **Confused Developer**: Wonders why their Unit isn't in the registry

**Recommendation**: Consider access control on factories (onlyCore) or prominently document that direct factory use creates orphan contracts.

---

### SE-12: Auction Assets Array Trust

**Category**: Type Confusion Risk
**Severity**: Low
**Location**: `Auction.sol:138-141`

**The Pattern**:
```solidity
function buy(address[] calldata assets, ...) external {
    for (uint256 i = 0; i < assets.length; i++) {
        uint256 balance = IERC20(assets[i]).balanceOf(address(this));
        IERC20(assets[i]).safeTransfer(assetsReceiver, balance);
    }
}
```

**The Footgun**:
Caller controls `assets` array completely:
1. Can include non-existent tokens (balance = 0, no-op)
2. Can include same token multiple times (second transfer = 0)
3. Can include malicious token contracts

**Scenario - Malicious Token**:
```solidity
// Attacker deploys:
contract MaliciousToken {
    function balanceOf(address) external returns (uint256) {
        // Do something malicious
        return 1e18;
    }
    function transfer(address, uint256) external returns (bool) {
        // Reentrancy? State manipulation?
        return true;
    }
}

// Attacker calls:
auction.buy([maliciousToken], attacker, ...);
```

**Mitigation**: `nonReentrant` modifier protects against reentrancy. Malicious token can only affect itself.

**Status**: ACCEPTABLE - caller chooses what to claim.

---

### SE-13: Content Moderation Toggle Race Condition

**Category**: Configuration Cliff
**Severity**: Low
**Location**: `Content.sol:333-336`, `Content.sol:165`

**The Pattern**:
```solidity
// Owner can toggle at any time
function setIsModerated(bool _isModerated) external onlyOwner {
    isModerated = _isModerated;
}

// Create checks current state
function create(address to, string memory tokenUri) external {
    // ...
    if (!isModerated) idToApproved[tokenId] = true;
    // ...
}
```

**The Race Condition**:
1. `isModerated = true`
2. User submits `create()` tx
3. Owner calls `setIsModerated(false)` (mined first)
4. User's `create()` executes with `isModerated = false`
5. Content is auto-approved, contrary to user's expectation

**Impact**: Low - content gets approved, which is typically desired.

**Reverse Scenario** (worse):
1. `isModerated = false`
2. User expects auto-approval
3. Owner enables moderation
4. User's content requires approval unexpectedly

**Recommendation**: Document that moderation state can change between tx submission and execution.

---

## Severity Summary

| ID | Category | Severity | Status |
|----|----------|----------|--------|
| SE-01 | Zero Price | Medium | Document/Consider floor |
| SE-02 | Reward Amount | Medium | Consider edge case |
| SE-03 | Unbounded Array | **High** | **Add limit** |
| SE-04 | Team Zero | Low | Add consistency |
| SE-05 | Protocol Zero | Low | Documented - OK |
| SE-06 | No Upper Bounds | Medium | Add validation |
| SE-07 | Halving Period | Low | Acceptable |
| SE-08 | EpochId Overflow | Info | Safe |
| SE-09 | Creator Contract | Low | Acceptable |
| SE-10 | Residual Balance | Low | Consider fix |
| SE-11 | Orphan Contracts | Info | Document |
| SE-12 | Assets Array | Low | Acceptable |
| SE-13 | Moderation Toggle | Low | Document |

---

## Recommendations Priority

### Must Fix
1. **SE-03**: Add `MAX_REWARD_TOKENS` limit to prevent DoS

### Should Fix
2. **SE-01**: Document zero-price behavior or add minimum
3. **SE-06**: Add upper bound validation in Core.launch()

### Consider
4. **SE-04**: Add zero check to setTeam() for consistency
5. **SE-10**: Use balance-before/after pattern in Multicall
6. **SE-11**: Add access control to factories or document orphan risk

---

## Pit of Success Evaluation

| Aspect | Score | Notes |
|--------|-------|-------|
| Secure Defaults | 7/10 | Most defaults are safe; team/protocol zero is intentional |
| Impossible to Misuse | 5/10 | Several footguns exist (unbounded array, zero price) |
| Clear Error Messages | 8/10 | Custom errors are descriptive |
| Type Safety | 8/10 | Uses appropriate types; some address validation missing |
| Fail-Safe Behavior | 6/10 | Some silent failures (empty catch blocks) |

**Overall**: The codebase follows good practices but has several sharp edges that could lead to operational issues. The most critical is the unbounded reward token array which could cause a protocol-wide DoS.
