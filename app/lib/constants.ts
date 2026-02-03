import { base } from "wagmi/chains";

export const SDK_READY_TIMEOUT_MS = 1200;
export const DEADLINE_BUFFER_SECONDS = 15 * 60;

export const DEFAULT_CHAIN_ID = base.id;

export const UNIT_TOKEN_DECIMALS = 18;
export const QUOTE_TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_QUOTE_TOKEN_DECIMALS || 6);

export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io";

export function ipfsToHttp(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice(7);
    const baseUrl = IPFS_GATEWAY.replace(/\/$/, "");
    return `${baseUrl}/ipfs/${cid}`;
  }
  if (!uri.startsWith("http://") && !uri.startsWith("https://") && uri.includes(".")) {
    return `https://${uri}`;
  }
  return uri;
}
