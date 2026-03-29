"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="text-center px-6">
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mb-4">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="slab-button px-6 text-[11px]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
