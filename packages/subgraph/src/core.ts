import { BigInt } from "@graphprotocol/graph-ts";
import { Core__Launched as CoreLaunchedEvent } from "../generated/Core/Core";
import { Content as ContentTemplate, Rewarder as RewarderTemplate, Minter as MinterTemplate, UniswapV2Pair as UniswapV2PairTemplate } from "../generated/templates";
import { Directory, Channel, Account, ContractToChannel } from "../generated/schema";
import { ZERO_BD, ZERO_BI, ONE_BI, DIRECTORY_ID, BI_18, BI_6 } from "./constants";
import { convertTokenToDecimal } from "./helpers";

export function handleCoreLaunched(event: CoreLaunchedEvent): void {
  // Load or create Directory entity (singleton)
  let directory = Directory.load(DIRECTORY_ID);
  if (directory == null) {
    directory = new Directory(DIRECTORY_ID);
    directory.channelCount = ZERO_BI;
    directory.contentCount = ZERO_BI;
    directory.collectCount = ZERO_BI;
    directory.collectVolume = ZERO_BD;
    directory.totalStaked = ZERO_BD;
    directory.totalMinted = ZERO_BD;
    directory.creatorRevenue = ZERO_BD;
    directory.ownerRevenue = ZERO_BD;
    directory.treasuryRevenue = ZERO_BD;
    directory.teamRevenue = ZERO_BD;
    directory.protocolRevenue = ZERO_BD;
  }
  directory.channelCount = directory.channelCount.plus(ONE_BI);
  directory.save();

  // Load or create launcher Account
  let launcher = Account.load(event.params.launcher.toHexString());
  if (launcher == null) {
    launcher = new Account(event.params.launcher.toHexString());
    launcher.txCount = ZERO_BI;
    launcher.save();
  }

  // Create new Channel entity
  let channel = new Channel(event.params.content.toHexString());
  channel.index = directory.channelCount.minus(ONE_BI);
  channel.launcher = event.params.launcher.toHexString();

  // Contract addresses
  channel.unit = event.params.unit;
  channel.minter = event.params.minter;
  channel.rewarder = event.params.rewarder;
  channel.auction = event.params.auction;
  channel.lpToken = event.params.lpToken;
  channel.treasury = event.params.auction; // Treasury is the auction contract
  channel.team = event.params.launcher; // Team is the launcher initially

  // Metadata
  channel.name = event.params.tokenName;
  channel.symbol = event.params.tokenSymbol;
  channel.uri = event.params.uri;

  // Launch parameters
  channel.quoteAmount = convertTokenToDecimal(event.params.quoteAmount, BI_6);
  channel.unitAmount = convertTokenToDecimal(event.params.unitAmount, BI_18);
  channel.initialUps = event.params.initialUps;
  channel.tailUps = event.params.tailUps;
  channel.halvingPeriod = event.params.halvingPeriod;
  channel.minInitPrice = convertTokenToDecimal(event.params.contentMinInitPrice, BI_6);

  // Auction parameters
  channel.auctionInitPrice = convertTokenToDecimal(event.params.auctionInitPrice, BI_18);
  channel.auctionEpochPeriod = event.params.auctionEpochPeriod;
  channel.auctionPriceMultiplier = convertTokenToDecimal(event.params.auctionPriceMultiplier, BI_18);
  channel.auctionMinInitPrice = convertTokenToDecimal(event.params.auctionMinInitPrice, BI_18);

  // Moderation
  channel.isModerated = event.params.contentIsModerated;

  // Stats
  channel.txCount = ZERO_BI;
  channel.contentCount = ZERO_BI;
  channel.collectCount = ZERO_BI;
  channel.collectVolume = ZERO_BD;
  channel.totalStaked = ZERO_BD;
  channel.totalMinted = ZERO_BD;

  // Minter state
  channel.minterActivePeriod = ZERO_BI;
  channel.minterLastMintedAt = ZERO_BI;

  // Fee revenue
  channel.creatorRevenue = ZERO_BD;
  channel.ownerRevenue = ZERO_BD;
  channel.treasuryRevenue = ZERO_BD;
  channel.teamRevenue = ZERO_BD;
  channel.protocolRevenue = ZERO_BD;

  // Price/volume data
  channel.price = ZERO_BD;
  channel.reserveUnit = ZERO_BD;
  channel.reserveQuote = ZERO_BD;
  channel.liquidity = ZERO_BD;
  channel.volumeUnit = ZERO_BD;
  channel.volumeQuote = ZERO_BD;
  channel.swapTxCount = ZERO_BI;
  channel.lastSwapAt = ZERO_BI;

  // Timestamps
  channel.createdAt = event.block.timestamp;
  channel.createdAtBlock = event.block.number;
  channel.save();

  // Create lookup entities for rewarder and minter
  let rewarderLookup = new ContractToChannel(event.params.rewarder.toHexString());
  rewarderLookup.channel = event.params.content.toHexString();
  rewarderLookup.save();

  let minterLookup = new ContractToChannel(event.params.minter.toHexString());
  minterLookup.channel = event.params.content.toHexString();
  minterLookup.save();

  let lpLookup = new ContractToChannel(event.params.lpToken.toHexString());
  lpLookup.channel = event.params.content.toHexString();
  lpLookup.save();

  // Start indexing events from the new contracts
  ContentTemplate.create(event.params.content);
  RewarderTemplate.create(event.params.rewarder);
  MinterTemplate.create(event.params.minter);
  UniswapV2PairTemplate.create(event.params.lpToken);
}
