const { ethers } = require("hardhat");
const hre = require("hardhat");

// Constants
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);
const divDec = (amount, decimals = 18) => amount / 10 ** decimals;

// =============================================================================
// CONFIGURATION - UPDATE THESE FOR YOUR DEPLOYMENT
// =============================================================================

// Base Mainnet addresses
// For testing: leave addresses empty to deploy mocks
// For mainnet: set to real token addresses
let USDC_ADDRESS = "0xe90495BE187d434e23A9B1FeC0B6Ce039700870e"; // MockUSDC already deployed
const UNISWAP_V2_FACTORY = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6";
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

// Protocol settings
const PROTOCOL_FEE_ADDRESS = "0xbA366c82815983fF130C23CED78bD95E1F2c18EA"; // TODO: Set protocol fee recipient
const MULTISIG_ADDRESS = "0xeE0CB49D2805DA6bC0A979ddAd87bb793fbB765E";
const MIN_QUOTE_FOR_LAUNCH = convert("1", 6); // 1 USDC minimum

// Deployed Contract Addresses (paste after deployment)
const MOCK_USDC = "0xe90495BE187d434e23A9B1FeC0B6Ce039700870e";
const COIN_FACTORY = "0xd6127d8fFb103508e2992bF7eD3e42612A1e646A";
const CONTENT_FACTORY = "0x83B10085Ba26Cc56026FD44E62d8a5EdB6BDD984";
const MINTER_FACTORY = "0x802A6F4d2Ff28B8bC052861Bf1DD84fEbDA1dc3b";
const REWARDER_FACTORY = "0x308612C2547E171c58988c4D57C442e4803523ae";
const AUCTION_FACTORY = "0xE58D1bd1DC5841dA7AeA1269460a9396C7cec680";
const CORE = "0xf1fc02884D1D701fca31b8f90B309b726597424A";
const MULTICALL = "0xAEd96fA4549eCD551e06ff644e6Fe86BfEd6B3A6";

// =============================================================================
// STICKR CHANNEL LAUNCH PARAMETERS
// =============================================================================

const STICKR_LAUNCH_PARAMS = {
  launcher: MULTISIG_ADDRESS, // TODO: Set to the address that will own the channel
  tokenName: "Stickr",
  tokenSymbol: "STICKR",
  uri: "", // TODO: Set metadata URI
  quoteAmount: convert("1", 6), // 1 USDC to provide for LP
  coinAmount: convert("10000", 18), // 10,000 coins minted for initial LP
  initialUps: "1157407407407407407", // ~100K coins/day
  tailUps: "11574074074074074", // ~1K coins/day
  halvingPeriod: 2592000, // 30 days in seconds
  contentMinInitPrice: convert("1", 6), // 1 USDC minimum content price
  contentIsModerated: false,
  auctionInitPrice: convert("100", 6), // 100 USDC auction starting price
  auctionEpochPeriod: 604800, // 7 days in seconds
  auctionPriceMultiplier: convert("1.5", 18), // 1.5x price multiplier
  auctionMinInitPrice: convert("1", 6), // 1 USDC auction min price
};

// Contract Variables
let mockUsdc,
  coinFactory,
  contentFactory,
  minterFactory,
  rewarderFactory,
  auctionFactory,
  core,
  multicall;

// =============================================================================
// GET CONTRACTS
// =============================================================================

async function getContracts() {
  // Set USDC address from deployed mock or config
  if (MOCK_USDC) {
    USDC_ADDRESS = MOCK_USDC;
    mockUsdc = await ethers.getContractAt(
      "contracts/mocks/MockUSDC.sol:MockUSDC",
      MOCK_USDC,
    );
    console.log("Using MockUSDC at:", MOCK_USDC);
  } else if (USDC_ADDRESS) {
    console.log("Using USDC at:", USDC_ADDRESS);
  }

  if (COIN_FACTORY) {
    coinFactory = await ethers.getContractAt(
      "contracts/CoinFactory.sol:CoinFactory",
      COIN_FACTORY,
    );
  }

  if (CONTENT_FACTORY) {
    contentFactory = await ethers.getContractAt(
      "contracts/ContentFactory.sol:ContentFactory",
      CONTENT_FACTORY,
    );
  }

  if (MINTER_FACTORY) {
    minterFactory = await ethers.getContractAt(
      "contracts/MinterFactory.sol:MinterFactory",
      MINTER_FACTORY,
    );
  }

  if (REWARDER_FACTORY) {
    rewarderFactory = await ethers.getContractAt(
      "contracts/RewarderFactory.sol:RewarderFactory",
      REWARDER_FACTORY,
    );
  }

  if (AUCTION_FACTORY) {
    auctionFactory = await ethers.getContractAt(
      "contracts/AuctionFactory.sol:AuctionFactory",
      AUCTION_FACTORY,
    );
  }

  if (CORE) {
    core = await ethers.getContractAt("contracts/Core.sol:Core", CORE);
  }

  if (MULTICALL) {
    multicall = await ethers.getContractAt(
      "contracts/Multicall.sol:Multicall",
      MULTICALL,
    );
  }

  console.log("Contracts Retrieved");
}

// =============================================================================
// DEPLOY FUNCTIONS
// =============================================================================

async function deployMockUSDC() {
  console.log("Starting MockUSDC Deployment");
  const artifact = await ethers.getContractFactory("MockUSDC");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  mockUsdc = await contract.deployed();
  USDC_ADDRESS = mockUsdc.address;
  await sleep(5000);
  console.log("MockUSDC Deployed at:", mockUsdc.address);
}

async function deployCoinFactory() {
  console.log("Starting CoinFactory Deployment");
  const artifact = await ethers.getContractFactory("CoinFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  coinFactory = await contract.deployed();
  await sleep(5000);
  console.log("CoinFactory Deployed at:", coinFactory.address);
}

async function deployContentFactory() {
  console.log("Starting ContentFactory Deployment");
  const artifact = await ethers.getContractFactory("ContentFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  contentFactory = await contract.deployed();
  await sleep(5000);
  console.log("ContentFactory Deployed at:", contentFactory.address);
}

async function deployMinterFactory() {
  console.log("Starting MinterFactory Deployment");
  const artifact = await ethers.getContractFactory("MinterFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  minterFactory = await contract.deployed();
  await sleep(5000);
  console.log("MinterFactory Deployed at:", minterFactory.address);
}

async function deployRewarderFactory() {
  console.log("Starting RewarderFactory Deployment");
  const artifact = await ethers.getContractFactory("RewarderFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  rewarderFactory = await contract.deployed();
  await sleep(5000);
  console.log("RewarderFactory Deployed at:", rewarderFactory.address);
}

async function deployAuctionFactory() {
  console.log("Starting AuctionFactory Deployment");
  const artifact = await ethers.getContractFactory("AuctionFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  auctionFactory = await contract.deployed();
  await sleep(5000);
  console.log("AuctionFactory Deployed at:", auctionFactory.address);
}

async function deployCore() {
  console.log("Starting Core Deployment");

  if (!PROTOCOL_FEE_ADDRESS) {
    throw new Error("PROTOCOL_FEE_ADDRESS must be set before deployment");
  }
  if (!USDC_ADDRESS) {
    throw new Error(
      "USDC_ADDRESS must be set before deployment (deploy MockUSDC first or set address)",
    );
  }

  const artifact = await ethers.getContractFactory("Core");
  const contract = await artifact.deploy(
    USDC_ADDRESS,
    UNISWAP_V2_FACTORY,
    UNISWAP_V2_ROUTER,
    coinFactory.address,
    contentFactory.address,
    minterFactory.address,
    auctionFactory.address,
    rewarderFactory.address,
    PROTOCOL_FEE_ADDRESS,
    MIN_QUOTE_FOR_LAUNCH,
    { gasPrice: ethers.gasPrice },
  );
  core = await contract.deployed();
  await sleep(5000);
  console.log("Core Deployed at:", core.address);
}

async function deployMulticall() {
  console.log("Starting Multicall Deployment");
  if (!USDC_ADDRESS) {
    throw new Error("USDC_ADDRESS must be set before deployment");
  }
  const artifact = await ethers.getContractFactory("Multicall");
  const contract = await artifact.deploy(core.address, USDC_ADDRESS, {
    gasPrice: ethers.gasPrice,
  });
  multicall = await contract.deployed();
  await sleep(5000);
  console.log("Multicall Deployed at:", multicall.address);
}

// =============================================================================
// LAUNCH STICKR CHANNEL
// =============================================================================

async function launchStickr() {
  console.log("========== LAUNCHING STICKR CHANNEL ==========\n");

  const [wallet] = await ethers.getSigners();
  const params = STICKR_LAUNCH_PARAMS;

  console.log("Launch Parameters:");
  console.log("  Launcher:              ", params.launcher);
  console.log("  Token Name:            ", params.tokenName);
  console.log("  Token Symbol:          ", params.tokenSymbol);
  console.log("  URI:                   ", params.uri || "(empty)");
  console.log("  Quote Amount:          ", divDec(params.quoteAmount, 6));
  console.log("  Coin Amount:           ", divDec(params.coinAmount));
  console.log("  Initial UPS:           ", divDec(params.initialUps));
  console.log("  Tail UPS:              ", divDec(params.tailUps));
  console.log("  Halving Period:        ", params.halvingPeriod, "seconds");
  console.log(
    "  Content Min Init Price:",
    params.contentMinInitPrice.toString(),
  );
  console.log("  Content Is Moderated:  ", params.contentIsModerated);
  console.log("  Auction Init Price:    ", params.auctionInitPrice.toString());
  console.log(
    "  Auction Epoch Period:  ",
    params.auctionEpochPeriod,
    "seconds",
  );
  console.log(
    "  Auction Price Multi:   ",
    divDec(params.auctionPriceMultiplier),
  );
  console.log(
    "  Auction Min Init Price:",
    params.auctionMinInitPrice.toString(),
  );
  console.log("");

  // Approve USDC for Core
  console.log("Approving USDC for Core...");
  const quoteToken = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    USDC_ADDRESS,
  );
  const approveTx = await quoteToken.approve(core.address, params.quoteAmount);
  await approveTx.wait();
  console.log("USDC Approved");

  // Launch the channel
  console.log("Launching STICKR channel...");
  const tx = await core.launch(params, { gasPrice: ethers.gasPrice });
  const receipt = await tx.wait();
  console.log("STICKR Channel Launched! Tx:", receipt.transactionHash);

  // Parse the Core__Launched event to get deployed addresses
  const launchedEvent = receipt.events.find(
    (e) => e.event === "Core__Launched",
  );

  if (launchedEvent) {
    console.log("\n--- STICKR Deployed Contracts ---");
    console.log("  Content:  ", launchedEvent.args.content);
    console.log("  Coin:     ", launchedEvent.args.coin);
    console.log("  Minter:   ", launchedEvent.args.minter);
    console.log("  Rewarder: ", launchedEvent.args.rewarder);
    console.log("  Auction:  ", launchedEvent.args.auction);
    console.log("  LP Token: ", launchedEvent.args.lpToken);
  }

  console.log("\n========== STICKR CHANNEL LAUNCHED ==========\n");
  return launchedEvent?.args;
}

// =============================================================================
// VERIFY FUNCTIONS
// =============================================================================

async function verifyCoinFactory() {
  console.log("Starting CoinFactory Verification");
  await hre.run("verify:verify", {
    address: coinFactory?.address || COIN_FACTORY,
    contract: "contracts/CoinFactory.sol:CoinFactory",
    constructorArguments: [],
  });
  console.log("CoinFactory Verified");
}

async function verifyContentFactory() {
  console.log("Starting ContentFactory Verification");
  await hre.run("verify:verify", {
    address: contentFactory?.address || CONTENT_FACTORY,
    contract: "contracts/ContentFactory.sol:ContentFactory",
    constructorArguments: [],
  });
  console.log("ContentFactory Verified");
}

async function verifyMinterFactory() {
  console.log("Starting MinterFactory Verification");
  await hre.run("verify:verify", {
    address: minterFactory?.address || MINTER_FACTORY,
    contract: "contracts/MinterFactory.sol:MinterFactory",
    constructorArguments: [],
  });
  console.log("MinterFactory Verified");
}

async function verifyRewarderFactory() {
  console.log("Starting RewarderFactory Verification");
  await hre.run("verify:verify", {
    address: rewarderFactory?.address || REWARDER_FACTORY,
    contract: "contracts/RewarderFactory.sol:RewarderFactory",
    constructorArguments: [],
  });
  console.log("RewarderFactory Verified");
}

async function verifyAuctionFactory() {
  console.log("Starting AuctionFactory Verification");
  await hre.run("verify:verify", {
    address: auctionFactory?.address || AUCTION_FACTORY,
    contract: "contracts/AuctionFactory.sol:AuctionFactory",
    constructorArguments: [],
  });
  console.log("AuctionFactory Verified");
}

async function verifyCore() {
  console.log("Starting Core Verification");
  await hre.run("verify:verify", {
    address: core?.address || CORE,
    contract: "contracts/Core.sol:Core",
    constructorArguments: [
      USDC_ADDRESS,
      UNISWAP_V2_FACTORY,
      UNISWAP_V2_ROUTER,
      coinFactory?.address || COIN_FACTORY,
      contentFactory?.address || CONTENT_FACTORY,
      minterFactory?.address || MINTER_FACTORY,
      auctionFactory?.address || AUCTION_FACTORY,
      rewarderFactory?.address || REWARDER_FACTORY,
      PROTOCOL_FEE_ADDRESS,
      MIN_QUOTE_FOR_LAUNCH,
    ],
  });
  console.log("Core Verified");
}

async function verifyMulticall() {
  console.log("Starting Multicall Verification");
  await hre.run("verify:verify", {
    address: multicall?.address || MULTICALL,
    contract: "contracts/Multicall.sol:Multicall",
    constructorArguments: [core?.address || CORE, USDC_ADDRESS],
  });
  console.log("Multicall Verified");
}

async function verifyMockUSDC() {
  console.log("Starting MockUSDC Verification");
  await hre.run("verify:verify", {
    address: mockUsdc?.address || MOCK_USDC,
    contract: "contracts/mocks/MockUSDC.sol:MockUSDC",
    constructorArguments: [],
  });
  console.log("MockUSDC Verified");
}

async function verifyCoinByContentIndex(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const contentContract = await ethers.getContractAt("Content", contentAddress);
  const coinAddress = await contentContract.coin();
  const coin = await ethers.getContractAt(
    "contracts/Coin.sol:Coin",
    coinAddress,
  );

  const name = await coin.name();
  const symbol = await coin.symbol();

  console.log("Starting Coin Verification for:", coinAddress);
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);

  await hre.run("verify:verify", {
    address: coinAddress,
    contract: "contracts/Coin.sol:Coin",
    constructorArguments: [name, symbol],
  });
  console.log("Coin Verified:", coinAddress);
}

async function verifyContentByIndex(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const content = await ethers.getContractAt(
    "contracts/Content.sol:Content",
    contentAddress,
  );

  // Read constructor args from the deployed contract
  const coinAddress = await content.coin();
  const quoteAddress = await content.quote();
  const treasury = await content.treasury();
  const team = await content.team();
  const coreAddress = await content.core();
  const minInitPrice = await content.minInitPrice();
  const isModerated = await content.isModerated();
  const uri = await content.uri();
  const name = await content.name();
  const symbol = await content.symbol();

  console.log("Starting Content Verification for:", contentAddress);
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);
  console.log("  URI:", uri);
  console.log("  Coin:", coinAddress);
  console.log("  Quote:", quoteAddress);
  console.log("  Treasury:", treasury);
  console.log("  Team:", team);
  console.log("  Core:", coreAddress);
  console.log("  Min Init Price:", minInitPrice.toString());
  console.log("  Is Moderated:", isModerated);

  await hre.run("verify:verify", {
    address: contentAddress,
    contract: "contracts/Content.sol:Content",
    constructorArguments: [
      name,
      symbol,
      uri,
      coinAddress,
      quoteAddress,
      treasury,
      team,
      coreAddress,
      rewarderFactory?.address || REWARDER_FACTORY,
      minInitPrice,
      isModerated,
    ],
  });
  console.log("Content Verified:", contentAddress);
}

async function verifyMinterByContentIndex(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const contentContract = await ethers.getContractAt("Content", contentAddress);
  const coinAddress = await contentContract.coin();
  const coinContract = await ethers.getContractAt("Coin", coinAddress);
  const minterAddress = await coinContract.minter();
  const minter = await ethers.getContractAt(
    "contracts/Minter.sol:Minter",
    minterAddress,
  );

  // Read constructor args
  const minterCoinAddress = await minter.coin();
  const rewarderAddress = await minter.rewarder();
  const team = await minter.team();
  const initialUps = await minter.initialUps();
  const tailUps = await minter.tailUps();
  const halvingPeriod = await minter.halvingPeriod();

  console.log("Starting Minter Verification for:", minterAddress);
  console.log("  Coin:", coinAddress);
  console.log("  Rewarder:", rewarderAddress);
  console.log("  Team:", team);
  console.log("  Initial UPS:", initialUps.toString());
  console.log("  Tail UPS:", tailUps.toString());
  console.log("  Halving Period:", halvingPeriod.toString());

  await hre.run("verify:verify", {
    address: minterAddress,
    contract: "contracts/Minter.sol:Minter",
    constructorArguments: [
      coinAddress,
      rewarderAddress,
      team,
      initialUps,
      tailUps,
      halvingPeriod,
    ],
  });
  console.log("Minter Verified:", minterAddress);
}

async function verifyRewarderByContentIndex(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const contentContract = await ethers.getContractAt("Content", contentAddress);
  const rewarderAddress = await contentContract.rewarder();

  console.log("Starting Rewarder Verification for:", rewarderAddress);
  console.log("  Content:", contentAddress);

  await hre.run("verify:verify", {
    address: rewarderAddress,
    contract: "contracts/Rewarder.sol:Rewarder",
    constructorArguments: [contentAddress],
  });
  console.log("Rewarder Verified:", rewarderAddress);
}

async function verifyAuctionByContentIndex(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const auctionAddress = await core.contentToAuction(contentAddress);
  const auction = await ethers.getContractAt(
    "contracts/Auction.sol:Auction",
    auctionAddress,
  );

  // Read constructor args from the deployed contract
  const paymentToken = await auction.paymentToken();
  const paymentReceiver = await auction.paymentReceiver();
  const epochPeriod = await auction.epochPeriod();
  const priceMultiplier = await auction.priceMultiplier();
  const minInitPrice = await auction.minInitPrice();

  // Read current initPrice - this equals the constructor arg if epochId is still 0
  const epochId = await auction.epochId();
  const currentInitPrice = await auction.initPrice();
  const initPrice = epochId.eq(0) ? currentInitPrice : minInitPrice;

  if (!epochId.eq(0)) {
    console.log(
      "  WARNING: Auction has been used (epochId > 0). Using minInitPrice as initPrice.",
    );
    console.log(
      "  If verification fails, you may need to find the original auctionInitPrice from launch event.",
    );
  }

  console.log("Starting Auction Verification for:", auctionAddress);
  console.log("  Init Price:", initPrice.toString());
  console.log("  Payment Token:", paymentToken);
  console.log("  Payment Receiver:", paymentReceiver);
  console.log("  Epoch Period:", epochPeriod.toString());
  console.log("  Price Multiplier:", priceMultiplier.toString());
  console.log("  Min Init Price:", minInitPrice.toString());

  await hre.run("verify:verify", {
    address: auctionAddress,
    contract: "contracts/Auction.sol:Auction",
    constructorArguments: [
      initPrice,
      paymentToken,
      paymentReceiver,
      epochPeriod,
      priceMultiplier,
      minInitPrice,
    ],
  });
  console.log("Auction Verified:", auctionAddress);
}

// =============================================================================
// DEPLOY & VERIFY ALL SYSTEM CONTRACTS
// =============================================================================

async function deploySystem() {
  console.log("========== DEPLOYING SYSTEM CONTRACTS ==========\n");

  // 1. USDC already deployed, skip MockUSDC deployment
  // await deployMockUSDC();

  // 2. Deploy factories
  await deployCoinFactory();
  await deployContentFactory();
  await deployMinterFactory();
  await deployRewarderFactory();
  await deployAuctionFactory();

  // 3. Deploy core system
  await deployCore();
  await deployMulticall();

  console.log("\n========== SYSTEM CONTRACTS DEPLOYED ==========\n");
}

async function verifySystem() {
  console.log("========== VERIFYING SYSTEM CONTRACTS ==========\n");

  await verifyMockUSDC();
  await sleep(5000);
  await verifyCoinFactory();
  await sleep(5000);
  await verifyContentFactory();
  await sleep(5000);
  await verifyMinterFactory();
  await sleep(5000);
  await verifyRewarderFactory();
  await sleep(5000);
  await verifyAuctionFactory();
  await sleep(5000);
  await verifyCore();
  await sleep(5000);
  await verifyMulticall();

  console.log("\n========== SYSTEM CONTRACTS VERIFIED ==========\n");
}

async function verifyStickrContracts(contentIndex) {
  console.log(
    `========== VERIFYING STICKR CHANNEL (index ${contentIndex}) ==========\n`,
  );

  await verifyCoinByContentIndex(contentIndex);
  await sleep(5000);
  await verifyContentByIndex(contentIndex);
  await sleep(5000);
  await verifyMinterByContentIndex(contentIndex);
  await sleep(5000);
  await verifyRewarderByContentIndex(contentIndex);
  await sleep(5000);
  await verifyAuctionByContentIndex(contentIndex);

  console.log(`\n========== STICKR CHANNEL CONTRACTS VERIFIED ==========\n`);
}

// =============================================================================
// CONFIGURATION FUNCTIONS
// =============================================================================

async function setProtocolFeeAddress(newAddress) {
  console.log("Setting Protocol Fee Address to:", newAddress);
  const tx = await core.setProtocolFeeAddress(newAddress);
  await tx.wait();
  console.log("Protocol Fee Address updated");
}

async function setMinQuoteForLaunch(amount) {
  console.log("Setting Min Quote for Launch to:", divDec(amount, 6));
  const tx = await core.setMinQuoteForLaunch(amount);
  await tx.wait();
  console.log("Min Quote updated");
}

async function transferCoreOwnership(newOwner) {
  console.log("Transferring Core ownership to:", newOwner);
  const tx = await core.transferOwnership(newOwner);
  await tx.wait();
  console.log("Core ownership transferred");
}

async function mintMockUSDC(toAddress, amount) {
  if (!mockUsdc) {
    throw new Error("MockUSDC not deployed - cannot mint");
  }
  console.log("Minting", divDec(amount, 6), "MockUSDC to:", toAddress);
  const tx = await mockUsdc.mint(toAddress, amount);
  await tx.wait();
  console.log("MockUSDC minted");
}

// =============================================================================
// PRINT FUNCTIONS
// =============================================================================

async function printDeployment() {
  console.log("\n==================== DEPLOYMENT ====================\n");

  console.log("--- Configuration ---");
  console.log("USDC (Quote):        ", USDC_ADDRESS || "NOT SET");
  console.log("Uniswap V2 Factory:  ", UNISWAP_V2_FACTORY);
  console.log("Uniswap V2 Router:   ", UNISWAP_V2_ROUTER);
  console.log("Protocol Fee Address:", PROTOCOL_FEE_ADDRESS || "NOT SET");
  console.log("Min Quote for Launch:", divDec(MIN_QUOTE_FOR_LAUNCH, 6));

  console.log("\n--- Deployed Contracts ---");
  console.log(
    "MockUSDC:            ",
    mockUsdc?.address || MOCK_USDC || "NOT DEPLOYED (using real USDC)",
  );
  console.log(
    "CoinFactory:         ",
    coinFactory?.address || COIN_FACTORY || "NOT DEPLOYED",
  );
  console.log(
    "ContentFactory:      ",
    contentFactory?.address || CONTENT_FACTORY || "NOT DEPLOYED",
  );
  console.log(
    "MinterFactory:       ",
    minterFactory?.address || MINTER_FACTORY || "NOT DEPLOYED",
  );
  console.log(
    "RewarderFactory:     ",
    rewarderFactory?.address || REWARDER_FACTORY || "NOT DEPLOYED",
  );
  console.log(
    "AuctionFactory:      ",
    auctionFactory?.address || AUCTION_FACTORY || "NOT DEPLOYED",
  );
  console.log("Core:                ", core?.address || CORE || "NOT DEPLOYED");
  console.log(
    "Multicall:           ",
    multicall?.address || MULTICALL || "NOT DEPLOYED",
  );

  if (core) {
    console.log("\n--- Core State ---");
    console.log("Owner:               ", await core.owner());
    console.log("Protocol Fee Address:", await core.protocolFeeAddress());
    console.log(
      "Min Quote:           ",
      divDec(await core.minQuoteForLaunch(), 6),
    );
    console.log(
      "Deployed Contents:   ",
      (await core.contentsLength()).toString(),
    );
  }

  console.log("\n====================================================\n");
}

async function printCoreState() {
  console.log("\n--- Core State ---");
  console.log("Owner:               ", await core.owner());
  console.log("Protocol Fee Address:", await core.protocolFeeAddress());
  console.log("Quote (USDC):        ", await core.quote());
  console.log(
    "Min Quote:           ",
    divDec(await core.minQuoteForLaunch(), 6),
  );
  console.log("Coin Factory:        ", await core.coinFactory());
  console.log("Content Factory:     ", await core.contentFactory());
  console.log("Minter Factory:      ", await core.minterFactory());
  console.log("Rewarder Factory:    ", await core.rewarderFactory());
  console.log("Auction Factory:     ", await core.auctionFactory());
  console.log(
    "Deployed Contents:   ",
    (await core.contentsLength()).toString(),
  );
  console.log("");
}

async function printContentInfo(contentIndex) {
  const contentAddress = await core.contents(contentIndex);
  const contentContract = await ethers.getContractAt("Content", contentAddress);
  const coinAddress = await contentContract.coin();
  const coinContract = await ethers.getContractAt("Coin", coinAddress);
  const minterAddress = await coinContract.minter();
  const rewarderAddress = await contentContract.rewarder();
  const auctionAddress = await core.contentToAuction(contentAddress);
  const lpAddress = await core.contentToLP(contentAddress);

  const content = await ethers.getContractAt(
    "contracts/Content.sol:Content",
    contentAddress,
  );
  const coin = await ethers.getContractAt(
    "contracts/Coin.sol:Coin",
    coinAddress,
  );
  const minter = await ethers.getContractAt(
    "contracts/Minter.sol:Minter",
    minterAddress,
  );

  console.log("\n--- Content #" + contentIndex + " ---");
  console.log("Content:             ", contentAddress);
  console.log("  Name:              ", await content.name());
  console.log("  Symbol:            ", await content.symbol());
  console.log(
    "  Total Supply:      ",
    (await content.totalSupply()).toString(),
  );
  console.log("  Is Moderated:      ", await content.isModerated());
  console.log("  Treasury:          ", await content.treasury());
  console.log("  Team:              ", await content.team());
  console.log("Coin:                ", coinAddress);
  console.log("  Total Supply:      ", divDec(await coin.totalSupply()));
  console.log("Minter:              ", minterAddress);
  console.log("  Weekly Emission:   ", divDec(await minter.weeklyEmission()));
  console.log("  Current UPS:       ", (await minter.getUps()).toString());
  console.log("Rewarder:            ", rewarderAddress);
  console.log("Auction:             ", auctionAddress);
  console.log("LP Token:            ", lpAddress);
  console.log("");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("Using wallet:", wallet.address);
  console.log(
    "Account balance:",
    ethers.utils.formatEther(await wallet.getBalance()),
    "ETH",
  );
  console.log("");

  await getContracts();

  //===================================================================
  // 1. Deploy System Contracts
  //===================================================================

  await deploySystem();

  //===================================================================
  // 2. Verify System Contracts
  //===================================================================

  // await verifySystem();

  //===================================================================
  // 3. Launch STICKR Channel
  //===================================================================

  // await launchStickr();

  //===================================================================
  // 4. Verify STICKR Channel Contracts
  //===================================================================

  // const stickrIndex = (await core.contentsLength()) - 1;
  // await verifyStickrContracts(stickrIndex);

  //===================================================================
  // 5. Configuration (optional)
  //===================================================================

  // await setProtocolFeeAddress(PROTOCOL_FEE_ADDRESS);
  // await setMinQuoteForLaunch(MIN_QUOTE_FOR_LAUNCH);

  //===================================================================
  // 6. Transfer Ownership (optional)
  //===================================================================

  // await transferCoreOwnership(MULTISIG_ADDRESS);

  //===================================================================
  // Print Deployment
  //===================================================================

  await printDeployment();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
