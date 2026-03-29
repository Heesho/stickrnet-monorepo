import type { NextConfig } from "next";
import path from "path";
import fs from "fs";

// Resolve @noble/hashes from whichever node_modules has it (handles different hoisting in monorepo vs Vercel)
const resolveNobleHashes = () => {
  const candidates = [
    path.resolve(process.cwd(), "node_modules/@noble/hashes"),
    path.resolve(process.cwd(), "../../node_modules/@noble/hashes"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@noble/hashes": resolveNobleHashes(),
      "@react-native-async-storage/async-storage": false,
    };

    return config;
  },
};

export default nextConfig;
