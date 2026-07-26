const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;
const usdc = (value) => ethers.utils.parseUnits(value, 6);
const token = (value) => ethers.utils.parseUnits(value, 18);

describe("Reserve-backed Sticker economics", function () {
  async function deployFixture() {
    const [deployer, protocol, launcher, creator, user1, user2, user3] =
      await ethers.getSigners();

    const quote = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const uniswapFactory = await (
      await ethers.getContractFactory("MockUniswapV2Factory")
    ).deploy();
    const uniswapRouter = await (
      await ethers.getContractFactory("MockUniswapV2Router")
    ).deploy(uniswapFactory.address);

    const coinFactory = await (await ethers.getContractFactory("CoinFactory")).deploy();
    const contentFactory = await (await ethers.getContractFactory("ContentFactory")).deploy();
    const minterFactory = await (await ethers.getContractFactory("MinterFactory")).deploy();
    const rewarderFactory = await (await ethers.getContractFactory("RewarderFactory")).deploy();
    const auctionFactory = await (await ethers.getContractFactory("AuctionFactory")).deploy();

    const core = await (await ethers.getContractFactory("Core")).deploy(
      quote.address,
      uniswapFactory.address,
      uniswapRouter.address,
      coinFactory.address,
      contentFactory.address,
      minterFactory.address,
      auctionFactory.address,
      rewarderFactory.address,
      protocol.address,
      usdc("100")
    );

    for (const account of [launcher, creator, user1, user2, user3]) {
      await quote.mint(account.address, usdc("1000000"));
    }

    await quote.connect(launcher).approve(core.address, usdc("100"));
    const launchTx = await core.connect(launcher).launch({
      launcher: launcher.address,
      tokenName: "Reserve Test",
      tokenSymbol: "RSV",
      uri: "ipfs://channel",
      quoteAmount: usdc("100"),
      coinAmount: token("1000000"),
      initialUps: token("1"),
      tailUps: token("0.01"),
      halvingPeriod: WEEK,
      contentMinInitPrice: usdc("100"),
      contentIsModerated: false,
      auctionInitPrice: usdc("100"),
      auctionEpochPeriod: DAY,
      auctionPriceMultiplier: token("1.5"),
      auctionMinInitPrice: usdc("1"),
    });
    const receipt = await launchTx.wait();
    const launched = receipt.events.find((event) => event.event === "Core__Launched");
    const content = await ethers.getContractAt("Content", launched.args.content);
    const rewarder = await ethers.getContractAt("Rewarder", launched.args.rewarder);
    const coin = await ethers.getContractAt("Coin", launched.args.coin);
    const treasury = launched.args.auction;

    async function create(owner = creator, stickerCreator = creator) {
      await content
        .connect(stickerCreator)
        .create(owner.address, `ipfs://sticker-${await content.nextTokenId()}`);
      return content.nextTokenId();
    }

    async function collect(tokenId, payer, to = payer) {
      const maxPrice = await content.getPrice(tokenId);
      await quote.connect(payer).approve(content.address, maxPrice);
      const tx = await content.connect(payer).collect(
        to.address,
        tokenId,
        await content.idToEpochId(tokenId),
        ethers.constants.MaxUint256,
        maxPrice
      );
      const collection = (await tx.wait()).events.find(
        (event) => event.event === "Content__Collected"
      );
      return collection.args;
    }

    async function expectSolvent() {
      expect(await rewarder.totalSupply()).to.equal(await content.totalReserved());
      expect(await quote.balanceOf(content.address)).to.be.gte(
        (await content.totalReserved()).add(await content.totalClaimable())
      );
    }

    return {
      deployer,
      protocol,
      launcher,
      creator,
      user1,
      user2,
      user3,
      quote,
      core,
      content,
      rewarder,
      coin,
      treasury,
      create,
      collect,
      expectSolvent,
    };
  }

  it("locks only the first reserve as mining power", async function () {
    const { content, rewarder, quote, creator, user1, create, collect, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create();

    expect(await content.reserveOf(tokenId)).to.equal(0);
    expect(await content.nextReserveOf(tokenId)).to.equal(usdc("100"));
    expect(await content.getPrice(tokenId)).to.be.closeTo(usdc("200"), 2000);

    const result = await collect(tokenId, user1);
    expect(result.oldReserve).to.equal(0);
    expect(result.newReserve).to.equal(usdc("100"));
    expect(result.price).to.equal(result.newReserve.add(result.premium));
    expect(await content.reserveOf(tokenId)).to.equal(usdc("100"));
    expect(await rewarder.accountToBalance(user1.address)).to.equal(usdc("100"));
    expect(await rewarder.accountToBalance(creator.address)).to.equal(0);
    await expectSolvent();
    expect(await quote.balanceOf(content.address)).to.equal(
      (await content.totalReserved()).add(await content.totalClaimable())
    );
  });

  it("refunds a 100 reserve, locks 110, and splits only an approximately 50 premium", async function () {
    const {
      content,
      quote,
      creator,
      user1,
      user2,
      launcher,
      protocol,
      treasury,
      create,
      collect,
      expectSolvent,
    } = await loadFixture(deployFixture);
    const tokenId = await create();
    await collect(tokenId, user1);
    await content.claim(creator.address);

    await quote.connect(user2).approve(content.address, usdc("1000"));
    const start = await content.idToStartTime(tokenId);
    await network.provider.send("evm_setNextBlockTimestamp", [
      start.toNumber() + 47127,
    ]);
    await network.provider.send("evm_mine");

    const ownerClaimableBefore = await content.accountToClaimable(user1.address);
    const creatorClaimableBefore = await content.accountToClaimable(creator.address);
    const treasuryBefore = await content.accountToClaimable(treasury);
    const teamBefore = await content.accountToClaimable(launcher.address);
    const protocolBefore = await content.accountToClaimable(protocol.address);
    const maxPrice = await content.getPrice(tokenId);

    const tx = await content.connect(user2).collect(
      user2.address,
      tokenId,
      await content.idToEpochId(tokenId),
      ethers.constants.MaxUint256,
      maxPrice
    );
    const result = (await tx.wait()).events.find(
      (event) => event.event === "Content__Collected"
    ).args;

    expect(result.oldReserve).to.equal(usdc("100"));
    expect(result.newReserve).to.equal(usdc("110"));
    expect(result.premium).to.be.closeTo(usdc("50"), 2000);
    expect(result.price).to.equal(result.newReserve.add(result.premium));

    const ownerPremium = result.premium.mul(4000).div(10000);
    const creatorPremium = result.premium.mul(2000).div(10000);
    const teamPremium = result.premium.mul(500).div(10000);
    const protocolPremium = result.premium.mul(500).div(10000);
    const treasuryPremium = result.premium
      .sub(ownerPremium)
      .sub(creatorPremium)
      .sub(teamPremium)
      .sub(protocolPremium);

    expect(
      (await content.accountToClaimable(user1.address)).sub(ownerClaimableBefore)
    ).to.equal(result.oldReserve.add(ownerPremium));
    expect(
      (await content.accountToClaimable(creator.address)).sub(creatorClaimableBefore)
    ).to.equal(creatorPremium);
    expect((await content.accountToClaimable(treasury)).sub(treasuryBefore)).to.equal(treasuryPremium);
    expect((await content.accountToClaimable(launcher.address)).sub(teamBefore)).to.equal(teamPremium);
    expect((await content.accountToClaimable(protocol.address)).sub(protocolBefore)).to.equal(
      protocolPremium
    );

    await expectSolvent();
    await content.claim(user1.address);
    await content.claim(creator.address);
    await content.claim(treasury);
    await content.claim(launcher.address);
    await content.claim(protocol.address);
    expect(await quote.balanceOf(content.address)).to.equal(usdc("110"));
    await expectSolvent();
  });

  it("makes creator self-collection economically harmless", async function () {
    const { content, rewarder, quote, creator, launcher, protocol, treasury, create, collect, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create(creator, creator);
    const balanceBefore = await quote.balanceOf(creator.address);
    const result = await collect(tokenId, creator, creator);

    await content.claim(creator.address);
    await content.claim(treasury);
    await content.claim(launcher.address);
    await content.claim(protocol.address);
    const balanceAfter = await quote.balanceOf(creator.address);
    const premiumLeavingSelf = result.premium
      .sub(result.premium.mul(4000).div(10000))
      .sub(result.premium.mul(2000).div(10000));

    expect(balanceBefore.sub(balanceAfter)).to.equal(
      result.newReserve.add(premiumLeavingSelf)
    );
    expect(await rewarder.accountToBalance(creator.address)).to.equal(result.newReserve);
    expect(await quote.balanceOf(content.address)).to.equal(result.newReserve);
    await expectSolvent();
  });

  it("credits reserve-backed mining power to `to` when a different wallet pays", async function () {
    const { content, rewarder, quote, user1, user2, create, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create();
    const price = await content.getPrice(tokenId);
    await quote.connect(user1).approve(content.address, price);

    await content.connect(user1).collect(
      user2.address,
      tokenId,
      await content.idToEpochId(tokenId),
      ethers.constants.MaxUint256,
      price
    );

    expect(await content.ownerOf(tokenId)).to.equal(user2.address);
    expect(await rewarder.accountToBalance(user1.address)).to.equal(0);
    expect(await rewarder.accountToBalance(user2.address)).to.equal(
      await content.reserveOf(tokenId)
    );
    await expectSolvent();
  });

  it("routes disabled team and protocol premium shares to treasury", async function () {
    const {
      deployer,
      core,
      content,
      quote,
      launcher,
      creator,
      user1,
      treasury,
      create,
      collect,
      expectSolvent,
    } = await loadFixture(deployFixture);
    await content.connect(launcher).setTeam(ethers.constants.AddressZero);
    await core.connect(deployer).setProtocolFeeAddress(ethers.constants.AddressZero);
    const tokenId = await create();
    const treasuryBefore = await content.accountToClaimable(treasury);

    const result = await collect(tokenId, user1);
    const ownerPremium = result.premium.mul(4000).div(10000);
    const creatorPremium = result.premium.mul(2000).div(10000);
    const expectedTreasury = result.premium.sub(ownerPremium).sub(creatorPremium);

    expect((await content.accountToClaimable(treasury)).sub(treasuryBefore)).to.equal(
      expectedTreasury
    );
    expect(await content.accountToClaimable(creator.address)).to.equal(
      ownerPremium.add(creatorPremium)
    );
    await expectSolvent();
  });

  it("keeps ten repeated controlled collections fully reserve-backed", async function () {
    const { content, rewarder, quote, creator, launcher, protocol, treasury, create, collect, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create(creator, creator);

    for (let i = 0; i < 10; i++) {
      const result = await collect(tokenId, creator, creator);
      await content.claim(creator.address);
      await content.claim(treasury);
      await content.claim(launcher.address);
      await content.claim(protocol.address);

      expect(await content.reserveOf(tokenId)).to.equal(result.newReserve);
      expect(await rewarder.accountToBalance(creator.address)).to.equal(result.newReserve);
      expect(await rewarder.totalSupply()).to.equal(await content.totalReserved());
      expect(await quote.balanceOf(content.address)).to.equal(await content.totalReserved());
      await expectSolvent();
    }
  });

  it("burns on surrender, removes stake, and refunds the full reserve after cooldown", async function () {
    const { content, rewarder, quote, user1, create, collect, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create();
    await collect(tokenId, user1);
    const reserve = await content.reserveOf(tokenId);

    await expect(content.connect(user1).surrender(tokenId)).to.be.revertedWith(
      "Content__SurrenderCooldown()"
    );
    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");

    const balanceBefore = await quote.balanceOf(user1.address);
    await expect(content.connect(user1).surrender(tokenId))
      .to.emit(content, "Content__Surrendered")
      .withArgs(user1.address, tokenId, reserve);

    expect((await quote.balanceOf(user1.address)).sub(balanceBefore)).to.equal(reserve);
    expect(await content.reserveOf(tokenId)).to.equal(0);
    expect(await rewarder.accountToBalance(user1.address)).to.equal(0);
    await expect(content.ownerOf(tokenId)).to.be.revertedWith(
      "ERC721: invalid token ID"
    );
    await expectSolvent();
  });

  it("never lets an expired premium make a reserve-backed Sticker free", async function () {
    const { content, rewarder, user1, create, collect, expectSolvent } =
      await loadFixture(deployFixture);
    const tokenId = await create();

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");

    expect(await content.premiumOf(tokenId)).to.equal(0);
    expect(await content.getPrice(tokenId)).to.equal(usdc("100"));
    const result = await collect(tokenId, user1);
    expect(result.premium).to.equal(0);
    expect(result.price).to.equal(result.newReserve);
    expect(await rewarder.accountToBalance(user1.address)).to.equal(usdc("100"));
    await expectSolvent();
  });

  it("accrues rewards in proportion to reserve-backed mining power", async function () {
    const {
      content,
      rewarder,
      launcher,
      user1,
      user2,
      user3,
      create,
      collect,
      expectSolvent,
    } = await loadFixture(deployFixture);
    const token1 = await create();
    const token2 = await create();

    await collect(token1, user1);
    await collect(token2, user2);
    await collect(token2, user3);

    const rewards = await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("Reward", "RWD");
    await content.connect(launcher).addReward(rewards.address);
    await rewards.mint(launcher.address, token("700"));
    await rewards.connect(launcher).approve(rewarder.address, token("700"));
    await rewarder.connect(launcher).notifyRewardAmount(rewards.address, token("700"));

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");

    const earned100 = await rewarder.earned(user1.address, rewards.address);
    const earned110 = await rewarder.earned(user3.address, rewards.address);
    expect(earned110.mul(1000).div(earned100).toNumber()).to.be.closeTo(1100, 5);
    expect(await rewarder.accountToBalance(user1.address)).to.equal(usdc("100"));
    expect(await rewarder.accountToBalance(user3.address)).to.equal(usdc("110"));
    await expectSolvent();
  });
});
