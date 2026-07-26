# Reserve economics testnet deployment

## Clean cutover

StickrNet is currently testnet-only. No historical Channel, Sticker, stake, or subgraph state needs to be preserved. Deploy the reserve model as a fresh system and retire the previous testnet addresses.

## Contracts

At minimum, deploy:

1. A new `ContentFactory` compiled with the reserve-backed `Content` creation bytecode.
2. A new `Core` whose immutable `contentFactory` points to that factory.
3. A new `Multicall` compiled with the expanded `ContentState` tuple and pointing to the new Core.

The standard deployment script deploys all factories and system contracts, which satisfies these dependencies. Unchanged factory implementations may be reused only if their addresses are deliberately supplied to a separately reviewed deployment flow.

Each new Channel launched through the new Core receives a new Content and Rewarder. Deploy the new `RewarderFactory` as well: its embedded Rewarder now enforces notifier authorization, exact reward receipt, and zero-stake stream pausing.

## Frontend and indexer

- Update the frontend Core and Multicall addresses together.
- Regenerate or deploy the subgraph against the new Core start block.
- Use the new `Content__Collected` signature, which includes old reserve, new reserve, and premium.
- Use `idToReserve`/`reserveOf` and `idToPremiumStart`/`premiumOf`; the obsolete `idToStake` and `idToInitPrice` aliases are intentionally removed for the clean testnet cutover.
- Treat all payout shares as pull liabilities. Anyone may call `claim(account)`, and Multicall attempts the normal recipients without allowing a failed claim to revert collection.
- Handle `Content__Surrendered` by marking the Sticker inactive.
- Replace the old ABI and addresses atomically so the app never decodes the new `ContentState` tuple with the old ABI.

## Pre-deployment checks

```bash
cd packages/hardhat
npx hardhat compile
npx hardhat test

cd ../subgraph
npm run codegen
npm run build

cd ../app
npm run build
```

The deployment command targets Base Sepolia only and requires explicit quote, router/factory, protocol multisig, and channel-owner multisig addresses. It refuses any other chain ID.

After deployment, verify on Base Sepolia:

```text
ContentFactory bytecode corresponds to the reserve model
Core.contentFactory() == new ContentFactory
Multicall.core() == new Core
Content.totalReserved() == Rewarder.totalSupply()
Content USDC balance >= totalReserved + totalClaimable
```

## Cutover completion

Once the new app and subgraph are verified, remove the old testnet addresses from configuration. There is no dual-version support or balance migration requirement.
