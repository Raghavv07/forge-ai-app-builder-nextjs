import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { db } from "@/lib/prisma";
import { checkUser } from "@/lib/checkUser";

export const GUEST_COOKIE_NAME = "forge_guest_session";

export interface CurrentAuthUser {
  id: string;
  clerkId: string;
  name: string;
  email: string;
  imageUrl: string;
  isGuest: boolean;
}

/**
 * Returns the currently authenticated user (either through Clerk or via Guest session).
 * If a Clerk user is logged in, ensures they are provisioned in the database.
 * If not logged in with Clerk, checks for a valid Guest session cookie.
 */
export async function getCurrentAuthUser(): Promise<CurrentAuthUser | null> {
  // 1. Check Clerk session first
  const { userId: clerkId } = await auth();

  if (clerkId) {
    let user = await db.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        clerkId: true,
        name: true,
        email: true,
        imageUrl: true,
      },
    });

    if (!user) {
      const created = await checkUser();
      if (created) {
        user = {
          id: created.id,
          clerkId: created.clerkId,
          name: created.name,
          email: created.email,
          imageUrl: created.imageUrl,
        };
      }
    }

    if (user) {
      return {
        id: user.id,
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
        isGuest: false,
      };
    }
  }

  // 2. Check for Guest session cookie
  const cookieStore = await cookies();
  const guestClerkId = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (guestClerkId) {
    const guestUser = await db.user.findUnique({
      where: { clerkId: guestClerkId },
      select: {
        id: true,
        clerkId: true,
        name: true,
        email: true,
        imageUrl: true,
      },
    });

    if (guestUser) {
      return {
        id: guestUser.id,
        clerkId: guestUser.clerkId,
        name: guestUser.name,
        email: guestUser.email,
        imageUrl: guestUser.imageUrl,
        isGuest: true,
      };
    }
  }

  return null;
}
