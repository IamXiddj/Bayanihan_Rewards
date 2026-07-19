import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components and Route Handlers. Reads the
 * current request's cookies to restore the caller's session, so it's still
 * subject to RLS the same as the browser client — this is not a privilege
 * escalation, just the server-side half of the same session.
 *
 * Must be created fresh per request (never module-level/shared), per
 * Supabase's own guidance.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Writing cookies from a Server Component (rather than a Route
            // Handler or Server Action) isn't supported — safe to ignore
            // here as long as middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
