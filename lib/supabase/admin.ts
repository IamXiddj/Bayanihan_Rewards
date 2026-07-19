import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses every RLS policy — use only in
 * Route Handlers / Server Actions, for operations that legitimately need to
 * act outside the current user's own permissions (e.g. recording a
 * blockchain transaction's result after independently verifying it against
 * the chain).
 *
 * NEVER import this into a Client Component. The service role key must
 * never reach the browser.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
