const { config } = require("dotenv");

require("@nomiclabs/hardhat-waffle");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");

const CHAIN_ID = 84532; // Base Sepolia

config();
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SCAN_API_KEY = process.env.SCAN_API_KEY || "";
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      metadata: {
        bytecodeHash: "ipfs",
        useLiteralContent: false,
      },
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "evm.methodIdentifiers",
            "metadata",
            "storageLayout",
          ],
          "": ["ast"],
        },
      },
    },
  },
  networks: {
    baseSepolia: {
      url: RPC_URL,
      chainId: CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    hardhat: {
      allowBlocksWithSameTimestamp: true,
      accounts: {
        count: 20,
        accountsBalance: "100000000000000000000000", // 100000 ETH per account
      },
      gas: 30000000,
      blockGasLimit: 30000000,
    },
  },
  etherscan: {
    apiKey: {
        baseSepolia: SCAN_API_KEY,
    },
    customChains: [
      {
          network: "baseSepolia",
          chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 300000,
  },
};
