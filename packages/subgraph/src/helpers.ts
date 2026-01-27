import { BigInt, BigDecimal } from "@graphprotocol/graph-ts";
import { ZERO_BI, ONE_BI, ZERO_BD, DIVISOR } from "./constants";

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString("1");
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"));
  }
  return bd;
}

export function convertTokenToDecimal(
  tokenAmount: BigInt,
  exchangeDecimals: BigInt
): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal();
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals));
}

export function getContentPositionId(channelAddress: string, tokenId: BigInt): string {
  return channelAddress + "-" + tokenId.toString();
}

export function getCollectId(channelAddress: string, tokenId: BigInt, epochId: BigInt): string {
  return channelAddress + "-" + tokenId.toString() + "-" + epochId.toString();
}

export function getChannelAccountId(channelAddress: string, accountAddress: string): string {
  return channelAddress + "-" + accountAddress;
}

export function getModeratorId(channelAddress: string, accountAddress: string): string {
  return channelAddress + "-" + accountAddress;
}

export function calculateFee(amount: BigDecimal, feeBps: BigInt): BigDecimal {
  return amount.times(feeBps.toBigDecimal()).div(DIVISOR.toBigDecimal());
}

// Time-series helpers
export function getDayTimestamp(timestamp: BigInt): BigInt {
  let daySeconds = BigInt.fromI32(86400);
  return timestamp.div(daySeconds).times(daySeconds);
}

export function getHourTimestamp(timestamp: BigInt): BigInt {
  let hourSeconds = BigInt.fromI32(3600);
  return timestamp.div(hourSeconds).times(hourSeconds);
}

export function getMinuteTimestamp(timestamp: BigInt): BigInt {
  let minuteSeconds = BigInt.fromI32(60);
  return timestamp.div(minuteSeconds).times(minuteSeconds);
}

export function getChannelDayDataId(channelAddress: string, dayTimestamp: BigInt): string {
  return channelAddress + "-" + dayTimestamp.toString();
}

export function getChannelHourDataId(channelAddress: string, hourTimestamp: BigInt): string {
  return channelAddress + "-" + hourTimestamp.toString();
}

export function getChannelMinuteDataId(channelAddress: string, minuteTimestamp: BigInt): string {
  return channelAddress + "-" + minuteTimestamp.toString();
}
