const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const BASE_TIME = 1_800_000_000;
const DAY = 86_400;
const WEEK = 604_800;
const USDC = ethers.BigNumber.from(10).pow(6);
const TOKEN = ethers.BigNumber.from(10).pow(18);
const amount = (value, unit) => ethers.BigNumber.from(value).mul(unit);

async function at(timestamp, action) {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  return action();
}

async function main() {
  await network.provider.send("hardhat_reset");
  const [deployer, protocol, launcher, creator, user1, user2, user3] = await ethers.getSigners();
  const actors = { deployer, protocol, launcher, creator, user1, user2, user3 };
  let timestamp = BASE_TIME;
  const deploy = async (name, args = []) => at(timestamp, () => ethers.getContractFactory(name).then((f) => f.deploy(...args)));

  const quote = await deploy("MockUSDC");
  const uniswapFactory = await deploy("MockUniswapV2Factory");
  const router = await deploy("MockUniswapV2Router", [uniswapFactory.address]);
  const coinFactory = await deploy("CoinFactory");
  const contentFactory = await deploy("ContentFactory");
  const minterFactory = await deploy("MinterFactory");
  const rewarderFactory = await deploy("RewarderFactory");
  const auctionFactory = await deploy("AuctionFactory");
  const core = await deploy("Core", [
    quote.address,
    uniswapFactory.address,
    router.address,
    coinFactory.address,
    contentFactory.address,
    minterFactory.address,
    auctionFactory.address,
    rewarderFactory.address,
    protocol.address,
    amount(10, USDC),
  ]);

  for (const signer of [launcher, creator, user1, user2, user3]) {
    await at(timestamp, () => quote.mint(signer.address, amount(1_000_000_000, USDC)));
  }
  const params = {
    launcher: launcher.address,
    tokenName: "Stickr Verification",
    tokenSymbol: "STV",
    uri: "ipfs://verification",
    quoteAmount: amount(100, USDC),
    coinAmount: amount(1_000_000, TOKEN),
    initialUps: TOKEN,
    tailUps: TOKEN.div(100),
    halvingPeriod: WEEK,
    contentMinInitPrice: amount(100, USDC),
    contentIsModerated: false,
    auctionInitPrice: TOKEN,
    auctionEpochPeriod: DAY,
    auctionPriceMultiplier: ethers.BigNumber.from("1500000000000000000"),
    auctionMinInitPrice: ethers.BigNumber.from(1_000_000),
  };
  await at(timestamp, () => quote.connect(launcher).approve(core.address, params.quoteAmount));
  const launchReceipt = await (await at(timestamp, () => core.connect(launcher).launch(params))).wait();
  const launched = launchReceipt.events.find((event) => event.event === "Core__Launched").args;
  const coin = await ethers.getContractAt("Coin", launched.coin);
  const content = await ethers.getContractAt("Content", launched.content);
  const rewarder = await ethers.getContractAt("Rewarder", launched.rewarder);
  const minter = await ethers.getContractAt("Minter", launched.minter);
  const auction = await ethers.getContractAt("Auction", launched.auction);
  const lp = await ethers.getContractAt("MockLP", launched.lpToken);
  const snapshots = [];

  const n = (value) => value.toString();
  async function snapshot(scenario, tokenId, action, actor, recipient, values = []) {
    const liveToken = tokenId !== 0;
    snapshots.push({
      scenario,
      timestamp: String(timestamp),
      action,
      actor,
      recipient,
      eventAmount0: n(values[0] || 0),
      eventAmount1: n(values[1] || 0),
      eventAmount2: n(values[2] || 0),
      eventAmount3: n(values[3] || 0),
      tokenId: String(tokenId),
      reserve: liveToken ? n(await content.reserveOf(tokenId)) : "0",
      premium: liveToken ? n(await content.premiumOf(tokenId)) : "0",
      price: liveToken ? n(await content.getPrice(tokenId)) : "0",
      totalReserved: n(await content.totalReserved()),
      totalClaimable: n(await content.totalClaimable()),
      rewardTotalSupply: n(await rewarder.totalSupply()),
      contentQuoteBalance: n(await quote.balanceOf(content.address)),
      creatorWeight: n(await rewarder.accountToBalance(creator.address)),
      user1Weight: n(await rewarder.accountToBalance(user1.address)),
      user2Weight: n(await rewarder.accountToBalance(user2.address)),
      user3Weight: n(await rewarder.accountToBalance(user3.address)),
      creatorClaimable: n(await content.accountToClaimable(creator.address)),
      user1Claimable: n(await content.accountToClaimable(user1.address)),
      user2Claimable: n(await content.accountToClaimable(user2.address)),
      user3Claimable: n(await content.accountToClaimable(user3.address)),
      treasuryClaimable: n(await content.accountToClaimable(auction.address)),
      teamClaimable: n(await content.accountToClaimable(launcher.address)),
      protocolClaimable: n(await content.accountToClaimable(protocol.address)),
      user1Coin: n(await coin.balanceOf(user1.address)),
      auctionQuote: n(await quote.balanceOf(auction.address)),
      auctionEpoch: n(await auction.epochId()),
      deadLp: n(await lp.balanceOf(await core.DEAD_ADDRESS())),
    });
  }

  async function create(owner) {
    await (await at(timestamp, () => content.connect(creator).create(owner.address, "ipfs://sticker"))).wait();
    return (await content.nextTokenId()).toNumber();
  }

  async function collect(tokenId, payer, recipient) {
    // eth_call reads the latest mined block, whereas Foundry view calls observe the
    // already-warped timestamp. Mine an empty block when advancing time so every
    // pre-transaction quote is sampled at the exact execution timestamp.
    const latest = await ethers.provider.getBlock("latest");
    if (latest.timestamp !== timestamp) {
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
      await network.provider.send("evm_mine");
    }
    const price = await content.getPrice(tokenId);
    const oldReserve = await content.reserveOf(tokenId);
    const newReserve = await content.nextReserveOf(tokenId);
    const premium = await content.premiumOf(tokenId);
    await at(timestamp, () => quote.connect(payer).approve(content.address, price));
    await (await at(timestamp, () => content.connect(payer).collect(recipient.address, tokenId, awaitableEpoch, timestamp, price))).wait();
    return [price, oldReserve, newReserve, premium];
  }

  // Avoid a promise inside the transaction callback so timestamp setting remains the final RPC before send.
  let awaitableEpoch = 0;
  async function collectExact(tokenId, payer, recipient) {
    awaitableEpoch = await content.idToEpochId(tokenId);
    return collect(tokenId, payer, recipient);
  }

  await snapshot("channel-launch", 0, "launch", "launcher", "none");
  const first = await create(creator);
  let values = await collectExact(first, user1, user1);
  await snapshot("initial-collection", first, "collect", "user1", "user1", values);

  timestamp = BASE_TIME + 12 * 3600;
  values = await collectExact(first, user2, user3);
  await snapshot("sticker-resale", first, "collect", "user2", "user3", values);

  const self = await create(creator);
  values = await collectExact(self, creator, creator);
  await snapshot("creator-self-collection", self, "collect", "creator", "creator", values);

  const wash = await create(creator);
  const controlled = [creator, user1, user2, user3];
  for (let i = 0; i < 10; i++) values = await collectExact(wash, controlled[i % 4], controlled[i % 4]);
  await snapshot("ten-controlled-trades", wash, "collect", "user1", "user1", values);

  timestamp = (await minter.activePeriod()).toNumber() + WEEK;
  await (await at(timestamp, () => minter.updatePeriod())).wait();
  timestamp += DAY;
  await (await at(timestamp, () => rewarder["getReward(address,address)"](user1.address, coin.address))).wait();
  await snapshot("reward-emission-claim", wash, "reward-claim", "user1", "user1", [await coin.balanceOf(user1.address)]);

  const surrenderReserve = await content.reserveOf(first);
  await (await at(timestamp, () => content.connect(user3).surrender(first))).wait();
  await snapshot("surrender", 0, "surrender", "user3", "burned", [surrenderReserve, first]);

  const zeroPremium = await create(creator);
  timestamp += DAY;
  values = await collectExact(zeroPremium, user1, user1);
  await snapshot("premium-zero", zeroPremium, "collect", "user1", "user1", values);

  const treasuryClaim = await content.accountToClaimable(auction.address);
  await (await at(timestamp, () => content.claim(auction.address))).wait();
  const auctionPrice = await auction.getPrice();
  const auctionAssets = await quote.balanceOf(auction.address);
  await (await at(timestamp, () => lp.mint(user2.address, auctionPrice))).wait();
  await at(timestamp, () => lp.connect(user2).approve(auction.address, auctionPrice));
  await (await at(timestamp, () => auction.connect(user2).buy([quote.address], user2.address, 0, timestamp, auctionPrice))).wait();
  await snapshot("treasury-auction", zeroPremium, "auction-buy", "user2", "user2", [auctionPrice, auctionAssets, treasuryClaim]);

  await (await at(timestamp, () => content.connect(launcher).setTeam(creator.address))).wait();
  await (await at(timestamp, () => core.connect(deployer).setProtocolFeeAddress(creator.address))).wait();
  const overlap = await create(creator);
  values = await collectExact(overlap, creator, creator);
  await snapshot("role-overlap", overlap, "collect", "creator", "creator", values);

  async function failureSnapshot(scenario, from, contract, data) {
    let revertData;
    try {
      await network.provider.send("eth_call", [{ from: from.address, to: contract.address, data }, "latest"]);
    } catch (error) {
      revertData = error.data || error.error?.data;
    }
    if (!revertData || revertData.length < 10) throw new Error(`${scenario} unexpectedly succeeded or returned no selector`);
    await snapshot(scenario, 0, "revert", "user1", "none", [ethers.BigNumber.from(revertData.slice(0, 10))]);
  }

  await failureSnapshot(
    "failure-stale-epoch",
    user1,
    content,
    content.interface.encodeFunctionData("collect", [
      user1.address,
      overlap,
      (await content.idToEpochId(overlap)).add(1),
      timestamp,
      ethers.constants.MaxUint256,
    ])
  );
  await failureSnapshot(
    "failure-expired-deadline",
    user1,
    content,
    content.interface.encodeFunctionData("collect", [
      user1.address,
      overlap,
      await content.idToEpochId(overlap),
      timestamp - 1,
      ethers.constants.MaxUint256,
    ])
  );
  await failureSnapshot(
    "failure-max-price",
    user1,
    content,
    content.interface.encodeFunctionData("collect", [
      user1.address,
      overlap,
      await content.idToEpochId(overlap),
      timestamp,
      0,
    ])
  );
  await failureSnapshot(
    "failure-surrender-cooldown",
    creator,
    content,
    content.interface.encodeFunctionData("surrender", [overlap])
  );
  await failureSnapshot(
    "failure-rewarder-access",
    user1,
    rewarder,
    rewarder.interface.encodeFunctionData("deposit", [user1.address, 1])
  );

  const output = path.join(__dirname, "../foundry/snapshots/hardhat.json");
  fs.writeFileSync(output, `${JSON.stringify({ framework: "normalized", scenarios: snapshots })}\n`);
  console.log(`Hardhat differential snapshots: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
