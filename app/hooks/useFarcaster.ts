"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useConnect } from "wagmi";
import { base } from "wagmi/chains";
import { SDK_READY_TIMEOUT_MS } from "@/lib/constants";

export type FarcasterUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

export type FarcasterContext = {
  user?: FarcasterUser;
};

const AUTO_CONNECT_KEY = "farcaster_auto_connect_attempted";

export function useFarcaster() {
  const readyRef = useRef(false);
  const [context, setContext] = useState<FarcasterContext | null>(null);
  const [isInFrame, setIsInFrame] = useState<boolean | null>(null);

  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();

  const farcasterConnector = connectors.find((c) => c.id === "farcasterMiniApp");
  const injectedConnector = connectors.find((c) => c.id === "injected");
  const primaryConnector = isInFrame ? farcasterConnector : injectedConnector;

  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<FarcasterContext> | FarcasterContext;
        }).context) as FarcasterContext;
        if (!cancelled) {
          const hasUser = !!(ctx?.user?.fid);
          setContext(hasUser ? ctx : null);
          setIsInFrame(hasUser);
        }
      } catch {
        if (!cancelled) {
          setContext(null);
          setIsInFrame(false);
        }
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, SDK_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isInFrame === null) return;
    if (!isInFrame) return;

    const alreadyAttempted = typeof window !== "undefined" && sessionStorage.getItem(AUTO_CONNECT_KEY);

    if (alreadyAttempted || isConnected || !farcasterConnector || isConnecting) {
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTO_CONNECT_KEY, "true");
    }

    connectAsync({
      connector: farcasterConnector,
      chainId: base.id,
    }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, farcasterConnector, isInFrame]);

  const connect = useCallback(async () => {
    if (!primaryConnector) {
      throw new Error("Wallet connector not available");
    }
    const result = await connectAsync({
      connector: primaryConnector,
      chainId: base.id,
    });
    return result.accounts[0];
  }, [connectAsync, primaryConnector]);

  return {
    context,
    user: context?.user ?? null,
    address,
    isConnected,
    isConnecting,
    isInFrame,
    connect,
    primaryConnector,
  };
}

export function getUserDisplayName(user: FarcasterUser | null | undefined): string {
  return user?.displayName ?? user?.username ?? "Farcaster user";
}

export function getUserHandle(user: FarcasterUser | null | undefined): string {
  if (user?.username) return `@${user.username}`;
  if (user?.fid) return `fid ${user.fid}`;
  return "";
}

export function initialsFrom(label?: string): string {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
}
