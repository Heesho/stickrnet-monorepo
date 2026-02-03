"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { NavBar } from "@/components/nav-bar";
import { useFarcaster } from "@/hooks/useFarcaster";
import { CONTRACT_ADDRESSES, CORE_ABI, ERC20_ABI } from "@/lib/contracts";
import { QUOTE_TOKEN_DECIMALS } from "@/lib/constants";

const DEFAULTS = {
  quoteAmount: "1000",
  unitAmount: "1000000",
  initialUps: "1",
  tailUps: "0.001",
  halvingPeriodDays: "30",
  contentMinInitPrice: "1",
  auctionInitPrice: "1",
  auctionEpochPeriodDays: "7",
  auctionPriceMultiplier: "1.5",
  auctionMinInitPrice: "1",
};

export default function LaunchPage() {
  const { address: account, isConnected, isConnecting, isInFrame, connect } = useFarcaster();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [channelUri, setChannelUri] = useState("");
  const [quoteAmount, setQuoteAmount] = useState(DEFAULTS.quoteAmount);
  const [unitAmount, setUnitAmount] = useState(DEFAULTS.unitAmount);
  const [initialUps, setInitialUps] = useState(DEFAULTS.initialUps);
  const [tailUps, setTailUps] = useState(DEFAULTS.tailUps);
  const [halvingPeriodDays, setHalvingPeriodDays] = useState(DEFAULTS.halvingPeriodDays);
  const [contentMinInitPrice, setContentMinInitPrice] = useState(DEFAULTS.contentMinInitPrice);
  const [contentIsModerated, setContentIsModerated] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [auctionInitPrice, setAuctionInitPrice] = useState(DEFAULTS.auctionInitPrice);
  const [auctionEpochPeriodDays, setAuctionEpochPeriodDays] = useState(DEFAULTS.auctionEpochPeriodDays);
  const [auctionPriceMultiplier, setAuctionPriceMultiplier] = useState(DEFAULTS.auctionPriceMultiplier);
  const [auctionMinInitPrice, setAuctionMinInitPrice] = useState(DEFAULTS.auctionMinInitPrice);

  const [launchPending, setLaunchPending] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLaunchError(null);

    try {
      if (!publicClient) {
        setLaunchError("Wallet client not ready.");
        return;
      }
      const activeAccount =
        account ?? (isConnected ? account : await connect().catch(() => null));
      if (!activeAccount) return;

      setLaunchPending(true);

      const quoteAmountWei = parseUnits(quoteAmount || "0", QUOTE_TOKEN_DECIMALS);
      const unitAmountWei = parseUnits(unitAmount || "0", 18);
      const initialUpsWei = parseUnits(initialUps || "0", 18);
      const tailUpsWei = parseUnits(tailUps || "0", 18);
      const halvingPeriod = BigInt(Math.floor(Number(halvingPeriodDays || 0) * 86400));
      const contentMinInitPriceWei = parseUnits(contentMinInitPrice || "0", QUOTE_TOKEN_DECIMALS);
      const auctionInitPriceWei = parseUnits(auctionInitPrice || "0", 18);
      const auctionEpochPeriod = BigInt(Math.floor(Number(auctionEpochPeriodDays || 0) * 86400));
      const auctionPriceMultiplierWei = parseUnits(auctionPriceMultiplier || "0", 18);
      const auctionMinInitPriceWei = parseUnits(auctionMinInitPrice || "0", 18);

      const allowance = (await publicClient?.readContract({
        address: CONTRACT_ADDRESSES.quoteToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [activeAccount as `0x${string}`, CONTRACT_ADDRESSES.core],
      })) as bigint;

      if (allowance < quoteAmountWei) {
        const approveHash = await writeContractAsync({
          address: CONTRACT_ADDRESSES.quoteToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACT_ADDRESSES.core, quoteAmountWei],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }

      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.core,
        abi: CORE_ABI,
        functionName: "launch",
        args: [
          {
            launcher: activeAccount as `0x${string}`,
            tokenName,
            tokenSymbol,
            uri: channelUri,
            quoteAmount: quoteAmountWei,
            unitAmount: unitAmountWei,
            initialUps: initialUpsWei,
            tailUps: tailUpsWei,
            halvingPeriod,
            contentMinInitPrice: contentMinInitPriceWei,
            contentIsModerated,
            auctionInitPrice: auctionInitPriceWei,
            auctionEpochPeriod,
            auctionPriceMultiplier: auctionPriceMultiplierWei,
            auctionMinInitPrice: auctionMinInitPriceWei,
          },
        ],
      });

      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      setTokenName("");
      setTokenSymbol("");
      setChannelUri("");
    } catch (error) {
      setLaunchError("Launch failed. Check inputs and wallet approvals, then try again.");
    } finally {
      setLaunchPending(false);
    }
  };

  const isDisabled = !tokenName || !tokenSymbol || !channelUri || launchPending;

  return (
    <main className="flex h-screen w-screen justify-center bg-zinc-800">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-background"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold tracking-tight">Launch Channel</h1>
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

          <div className="space-y-4">
            <div className="card-elevated p-4 space-y-3">
              <div>
                <label className="text-[12px] text-muted-foreground">Channel Name</label>
                <input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Stickr Art"
                  className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground">Symbol</label>
                <input
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="STKR"
                  className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div>
                <label className="text-[12px] text-muted-foreground">Channel Metadata URI</label>
                <input
                  value={channelUri}
                  onChange={(e) => setChannelUri(e.target.value)}
                  placeholder="ipfs://..."
                  className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>

            <div className="card-elevated p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground">Quote Amount (USDC)</label>
                  <input
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground">Unit Amount</label>
                  <input
                    value={unitAmount}
                    onChange={(e) => setUnitAmount(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground">Initial Units / sec</label>
                  <input
                    value={initialUps}
                    onChange={(e) => setInitialUps(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground">Tail Units / sec</label>
                  <input
                    value={tailUps}
                    onChange={(e) => setTailUps(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-muted-foreground">Halving Period (days)</label>
                  <input
                    value={halvingPeriodDays}
                    onChange={(e) => setHalvingPeriodDays(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-muted-foreground">Sticker Min Price (USDC)</label>
                  <input
                    value={contentMinInitPrice}
                    onChange={(e) => setContentMinInitPrice(e.target.value)}
                    className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={contentIsModerated}
                  onChange={(e) => setContentIsModerated(e.target.checked)}
                  className="accent-white"
                />
                Require moderation for Stickers
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced auction settings
            </button>

            {showAdvanced && (
              <div className="card-elevated p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground">Auction Init Price (LP)</label>
                    <input
                      value={auctionInitPrice}
                      onChange={(e) => setAuctionInitPrice(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">Auction Epoch (days)</label>
                    <input
                      value={auctionEpochPeriodDays}
                      onChange={(e) => setAuctionEpochPeriodDays(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground">Auction Price Multiplier</label>
                    <input
                      value={auctionPriceMultiplier}
                      onChange={(e) => setAuctionPriceMultiplier(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted-foreground">Auction Min Price (LP)</label>
                    <input
                      value={auctionMinInitPrice}
                      onChange={(e) => setAuctionMinInitPrice(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg bg-secondary px-3 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {launchError && <div className="text-[12px] text-red-300">{launchError}</div>}

            <button
              onClick={handleLaunch}
              disabled={isDisabled}
              className="w-full h-11 rounded-xl bg-white text-black text-[15px] font-semibold disabled:opacity-50"
            >
              {launchPending ? "Launching..." : "Launch Channel"}
            </button>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
