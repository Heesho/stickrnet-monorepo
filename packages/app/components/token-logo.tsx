"use client";

import { useState } from "react";

const sizeClasses = {
  xs: { container: "w-4 h-4 text-[8px]", img: "w-4 h-4" },
  sm: { container: "w-5 h-5 text-[10px]", img: "w-5 h-5" },
  md: { container: "w-7 h-7 text-xs", img: "w-7 h-7" },
  "md-lg": { container: "w-12 h-12 text-base", img: "w-12 h-12" },
  lg: { container: "w-12 h-12 text-base", img: "w-12 h-12" },
} as const;

export type TokenLogoSize = keyof typeof sizeClasses;

type TokenLogoProps = {
  name: string;
  logoUrl?: string | null;
  size?: TokenLogoSize;
  /** "square" for standard display, "circle" for inline currency usage */
  variant?: "square" | "circle";
};

export function TokenLogo({
  name,
  logoUrl,
  size = "md-lg",
  variant = "square",
}: TokenLogoProps) {
  const [imgError, setImgError] = useState(false);
  const classes = sizeClasses[size];
  const rounding = variant === "circle" ? "rounded-full" : "rounded-none";

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`${classes.img} ${rounding} object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${classes.container} ${rounding} flex items-center justify-center font-semibold bg-zinc-800 text-foreground/60`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
