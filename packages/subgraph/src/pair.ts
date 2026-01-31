import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  Sync as SyncEvent,
  Swap as SwapEvent,
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair";
import { UniswapV2Pair } from "../generated/templates/UniswapV2Pair/UniswapV2Pair";
import {
  Channel,
  ContractToChannel,
  Swap,
  Account,
  ChannelDayData,
  ChannelHourData,
  ChannelMinuteData,
} from "../generated/schema";
import { ZERO_BD, ZERO_BI, ONE_BI, BI_18, BI_6 } from "./constants";
import {
  convertTokenToDecimal,
  getDayTimestamp,
  getHourTimestamp,
  getMinuteTimestamp,
  getChannelDayDataId,
  getChannelHourDataId,
  getChannelMinuteDataId,
} from "./helpers";

export function handleSync(event: SyncEvent): void {
  let pairAddress = event.address.toHexString();

  // Look up the Channel via ContractToChannel
  let lookup = ContractToChannel.load(pairAddress);
  if (lookup == null) return;

  let channel = Channel.load(lookup.channel);
  if (channel == null) return;

  // Bind the pair contract to determine token ordering
  let pair = UniswapV2Pair.bind(event.address);
  let token0Result = pair.try_token0();
  if (token0Result.reverted) return;

  // Determine which reserve is unit vs quote based on token0
  let reserve0 = event.params.reserve0;
  let reserve1 = event.params.reserve1;

  let reserveUnit: BigDecimal;
  let reserveQuote: BigDecimal;

  let token0IsUnit = token0Result.value.equals(Address.fromBytes(channel.unit));

  if (token0IsUnit) {
    reserveUnit = convertTokenToDecimal(reserve0, BI_18);
    reserveQuote = convertTokenToDecimal(reserve1, BI_6);
  } else {
    reserveUnit = convertTokenToDecimal(reserve1, BI_18);
    reserveQuote = convertTokenToDecimal(reserve0, BI_6);
  }

  // Calculate price: quote per unit
  let price: BigDecimal;
  if (reserveUnit.gt(ZERO_BD)) {
    price = reserveQuote.div(reserveUnit);
  } else {
    price = ZERO_BD;
  }

  // Update Channel price and liquidity data
  channel.price = price;
  channel.reserveUnit = reserveUnit;
  channel.reserveQuote = reserveQuote;
  channel.liquidity = reserveQuote.times(BigDecimal.fromString("2"));
  channel.save();

  // Update OHLCV candles (no swap volume, just price update)
  updateCandles(channel, event.block.timestamp, ZERO_BD, ZERO_BD, false);
}

export function handleSwap(event: SwapEvent): void {
  let pairAddress = event.address.toHexString();

  // Look up the Channel via ContractToChannel
  let lookup = ContractToChannel.load(pairAddress);
  if (lookup == null) return;

  let channel = Channel.load(lookup.channel);
  if (channel == null) return;

  // Bind the pair contract to determine token ordering
  let pair = UniswapV2Pair.bind(event.address);
  let token0Result = pair.try_token0();
  if (token0Result.reverted) return;

  // Get raw swap amounts
  let amount0In = event.params.amount0In;
  let amount1In = event.params.amount1In;
  let amount0Out = event.params.amount0Out;
  let amount1Out = event.params.amount1Out;

  let amountUnitIn: BigDecimal;
  let amountUnitOut: BigDecimal;
  let amountQuoteIn: BigDecimal;
  let amountQuoteOut: BigDecimal;

  let token0IsUnit = token0Result.value.equals(Address.fromBytes(channel.unit));

  if (token0IsUnit) {
    amountUnitIn = convertTokenToDecimal(amount0In, BI_18);
    amountUnitOut = convertTokenToDecimal(amount0Out, BI_18);
    amountQuoteIn = convertTokenToDecimal(amount1In, BI_6);
    amountQuoteOut = convertTokenToDecimal(amount1Out, BI_6);
  } else {
    amountUnitIn = convertTokenToDecimal(amount1In, BI_18);
    amountUnitOut = convertTokenToDecimal(amount1Out, BI_18);
    amountQuoteIn = convertTokenToDecimal(amount0In, BI_6);
    amountQuoteOut = convertTokenToDecimal(amount0Out, BI_6);
  }

  // Total amounts (in + out for each token)
  let amountUnit = amountUnitIn.plus(amountUnitOut);
  let amountQuote = amountQuoteIn.plus(amountQuoteOut);

  // Classify trade direction: USDC in = buy (user buys unit), otherwise sell
  let type: string;
  if (amountQuoteIn.gt(ZERO_BD)) {
    type = "buy";
  } else {
    type = "sell";
  }

  // Calculate execution price
  let price: BigDecimal;
  if (amountUnit.gt(ZERO_BD)) {
    price = amountQuote.div(amountUnit);
  } else {
    price = ZERO_BD;
  }

  // Get or create Account
  let accountAddress = event.transaction.from.toHexString();
  let account = Account.load(accountAddress);
  if (account == null) {
    account = new Account(accountAddress);
    account.txCount = ZERO_BI;
  }
  account.txCount = account.txCount.plus(ONE_BI);
  account.save();

  // Create immutable Swap entity
  let swapId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let swap = new Swap(swapId);
  swap.channel = channel.id;
  swap.account = accountAddress;
  swap.type = type;
  swap.amountUnit = amountUnit;
  swap.amountQuote = amountQuote;
  swap.price = price;
  swap.timestamp = event.block.timestamp;
  swap.blockNumber = event.block.number;
  swap.txHash = event.transaction.hash;
  swap.logIndex = event.logIndex;
  swap.save();

  // Update Channel volume stats
  channel.volumeUnit = channel.volumeUnit.plus(amountUnit);
  channel.volumeQuote = channel.volumeQuote.plus(amountQuote);
  channel.swapTxCount = channel.swapTxCount.plus(ONE_BI);
  channel.lastSwapAt = event.block.timestamp;
  channel.save();

  // Update OHLCV candle volume on time-series entities
  updateCandles(channel, event.block.timestamp, amountUnit, amountQuote, true);
}

function updateCandles(
  channel: Channel,
  timestamp: BigInt,
  amountUnit: BigDecimal,
  amountQuote: BigDecimal,
  isSwap: boolean
): void {
  let channelAddress = channel.id;

  // --- Day Data ---
  let dayTimestamp = getDayTimestamp(timestamp);
  let dayDataId = getChannelDayDataId(channelAddress, dayTimestamp);
  let dayData = ChannelDayData.load(dayDataId);
  if (dayData == null) {
    dayData = new ChannelDayData(dayDataId);
    dayData.channel = channelAddress;
    dayData.timestamp = dayTimestamp;
    dayData.open = channel.price;
    dayData.high = channel.price;
    dayData.low = channel.price;
    dayData.close = channel.price;
    dayData.volumeUnit = ZERO_BD;
    dayData.volumeQuote = ZERO_BD;
    dayData.swapTxCount = ZERO_BI;
    dayData.liquidity = channel.liquidity;
    dayData.collectCount = ZERO_BI;
    dayData.collectVolume = ZERO_BD;
  }
  dayData.close = channel.price;
  if (channel.price.gt(dayData.high)) {
    dayData.high = channel.price;
  }
  if (channel.price.lt(dayData.low)) {
    dayData.low = channel.price;
  }
  dayData.liquidity = channel.liquidity;
  if (isSwap) {
    dayData.volumeUnit = dayData.volumeUnit.plus(amountUnit);
    dayData.volumeQuote = dayData.volumeQuote.plus(amountQuote);
    dayData.swapTxCount = dayData.swapTxCount.plus(ONE_BI);
  }
  dayData.save();

  // --- Hour Data ---
  let hourTimestamp = getHourTimestamp(timestamp);
  let hourDataId = getChannelHourDataId(channelAddress, hourTimestamp);
  let hourData = ChannelHourData.load(hourDataId);
  if (hourData == null) {
    hourData = new ChannelHourData(hourDataId);
    hourData.channel = channelAddress;
    hourData.timestamp = hourTimestamp;
    hourData.open = channel.price;
    hourData.high = channel.price;
    hourData.low = channel.price;
    hourData.close = channel.price;
    hourData.volumeUnit = ZERO_BD;
    hourData.volumeQuote = ZERO_BD;
    hourData.swapTxCount = ZERO_BI;
    hourData.liquidity = channel.liquidity;
    hourData.collectCount = ZERO_BI;
    hourData.collectVolume = ZERO_BD;
  }
  hourData.close = channel.price;
  if (channel.price.gt(hourData.high)) {
    hourData.high = channel.price;
  }
  if (channel.price.lt(hourData.low)) {
    hourData.low = channel.price;
  }
  hourData.liquidity = channel.liquidity;
  if (isSwap) {
    hourData.volumeUnit = hourData.volumeUnit.plus(amountUnit);
    hourData.volumeQuote = hourData.volumeQuote.plus(amountQuote);
    hourData.swapTxCount = hourData.swapTxCount.plus(ONE_BI);
  }
  hourData.save();

  // --- Minute Data ---
  let minuteTimestamp = getMinuteTimestamp(timestamp);
  let minuteDataId = getChannelMinuteDataId(channelAddress, minuteTimestamp);
  let minuteData = ChannelMinuteData.load(minuteDataId);
  if (minuteData == null) {
    minuteData = new ChannelMinuteData(minuteDataId);
    minuteData.channel = channelAddress;
    minuteData.timestamp = minuteTimestamp;
    minuteData.open = channel.price;
    minuteData.high = channel.price;
    minuteData.low = channel.price;
    minuteData.close = channel.price;
    minuteData.volumeUnit = ZERO_BD;
    minuteData.volumeQuote = ZERO_BD;
    minuteData.swapTxCount = ZERO_BI;
    minuteData.liquidity = channel.liquidity;
    minuteData.collectCount = ZERO_BI;
    minuteData.collectVolume = ZERO_BD;
  }
  minuteData.close = channel.price;
  if (channel.price.gt(minuteData.high)) {
    minuteData.high = channel.price;
  }
  if (channel.price.lt(minuteData.low)) {
    minuteData.low = channel.price;
  }
  minuteData.liquidity = channel.liquidity;
  if (isSwap) {
    minuteData.volumeUnit = minuteData.volumeUnit.plus(amountUnit);
    minuteData.volumeQuote = minuteData.volumeQuote.plus(amountQuote);
    minuteData.swapTxCount = minuteData.swapTxCount.plus(ONE_BI);
  }
  minuteData.save();
}
