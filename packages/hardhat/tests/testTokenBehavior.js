const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86_400;
const WEEK = 7 * DAY;
const usdc = (value) => ethers.utils.parseUnits(value, 6);
const token = (value) => ethers.utils.parseUnits(value, 18);

describe("Adversarial ERC20 behavior", function () {
  async function fixture() {
    const [deployer, protocol, launcher, creator, user1, user2] = await ethers.getSigners();
    const quote = await (await ethers.getContractFactory("MockBlacklistERC20")).deploy();
    const uniswapFactory = await (await ethers.getContractFactory("MockUniswapV2Factory")).deploy();
    const router = await (await ethers.getContractFactory("MockUniswapV2Router")).deploy(uniswapFactory.address);
    const factories = {};
    for (const name of ["Coin", "Content", "Minter", "Rewarder", "Auction"]) {
      factories[name] = await (await ethers.getContractFactory(`${name}Factory`)).deploy();
    }
    const core = await (await ethers.getContractFactory("Core")).deploy(
      quote.address,
      uniswapFactory.address,
      router.address,
      factories.Coin.address,
      factories.Content.address,
      factories.Minter.address,
      factories.Auction.address,
      factories.Rewarder.address,
      protocol.address,
      usdc("10")
    );
    for (const actor of [launcher, creator, user1, user2]) await quote.mint(actor.address, usdc("100000"));
    await quote.connect(launcher).approve(core.address, usdc("100"));
    const receipt = await (await core.connect(launcher).launch({
      launcher: launcher.address,
      tokenName: "Adversarial",
      tokenSymbol: "ADV",
      uri: "ipfs://adversarial",
      quoteAmount: usdc("100"),
      coinAmount: token("1000000"),
      initialUps: token("1"),
      tailUps: token("0.01"),
      halvingPeriod: WEEK,
      contentMinInitPrice: usdc("10"),
      contentIsModerated: false,
      auctionInitPrice: token("1"),
      auctionEpochPeriod: DAY,
      auctionPriceMultiplier: token("1.5"),
      auctionMinInitPrice: 1_000_000,
    })).wait();
    const launched = receipt.events.find((event) => event.event === "Core__Launched").args;
    return {
      launcher,
      creator,
      user1,
      user2,
      quote,
      content: await ethers.getContractAt("Content", launched.content),
      rewarder: await ethers.getContractAt("Rewarder", launched.rewarder),
      coin: await ethers.getContractAt("Coin", launched.coin),
    };
  }

  async function createAndCollect(content, quote, creator, collector) {
    await content.connect(creator).create(creator.address, "ipfs://token-behavior");
    const tokenId = await content.nextTokenId();
    const price = await content.getPrice(tokenId);
    await quote.connect(collector).approve(content.address, price);
    await content.connect(collector).collect(
      collector.address,
      tokenId,
      await content.idToEpochId(tokenId),
      ethers.constants.MaxUint256,
      price
    );
    return tokenId;
  }

  it("keeps blacklisted USDC claims pull-based, atomic, and fully collateralized", async function () {
    const { creator, user1, user2, quote, content, rewarder } = await loadFixture(fixture);
    const tokenId = await createAndCollect(content, quote, creator, user1);
    const price = await content.getPrice(tokenId);
    await quote.connect(user2).approve(content.address, price);
    await content.connect(user2).collect(
      user2.address,
      tokenId,
      await content.idToEpochId(tokenId),
      ethers.constants.MaxUint256,
      price
    );
    const claimable = await content.accountToClaimable(user1.address);
    const balanceBefore = await quote.balanceOf(content.address);
    await quote.setBlacklisted(user1.address, true);

    await expect(content.claim(user1.address)).to.be.revertedWith("MockBlacklistERC20__Blacklisted()");
    expect(await content.accountToClaimable(user1.address)).to.equal(claimable);
    expect(await quote.balanceOf(content.address)).to.equal(balanceBefore);
    expect(await quote.balanceOf(content.address)).to.equal(
      (await content.totalReserved()).add(await content.totalClaimable())
    );
    expect(await rewarder.totalSupply()).to.equal(await content.totalReserved());
  });

  it("rejects false-return and reverting reward deposits without registering phantom rewards", async function () {
    const { launcher, content, rewarder } = await loadFixture(fixture);
    for (const [name, reason] of [
      ["MockFalseReturnERC20", "SafeERC20: ERC20 operation did not succeed"],
      ["MockRevertingERC20", "MockRevertingERC20__TransferBlocked()"],
    ]) {
      const asset = await (await ethers.getContractFactory(name)).deploy();
      await content.connect(launcher).addReward(asset.address);
      await asset.mint(launcher.address, token("700"));
      await asset.connect(launcher).approve(rewarder.address, token("700"));
      await expect(rewarder.connect(launcher).notifyRewardAmount(asset.address, token("700")))
        .to.be.revertedWith(reason);
      expect(await asset.balanceOf(rewarder.address)).to.equal(0);
      expect((await rewarder.tokenToRewardData(asset.address)).rewardRate).to.equal(0);
    }
  });

  it("isolates a blacklisted auxiliary reward while a healthy reward remains claimable", async function () {
    const { launcher, creator, user1, quote, content, rewarder, coin } = await loadFixture(fixture);
    await createAndCollect(content, quote, creator, user1);
    const blocked = await (await ethers.getContractFactory("MockBlacklistERC20")).deploy();
    await content.connect(launcher).addReward(blocked.address);
    await blocked.mint(launcher.address, token("700"));
    await blocked.connect(launcher).approve(rewarder.address, token("700"));
    await rewarder.connect(launcher).notifyRewardAmount(blocked.address, token("700"));
    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    const earnedBefore = await rewarder.earned(user1.address, blocked.address);
    await blocked.setBlacklisted(user1.address, true);

    await expect(rewarder["getReward(address,address)"](user1.address, blocked.address))
      .to.be.revertedWith("MockBlacklistERC20__Blacklisted()");
    expect(await rewarder.earned(user1.address, blocked.address)).to.equal(earnedBefore);
    await expect(rewarder["getReward(address,address)"](user1.address, coin.address)).to.not.be.reverted;
  });

  it("documents rebasing rewards as unsupported and fails claims atomically after negative rebase", async function () {
    const { launcher, creator, user1, quote, content, rewarder } = await loadFixture(fixture);
    await createAndCollect(content, quote, creator, user1);
    const rebasing = await (await ethers.getContractFactory("MockRebasingERC20")).deploy();
    await content.connect(launcher).addReward(rebasing.address);
    await rebasing.mint(launcher.address, token("700"));
    await rebasing.connect(launcher).approve(rewarder.address, token("700"));
    await rewarder.connect(launcher).notifyRewardAmount(rebasing.address, token("700"));
    await rebasing.rebaseDown(rewarder.address, token("700"));
    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    const earnedBefore = await rewarder.earned(user1.address, rebasing.address);

    await expect(rewarder["getReward(address,address)"](user1.address, rebasing.address))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance");
    expect(await rewarder.earned(user1.address, rebasing.address)).to.equal(earnedBefore);
  });
});
