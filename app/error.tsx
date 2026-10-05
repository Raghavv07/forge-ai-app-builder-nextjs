"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js ErrorBoundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
        <AlertCircle className="h-6 w-6 text-red-400" />
      </div>

      <h1 className="font-serif text-2xl font-semibold tracking-tight text-white/90">
        Something went wrong
      </h1>

      <p className="mt-2 max-w-md text-sm text-white/40">
        {error.message ||
          "An unexpected error occurred. You can retry the action or return to the homepage."}
      </p>

      {error.digest && (
        <span className="mt-2 font-mono text-[10px] text-white/20">
          Digest: {error.digest}
        </span>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={reset}
          className="gap-2 cursor-pointer bg-white text-black hover:bg-white/90"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </Button>

        <Link href="/">
          <Button
            variant="outline"
            className="cursor-pointer border-white/10 text-white/70 hover:bg-white/5"
          >
            Go home
          </Button>
        </Link>
      </div>
    </div>
  );
}
