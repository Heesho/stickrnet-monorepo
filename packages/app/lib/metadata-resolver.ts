import { ipfsToHttp } from "@/lib/constants";
import { normalizeTokenMetadata, type TokenMetadata } from "@/lib/metadata";

const METADATA_REVALIDATE_SECONDS = 30 * 60;
const MAX_BATCH_SIZE = 100;

function normalizeUris(uris: string[]): string[] {
  return [...new Set(
    uris
      .filter((uri): uri is string => typeof uri === "string")
      .map((uri) => uri.trim())
      .filter(Boolean)
  )].slice(0, MAX_BATCH_SIZE);
}

export async function resolveMetadataUri(uri: string): Promise<TokenMetadata | null> {
  const metadataUrl = ipfsToHttp(uri);
  if (!metadataUrl) return null;

  try {
    const response = await fetch(metadataUrl, {
      next: { revalidate: METADATA_REVALIDATE_SECONDS },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return normalizeTokenMetadata(data);
  } catch {
    return null;
  }
}

export async function resolveMetadataBatch(uris: string[]): Promise<Record<string, TokenMetadata | null>> {
  const uniqueUris = normalizeUris(uris);

  const results = await Promise.all(
    uniqueUris.map(async (uri) => {
      const metadata = await resolveMetadataUri(uri);
      return [uri, metadata] as const;
    })
  );

  return Object.fromEntries(results) as Record<string, TokenMetadata | null>;
}
