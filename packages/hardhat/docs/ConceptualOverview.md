# StickrNet conceptual overview

## The core idea

A Sticker is an always-collectible content NFT backed by refundable USDC capital. The capital locked behind the Sticker is both its owner's exit value and its mining weight.

Four values are intentionally distinct:

1. Collection price
2. Refundable reserve
3. Speculative premium and fees
4. Mining power

The invariant is simple:

```text
mining power = refundable USDC reserve
```

Paying fees or a speculative premium never creates mining power.

## Collection pricing

The next collector must fund a new reserve:

```text
first reserve = configured minimum initial price
later reserve = current reserve * 1.10
```

A speculative premium starts at the next reserve amount and decays linearly to zero over 24 hours:

```text
collection price = next reserve + current premium
```

Only the premium decays. After 24 hours the Sticker still costs the next reserve; reserve-backed ownership is never given away for free.

## Value flow

When ownership changes:

- The buyer pays the new reserve plus the current premium.
- The outgoing owner recovers the entire old reserve.
- The new reserve remains locked in `Content.sol`.
- Rewarder removes exactly the old reserve from the outgoing owner.
- Rewarder credits exactly the new reserve to the new owner.
- Only premium is distributed as profit or fees.

Premium is split 40% to the previous owner, 20% to the creator, 30% to treasury, 5% to team, and 5% to protocol. Rounding dust and disabled team/protocol shares go to treasury.

Every payout uses pull accounting, including treasury, team, and protocol shares. The Multicall path makes best-effort claims for normal UX, while a blocked recipient can leave its share safely claimable without halting collection. Claimable proceeds are accounted separately from reserves, so `claim()` cannot withdraw collateral backing active Stickers.

## Why wash mining no longer works

Self-collection and coordinated-wallet collection remain allowed. They are harmless because the new owner receives no more mining power than the new reserve left inside the protocol.

An actor may recover the premium shares assigned to roles they control. They still must:

- Lock the full new reserve.
- Pay premium shares assigned to addresses they do not control.
- Give up the old reserve's previous mining position before the new one is created.

Repeated controlled trades can increase mining power only by increasing locked refundable capital.

## Exit

After a 24-hour cooldown from the latest collection, the owner can surrender a Sticker. Surrender removes its mining position immediately, burns the NFT, and returns the full reserve.

This makes the reserve a real refundable liability rather than protocol revenue.

## Solvency

The system checks after each collection, claim, and surrender:

```text
Rewarder total mining weight == total Sticker reserves
Content USDC >= total reserves + total claimable proceeds
```

These relationships can differ only transiently inside an atomic transaction.

## Trust and risk

The reserve model removes unbacked mining power, but it does not guarantee profit:

- Premium is non-refundable.
- Reserve growth can make later collections capital intensive.
- A surrender burns the Sticker and forfeits future mining.
- USDC blacklist behavior can prevent a particular transfer; failed transfers revert atomically.
- The contracts assume a standard, non-rebasing, non-fee-on-transfer quote token.
- Treasury auction prices decay to the configured LP-token floor, never to zero.
- Each reward token has an owner-configured notifier. Reward streams pause whenever total reserve weight is zero.
- Existing legacy Content deployments do not acquire reserves automatically and require redeployment.
