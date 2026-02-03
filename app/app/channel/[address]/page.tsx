"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePublicClient, useWriteContract } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { useChannel } from "@/hooks/useChannel";
import { useBatchMetadata, useTokenMetadata } from "@/hooks/useMetadata";
import { useFarcaster } from "@/hooks/useFarcaster";
import { CONTENT_ABI, CONTRACT_ADDRESSES, ERC20_ABI } from "@/lib/contracts";
import { DEADLINE_BUFFER_SECONDS, ipfsToHttp } from "@/lib/constants";
import { STICKRNET_SUBGRAPH_URL } from "@/lib/subgraph";

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export default function ChannelPage() {
  const params = useParams();
  const channelAddress = typeof params.address === "string" ? params.address : params.address?.[0];
  const { channel, isLoading } = useChannel(channelAddress);
  const { address: account, isConnected, isConnecting, isInFrame, connect } = useFarcaster();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { metadata: channelMetadata, logoUrl: channelLogo } = useTokenMetadata(channel?.uri);
  const contentUris = channel?.contents?.map((c) => c.uri) ?? [];
  const { metadataMap, getLogoUrl } = useBatchMetadata(contentUris);

  const [createUri, setCreateUri] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!channel) return null;
    const price = parseFloat(channel.price) || 0;
    const totalMinted = parseFloat(channel.totalMinted) || 0;
    return {
      price,
      liquidity: parseFloat(channel.liquidity) || 0,
      totalStaked: parseFloat(channel.totalStaked) || 0,
      collectVolume: parseFloat(channel.collectVolume) || 0,
      marketCap: price * totalMinted,
    };
  }, [channel]);

  const isSubgraphReady = STICKRNET_SUBGRAPH_URL.length > 0;

  const handleCreate = async () => {
    if (!channelAddress || !createUri) return;
    setActionError(null);

    try {
      if (!publicClient) {
        setActionError("Wallet client not ready.");
        return;
      }
      const activeAccount =
        account ?? (isConnected ? account : await connect().catch(() => null));
      if (!activeAccount) return;

      setCreatePending(true);
      const txHash = await writeContractAsync({
        address: channelAddress as `0x${string}`,
        abi: CONTENT_ABI,
        functionName: "create",
        args: [activeAccount as `0x${string}`, createUri],
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setCreateUri("");
    } catch (error) {
      setActionError("Failed to create Sticker. Check the URI and try again.");
    } finally {
      setCreatePending(false);
    }
  };

  const handleCollect = async (tokenId: string) => {
    if (!channelAddress) return;
    setActionError(null);

    try {
      if (!publicClient) {
        setActionError("Wallet client not ready.");
        return;
      }
      const activeAccount =
        account ?? (isConnected ? account : await connect().catch(() => null));
      if (!activeAccount) return;

      setCollectingId(tokenId);

      const price = (await publicClient?.readContract({
        address: channelAddress as `0x${string}`,
        abi: CONTENT_ABI,
        functionName: "getPrice",
        args: [BigInt(tokenId)],
      })) as bigint;

      const epochId = (await publicClient?.readContract({
        address: channelAddress as `0x${string}`,
        abi: CONTENT_ABI,
        functionName: "idToEpochId",
        args: [BigInt(tokenId)],
      })) as bigint;

      const allowance = (await publicClient?.readContract({
        address: CONTRACT_ADDRESSES.quoteToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [activeAccount as `0x${string}`, channelAddress as `0x${string}`],
      })) as bigint;

      const maxPrice = price + (price * 5n) / 100n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);

      if (allowance < maxPrice) {
        const approveHash = await writeContractAsync({
          address: CONTRACT_ADDRESSES.quoteToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [channelAddress as `0x${string}`, maxPrice],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }

      const txHash = await writeContractAsync({
        address: channelAddress as `0x${string}`,
        abi: CONTENT_ABI,
        functionName: "collect",
        args: [activeAccount as `0x${string}`, BigInt(tokenId), epochId, deadline, maxPrice],
      });
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
    } catch (error) {
      setActionError("Collect failed. Please try again.");
    } finally {
      setCollectingId(null);
    }
  };

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {!isSubgraphReady && (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <p className="text-[15px] font-medium">Subgraph not configured</p>
            <p className="text-[13px] mt-1 opacity-70">Set NEXT_PUBLIC_STICKRNET_SUBGRAPH_URL</p>
          </div>
        )}

        {isSubgraphReady && isLoading && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading channel...</div>
        )}

        {isSubgraphReady && !isLoading && !channel && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">Channel not found.</div>
        )}

        {isSubgraphReady && channel && (
          <div className="flex h-full flex-col">
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {channelLogo ? (
                    <img src={channelLogo} alt={channel.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-500 to-zinc-700 text-white flex items-center justify-center font-semibold">
                      {channel.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-lg font-semibold">{channel.name}</div>
                    <div className="text-sm text-muted-foreground">${channel.symbol}</div>
                  </div>
                </div>

                {isConnected && account ? (
                  <div className="px-3 py-1.5 rounded-full bg-secondary text-[13px] text-muted-foreground font-mono">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </div>
                ) : (
                  !isInFrame && (
                    <button
                      onClick={() => connect()}
                      disabled={isConnecting}
                      className="px-4 py-2 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {isConnecting ? "Connecting..." : "Connect Wallet"}
                    </button>
                  )
                )}
              </div>

              {channelMetadata?.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{channelMetadata.description}</p>
              )}

              {stats && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="card-elevated p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Price</div>
                    <div className="text-[16px] font-semibold tabular-nums">{formatUsd(stats.price)}</div>
                  </div>
                  <div className="card-elevated p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Liquidity</div>
                    <div className="text-[16px] font-semibold tabular-nums">{formatUsd(stats.liquidity)}</div>
                  </div>
                  <div className="card-elevated p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Market Cap</div>
                    <div className="text-[16px] font-semibold tabular-nums">{formatUsd(stats.marketCap)}</div>
                  </div>
                  <div className="card-elevated p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Collect Volume</div>
                    <div className="text-[16px] font-semibold tabular-nums">{formatUsd(stats.collectVolume)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 pb-3">
              <div className="card-elevated p-4">
                <div className="text-sm font-semibold mb-2">Create a Sticker</div>
                <p className="text-[12px] text-muted-foreground mb-3">
                  Paste an IPFS or HTTPS metadata URI. The metadata can include an image and description.
                </p>
                <div className="flex gap-2">
                  <input
                    value={createUri}
                    onChange={(e) => setCreateUri(e.target.value)}
                    placeholder="ipfs://..."
                    className="flex-1 h-10 rounded-lg bg-secondary px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={createPending || !createUri}
                    className="px-4 h-10 rounded-lg bg-white text-black text-[13px] font-semibold disabled:opacity-50"
                  >
                    {createPending ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>

            {actionError && (
              <div className="px-4 pb-2 text-[12px] text-red-300">{actionError}</div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Stickers</h2>
                <span className="text-[12px] text-muted-foreground">{channel.contentCount} total</span>
              </div>

              {channel.contents.length === 0 && (
                <div className="text-sm text-muted-foreground">No Stickers yet.</div>
              )}

              <div className="space-y-3">
                {channel.contents.map((content) => {
                  const metadata = metadataMap[content.uri];
                  const resolvedImage = metadata?.image ? ipfsToHttp(metadata.image) : null;

                  const stakeUsd = parseFloat(content.stake) || 0;
                  const lastPrice = stakeUsd > 0 ? formatUsd(stakeUsd) : "--";

                  return (
                    <div key={content.id} className="card-elevated p-4 flex gap-3 items-start">
                      {resolvedImage ? (
                        <img src={resolvedImage} alt="Sticker" className="w-14 h-14 rounded-lg object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-[12px]">
                          #{content.tokenId}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="text-[14px] font-semibold">
                            {metadata?.name || `Sticker #${content.tokenId}`}
                          </div>
                          <div className="text-[12px] text-muted-foreground">{lastPrice}</div>
                        </div>
                        {metadata?.description && (
                          <p className="text-[12px] text-muted-foreground mt-1">
                            {metadata.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-[11px] text-muted-foreground">
                            {content.collectCount} collects · {formatCompact(parseFloat(content.collectVolume) || 0)} USDC
                          </div>
                          <button
                            onClick={() => handleCollect(content.tokenId)}
                            disabled={collectingId === content.tokenId}
                            className="px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold disabled:opacity-50"
                          >
                            {collectingId === content.tokenId ? "Collecting..." : "Collect"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      <NavBar />
    </main>
  );
}
