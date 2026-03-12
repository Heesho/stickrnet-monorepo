import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DEFAULT_ETH_PRICE_USD, PRICE_CACHE_TTL_MS } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Price cache
let ethPriceCache: { price: number; timestamp: number } | null = null;

export async function getEthPrice(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.timestamp < PRICE_CACHE_TTL_MS) {
    return ethPriceCache.price;
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const data = await response.json();
    const price = data.ethereum?.usd ?? DEFAULT_ETH_PRICE_USD;
    ethPriceCache = { price, timestamp: Date.now() };
    return price;
  } catch {
    return ethPriceCache?.price ?? DEFAULT_ETH_PRICE_USD;
  }
}
