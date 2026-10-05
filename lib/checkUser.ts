import { currentUser } from "@clerk/nextjs/server";
import { db } from "./prisma";
import { PLANS } from "./constants";

export const checkUser = async () => {
  const user = await currentUser();
  if (!user) return null;

  try {
    const existing = await db.user.findUnique({
      where: { clerkId: user.id },
    });

    if (existing) {
      return existing;
    }

    const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    const fallbackName = fullName || user.username || "Builder";

    // New user — create record in database
    return await db.user.create({
      data: {
        clerkId: user.id,
        name: fallbackName,
        email: user.emailAddresses[0]?.emailAddress ?? "",
        imageUrl: user.imageUrl ?? "",
        credits: PLANS.free.credits,
        plan: "free",
      },
    });
  } catch (error) {
    console.error("checkUser error:", error);
    return null;
  }
};

