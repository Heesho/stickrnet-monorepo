"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, AlertCircle, ImagePlus, Plus } from "lucide-react";
import { encodeFunctionData } from "viem";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useBatchedTransaction, type Call } from "@/hooks/useBatchedTransaction";
import { CONTENT_ABI } from "@/lib/contracts";
import { TokenLogo } from "@/components/token-logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "media" | "text";

type CreateContentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contentAddress: `0x${string}`;
  isModerated?: boolean;
  onSuccess?: () => void;
  tokenSymbol?: string;
  logoUrl?: string | null;
  isPositiveTrend?: boolean;
};

const TITLE_MAX = 150;
const BODY_MAX = 500;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateContentModal({
  isOpen,
  onClose,
  contentAddress,
  isModerated = false,
  onSuccess,
  tokenSymbol = "",
  logoUrl,
  isPositiveTrend = true,
}: CreateContentModalProps) {
  const [tab, setTab] = useState<Tab>("media");

  // Media tab state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  // Text tab state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { address: account } = useFarcaster();
  const { execute, status, txHash, error: txError, reset } = useBatchedTransaction();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTab("media");
      setMediaFile(null);
      setMediaPreview(null);
      setCaption("");
      setTitle("");
      setBody("");
      setUploading(false);
      setUploadError(null);
      reset();
    }
  }, [isOpen, reset]);

  // Auto-reset on tx error
  useEffect(() => {
    if (status !== "error") return;
    const isRejection =
      txError?.message?.includes("User rejected") ||
      txError?.message?.includes("User denied");
    const timer = setTimeout(() => reset(), isRejection ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [status, txError, reset]);

  // Handle file selection
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setMediaFile(file);
      setUploadError(null);
      const url = URL.createObjectURL(file);
      setMediaPreview(url);
    },
    [],
  );

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // Upload media file to IPFS
  const uploadMedia = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/pinata/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.ipfsUrl;
  };

  // Upload metadata JSON to IPFS
  const uploadMetadata = async (
    metadata: Record<string, unknown>,
  ): Promise<string> => {
    const res = await fetch("/api/pinata/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Metadata upload failed");
    return data.ipfsUrl;
  };

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!account || status === "pending" || uploading) return;

    try {
      setUploading(true);
      setUploadError(null);

      let contentUri: string;

      if (tab === "media") {
        if (!mediaFile) return;
        const imageUri = await uploadMedia(mediaFile);
        contentUri = await uploadMetadata({
          name: caption.trim() || "Sticker",
          symbol: tokenSymbol || "STICKER",
          image: imageUri,
          description: caption.trim(),
        });
      } else {
        if (!title.trim()) return;
        contentUri = await uploadMetadata({
          name: title.trim(),
          symbol: tokenSymbol || "STICKER",
          description: body.trim(),
        });
      }

      setUploading(false);

      const data = encodeFunctionData({
        abi: CONTENT_ABI,
        functionName: "create",
        args: [account, contentUri],
      });

      const calls: Call[] = [{ to: contentAddress, data, value: 0n }];
      await execute(calls);
    } catch (err) {
      setUploading(false);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }, [
    account,
    tab,
    mediaFile,
    caption,
    title,
    body,
    tokenSymbol,
    contentAddress,
    execute,
    status,
    uploading,
  ]);

  // Notify parent on success
  useEffect(() => {
    if (status === "success") onSuccess?.();
  }, [status, onSuccess]);


  if (!isOpen) return null;

  const isPending = status === "pending" || uploading;
  const isSuccess = status === "success";
  const canSubmit =
    !!account &&
    !isPending &&
    !isSuccess &&
    (tab === "media" ? !!mediaFile : title.trim().length > 0);

  const errorMsg =
    uploadError ||
    (txError
      ? (() => {
          const msg = txError?.message || "";
          if (
            msg.includes("rejected") ||
            msg.includes("denied") ||
            msg.includes("cancelled")
          )
            return "Transaction cancelled";
          return "Something went wrong";
        })()
      : null);
  const trendButtonClass = isPositiveTrend ? "slab-button" : "slab-button slab-button-loss";
  const accentButtonClass = isPositiveTrend
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : "bg-[hsl(var(--loss))] text-black hover:bg-[hsl(var(--loss))]/90";
  const accentDisabledClass = isPositiveTrend
    ? "bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
    : "bg-[hsl(var(--loss))] text-black opacity-50 cursor-not-allowed";

  // Success screen
  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[220] flex h-screen w-screen items-center justify-center bg-[hsl(var(--background)/0.6)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div
          className="relative flex h-full w-full max-w-[520px] flex-col bg-background items-center justify-center px-6 py-12 lg:h-auto lg:max-h-[85vh] lg:rounded-[var(--radius)] lg:glass-panel"
        >
          <div className="text-center space-y-6 max-w-xs">
            {mediaPreview && (
              <div className="flex justify-center">
                <img
                  src={mediaPreview}
                  alt={caption || "Sticker"}
                  className="w-24 h-24 rounded-[var(--radius)] object-cover ring-2 ring-[hsl(var(--surface-container-high))]"
                />
              </div>
            )}

            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2 font-display">
                Sticker Added!
              </h2>
              <p className="text-foreground/60 text-[15px]">
                {caption?.trim() || title?.trim() || "Your sticker"} is now live
                {isModerated ? " (pending approval)" : ""}
              </p>
            </div>

            <div className="space-y-3 pt-2 w-full">
              <button
                onClick={onClose}
                className={`${trendButtonClass} block w-full py-3.5 px-4 font-semibold font-display text-[15px] rounded-[var(--radius)] transition-colors`}
              >
                Done
              </button>
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3.5 px-4 bg-[hsl(var(--surface-container-high))] text-foreground font-semibold font-display text-[15px] rounded-[var(--radius)] hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
                >
                  View on Basescan
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[220] flex h-screen w-screen items-center justify-center bg-[hsl(var(--background)/0.6)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="relative flex h-full w-full max-w-[520px] flex-col bg-[hsl(var(--surface-container))] lg:h-auto lg:max-h-[85vh] lg:rounded-[var(--radius)] lg:glass-panel"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-[var(--radius)] hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold font-display">Add Sticker</span>
          <div className="w-9" />
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col px-4 min-h-0 overflow-y-auto scrollbar-hide">
            <>
              {/* Upload Area */}
              {!mediaPreview ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center py-12 bg-secondary rounded-[var(--radius)] mb-4 hover:bg-[hsl(var(--foreground)/0.08)] transition-colors"
                >
                  <ImagePlus className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-[13px] text-muted-foreground">
                    Upload image, video or gif
                  </span>
                </button>
              ) : (
                <div className="relative mb-4 rounded-[var(--radius)] overflow-hidden">
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full object-contain"
                  />
                  <button
                    onClick={() => {
                      setMediaFile(null);
                      setMediaPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-[var(--radius)] hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.gif"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Caption */}
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Caption"
                className="w-full h-12 px-4 rounded-[var(--radius)] bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--surface-container-high))] text-sm"
              />
            </>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Moderation Warning */}
          {isModerated && (
            <div className="px-3 py-2 rounded-[var(--radius)] bg-[hsl(var(--surface-container-high))] border border-border flex items-start gap-2 mb-3 mt-4">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[12px] font-medium text-foreground block">
                  You&apos;re adding a Sticker to a moderated board
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Moderators will check and approve your Sticker. If it&apos;s
                  not approved, you&apos;ll get notified.
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="px-3 py-2 rounded-[var(--radius)] bg-[hsl(var(--surface-container-high))] border border-border flex items-start gap-2 mb-3 mt-2">
              <AlertCircle className="w-4 h-4 text-foreground/60 mt-0.5 flex-shrink-0" />
              <span className="text-[12px] text-foreground/60">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div
          className="px-4 pb-4"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
          }}
        >
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`w-full h-10 rounded-[var(--radius)] font-semibold font-display text-[14px] transition-all flex items-center justify-center gap-2 ${
              !canSubmit
                ? accentDisabledClass
                : accentButtonClass
            }`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? (
              uploading ? (
                "Uploading..."
              ) : (
                "Submitting..."
              )
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Sticker
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
