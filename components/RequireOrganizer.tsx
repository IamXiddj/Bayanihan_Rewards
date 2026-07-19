"use client";

// components/RequireOrganizer.tsx
//
// Gates a page's content behind role === "organizer" from
// lib/wallet-role-context. Used on /analytics and /wallet — pages with
// no self-service reason to stay open to a citizen wallet, unlike
// /organizer itself (see the comment on ORGANIZER_LINKS in Nav.tsx for why
// that one is intentionally left ungated).
//
// Worth being direct about what this is and isn't: there's no
// Freighter-session-backed Supabase Auth in this app yet (same
// simplification noted throughout the API routes), so this is a
// client-side UI gate, not a real security boundary — any server-rendered
// data on a wrapped page still reached the browser before this check
// runs. It stops a citizen from casually landing here through the nav or
// a bookmark; it doesn't stand in for row-level security on data that
// actually needs to stay private.

import Link from "next/link";
import { Lock, Loader2 } from "lucide-react";
import { useWalletRole } from "@/lib/wallet-role-context";

export function RequireOrganizer({ children }: { children: React.ReactNode }) {
  const { role, loading } = useWalletRole();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="flex items-center gap-2 text-sm text-slate">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </p>
      </main>
    );
  }

  if (role !== "organizer") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-maroon/10">
          <Lock className="h-6 w-6 text-maroon" />
        </div>
        <h1 className="font-display text-xl font-medium mb-2">Organizer &amp; admin access only</h1>
        <p className="text-sm text-slate max-w-sm mb-5">
          This page is limited to registered organizations. Head back to Campaigns to join a
          civic reward campaign as a citizen, or register your organization from the Organizer
          page to unlock this.
        </p>
        <div className="flex gap-2">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1.5 rounded-xl bg-maroon px-4 py-2.5 text-sm font-semibold text-paper-raised hover:bg-maroon-dark"
          >
            Go to Campaigns
          </Link>
          <Link
            href="/organizer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Register as organizer
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
