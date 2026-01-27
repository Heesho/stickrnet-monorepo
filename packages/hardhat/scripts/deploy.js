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
let USDC_ADDRESS = ""; // Set to "" to deploy MockUSDC, or "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" for Base mainnet
let DONUT_ADDRESS = ""; // Set to "" to deploy MockDONUT, or real DONUT address for mainnet
const UNISWAP_V2_FACTORY = "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6";
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

// Protocol settings
const PROTOCOL_FEE_ADDRESS = "0xbA366c82815983fF130C23CED78bD95E1F2c18EA"; // TODO: Set protocol fee recipient
const MULTISIG_ADDRESS = "0xeE0CB49D2805DA6bC0A979ddAd87bb793fbB765E";
const MIN_DONUT_FOR_LAUNCH = convert("1000", 18); // 1000 DONUT minimum

// Deployed Contract Addresses (paste after deployment)
const MOCK_USDC = "0xe90495BE187d434e23A9B1FeC0B6Ce039700870e"; // If deployed MockUSDC, paste address here
const MOCK_DONUT = "0xD50B69581362C60Ce39596B237C71e07Fc4F6fdA"; // If deployed MockDONUT, paste address here
const UNIT_FACTORY = "0xbF3C462Ce5dF1e8F6D0be76B672a6b78Ff6Fc1Fc";
const CONTENT_FACTORY = "0xd974D96602888aF4450C57CD3f91B9a5DC05DE8D";
const MINTER_FACTORY = "0x1674C567f546d919D44d02ef8cF41F0C57BA4FFD";
const REWARDER_FACTORY = "0x2D2F2c51C09401cD4491151Da5c942041534aCE0";
const AUCTION_FACTORY = "0x077810986420F2c70Ddc51F39411b1559a2Ac582";
const CORE = "0xb18239c80DB00213fA760Becb9892ff36CB9c7E1";
const MULTICALL = "0x406605f7F1f88f811d94f78EbdF55ceb3B345E36";

// Contract Variables
let mockUsdc,
  mockDonut,
  unitFactory,
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

  // Set DONUT address from deployed mock or config
  if (MOCK_DONUT) {
    DONUT_ADDRESS = MOCK_DONUT;
    mockDonut = await ethers.getContractAt(
      "contracts/mocks/MockDONUT.sol:MockDONUT",
      MOCK_DONUT,
    );
    console.log("Using MockDONUT at:", MOCK_DONUT);
  } else if (DONUT_ADDRESS) {
    console.log("Using DONUT at:", DONUT_ADDRESS);
  }

  if (UNIT_FACTORY) {
    unitFactory = await ethers.getContractAt(
      "contracts/UnitFactory.sol:UnitFactory",
      UNIT_FACTORY,
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

async function deployMockDONUT() {
  console.log("Starting MockDONUT Deployment");
  const artifact = await ethers.getContractFactory("MockDONUT");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  mockDonut = await contract.deployed();
  DONUT_ADDRESS = mockDonut.address;
  await sleep(5000);
  console.log("MockDONUT Deployed at:", mockDonut.address);
}

async function deployUnitFactory() {
  console.log("Starting UnitFactory Deployment");
  const artifact = await ethers.getContractFactory("UnitFactory");
  const contract = await artifact.deploy({ gasPrice: ethers.gasPrice });
  unitFactory = await contract.deployed();
  await sleep(5000);
  console.log("UnitFactory Deployed at:", unitFactory.address);
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
  if (!DONUT_ADDRESS) {
    throw new Error("DONUT_ADDRESS must be set before deployment");
  }
  if (!USDC_ADDRESS) {
    throw new Error(
      "USDC_ADDRESS must be set before deployment (deploy MockUSDC first or set address)",
    );
  }

  const artifact = await ethers.getContractFactory("Core");
  const contract = await artifact.deploy(
    USDC_ADDRESS,
    DONUT_ADDRESS,
    UNISWAP_V2_FACTORY,
    UNISWAP_V2_ROUTER,
    unitFactory.address,
    contentFactory.address,
    minterFactory.address,
    auctionFactory.address,
    rewarderFactory.address,
    PROTOCOL_FEE_ADDRESS,
    MIN_DONUT_FOR_LAUNCH,
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
  const contract = await artifact.deploy(
    core.address,
    USDC_ADDRESS,
    DONUT_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    },
  );
  multicall = await contract.deployed();
  await sleep(5000);
  console.log("Multicall Deployed at:", multicall.address);
}

// =============================================================================
// VERIFY FUNCTIONS
// =============================================================================

async function verifyUnitFactory() {
  console.log("Starting UnitFactory Verification");
  await hre.run("verify:verify", {
    address: unitFactory?.address || UNIT_FACTORY,
    contract: "contracts/UnitFactory.sol:UnitFactory",
    constructorArguments: [],
  });
  console.log("UnitFactory Verified");
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
      DONUT_ADDRESS,
      UNISWAP_V2_FACTORY,
      UNISWAP_V2_ROUTER,
      unitFactory?.address || UNIT_FACTORY,
      contentFactory?.address || CONTENT_FACTORY,
      minterFactory?.address || MINTER_FACTORY,
      auctionFactory?.address || AUCTION_FACTORY,
      rewarderFactory?.address || REWARDER_FACTORY,
      PROTOCOL_FEE_ADDRESS,
      MIN_DONUT_FOR_LAUNCH,
    ],
  });
  console.log("Core Verified");
}

async function verifyMulticall() {
  console.log("Starting Multicall Verification");
  await hre.run("verify:verify", {
    address: multicall?.address || MULTICALL,
    contract: "contracts/Multicall.sol:Multicall",
    constructorArguments: [core?.address || CORE, USDC_ADDRESS, DONUT_ADDRESS],
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

async function verifyMockDONUT() {
  console.log("Starting MockDONUT Verification");
  await hre.run("verify:verify", {
    address: mockDonut?.address || MOCK_DONUT,
    contract: "contracts/mocks/MockDONUT.sol:MockDONUT",
    constructorArguments: [],
  });
  console.log("MockDONUT Verified");
}

async function verifyUnitByContentIndex(contentIndex) {
  const contentAddress = await core.deployedContents(contentIndex);
  const unitAddress = await core.contentToUnit(contentAddress);
  const unit = await ethers.getContractAt(
    "contracts/Unit.sol:Unit",
    unitAddress,
  );

  const name = await unit.name();
  const symbol = await unit.symbol();

  console.log("Starting Unit Verification for:", unitAddress);
  console.log("  Name:", name);
  console.log("  Symbol:", symbol);

  await hre.run("verify:verify", {
    address: unitAddress,
    contract: "contracts/Unit.sol:Unit",
    constructorArguments: [name, symbol],
  });
  console.log("Unit Verified:", unitAddress);
}

async function verifyContentByIndex(contentIndex) {
  const contentAddress = await core.deployedContents(contentIndex);
  const content = await ethers.getContractAt(
    "contracts/Content.sol:Content",
    contentAddress,
  );

  // Read constructor args from the deployed contract
  const unitAddress = await content.unit();
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
  console.log("  Unit:", unitAddress);
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
      unitAddress,
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
  const contentAddress = await core.deployedContents(contentIndex);
  const minterAddress = await core.contentToMinter(contentAddress);
  const minter = await ethers.getContractAt(
    "contracts/Minter.sol:Minter",
    minterAddress,
  );

  // Read constructor args
  const unitAddress = await minter.unit();
  const rewarderAddress = await minter.rewarder();
  const team = await minter.team();
  const initialUps = await minter.initialUps();
  const tailUps = await minter.tailUps();
  const halvingPeriod = await minter.halvingPeriod();

  console.log("Starting Minter Verification for:", minterAddress);
  console.log("  Unit:", unitAddress);
  console.log("  Rewarder:", rewarderAddress);
  console.log("  Team:", team);
  console.log("  Initial UPS:", initialUps.toString());
  console.log("  Tail UPS:", tailUps.toString());
  console.log("  Halving Period:", halvingPeriod.toString());

  await hre.run("verify:verify", {
    address: minterAddress,
    contract: "contracts/Minter.sol:Minter",
    constructorArguments: [
      unitAddress,
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
  const contentAddress = await core.deployedContents(contentIndex);
  const rewarderAddress = await core.contentToRewarder(contentAddress);

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
  const contentAddress = await core.deployedContents(contentIndex);
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
// CONFIGURATION FUNCTIONS
// =============================================================================

async function setProtocolFeeAddress(newAddress) {
  console.log("Setting Protocol Fee Address to:", newAddress);
  const tx = await core.setProtocolFeeAddress(newAddress);
  await tx.wait();
  console.log("Protocol Fee Address updated");
}

async function setMinDonutForLaunch(amount) {
  console.log("Setting Min DONUT for Launch to:", divDec(amount));
  const tx = await core.setMinDonutForLaunch(amount);
  await tx.wait();
  console.log("Min DONUT updated");
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

async function mintMockDONUT(toAddress, amount) {
  if (!mockDonut) {
    throw new Error("MockDONUT not deployed - cannot mint");
  }
  console.log("Minting", divDec(amount, 18), "MockDONUT to:", toAddress);
  const tx = await mockDonut.mint(toAddress, amount);
  await tx.wait();
  console.log("MockDONUT minted");
}

// =============================================================================
// PRINT FUNCTIONS
// =============================================================================

async function printDeployment() {
  console.log("\n==================== DEPLOYMENT ====================\n");

  console.log("--- Configuration ---");
  console.log("USDC (Quote):        ", USDC_ADDRESS || "NOT SET");
  console.log("DONUT:               ", DONUT_ADDRESS || "NOT SET");
  console.log("Uniswap V2 Factory:  ", UNISWAP_V2_FACTORY);
  console.log("Uniswap V2 Router:   ", UNISWAP_V2_ROUTER);
  console.log("Protocol Fee Address:", PROTOCOL_FEE_ADDRESS || "NOT SET");
  console.log("Min DONUT for Launch:", divDec(MIN_DONUT_FOR_LAUNCH));

  console.log("\n--- Deployed Contracts ---");
  console.log(
    "MockUSDC:            ",
    mockUsdc?.address || MOCK_USDC || "NOT DEPLOYED (using real USDC)",
  );
  console.log(
    "MockDONUT:           ",
    mockDonut?.address || MOCK_DONUT || "NOT DEPLOYED (using real DONUT)",
  );
  console.log(
    "UnitFactory:         ",
    unitFactory?.address || UNIT_FACTORY || "NOT DEPLOYED",
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
      "Min DONUT:           ",
      divDec(await core.minDonutForLaunch()),
    );
    console.log(
      "Deployed Contents:   ",
      (await core.deployedContentsLength()).toString(),
    );
  }

  console.log("\n====================================================\n");
}

async function printCoreState() {
  console.log("\n--- Core State ---");
  console.log("Owner:               ", await core.owner());
  console.log("Protocol Fee Address:", await core.protocolFeeAddress());
  console.log("Quote (USDC):        ", await core.quote());
  console.log("DONUT:               ", await core.donutToken());
  console.log("Min DONUT:           ", divDec(await core.minDonutForLaunch()));
  console.log("Unit Factory:        ", await core.unitFactory());
  console.log("Content Factory:     ", await core.contentFactory());
  console.log("Minter Factory:      ", await core.minterFactory());
  console.log("Rewarder Factory:    ", await core.rewarderFactory());
  console.log("Auction Factory:     ", await core.auctionFactory());
  console.log(
    "Deployed Contents:   ",
    (await core.deployedContentsLength()).toString(),
  );
  console.log("");
}

async function printContentInfo(contentIndex) {
  const contentAddress = await core.deployedContents(contentIndex);
  const unitAddress = await core.contentToUnit(contentAddress);
  const minterAddress = await core.contentToMinter(contentAddress);
  const rewarderAddress = await core.contentToRewarder(contentAddress);
  const auctionAddress = await core.contentToAuction(contentAddress);
  const lpAddress = await core.contentToLP(contentAddress);

  const content = await ethers.getContractAt(
    "contracts/Content.sol:Content",
    contentAddress,
  );
  const unit = await ethers.getContractAt(
    "contracts/Unit.sol:Unit",
    unitAddress,
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
  console.log("Unit:                ", unitAddress);
  console.log("  Total Supply:      ", divDec(await unit.totalSupply()));
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
  // 1. Deploy System
  //===================================================================

  // console.log("Starting Deployment...");
  // await deployMockUSDC(); // Deploy MockUSDC for testing (skip for mainnet)
  // await deployMockDONUT(); // Deploy MockDONUT for testing (skip for mainnet)
  // await deployUnitFactory();
  // await deployContentFactory();
  // await deployMinterFactory();
  // await deployRewarderFactory();
  // await deployAuctionFactory();
  // await deployCore();
  // await deployMulticall();

  //===================================================================
  // 2. Verify Contracts
  //===================================================================

  // console.log("Starting Verification...");
  // await verifyMockUSDC(); // Only if MockUSDC was deployed
  // await sleep(5000);
  // await verifyMockDONUT(); // Only if MockDONUT was deployed
  // await sleep(5000);
  // await verifyUnitFactory();
  // await sleep(5000);
  // await verifyContentFactory();
  // await sleep(5000);
  // await verifyMinterFactory();
  // await sleep(5000);
  // await verifyRewarderFactory();
  // await sleep(5000);
  // await verifyAuctionFactory();
  // await sleep(5000);
  // await verifyCore();
  // await sleep(5000);
  // await verifyMulticall();

  // Verify launched content contracts
  // await verifyUnitByContentIndex(0);
  // await sleep(5000);
  // await verifyContentByIndex(0);
  // await sleep(5000);
  // await verifyMinterByContentIndex(0);
  // await sleep(5000);
  // await verifyRewarderByContentIndex(0);
  // await sleep(5000);
  // await verifyAuctionByContentIndex(0);

  //===================================================================
  // 3. Configuration (optional)
  //===================================================================

  // await setProtocolFeeAddress(PROTOCOL_FEE_ADDRESS);
  // console.log("Protocol Fee Address updated");

  // await setMinDonutForLaunch(MIN_DONUT_FOR_LAUNCH);
  // console.log("Min DONUT for Launch updated");

  //===================================================================
  // 4. Transfer Ownership (optional)
  //===================================================================

  // await transferCoreOwnership(MULTISIG_ADDRESS);
  // console.log("Core ownership transferred to:", MULTISIG_ADDRESS);

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
