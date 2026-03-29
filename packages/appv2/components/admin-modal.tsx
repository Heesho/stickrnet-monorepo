"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { X, Camera, Loader2 } from "lucide-react";
import { encodeFunctionData } from "viem";
import type { TokenMetadata } from "@/hooks/useMetadata";
import { useBatchedTransaction, type Call } from "@/hooks/useBatchedTransaction";
import { CONTENT_ABI } from "@/lib/contracts";

type AdminModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contentAddress: `0x${string}`;
  tokenSymbol?: string;
  tokenName?: string;
  initialTreasury: string;
  initialTeam: string;
  initialUri: string;
  initialIsModerated?: boolean;
  initialMetadata?: TokenMetadata;
  initialLogoUrl?: string;
  isPositiveTrend?: boolean;
  currentModerators?: { address: string }[];
};

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function AdminModal({
  isOpen,
  onClose,
  contentAddress,
  tokenSymbol = "TOKEN",
  tokenName = "Token",
  initialTreasury,
  initialTeam,
  initialUri,
  initialIsModerated = false,
  initialMetadata,
  initialLogoUrl,
  isPositiveTrend = true,
  currentModerators = [],
}: AdminModalProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [description, setDescription] = useState(initialMetadata?.description || "");
  const [defaultMessage, setDefaultMessage] = useState(initialMetadata?.defaultMessage || "");
  const existingLinks = initialMetadata?.links || [];
  const [showLinks, setShowLinks] = useState(existingLinks.length > 0);
  const [links, setLinks] = useState<string[]>(existingLinks.length > 0 ? existingLinks : [""]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [treasury, setTreasury] = useState(initialTreasury);
  const [team, setTeam] = useState(initialTeam);

  const [isModerated, setIsModerated] = useState(initialIsModerated);
  const [moderatorInput, setModeratorInput] = useState("");
  const [pendingApprovals, setPendingApprovals] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const { execute, status: txStatus, reset: resetTx } = useBatchedTransaction();
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [isUploadingMetadata, setIsUploadingMetadata] = useState(false);
  const [successField, setSuccessField] = useState<string | null>(null);

  const colorPositive = isPositiveTrend;

  useEffect(() => {
    if (txStatus === "success" && pendingField) {
      setSuccessField(pendingField);
      setPendingField(null);
      setTimeout(() => {
        setSuccessField(null);
        resetTx();
      }, 2000);
    } else if (txStatus === "error") {
      setPendingField(null);
      setSuccessField(null);
      resetTx();
    }
  }, [txStatus, pendingField, resetTx]);

  const isTreasuryValid = isValidAddress(treasury);
  const isTeamValid = team === "" || isValidAddress(team);
  const isNewOwnerValid = isValidAddress(newOwner);

  const trendButtonClass = colorPositive ? "slab-button" : "slab-button slab-button-loss";
  const trendButtonDisabledClass = colorPositive ? "slab-button opacity-50 cursor-not-allowed" : "slab-button slab-button-loss opacity-50 cursor-not-allowed";

  const metadataChanged =
    description !== (initialMetadata?.description || "") ||
    defaultMessage !== (initialMetadata?.defaultMessage || "") ||
    logoFile !== null ||
    JSON.stringify(links.filter(l => l.trim() !== "")) !== JSON.stringify(initialMetadata?.links || []);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSaveMetadata = async () => {
    if (!contentAddress) return;
    setPendingField("metadata");
    setIsUploadingMetadata(true);
    try {
      let imageIpfsUrl = initialMetadata?.image || "";
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        formData.append("tokenSymbol", tokenSymbol);
        const uploadRes = await fetch("/api/pinata/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("Failed to upload logo");
        const uploadData = await uploadRes.json();
        imageIpfsUrl = uploadData.ipfsUrl;
      }
      const metadataRes = await fetch("/api/pinata/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName, symbol: tokenSymbol, image: imageIpfsUrl,
          description, defaultMessage, links: links.filter((l) => l.trim() !== ""),
        }),
      });
      if (!metadataRes.ok) throw new Error("Failed to upload metadata");
      const metadataData = await metadataRes.json();
      setIsUploadingMetadata(false);
      const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setUri", args: [metadataData.ipfsUrl] });
      await execute([{ to: contentAddress, data, value: 0n }]);
    } catch {
      setIsUploadingMetadata(false);
      setPendingField(null);
    }
  };

  const [removingModerator, setRemovingModerator] = useState<string | null>(null);

  const handleRemoveModerator = async (address: string) => {
    if (!contentAddress) return;
    setRemovingModerator(address);
    setPendingField("removeModerator");
    const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setModerators", args: [[address as `0x${string}`], false] });
    try {
      await execute([{ to: contentAddress, data, value: 0n }]);
    } catch { setPendingField(null); }
    setRemovingModerator(null);
  };

  const handleSave = async (field: string) => {
    if (!contentAddress) return;
    setPendingField(field);
    let call: Call | null = null;
    switch (field) {
      case "treasury": {
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setTreasury", args: [treasury as `0x${string}`] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "team": {
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setTeam", args: [team as `0x${string}`] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "moderation": {
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setIsModerated", args: [!isModerated] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "addModerator": {
        if (!isValidAddress(moderatorInput)) return;
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setModerators", args: [[moderatorInput as `0x${string}`], true] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "removeModerator": {
        if (!isValidAddress(moderatorInput)) return;
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "setModerators", args: [[moderatorInput as `0x${string}`], false] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "approveContents": {
        const tokenIds = pendingApprovals.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => BigInt(s));
        if (tokenIds.length === 0) return;
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "approveContents", args: [tokenIds] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
      case "transferOwnership": {
        if (!isValidAddress(newOwner)) return;
        const data = encodeFunctionData({ abi: CONTENT_ABI, functionName: "transferOwnership", args: [newOwner as `0x${string}`] });
        call = { to: contentAddress, data, value: 0n };
        break;
      }
    }
    if (call) {
      try {
        await execute([call]);
        if (field === "moderation" && txStatus !== "error") setIsModerated(!isModerated);
      } catch { setPendingField(null); }
    }
  };

  if (!isOpen) return null;

  const isSaving = txStatus === "pending" || txStatus === "confirming" || isUploadingMetadata;
  const currentLogoUrl = logoPreview || initialLogoUrl;

  const addressInputClass = (valid: boolean, value: string) =>
    `flex-1 h-10 px-3 rounded-[var(--radius)] bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--foreground)/0.2)] text-sm font-mono min-w-0 ${
      (value || "").length > 0 && !valid ? "ring-1 ring-red-500/50 focus:ring-red-500" : ""
    }`;

  const saveBtnClass = (field: string, enabled: boolean) =>
    `h-10 px-4 rounded-[var(--radius)] text-[13px] font-semibold font-display transition-all flex-shrink-0 ${
      successField === field ? trendButtonClass + " opacity-70"
        : isSaving && pendingField === field ? trendButtonDisabledClass
        : enabled ? trendButtonClass
        : trendButtonDisabledClass
    }`;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden overscroll-none bg-[hsl(var(--background)/0.6)] backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`${colorPositive ? "signal-theme-positive glass-panel glass-panel-positive" : "signal-theme-negative glass-panel glass-panel-negative"} relative flex w-full max-w-[520px] flex-col h-full lg:h-auto lg:max-h-[80vh] lg:overflow-y-auto lg:rounded-[var(--radius)]`}
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <button onClick={onClose} className="border border-[hsl(var(--foreground)/0.1)] rounded-full -ml-2 p-2 transition-colors hover:bg-[hsl(var(--foreground)/0.08)]">
            <X className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold font-display">Admin</span>
          <div className="w-9" />
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pt-2">
          {/* Logo + Name */}
          <div className="flex items-start gap-3 mb-3">
            <button onClick={() => fileInputRef.current?.click()} className="relative w-[88px] h-[88px] rounded-[var(--radius)] bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0 hover:bg-secondary/80 transition-colors">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-foreground/50" />
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Camera className="w-4 h-4 text-white" />
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
            <div className="flex-1 min-w-0 pt-2">
              <div className="text-[16px] font-semibold font-display">{tokenName}</div>
              <div className="text-[13px] text-muted-foreground">${tokenSymbol}</div>
            </div>
          </div>

          {/* Description */}
          <span className="text-[12px] text-muted-foreground block mb-1 font-display">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your channel..." rows={2}
            className="w-full px-3 py-2.5 rounded-[var(--radius)] bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--foreground)/0.2)] resize-none text-sm" />
          <span className="text-[12px] text-muted-foreground block mt-2 mb-1 font-display">Default message</span>
          <input type="text" value={defaultMessage} onChange={(e) => setDefaultMessage(e.target.value)} placeholder="gm"
            className="w-full h-10 px-3 rounded-[var(--radius)] bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--foreground)/0.2)] text-sm" />

          {/* Links */}
          <div className="mt-2">
            <button type="button" onClick={() => setShowLinks(!showLinks)} className="flex items-center justify-between w-full py-2">
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-foreground font-display font-medium">Add links</span>
                <span className="text-[11px] text-muted-foreground">websites, socials</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative ${showLinks ? (colorPositive ? "bg-primary" : "bg-[hsl(var(--loss))]") : "bg-secondary"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${showLinks ? "left-[18px] bg-black" : "left-0.5 bg-foreground/50"}`} />
              </div>
            </button>
            {showLinks && (
              <div className="space-y-2 mt-2">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="url" value={link} onChange={(e) => { const updated = [...links]; updated[i] = e.target.value; setLinks(updated); }} placeholder="https://..."
                      className="flex-1 h-10 px-3 rounded-[var(--radius)] bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[hsl(var(--foreground)/0.2)] text-sm" />
                    <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="px-2 text-foreground/50 hover:text-foreground/70 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {links.length < 5 && (
                  <button type="button" onClick={() => setLinks([...links, ""])} className="text-[12px] text-foreground/50 hover:text-foreground/70 transition-colors">+ Add another</button>
                )}
              </div>
            )}
          </div>

          {/* Save Metadata */}
          <button onClick={handleSaveMetadata} disabled={isSaving || !metadataChanged}
            className={`w-full h-10 rounded-[var(--radius)] text-[14px] font-semibold font-display transition-all mt-4 ${
              successField === "metadata" ? trendButtonClass + " opacity-70"
                : isSaving && pendingField === "metadata" ? trendButtonDisabledClass
                : metadataChanged ? trendButtonClass : trendButtonDisabledClass
            }`}>
            {successField === "metadata" ? "Saved" : isSaving && pendingField === "metadata" ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />{isUploadingMetadata ? "Uploading..." : "Confirming..."}</span>
            ) : "Save Profile"}
          </button>

          {/* Contract Settings */}
          <div className="text-[13px] font-semibold font-display text-foreground mt-5 mb-3">Contract Settings</div>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-[12px] text-muted-foreground font-display">Treasury</span>
              <div className="flex gap-2">
                <input type="text" value={treasury} onChange={(e) => setTreasury(e.target.value)} placeholder="0x..." className={addressInputClass(isTreasuryValid, treasury)} />
                <button onClick={() => handleSave("treasury")} disabled={isSaving || !isTreasuryValid || treasury === initialTreasury} className={saveBtnClass("treasury", isTreasuryValid && treasury !== initialTreasury)}>
                  {successField === "treasury" ? "Saved" : isSaving && pendingField === "treasury" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[12px] text-muted-foreground font-display">Team</span>
              <div className="flex gap-2">
                <input type="text" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="0x..." className={addressInputClass(isTeamValid, team)} />
                <button onClick={() => handleSave("team")} disabled={isSaving || !isTeamValid || team === initialTeam} className={saveBtnClass("team", isTeamValid && team !== initialTeam)}>
                  {successField === "team" ? "Saved" : isSaving && pendingField === "team" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Moderation */}
          <div className="text-[13px] font-semibold font-display text-foreground mt-5 mb-3">Moderation</div>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground font-display">Content moderation</span>
                <button onClick={() => handleSave("moderation")} disabled={isSaving} className="flex items-center gap-2">
                  <div className={`w-9 h-5 rounded-full transition-colors relative ${isModerated ? (colorPositive ? "bg-primary" : "bg-[hsl(var(--loss))]") : "bg-secondary"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${isModerated ? "left-[18px] bg-black" : "left-0.5 bg-foreground/50"}`} />
                  </div>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{isModerated ? "New content requires approval" : "All content is automatically approved"}</p>
            </div>

            {isModerated && (
              <>
                {/* Current Moderators List */}
                {currentModerators.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[12px] text-muted-foreground font-display">Current moderators</span>
                    <div className="space-y-1.5">
                      {currentModerators.map((mod) => (
                        <div key={mod.address} className="flex items-center gap-2">
                          <div className="flex-1 h-9 px-3 rounded-[var(--radius)] bg-secondary text-foreground text-sm font-mono flex items-center truncate">
                            {mod.address.slice(0, 6)}...{mod.address.slice(-4)}
                          </div>
                          <button
                            onClick={() => handleRemoveModerator(mod.address)}
                            disabled={isSaving}
                            className={`h-9 px-3 rounded-[var(--radius)] text-[12px] font-semibold font-display transition-all flex-shrink-0 ${trendButtonClass}`}
                          >
                            {removingModerator === mod.address ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Moderator */}
                <div className="space-y-1">
                  <span className="text-[12px] text-muted-foreground font-display">Add moderator</span>
                  <div className="flex gap-2">
                    <input type="text" value={moderatorInput} onChange={(e) => setModeratorInput(e.target.value)} placeholder="0x..." className={addressInputClass(isValidAddress(moderatorInput), moderatorInput)} />
                    <button onClick={() => handleSave("addModerator")} disabled={isSaving || !isValidAddress(moderatorInput)} className={saveBtnClass("addModerator", isValidAddress(moderatorInput))}>
                      {successField === "addModerator" ? "Added" : isSaving && pendingField === "addModerator" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Transfer Ownership */}
          <div className="text-[13px] font-semibold font-display text-foreground mt-5 mb-3">Transfer Ownership</div>
          <div className="space-y-1">
            <span className="text-[12px] text-muted-foreground font-display">New owner address</span>
            <div className="flex gap-2">
              <input type="text" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x..." className={addressInputClass(isNewOwnerValid, newOwner)} />
              <button onClick={() => handleSave("transferOwnership")} disabled={isSaving || !isNewOwnerValid} className={saveBtnClass("transferOwnership", isNewOwnerValid)}>
                {successField === "transferOwnership" ? "Transferred" : isSaving && pendingField === "transferOwnership" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Transfer"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">This will transfer channel ownership. This action cannot be undone.</p>
          </div>

          <div className="pb-6" />
        </div>
      </motion.div>
    </div>
  );
}
