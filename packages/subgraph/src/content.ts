import { BigInt } from "@graphprotocol/graph-ts";
import {
  Content__Created as ContentCreatedEvent,
  Content__Collected as ContentCollectedEvent,
  Content__Surrendered as ContentSurrenderedEvent,
  Content__Approved as ContentApprovedEvent,
  Content__IsModeratedSet as ContentIsModeratedSetEvent,
  Content__ModeratorsSet as ContentModeratorsSetEvent,
  Content__UriSet as ContentUriSetEvent,
  Content__TreasurySet as ContentTreasurySetEvent,
  Content__TeamSet as ContentTeamSetEvent,
} from "../generated/templates/Content/Content";
import {
  Directory,
  Channel,
  Account,
  ChannelAccount,
  ContentPosition,
  Collect,
  Moderator,
  ChannelDayData,
  ChannelHourData,
  ChannelMinuteData,
} from "../generated/schema";
import { IpfsMetadata as IpfsMetadataTemplate } from "../generated/templates";
import {
  ZERO_BD,
  ZERO_BI,
  ONE_BI,
  DIRECTORY_ID,
  BI_6,
  OWNER_FEE,
  CREATOR_FEE,
  TEAM_FEE,
  PROTOCOL_FEE,
  DIVISOR,
  RESERVE_MULTIPLIER,
  ADDRESS_ZERO,
} from "./constants";
import {
  convertTokenToDecimal,
  getContentPositionId,
  getCollectId,
  getChannelAccountId,
  getModeratorId,
  calculateFee,
  getDayTimestamp,
  getHourTimestamp,
  getMinuteTimestamp,
  getChannelDayDataId,
  getChannelHourDataId,
  getChannelMinuteDataId,
  extractIpfsPath,
} from "./helpers";

function getOrCreateAccount(address: string): Account {
  let account = Account.load(address);
  if (account == null) {
    account = new Account(address);
    account.txCount = ZERO_BI;
    account.save();
  }
  return account;
}

function getOrCreateChannelAccount(
  channelAddress: string,
  accountAddress: string
): ChannelAccount {
  let id = getChannelAccountId(channelAddress, accountAddress);
  let channelAccount = ChannelAccount.load(id);
  if (channelAccount == null) {
    channelAccount = new ChannelAccount(id);
    channelAccount.channel = channelAddress;
    channelAccount.account = accountAddress;
    channelAccount.collectCount = ZERO_BI;
    channelAccount.collectSpent = ZERO_BD;
    channelAccount.ownerEarned = ZERO_BD;
    channelAccount.contentCreated = ZERO_BI;
    channelAccount.creatorEarned = ZERO_BD;
    channelAccount.staked = ZERO_BD;
    channelAccount.rewardsClaimed = ZERO_BD;
  }
  return channelAccount;
}

export function handleContentCreated(event: ContentCreatedEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  let creatorAddress = event.params.to.toHexString();
  let tokenId = event.params.tokenId;

  // Get or create creator account
  let creator = getOrCreateAccount(creatorAddress);
  creator.txCount = creator.txCount.plus(ONE_BI);
  creator.save();

  // Get or create channel account for creator
  let creatorChannelAccount = getOrCreateChannelAccount(channelAddress, creatorAddress);
  creatorChannelAccount.contentCreated = creatorChannelAccount.contentCreated.plus(ONE_BI);
  creatorChannelAccount.save();

  // Create content position entity
  let contentId = getContentPositionId(channelAddress, tokenId);
  let content = new ContentPosition(contentId);
  content.channel = channelAddress;
  content.tokenId = tokenId;
  content.creator = creatorAddress;
  content.owner = creatorAddress;
  content.uri = event.params.uri;
  let metadataPath = extractIpfsPath(event.params.uri);
  if (metadataPath != null) {
    let resolvedMetadataPath = changetype<string>(metadataPath);
    content.metadata = resolvedMetadataPath;
    IpfsMetadataTemplate.create(resolvedMetadataPath);
  }
  content.isApproved = !channel.isModerated;
  content.epochId = ZERO_BI;
  content.startTime = event.block.timestamp;
  content.initPrice = channel.minInitPrice;
  content.stake = ZERO_BD;
  content.reserve = ZERO_BD;
  content.premiumStart = channel.minInitPrice;
  content.isActive = true;
  content.collectCount = ZERO_BI;
  content.collectVolume = ZERO_BD;
  content.createdAt = event.block.timestamp;
  content.createdAtBlock = event.block.number;
  content.save();

  // Update channel stats
  channel.txCount = channel.txCount.plus(ONE_BI);
  channel.contentCount = channel.contentCount.plus(ONE_BI);
  channel.save();

  // Update directory stats
  let directory = Directory.load(DIRECTORY_ID);
  if (directory != null) {
    directory.contentCount = directory.contentCount.plus(ONE_BI);
    directory.save();
  }
}

export function handleContentCollected(event: ContentCollectedEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  let collectorAddress = event.params.to.toHexString();
  let tokenId = event.params.tokenId;
  let epochId = event.params.epochId;
  let price = convertTokenToDecimal(event.params.price, BI_6);
  let oldReserve = convertTokenToDecimal(event.params.oldReserve, BI_6);
  let newReserve = convertTokenToDecimal(event.params.newReserve, BI_6);
  let premium = convertTokenToDecimal(event.params.premium, BI_6);

  let contentId = getContentPositionId(channelAddress, tokenId);
  let content = ContentPosition.load(contentId);
  if (content == null) return;

  let prevOwnerAddress = content.owner;
  let creatorAddress = content.creator;

  // Get or create collector account
  let collector = getOrCreateAccount(collectorAddress);
  collector.txCount = collector.txCount.plus(ONE_BI);
  collector.save();

  // Calculate fees
  let ownerFee = calculateFee(premium, OWNER_FEE);
  let creatorFee = calculateFee(premium, CREATOR_FEE);
  let teamFee =
    channel.team.toHexString() == ADDRESS_ZERO
      ? ZERO_BD
      : calculateFee(premium, TEAM_FEE);
  let directoryForFees = Directory.load(DIRECTORY_ID);
  let protocolFee =
    directoryForFees != null &&
    directoryForFees.protocolFeeAddress.toHexString() != ADDRESS_ZERO
      ? calculateFee(premium, PROTOCOL_FEE)
      : ZERO_BD;
  let treasuryFee = premium.minus(ownerFee).minus(creatorFee).minus(teamFee).minus(protocolFee);

  // Update previous owner earnings
  getOrCreateAccount(prevOwnerAddress);
  let prevOwnerChannelAccount = getOrCreateChannelAccount(channelAddress, prevOwnerAddress);
  prevOwnerChannelAccount.ownerEarned = prevOwnerChannelAccount.ownerEarned.plus(ownerFee);
  prevOwnerChannelAccount.save();

  // Update creator earnings
  getOrCreateAccount(creatorAddress);
  let creatorChannelAccount = getOrCreateChannelAccount(channelAddress, creatorAddress);
  creatorChannelAccount.creatorEarned = creatorChannelAccount.creatorEarned.plus(creatorFee);
  creatorChannelAccount.save();

  // Update collector stats
  let collectorChannelAccount = getOrCreateChannelAccount(channelAddress, collectorAddress);
  collectorChannelAccount.collectCount = collectorChannelAccount.collectCount.plus(ONE_BI);
  collectorChannelAccount.collectSpent = collectorChannelAccount.collectSpent.plus(price);
  collectorChannelAccount.save();

  // Create collect entity
  let collectId = getCollectId(channelAddress, tokenId, epochId);
  let collect = new Collect(collectId);
  collect.channel = channelAddress;
  collect.content = contentId;
  collect.collector = collectorAddress;
  collect.prevOwner = prevOwnerAddress;
  collect.creator = creatorAddress;
  collect.tokenId = tokenId;
  collect.epochId = epochId;
  collect.price = price;
  collect.oldReserve = oldReserve;
  collect.newReserve = newReserve;
  collect.premium = premium;
  collect.ownerFee = ownerFee;
  collect.creatorFee = creatorFee;
  collect.treasuryFee = treasuryFee;
  collect.teamFee = teamFee;
  collect.protocolFee = protocolFee;
  collect.timestamp = event.block.timestamp;
  collect.blockNumber = event.block.number;
  collect.txHash = event.transaction.hash;
  collect.save();

  // Update content state
  content.owner = collectorAddress;
  content.epochId = epochId.plus(ONE_BI);
  content.stake = newReserve;
  content.reserve = newReserve;
  content.startTime = event.block.timestamp;
  let nextReserveRaw = event.params.newReserve.times(RESERVE_MULTIPLIER).div(DIVISOR);
  let premiumStart = convertTokenToDecimal(nextReserveRaw, BI_6);
  content.initPrice = premiumStart;
  content.premiumStart = premiumStart;
  content.collectCount = content.collectCount.plus(ONE_BI);
  content.collectVolume = content.collectVolume.plus(price);
  content.save();

  // Update channel stats
  channel.txCount = channel.txCount.plus(ONE_BI);
  channel.collectCount = channel.collectCount.plus(ONE_BI);
  channel.collectVolume = channel.collectVolume.plus(price);
  channel.creatorRevenue = channel.creatorRevenue.plus(creatorFee);
  channel.ownerRevenue = channel.ownerRevenue.plus(ownerFee);
  channel.treasuryRevenue = channel.treasuryRevenue.plus(treasuryFee);
  channel.teamRevenue = channel.teamRevenue.plus(teamFee);
  channel.protocolRevenue = channel.protocolRevenue.plus(protocolFee);
  channel.save();

  // Update directory stats
  let directory = Directory.load(DIRECTORY_ID);
  if (directory != null) {
    directory.collectCount = directory.collectCount.plus(ONE_BI);
    directory.collectVolume = directory.collectVolume.plus(price);
    directory.creatorRevenue = directory.creatorRevenue.plus(creatorFee);
    directory.ownerRevenue = directory.ownerRevenue.plus(ownerFee);
    directory.treasuryRevenue = directory.treasuryRevenue.plus(treasuryFee);
    directory.teamRevenue = directory.teamRevenue.plus(teamFee);
    directory.protocolRevenue = directory.protocolRevenue.plus(protocolFee);
    directory.save();
  }

  // Update time-series data
  let timestamp = event.block.timestamp;

  // Day data
  let dayTimestamp = getDayTimestamp(timestamp);
  let dayDataId = getChannelDayDataId(channelAddress, dayTimestamp);
  let dayData = ChannelDayData.load(dayDataId);
  if (dayData == null) {
    dayData = new ChannelDayData(dayDataId);
    dayData.channel = channelAddress;
    dayData.timestamp = dayTimestamp;
    dayData.collectCount = ZERO_BI;
    dayData.collectVolume = ZERO_BD;
    dayData.open = channel.price;
    dayData.high = channel.price;
    dayData.low = channel.price;
    dayData.close = channel.price;
    dayData.volumeCoin = ZERO_BD;
    dayData.volumeQuote = ZERO_BD;
    dayData.swapTxCount = ZERO_BI;
    dayData.liquidity = channel.liquidity;
  }
  dayData.collectCount = dayData.collectCount.plus(ONE_BI);
  dayData.collectVolume = dayData.collectVolume.plus(price);
  dayData.save();

  // Hour data
  let hourTimestamp = getHourTimestamp(timestamp);
  let hourDataId = getChannelHourDataId(channelAddress, hourTimestamp);
  let hourData = ChannelHourData.load(hourDataId);
  if (hourData == null) {
    hourData = new ChannelHourData(hourDataId);
    hourData.channel = channelAddress;
    hourData.timestamp = hourTimestamp;
    hourData.collectCount = ZERO_BI;
    hourData.collectVolume = ZERO_BD;
    hourData.open = channel.price;
    hourData.high = channel.price;
    hourData.low = channel.price;
    hourData.close = channel.price;
    hourData.volumeCoin = ZERO_BD;
    hourData.volumeQuote = ZERO_BD;
    hourData.swapTxCount = ZERO_BI;
    hourData.liquidity = channel.liquidity;
  }
  hourData.collectCount = hourData.collectCount.plus(ONE_BI);
  hourData.collectVolume = hourData.collectVolume.plus(price);
  hourData.save();

  // Minute data
  let minuteTimestamp = getMinuteTimestamp(timestamp);
  let minuteDataId = getChannelMinuteDataId(channelAddress, minuteTimestamp);
  let minuteData = ChannelMinuteData.load(minuteDataId);
  if (minuteData == null) {
    minuteData = new ChannelMinuteData(minuteDataId);
    minuteData.channel = channelAddress;
    minuteData.timestamp = minuteTimestamp;
    minuteData.collectCount = ZERO_BI;
    minuteData.collectVolume = ZERO_BD;
    minuteData.open = channel.price;
    minuteData.high = channel.price;
    minuteData.low = channel.price;
    minuteData.close = channel.price;
    minuteData.volumeCoin = ZERO_BD;
    minuteData.volumeQuote = ZERO_BD;
    minuteData.swapTxCount = ZERO_BI;
    minuteData.liquidity = channel.liquidity;
  }
  minuteData.collectCount = minuteData.collectCount.plus(ONE_BI);
  minuteData.collectVolume = minuteData.collectVolume.plus(price);
  minuteData.save();
}

export function handleContentSurrendered(event: ContentSurrenderedEvent): void {
  let channelAddress = event.address.toHexString();
  let contentId = getContentPositionId(channelAddress, event.params.tokenId);
  let content = ContentPosition.load(contentId);
  if (content == null) return;

  content.stake = ZERO_BD;
  content.reserve = ZERO_BD;
  content.initPrice = ZERO_BD;
  content.premiumStart = ZERO_BD;
  content.isActive = false;
  content.surrenderedAt = event.block.timestamp;
  content.save();
}

export function handleContentApproved(event: ContentApprovedEvent): void {
  let channelAddress = event.address.toHexString();
  let tokenId = event.params.tokenId;

  let contentId = getContentPositionId(channelAddress, tokenId);
  let content = ContentPosition.load(contentId);
  if (content == null) return;

  content.isApproved = true;
  content.save();
}

export function handleContentIsModeratedSet(event: ContentIsModeratedSetEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  channel.isModerated = event.params.isModerated;
  channel.save();
}

export function handleContentModeratorsSet(event: ContentModeratorsSetEvent): void {
  let channelAddress = event.address.toHexString();
  let accountAddress = event.params.account.toHexString();

  getOrCreateAccount(accountAddress);

  let moderatorId = getModeratorId(channelAddress, accountAddress);
  let moderator = Moderator.load(moderatorId);
  if (moderator == null) {
    moderator = new Moderator(moderatorId);
    moderator.channel = channelAddress;
    moderator.account = accountAddress;
    moderator.assignedAt = event.block.timestamp;
  }
  moderator.isModerator = event.params.accountToIsModerator;
  moderator.save();
}

export function handleContentUriSet(event: ContentUriSetEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  channel.uri = event.params.uri;
  let metadataPath = extractIpfsPath(event.params.uri);
  if (metadataPath != null) {
    let resolvedMetadataPath = changetype<string>(metadataPath);
    channel.metadata = resolvedMetadataPath;
    IpfsMetadataTemplate.create(resolvedMetadataPath);
  }
  channel.save();
}

export function handleContentTreasurySet(event: ContentTreasurySetEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  channel.treasury = event.params.treasury;
  channel.save();
}

export function handleContentTeamSet(event: ContentTeamSetEvent): void {
  let channelAddress = event.address.toHexString();
  let channel = Channel.load(channelAddress);
  if (channel == null) return;

  channel.team = event.params.team;
  channel.save();
}
