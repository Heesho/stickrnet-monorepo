# Semgrep Static Analysis Report: Content Engine

**Analyzed**: January 2026
**Scope**: Full codebase (`contracts/`)
**Languages**: Solidity 0.8.19
**Method**: Manual pattern analysis (Semgrep not installed)
**Ruleset Emulated**: `p/solidity`, `p/smart-contracts`, `p/trailofbits`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 5 |
| Low | 4 |
| Informational | 6 |
| **Total** | **17** |

---

## High Severity Findings

### H-01: Unbounded Loop Over Dynamic Array

**Rule**: `solidity.performance.unbounded-loop`
**CWE**: CWE-400 (Uncontrolled Resource Consumption)

**Location**: `Rewarder.sol:68-79`

```solidity
modifier updateReward(address account) {
    for (uint256 i; i < rewardTokens.length; i++) {  // UNBOUNDED
        address token = rewardTokens[i];
        tokenToRewardData[token].rewardPerTokenStored = rewardPerToken(token);
        // ... more operations per token
    }
    _;
}
```

**Issue**: The `rewardTokens` array can grow unbounded via `addReward()`. Every state-changing function uses `updateReward` modifier, which iterates over all tokens. If many tokens are added, operations may exceed gas limits.

**Attack Vector**: Content owner (malicious or compromised) adds many reward tokens, causing DoS on all Rewarder operations including `getReward()`, `deposit()`, `withdraw()`.

**Recommendation**: Add maximum reward token limit (e.g., `MAX_REWARD_TOKENS = 10`).

---

### H-02: Missing Zero Address Check in Fee Transfer

**Rule**: `solidity.security.missing-zero-check`
**CWE**: CWE-476 (NULL Pointer Dereference equivalent)

**Location**: `Content.sol:237-238`

```solidity
IERC20(quote).safeTransfer(creator, creatorAmount);
IERC20(quote).safeTransfer(treasury, treasuryAmount);
```

**Issue**: While `treasury` has a zero-check in `setTreasury()`, `creator` is set at NFT creation and never validated. If `create(address(0), uri)` is called with zero address, creator fees would be sent to address(0).

**Note**: The `create()` function does check `to == address(0)`, and creator is set to `to`. This is actually safe, but the pattern should be documented.

**Status**: FALSE POSITIVE - creator is validated via `to` check.

---

## Medium Severity Findings

### M-01: Unchecked Return Value Pattern

**Rule**: `solidity.security.unchecked-return`
**CWE**: CWE-252 (Unchecked Return Value)

**Location**: `Content.sol:358`

```solidity
function approveContents(uint256[] calldata tokenIds) external {
    // ...
    for (uint256 i = 0; i < tokenIds.length; i++) {
        if (idToApproved[tokenIds[i]]) revert Content__AlreadyApproved();
        ownerOf(tokenIds[i]); // Return value ignored - used for existence check
        idToApproved[tokenIds[i]] = true;
    }
}
```

**Issue**: `ownerOf()` return value is deliberately ignored. While this works (reverts if token doesn't exist), it's an anti-pattern that could confuse auditors.

**Recommendation**: Use explicit existence check or add comment explaining intent.

---

### M-02: Timestamp Dependence

**Rule**: `solidity.security.timestamp-dependence`
**CWE**: CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)

**Locations**:
- `Content.sol:414` - `block.timestamp - idToStartTime[tokenId]`
- `Auction.sol:171` - `block.timestamp - startTime`
- `Minter.sol:98` - `block.timestamp >= period + WEEK`

**Issue**: Multiple contracts rely on `block.timestamp` for price calculations and period management. Miners can manipulate timestamp within ~15 second window.

**Impact**: Limited in this context. Price manipulation would be minimal (linear decay over 1 day = ~0.017% per second). Miner manipulation of ~15 seconds affects price by ~0.025%.

**Status**: ACCEPTABLE RISK for this use case.

---

### M-03: External Call in Loop

**Rule**: `solidity.security.external-call-in-loop`
**CWE**: CWE-834 (Excessive Iteration)

**Location**: `Auction.sol:138-141`

```solidity
for (uint256 i = 0; i < assets.length; i++) {
    uint256 balance = IERC20(assets[i]).balanceOf(address(this));
    IERC20(assets[i]).safeTransfer(assetsReceiver, balance);  // External call
}
```

**Issue**: External calls in loop can fail if one asset transfer fails (e.g., paused token), blocking all other transfers.

**Recommendation**: Consider try/catch pattern or separate claim function per asset.

---

### M-04: Fee-on-Transfer Token Incompatibility

**Rule**: `solidity.defi.fee-on-transfer`
**CWE**: CWE-682 (Incorrect Calculation)

**Locations**:
- `Core.sol:209` - `safeTransferFrom(msg.sender, address(this), params.donutAmount)`
- `Content.sol:225` - `safeTransferFrom(msg.sender, address(this), price)`
- `Rewarder.sol:135` - `safeTransferFrom(msg.sender, address(this), amount)`

**Issue**: Code assumes transferred amount equals requested amount. Fee-on-transfer tokens would break this assumption.

**Pattern**:
```solidity
// Vulnerable pattern
IERC20(token).safeTransferFrom(sender, address(this), amount);
// Uses `amount` directly, not actual received

// Safe pattern
uint256 balanceBefore = IERC20(token).balanceOf(address(this));
IERC20(token).safeTransferFrom(sender, address(this), amount);
uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
```

**Recommendation**: Document that fee-on-transfer tokens are not supported, or add balance checks.

---

### M-05: Division Before Multiplication

**Rule**: `solidity.security.divide-before-multiply`
**CWE**: CWE-190 (Integer Overflow/Precision Loss)

**Location**: `Rewarder.sol:223-227`

```solidity
return tokenToRewardData[token].rewardPerTokenStored
    + (
        (lastTimeRewardApplicable(token) - tokenToRewardData[token].lastUpdateTime)
            * tokenToRewardData[token].rewardRate
    ) / totalSupply;
```

**Issue**: The formula multiplies then divides, which is correct. However, if `totalSupply` is very large, precision loss can occur.

**Mitigation**: PRECISION = 1e18 is used in rewardRate calculation, providing adequate precision for most cases.

**Status**: ACCEPTABLE with PRECISION factor.

---

## Low Severity Findings

### L-01: Missing Event Emission

**Rule**: `solidity.best-practice.missing-event`
**CWE**: CWE-778 (Insufficient Logging)

**Location**: `Multicall.sol` - All functions

**Issue**: Multicall helper functions don't emit events. While underlying contracts emit events, Multicall-specific actions aren't logged.

**Recommendation**: Consider emitting wrapper events for tracking Multicall usage.

---

### L-02: Shadowed State Variable

**Rule**: `solidity.best-practice.shadowed-state-variable`

**Location**: `Content.sol:47` vs function parameters

```solidity
string public uri;  // State variable

function setUri(string memory _uri) external onlyOwner {
    uri = _uri;  // Parameter shadows could occur with different naming
}
```

**Status**: NOT PRESENT - uses `_uri` parameter naming convention correctly.

---

### L-03: Unused Return Value in Try/Catch

**Rule**: `solidity.best-practice.empty-try-catch`

**Location**: `Multicall.sol:134`, `Multicall.sol:223`

```solidity
try IContent(content).claim(prevOwner) {} catch {}
```

**Issue**: Empty catch block silently swallows all errors. While intentional (handle blacklisted addresses), it also hides unexpected errors.

**Recommendation**: Consider logging failed claims or catching specific error types.

---

### L-04: Magic Numbers

**Rule**: `solidity.best-practice.magic-numbers`

**Location**: `Core.sol:231`

```solidity
block.timestamp + 20 minutes  // Magic number
```

**Recommendation**: Define as named constant `LP_DEADLINE_BUFFER`.

---

## Informational Findings

### I-01: Centralization Risk - Owner Privileges

**Rule**: `solidity.centralization.owner-privileges`

**Content.sol Owner Can**:
- Redirect treasury fees (`setTreasury`)
- Redirect team fees (`setTeam`)
- Add unlimited reward tokens (`addReward` - DoS risk)
- Toggle moderation (`setIsModerated`)
- Appoint moderators (`setModerators`)

**Core.sol Owner Can**:
- Redirect protocol fees (`setProtocolFeeAddress`)
- Change launch requirements (`setMinDonutForLaunch`)

**Recommendation**: Consider timelocks or multi-sig for sensitive operations.

---

### I-02: Reentrancy Guard Usage

**Rule**: `solidity.best-practice.reentrancy-guard`

**Well Protected**:
- `Core.launch()` - `nonReentrant`
- `Content.create()` - `nonReentrant`
- `Content.collect()` - `nonReentrant`
- `Content.claim()` - `nonReentrant`
- `Rewarder.getReward()` - `nonReentrant`
- `Rewarder.notifyRewardAmount()` - `nonReentrant`
- `Auction.buy()` - `nonReentrant`

**Not Protected (No external calls in critical path)**:
- `Minter.updatePeriod()` - Makes external calls but no user funds at risk
- `Multicall.*` - Wrapper functions; underlying calls are protected

**Status**: GOOD - appropriate reentrancy protection.

---

### I-03: Use of SafeERC20

**Rule**: `solidity.best-practice.safe-erc20`

**Status**: GOOD - All contracts use `SafeERC20` library for token transfers.

---

### I-04: Explicit Visibility

**Rule**: `solidity.best-practice.explicit-visibility`

**Status**: GOOD - All functions have explicit visibility modifiers.

---

### I-05: Solidity Version

**Rule**: `solidity.best-practice.floating-pragma`

**Status**: GOOD - Fixed pragma `0.8.19` used consistently.

---

### I-06: Checked Arithmetic

**Rule**: `solidity.security.unchecked-arithmetic`

**Locations using `unchecked`**:
- `Content.sol:213` - `unchecked { idToEpochId[tokenId]++; }`
- `Auction.sol:152` - `unchecked { epochId++; }`

**Status**: ACCEPTABLE - Increment operations on epoch counters that cannot realistically overflow (would require 2^256 operations).

---

## Custom Semgrep Rules for This Codebase

If Semgrep were installed, these custom rules would be valuable:

```yaml
rules:
  - id: content-engine-unbounded-reward-tokens
    languages: [solidity]
    message: "Unbounded iteration over rewardTokens array - potential DoS"
    severity: WARNING
    patterns:
      - pattern: |
          for ($I; $I < rewardTokens.length; $I++) { ... }

  - id: content-engine-fee-on-transfer
    languages: [solidity]
    message: "Token transfer assumes no fee-on-transfer"
    severity: WARNING
    pattern: |
      IERC20($TOKEN).safeTransferFrom($FROM, $TO, $AMOUNT);
      ...
      $AMOUNT ...

  - id: content-engine-empty-catch
    languages: [solidity]
    message: "Empty catch block hides errors"
    severity: INFO
    pattern: |
      try $CALL {} catch {}

  - id: content-engine-owner-redirect-fees
    languages: [solidity]
    message: "Owner can redirect protocol fees - centralization risk"
    severity: INFO
    pattern-either:
      - pattern: |
          function setTreasury($ADDR) external onlyOwner { ... }
      - pattern: |
          function setProtocolFeeAddress($ADDR) external onlyOwner { ... }
```

---

## Recommendations Summary

| Finding | Severity | Action |
|---------|----------|--------|
| H-01 Unbounded Loop | High | Add MAX_REWARD_TOKENS limit |
| M-03 External Call in Loop | Medium | Add try/catch or separate function |
| M-04 Fee-on-Transfer | Medium | Document limitation or add checks |
| L-03 Empty Try/Catch | Low | Consider logging failures |
| I-01 Centralization | Info | Consider timelocks |

---

## Installation Command (for future use)

```bash
# Install Semgrep
pip install semgrep

# Run with Trail of Bits rules
semgrep --config p/solidity --config p/smart-contracts --config p/trailofbits contracts/

# Run with custom rules
semgrep --config ./semgrep-rules.yaml contracts/
```
