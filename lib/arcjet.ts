import arcjet, {
  tokenBucket,
  detectPromptInjection,
  type ArcjetDecision,
} from "@arcjet/next";

export type { ArcjetDecision };

/**
 * Checks if the ARCJET_KEY environment variable is configured.
 */
export const isArcjetConfigured = Boolean(process.env.ARCJET_KEY);

/**
 * Route-level Arcjet client for AI generation and agent execution endpoints.
 * Follows Arcjet Next.js SDK best practices:
 * - Characteristics: "userId" ensures per-user rate limit isolation.
 * - Token bucket: 5 generations per 60 seconds burst protection.
 * - Prompt injection detection: Blocks jailbreak attempts before invoking AI models.
 * - Defensive initialization: Returns null when ARCJET_KEY is missing, preventing crashes.
 */
export const aj = isArcjetConfigured
  ? arcjet({
      key: process.env.ARCJET_KEY!,
      characteristics: ["userId"],
      rules: [
        // Rate limit: 5 tokens max burst, refill 5 every 60 seconds per user
        tokenBucket({
          mode: "LIVE",
          refillRate: 5,
          interval: 60,
          capacity: 5,
        }),

        // Prompt injection guard: Analyzes prompt for jailbreaks/overrides
        detectPromptInjection({
          mode: "LIVE",
        }),
      ],
    })
  : null;
