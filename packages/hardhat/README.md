# Content Engine

A decentralized content monetization platform where creators publish content as NFTs and collectors "steal" them through Dutch auctions, earning rewards based on their stake.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
  - [For Creators](#for-creators)
  - [For Collectors](#for-collectors)
  - [The "Steal" Mechanic](#the-steal-mechanic)
  - [Dutch Auction Pricing](#dutch-auction-pricing)
  - [Earning Rewards](#earning-rewards)
- [Core Concepts](#core-concepts)
  - [Stake-Based Rewards](#stake-based-rewards)
  - [Bitcoin-Style Halving](#bitcoin-style-halving)
  - [Fee Distribution](#fee-distribution)
  - [Moderation System](#moderation-system)
- [Smart Contracts](#smart-contracts)
  - [Core.sol](#coresol)
  - [Content.sol](#contentsol)
  - [ContentFactory.sol](#contentfactorysol)
  - [Unit.sol](#unitsol)
  - [UnitFactory.sol](#unitfactorysol)
  - [Minter.sol](#mintersol)
  - [MinterFactory.sol](#minterfactorysol)
  - [Rewarder.sol](#rewardersol)
  - [RewarderFactory.sol](#rewarderfactorysol)
  - [Auction.sol](#auctionsol)
  - [AuctionFactory.sol](#auctionfactorysol)
  - [Multicall.sol](#multicallsol)
- [Architecture Diagram](#architecture-diagram)
- [Token Economics](#token-economics)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Deployment](#deployment)
  - [Configuration](#configuration)
- [Integration Guide](#integration-guide)
  - [Creating Content](#creating-content)
  - [Collecting Content](#collecting-content)
  - [Claiming Rewards](#claiming-rewards)
- [Testing](#testing)
- [Security](#security)
  - [Audit Summary](#audit-summary)
  - [Security Features](#security-features)
  - [Protected Parameters](#protected-parameters)
- [License](#license)

---

## Overview

Content Engine is a revolutionary platform that turns content into collectible assets. Here's the basic idea:

1. **Creators** publish content as NFTs (articles, art, videos, etc.)
2. **Collectors** can "steal" content by paying a Dutch auction price
3. **Previous owners** receive 80% of what the new collector pays
4. **Everyone** earns rewards based on how much they've paid for content

Think of it like a game where content continuously changes hands, and holding valuable content earns you rewards over time.

**Key Benefits:**
- **For Creators**: Earn 2% every time your content changes hands, forever
- **For Collectors**: Earn rewards proportional to your stake, plus 80% when someone steals from you
- **For Teams**: Earn 2% of all collections as the platform launcher
- **For the Platform**: 15% goes to treasury, fueling ecosystem growth

---

## How It Works

### For Creators

Creating content is simple:

1. **Call `create()`** on the Content contract with:
   - Your address (you become the creator)
   - A token URI pointing to your content metadata (IPFS, Arweave, etc.)

2. **Your content becomes an NFT** that can be collected

3. **Earn 2% forever** every time your content changes hands

```
Creator publishes content
        |
        v
NFT is minted to creator
        |
        v
Content is now collectible
        |
        v
Every collection = 2% to creator
```

### For Collectors

Collecting content works like this:

1. **Browse available content** and check current prices
2. **Call `collect()`** to "steal" content you want
3. **The content is yours** until someone steals it from you
4. **Earn rewards** based on your stake (the price you paid)
5. **When someone steals from you**, you get 80% of what they paid

### The "Steal" Mechanic

This is what makes Content Engine unique. Unlike normal NFT ownership where you buy and hold, content can always be "stolen":

```
Alice creates content (owns it for free)
        |
        v
Bob pays 1 ETH to steal it from Alice
Alice receives: 0.8 ETH (80% of Bob's payment)
Bob now owns the content, stake = 1 ETH
        |
        v
Charlie pays 2 ETH to steal it from Bob
Bob receives: 1.6 ETH (80% of Charlie's payment)
Charlie now owns the content, stake = 2 ETH
        |
        v
And so on...
```

**Why would you want your content stolen?**
- You get 80% of the next person's payment
- If the price goes up, you profit!
- You also earn rewards while holding based on your stake

### Dutch Auction Pricing

The price of collecting content follows a Dutch auction:

```
Price
  |
  |  2.0 ETH ████
  |               ███
  |                  ███
  |                     ███
  |                        ███
  |                           ███ → 0
  |_________________________________ Time
       Start                30 days
```

**How it works:**
- Price starts at 2x the last collection price
- Price linearly decays to 0 over 30 days (EPOCH_PERIOD)
- After 30 days, content can be collected for free

**Formula:**
```
Current Price = Initial Price × (1 - Time Elapsed / 30 days)
```

**Why Dutch auctions?**
- **No sniping**: Being first means paying MORE, not less
- **Fair pricing**: Price naturally settles at market value
- **No bidding wars**: Just decide when the price is right for you

### Earning Rewards

There are two types of rewards in Content Engine:

1. **Quote Token Rewards (WETH)**
   - Come from external sources sent to the Content contract
   - Distributed proportionally to stakeholders

2. **Unit Token Rewards**
   - The platform's native token
   - Minted through the Minter contract with halving schedule
   - Distributed to content collectors based on their stake

**Your share of rewards = Your Stake / Total Stakes**

Example:
```
Total stakes in Content: 100 ETH
Your stake: 5 ETH
Your share: 5%

If 10 ETH in rewards are distributed:
You receive: 0.5 ETH
```

---

## Core Concepts

### Stake-Based Rewards

When you collect content, the price you pay becomes your "stake":

- **Stake** = The price you paid to collect the content
- **Total Supply** = Sum of all stakes across all content
- **Your Rewards** = (Your Stake / Total Supply) × Reward Amount

The Rewarder contract uses a Synthetix-style algorithm for efficient reward distribution:
- Rewards accumulate over time (7-day distribution period)
- Claim anytime via the Rewarder contract
- No gas costs for distribution, only for claiming

### Bitcoin-Style Halving

Unit token emissions follow a Bitcoin-like halving schedule:

```
Period 1 (Days 1-30):    Initial Rate     (e.g., 100 UNIT/sec)
Period 2 (Days 31-60):   50% of Initial   (e.g., 50 UNIT/sec)
Period 3 (Days 61-90):   25% of Initial   (e.g., 25 UNIT/sec)
Period 4 (Days 91-120):  12.5% of Initial (e.g., 12.5 UNIT/sec)
...continues until tail emission rate
```

This creates:
- **Scarcity**: Total supply is bounded
- **Early Incentive**: Higher rewards for early participants
- **Sustainability**: Tail emissions ensure ongoing rewards

### Fee Distribution

When content is collected, the payment is split:

| Recipient | Percentage | Description |
|-----------|------------|-------------|
| Previous Owner | 80% | Reward for holding content |
| Treasury | 15% | Funds ecosystem via Auction |
| Creator | 2% | Ongoing royalty for content creator |
| Team | 2% | Platform/launcher team fee |
| Protocol | 1% | Platform maintenance fee |

**Example with 1 ETH collection:**
```
Previous Owner: 0.80 ETH
Treasury:       0.15 ETH
Creator:        0.02 ETH
Team:           0.02 ETH
Protocol:       0.01 ETH
```

### Moderation System

Content contracts can operate in two modes:

**Unmoderated Mode (Default for some deployments):**
- All content is immediately collectible
- Anyone can create and collect
- Fully permissionless

**Moderated Mode:**
- New content requires moderator approval before collection
- Moderators are set by the contract owner
- Protects against spam/inappropriate content
- Content creators can still create, but collection is blocked until approved

```
isModerated = true:
Creator -> Create Content -> [Pending] -> Moderator Approves -> [Collectible]

isModerated = false:
Creator -> Create Content -> [Immediately Collectible]
```

---

## Smart Contracts

### Core.sol

**Purpose**: Central orchestrator and registry for the entire system.

**Key Responsibilities:**
- Launch new content ecosystems
- Store configuration parameters
- Maintain protocol fee address
- Register all deployed contracts

**Key Functions:**
```solidity
// Launch a new content ecosystem
function launch(LaunchParams calldata params) external returns (
    address unit,
    address minter,
    address auction,
    address content
);
```

**LaunchParams:**
| Parameter | Description |
|-----------|-------------|
| `launcher` | Owner of deployed contracts |
| `name` | Token name |
| `symbol` | Token symbol |
| `uri` | Metadata URI |
| `contentName` | NFT collection name |
| `contentSymbol` | NFT collection symbol |
| `contentUri` | NFT collection metadata URI |
| `isModerated` | Whether content requires approval |
| `initialUps` | Initial Unit emission rate |
| `tailUps` | Minimum emission rate |
| `halvingPeriod` | Time between halvings |
| `contentMinInitPrice` | Minimum auction starting price |
| `auctionInitPrice` | Treasury auction starting price |
| `auctionMinInitPrice` | Treasury auction floor price |
| `auctionEpochPeriod` | Treasury auction duration |
| `auctionPriceMultiplier` | Treasury auction price increase |

---

### Content.sol

**Purpose**: ERC721 NFT contract where content lives and can be collected.

**Key Features:**
- Content creation by anyone
- Dutch auction collection mechanism
- Stake tracking for rewards
- Disabled transfers (only collect() works)
- Moderation support

**Key Functions:**
```solidity
// Create new content
function create(address to, string memory tokenUri) external returns (uint256 tokenId);

// Collect (steal) content
function collect(
    address to,
    uint256 tokenId,
    uint256 epochId,      // Frontrun protection
    uint256 deadline,     // Transaction deadline
    uint256 maxPrice      // Slippage protection
) external returns (uint256 price);

// Distribute rewards to Rewarder
function distribute() external;

// Get current price for content
function getPrice(uint256 tokenId) external view returns (uint256);
```

**Events:**
```solidity
event Content__Created(address indexed who, address indexed to, uint256 indexed tokenId, string uri);
event Content__Collected(address indexed who, address indexed to, uint256 indexed tokenId, uint256 epochId, uint256 price);
event Content__Distributed(uint256 quoteAmount, uint256 unitAmount);
```

**Constants:**
| Constant | Value | Description |
|----------|-------|-------------|
| `PREVIOUS_OWNER_FEE` | 8000 (80%) | Fee to previous owner |
| `TREASURY_FEE` | 1500 (15%) | Fee to treasury |
| `CREATOR_FEE` | 200 (2%) | Fee to creator |
| `TEAM_FEE` | 200 (2%) | Fee to team |
| `PROTOCOL_FEE` | 100 (1%) | Fee to protocol |
| `EPOCH_PERIOD` | 30 days | Dutch auction duration |
| `PRICE_MULTIPLIER` | 2e18 (2x) | Price increase per epoch |

---

### ContentFactory.sol

**Purpose**: Factory contract for deploying new Content contracts.

**Key Functions:**
```solidity
// Deploy a new Content contract
function deploy(
    string memory name,
    string memory symbol,
    string memory uri,
    address unit,
    address quote,
    address treasury,
    address core,
    uint256 minInitPrice,
    bool isModerated
) external returns (address content);
```

---

### Unit.sol

**Purpose**: ERC20 reward token with controlled minting.

**Key Features:**
- Only the designated minter can mint tokens
- Minter is set once and cannot be changed
- Standard ERC20 functionality

**Key Functions:**
```solidity
// Set the minter address (one-time)
function setMinter(address _minter) external;

// Mint tokens (only minter)
function mint(address to, uint256 amount) external;
```

---

### UnitFactory.sol

**Purpose**: Factory contract for deploying new Unit tokens.

**Key Functions:**
```solidity
// Deploy a new Unit token
function deploy(
    string memory name,
    string memory symbol,
    string memory uri,
    address owner
) external returns (address unit);
```

---

### Minter.sol

**Purpose**: Bitcoin-style halving emission controller.

**Key Features:**
- Calculates current emission rate based on halving schedule
- Mints tokens to a designated receiver
- Tracks last mint time for accurate emissions
- Owned by Content contract for permission control

**Key Functions:**
```solidity
// Mint accumulated emissions
function mint() external returns (uint256 amount);

// Get current emission rate (units per second)
function getUps() external view returns (uint256);

// Get pending mintable amount
function getPendingMint() external view returns (uint256);
```

**Halving Calculation:**
```solidity
function getUps() public view returns (uint256) {
    uint256 timePassed = block.timestamp - startTime;
    uint256 halvings = timePassed / halvingPeriod;
    if (halvings > 64) return tailUps;
    uint256 ups = initialUps >> halvings;  // Divide by 2^halvings
    return ups > tailUps ? ups : tailUps;
}
```

---

### MinterFactory.sol

**Purpose**: Factory contract for deploying new Minter contracts.

**Key Functions:**
```solidity
// Deploy a new Minter
function deploy(
    address unit,
    address receiver,
    uint256 initialUps,
    uint256 tailUps,
    uint256 halvingPeriod
) external returns (address minter);
```

---

### Rewarder.sol

**Purpose**: Synthetix-style staking rewards distributor.

**Key Features:**
- Tracks stakes for each user
- Distributes multiple reward tokens
- 7-day reward distribution period
- Efficient O(1) reward calculation

**Key Functions:**
```solidity
// Called by Content when stake changes
function deposit(address account, uint256 amount) external;
function withdraw(address account, uint256 amount) external;

// Users claim their rewards
function getReward(address account) external;

// Content contract notifies new rewards
function notifyRewardAmount(address rewardToken, uint256 amount) external;

// Add a new reward token
function addReward(address rewardToken) external;

// View functions
function earned(address account, address rewardToken) external view returns (uint256);
function left(address rewardToken) external view returns (uint256);
```

**Reward Calculation:**
```
rewardPerToken += (rewardRate * timeDelta * 1e18) / totalSupply
earned = balance * (rewardPerToken - userRewardPerTokenPaid) / 1e18 + storedRewards
```

---

### RewarderFactory.sol

**Purpose**: Factory contract for deploying new Rewarder contracts.

**Key Functions:**
```solidity
// Deploy a new Rewarder
function deploy(address stakingToken) external returns (address rewarder);
```

---

### Auction.sol

**Purpose**: Dutch auction for treasury assets.

**Key Features:**
- Burns LP tokens (or other payment tokens) as payment
- Distributes accumulated treasury assets
- Dutch auction pricing with configurable parameters

**Key Functions:**
```solidity
// Buy treasury assets via auction
function buy(
    address[] calldata assets,
    address assetsReceiver,
    uint256 epochId,
    uint256 deadline,
    uint256 maxPaymentTokenAmount
) external returns (uint256 paymentAmount);

// View current price
function getPrice() external view returns (uint256);
```

---

### AuctionFactory.sol

**Purpose**: Factory contract for deploying new Auction contracts.

**Key Functions:**
```solidity
// Deploy a new Auction
function deploy(
    address paymentToken,
    uint256 initPrice,
    uint256 minInitPrice,
    uint256 epochPeriod,
    uint256 priceMultiplier
) external returns (address auction);
```

---

### Multicall.sol

**Purpose**: Helper contract for batching operations and ETH wrapping.

**Key Features:**
- Wrap ETH to WETH automatically
- Batch multiple operations
- Query contract states efficiently

**Key Functions:**
```solidity
// Collect content with ETH (auto-wraps)
function collect(
    address content,
    uint256 tokenId,
    uint256 epochId,
    uint256 deadline,
    uint256 maxPrice
) external payable;

// Get Content state
function getContent(
    address content,
    uint256[] calldata tokenIds,
    address account
) external view returns (ContentState memory);

// Get Auction state
function getAuction(
    address auction,
    address account
) external view returns (AuctionState memory);

// Get Minter state
function getMinter(address minter) external view returns (MinterState memory);
```

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                      CORE                            │
                    │            (Orchestrator & Registry)                 │
                    └────────────────────────┬────────────────────────────┘
                                             │
         ┌──────────────┬────────────────────┼────────────────────┬──────────────┐
         │              │                    │                    │              │
         ▼              ▼                    ▼                    ▼              ▼
┌─────────────┐ ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ ┌─────────────┐
│ UnitFactory │ │MinterFactory│    │ContentFactory│   │AuctionFactory│ │RewarderFactory│
└──────┬──────┘ └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ └──────┬──────┘
       │               │                  │                  │              │
       ▼               ▼                  ▼                  ▼              ▼
┌─────────────┐ ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ ┌─────────────┐
│    Unit     │ │   Minter    │    │   Content   │    │   Auction   │ │  Rewarder   │
│  (ERC20)    │ │ (Emissions) │    │   (NFTs)    │    │ (Treasury)  │ │  (Stakes)   │
└─────────────┘ └──────┬──────┘    └──────┬──────┘    └─────────────┘ └──────┬──────┘
                       │                  │                                  │
                       │                  │                                  │
                       └──────────────────┴──────────────────────────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │     Multicall       │
                              │ (Helper & Queries)  │
                              └─────────────────────┘

Flow of Value:
═══════════════

Collector pays WETH to collect content
           │
           ├──► 80% to Previous Owner
           ├──► 15% to Treasury (Auction)
           ├──► 2% to Creator
           ├──► 2% to Team
           └──► 1% to Protocol

Minter produces UNIT tokens
           │
           └──► Sent to Content contract
                      │
                      └──► Distributed via Rewarder to stakeholders

Treasury accumulates fees
           │
           └──► Auctioned to LP holders (LP burned)
```

---

## Token Economics

### Unit Token Supply

The Unit token has a bounded supply determined by:

```
Max Supply ≈ Initial Rate × Halving Period × 2 + Tail Rate × ∞
```

**Example with default parameters:**
- Initial Rate: 1e18 UNIT/second (1 UNIT/sec)
- Halving Period: 30 days
- Tail Rate: 1e15 UNIT/second (0.001 UNIT/sec)

```
First 30 days:    1 UNIT/sec    = 2,592,000 UNIT
Next 30 days:     0.5 UNIT/sec  = 1,296,000 UNIT
Next 30 days:     0.25 UNIT/sec = 648,000 UNIT
...and so on until tail rate
```

### Value Flows

```
┌─────────────────┐
│   Collectors    │
│  (Pay to collect)│
└────────┬────────┘
         │ WETH
         ▼
┌─────────────────┐     ┌─────────────────┐
│    Content      │────►│    Rewarder     │
│   Contract      │     │   (Distributes) │
└────────┬────────┘     └────────┬────────┘
         │                       │
    ┌────┴────┬────┬────┐       │ WETH + UNIT rewards
    │         │    │    │       ▼
    ▼         ▼    ▼    ▼    ┌─────────────────┐
   80%       15%  4%   1%    │   Stakeholders  │
   Prev      Treas Creator Proto │  (Claim rewards) │
   Owner     ury              └─────────────────┘
```

---

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/content-engine-hardhat.git
cd content-engine-hardhat

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

### Deployment

1. **Configure environment:**
```bash
# Create .env file
PRIVATE_KEY=your_deployer_private_key
RPC_URL=https://mainnet.base.org
SCAN_API_KEY=your_basescan_api_key
```

2. **Configure deployment parameters** in deployment script:
```javascript
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const PROTOCOL_FEE_ADDRESS = "0x...";
```

3. **Deploy:**
```bash
npx hardhat run scripts/deploy.js --network base
```

### Configuration

**Core Parameters:**
| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `minDonutForLaunch` | 100e18 | Minimum DONUT to launch |
| `initialUnitMintAmount` | 1_000_000e18 | Initial LP Unit amount |

**Content Parameters:**
| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `minInitPrice` | 1e15 (0.001 ETH) | Minimum starting auction price |
| `EPOCH_PERIOD` | 30 days | Auction duration (constant) |
| `PRICE_MULTIPLIER` | 2e18 (2x) | Price increase (constant) |

**Minter Parameters:**
| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `initialUps` | 1e18 | Initial emission rate (UNIT/sec) |
| `tailUps` | 1e15 | Minimum emission rate |
| `halvingPeriod` | 30 days | Time between halvings |

**Auction Parameters:**
| Parameter | Typical Value | Description |
|-----------|---------------|-------------|
| `initPrice` | 1e18 | Starting auction price |
| `minInitPrice` | 1e15 | Floor price |
| `epochPeriod` | 7 days | Auction duration |
| `priceMultiplier` | 1.5e18 | Price increase per epoch |

---

## Integration Guide

### Creating Content

```javascript
const { ethers } = require("ethers");

// Connect to Content contract
const content = new ethers.Contract(contentAddress, contentAbi, signer);

// Create content
const tx = await content.create(
    creatorAddress,           // Content creator address
    "ipfs://QmYourContentHash" // Metadata URI
);
const receipt = await tx.wait();

// Get token ID from event
const event = receipt.events.find(e => e.event === "Content__Created");
const tokenId = event.args.tokenId;
console.log(`Created content #${tokenId}`);
```

### Collecting Content

```javascript
// Check current price
const price = await content.getPrice(tokenId);
console.log(`Current price: ${ethers.utils.formatEther(price)} ETH`);

// Get auction data for epochId
const auction = await content.getAuction(tokenId);
const epochId = auction.epochId;

// Set deadline (5 minutes from now)
const deadline = Math.floor(Date.now() / 1000) + 300;

// Set max price with slippage (5% above current)
const maxPrice = price.mul(105).div(100);

// Approve WETH spending
const weth = new ethers.Contract(wethAddress, erc20Abi, signer);
await weth.approve(contentAddress, maxPrice);

// Collect the content
const tx = await content.collect(
    collectorAddress,  // Who receives the NFT
    tokenId,           // Token ID to collect
    epochId,           // Frontrun protection
    deadline,          // Transaction deadline
    maxPrice           // Slippage protection
);
await tx.wait();
console.log("Content collected!");
```

### Using Multicall (with ETH)

```javascript
// Get current price and epoch
const price = await content.getPrice(tokenId);
const auction = await content.getAuction(tokenId);
const epochId = auction.epochId;
const deadline = Math.floor(Date.now() / 1000) + 300;
const maxPrice = price.mul(105).div(100);

// Collect with ETH via Multicall (auto-wraps to WETH)
const multicall = new ethers.Contract(multicallAddress, multicallAbi, signer);
const tx = await multicall.collect(
    contentAddress,
    tokenId,
    epochId,
    deadline,
    maxPrice,
    { value: maxPrice }  // Send ETH
);
await tx.wait();
```

### Claiming Rewards

```javascript
// Connect to Rewarder contract
const rewarder = new ethers.Contract(rewarderAddress, rewarderAbi, signer);

// Check earned rewards
const earnedWeth = await rewarder.earned(userAddress, wethAddress);
const earnedUnit = await rewarder.earned(userAddress, unitAddress);
console.log(`Earned WETH: ${ethers.utils.formatEther(earnedWeth)}`);
console.log(`Earned UNIT: ${ethers.utils.formatEther(earnedUnit)}`);

// Claim all rewards
const tx = await rewarder.getReward(userAddress);
await tx.wait();
console.log("Rewards claimed!");
```

### Listening for Events

```javascript
// Listen for new content creation
content.on("Content__Created", (who, to, tokenId, uri) => {
    console.log(`New content #${tokenId} created by ${who} for ${to}`);
});

// Listen for collections
content.on("Content__Collected", (who, to, tokenId, epochId, price) => {
    console.log(`Content #${tokenId} collected by ${to} for ${ethers.utils.formatEther(price)} ETH`);
});

// Listen for reward distributions
content.on("Content__Distributed", (quoteAmount, unitAmount) => {
    console.log(`Distributed: ${ethers.utils.formatEther(quoteAmount)} WETH, ${ethers.utils.formatEther(unitAmount)} UNIT`);
});
```

---

## Testing

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test tests/testContent.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run tests in parallel
npx hardhat test --parallel
```

### Test Files

| File | Description | Tests |
|------|-------------|-------|
| `testContent.js` | Content contract core functionality | Creation, collection, fees |
| `testSecurityAudit.js` | Security-focused tests | Reentrancy, access control, exploits |
| `testExtreme.js` | Stress and edge case tests | Attack vectors, integration |
| `testBoundary.js` | Boundary condition tests | Min/max values, overflow |
| `testInvariants.js` | Invariant property tests | State consistency |

**Total Tests: 263 passing**

---

## Security

### Audit Summary

This codebase has undergone comprehensive security review:

| Category | Finding |
|----------|---------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 (accepted) |
| Informational | 3 |

### Security Features

**1. Reentrancy Protection**
- All external calls use `nonReentrant` modifier
- State changes before external calls (CEI pattern)
- SafeERC20 for token transfers

**2. Front-Running Protection**
- `epochId` parameter prevents replay attacks
- `deadline` prevents stale transactions
- `maxPrice` provides slippage protection

**3. Access Control**
- Owner-only functions protected by Ownable
- Moderator system for content approval
- One-time minter setting for Unit token

**4. Safe Math**
- Solidity 0.8.19 with built-in overflow checks
- Explicit bounds on price calculations
- ABS_MAX_INIT_PRICE prevents overflow in price multiplier

**5. Input Validation**
- Zero address checks
- Empty string checks
- Price bounds validation

### Protected Parameters

**Immutable After Deployment:**
- Rewarder address
- Unit token address
- Quote token address
- Core address
- Minimum initial price
- Fee percentages (constants)
- Epoch period (constant)
- Price multiplier (constant)

**Owner Controlled:**
- Treasury address
- Team address
- Moderation mode
- Moderator list
- Metadata URI

**Not Possible:**
- Minting Unit outside of Minter
- Collecting without paying auction price
- Withdrawing stakes directly
- Bypassing fee distribution
- Transferring content NFTs (only collect works)

### Known Limitations

1. **Block Timestamp Dependence**: Dutch auction prices depend on `block.timestamp`, which can be manipulated by miners within ~15 second range. This is acceptable given the 30-day auction period.

2. **First Content Free**: When content is created, the creator owns it with 0 stake. They earn nothing from Rewarder until someone collects from them.

3. **Moderation Centralization**: In moderated mode, owner/moderators control which content can be collected. This is by design for spam prevention.

---

## License

MIT

---

## Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Submit a pull request
- Join our Discord community
