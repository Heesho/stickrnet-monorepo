# Trail of Bits Style Deep Context Audit Report
## Content Engine Hardhat Smart Contract System

**Audit Date:** January 2026
**Methodology:** Ultra-Granular Pure Context Building
**Auditor:** Claude Code (Trail of Bits Plugin)

---

## PHASE 1: INITIAL ORIENTATION

### 1.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE (Launchpad)                                │
│  - Orchestrates deployment of entire Content Engine ecosystem               │
│  - Holds registry of all deployed content platforms                         │
│  - Owner controls: protocolFeeAddress, minDonutForLaunch                    │
└─────────────────────┬───────────────────────────────────────────────────────┘
                      │ launch()
                      ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    DEPLOYED ECOSYSTEM                            │
    │                                                                  │
    │  ┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐ │
    │  │  UNIT   │◄────│ MINTER  │────►│ REWARDER │◄────│ CONTENT  │ │
    │  │ (ERC20) │     │         │     │          │     │ (ERC721) │ │
    │  └────┬────┘     └─────────┘     └──────────┘     └────┬─────┘ │
    │       │                                                │       │
    │       │                          ┌──────────┐          │       │
    │       └──────────────────────────│ AUCTION  │◄─────────┘       │
    │                                  │(Treasury)│                  │
    │                                  └──────────┘                  │
    └─────────────────────────────────────────────────────────────────┘
```

### 1.2 Contract Catalog

| Contract | Type | Lines | Primary Role |
|----------|------|-------|--------------|
| Core.sol | Launchpad | 349 | Deploys ecosystems, maintains registry |
| Content.sol | ERC721 NFT | 419 | Dutch auction NFT collection with staking |
| Rewarder.sol | Staking | 259 | Token reward distribution (Synthetix-style) |
| Multicall.sol | Helper | 343 | Batched operations and state aggregation |
| Auction.sol | Dutch Auction | 175 | Treasury fee collection via LP burning |
| Minter.sol | Token Emission | 148 | Bitcoin-style halving token emission |
| Unit.sol | ERC20 | 82 | Governance token with minting control |
| Factories (5) | Deployment | ~25 each | Create contract instances |

### 1.3 Key Actors Identified

| Actor | Trust Level | Access Scope |
|-------|-------------|--------------|
| **Core Owner** | Privileged | Set protocol fee address, min launch amount |
| **Content Owner** | Privileged | Set treasury, team, URI, moderators, add rewards |
| **Moderators** | Semi-Privileged | Approve content (if moderation enabled) |
| **Content Creator** | User | Create NFT, receive 3% of sale fees |
| **Content Collector** | User | Collect (steal) content via Dutch auction |
| **Launcher** | User | Deploy new content ecosystems |
| **Anyone** | Unprivileged | Call Minter.updatePeriod(), claim rewards |

### 1.4 External Dependencies

- OpenZeppelin: ERC20, ERC721, SafeERC20, Ownable, ReentrancyGuard, ERC20Votes/Permit
- Uniswap V2: Factory, Router (for LP creation and burning)

---

## PHASE 2: ULTRA-GRANULAR FUNCTION ANALYSIS

---

### 2.1 Core.sol — `launch()` Function

**Location:** `Core.sol:189-317`

#### Purpose
Orchestrates the complete deployment of a Content Engine ecosystem. Creates Unit token, seeds liquidity pool, burns LP, deploys Auction, Content, Minter, and connects all components together. This is the primary user-facing entry point for the entire protocol.

#### Inputs & Assumptions

| Parameter | Type | Assumptions |
|-----------|------|-------------|
| `params.launcher` | address | Must be non-zero; receives ownership |
| `params.donutAmount` | uint256 | >= minDonutForLaunch; transferred from msg.sender |
| `params.unitAmount` | uint256 | Must be non-zero; determines initial LP ratio |
| `params.tokenName` | string | Non-empty |
| `params.tokenSymbol` | string | Non-empty |
| `params.initialUps` | uint256 | Passed to Minter; validated there |
| `params.tailUps` | uint256 | Passed to Minter; validated there |
| `params.halvingPeriod` | uint256 | Passed to Minter; validated there |

**Implicit Inputs:**
- `msg.sender`: Must have approved `donutAmount` to Core
- `block.timestamp`: Used for LP deadline calculation

**Trust Assumptions:**
1. DONUT token is a standard ERC20 (no fee-on-transfer, no rebase)
2. UniswapV2 factory/router are authentic and behave correctly
3. All factory contracts are trusted (deployed by protocol)

#### Outputs & Effects

**State Changes:**
- `deployedContents.push(content)`
- `isDeployedContent[content] = true`
- `contentToIndex[content] = length`
- `contentToLauncher[content] = launcher`
- `contentToUnit[content] = unit`
- `contentToAuction[content] = auction`
- `contentToMinter[content] = minter`
- `contentToRewarder[content] = rewarder`
- `contentToLP[content] = lpToken`

**External Calls (in order):**
1. `IERC20(donutToken).safeTransferFrom()` - Pull DONUT from msg.sender
2. `IUnitFactory.deploy()` - Create Unit token
3. `IUnit.mint()` - Mint initial Unit for LP
4. `IERC20.safeApprove()` - Approve router (x4)
5. `IUniswapV2Router.addLiquidity()` - Create LP
6. `IUniswapV2Factory.getPair()` - Get LP address
7. `IERC20(lpToken).safeTransfer()` - Burn LP to DEAD_ADDRESS
8. `IAuctionFactory.deploy()` - Create Auction
9. `IContentFactory.deploy()` - Create Content (internally creates Rewarder)
10. `IContent.rewarder()` - Get Rewarder address
11. `IMinterFactory.deploy()` - Create Minter
12. `IUnit.setMinter()` - Transfer mint rights to Minter
13. `IContent.transferOwnership()` - Give Content to launcher

**Events:**
- `Core__Launched` with full parameter set

#### Block-by-Block Analysis

**Lines 201-206: Input Validation**
```solidity
if (params.launcher == address(0)) revert Core__InvalidLauncher();
if (params.donutAmount < minDonutForLaunch) revert Core__InsufficientDonut();
if (bytes(params.tokenName).length == 0) revert Core__EmptyTokenName();
if (bytes(params.tokenSymbol).length == 0) revert Core__EmptyTokenSymbol();
if (params.unitAmount == 0) revert Core__InvalidUnitAmount();
```

**What:** Basic input validation for required fields.
**Why here:** Fail fast before any external calls or state changes.
**Assumptions:**
- `minDonutForLaunch` is set to a reasonable non-zero value
- Empty strings are invalid but any non-empty string is valid

**First Principles:** These checks ensure the minimum viable configuration for deployment. Missing validation: no upper bound on `unitAmount` or `donutAmount`.

**5 Whys - Why no upper bound on unitAmount?**
1. Why? Allows flexibility in initial LP ratios
2. Why flexibility? Different token economics per deployment
3. Why different economics? Each content platform may have different valuations
4. Risk? Extremely large unitAmount could cause overflow in price calculations downstream

**Lines 208-209: DONUT Transfer**
```solidity
IERC20(donutToken).safeTransferFrom(msg.sender, address(this), params.donutAmount);
```

**What:** Pull DONUT from msg.sender to Core.
**Assumptions:**
- DONUT is a standard ERC20 without fee-on-transfer
- msg.sender has sufficient balance and allowance

**Risk:** If DONUT has fee-on-transfer, actual received < params.donutAmount, causing LP seeding to fail or seed with wrong ratio.

**Lines 211-215: Unit Deployment and Minting**
```solidity
unit = IUnitFactory(unitFactory).deploy(params.tokenName, params.tokenSymbol);
IUnit(unit).mint(address(this), params.unitAmount);
```

**What:** Deploy new Unit token; Core becomes initial minter and mints for LP.
**Why:** Unit token is unique per content ecosystem; initial supply seeds liquidity.
**Invariant:** After `deploy()`, Core is the minter. After `setMinter()` later, Minter is the only minter.

**Lines 217-232: LP Creation**
```solidity
IERC20(unit).safeApprove(uniswapV2Router, 0);
IERC20(unit).safeApprove(uniswapV2Router, params.unitAmount);
IERC20(donutToken).safeApprove(uniswapV2Router, 0);
IERC20(donutToken).safeApprove(uniswapV2Router, params.donutAmount);

(,, uint256 liquidity) = IUniswapV2Router(uniswapV2Router).addLiquidity(
    unit, donutToken,
    params.unitAmount, params.donutAmount,
    params.unitAmount, params.donutAmount,  // minAmounts = desired (first LP)
    address(this),
    block.timestamp + 20 minutes
);
```

**What:** Approve and add liquidity to Uniswap V2.
**Why double safeApprove?** Some tokens (USDT-like) require resetting to 0 first.
**Why minAmounts = desired?** First LP provision, no slippage possible.

**5 Hows - How could LP creation fail?**
1. How? Pair already exists with different ratio -> addLiquidity reverts on min amounts
2. How? Unit/DONUT pair was pre-created by front-runner
3. How to exploit? Front-runner creates pair with tiny amounts, then actual launch gets bad ratio
4. How impactful? Launcher loses value to front-runner
5. How to mitigate? Check if pair exists and revert, or use CREATE2 for deterministic unit address

**CRITICAL INVARIANT:** This code assumes the Unit/DONUT pair does NOT already exist. If it does, the transaction will likely revert OR seed liquidity at an adversarial ratio.

**Lines 234-236: LP Burning**
```solidity
lpToken = IUniswapV2Factory(uniswapV2Factory).getPair(unit, donutToken);
IERC20(lpToken).safeTransfer(DEAD_ADDRESS, liquidity);
```

**What:** Send initial LP tokens to burn address.
**Why:** Ensures initial liquidity is permanent (cannot be rug-pulled).
**Invariant:** `liquidity` amount of LP tokens are now permanently locked.

**Lines 238-261: Deploy Auction and Content**
```solidity
auction = IAuctionFactory(auctionFactory).deploy(...);
content = IContentFactory(contentFactory).deploy(...);
```

**What:** Deploy Auction (treasury) and Content (NFT) contracts.
**Assumption:** Factory contracts are trusted and deploy correct implementations.

**Lines 263-276: Wire Minter**
```solidity
rewarder = IContent(content).rewarder();
minter = IMinterFactory(minterFactory).deploy(unit, rewarder, ...);
IUnit(unit).setMinter(minter);
```

**What:** Get Rewarder from Content, deploy Minter pointing to it, transfer mint rights.
**Invariant:** After `setMinter(minter)`, only Minter can mint Unit tokens. This is IRREVERSIBLE because Minter has no `setMinter` function.

**Lines 278-314: Registry Update and Event**
Standard registry updates and event emission.

#### Cross-Function Dependencies

| Called Function | Contract | Risk Level |
|-----------------|----------|------------|
| `UnitFactory.deploy()` | UnitFactory | Low - simple deployment |
| `Unit.mint()` | Unit | Low - Core is initial minter |
| `Unit.setMinter()` | Unit | Medium - IRREVERSIBLE |
| `addLiquidity()` | UniswapV2Router | High - external, front-run risk |
| `ContentFactory.deploy()` | ContentFactory | Medium - deploys Rewarder internally |

#### Invariants Identified

1. **INV-CORE-1:** Each content address appears exactly once in `deployedContents`
2. **INV-CORE-2:** `isDeployedContent[content] == true` iff content was deployed by Core
3. **INV-CORE-3:** After launch, Unit's minter is permanently the Minter contract
4. **INV-CORE-4:** Initial LP tokens are burned (sent to DEAD_ADDRESS)
5. **INV-CORE-5:** No DONUT or Unit tokens remain in Core after launch

---

### 2.2 Content.sol — `collect()` Function

**Location:** `Content.sol:185-259`

#### Purpose
The primary value-capture mechanism. Allows anyone to "steal" (collect) content by paying the current Dutch auction price. Manages fee distribution (80% prev owner, 15% treasury, 3% creator, 1% team, 1% protocol) and stake management in the Rewarder.

#### Inputs & Assumptions

| Parameter | Type | Validation |
|-----------|------|------------|
| `to` | address | != address(0) |
| `tokenId` | uint256 | Must exist and be approved |
| `epochId` | uint256 | Must match current epoch (front-run protection) |
| `deadline` | uint256 | Must be >= block.timestamp |
| `maxPrice` | uint256 | Must be >= current price (slippage protection) |

**Implicit Inputs:**
- `msg.sender`: Must have approved `price` of quote token to Content
- `block.timestamp`: Determines current Dutch auction price

#### Block-by-Block Analysis

**Lines 192-198: Validation**
```solidity
if (to == address(0)) revert Content__ZeroTo();
if (!idToApproved[tokenId]) revert Content__NotApproved();
if (block.timestamp > deadline) revert Content__Expired();
if (epochId != idToEpochId[tokenId]) revert Content__EpochIdMismatch();

price = getPrice(tokenId);
if (price > maxPrice) revert Content__MaxPriceExceeded();
```

**What:** Comprehensive validation including front-run and slippage protection.
**Why epochId check?** Prevents race condition where two users try to collect same token.
**Invariant:** Token's epochId increments exactly once per collection.

**5 Whys - Why is epochId needed?**
1. Why? Two users see same price, both submit tx
2. Why problematic? First succeeds, second fails with wrong state expectations
3. Why not just rely on deadline? Price changes over time; epochId anchors to specific auction instance
4. Why use epoch vs nonce? Epoch represents discrete auction periods, semantically clearer
5. Benefit? Clean front-run protection without complex ordering logic

**Lines 200-218: State Capture and Update**
```solidity
address creator = idToCreator[tokenId];
address prevOwner = ownerOf(tokenId);
uint256 prevStake = idToStake[tokenId];

uint256 newInitPrice = price * PRICE_MULTIPLIER / PRECISION;
if (newInitPrice > ABS_MAX_INIT_PRICE) {
    newInitPrice = ABS_MAX_INIT_PRICE;
} else if (newInitPrice < minInitPrice) {
    newInitPrice = minInitPrice;
}

unchecked { idToEpochId[tokenId]++; }
idToInitPrice[tokenId] = newInitPrice;
idToStartTime[tokenId] = block.timestamp;
idToStake[tokenId] = price;
```

**What:** Capture previous state, calculate next epoch price (2x multiplier), update auction state.
**Why clamping?** Prevents overflow and ensures minimum economic activity.
**PRICE_MULTIPLIER = 2e18:** Next auction starts at 2x current sale price.

**First Principles - Price Dynamics:**
- Price decays linearly from `initPrice` to 0 over `EPOCH_PERIOD` (1 day)
- After collection at price P, next epoch starts at 2P
- Creates incentive to collect early (higher price, more stake, more rewards)
- But also risk: if no one collects, price goes to 0

**Invariant:** `idToStake[tokenId]` equals the last collection price for that token.

**Lines 220-221: NFT Transfer**
```solidity
_transfer(prevOwner, to, tokenId);
```

**What:** Transfer NFT ownership.
**Why `_transfer` not `safeTransferFrom`?** Internal function, no callback risk. Public transfer functions are disabled.

**Lines 223-245: Payment and Fee Distribution**
```solidity
if (price > 0) {
    IERC20(quote).safeTransferFrom(msg.sender, address(this), price);

    address protocol = ICore(core).protocolFeeAddress();
    uint256 prevOwnerAmount = price * PREVIOUS_OWNER_FEE / DIVISOR;      // 80%
    uint256 creatorAmount = price * CREATOR_FEE / DIVISOR;               // 3%
    uint256 teamAmount = team != address(0) ? price * TEAM_FEE / DIVISOR : 0;      // 1%
    uint256 protocolAmount = protocol != address(0) ? price * PROTOCOL_FEE / DIVISOR : 0; // 1%
    uint256 treasuryAmount = price - prevOwnerAmount - creatorAmount - teamAmount - protocolAmount; // 15% + dust

    accountToClaimable[prevOwner] += prevOwnerAmount;
    IERC20(quote).safeTransfer(creator, creatorAmount);
    IERC20(quote).safeTransfer(treasury, treasuryAmount);
    // ... conditional team and protocol transfers
```

**5 Hows - Fee Distribution Integrity:**
1. How are fees calculated? Fixed percentages of price via DIVISOR (10000)
2. How is dust handled? Treasury gets remainder (`price - others`)
3. How if team/protocol is address(0)? Their fee goes to treasury (via remainder)
4. How is prevOwner paid? Via `accountToClaimable` mapping (pull pattern)
5. Why pull pattern for prevOwner? Prevents blacklist DoS (e.g., USDC blacklist)

**Fee Breakdown:**
| Recipient | Percentage | Calculation |
|-----------|------------|-------------|
| Previous Owner | 80% | 8000/10000 |
| Treasury | ~15% | remainder |
| Creator | 3% | 300/10000 |
| Team | 1% | 100/10000 (if set) |
| Protocol | 1% | 100/10000 (if set) |

**Critical Observation:** Fee calculations use integer division. For small prices, some fees may round to 0.

**Lines 247-254: Stake Updates in Rewarder**
```solidity
IRewarder(rewarder).deposit(to, price);

if (prevStake > 0) {
    IRewarder(rewarder).withdraw(prevOwner, prevStake);
}
```

**What:** Deposit new owner's stake, withdraw previous owner's stake.
**Why this order?** Doesn't matter for correctness, but deposit-first is slightly more gas efficient in some scenarios.

**Cross-Contract Flow:**
```
Content.collect()
    -> Rewarder.deposit(newOwner, price)
        -> updateReward modifier updates earned amounts
        -> totalSupply += price
        -> accountToBalance[newOwner] += price
    -> Rewarder.withdraw(prevOwner, prevStake)
        -> updateReward modifier updates earned amounts
        -> totalSupply -= prevStake
        -> accountToBalance[prevOwner] -= prevStake
```

**Invariant:** After collect, `Rewarder.totalSupply` changes by `(price - prevStake)`.

#### Invariants Identified

1. **INV-CONTENT-1:** `idToEpochId[tokenId]` strictly increases per token
2. **INV-CONTENT-2:** `idToStake[tokenId]` equals the most recent collection price
3. **INV-CONTENT-3:** Fee percentages sum to <=100% (80+3+1+1+15=100)
4. **INV-CONTENT-4:** Creator address is immutable per token
5. **INV-CONTENT-5:** Only Content contract can call Rewarder.deposit/withdraw

---

### 2.3 Content.sol — `getPrice()` Function

**Location:** `Content.sol:413-418`

```solidity
function getPrice(uint256 tokenId) public view returns (uint256) {
    uint256 timePassed = block.timestamp - idToStartTime[tokenId];
    if (timePassed > EPOCH_PERIOD) return 0;
    uint256 initPrice = idToInitPrice[tokenId];
    return initPrice - initPrice * timePassed / EPOCH_PERIOD;
}
```

**What:** Linear Dutch auction price decay.
**Formula:** `price = initPrice * (1 - timePassed/EPOCH_PERIOD)`
**Edge cases:**
- `timePassed = 0`: price = initPrice
- `timePassed = EPOCH_PERIOD`: price = 0
- `timePassed > EPOCH_PERIOD`: price = 0

**5 Whys - Why linear decay?**
1. Why? Simple and predictable
2. Why predictable? Users can calculate exact price at future time
3. Why important? Enables MEV strategies and fair price discovery
4. Why not exponential? Linear is easier to reason about, no curve complexity
5. Trade-off? Linear gives equal time at each price point; exponential would favor early buyers more

---

### 2.4 Content.sol — `create()` Function

**Location:** `Content.sol:159-174`

```solidity
function create(address to, string memory tokenUri) external nonReentrant returns (uint256 tokenId) {
    if (to == address(0)) revert Content__ZeroTo();
    if (bytes(tokenUri).length == 0) revert Content__ZeroLengthUri();

    tokenId = ++nextTokenId;
    idToCreator[tokenId] = to;
    if (!isModerated) idToApproved[tokenId] = true;

    idToInitPrice[tokenId] = minInitPrice;
    idToStartTime[tokenId] = block.timestamp;

    _safeMint(to, tokenId);
    _setTokenURI(tokenId, tokenUri);
}
```

**What:** Mint new content NFT. Creator is the `to` address.
**Assumptions:**
- Anyone can create content (permissionless)
- Creator receives 3% of all future sales
- If moderated, content must be approved before collection

**5 Hows - Moderation Flow:**
1. How is content created? `create(to, uri)` mints to `to`
2. How if moderated? `idToApproved[tokenId] = false`
3. How to approve? Owner or moderator calls `approveContents([tokenId])`
4. How to collect unapproved? Can't - `collect()` checks `idToApproved`
5. How to bypass? Cannot; only owner/moderator can approve

**Invariant:** `idToCreator[tokenId]` is set once at creation and never changes.

---

### 2.5 Rewarder.sol — Core Mechanics

**Location:** `Rewarder.sol:1-259`

#### Purpose
Synthetix-style staking rewards distribution. Content contract controls stake deposits/withdrawals. Anyone can notify reward amounts. Distributes rewards proportionally to stake over a 7-day period.

#### Key State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `content` | address (immutable) | Only caller allowed for deposit/withdraw |
| `rewardTokens[]` | address[] | List of reward tokens |
| `tokenToRewardData` | mapping | Reward state per token |
| `totalSupply` | uint256 | Sum of all stakes |
| `accountToBalance` | mapping | Per-user stake |

#### `updateReward` Modifier — Critical Analysis

**Location:** `Rewarder.sol:68-79`

```solidity
modifier updateReward(address account) {
    for (uint256 i; i < rewardTokens.length; i++) {
        address token = rewardTokens[i];
        tokenToRewardData[token].rewardPerTokenStored = rewardPerToken(token);
        tokenToRewardData[token].lastUpdateTime = lastTimeRewardApplicable(token);
        if (account != address(0)) {
            accountToTokenToReward[account][token] = earned(account, token);
            accountToTokenToLastRewardPerToken[account][token] = tokenToRewardData[token].rewardPerTokenStored;
        }
    }
    _;
}
```

**What:** Updates global and per-account reward accounting before any state-changing operation.
**Why:** Ensures rewards are calculated based on pre-operation state.

**First Principles - Reward Distribution Math:**
```
rewardPerToken = rewardPerTokenStored + (timeDelta * rewardRate) / totalSupply
earned = balance * (rewardPerToken - lastRewardPerToken) / PRECISION + storedRewards
```

**Invariant:** After `updateReward`, all accrued rewards up to `lastTimeRewardApplicable` are captured.

**Risk Analysis - Gas Considerations:**
- Loop iterates over all reward tokens
- Content owner can add unlimited reward tokens via `addReward()`
- **Potential DoS:** If too many reward tokens added, gas exceeds block limit

#### `deposit()` Function

**Location:** `Rewarder.sol:154-163`

```solidity
function deposit(address account, uint256 amount)
    external
    onlyContent
    nonZeroInput(amount)
    updateReward(account)
{
    totalSupply = totalSupply + amount;
    accountToBalance[account] = accountToBalance[account] + amount;
    emit Rewarder__Deposited(account, amount);
}
```

**What:** Increase account's stake. Only Content can call.
**Invariant:** `sum(accountToBalance) == totalSupply` at all times.

**5 Whys - Why onlyContent?**
1. Why restricted? Stake represents "price paid" for content
2. Why not user-controlled? Users could inflate stake without paying
3. Why trust Content? Content handles payment verification
4. Why not check payment here? Separation of concerns; Content handles tokens
5. Benefit? Clean interface; Rewarder only cares about proportional distribution

#### `withdraw()` Function

**Location:** `Rewarder.sol:170-179`

```solidity
function withdraw(address account, uint256 amount)
    external
    onlyContent
    nonZeroInput(amount)
    updateReward(account)
{
    totalSupply = totalSupply - amount;
    accountToBalance[account] = accountToBalance[account] - amount;
    emit Rewarder__Withdrawn(account, amount);
}
```

**What:** Decrease account's stake. Only Content can call.
**Risk:** If `amount > accountToBalance[account]`, underflow. Solidity 0.8.19 will revert.
**Assumption:** Content always passes valid amounts (prevStake from state).

#### `notifyRewardAmount()` Function

**Location:** `Rewarder.sol:125-147`

```solidity
function notifyRewardAmount(address token, uint256 amount)
    external
    nonReentrant
    updateReward(address(0))
{
    if (!tokenToIsReward[token]) revert Rewarder__NotRewardToken();
    if (amount < DURATION) revert Rewarder__AmountSmallerThanDuration();
    uint256 leftover = left(token);
    if (amount < leftover) revert Rewarder__AmountSmallerThanLeft();

    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

    if (block.timestamp >= tokenToRewardData[token].periodFinish) {
        tokenToRewardData[token].rewardRate = amount * PRECISION / DURATION;
    } else {
        uint256 totalReward = amount + leftover;
        tokenToRewardData[token].rewardRate = totalReward * PRECISION / DURATION;
    }

    tokenToRewardData[token].lastUpdateTime = block.timestamp;
    tokenToRewardData[token].periodFinish = block.timestamp + DURATION;
}
```

**What:** Start or extend reward distribution period.
**Who can call:** Anyone (no access control).

**5 Hows - Reward Rate Calculation:**
1. How if period finished? `rewardRate = amount * PRECISION / DURATION`
2. How if period active? `rewardRate = (amount + leftover) * PRECISION / DURATION`
3. How is leftover calculated? `left() = remaining * rewardRate / PRECISION`
4. How precise? PRECISION = 1e18 to minimize rounding errors
5. How long? DURATION = 7 days fixed

**Constraint Check - `amount < leftover`:**
- Prevents "reward dilution" attack where attacker extends period with tiny amount
- Ensures reward rate doesn't decrease

**Invariants:**
1. **INV-REWARDER-1:** `rewardRate` never decreases during active period (enforced by `amount >= leftover`)
2. **INV-REWARDER-2:** `periodFinish = lastUpdateTime + DURATION` after notify
3. **INV-REWARDER-3:** Only registered tokens can receive rewards

#### `rewardPerToken()` Function

**Location:** `Rewarder.sol:219-228`

```solidity
function rewardPerToken(address token) public view returns (uint256) {
    if (totalSupply == 0) {
        return tokenToRewardData[token].rewardPerTokenStored;
    }
    return tokenToRewardData[token].rewardPerTokenStored
        + (
            (lastTimeRewardApplicable(token) - tokenToRewardData[token].lastUpdateTime)
                * tokenToRewardData[token].rewardRate
        ) / totalSupply;
}
```

**What:** Calculate accumulated reward per unit of stake.
**Edge case - totalSupply == 0:** Returns stored value (no new accumulation).

**First Principles - Division Order:**
The formula `(time * rate) / totalSupply` can cause precision loss:
- `rate` has PRECISION (1e18) multiplier
- Division by `totalSupply` at the end
- If `totalSupply` is very large relative to `(time * rate)`, result approaches 0

**5 Whys - Why check totalSupply == 0?**
1. Why? Division by zero would revert
2. Why not just let it revert? View function should always return
3. Why return stored value? No stake means no new rewards to distribute
4. Why not accrue rewards when 0 supply? No one to give them to
5. What happens to those rewards? They're "lost" - distributed to next depositors

**Potential Issue:** If rewards are notified when `totalSupply == 0`, and then someone deposits, they get ALL the rewards accumulated during that period. This is known behavior in Synthetix-style contracts but can be exploited.

---

### 2.6 Multicall.sol — Helper Functions

**Location:** `Multicall.sol:1-343`

#### Purpose
Convenience wrapper for batched operations. Simplifies UX by combining approve + action patterns and auto-claiming for previous owners.

#### `collect()` Function Analysis

**Location:** `Multicall.sol:118-141`

```solidity
function collect(
    address content,
    uint256 tokenId,
    uint256 epochId,
    uint256 deadline,
    uint256 maxPrice
) external {
    address prevOwner = IContent(content).ownerOf(tokenId);

    IERC20(quote).safeTransferFrom(msg.sender, address(this), maxPrice);
    IERC20(quote).safeApprove(content, 0);
    IERC20(quote).safeApprove(content, maxPrice);
    IContent(content).collect(msg.sender, tokenId, epochId, deadline, maxPrice);

    try IContent(content).claim(prevOwner) {} catch {}

    uint256 quoteBalance = IERC20(quote).balanceOf(address(this));
    if (quoteBalance > 0) {
        IERC20(quote).safeTransfer(msg.sender, quoteBalance);
    }
}
```

**What:** Wrapper that handles approve pattern and auto-claims for prevOwner.
**Why try/catch on claim?** prevOwner might be blacklisted on quote token.

**5 Whys - Why refund mechanism?**
1. Why? User pays maxPrice upfront, actual price may be lower
2. Why not exact price? Price is time-dependent, changes between tx submission and execution
3. Why check balance instead of calculating? Simpler, accounts for any edge cases
4. Why transfer all balance? No tokens should remain in Multicall
5. Risk? If Multicall has pre-existing balance, user gets extra tokens

**Invariant:** Multicall should have 0 token balance before and after calls (except during execution).

---

### 2.7 Auction.sol — Treasury Dutch Auction

**Location:** `Auction.sol:1-175`

#### Purpose
Collects treasury fees from Content (15% of sales) and auctions accumulated assets to anyone willing to pay in LP tokens. LP tokens are burned, creating deflationary pressure on the ecosystem.

#### `buy()` Function Analysis

**Location:** `Auction.sol:118-162`

```solidity
function buy(
    address[] calldata assets,
    address assetsReceiver,
    uint256 _epochId,
    uint256 deadline,
    uint256 maxPaymentTokenAmount
) external nonReentrant returns (uint256 paymentAmount) {
    if (block.timestamp > deadline) revert Auction__DeadlinePassed();
    if (assets.length == 0) revert Auction__EmptyAssets();
    if (_epochId != epochId) revert Auction__EpochIdMismatch();

    paymentAmount = getPrice();
    if (paymentAmount > maxPaymentTokenAmount) revert Auction__MaxPaymentAmountExceeded();

    if (paymentAmount > 0) {
        IERC20(paymentToken).safeTransferFrom(msg.sender, paymentReceiver, paymentAmount);
    }

    for (uint256 i = 0; i < assets.length; i++) {
        uint256 balance = IERC20(assets[i]).balanceOf(address(this));
        IERC20(assets[i]).safeTransfer(assetsReceiver, balance);
    }
    // ...
}
```

**What:** Buy ALL accumulated assets by paying current Dutch auction price in LP tokens.
**Key insight:** `assets` array is caller-specified. Buyer chooses which tokens to claim.

**5 Hows - Asset Claim Mechanism:**
1. How does buyer know which assets exist? Off-chain observation of Auction's balances
2. How if buyer misses an asset? They don't get it; next buyer can claim it
3. How if buyer specifies non-existent asset? `balance = 0`, `safeTransfer(0)` is no-op
4. How if multiple assets? Loop transfers each one's full balance
5. Risk? Buyer must specify ALL valuable assets or leave money on table

**Price Calculation - Same as Content:**
```solidity
function getPrice() public view returns (uint256) {
    uint256 timePassed = block.timestamp - startTime;
    if (timePassed > epochPeriod) return 0;
    return initPrice - initPrice * timePassed / epochPeriod;
}
```

**Invariants:**
1. **INV-AUCTION-1:** `epochId` increments exactly once per buy
2. **INV-AUCTION-2:** `paymentReceiver` (DEAD_ADDRESS) receives all LP payments
3. **INV-AUCTION-3:** `initPrice` after buy = `price * priceMultiplier` (clamped)

---

### 2.8 Minter.sol — Token Emission

**Location:** `Minter.sol:1-148`

#### Purpose
Implements Bitcoin-style halving emission schedule for Unit tokens. Anyone can trigger weekly minting which goes to Rewarder for distribution to content stakers.

#### `updatePeriod()` Function Analysis

**Location:** `Minter.sol:96-117`

```solidity
function updatePeriod() external returns (uint256 period) {
    period = activePeriod;
    if (block.timestamp >= period + WEEK) {
        period = (block.timestamp / WEEK) * WEEK;
        activePeriod = period;

        uint256 weekly = weeklyEmission();

        if (weekly > 0) {
            IUnit(unit).mint(address(this), weekly);
            IERC20(unit).safeApprove(rewarder, 0);
            IERC20(unit).safeApprove(rewarder, weekly);
            IRewarder(rewarder).notifyRewardAmount(unit, weekly);
        }
    }
    return period;
}
```

**What:** If a week has passed, mint new tokens and notify Rewarder.
**Who can call:** Anyone (incentive: gas cost, but MEV-irrelevant).

**5 Whys - Week Alignment:**
1. Why `(block.timestamp / WEEK) * WEEK`? Aligns to week boundaries
2. Why alignment? Prevents drift; emissions always start at consistent times
3. Why not just `activePeriod + WEEK`? Could drift if calls are late
4. Why is drift bad? Inconsistent with expected emission schedule
5. Benefit? Predictable emission times for all ecosystems

**Emission Schedule:**
```solidity
function _getUpsFromTime(uint256 time) internal view returns (uint256 ups) {
    uint256 halvings = time <= startTime ? 0 : (time - startTime) / halvingPeriod;
    ups = initialUps >> halvings;
    if (ups < tailUps) ups = tailUps;
    return ups;
}
```

**What:** Binary right shift (`>>`) divides by 2 per halving period.
**Invariant:** `ups >= tailUps` always (floor emission rate).

**Example Emission (initialUps=1e18, tailUps=1e16, halvingPeriod=365 days):**
| Year | Halvings | UPS | Weekly Emission |
|------|----------|-----|-----------------|
| 0 | 0 | 1e18 | 604800e18 |
| 1 | 1 | 0.5e18 | 302400e18 |
| 2 | 2 | 0.25e18 | 151200e18 |
| ... | ... | ... | ... |
| N | many | tailUps | tailUps * 604800 |

**Invariant:** Weekly emission is deterministic based on `block.timestamp`.

---

### 2.9 Unit.sol — Governance Token

**Location:** `Unit.sol:1-82`

#### Purpose
ERC20 with minting capability, ERC20Permit (gasless approvals), and ERC20Votes (governance).

#### `setMinter()` Function Analysis

**Location:** `Unit.sol:42-47`

```solidity
function setMinter(address _minter) external {
    if (msg.sender != minter) revert Unit__NotMinter();
    if (_minter == address(0)) revert Unit__InvalidMinter();
    minter = _minter;
    emit Unit__MinterSet(_minter);
}
```

**What:** Transfer minting rights. Only current minter can call.
**Critical property:** Once set to Minter contract (which has no `setMinter`), this is IRREVERSIBLE.

**5 Whys - Why irreversible?**
1. Why? Minter contract has no way to call `setMinter`
2. Why design this way? Ensures controlled emission schedule
3. Why not allow governance to change? Could lead to inflation attacks
4. Why trust Minter? Its emission schedule is deterministic and auditable
5. Benefit? Token holders can trust the supply schedule permanently

**Lifecycle:**
```
UnitFactory.deploy() -> Unit(minter=UnitFactory)
UnitFactory calls unit.setMinter(Core)
Core mints initial supply
Core calls unit.setMinter(Minter)
Minter is now permanent minter
```

---

## PHASE 3: GLOBAL SYSTEM UNDERSTANDING

---

### 3.1 State & Invariant Reconstruction

#### Global Invariants (Cross-Contract)

| ID | Invariant | Contracts Involved | Enforcement |
|----|-----------|-------------------|-------------|
| **G-INV-1** | Unit token's minter is permanently locked to Minter contract after launch | Unit, Core | `setMinter` only callable by current minter; Minter has no such function |
| **G-INV-2** | Total stake in Rewarder equals sum of all `idToStake[tokenId]` for active NFT owners | Content, Rewarder | Content manages deposits/withdrawals atomically with NFT transfers |
| **G-INV-3** | Initial LP tokens are burned and cannot be recovered | Core | Sent to DEAD_ADDRESS during launch |
| **G-INV-4** | Fee percentages in Content sum to exactly 100% | Content | Hardcoded constants; treasury gets remainder |
| **G-INV-5** | epochId for each token/auction is strictly monotonically increasing | Content, Auction | `unchecked { epochId++ }` in both contracts |

#### State Flow Diagram

```
                     DONUT
                       |
                       v launch()
    +------------------+------------------+
    |              CORE                    |
    |  -----------------------------------  |
    |  Creates: Unit, LP, Content,        |
    |           Rewarder, Minter, Auction |
    +------------------+------------------+
                       |
         +-------------+-------------+---------------+
         v             v             v               v
    +---------+   +---------+  +----------+   +----------+
    |  UNIT   |   | CONTENT |  | REWARDER |   | AUCTION  |
    | (ERC20) |   | (ERC721)|  | (Staking)|   |(Treasury)|
    +----+----+   +----+----+  +----+-----+   +----+-----+
         |             |            |              |
         |             | collect()  |              |
         |             +------------>              |
         |             | deposit/   |              |
         |             | withdraw   |              |
         |             |            |              |
         |             +--15% fees----------------->
         |             |                           |
         | mint()      |                           |
         <---------------------------------------------+
         |             |                           | buy()
    +----+----+        |                           |
    | MINTER  |        |                           v
    +---------+        |                     LP burned to
    |notifyRewardAmount|                     DEAD_ADDRESS
    |         +-------->
    +---------+
```

### 3.2 Workflow Reconstruction

#### Workflow 1: Content Lifecycle

```
1. Content.create(to, uri)
   -> Mint NFT to `to` (creator)
   -> idToCreator[tokenId] = to
   -> idToInitPrice[tokenId] = minInitPrice
   -> idToStartTime[tokenId] = now
   -> If moderated: idToApproved[tokenId] = false

2. [If moderated] Content.approveContents([tokenId])
   -> Owner/moderator approves
   -> idToApproved[tokenId] = true

3. Content.collect(to, tokenId, epochId, deadline, maxPrice)
   -> Verify approved, deadline, epochId, maxPrice
   -> price = getPrice(tokenId)  // Dutch auction
   -> Transfer NFT: prevOwner -> to
   -> Distribute fees: 80% claimable, 15% treasury, 3% creator, 1% team, 1% protocol
   -> Rewarder.deposit(to, price)
   -> Rewarder.withdraw(prevOwner, prevStake)
   -> Update auction state for next epoch

4. Content.claim(account)
   -> Transfer accountToClaimable[account] to account
   -> accountToClaimable[account] = 0
```

#### Workflow 2: Reward Distribution

```
1. Minter.updatePeriod() [called weekly by anyone]
   -> If week elapsed since activePeriod
   -> Calculate weeklyEmission() based on halving schedule
   -> Unit.mint(Minter, weeklyEmission)
   -> Rewarder.notifyRewardAmount(unit, weeklyEmission)

2. Rewarder.notifyRewardAmount(token, amount)
   -> Pull tokens from caller
   -> Update rewardRate for 7-day distribution
   -> Set periodFinish = now + 7 days

3. Rewarder.getReward(account)
   -> Calculate earned rewards since last claim
   -> Transfer all earned rewards to account
```

#### Workflow 3: Treasury Auction

```
1. Content.collect() distributes 15% to treasury (Auction contract)
   -> Quote tokens accumulate in Auction

2. Auction.buy(assets, receiver, epochId, deadline, maxPayment)
   -> Caller pays current Dutch auction price in LP tokens
   -> LP tokens sent to DEAD_ADDRESS (burned)
   -> All specified asset balances sent to receiver
   -> New auction epoch starts at priceMultiplier * paymentAmount
```

### 3.3 Trust Boundary Mapping

```
+-------------------------------------------------------------------------+
|                        PRIVILEGED ZONE                                   |
|  +---------------------------------------------------------------------+ |
|  |                     CORE OWNER                                      | |
|  |  * setProtocolFeeAddress() - receives 1% of all sales              | |
|  |  * setMinDonutForLaunch() - controls launch barrier                | |
|  +---------------------------------------------------------------------+ |
|                                                                          |
|  +---------------------------------------------------------------------+ |
|  |                    CONTENT OWNER                                    | |
|  |  * setTreasury() - redirect 15% fees                               | |
|  |  * setTeam() - redirect 1% fees                                    | |
|  |  * setIsModerated() - toggle moderation                            | |
|  |  * setModerators() - appoint moderators                            | |
|  |  * addReward() - add reward tokens (DoS risk)                      | |
|  +---------------------------------------------------------------------+ |
|                                                                          |
|  +---------------------------------------------------------------------+ |
|  |                      MODERATORS                                     | |
|  |  * approveContents() - allow content to be collected               | |
|  +---------------------------------------------------------------------+ |
+-------------------------------------------------------------------------+

+-------------------------------------------------------------------------+
|                        UNPRIVILEGED ZONE                                 |
|  +---------------------------------------------------------------------+ |
|  |                         USERS                                       | |
|  |  * launch() via Core - permissionless ecosystem creation           | |
|  |  * create() - permissionless content minting                       | |
|  |  * collect() - permissionless content acquisition                  | |
|  |  * claim() - permissionless fee claiming                           | |
|  |  * getReward() - permissionless reward claiming                    | |
|  |  * buy() via Auction - permissionless treasury purchase            | |
|  |  * updatePeriod() via Minter - permissionless emission trigger     | |
|  |  * notifyRewardAmount() - permissionless reward addition           | |
|  +---------------------------------------------------------------------+ |
+-------------------------------------------------------------------------+

+-------------------------------------------------------------------------+
|                        EXTERNAL DEPENDENCIES                            |
|  * UniswapV2 Factory/Router - LP creation                              |
|  * DONUT token - launch payment                                         |
|  * Quote token (USDC) - content payment                                 |
|  * OpenZeppelin - base contracts                                        |
+-------------------------------------------------------------------------+
```

### 3.4 Complexity & Fragility Clustering

#### High Complexity Areas

| Area | Complexity Factors | Risk Level |
|------|-------------------|------------|
| **Content.collect()** | Multiple state updates, fee distribution math, cross-contract calls to Rewarder | HIGH |
| **Rewarder.updateReward modifier** | Complex accounting across multiple tokens, precision-sensitive math | HIGH |
| **Core.launch()** | 13+ external calls, LP creation, ownership transfers | MEDIUM |
| **Auction.buy()** | Dynamic asset array, price calculation | MEDIUM |

#### Fragility Points

1. **Fee-on-Transfer Token Compatibility**
   - Location: Core.sol:209, Content.sol:225
   - If DONUT or quote tokens have transfer fees, accounting breaks

2. **Reward Token Array Growth**
   - Location: Rewarder.sol:69
   - Unbounded loop over rewardTokens in modifier
   - Content owner can add unlimited tokens -> DoS

3. **LP Price Manipulation**
   - Location: Core.sol:223-232
   - First LP creation is front-runnable
   - Attacker could pre-create pair at bad ratio

4. **Zero TotalSupply Reward Leakage**
   - Location: Rewarder.sol:220-221
   - Rewards notified when totalSupply=0 are given to next depositor

5. **Precision Loss in Small Prices**
   - Location: Content.sol:229-232
   - Fee calculations for very small prices may round to 0

---

## AUDIT CONTEXT SUMMARY

### Contracts Analyzed

| Contract | Status | Key Functions Analyzed |
|----------|--------|----------------------|
| Core.sol | Complete | `launch()`, `setProtocolFeeAddress()`, `setMinDonutForLaunch()` |
| Content.sol | Complete | `create()`, `collect()`, `claim()`, `getPrice()`, admin functions |
| Rewarder.sol | Complete | `deposit()`, `withdraw()`, `notifyRewardAmount()`, `getReward()`, `earned()` |
| Multicall.sol | Complete | `collect()`, `buy()`, `launch()`, view functions |
| Auction.sol | Complete | `buy()`, `getPrice()` |
| Minter.sol | Complete | `updatePeriod()`, `weeklyEmission()`, `getUps()` |
| Unit.sol | Complete | `setMinter()`, `mint()`, `burn()` |
| Factories (5) | Complete | `deploy()` functions |

### Key Invariants Documented

1. Unit minter is permanently locked after launch
2. Total Rewarder stake equals sum of content stakes
3. Initial LP tokens are permanently burned
4. Fee percentages sum to exactly 100%
5. Epoch IDs are strictly monotonically increasing
6. Weekly emissions follow deterministic halving schedule

### Risk Areas Identified for Further Investigation

| ID | Area | Location | Concern |
|----|------|----------|---------|
| R-1 | Fee-on-transfer tokens | Core.sol:209, Content.sol:225 | Accounting assumptions |
| R-2 | Unbounded reward token loop | Rewarder.sol:69 | Gas DoS potential |
| R-3 | LP front-running | Core.sol:223-232 | First LP creation |
| R-4 | Zero supply reward capture | Rewarder.sol:220 | First depositor advantage |
| R-5 | Small price precision loss | Content.sol:229-232 | Fee rounding |
| R-6 | Content owner privileges | Content.sol | Treasury/team/moderator control |

### External Call Graph

```
Core.launch() -> UnitFactory.deploy()
             -> Unit.mint()
             -> UniswapV2Router.addLiquidity()
             -> UniswapV2Factory.getPair()
             -> AuctionFactory.deploy()
             -> ContentFactory.deploy() -> RewarderFactory.deploy()
             -> MinterFactory.deploy()
             -> Unit.setMinter()
             -> Content.transferOwnership()

Content.collect() -> Rewarder.deposit()
                 -> Rewarder.withdraw()
                 -> Core.protocolFeeAddress() [view]

Minter.updatePeriod() -> Unit.mint()
                      -> Rewarder.notifyRewardAmount()

Auction.buy() -> ERC20.safeTransferFrom() [to DEAD_ADDRESS]
             -> ERC20.safeTransfer() [assets]
```

---

## CONCLUSION

This deep context audit has established a comprehensive understanding of the Content Engine smart contract system:

- **Architecture:** A modular launchpad system creating isolated content ecosystems with their own tokens, staking rewards, and treasury auctions
- **Access Control:** Two-tier privileged access (Core owner, Content owner) with well-defined boundaries
- **Economic Model:** Dutch auction pricing for content "stealing" with fee distribution and Bitcoin-style token emissions
- **Invariants:** 6 global invariants and 15+ function-level invariants documented
- **Risk Clusters:** 6 areas flagged for potential vulnerability investigation

This context provides the foundation for a subsequent vulnerability-hunting phase.
