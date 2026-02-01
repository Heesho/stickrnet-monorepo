# Replace DONUT with USDC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the DONUT token entirely and use USDC (the existing `quote` token) as the sole base token for liquidity pairing and launch deposits.

**Architecture:** The `donutToken` immutable and all references collapse into the existing `quote` (USDC) immutable. LP pairs become Unit/USDC. The Core constructor drops one parameter. The Multicall drops its `donut` immutable. The subgraph renames `donutAmount` to `quoteAmount`. No changes to Auction, Content, Minter, or Rewarder contracts.

**Tech Stack:** Solidity 0.8.19, Hardhat, AssemblyScript (subgraph), Uniswap V2

---

### Task 1: Update ICore interface — remove DONUT references

**Files:**
- Modify: `packages/hardhat/contracts/interfaces/ICore.sol`

**Step 1: Edit the ICore interface**

Replace the full file content with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title ICore
 * @author heesho
 * @notice Interface for the Core launchpad contract.
 */
interface ICore {
    struct LaunchParams {
        address launcher;
        string tokenName;
        string tokenSymbol;
        string uri;
        uint256 quoteAmount;
        uint256 unitAmount;
        uint256 initialUps;
        uint256 tailUps;
        uint256 halvingPeriod;
        uint256 contentMinInitPrice;
        bool contentIsModerated;
        uint256 auctionInitPrice;
        uint256 auctionEpochPeriod;
        uint256 auctionPriceMultiplier;
        uint256 auctionMinInitPrice;
    }

    function launch(LaunchParams calldata params)
        external
        returns (
            address unit,
            address content,
            address minter,
            address rewarder,
            address auction,
            address lpToken
        );
    function protocolFeeAddress() external view returns (address);
    function quote() external view returns (address);
    function uniswapV2Factory() external view returns (address);
    function uniswapV2Router() external view returns (address);
    function minQuoteForLaunch() external view returns (uint256);
    function isDeployedContent(address content) external view returns (bool);
    function contentToIndex(address content) external view returns (uint256);
    function contentToLauncher(address content) external view returns (address);
    function contentToUnit(address content) external view returns (address);
    function contentToAuction(address content) external view returns (address);
    function contentToMinter(address content) external view returns (address);
    function contentToRewarder(address content) external view returns (address);
    function contentToLP(address content) external view returns (address);
    function deployedContentsLength() external view returns (uint256);
    function deployedContents(uint256 index) external view returns (address);
}
```

Changes:
- `donutAmount` → `quoteAmount` in LaunchParams
- Remove `donutToken()` view function
- `minDonutForLaunch()` → `minQuoteForLaunch()`

**Step 2: Commit**

```bash
git add packages/hardhat/contracts/interfaces/ICore.sol
git commit -m "refactor: remove DONUT from ICore interface, use quoteAmount"
```

---

### Task 2: Update Core.sol — remove donutToken, use quote for LP

**Files:**
- Modify: `packages/hardhat/contracts/Core.sol`

**Step 1: Update the Core contract**

Apply these changes to `Core.sol`:

1. **NatSpec** (lines 17-33): Replace all DONUT references with USDC/quote references in comments:
   - "Users provide DONUT tokens to launch" → "Users provide quote tokens (e.g. USDC) to launch"
   - "Creates a Unit/DONUT liquidity pool" → "Creates a Unit/quote liquidity pool"
   - "The DONUT token must be a standard ERC20" → "The quote token must be a standard ERC20"
   - "Burns the initial LP tokens" stays as-is

2. **Immutables** (line 57): Delete `address public immutable donutToken;` entirely

3. **State** (line 69): Rename `minDonutForLaunch` → `minQuoteForLaunch`

4. **LaunchParams struct** (line 91): Rename `donutAmount` → `quoteAmount`

5. **Errors** (line 106): Rename `Core__InsufficientDonut()` → `Core__InsufficientQuote()`

6. **Events** (line 137): In `Core__Launched` event, rename parameter `donutAmount` → `quoteAmount`

7. **Events** (line 150): Rename `Core__MinDonutForLaunchSet` → `Core__MinQuoteForLaunchSet` and its parameter

8. **Constructor** (lines 168-200):
   - Remove `_donutToken` parameter
   - Remove `_donutToken == address(0)` from the zero check
   - Remove `donutToken = _donutToken;` assignment
   - Rename `_minDonutForLaunch` → `_minQuoteForLaunch`
   - Rename assignment to `minQuoteForLaunch = _minQuoteForLaunch;`

9. **launch() function** (lines 226-371):
   - Update NatSpec: "Caller must approve quote tokens" instead of DONUT
   - Return value comment: "Unit/quote LP token" instead of "Unit/DONUT LP token"
   - Line 229: `params.donutAmount` → `params.quoteAmount`, error → `Core__InsufficientQuote()`
   - Line 229: `minDonutForLaunch` → `minQuoteForLaunch`
   - Line 263: `IERC20(donutToken).safeTransferFrom(...)` → `IERC20(quote).safeTransferFrom(msg.sender, address(this), params.quoteAmount);`
   - Line 271 comment: "Create Unit/quote LP" instead of "Unit/DONUT LP"
   - Lines 274-275: `IERC20(donutToken).safeApprove(...)` → `IERC20(quote).safeApprove(uniswapV2Router, 0);` and `IERC20(quote).safeApprove(uniswapV2Router, params.quoteAmount);`
   - Line 279: `donutToken` → `quote` in addLiquidity call
   - Lines 281-283: `params.donutAmount` → `params.quoteAmount`
   - Line 289: `IUniswapV2Factory(uniswapV2Factory).getPair(unit, donutToken)` → `.getPair(unit, quote)`
   - Line 357: `params.donutAmount` → `params.quoteAmount` in emit

10. **setMinDonutForLaunch** (lines 389-392): Rename to `setMinQuoteForLaunch`, update parameter name, state variable, and event

**Step 2: Verify compilation**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Successful compilation

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/Core.sol
git commit -m "refactor: remove donutToken from Core, use quote for LP pairing"
```

---

### Task 3: Update Multicall.sol — remove donut immutable, update price calcs

**Files:**
- Modify: `packages/hardhat/contracts/Multicall.sol`

**Step 1: Update the Multicall contract**

Apply these changes:

1. **Immutable** (line 27): Delete `address public immutable donut;`

2. **UnitState struct** (lines 46-48): Rename fields:
   - `marketCapInDonut` → `marketCapInQuote`
   - `liquidityInDonut` → `liquidityInQuote`
   - `priceInDonut` → `priceInQuote`

3. **Constructor** (lines 99-104):
   - Remove `_donut` parameter
   - Remove `_donut == address(0)` from zero check
   - Remove `donut = _donut;`

4. **getUnitState()** (lines 250-260): Update LP price calculation:
   - `IERC20(donut).balanceOf(state.lp)` → `IERC20(quote).balanceOf(state.lp)`
   - `donutInLP` → `quoteInLP`
   - `state.priceInDonut` → `state.priceInQuote`
   - `state.liquidityInDonut` → `state.liquidityInQuote`
   - `state.marketCapInDonut` → `state.marketCapInQuote`
   - Keep the same math: `priceInQuote = quoteInLP * 1e18 / unitInLP`

5. **launch()** (lines 169-205): Update to use `quote` instead of `donut`:
   - `IERC20(donut).safeTransferFrom(msg.sender, address(this), params.donutAmount)` → `IERC20(quote).safeTransferFrom(msg.sender, address(this), params.quoteAmount)`
   - `IERC20(donut).safeApprove(core, 0)` → `IERC20(quote).safeApprove(core, 0)`
   - `IERC20(donut).safeApprove(core, params.donutAmount)` → `IERC20(quote).safeApprove(core, params.quoteAmount)`
   - In the `LaunchParams` struct literal: `donutAmount: params.donutAmount` → `quoteAmount: params.quoteAmount`
   - Update NatSpec comments

6. **getAuctionState()** (lines 324-327): Update LP price calculation:
   - `IERC20(donut).balanceOf(state.paymentToken)` → `IERC20(quote).balanceOf(state.paymentToken)`
   - Comment: "LP price in quote" instead of "LP price in DONUT"

**Step 2: Verify compilation**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Successful compilation

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/Multicall.sol
git commit -m "refactor: remove donut from Multicall, price calcs now in quote"
```

---

### Task 4: Delete MockDONUT.sol

**Files:**
- Delete: `packages/hardhat/contracts/mocks/MockDONUT.sol`

**Step 1: Delete the file**

```bash
rm packages/hardhat/contracts/mocks/MockDONUT.sol
```

**Step 2: Verify compilation still works**

Run: `cd packages/hardhat && npx hardhat compile`
Expected: Successful compilation (nothing imports MockDONUT)

**Step 3: Commit**

```bash
git add packages/hardhat/contracts/mocks/MockDONUT.sol
git commit -m "chore: delete MockDONUT, no longer needed"
```

---

### Task 5: Update deploy.js — remove all DONUT references

**Files:**
- Modify: `packages/hardhat/scripts/deploy.js`

**Step 1: Update configuration section (top of file)**

- Delete line 17: `let DONUT_ADDRESS = "";`
- Delete line 24: `const MIN_DONUT_FOR_LAUNCH = convert("1000", 18);`
- Add: `const MIN_QUOTE_FOR_LAUNCH = convert("100", 6);` (100 USDC, 6 decimals)
- Delete line 28: `const MOCK_DONUT = "0xD50B69581362C60Ce39596B237C71e07Fc4F6fdA";`

**Step 2: Update STICKR_LAUNCH_PARAMS**

- `donutAmount: convert("1000", 18)` → `quoteAmount: convert("100", 6)` (100 USDC)

**Step 3: Update contract variables**

- Remove `mockDonut` from the variable declarations

**Step 4: Update getContracts()**

- Remove the entire MOCK_DONUT/DONUT_ADDRESS block (lines 88-97)

**Step 5: Delete deployMockDONUT() function entirely**

**Step 6: Update deployCore()**

- Remove the `DONUT_ADDRESS` check
- Remove `DONUT_ADDRESS` from the constructor arguments
- Replace `MIN_DONUT_FOR_LAUNCH` → `MIN_QUOTE_FOR_LAUNCH`

**Step 7: Update deployMulticall()**

- Remove `DONUT_ADDRESS` from constructor arguments (was 3rd arg, now only 2: `core.address, USDC_ADDRESS`)

**Step 8: Delete verifyMockDONUT() function entirely**

**Step 9: Update verifyCore()**

- Remove `DONUT_ADDRESS` from constructorArguments
- Replace `MIN_DONUT_FOR_LAUNCH` → `MIN_QUOTE_FOR_LAUNCH`

**Step 10: Update verifyMulticall()**

- Remove `DONUT_ADDRESS` from constructorArguments: `[core?.address || CORE, USDC_ADDRESS]`

**Step 11: Update launchStickr()**

- Console log: "DONUT Amount" → "Quote Amount" (and use `divDec(params.quoteAmount, 6)`)
- Approval section: approve USDC for Core instead of DONUT
  - `const quoteToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC_ADDRESS);`
  - `await quoteToken.approve(core.address, params.quoteAmount);`

**Step 12: Update deploySystem()**

- Remove `await deployMockDONUT();` call

**Step 13: Update verifySystem()**

- Remove `await verifyMockDONUT();` and its `await sleep(5000);`

**Step 14: Update config/print functions**

- `setMinDonutForLaunch` → `setMinQuoteForLaunch`
- `mintMockDONUT` → delete entirely
- `printDeployment`: remove DONUT lines, update labels
- `printCoreState`: remove `core.donutToken()` and `core.minDonutForLaunch()` lines, add `core.minQuoteForLaunch()`

**Step 15: Commit**

```bash
git add packages/hardhat/scripts/deploy.js
git commit -m "refactor: remove DONUT from deploy script, use USDC for launches"
```

---

### Task 6: Update subgraph — rename donutAmount to quoteAmount

**Files:**
- Modify: `packages/subgraph/schema.graphql`
- Modify: `packages/subgraph/src/core.ts`
- Modify: `packages/subgraph/abis/Core.json` (regenerated after contract compilation)

**Step 1: Update schema.graphql**

Line 53: `donutAmount: BigDecimal!` → `quoteAmount: BigDecimal!`

**Step 2: Update core.ts mapping**

Line 56: Change:
```typescript
channel.donutAmount = convertTokenToDecimal(event.params.donutAmount, BI_18);
```
To:
```typescript
channel.quoteAmount = convertTokenToDecimal(event.params.quoteAmount, BI_6);
```

Note: `BI_6` because USDC has 6 decimals, not 18 like DONUT had.

**Step 3: Regenerate Core.json ABI**

After compiling contracts in Task 2, copy the new ABI:

```bash
cp packages/hardhat/artifacts/contracts/Core.sol/Core.json /tmp/core-abi.json
# Extract just the "abi" field into packages/subgraph/abis/Core.json
# Or use: node -e "const c = require('./packages/hardhat/artifacts/contracts/Core.sol/Core.json'); console.log(JSON.stringify(c.abi, null, 2))" > packages/subgraph/abis/Core.json
```

**Step 4: Build subgraph to verify**

```bash
cd packages/subgraph && npx graph codegen && npx graph build
```

Expected: Successful build

**Step 5: Commit**

```bash
git add packages/subgraph/schema.graphql packages/subgraph/src/core.ts packages/subgraph/abis/Core.json
git commit -m "refactor: rename donutAmount to quoteAmount in subgraph schema and mapping"
```

---

### Task 7: Final compilation and verification

**Step 1: Clean compile all contracts**

```bash
cd packages/hardhat && npx hardhat clean && npx hardhat compile
```

Expected: Successful compilation with no errors or warnings about DONUT

**Step 2: Grep for any remaining DONUT references**

```bash
grep -ri "donut" packages/hardhat/contracts/ packages/hardhat/scripts/ packages/subgraph/src/ packages/subgraph/schema.graphql
```

Expected: No results (or only in subgraph README which is irrelevant)

**Step 3: Build subgraph**

```bash
cd packages/subgraph && npx graph codegen && npx graph build
```

Expected: Successful build

**Step 4: Commit any remaining fixes if grep found stragglers**

```bash
git add -A && git commit -m "chore: remove remaining DONUT references"
```
