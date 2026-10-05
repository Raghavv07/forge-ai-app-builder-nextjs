"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/prisma";
import { GUEST_COOKIE_NAME } from "@/lib/auth-helper";
import { revalidatePath } from "next/cache";

export async function continueAsGuest(rawName?: string) {
  const trimmedName = (rawName ?? "").trim().slice(0, 40) || "Guest Builder";
  const guestUuid = crypto.randomUUID();
  const guestClerkId = `guest_${guestUuid.replace(/-/g, "")}`;
  const guestEmail = `${guestClerkId}@guest.forge`;
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
    trimmedName
  )}&backgroundColor=0d0d0d`;

  try {
    const user = await db.user.create({
      data: {
        clerkId: guestClerkId,
        name: trimmedName,
        email: guestEmail,
        imageUrl: avatarUrl,
        credits: 0,
        plan: "free",
      },
    });

    const cookieStore = await cookies();
    cookieStore.set(GUEST_COOKIE_NAME, guestClerkId, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    revalidatePath("/", "layout");

    return {
      success: true,
      user: {
        id: user.id,
        clerkId: user.clerkId,
        name: user.name,
        imageUrl: user.imageUrl,
      },
    };
  } catch (error) {
    console.error("Failed to create guest user:", error);
    throw new Error("Failed to initialize guest session. Please try again.");
  }
}

export async function exitGuestSession() {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE_NAME);
  revalidatePath("/", "layout");
  return { success: true };
}
