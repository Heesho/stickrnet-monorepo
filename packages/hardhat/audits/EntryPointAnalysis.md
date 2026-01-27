# Entry Point Analysis: Content Engine

**Analyzed**: January 2026
**Scope**: Full codebase (`contracts/`)
**Languages**: Solidity 0.8.19
**Focus**: State-changing functions only (view/pure excluded)
**Method**: Manual analysis (Slither not available)

## Summary

| Category | Count |
|----------|-------|
| Public (Unrestricted) | 14 |
| Role-Restricted (Owner) | 11 |
| Role-Restricted (Moderator) | 1 |
| Role-Restricted (Content) | 4 |
| Role-Restricted (Minter) | 2 |
| Contract-Only (Callbacks) | 0 |
| **Total** | **32** |

---

## Public Entry Points (Unrestricted)

State-changing functions callable by anyone - **prioritize for attack surface analysis**.

| Function | File | Notes |
|----------|------|-------|
| `launch(LaunchParams)` | `Core.sol:189` | Deploys entire ecosystem; requires DONUT approval |
| `create(address,string)` | `Content.sol:159` | Mint new content NFT; permissionless |
| `collect(address,uint256,uint256,uint256,uint256)` | `Content.sol:185` | Steal content via Dutch auction; requires quote approval |
| `claim(address)` | `Content.sol:266` | Claim accumulated fees for account |
| `getReward(address)` | `Rewarder.sol:107` | Claim all pending rewards |
| `notifyRewardAmount(address,uint256)` | `Rewarder.sol:125` | Add rewards to distribution; requires token approval |
| `buy(address[],address,uint256,uint256,uint256)` | `Auction.sol:118` | Buy treasury assets via Dutch auction |
| `updatePeriod()` | `Minter.sol:96` | Trigger weekly emission; anyone can call |
| `burn(uint256)` | `Unit.sol:65` | Burn own tokens |
| `collect(address,uint256,uint256,uint256,uint256)` | `Multicall.sol:118` | Helper for content collection |
| `buy(address,uint256,uint256,uint256)` | `Multicall.sol:151` | Helper for auction buying |
| `launch(LaunchParams)` | `Multicall.sol:169` | Helper for launching |
| `updateMinterPeriod(address)` | `Multicall.sol:211` | Helper for minter update |
| `claimRewards(address)` | `Multicall.sol:220` | Helper for claiming rewards |

---

## Role-Restricted Entry Points

### Owner (onlyOwner modifier)

Functions restricted to contract owner - high privilege operations.

| Function | File | Restriction | Impact |
|----------|------|-------------|--------|
| `setProtocolFeeAddress(address)` | `Core.sol:326` | `onlyOwner` | Redirect 1% of all fees |
| `setMinDonutForLaunch(uint256)` | `Core.sol:335` | `onlyOwner` | Control launch barrier |
| `setUri(string)` | `Content.sol:305` | `onlyOwner` | Update metadata URI |
| `setTreasury(address)` | `Content.sol:314` | `onlyOwner` | Redirect 15% treasury fees |
| `setTeam(address)` | `Content.sol:324` | `onlyOwner` | Redirect 1% team fees |
| `setIsModerated(bool)` | `Content.sol:333` | `onlyOwner` | Toggle content moderation |
| `setModerators(address[],bool)` | `Content.sol:343` | `onlyOwner` | Grant/revoke moderator status |
| `addReward(address)` | `Content.sol:368` | `onlyOwner` | Add reward tokens to Rewarder |
| `transferOwnership(address)` | inherited | `onlyOwner` | Transfer contract ownership |
| `renounceOwnership()` | inherited | `onlyOwner` | Permanently remove owner |

### Moderator (Owner or Moderator)

| Function | File | Restriction | Impact |
|----------|------|-------------|--------|
| `approveContents(uint256[])` | `Content.sol:354` | `owner \|\| accountToIsModerator[msg.sender]` | Allow content to be collected |

### Minter Role

| Function | File | Restriction | Impact |
|----------|------|-------------|--------|
| `setMinter(address)` | `Unit.sol:42` | `msg.sender == minter` | Transfer mint rights (IRREVERSIBLE once set to Minter contract) |
| `mint(address,uint256)` | `Unit.sol:55` | `msg.sender == minter` | Create new tokens |

### Content Contract Only

| Function | File | Restriction | Impact |
|----------|------|-------------|--------|
| `deposit(address,uint256)` | `Rewarder.sol:154` | `onlyContent` | Increase account stake |
| `withdraw(address,uint256)` | `Rewarder.sol:170` | `onlyContent` | Decrease account stake |
| `addReward(address)` | `Rewarder.sol:185` | `onlyContent` | Register new reward token |

---

## Restricted (Review Required)

Functions with access control patterns that need manual verification.

| Function | File | Pattern | Why Review |
|----------|------|---------|------------|
| `approveContents(uint256[])` | `Content.sol:354` | `msg.sender != owner() && !accountToIsModerator[msg.sender]` | Dynamic moderator list; owner can add unlimited moderators |
| `notifyRewardAmount(address,uint256)` | `Rewarder.sol:125` | No access control | Anyone can add rewards if they transfer tokens first |

---

## Contract-Only (Internal Integration Points)

Functions only callable by other contracts - defines trust boundaries.

| Function | File | Expected Caller | Trust Assumption |
|----------|------|-----------------|------------------|
| `deposit(address,uint256)` | `Rewarder.sol:154` | Content contract | Content verifies payment before calling |
| `withdraw(address,uint256)` | `Rewarder.sol:170` | Content contract | Content manages stake accounting |
| `addReward(address)` | `Rewarder.sol:185` | Content contract | Content owner controls reward tokens |

---

## Factory Entry Points

Factory contracts have single public functions that deploy new instances:

| Function | File | Access | Deploys |
|----------|------|--------|---------|
| `deploy(...)` | `UnitFactory.sol:20` | Public | Unit token |
| `deploy(...)` | `ContentFactory.sol:28` | Public | Content NFT |
| `deploy(...)` | `RewarderFactory.sol:18` | Public | Rewarder |
| `deploy(...)` | `MinterFactory.sol:22` | Public | Minter |
| `deploy(...)` | `AuctionFactory.sol:23` | Public | Auction |

**Note**: Factory deploy functions are public but primarily called by Core.launch(). Direct calls create orphan contracts not tracked in Core registry.

---

## Disabled Transfer Functions

Content.sol explicitly disables standard ERC721 transfer functions:

| Function | File | Status |
|----------|------|--------|
| `approve(address,uint256)` | `Content.sol:279` | DISABLED - reverts |
| `setApprovalForAll(address,bool)` | `Content.sol:283` | DISABLED - reverts |
| `transferFrom(address,address,uint256)` | `Content.sol:287` | DISABLED - reverts |
| `safeTransferFrom(address,address,uint256)` | `Content.sol:291` | DISABLED - reverts |
| `safeTransferFrom(address,address,uint256,bytes)` | `Content.sol:295` | DISABLED - reverts |

**Impact**: NFTs can only be transferred via `collect()` - enforces Dutch auction mechanism.

---

## Attack Surface Priority

### Critical (Unrestricted + High Value)
1. `Content.collect()` - Primary value transfer, fee distribution
2. `Core.launch()` - Creates entire ecosystems, handles DONUT
3. `Rewarder.notifyRewardAmount()` - Anyone can add rewards
4. `Auction.buy()` - Treasury asset extraction

### High (Unrestricted + State Modification)
1. `Content.create()` - Permissionless NFT minting
2. `Minter.updatePeriod()` - Triggers token emission
3. `Rewarder.getReward()` - Reward claims

### Medium (Role-Restricted but High Impact)
1. `Content.setTreasury()` - Redirect 15% of fees
2. `Content.addReward()` - Potential DoS via unbounded array
3. `Unit.setMinter()` - Irreversible mint rights transfer

---

## Files Analyzed

| File | State-Changing Entry Points |
|------|----------------------------|
| `Core.sol` | 3 |
| `Content.sol` | 10 |
| `Rewarder.sol` | 4 |
| `Multicall.sol` | 5 |
| `Auction.sol` | 1 |
| `Minter.sol` | 1 |
| `Unit.sol` | 4 |
| `UnitFactory.sol` | 1 |
| `ContentFactory.sol` | 1 |
| `RewarderFactory.sol` | 1 |
| `MinterFactory.sol` | 1 |
| `AuctionFactory.sol` | 1 |

---

## Analysis Warnings

- Slither not available; analysis performed manually
- Inherited OpenZeppelin functions (transferOwnership, renounceOwnership) included
- ERC20Permit signature-based approval not analyzed as separate entry point
