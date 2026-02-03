import { GraphQLClient, gql } from "graphql-request";

export const STICKRNET_SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_STICKRNET_SUBGRAPH_URL || "";

const client = new GraphQLClient(STICKRNET_SUBGRAPH_URL, {
  fetch,
});

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
  id: string;
  index: string;
  name: string;
  symbol: string;
  uri: string;
  unit: string;
  minter: string;
  rewarder: string;
  auction: string;
  lpToken: string;
  treasury: string;
  team: string;
  contentCount: string;
  collectCount: string;
  collectVolume: string;
  totalStaked: string;
  totalMinted: string;
  price: string;
  liquidity: string;
  lastSwapAt: string;
  createdAt: string;
};

export type SubgraphContent = {
  id: string;
  tokenId: string;
  creator: { id: string };
  owner: { id: string };
  uri: string;
  isApproved: boolean;
  initPrice: string;
  stake: string;
  collectCount: string;
  collectVolume: string;
  createdAt: string;
};

export type SubgraphAccount = {
  id: string;
  txCount: string;
};

export type SubgraphChannelAccount = {
  id: string;
  channel: { id: string; name: string; symbol: string; uri: string };
  collectCount: string;
  collectSpent: string;
  ownerEarned: string;
  contentCreated: string;
  creatorEarned: string;
  staked: string;
  rewardsClaimed: string;
};

export type SubgraphProfile = SubgraphAccount & {
  channelsLaunched: Array<{ id: string; name: string; symbol: string; uri: string; createdAt: string }>;
  contentCreated: Array<SubgraphContent & { channel: { id: string; name: string; symbol: string; uri: string } }>;
  contentOwned: Array<SubgraphContent & { channel: { id: string; name: string; symbol: string; uri: string } }>;
};

const CHANNEL_FIELDS = `
  id
  index
  name
  symbol
  uri
  unit
  minter
  rewarder
  auction
  lpToken
  treasury
  team
  contentCount
  collectCount
  collectVolume
  totalStaked
  totalMinted
  price
  liquidity
  lastSwapAt
  createdAt
`;

const CONTENT_FIELDS = `
  id
  tokenId
  creator { id }
  owner { id }
  uri
  isApproved
  initPrice
  stake
  collectCount
  collectVolume
  createdAt
`;

export const GET_DIRECTORY_QUERY = gql`
  query GetDirectory {
    directories(first: 1) {
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

export const GET_CHANNELS_QUERY = gql`
  query GetChannels($first: Int!, $skip: Int!, $orderBy: Channel_orderBy!, $orderDirection: OrderDirection!) {
    channels(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
      ${CHANNEL_FIELDS}
    }
  }
`;

export const SEARCH_CHANNELS_QUERY = gql`
  query SearchChannels($search: String!, $first: Int!) {
    channels(
      first: $first
      where: { or: [{ name_contains_nocase: $search }, { symbol_contains_nocase: $search }] }
      orderBy: collectVolume
      orderDirection: desc
    ) {
      ${CHANNEL_FIELDS}
    }
  }
`;

export const GET_CHANNEL_QUERY = gql`
  query GetChannel($id: ID!, $contentFirst: Int!, $contentSkip: Int!) {
    channel(id: $id) {
      ${CHANNEL_FIELDS}
      contents(first: $contentFirst, skip: $contentSkip, orderBy: createdAt, orderDirection: desc) {
        ${CONTENT_FIELDS}
      }
    }
  }
`;

export const GET_PROFILE_QUERY = gql`
  query GetProfile($id: ID!, $first: Int!) {
    account(id: $id) {
      id
      txCount
      channelsLaunched(first: $first, orderBy: createdAt, orderDirection: desc) {
        id
        name
        symbol
        uri
        createdAt
      }
      contentCreated(first: $first, orderBy: createdAt, orderDirection: desc) {
        ${CONTENT_FIELDS}
        channel { id name symbol uri }
      }
      contentOwned(first: $first, orderBy: createdAt, orderDirection: desc) {
        ${CONTENT_FIELDS}
        channel { id name symbol uri }
      }
    }
  }
`;

export async function getDirectory(): Promise<SubgraphDirectory | null> {
  if (!STICKRNET_SUBGRAPH_URL) return null;
  const data = await client.request<{ directories: SubgraphDirectory[] }>(GET_DIRECTORY_QUERY);
  return data.directories?.[0] ?? null;
}

export async function getChannels(options: {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}): Promise<SubgraphChannel[]> {
  if (!STICKRNET_SUBGRAPH_URL) return [];
  const { first = 50, skip = 0, orderBy = "collectVolume", orderDirection = "desc" } = options;
  const data = await client.request<{ channels: SubgraphChannel[] }>(GET_CHANNELS_QUERY, {
    first,
    skip,
    orderBy,
    orderDirection,
  });
  return data.channels ?? [];
}

export async function searchChannels(search: string, first = 20): Promise<SubgraphChannel[]> {
  if (!STICKRNET_SUBGRAPH_URL) return [];
  const data = await client.request<{ channels: SubgraphChannel[] }>(SEARCH_CHANNELS_QUERY, {
    search,
    first,
  });
  return data.channels ?? [];
}

export async function getChannel(id: string, first = 40, skip = 0) {
  if (!STICKRNET_SUBGRAPH_URL) return null;
  const data = await client.request<{ channel: SubgraphChannel & { contents: SubgraphContent[] } }>(
    GET_CHANNEL_QUERY,
    { id: id.toLowerCase(), contentFirst: first, contentSkip: skip }
  );
  return data.channel ?? null;
}

export async function getProfile(id: string, first = 40): Promise<SubgraphProfile | null> {
  if (!STICKRNET_SUBGRAPH_URL) return null;
  const data = await client.request<{ account: SubgraphProfile | null }>(GET_PROFILE_QUERY, {
    id: id.toLowerCase(),
    first,
  });
  return data.account ?? null;
}
