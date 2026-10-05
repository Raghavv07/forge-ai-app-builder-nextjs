import arcjet, { detectBot, shield } from "@arcjet/next";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/workspace(.*)",
  "/projects(.*)",
]);

// ─── Global Arcjet Client (Next.js 16 Proxy) ──────────────────────────────────
// Evaluates network-level security on every incoming request.
// Allows search engines and social preview bots for SEO & link unfurling.
// Initializes safely if ARCJET_KEY is not yet set in environment.
const aj = process.env.ARCJET_KEY
  ? arcjet({
      key: process.env.ARCJET_KEY,
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "LIVE",
          allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
        }),
      ],
    })
  : null;

const proxyHandler = clerkMiddleware(async (auth, req) => {
  // Arcjet network security evaluation
  if (aj) {
    const decision = await aj.protect(req);
    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return NextResponse.json(
          { error: "Too Many Requests", reason: "Rate limit exceeded" },
          { status: 429 }
        );
      }
      if (decision.reason.isBot()) {
        return NextResponse.json(
          { error: "Forbidden", reason: "Automated client blocked" },
          { status: 403 }
        );
      }
      if (decision.reason.isShield()) {
        return NextResponse.json(
          { error: "Forbidden", reason: "Suspicious request pattern detected" },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Auth guard — allow access if Clerk authenticated OR guest session cookie is present
  if (isProtectedRoute(req)) {
    const hasGuestCookie = Boolean(
      req.cookies.get("forge_guest_session")?.value
    );
    if (!hasGuestCookie) {
      await auth.protect();
    }
  }

  return NextResponse.next();
});

export const proxy = proxyHandler;
export default proxyHandler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
