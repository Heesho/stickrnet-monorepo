# Replace DONUT with USDC for Liquidity

## Summary

Remove the DONUT token entirely from the system. USDC becomes the sole base token used for both content payments and liquidity pairing. Channel launches seed Unit/USDC liquidity pools instead of Unit/DONUT.

## Motivation

- Simplifies the token model from three tokens (DONUT, USDC, Unit) to two (USDC, Unit)
- Unit price is directly in USD terms (no DONUT intermediary)
- Removes dependency on an external DONUT token
- Cleaner UX: users only deal with USDC and Unit tokens

## Design

### Core.sol

- Remove `donutToken` state variable and constructor parameter
- `quoteToken` (USDC) replaces DONUT everywhere:
  - Launch deposits: launcher sends USDC instead of DONUT
  - LP creation: `addLiquidity(unit, quoteToken, ...)` creates Unit/USDC pair
  - LP burn: same mechanism, just Unit/USDC LP tokens sent to `0xdead`
- Rename `MIN_DONUT` to `MIN_QUOTE`, set to `100e6` (100 USDC, 6 decimals)
- `launch()` parameter `donutAmount` becomes `quoteAmount`
- All DONUT approval/transfer logic replaced with equivalent USDC logic

### Multicall.sol

- `getUnitState()`: price calculation uses Unit/USDC reserves instead of Unit/DONUT
  - This is simpler since price is directly in USD
- `launch()` helper: pulls USDC from caller instead of DONUT
- Remove any DONUT-specific references

### deploy.js

- Remove MockDONUT deployment
- Remove DONUT-related approvals and token transfers
- Update `Core` constructor call (drop `donutToken` parameter)
- Launch calls pass USDC amounts instead of DONUT amounts

### MockDONUT.sol

- Delete entirely

### Subgraph

- Update any DONUT-denominated price calculations in mappings
- Channel LP token address auto-updates (set from launch events)
- No schema changes expected (LP token field is already generic)

### No Changes Required

- `Auction.sol` -- accepts whatever LP token is set for the channel
- `Content.sol` -- deals in `quoteToken` (already USDC)
- `Minter.sol` -- only mints Unit tokens
- `Rewarder.sol` -- distributes Unit rewards, no DONUT reference
- `MockUSDC.sol` -- stays as-is

## Configuration

| Parameter | Old Value | New Value |
|-----------|-----------|-----------|
| LP pair | Unit/DONUT | Unit/USDC |
| Launch deposit token | DONUT | USDC |
| Min launch deposit | 1000 DONUT | 100 USDC (100e6) |
| Price denomination | DONUT | USDC |
| Uniswap contracts | Same (Base V2) | Same (Base V2) |

## Flow After Change

```
Channel Launch:
  Launcher deposits USDC (min 100) + system mints Unit tokens
  -> Unit/USDC LP created on Uniswap V2
  -> LP tokens burned (permanent liquidity)

Content Collection:
  User pays USDC -> fees distributed (80/3/1/1/15 split)
  -> 15% treasury goes to Auction

Buyback:
  USDC accumulates in Auction
  -> Users buy USDC with Unit/USDC LP tokens (Dutch auction)
  -> LP tokens burned
```
