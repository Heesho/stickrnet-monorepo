"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipfsToHttp } from "@/lib/constants";
import type { TokenMetadata } from "@/lib/metadata";

export type { TokenMetadata } from "@/lib/metadata";

const METADATA_STALE_TIME = 30 * 60 * 1000; // 30 minutes - metadata rarely changes

async function fetchMetadataBatch(rigUris: string[]): Promise<Record<string, TokenMetadata | null>> {
  const uniqueUris = [...new Set(
    rigUris
      .filter((uri): uri is string => typeof uri === "string")
      .map((uri) => uri.trim())
      .filter(Boolean)
  )];

  if (uniqueUris.length === 0) return {};

  try {
    const response = await fetch("/api/metadata/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: uniqueUris }),
    });

    if (!response.ok) {
      return Object.fromEntries(uniqueUris.map((uri) => [uri, null])) as Record<string, TokenMetadata | null>;
    }

    const data = await response.json();
    return (data?.metadataMap ?? {}) as Record<string, TokenMetadata | null>;
  } catch {
    return Object.fromEntries(uniqueUris.map((uri) => [uri, null])) as Record<string, TokenMetadata | null>;
  }
}

/**
 * Fetch and cache token metadata from IPFS
 * Uses React Query for caching and deduplication
 */
async function fetchMetadata(rigUri: string): Promise<TokenMetadata | null> {
  if (!rigUri || rigUri === "") return null;
  const metadataMap = await fetchMetadataBatch([rigUri]);
  return metadataMap[rigUri] ?? null;
}

/**
 * Hook for fetching token metadata with caching
 */
export function useTokenMetadata(rigUri: string | undefined) {
  const validUri = rigUri && rigUri.trim().length > 0;

  const { data: metadata, isLoading } = useQuery({
    queryKey: ["tokenMetadata", rigUri],
    queryFn: () => fetchMetadata(rigUri!),
    enabled: !!validUri,
    staleTime: METADATA_STALE_TIME,
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    retry: 2, // Retry twice on failure
    retryDelay: 1000, // Wait 1 second between retries
  });

  const logoUrl = metadata?.imageUrl ?? (metadata?.image ? ipfsToHttp(metadata.image) : null);

  return {
    metadata,
    logoUrl,
    isLoading: validUri ? isLoading : false,
  };
}

/**
 * Hook to prefetch metadata for multiple rigs at once
 * Call this when you have a list of rigs to prefetch their metadata
 */
export function usePrefetchMetadata() {
  const queryClient = useQueryClient();

  // Memoize the prefetch function to prevent useEffect loops
  const prefetch = useCallback((rigUris: string[]) => {
    const uniqueUris = [...new Set(rigUris.filter((uri) => uri && uri.trim().length > 0))];

    uniqueUris.forEach((rigUri) => {
      queryClient.prefetchQuery({
        queryKey: ["tokenMetadata", rigUri],
        queryFn: () => fetchMetadata(rigUri),
        staleTime: METADATA_STALE_TIME,
      });
    });
  }, [queryClient]);

  return prefetch;
}

/**
 * Batch fetch metadata for multiple rigs
 * Returns a map of rigUri -> metadata
 */
export function useBatchMetadata(rigUris: string[]) {
  const uniqueUris = [...new Set(rigUris.filter((uri) => typeof uri === "string" && uri.trim().length > 0))];

  const { data: metadataMap, isLoading } = useQuery({
    queryKey: ["batchMetadata", uniqueUris.sort().join(",")],
    queryFn: () => fetchMetadataBatch(uniqueUris),
    enabled: uniqueUris.length > 0,
    staleTime: METADATA_STALE_TIME,
    gcTime: 60 * 60 * 1000,
  });

  return {
    metadataMap: metadataMap ?? {},
    isLoading,
    getLogoUrl: (rigUri: string) => {
      const metadata = metadataMap?.[rigUri];
      return metadata?.imageUrl ?? (metadata?.image ? ipfsToHttp(metadata.image) : null);
    },
  };
}
