// lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Prisma,
  type User,
  type Workspace,
} from "./generated/prisma/client";

// Re-export common Prisma types for centralized usage throughout the app
export { Prisma, PrismaClient, type User, type Workspace };

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Creates and configures the singleton PrismaClient instance.
 * Follows Prisma ORM & Supabase best practices for Next.js App Router:
 * - Uses Supavisor transaction pooler on port 6543 (DATABASE_URL) for serverless queries.
 * - Driver adapter connection pool tuning with timeouts.
 * - Development and production logging tiers.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString && process.env.NODE_ENV === "development") {
    console.warn(
      "[Prisma ORM] Neither DATABASE_URL nor DIRECT_URL is set in environment variables."
    );
  }

  const adapter = new PrismaPg({
    connectionString: connectionString ?? "",
    connectionTimeoutMillis: 10_000,
    max: 10,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Ensure single Prisma instance across Hot Module Replacement (HMR) in development
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
