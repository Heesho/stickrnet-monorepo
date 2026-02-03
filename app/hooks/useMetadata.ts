"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipfsToHttp } from "@/lib/constants";

export type TokenMetadata = {
  name?: string;
  image?: string;
  description?: string;
  animation_url?: string;
  external_url?: string;
};

const METADATA_STALE_TIME = 30 * 60 * 1000;

async function fetchMetadata(uri: string): Promise<TokenMetadata | null> {
  if (!uri || uri === "") return null;
  const metadataUrl = ipfsToHttp(uri);
  if (!metadataUrl) return null;

  try {
    const response = await fetch(metadataUrl);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as TokenMetadata;
  } catch {
    return null;
  }
}

export function useTokenMetadata(uri: string | undefined) {
  const validUri = uri && uri.length > 0;

  const { data: metadata, isLoading } = useQuery({
    queryKey: ["tokenMetadata", uri],
    queryFn: () => fetchMetadata(uri!),
    enabled: !!validUri,
    staleTime: METADATA_STALE_TIME,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1000,
  });

  const logoUrl = metadata?.image ? ipfsToHttp(metadata.image) : null;

  return {
    metadata,
    logoUrl,
    isLoading: validUri ? isLoading : false,
  };
}

export function usePrefetchMetadata() {
  const queryClient = useQueryClient();

  const prefetch = useCallback(
    (uris: string[]) => {
      const uniqueUris = [...new Set(uris.filter(Boolean))];
      uniqueUris.forEach((uri) => {
        queryClient.prefetchQuery({
          queryKey: ["tokenMetadata", uri],
          queryFn: () => fetchMetadata(uri),
          staleTime: METADATA_STALE_TIME,
        });
      });
    },
    [queryClient]
  );

  return prefetch;
}

export function useBatchMetadata(uris: string[]) {
  const uniqueUris = [...new Set(uris.filter(Boolean))];

  const { data: metadataMap, isLoading } = useQuery({
    queryKey: ["batchMetadata", uniqueUris.sort().join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        uniqueUris.map(async (uri) => {
          const metadata = await fetchMetadata(uri);
          return [uri, metadata] as const;
        })
      );
      return Object.fromEntries(results) as Record<string, TokenMetadata | null>;
    },
    enabled: uniqueUris.length > 0,
    staleTime: METADATA_STALE_TIME,
    gcTime: 60 * 60 * 1000,
  });

  return {
    metadataMap: metadataMap ?? {},
    isLoading,
    getLogoUrl: (uri: string) => {
      const metadata = metadataMap?.[uri];
      return metadata?.image ? ipfsToHttp(metadata.image) : null;
    },
  };
}
