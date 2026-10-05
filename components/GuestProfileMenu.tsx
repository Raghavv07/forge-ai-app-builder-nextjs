"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exitGuestSession } from "@/actions/guest";
import { SignInButton } from "@clerk/nextjs";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GuestProfileMenuProps {
  name: string;
  imageUrl: string;
}

export function GuestProfileMenu({ name, imageUrl }: GuestProfileMenuProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleExit = async () => {
    setIsLoggingOut(true);
    try {
      await exitGuestSession();
      toast.info("Guest session ended.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Failed to exit guest session.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Guest Badge */}
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1.5 pr-3 shadow-sm backdrop-blur-md">
        <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`}
            alt={name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="max-w-[100px] truncate text-xs font-medium text-white/80">
            {name}
          </span>
          <span className="rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-blue-400">
            GUEST
          </span>
        </div>
      </div>

      {/* Switch to Permanent Account */}
      <SignInButton mode="modal">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 cursor-pointer text-xs font-medium text-white/40 hover:bg-white/5 hover:text-white/80"
        >
          Sign in
        </Button>
      </SignInButton>

      {/* Exit Guest Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={handleExit}
        disabled={isLoggingOut}
        title="Exit Guest Session"
        className="h-7 w-7 cursor-pointer rounded-full text-white/30 hover:bg-red-500/10 hover:text-red-400"
      >
        {isLoggingOut ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogOut className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
