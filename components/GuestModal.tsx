"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { continueAsGuest } from "@/actions/guest";
import { User, Sparkles, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface GuestModalProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialPrompt?: string;
  redirectTo?: string;
}

export function GuestModal({
  children,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  initialPrompt,
  redirectTo,
}: GuestModalProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const previewSeed = name.trim() || "Guest Builder";
  const previewAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
    previewSeed
  )}&backgroundColor=0d0d0d`;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    try {
      const res = await continueAsGuest(name);
      if (res?.success) {
        toast.success(`Welcome, ${res.user.name}! Guest session started.`);
        setIsOpen(false);
        setName("");

        if (initialPrompt) {
          router.push(`/workspace?prompt=${encodeURIComponent(initialPrompt)}`);
        } else if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.push("/workspace");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to continue as guest. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger render={children as React.ReactElement} />}

      <DialogContent className="border border-white/10 bg-[#0d0d0d] p-6 text-white shadow-2xl backdrop-blur-xl sm:max-w-md">
        <DialogHeader className="gap-2 text-center items-center">
          <div className="relative mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewAvatar}
              alt="Guest Avatar"
              className="h-12 w-12 object-contain transition-transform duration-200 hover:scale-105"
            />
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-blue-500/20 text-blue-400">
              <Sparkles className="h-3 w-3" />
            </div>
          </div>

          <DialogTitle className="text-xl font-semibold tracking-tight text-white/95">
            Continue as Guest
          </DialogTitle>
          <DialogDescription className="text-xs text-white/40">
            No account or sign up needed. Enter your name to start building and
            generating React apps instantly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="guest-name"
              className="text-xs font-medium text-white/60"
            >
              Your Name or Nickname
            </label>
            <div className="relative flex items-center">
              <User className="pointer-events-none absolute left-3.5 h-4 w-4 text-white/30" />
              <input
                id="guest-name"
                type="text"
                autoFocus
                maxLength={40}
                placeholder="e.g. Alex, Maya, or Builder"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3.5 text-sm text-white placeholder:text-white/25 transition-all duration-200 focus:border-blue-500/50 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/6 bg-white/2 p-3 text-[11px] text-white/35">
            💡 <strong className="text-white/60">Guest Mode:</strong> You get
            full unlimited access to AI app generation, live sandbox preview,
            and export. You can always sign in with Clerk later to preserve your
            apps permanently.
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="group relative h-10 w-full cursor-pointer rounded-xl bg-white text-sm font-semibold text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.99] disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-black" />
                Setting up Guest Session…
              </>
            ) : (
              <>
                Start Building Now
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
