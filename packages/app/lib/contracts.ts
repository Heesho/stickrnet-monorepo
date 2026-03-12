export const CONTRACT_ADDRESSES = {
  core: "0xf1fc02884D1D701fca31b8f90B309b726597424A",
  multicall: "0xAEd96fA4549eCD551e06ff644e6Fe86BfEd6B3A6",
  usdc: "0xe90495BE187d434e23A9B1FeC0B6Ce039700870e",
  uniV2Router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  uniV2Factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
} as const;

// Native ETH placeholder address used by 0x API
export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Core contract ABI - for reading deployed content state
export const CORE_ABI = [
  {
    inputs: [{ internalType: "address", name: "content", type: "address" }],
    name: "isDeployedContent",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "content", type: "address" }],
    name: "contentToAuction",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "content", type: "address" }],
    name: "contentToLP",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "contents",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "contentsLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "content", type: "address" }],
    name: "contentToIndex",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "protocolFeeAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "uniswapV2Factory",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "uniswapV2Router",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "quote",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minQuoteForLaunch",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Multicall ABI - for batched operations and state queries
export const MULTICALL_ABI = [
  // getCoinState - get aggregated coin ecosystem state
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "getCoinState",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "index", type: "uint256" },
          { internalType: "address", name: "coin", type: "address" },
          { internalType: "address", name: "quote", type: "address" },
          { internalType: "address", name: "launcher", type: "address" },
          { internalType: "address", name: "minter", type: "address" },
          { internalType: "address", name: "rewarder", type: "address" },
          { internalType: "address", name: "auction", type: "address" },
          { internalType: "address", name: "lp", type: "address" },
          { internalType: "string", name: "uri", type: "string" },
          { internalType: "bool", name: "isModerated", type: "bool" },
          { internalType: "uint256", name: "totalSupply", type: "uint256" },
          { internalType: "uint256", name: "marketCapInQuote", type: "uint256" },
          { internalType: "uint256", name: "liquidityInQuote", type: "uint256" },
          { internalType: "uint256", name: "priceInQuote", type: "uint256" },
          { internalType: "uint256", name: "contentRewardForDuration", type: "uint256" },
          { internalType: "uint256", name: "accountQuoteBalance", type: "uint256" },
          { internalType: "uint256", name: "accountCoinBalance", type: "uint256" },
          { internalType: "uint256", name: "accountContentOwned", type: "uint256" },
          { internalType: "uint256", name: "accountContentStaked", type: "uint256" },
          { internalType: "uint256", name: "accountCoinEarned", type: "uint256" },
          { internalType: "uint256", name: "accountClaimable", type: "uint256" },
          { internalType: "bool", name: "accountIsModerator", type: "bool" },
        ],
        internalType: "struct Multicall.CoinState",
        name: "state",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getContentState - get state for a single content token
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "getContentState",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "tokenId", type: "uint256" },
          { internalType: "uint256", name: "epochId", type: "uint256" },
          { internalType: "uint256", name: "startTime", type: "uint256" },
          { internalType: "uint256", name: "initPrice", type: "uint256" },
          { internalType: "uint256", name: "stake", type: "uint256" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "uint256", name: "rewardForDuration", type: "uint256" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "string", name: "uri", type: "string" },
          { internalType: "bool", name: "isApproved", type: "bool" },
        ],
        internalType: "struct Multicall.ContentState",
        name: "state",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getAuctionState - get aggregated auction state
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "getAuctionState",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "epochId", type: "uint256" },
          { internalType: "uint256", name: "initPrice", type: "uint256" },
          { internalType: "uint256", name: "startTime", type: "uint256" },
          { internalType: "address", name: "paymentToken", type: "address" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "uint256", name: "paymentTokenPrice", type: "uint256" },
          { internalType: "uint256", name: "quoteAccumulated", type: "uint256" },
          { internalType: "uint256", name: "accountQuoteBalance", type: "uint256" },
          { internalType: "uint256", name: "accountPaymentTokenBalance", type: "uint256" },
        ],
        internalType: "struct Multicall.AuctionState",
        name: "state",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // collect - collect content using quote token
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPrice", type: "uint256" },
    ],
    name: "collect",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // buy - buy from auction using LP tokens
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPaymentTokenAmount", type: "uint256" },
    ],
    name: "buy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // launch - launch a new stickr channel
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "launcher", type: "address" },
          { internalType: "string", name: "tokenName", type: "string" },
          { internalType: "string", name: "tokenSymbol", type: "string" },
          { internalType: "string", name: "uri", type: "string" },
          { internalType: "uint256", name: "quoteAmount", type: "uint256" },
          { internalType: "uint256", name: "coinAmount", type: "uint256" },
          { internalType: "uint256", name: "initialUps", type: "uint256" },
          { internalType: "uint256", name: "tailUps", type: "uint256" },
          { internalType: "uint256", name: "halvingPeriod", type: "uint256" },
          { internalType: "uint256", name: "contentMinInitPrice", type: "uint256" },
          { internalType: "bool", name: "contentIsModerated", type: "bool" },
          { internalType: "uint256", name: "auctionInitPrice", type: "uint256" },
          { internalType: "uint256", name: "auctionEpochPeriod", type: "uint256" },
          { internalType: "uint256", name: "auctionPriceMultiplier", type: "uint256" },
          { internalType: "uint256", name: "auctionMinInitPrice", type: "uint256" },
        ],
        internalType: "struct ICore.LaunchParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "launch",
    outputs: [
      { internalType: "address", name: "coin", type: "address" },
      { internalType: "address", name: "content", type: "address" },
      { internalType: "address", name: "minter", type: "address" },
      { internalType: "address", name: "rewarder", type: "address" },
      { internalType: "address", name: "auction", type: "address" },
      { internalType: "address", name: "lpToken", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  // claimRewards - claim all rewards (coin from rewarder + fees from content)
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
    ],
    name: "claimRewards",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // updateMinterPeriod - trigger weekly emission update
  {
    inputs: [
      { internalType: "address", name: "content", type: "address" },
    ],
    name: "updateMinterPeriod",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Core and token addresses
  {
    inputs: [],
    name: "core",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "quote",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ERC20 ABI - for token interactions
export const ERC20_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Content contract ABI - for direct content NFT reads and writes
export const CONTENT_ABI = [
  // View functions
  {
    inputs: [],
    name: "coin",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "quote",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "uri",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "rewarder",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "core",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "isModerated",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minInitPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextTokenId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "treasury",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "team",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToCreator",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToStake",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToEpochId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToStartTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToInitPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "idToApproved",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "accountToClaimable",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "accountToIsModerator",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Write functions
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "string", name: "tokenUri", type: "string" },
    ],
    name: "create",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "epochId", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint256", name: "maxPrice", type: "uint256" },
    ],
    name: "collect",
    outputs: [{ internalType: "uint256", name: "price", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "_uri", type: "string" }],
    name: "setUri",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_treasury", type: "address" }],
    name: "setTreasury",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_team", type: "address" }],
    name: "setTeam",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bool", name: "_isModerated", type: "bool" }],
    name: "setIsModerated",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address[]", name: "accounts", type: "address[]" },
      { internalType: "bool", name: "_accountToIsModerator", type: "bool" },
    ],
    name: "setModerators",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256[]", name: "tokenIds", type: "uint256[]" }],
    name: "approveContents",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Auction contract ABI
export const AUCTION_ABI = [
  {
    inputs: [],
    name: "epochId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "initPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "startTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paymentToken",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paymentReceiver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "epochPeriod",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "priceMultiplier",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minInitPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// TypeScript types for contract returns
export type CoinState = {
  index: bigint;
  coin: `0x${string}`;
  quote: `0x${string}`;
  launcher: `0x${string}`;
  minter: `0x${string}`;
  rewarder: `0x${string}`;
  auction: `0x${string}`;
  lp: `0x${string}`;
  uri: string;
  isModerated: boolean;
  totalSupply: bigint;
  marketCapInQuote: bigint;
  liquidityInQuote: bigint;
  priceInQuote: bigint;
  contentRewardForDuration: bigint;
  accountQuoteBalance: bigint;
  accountCoinBalance: bigint;
  accountContentOwned: bigint;
  accountContentStaked: bigint;
  accountCoinEarned: bigint;
  accountClaimable: bigint;
  accountIsModerator: boolean;
};

export type ContentState = {
  tokenId: bigint;
  epochId: bigint;
  startTime: bigint;
  initPrice: bigint;
  stake: bigint;
  price: bigint;
  rewardForDuration: bigint;
  creator: `0x${string}`;
  owner: `0x${string}`;
  uri: string;
  isApproved: boolean;
};

export type AuctionState = {
  epochId: bigint;
  initPrice: bigint;
  startTime: bigint;
  paymentToken: `0x${string}`;
  price: bigint;
  paymentTokenPrice: bigint;
  quoteAccumulated: bigint;
  accountQuoteBalance: bigint;
  accountPaymentTokenBalance: bigint;
};

export type LaunchParams = {
  launcher: `0x${string}`;
  tokenName: string;
  tokenSymbol: string;
  uri: string;
  quoteAmount: bigint;
  coinAmount: bigint;
  initialUps: bigint;
  tailUps: bigint;
  halvingPeriod: bigint;
  contentMinInitPrice: bigint;
  contentIsModerated: boolean;
  auctionInitPrice: bigint;
  auctionEpochPeriod: bigint;
  auctionPriceMultiplier: bigint;
  auctionMinInitPrice: bigint;
};

// Default launch parameters
export const LAUNCH_DEFAULTS = {
  uri: "",
  quoteAmount: BigInt("1000000"), // 1 USDC (6 decimals) - min launch amount
  coinAmount: BigInt("10000000000000000000000"), // 10,000 coins (18 decimals)
  initialUps: BigInt("1157407407407407407"), // ~100K coins/day (18 decimals)
  tailUps: BigInt("11574074074074074"), // ~1K coins/day (18 decimals)
  halvingPeriod: BigInt(30 * 24 * 3600), // 30 days
  contentMinInitPrice: BigInt("1000000"), // 1 USDC min content price
  contentIsModerated: false,
  auctionInitPrice: BigInt("1000000000000000000000"), // 1000 LP tokens
  auctionEpochPeriod: BigInt(24 * 60 * 60), // 24 hours
  auctionPriceMultiplier: BigInt("1200000000000000000"), // 1.2x
  auctionMinInitPrice: BigInt("1000000000000000000000"), // 1000 LP
} as const;

// Mock USDC mint ABI (for staging/testing only)
export const MOCK_MINT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Uniswap V2 Router ABI
export const UNIV2_ROUTER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
      { internalType: "uint256", name: "amountADesired", type: "uint256" },
      { internalType: "uint256", name: "amountBDesired", type: "uint256" },
      { internalType: "uint256", name: "amountAMin", type: "uint256" },
      { internalType: "uint256", name: "amountBMin", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "addLiquidity",
    outputs: [
      { internalType: "uint256", name: "amountA", type: "uint256" },
      { internalType: "uint256", name: "amountB", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
    ],
    name: "getAmountsOut",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapExactTokensForTokens",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Uniswap V2 Factory ABI
export const UNIV2_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenA", type: "address" },
      { internalType: "address", name: "tokenB", type: "address" },
    ],
    name: "getPair",
    outputs: [
      { internalType: "address", name: "pair", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Uniswap V2 Pair ABI (for getReserves)
export const UNIV2_PAIR_ABI = [
  {
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "reserve0", type: "uint112" },
      { internalType: "uint112", name: "reserve1", type: "uint112" },
      { internalType: "uint32", name: "blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Quote token decimals (USDC = 6)
export const QUOTE_TOKEN_DECIMALS = 6;
