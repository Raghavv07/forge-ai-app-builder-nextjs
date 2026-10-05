import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BlueTitle } from "@/components/reusables";
import { ArrowLeft, Compass } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-[#0a0a0a] px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/4">
        <Compass className="h-7 w-7 text-blue-400/80" />
      </div>

      <div className="mb-2">
        <BlueTitle className="text-7xl font-bold">404</BlueTitle>
      </div>

      <h1 className="font-serif text-2xl font-medium tracking-tight text-white/90">
        Page Not Found
      </h1>

      <p className="mt-2 max-w-sm text-sm text-white/35">
        We couldn&apos;t find the page or workspace you requested. It might have
        been deleted or moved.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <Link href="/">
          <Button className="gap-2 cursor-pointer bg-white text-black hover:bg-white/90">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Forge
          </Button>
        </Link>
      </div>
    </div>
  );
}
