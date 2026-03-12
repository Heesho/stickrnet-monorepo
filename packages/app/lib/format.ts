import { formatUnits, formatEther } from "viem";
import { QUOTE_TOKEN_DECIMALS } from "@/lib/contracts";

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUSDC(value: bigint): string {
  return Number(formatUnits(value, QUOTE_TOKEN_DECIMALS)).toFixed(2);
}

export function formatUSDC4(value: bigint): string {
  return Number(formatUnits(value, QUOTE_TOKEN_DECIMALS)).toFixed(4);
}

export function formatCompactToken(value: bigint): string {
  const num = Number(formatEther(value));
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

export function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(decimals)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(decimals);
}

export function formatMarketCap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  if (mcap >= 1) return `$${mcap.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${mcap.toFixed(4)}`;
}

export function formatPrice(price: number): string {
  if (price === 0) return "$0.00";
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  if (price >= 0.000001) return `$${price.toFixed(8)}`;
  if (price >= 0.00000001) return `$${price.toFixed(10)}`;
  return `$${price.toFixed(12)}`;
}

export function formatCoin(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  if (n < 1) return n.toFixed(6);
  return n.toFixed(2);
}
