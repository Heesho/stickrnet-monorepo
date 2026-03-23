import { ipfsToHttp } from "./constants";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  defaultMessage?: string;
  recipientName?: string;
  links?: string[];
  imageUrl?: string | null;
  // Legacy format support
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
};

export function normalizeTokenMetadata(input: unknown): TokenMetadata | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const image = typeof record.image === "string" ? record.image : undefined;

  return {
    name: typeof record.name === "string" ? record.name : undefined,
    symbol: typeof record.symbol === "string" ? record.symbol : undefined,
    image,
    description: typeof record.description === "string" ? record.description : undefined,
    defaultMessage: typeof record.defaultMessage === "string" ? record.defaultMessage : undefined,
    recipientName: typeof record.recipientName === "string" ? record.recipientName : undefined,
    links: Array.isArray(record.links)
      ? record.links.filter((link): link is string => typeof link === "string" && link.trim().length > 0)
      : undefined,
    imageUrl: image ? ipfsToHttp(image) : null,
    website: typeof record.website === "string" ? record.website : undefined,
    twitter: typeof record.twitter === "string" ? record.twitter : undefined,
    telegram: typeof record.telegram === "string" ? record.telegram : undefined,
    discord: typeof record.discord === "string" ? record.discord : undefined,
  };
}
