import { GraphQLClient, gql } from "graphql-request";

// Subgraph URL (Goldsky)
export const LAUNCHPAD_SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_LAUNCHPAD_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmgscxhw81j5601xmhgd42rej/subgraphs/stickrnet/1.0.0/gn";

const client = new GraphQLClient(LAUNCHPAD_SUBGRAPH_URL);

// =============================================================================
// Types matching the stickrnet subgraph schema
// =============================================================================

export type SubgraphDirectory = {
  id: string;
  channelCount: string;
  contentCount: string;
  collectCount: string;
  collectVolume: string;
  totalStaked: string;
  totalMinted: string;
  creatorRevenue: string;
  ownerRevenue: string;
  treasuryRevenue: string;
  teamRevenue: string;
  protocolRevenue: string;
};

export type SubgraphChannel = {
  id: string; // Content contract address
  index: string;
  launcher: { id: string };
  coin: string; // Bytes
  minter: string;
  rewarder: string;
  auction: string;
  lpToken: string;
  treasury: string;
  team: string;
  name: string;
  symbol: string;
  uri: string;
  quoteAmount: string;
  coinAmount: string;
  initialUps: string;
  tailUps: string;
  halvingPeriod: string;
  minInitPrice: string;
  auctionInitPrice: string;
  auctionEpochPeriod: string;
  auctionPriceMultiplier: string;
  auctionMinInitPrice: string;
  isModerated: boolean;
  txCount: string;
  contentCount: string;
  collectCount: string;
  collectVolume: string;
  totalStaked: string;
  totalMinted: string;
  creatorRevenue: string;
  ownerRevenue: string;
  treasuryRevenue: string;
  teamRevenue: string;
  protocolRevenue: string;
  price: string;
  reserveCoin: string;
  reserveQuote: string;
  liquidity: string;
  volumeCoin: string;
  volumeQuote: string;
  swapTxCount: string;
  lastSwapAt: string;
  minterActivePeriod: string;
  minterLastMintedAt: string;
  createdAt: string;
  createdAtBlock: string;
};

export type SubgraphCollect = {
  id: string;
  channel: { id: string };
  collector: { id: string };
  prevOwner: { id: string };
  creator: { id: string };
  content: { id: string };
  tokenId: string;
  epochId: string;
  price: string;
  ownerFee: string;
  creatorFee: string;
  treasuryFee: string;
  teamFee: string;
  protocolFee: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
};

export type SubgraphContentPosition = {
  id: string;
  channel: { id: string };
  tokenId: string;
  creator: { id: string };
  owner: { id: string };
  uri: string;
  isApproved: boolean;
  epochId: string;
  startTime: string;
  initPrice: string;
  stake: string;
  collectCount: string;
  collectVolume: string;
  createdAt: string;
  createdAtBlock: string;
};

export type SubgraphChannelAccount = {
  id: string;
  channel: { id: string };
  account: { id: string };
  collectCount: string;
  collectSpent: string;
  ownerEarned: string;
  contentCreated: string;
  creatorEarned: string;
  staked: string;
  rewardsClaimed: string;
};

export type SubgraphAccount = {
  id: string;
  txCount: string;
};

export type SubgraphChannelCandle = {
  id: string;
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volumeCoin: string;
  volumeQuote: string;
  swapTxCount: string;
  collectCount: string;
  collectVolume: string;
  liquidity: string;
};

// =============================================================================
// GraphQL field fragments (reusable field sets)
// =============================================================================

const CHANNEL_FIELDS = `
  id
  index
  launcher { id }
  coin
  minter
  rewarder
  auction
  lpToken
  treasury
  team
  name
  symbol
  uri
  quoteAmount
  coinAmount
  initialUps
  tailUps
  halvingPeriod
  minInitPrice
  auctionInitPrice
  auctionEpochPeriod
  auctionPriceMultiplier
  auctionMinInitPrice
  isModerated
  txCount
  contentCount
  collectCount
  collectVolume
  totalStaked
  totalMinted
  creatorRevenue
  ownerRevenue
  treasuryRevenue
  teamRevenue
  protocolRevenue
  price
  reserveCoin
  reserveQuote
  liquidity
  volumeCoin
  volumeQuote
  swapTxCount
  lastSwapAt
  minterActivePeriod
  minterLastMintedAt
  createdAt
  createdAtBlock
`;

const COLLECT_FIELDS = `
  id
  channel { id }
  collector { id }
  prevOwner { id }
  creator { id }
  content { id }
  tokenId
  epochId
  price
  ownerFee
  creatorFee
  treasuryFee
  teamFee
  protocolFee
  timestamp
  blockNumber
  txHash
`;

const CONTENT_POSITION_FIELDS = `
  id
  channel { id }
  tokenId
  creator { id }
  owner { id }
  uri
  isApproved
  epochId
  startTime
  initPrice
  stake
  collectCount
  collectVolume
  createdAt
  createdAtBlock
`;

const CHANNEL_ACCOUNT_FIELDS = `
  id
  channel { id }
  account { id }
  collectCount
  collectSpent
  ownerEarned
  contentCreated
  creatorEarned
  staked
  rewardsClaimed
`;

// =============================================================================
// Queries
// =============================================================================

// Get global directory stats (singleton entity)
export const GET_DIRECTORY_STATS_QUERY = gql`
  query GetDirectoryStats {
    directory(id: "directory") {
      id
      channelCount
      contentCount
      collectCount
      collectVolume
      totalStaked
      totalMinted
      creatorRevenue
      ownerRevenue
      treasuryRevenue
      teamRevenue
      protocolRevenue
    }
  }
`;

// Get channels with pagination and ordering
export const GET_CHANNELS_QUERY = gql`
  query GetChannels(
    $first: Int!
    $skip: Int!
    $orderBy: Channel_orderBy!
    $orderDirection: OrderDirection!
  ) {
    channels(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Search channels by name or symbol
export const SEARCH_CHANNELS_QUERY = gql`
  query SearchChannels($search: String!, $first: Int!) {
    channels(
      first: $first
      where: {
        or: [
          { name_contains_nocase: $search }
          { symbol_contains_nocase: $search }
        ]
      }
      orderBy: liquidity
      orderDirection: desc
    ) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get a single channel by ID
export const GET_CHANNEL_QUERY = gql`
  query GetChannel($id: ID!) {
    channel(id: $id) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get trending channels (most recently active by swap)
export const GET_TRENDING_CHANNELS_QUERY = gql`
  query GetTrendingChannels($first: Int!) {
    channels(first: $first, orderBy: lastSwapAt, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get top channels by collect volume
export const GET_TOP_CHANNELS_QUERY = gql`
  query GetTopChannels($first: Int!) {
    channels(first: $first, orderBy: collectVolume, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get account stats
export const GET_ACCOUNT_QUERY = gql`
  query GetAccount($id: ID!) {
    account(id: $id) {
      id
      txCount
    }
  }
`;

// Get channel account (user participation in a specific channel)
export const GET_CHANNEL_ACCOUNT_QUERY = gql`
  query GetChannelAccount($channelAddress: String!, $accountAddress: String!) {
    channelAccounts(
      where: { channel: $channelAddress, account: $accountAddress }
      first: 1
    ) {
      ${CHANNEL_ACCOUNT_FIELDS}
    }
  }
`;

// Get collects for a channel
export const GET_COLLECTS_QUERY = gql`
  query GetCollects($channelAddress: String!, $first: Int!) {
    collects(
      where: { channel: $channelAddress }
      orderBy: timestamp
      orderDirection: desc
      first: $first
    ) {
      ${COLLECT_FIELDS}
    }
  }
`;

// Get content positions for a channel
export const GET_CONTENT_POSITIONS_QUERY = gql`
  query GetContentPositions($channelAddress: String!, $first: Int!, $skip: Int!) {
    contentPositions(
      where: { channel: $channelAddress }
      orderBy: createdAt
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      ${CONTENT_POSITION_FIELDS}
    }
  }
`;

// Get channel accounts (leaderboard data)
export const GET_CHANNEL_ACCOUNTS_QUERY = gql`
  query GetChannelAccounts($channelAddress: String!, $first: Int!, $orderBy: ChannelAccount_orderBy!) {
    channelAccounts(
      where: { channel: $channelAddress }
      orderBy: $orderBy
      orderDirection: desc
      first: $first
    ) {
      ${CHANNEL_ACCOUNT_FIELDS}
    }
  }
`;

// Get minute candle data for a channel
export const GET_CHANNEL_MINUTE_DATA_QUERY = gql`
  query GetChannelMinuteData($channelAddress: String!, $since: BigInt!) {
    channelMinuteDatas(
      where: { channel: $channelAddress, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      timestamp
      open
      high
      low
      close
      volumeCoin
      volumeQuote
      swapTxCount
      collectCount
      collectVolume
      liquidity
    }
  }
`;

// Get hourly candle data for a channel
export const GET_CHANNEL_HOUR_DATA_QUERY = gql`
  query GetChannelHourData($channelAddress: String!, $since: BigInt!) {
    channelHourDatas(
      where: { channel: $channelAddress, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      timestamp
      open
      high
      low
      close
      volumeCoin
      volumeQuote
      swapTxCount
      collectCount
      collectVolume
      liquidity
    }
  }
`;

// Get daily candle data for a channel
export const GET_CHANNEL_DAY_DATA_QUERY = gql`
  query GetChannelDayData($channelAddress: String!, $since: BigInt!) {
    channelDayDatas(
      where: { channel: $channelAddress, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      timestamp
      open
      high
      low
      close
      volumeCoin
      volumeQuote
      swapTxCount
      collectCount
      collectVolume
      liquidity
    }
  }
`;

// Get hourly candle data for multiple channels (for sparklines)
export const GET_BATCH_CHANNEL_HOUR_DATA_QUERY = gql`
  query GetBatchChannelHourData($channelAddresses: [String!]!, $since: BigInt!) {
    channelHourDatas(
      where: { channel_in: $channelAddresses, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      channel {
        id
      }
      timestamp
      close
    }
  }
`;

// Get minute candle data for multiple channels (for sparklines on new channels)
export const GET_BATCH_CHANNEL_MINUTE_DATA_QUERY = gql`
  query GetBatchChannelMinuteData($channelAddresses: [String!]!, $since: BigInt!) {
    channelMinuteDatas(
      where: { channel_in: $channelAddresses, timestamp_gte: $since }
      orderBy: timestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      channel {
        id
      }
      timestamp
      close
    }
  }
`;

// =============================================================================
// Channel listing queries (for explore page)
// =============================================================================

// Get channels sorted by lastSwapAt (activity/bump order)
export const GET_CHANNELS_BY_ACTIVITY_QUERY = gql`
  query GetChannelsByActivity($first: Int!) {
    channels(first: $first, orderBy: lastSwapAt, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get channels sorted by liquidity (top order - proxy for marketCap)
export const GET_CHANNELS_BY_LIQUIDITY_QUERY = gql`
  query GetChannelsByLiquidity($first: Int!) {
    channels(first: $first, orderBy: liquidity, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get channels sorted by createdAt (new order)
export const GET_CHANNELS_BY_CREATED_AT_QUERY = gql`
  query GetChannelsByCreatedAt($first: Int!) {
    channels(first: $first, orderBy: createdAt, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// Get all channels (for portfolio balance checks)
export const GET_ALL_CHANNELS_QUERY = gql`
  query GetAllChannels($first: Int!) {
    channels(first: $first, orderBy: createdAt, orderDirection: desc) {
      ${CHANNEL_FIELDS}
    }
  }
`;

// =============================================================================
// API Functions
// =============================================================================

export async function getDirectoryStats(): Promise<SubgraphDirectory | null> {
  try {
    const data = await client.request<{
      directory: SubgraphDirectory | null;
    }>(GET_DIRECTORY_STATS_QUERY);
    return data.directory;
  } catch (error) {
    console.error("[getDirectoryStats] Error:", error);
    return null;
  }
}

export async function getChannels(
  first = 20,
  skip = 0,
  orderBy:
    | "totalMinted"
    | "createdAt"
    | "lastSwapAt"
    | "collectVolume"
    | "liquidity" = "totalMinted",
  orderDirection: "asc" | "desc" = "desc"
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_CHANNELS_QUERY,
      {
        first,
        skip,
        orderBy,
        orderDirection,
      }
    );
    return data.channels;
  } catch (error) {
    console.error("[getChannels] Error:", error);
    return [];
  }
}

export async function searchChannels(
  search: string,
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      SEARCH_CHANNELS_QUERY,
      {
        search,
        first,
      }
    );
    return data.channels;
  } catch (error) {
    console.error("[searchChannels] Error:", error);
    return [];
  }
}

export async function getChannel(
  id: string
): Promise<SubgraphChannel | null> {
  try {
    const data = await client.request<{
      channel: SubgraphChannel | null;
    }>(GET_CHANNEL_QUERY, {
      id: id.toLowerCase(),
    });
    return data.channel;
  } catch (error) {
    console.error("[getChannel] Error:", error);
    return null;
  }
}

export async function getAccount(id: string): Promise<SubgraphAccount | null> {
  try {
    const data = await client.request<{ account: SubgraphAccount | null }>(
      GET_ACCOUNT_QUERY,
      {
        id: id.toLowerCase(),
      }
    );
    return data.account;
  } catch (error) {
    console.error("[getAccount] Error:", error);
    return null;
  }
}

export async function getTrendingChannels(
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_TRENDING_CHANNELS_QUERY,
      { first }
    );
    return data.channels;
  } catch (error) {
    console.error("[getTrendingChannels] Error:", error);
    return [];
  }
}

export async function getTopChannels(
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_TOP_CHANNELS_QUERY,
      { first }
    );
    return data.channels;
  } catch (error) {
    console.error("[getTopChannels] Error:", error);
    return [];
  }
}

// Channel listing functions (for explore page)

export async function getChannelsByActivity(
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_CHANNELS_BY_ACTIVITY_QUERY,
      { first }
    );
    return data.channels ?? [];
  } catch (error) {
    console.error("[getChannelsByActivity] Error:", error);
    return [];
  }
}

export async function getChannelsByLiquidity(
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_CHANNELS_BY_LIQUIDITY_QUERY,
      { first }
    );
    return data.channels ?? [];
  } catch (error) {
    console.error("[getChannelsByLiquidity] Error:", error);
    return [];
  }
}

export async function getChannelsByCreatedAt(
  first = 20
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_CHANNELS_BY_CREATED_AT_QUERY,
      { first }
    );
    return data.channels ?? [];
  } catch (error) {
    console.error("[getChannelsByCreatedAt] Error:", error);
    return [];
  }
}

export async function getAllChannels(
  first = 100
): Promise<SubgraphChannel[]> {
  try {
    const data = await client.request<{ channels: SubgraphChannel[] }>(
      GET_ALL_CHANNELS_QUERY,
      { first }
    );
    return data.channels ?? [];
  } catch (error) {
    console.error("[getAllChannels] Error:", error);
    return [];
  }
}

// Helper to format subgraph address
export function formatSubgraphAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

// Get channel account (user participation in a specific channel)
export async function getChannelAccount(
  channelAddress: string,
  accountAddress: string
): Promise<SubgraphChannelAccount | null> {
  try {
    const data = await client.request<{
      channelAccounts: SubgraphChannelAccount[];
    }>(GET_CHANNEL_ACCOUNT_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      accountAddress: accountAddress.toLowerCase(),
    });
    return data.channelAccounts?.[0] ?? null;
  } catch (error) {
    console.error("[getChannelAccount] Error:", error);
    return null;
  }
}

// Get collects for a channel
export async function getCollects(
  channelAddress: string,
  first = 20
): Promise<SubgraphCollect[]> {
  try {
    const data = await client.request<{ collects: SubgraphCollect[] }>(
      GET_COLLECTS_QUERY,
      {
        channelAddress: channelAddress.toLowerCase(),
        first,
      }
    );
    return data.collects ?? [];
  } catch (error) {
    console.error("[getCollects] Error:", error);
    return [];
  }
}

// Get content positions for a channel
export async function getContentPositions(
  channelAddress: string,
  first = 20,
  skip = 0
): Promise<SubgraphContentPosition[]> {
  try {
    const data = await client.request<{
      contentPositions: SubgraphContentPosition[];
    }>(GET_CONTENT_POSITIONS_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      first,
      skip,
    });
    return data.contentPositions ?? [];
  } catch (error) {
    console.error("[getContentPositions] Error:", error);
    return [];
  }
}

// Get channel accounts (leaderboard data)
export async function getChannelAccounts(
  channelAddress: string,
  first = 20,
  orderBy: "collectCount" | "collectSpent" | "ownerEarned" | "contentCreated" | "creatorEarned" | "staked" | "rewardsClaimed" = "collectSpent"
): Promise<SubgraphChannelAccount[]> {
  try {
    const data = await client.request<{
      channelAccounts: SubgraphChannelAccount[];
    }>(GET_CHANNEL_ACCOUNTS_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      first,
      orderBy,
    });
    return data.channelAccounts ?? [];
  } catch (error) {
    console.error("[getChannelAccounts] Error:", error);
    return [];
  }
}

// Get minute candle data for a channel
export async function getChannelMinuteData(
  channelAddress: string,
  since: number
): Promise<SubgraphChannelCandle[]> {
  try {
    const data = await client.request<{
      channelMinuteDatas: SubgraphChannelCandle[];
    }>(GET_CHANNEL_MINUTE_DATA_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      since: since.toString(),
    });
    return data.channelMinuteDatas ?? [];
  } catch (error) {
    console.error("[getChannelMinuteData] Error:", error);
    return [];
  }
}

// Get hourly candle data for a channel
export async function getChannelHourData(
  channelAddress: string,
  since: number
): Promise<SubgraphChannelCandle[]> {
  try {
    const data = await client.request<{
      channelHourDatas: SubgraphChannelCandle[];
    }>(GET_CHANNEL_HOUR_DATA_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      since: since.toString(),
    });
    return data.channelHourDatas ?? [];
  } catch (error) {
    console.error("[getChannelHourData] Error:", error);
    return [];
  }
}

// Get daily candle data for a channel
export async function getChannelDayData(
  channelAddress: string,
  since: number
): Promise<SubgraphChannelCandle[]> {
  try {
    const data = await client.request<{
      channelDayDatas: SubgraphChannelCandle[];
    }>(GET_CHANNEL_DAY_DATA_QUERY, {
      channelAddress: channelAddress.toLowerCase(),
      since: since.toString(),
    });
    return data.channelDayDatas ?? [];
  } catch (error) {
    console.error("[getChannelDayData] Error:", error);
    return [];
  }
}

// Batch fetch sparkline data for multiple channels (last 24h hourly)
export type SparklineDataPoint = { timestamp: number; price: number };
export type SparklineMap = Map<string, SparklineDataPoint[]>;

export async function getBatchSparklineData(
  channelAddresses: string[]
): Promise<SparklineMap> {
  if (channelAddresses.length === 0) return new Map();

  const since = Math.floor(Date.now() / 1000) - 86400; // Last 24 hours

  try {
    const data = await client.request<{
      channelHourDatas: Array<{
        channel: { id: string };
        timestamp: string;
        close: string;
      }>;
    }>(GET_BATCH_CHANNEL_HOUR_DATA_QUERY, {
      channelAddresses: channelAddresses.map((a) => a.toLowerCase()),
      since: since.toString(),
    });

    // Group by channel address
    const result: SparklineMap = new Map();
    for (const candle of data.channelHourDatas ?? []) {
      const channelId = candle.channel.id.toLowerCase();
      if (!result.has(channelId)) {
        result.set(channelId, []);
      }
      result.get(channelId)!.push({
        timestamp: parseInt(candle.timestamp),
        price: parseFloat(candle.close),
      });
    }

    return result;
  } catch (error) {
    console.error("[getBatchSparklineData] Error:", error);
    return new Map();
  }
}

// Batch fetch minute-level sparkline data (last 4h, for new channels without hourly candles)
export async function getBatchSparklineMinuteData(
  channelAddresses: string[]
): Promise<SparklineMap> {
  if (channelAddresses.length === 0) return new Map();

  const since = Math.floor(Date.now() / 1000) - 4 * 3600; // Last 4 hours

  try {
    const data = await client.request<{
      channelMinuteDatas: Array<{
        channel: { id: string };
        timestamp: string;
        close: string;
      }>;
    }>(GET_BATCH_CHANNEL_MINUTE_DATA_QUERY, {
      channelAddresses: channelAddresses.map((a) => a.toLowerCase()),
      since: since.toString(),
    });

    const result: SparklineMap = new Map();
    for (const candle of data.channelMinuteDatas ?? []) {
      const channelId = candle.channel.id.toLowerCase();
      if (!result.has(channelId)) {
        result.set(channelId, []);
      }
      result.get(channelId)!.push({
        timestamp: parseInt(candle.timestamp),
        price: parseFloat(candle.close),
      });
    }

    return result;
  } catch (error) {
    console.error("[getBatchSparklineMinuteData] Error:", error);
    return new Map();
  }
}
