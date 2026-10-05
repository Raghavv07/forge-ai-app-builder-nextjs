import Link from "next/link";
import { UserButton, SignInButton } from "@clerk/nextjs";
import Image from "next/image";
import { ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAuthUser } from "@/lib/auth-helper";
import { GuestModal } from "@/components/GuestModal";
import { GuestProfileMenu } from "@/components/GuestProfileMenu";

export default async function Header() {
  const authUser = await getCurrentAuthUser();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/6 bg-white/7 backdrop-blur-md">
      <nav className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 select-none">
          <Image
            src="/logo.png"
            alt="Forge"
            width={100}
            height={100}
            priority
            className="h-9 w-auto rounded-md"
          />
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {authUser ? (
            <>
              <Link
                href="/projects"
                className="text-[13px] font-medium text-white/40 transition-colors hover:text-white/80"
              >
                Projects
              </Link>

              {authUser.isGuest ? (
                <GuestProfileMenu
                  name={authUser.name}
                  imageUrl={authUser.imageUrl}
                />
              ) : (
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox:
                        "h-8 w-8 ring-1 ring-white/10 hover:ring-white/30 transition-all",
                    },
                  }}
                />
              )}
            </>
          ) : (
            <>
              <GuestModal>
                <Button
                  variant="ghost"
                  size="sm"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/4 px-3 text-[12px] font-medium text-white/70 hover:border-white/20 hover:bg-white/8 hover:text-white transition-all cursor-pointer"
                >
                  <User className="h-3.5 w-3.5 text-blue-400" />
                  Guest Mode
                </Button>
              </GuestModal>

              <SignInButton mode="modal" fallbackRedirectUrl="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[13px] font-medium text-white/50 hover:text-white/90 hover:bg-transparent cursor-pointer"
                >
                  Sign in
                </Button>
              </SignInButton>

              <SignInButton mode="modal" fallbackRedirectUrl="/">
                <Button
                  size="sm"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black hover:bg-white/90 active:scale-95 cursor-pointer"
                >
                  Get Started
                  <ArrowRight className="h-3 w-3 opacity-60" />
                </Button>
              </SignInButton>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
