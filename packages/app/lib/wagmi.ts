import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { fallback, http, createStorage, cookieStorage } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// Base Sepolia RPC endpoints with automatic fallback.
const BASE_RPC_ENDPOINTS = [
  // Primary RPC from env
  process.env.NEXT_PUBLIC_BASE_RPC_URL,
  // Alchemy backup from env
  process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL,
  "https://sepolia.base.org",
].filter((url): url is string => !!url && url !== "");

// Create transport array with retry configuration
const baseTransports = BASE_RPC_ENDPOINTS.map((url) =>
  http(url, {
    // Retry configuration for each transport
    retryCount: 2,
    retryDelay: 1000,
    timeout: 10_000,
  })
);

// Always include both connectors - wagmi picks the right one at runtime
const connectors = [farcasterMiniApp(), injected()];

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  ssr: true,
  connectors,
  transports: {
    // Fallback transport: tries each RPC in order until one succeeds
    // rank: true means it will prefer faster RPCs over time
    [baseSepolia.id]: fallback(baseTransports, { rank: true }),
  },
  storage: createStorage({
    storage: cookieStorage,
  }),
  // Increased polling interval to reduce request frequency
  pollingInterval: 15_000,
});
