import { BigInt } from "@graphprotocol/graph-ts";
import {
  Rewarder__Deposited as RewarderDepositedEvent,
  Rewarder__Withdrawn as RewarderWithdrawnEvent,
  Rewarder__RewardPaid as RewarderRewardPaidEvent,
  Rewarder__RewardNotified as RewarderRewardNotifiedEvent,
} from "../generated/templates/Rewarder/Rewarder";
import {
  Directory,
  Channel,
  Account,
  ChannelAccount,
  ContractToChannel,
} from "../generated/schema";
import { ZERO_BD, ZERO_BI, DIRECTORY_ID, BI_18, BI_6 } from "./constants";
import { convertTokenToDecimal, getChannelAccountId } from "./helpers";

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

export function handleRewarderDeposited(event: RewarderDepositedEvent): void {
  let rewarderAddress = event.address.toHexString();

  // Look up channel from rewarder address
  let lookup = ContractToChannel.load(rewarderAddress);
  if (lookup == null) return;

  let channel = Channel.load(lookup.channel);
  if (channel == null) return;

  let userAddress = event.params.user.toHexString();
  let amount = convertTokenToDecimal(event.params.amount, BI_6);

  // Update channel total staked
  channel.totalStaked = channel.totalStaked.plus(amount);
  channel.save();

  // Update directory total staked
  let directory = Directory.load(DIRECTORY_ID);
  if (directory != null) {
    directory.totalStaked = directory.totalStaked.plus(amount);
    directory.save();
  }

  // Update user account and channel account
  getOrCreateAccount(userAddress);
  let channelAccount = getOrCreateChannelAccount(lookup.channel, userAddress);
  channelAccount.staked = channelAccount.staked.plus(amount);
  channelAccount.save();
}

export function handleRewarderWithdrawn(event: RewarderWithdrawnEvent): void {
  let rewarderAddress = event.address.toHexString();

  // Look up channel from rewarder address
  let lookup = ContractToChannel.load(rewarderAddress);
  if (lookup == null) return;

  let channel = Channel.load(lookup.channel);
  if (channel == null) return;

  let userAddress = event.params.user.toHexString();
  let amount = convertTokenToDecimal(event.params.amount, BI_6);

  // Update channel total staked
  channel.totalStaked = channel.totalStaked.minus(amount);
  channel.save();

  // Update directory total staked
  let directory = Directory.load(DIRECTORY_ID);
  if (directory != null) {
    directory.totalStaked = directory.totalStaked.minus(amount);
    directory.save();
  }

  // Update channel account
  let channelAccount = getOrCreateChannelAccount(lookup.channel, userAddress);
  channelAccount.staked = channelAccount.staked.minus(amount);
  channelAccount.save();
}

export function handleRewarderRewardPaid(event: RewarderRewardPaidEvent): void {
  let rewarderAddress = event.address.toHexString();

  // Look up channel from rewarder address
  let lookup = ContractToChannel.load(rewarderAddress);
  if (lookup == null) return;

  let userAddress = event.params.user.toHexString();
  let amount = convertTokenToDecimal(event.params.reward, BI_18);

  // Update user account
  getOrCreateAccount(userAddress);

  // Update channel account rewards claimed
  let channelAccount = getOrCreateChannelAccount(lookup.channel, userAddress);
  channelAccount.rewardsClaimed = channelAccount.rewardsClaimed.plus(amount);
  channelAccount.save();
}

export function handleRewarderRewardNotified(event: RewarderRewardNotifiedEvent): void {
  // This event is emitted when new rewards are added to the rewarder
  // We track minting in the Minter handler instead
}
