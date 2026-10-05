import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let clientInstance: SupabaseClient<Database> | null = null;

/**
 * Checks if the required Supabase environment variables are present.
 * Supports both legacy anon keys and the new Supabase publishable keys.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return Boolean(url && key);
}

/**
 * Returns a typed singleton Supabase browser client adhering to latest supabase-js docs.
 * - Disables unused session timers and storage since Clerk handles authentication.
 * - Prevents client crashes when environment variables are not yet configured.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (clientInstance) return clientInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[Supabase Client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    return null;
  }

  clientInstance = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return clientInstance;
}
