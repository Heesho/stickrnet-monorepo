# StickrNet contracts

The Hardhat package contains StickrNet's Channel launch system, Sticker NFTs, reserve-backed Rewarder accounting, coin emissions, and treasury auctions.

## Reserve-backed Content

`Content.sol` holds refundable USDC reserves directly. No reserve funds are sent to fee recipients.

```text
nextReserve =
  minInitPrice                    when currentReserve == 0
  currentReserve * 11,000 / 10,000 otherwise

premium =
  premiumStart * remainingTime / 1 day

collectionPrice = nextReserve + premium
rewardWeight = currentReserve
```

The premium split is 40% previous owner, 20% creator, 30% treasury, 5% team, and 5% protocol. Integer rounding and disabled team/protocol shares accrue to treasury.

All payouts use pull accounting. The previous owner's proceeds are:

```text
oldReserve + 40% of paid premium
```

The new owner's Rewarder deposit is:

```text
newReserve
```

The contract enforces:

```text
Rewarder.totalSupply() == Content.totalReserved()
quote.balanceOf(Content) >= Content.totalReserved() + Content.totalClaimable()
```

The clean testnet cutover removes the obsolete `idToStake` and `idToInitPrice` aliases. Integrations use `reserveOf`/`idToReserve` and `premiumOf`/`idToPremiumStart` directly.

## Surrender

`surrender(tokenId)` is available to the current owner 24 hours after the latest collection. It withdraws the full reserve-backed Rewarder position, burns the NFT, and transfers the complete reserve to the owner.

## Commands

```bash
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network baseSepolia
```

The deployment script performs a clean testnet cutover by deploying a fresh factory/Core/Multicall system. See [the deployment guide](../../docs/RESERVE_ECONOMICS_MIGRATION.md).

## Main contracts

- `Core.sol`: validates launch parameters and deploys a Channel ecosystem.
- `Content.sol`: Sticker ownership, reserve/premium collection accounting, surrender, and solvency enforcement.
- `Rewarder.sol`: proportional multi-token rewards; only Content can add or remove mining weight.
- `Minter.sol`: weekly halving emissions into Rewarder.
- `Auction.sol`: auctions treasury assets for burned LP tokens.
- `Multicall.sol`: batched transactions and aggregate UI state.

Direct ERC721 approvals and transfers are disabled. Deadline, epoch ID, max-price, and reentrancy protections remain enforced.

Auction prices decay only to their configured `minInitPrice`; treasury assets can no longer be acquired for zero LP. Reward streams pause while no reserve is staked, and only the configured notifier may schedule each reward token.
