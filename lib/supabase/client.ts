import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Uses the anon key — every query
 * through this client is subject to the RLS policies in
 * supabase/migrations/0001_init.sql.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
