import { BigInt } from "@graphprotocol/graph-ts";
import { Minter__Minted as MinterMintedEvent } from "../generated/templates/Minter/Minter";
import { Directory, Channel, ContractToChannel } from "../generated/schema";
import { ZERO_BD, DIRECTORY_ID, BI_18 } from "./constants";
import { convertTokenToDecimal } from "./helpers";

export function handleMinterMinted(event: MinterMintedEvent): void {
  let minterAddress = event.address.toHexString();

  // Look up channel from minter address
  let lookup = ContractToChannel.load(minterAddress);
  if (lookup == null) return;

  let channel = Channel.load(lookup.channel);
  if (channel == null) return;

  let amount = convertTokenToDecimal(event.params.weekly, BI_18);

  // Update minter state on channel
  let week = BigInt.fromI32(604800); // 7 days in seconds
  channel.minterActivePeriod = event.block.timestamp.div(week).times(week);
  channel.minterLastMintedAt = event.block.timestamp;
  channel.totalMinted = channel.totalMinted.plus(amount);
  channel.save();

  // Update directory total minted
  let directory = Directory.load(DIRECTORY_ID);
  if (directory != null) {
    directory.totalMinted = directory.totalMinted.plus(amount);
    directory.save();
  }
}
