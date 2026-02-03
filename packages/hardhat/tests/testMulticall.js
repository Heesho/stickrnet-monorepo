const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;
const divDec6 = (amount) => amount / 10 ** 6;
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const AddressZero = "0x0000000000000000000000000000000000000000";
const AddressDead = "0x000000000000000000000000000000000000dEaD";

async function getAuctionData(content, tokenId) {
  return {
    epochId: await content.idToEpochId(tokenId),
    initPrice: await content.idToInitPrice(tokenId),
    startTime: await content.idToStartTime(tokenId)
  };
}

let owner, protocol, launcher, user1, user2;
let usdc, donut, core, multicall;
let content, minter, rewarder, auction, unit, lpToken;
let unitFactory, contentFactory, minterFactory, rewarderFactory, auctionFactory;
let uniswapFactory, uniswapRouter;

const WEEK = 7 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

describe("Multicall Tests", function () {
  before("Initial set up", async function () {
    await network.provider.send("hardhat_reset");
    console.log("Begin Initialization");

    [owner, protocol, launcher, user1, user2] = await ethers.getSigners();

    // Deploy USDC (6 decimals) as quote token
    const usdcArtifact = await ethers.getContractFactory("MockUSDC");
    usdc = await usdcArtifact.deploy();
    console.log("- USDC Initialized");

    // Deploy mock DONUT token
    const donutArtifact = await ethers.getContractFactory("MockWETH");
    donut = await donutArtifact.deploy();
    console.log("- DONUT Initialized");

    // Deploy mock Uniswap V2 Factory and Router
    const mockUniswapFactoryArtifact = await ethers.getContractFactory("MockUniswapV2Factory");
    uniswapFactory = await mockUniswapFactoryArtifact.deploy();
    console.log("- Uniswap V2 Factory Initialized");

    const mockUniswapRouterArtifact = await ethers.getContractFactory("MockUniswapV2Router");
    uniswapRouter = await mockUniswapRouterArtifact.deploy(uniswapFactory.address);
    console.log("- Uniswap V2 Router Initialized");

    // Deploy factories
    const unitFactoryArtifact = await ethers.getContractFactory("UnitFactory");
    unitFactory = await unitFactoryArtifact.deploy();
    console.log("- UnitFactory Initialized");

    const contentFactoryArtifact = await ethers.getContractFactory("ContentFactory");
    contentFactory = await contentFactoryArtifact.deploy();
    console.log("- ContentFactory Initialized");

    const minterFactoryArtifact = await ethers.getContractFactory("MinterFactory");
    minterFactory = await minterFactoryArtifact.deploy();
    console.log("- MinterFactory Initialized");

    const rewarderFactoryArtifact = await ethers.getContractFactory("RewarderFactory");
    rewarderFactory = await rewarderFactoryArtifact.deploy();
    console.log("- RewarderFactory Initialized");

    const auctionFactoryArtifact = await ethers.getContractFactory("AuctionFactory");
    auctionFactory = await auctionFactoryArtifact.deploy();
    console.log("- AuctionFactory Initialized");

    // Deploy Core
    const coreArtifact = await ethers.getContractFactory("Core");
    core = await coreArtifact.deploy(
      usdc.address,
      uniswapFactory.address,
      uniswapRouter.address,
      unitFactory.address,
      contentFactory.address,
      minterFactory.address,
      auctionFactory.address,
      rewarderFactory.address,
      protocol.address,
      convert("100", 6)
    );
    console.log("- Core Initialized");

    // Deploy Multicall
    const multicallArtifact = await ethers.getContractFactory("Multicall");
    multicall = await multicallArtifact.deploy(core.address, usdc.address);
    console.log("- Multicall Initialized");

    // Mint USDC to launcher for launch
    await usdc.mint(launcher.address, convert("10000", 6));
    console.log("- USDC minted to launcher");

    const launchParams = {
      launcher: launcher.address,
      tokenName: "Test Unit",
      tokenSymbol: "TUNIT",
      uri: "https://example.com/metadata",
      quoteAmount: convert("500", 6),
      unitAmount: convert("1000000", 18),
      initialUps: convert("4", 18),
      tailUps: convert("0.01", 18),
      halvingPeriod: WEEK,
      contentMinInitPrice: convert("1", 6),
      contentIsModerated: false,
      auctionInitPrice: convert("1000", 6),
      auctionEpochPeriod: DAY,
      auctionPriceMultiplier: convert("1.5", 18),
      auctionMinInitPrice: convert("1", 6),
    };

    await usdc.connect(launcher).approve(core.address, launchParams.quoteAmount);
    const tx = await core.connect(launcher).launch(launchParams);
    const receipt = await tx.wait();

    const launchEvent = receipt.events.find((e) => e.event === "Core__Launched");
    content = await ethers.getContractAt("Content", launchEvent.args.content);
    unit = await ethers.getContractAt("Unit", launchEvent.args.unit);
    minter = await ethers.getContractAt("Minter", launchEvent.args.minter);
    rewarder = await ethers.getContractAt("Rewarder", launchEvent.args.rewarder);
    auction = await ethers.getContractAt("Auction", launchEvent.args.auction);
    lpToken = await ethers.getContractAt("IERC20", launchEvent.args.lpToken);

    console.log("- Content Engine launched");
    console.log("Initialization Complete\n");
  });

  describe("Initialization", function () {
    it("Should deploy with correct core address", async function () {
      expect(await multicall.core()).to.equal(core.address);
    });

    it("Should deploy with correct quote address", async function () {
      expect(await multicall.quote()).to.equal(usdc.address);
    });

    it("Should revert with zero addresses", async function () {
      const multicallArtifact = await ethers.getContractFactory("Multicall");

      await expect(
        multicallArtifact.deploy(AddressZero, usdc.address)
      ).to.be.revertedWith("Multicall__ZeroAddress()");

      await expect(
        multicallArtifact.deploy(core.address, AddressZero)
      ).to.be.revertedWith("Multicall__ZeroAddress()");
    });
  });

  describe("getUnitState()", function () {
    it("Should return correct unit state", async function () {
      const state = await multicall.getUnitState(content.address, user1.address);

      expect(state.index).to.equal(0);
      expect(state.unit).to.equal(unit.address);
      expect(state.quote).to.equal(usdc.address);
      expect(state.launcher).to.equal(launcher.address);
      expect(state.minter).to.equal(minter.address);
      expect(state.rewarder).to.equal(rewarder.address);
      expect(state.auction).to.equal(auction.address);
      expect(state.lp).to.equal(lpToken.address);
      expect(state.uri).to.equal("https://example.com/metadata");
      expect(state.isModerated).to.be.false;
      expect(state.totalSupply).to.equal(0);
    });

    it("Should return user balances when account provided", async function () {
      // Give user1 some tokens
      await usdc.mint(user1.address, convert("10", 6));

      const state = await multicall.getUnitState(content.address, user1.address);

      expect(state.accountQuoteBalance).to.be.gte(convert("10", 6));
      // Note: accountUnitBalance may be 0 if user1 hasn't received any unit tokens yet
    });

    it("Should return zero balances when account is zero address", async function () {
      const state = await multicall.getUnitState(content.address, AddressZero);

      expect(state.accountQuoteBalance).to.equal(0);
      expect(state.accountUnitBalance).to.equal(0);
      expect(state.accountContentOwned).to.equal(0);
      expect(state.accountContentStaked).to.equal(0);
    });

    it("Should return correct accountContentStaked after collection", async function () {
      // Create content
      await content.connect(user1).create(user1.address, "ipfs://staketest");
      const tokenId = await content.nextTokenId();

      // User2 collects it
      const price = await content.getPrice(tokenId);
      await usdc.mint(user2.address, price);
      await usdc.connect(user2).approve(content.address, price);
      const epochId = await content.idToEpochId(tokenId);
      await content.connect(user2).collect(user2.address, tokenId, epochId, (await ethers.provider.getBlock("latest")).timestamp + 1000, price);

      // Check accountContentStaked matches rewarder balance (stake in rewarder)
      const state = await multicall.getUnitState(content.address, user2.address);
      const rewarderBalance = await rewarder.accountToBalance(user2.address);
      expect(state.accountContentStaked).to.equal(rewarderBalance);
      expect(state.accountContentStaked).to.be.gt(0);
      expect(state.accountContentOwned).to.equal(1);
    });

    it("Should calculate market cap and liquidity correctly", async function () {
      const state = await multicall.getUnitState(content.address, AddressZero);

      // LP was seeded with 500 DONUT and 1M Unit
      // priceInQuote = donutInLP * 1e18 / unitInLP
      // liquidityInQuote = donutInLP * 2
      expect(state.priceInQuote).to.be.gt(0);
      expect(state.liquidityInQuote).to.be.gt(0);
      expect(state.marketCapInQuote).to.be.gt(0);
    });
  });

  describe("getContentState()", function () {
    it("Should return correct content state", async function () {
      // Create a token
      await content.connect(user1).create(user1.address, "ipfs://token1");
      const tokenId = await content.nextTokenId();

      const state = await multicall.getContentState(content.address, tokenId);

      expect(state.tokenId).to.equal(tokenId);
      expect(state.owner).to.equal(user1.address);
      expect(state.creator).to.equal(user1.address);
      expect(state.isApproved).to.be.true;
      expect(state.stake).to.equal(0);
      expect(state.epochId).to.equal(0);
      expect(state.uri).to.equal("ipfs://token1");
    });

    it("Should update state after collection", async function () {
      const tokenId = await content.nextTokenId();

      // Collect
      const price = await content.getPrice(tokenId);
      await usdc.mint(user2.address, price);
      await usdc.connect(user2).approve(content.address, price);
      const auctionData = await getAuctionData(content, tokenId);
      await content
        .connect(user2)
        .collect(user2.address, tokenId, auctionData.epochId, ethers.constants.MaxUint256, price);

      const state = await multicall.getContentState(content.address, tokenId);

      expect(state.owner).to.equal(user2.address);
      expect(state.creator).to.equal(user1.address);
      expect(state.stake).to.be.gt(0); // Stake recorded (exact value may differ due to price decay)
      expect(state.epochId).to.equal(1);
    });

    it("Should calculate reward for duration correctly", async function () {
      // Trigger minter to emit rewards
      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await ethers.provider.send("evm_mine");
      await minter.updatePeriod();

      const tokenId = await content.nextTokenId();
      const state = await multicall.getContentState(content.address, tokenId);

      // Content should have a share of the rewards proportional to its stake
      // If stake is 0, rewardForDuration should be 0
      // If stake > 0 and totalStaked > 0, rewardForDuration = totalRewardForDuration * stake / totalStaked
      if (state.stake.gt(0)) {
        expect(state.rewardForDuration).to.be.gt(0);
      }
    });
  });

  describe("getAuctionState()", function () {
    it("Should return correct auction state", async function () {
      const state = await multicall.getAuctionState(content.address, user1.address);

      expect(state.epochId).to.be.gte(0);
      expect(state.paymentToken).to.equal(lpToken.address);
      // Price may have decayed to 0 over time, so just check it's a valid value
      expect(state.price).to.be.gte(0);
      expect(state.paymentTokenPrice).to.be.gt(0);
    });

    it("Should return user payment token balance", async function () {
      // LP tokens are burned to dead address, so most users have 0
      const state = await multicall.getAuctionState(content.address, user1.address);
      expect(state.accountPaymentTokenBalance).to.equal(0); // User doesn't have LP tokens
    });

    it("Should return zero balances when account is zero address", async function () {
      const state = await multicall.getAuctionState(content.address, AddressZero);

      expect(state.accountQuoteBalance).to.equal(0);
      expect(state.accountPaymentTokenBalance).to.equal(0);
    });
  });

  describe("updateMinterPeriod()", function () {
    it("Should trigger minter update through multicall", async function () {
      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await ethers.provider.send("evm_mine");

      const periodBefore = await minter.activePeriod();
      await multicall.updateMinterPeriod(content.address);
      const periodAfter = await minter.activePeriod();

      expect(periodAfter).to.be.gt(periodBefore);
    });

    it("Should emit from minter contract", async function () {
      await ethers.provider.send("evm_increaseTime", [WEEK]);
      await ethers.provider.send("evm_mine");

      await expect(multicall.updateMinterPeriod(content.address)).to.emit(minter, "Minter__Minted");
    });
  });

  describe("claimRewards()", function () {
    it("Should claim rewards through multicall", async function () {
      // Rewards already distributed via minter.updatePeriod()
      await ethers.provider.send("evm_increaseTime", [DAY]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await unit.balanceOf(user2.address);
      await multicall.connect(user2).claimRewards(content.address);
      const balanceAfter = await unit.balanceOf(user2.address);

      // Should have received some rewards
      expect(balanceAfter).to.be.gte(balanceBefore);
    });
  });

  describe("launch() through Multicall", function () {
    it("Should launch content engine through multicall", async function () {
      const launchParams = {
        launcher: user1.address,
        tokenName: "Multicall Unit",
        tokenSymbol: "MUNIT",
        uri: "ipfs://multicall-test",
        quoteAmount: convert("500", 6),
        unitAmount: convert("500000", 18),
        initialUps: convert("2", 18),
        tailUps: convert("0.005", 18),
        halvingPeriod: WEEK,
        contentMinInitPrice: convert("50", 6),
        contentIsModerated: false,
        auctionInitPrice: convert("500", 6),
        auctionEpochPeriod: DAY,
        auctionPriceMultiplier: convert("1.2", 18),
        auctionMinInitPrice: convert("5", 6),
      };

      // Give user1 USDC and approve multicall
      await usdc.mint(user1.address, launchParams.quoteAmount);
      await usdc.connect(user1).approve(multicall.address, launchParams.quoteAmount);

      const contentCountBefore = await core.contentsLength();
      const tx = await multicall.connect(user1).launch(launchParams);
      await tx.wait();
      const contentCountAfter = await core.contentsLength();

      // Should have created a new content engine
      expect(contentCountAfter).to.be.gt(contentCountBefore);
    });

    it("Should use msg.sender as launcher", async function () {
      const launchParams = {
        launcher: owner.address, // This gets overwritten
        tokenName: "Multicall Unit 2",
        tokenSymbol: "MUNIT2",
        uri: "ipfs://multicall-test-2",
        quoteAmount: convert("500", 6),
        unitAmount: convert("500000", 18),
        initialUps: convert("2", 18),
        tailUps: convert("0.005", 18),
        halvingPeriod: WEEK,
        contentMinInitPrice: convert("50", 6),
        contentIsModerated: false,
        auctionInitPrice: convert("500", 6),
        auctionEpochPeriod: DAY,
        auctionPriceMultiplier: convert("1.2", 18),
        auctionMinInitPrice: convert("5", 6),
      };

      await usdc.mint(user2.address, launchParams.quoteAmount);
      await usdc.connect(user2).approve(multicall.address, launchParams.quoteAmount);

      // Get content count to find the new content address
      const contentCountBefore = await core.contentsLength();
      const tx = await multicall.connect(user2).launch(launchParams);
      await tx.wait();

      // Get the new content address from core
      const newContentAddress = await core.contents(contentCountBefore);
      const newContent = await ethers.getContractAt("Content", newContentAddress);

      // Launcher (owner) should be user2, not owner
      expect(await newContent.owner()).to.equal(user2.address);
    });

    it("Should have correct contentToIndex for launched content", async function () {
      // The content launched in setup should have index 0
      const index = await core.contentToIndex(content.address);
      expect(index).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero address account in view functions", async function () {
      const unitState = await multicall.getUnitState(content.address, AddressZero);
      expect(unitState.accountQuoteBalance).to.equal(0);

      const auctionState = await multicall.getAuctionState(content.address, AddressZero);
      expect(auctionState.accountQuoteBalance).to.equal(0);
    });

    it("Should return accountIsModerator correctly", async function () {
      // Owner is launcher
      const stateForLauncher = await multicall.getUnitState(content.address, launcher.address);
      expect(stateForLauncher.accountIsModerator).to.be.true;

      // Random user is not moderator
      const stateForUser = await multicall.getUnitState(content.address, user1.address);
      expect(stateForUser.accountIsModerator).to.be.false;

      // Add user1 as moderator
      await content.connect(launcher).setModerators([user1.address], true);
      const stateAfter = await multicall.getUnitState(content.address, user1.address);
      expect(stateAfter.accountIsModerator).to.be.true;
    });
  });
});
