const { expect } = require("chai");
const { ethers, network, artifacts } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400;
const WEEK = 7 * DAY;
const usdc = (value) => ethers.utils.parseUnits(value, 6);
const token = (value) => ethers.utils.parseUnits(value, 18);

describe("Professional hardening regressions", function () {
  async function fixture() {
    const [deployer, protocol, launcher, creator, user1, user2, user3] =
      await ethers.getSigners();

    const quote = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const uniswapFactory = await (
      await ethers.getContractFactory("MockUniswapV2Factory")
    ).deploy();
    const router = await (
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
      router.address,
      coinFactory.address,
      contentFactory.address,
      minterFactory.address,
      auctionFactory.address,
      rewarderFactory.address,
      protocol.address,
      usdc("10")
    );
    const multicall = await (await ethers.getContractFactory("Multicall")).deploy(
      core.address,
      quote.address
    );

    for (const account of [launcher, creator, user1, user2, user3]) {
      await quote.mint(account.address, usdc("100000"));
    }

    await quote.connect(launcher).approve(core.address, usdc("100"));
    const tx = await core.connect(launcher).launch({
      launcher: launcher.address,
      tokenName: "Hardened",
      tokenSymbol: "HRD",
      uri: "ipfs://hardened",
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
    });
    const launched = (await tx.wait()).events.find((event) => event.event === "Core__Launched");
    const content = await ethers.getContractAt("Content", launched.args.content);
    const rewarder = await ethers.getContractAt("Rewarder", launched.args.rewarder);
    const minter = await ethers.getContractAt("Minter", launched.args.minter);
    const auction = await ethers.getContractAt("Auction", launched.args.auction);
    const coin = await ethers.getContractAt("Coin", launched.args.coin);
    const lp = await ethers.getContractAt("MockLP", launched.args.lpToken);

    async function create(owner = creator) {
      await content.connect(creator).create(owner.address, `ipfs://item-${await content.nextTokenId()}`);
      return content.nextTokenId();
    }

    async function collect(tokenId, payer, recipient = payer) {
      const price = await content.getPrice(tokenId);
      await quote.connect(payer).approve(content.address, price);
      return content.connect(payer).collect(
        recipient.address || recipient,
        tokenId,
        await content.idToEpochId(tokenId),
        ethers.constants.MaxUint256,
        price
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
      multicall,
      content,
      rewarder,
      minter,
      auction,
      coin,
      lp,
      create,
      collect,
      factories: { coinFactory, contentFactory, minterFactory, rewarderFactory, auctionFactory },
      router,
      uniswapFactory,
    };
  }

  it("keeps every deployed contract below EIP-170 with safety headroom", async function () {
    if (require("hardhat").__SOLIDITY_COVERAGE_RUNNING) this.skip();
    const names = [
      "Auction",
      "AuctionFactory",
      "Coin",
      "CoinFactory",
      "Content",
      "ContentFactory",
      "Core",
      "Minter",
      "MinterFactory",
      "Multicall",
      "Rewarder",
      "RewarderFactory",
    ];
    for (const name of names) {
      const artifact = await artifacts.readArtifact(name);
      const runtimeBytes = (artifact.deployedBytecode.length - 2) / 2;
      expect(runtimeBytes, `${name} runtime bytecode`).to.be.lte(23_000);
    }
  });

  it("rejects a router wired to a different AMM factory", async function () {
    const { quote, factories, router } = await loadFixture(fixture);
    const wrongFactory = await (
      await ethers.getContractFactory("MockUniswapV2Factory")
    ).deploy();
    await expect(
      (await ethers.getContractFactory("Core")).deploy(
        quote.address,
        wrongFactory.address,
        router.address,
        factories.coinFactory.address,
        factories.contentFactory.address,
        factories.minterFactory.address,
        factories.auctionFactory.address,
        factories.rewarderFactory.address,
        ethers.constants.AddressZero,
        0
      )
    ).to.be.revertedWith("Core__RouterFactoryMismatch()");
  });

  it("authorizes only the configured reward notifier and rejects short receipt", async function () {
    const { launcher, user1, content, rewarder, minter, coin } = await loadFixture(fixture);
    expect(await rewarder.tokenToNotifier(coin.address)).to.equal(minter.address);

    await coin.connect(user1).approve(rewarder.address, token("1"));
    await expect(
      rewarder.connect(user1).notifyRewardAmount(coin.address, token("1"))
    ).to.be.revertedWith("Rewarder__NotNotifier()");

    const feeToken = await (
      await ethers.getContractFactory("MockFeeOnTransferERC20")
    ).deploy();
    await content.connect(launcher).addReward(feeToken.address);
    await feeToken.mint(launcher.address, token("700"));
    await feeToken.connect(launcher).approve(rewarder.address, token("700"));
    await expect(
      rewarder.connect(launcher).notifyRewardAmount(feeToken.address, token("700"))
    ).to.be.revertedWith("Rewarder__IncorrectRewardAmount()");
  });

  it("pauses a reward stream while no reserve is staked", async function () {
    const { launcher, user1, content, rewarder, create, collect } = await loadFixture(fixture);
    const rewards = await (await ethers.getContractFactory("MockERC20")).deploy("Reward", "RWD");
    await content.connect(launcher).addReward(rewards.address);
    await rewards.mint(launcher.address, token("700"));
    await rewards.connect(launcher).approve(rewarder.address, token("700"));
    await rewarder.connect(launcher).notifyRewardAmount(rewards.address, token("700"));
    const finishBefore = (await rewarder.tokenToRewardData(rewards.address)).periodFinish;

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    const tokenId = await create();
    await collect(tokenId, user1);
    const finishAfter = (await rewarder.tokenToRewardData(rewards.address)).periodFinish;
    expect(finishAfter.sub(finishBefore).toNumber()).to.be.closeTo(DAY, 5);

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    expect(await rewarder.earned(user1.address, rewards.address)).to.be.closeTo(token("100"), token("0.01"));
  });

  it("accrues every payout as a solvent pull liability", async function () {
    const { protocol, launcher, creator, user1, content, quote, auction, create, collect } =
      await loadFixture(fixture);
    const tokenId = await create();
    const tx = await collect(tokenId, user1);
    const result = (await tx.wait()).events.find((event) => event.event === "Content__Collected").args;

    const ownerAndCreator = result.premium.mul(4000).div(10000)
      .add(result.premium.mul(2000).div(10000));
    expect(await content.accountToClaimable(creator.address)).to.equal(ownerAndCreator);
    expect(await content.accountToClaimable(auction.address)).to.equal(
      result.premium.mul(3000).div(10000).add(
        result.premium.sub(
          result.premium.mul(4000).div(10000)
            .add(result.premium.mul(2000).div(10000))
            .add(result.premium.mul(3000).div(10000))
            .add(result.premium.mul(500).div(10000))
            .add(result.premium.mul(500).div(10000))
        )
      )
    );
    expect(await content.accountToClaimable(launcher.address)).to.equal(result.premium.mul(500).div(10000));
    expect(await content.accountToClaimable(protocol.address)).to.equal(result.premium.mul(500).div(10000));
    expect(await quote.balanceOf(content.address)).to.equal(
      (await content.totalReserved()).add(await content.totalClaimable())
    );
  });

  it("never refunds a prefunded Multicall balance to the next collector", async function () {
    const { creator, user1, quote, multicall, content, create } = await loadFixture(fixture);
    const tokenId = await create();
    const stranded = usdc("123");
    await quote.connect(creator).transfer(multicall.address, stranded);

    const price = await content.getPrice(tokenId);
    const maxPrice = price.add(usdc("7"));
    await quote.connect(user1).approve(multicall.address, maxPrice);
    const userBefore = await quote.balanceOf(user1.address);
    const tx = await multicall.connect(user1).collect(
      content.address,
      tokenId,
      await content.idToEpochId(tokenId),
      ethers.constants.MaxUint256,
      maxPrice
    );
    const collected = (await tx.wait()).events.find(
      (event) => event.address === content.address && event.topics[0] === content.interface.getEventTopic("Content__Collected")
    );
    const actualPrice = content.interface.parseLog(collected).args.price;

    expect(await quote.balanceOf(multicall.address)).to.equal(stranded);
    expect(userBefore.sub(await quote.balanceOf(user1.address))).to.equal(actualPrice);
    expect(await quote.allowance(multicall.address, content.address)).to.equal(0);
  });

  it("rejects an incompatible NFT recipient without changing reserve state", async function () {
    const { user1, quote, content, create } = await loadFixture(fixture);
    const tokenId = await create();
    const badReceiver = await (await ethers.getContractFactory("MockNonNFTReceiver")).deploy();
    const price = await content.getPrice(tokenId);
    await quote.connect(user1).approve(content.address, price);

    await expect(
      content.connect(user1).collect(
        badReceiver.address,
        tokenId,
        0,
        ethers.constants.MaxUint256,
        price
      )
    ).to.be.revertedWith("ERC721: transfer to non ERC721Receiver implementer");
    expect(await content.reserveOf(tokenId)).to.equal(0);
    expect(await content.totalReserved()).to.equal(0);
  });

  it("enforces the auction floor and validates recipients and assets", async function () {
    const { user1, quote, auction, lp } = await loadFixture(fixture);
    await network.provider.send("evm_increaseTime", [DAY + 1]);
    await network.provider.send("evm_mine");
    const price = await auction.getPrice();
    expect(price).to.equal(await auction.minInitPrice());
    await lp.mint(user1.address, price.mul(2));
    await lp.connect(user1).approve(auction.address, price.mul(2));
    await quote.mint(auction.address, usdc("1"));

    await expect(
      auction.connect(user1).buy(
        [quote.address],
        ethers.constants.AddressZero,
        0,
        ethers.constants.MaxUint256,
        price
      )
    ).to.be.revertedWith("Auction__InvalidAssetsReceiver()");
    await expect(
      auction.connect(user1).buy(
        [user1.address],
        user1.address,
        0,
        ethers.constants.MaxUint256,
        price
      )
    ).to.be.revertedWith("Auction__InvalidAsset()");
  });

  it("maintains reserve, ownership, supply, and solvency invariants through a state machine", async function () {
    const {
      launcher,
      creator,
      user1,
      user2,
      user3,
      quote,
      content,
      rewarder,
      minter,
      create,
      collect,
    } = await loadFixture(fixture);
    const users = [creator, user1, user2, user3];
    const active = [];
    const surrendered = [];
    for (let i = 0; i < 4; i++) active.push(await create(users[i]));

    let seed = 0x5eed1234;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    for (let step = 0; step < 48; step++) {
      const operation = active.length === 0 ? 0 : random() % 8;
      if (operation === 0) {
        active.push(await create(users[random() % users.length]));
      } else if (operation <= 2) {
        await collect(active[random() % active.length], users[random() % users.length]);
      } else if (operation === 3) {
        const beneficiary = users[random() % users.length];
        if ((await content.accountToClaimable(beneficiary.address)).gt(0)) {
          await content.claim(beneficiary.address);
        }
      } else if (operation === 4) {
        await network.provider.send("evm_increaseTime", [6 * 60 * 60]);
        await network.provider.send("evm_mine");
      } else if (operation === 5) {
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        const eligible = [];
        for (let i = 0; i < active.length; i++) {
          const reserve = await content.reserveOf(active[i]);
          const collectedAt = await content.idToLastCollectedAt(active[i]);
          if (reserve.gt(0) && now >= collectedAt.toNumber() + DAY) eligible.push(i);
        }
        if (eligible.length === 0) {
          await network.provider.send("evm_increaseTime", [DAY]);
          await network.provider.send("evm_mine");
        } else {
          const activeIndex = eligible[random() % eligible.length];
          const tokenId = active[activeIndex];
          const owner = await content.ownerOf(tokenId);
          const ownerSigner = users.find((user) => user.address === owner);
          await content.connect(ownerSigner).surrender(tokenId);
          surrendered.push(tokenId);
          active.splice(activeIndex, 1);
        }
      } else if (operation === 6) {
        await minter.updatePeriod();
        await rewarder["getReward(address)"](users[random() % users.length].address);
      } else {
        await content.connect(launcher).setTeam(users[random() % users.length].address);
      }

      let reserveSum = ethers.constants.Zero;
      const expectedByOwner = new Map(users.map((user) => [user.address, ethers.constants.Zero]));
      for (const id of active) {
        const reserve = await content.reserveOf(id);
        reserveSum = reserveSum.add(reserve);
        const owner = await content.ownerOf(id);
        expectedByOwner.set(owner, expectedByOwner.get(owner).add(reserve));
      }
      expect(await content.totalSupply()).to.equal(active.length);
      expect(await content.totalReserved()).to.equal(reserveSum);
      expect(await rewarder.totalSupply()).to.equal(reserveSum);
      for (const user of users) {
        expect(await rewarder.accountToBalance(user.address)).to.equal(expectedByOwner.get(user.address));
      }
      for (const tokenId of surrendered) {
        expect(await content.reserveOf(tokenId)).to.equal(0);
        expect(await content.nextReserveOf(tokenId)).to.equal(0);
      }
      expect(await quote.balanceOf(content.address)).to.be.gte(
        reserveSum.add(await content.totalClaimable())
      );
    }
  });
});
