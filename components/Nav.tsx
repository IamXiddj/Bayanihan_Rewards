"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletRole } from "@/lib/wallet-role-context";

// Visible to everyone, citizen or organizer — the three pages a citizen
// is meant to use.
const CITIZEN_LINKS = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/rewards", label: "My Rewards" },
  { href: "/leaderboard", label: "Leaderboard" },
];

// Only shown once the connected wallet resolves to role === "organizer".
// /organizer itself is deliberately not gated at the page level — it's
// also how a brand-new wallet registers as an organizer in the first
// place, so hiding the link (rather than the page) is the right amount of
// restriction here. Analytics and the Wallet sandbox have no such
// self-service reason to stay reachable, so those two also get an
// in-page guard — see components/RequireOrganizer.tsx.
const ORGANIZER_LINKS = [
  { href: "/organizer", label: "Organizer" },
  { href: "/analytics", label: "Analytics" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-maroon text-paper-raised" : "text-slate hover:bg-paper hover:text-ink"
      )}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { role, loading } = useWalletRole();
  // Fail closed while the silent check is still running, same as the
  // role resolver itself — a citizen-only view briefly, never the reverse.
  const isOrganizer = !loading && role === "organizer";

  return (
    <nav className="w-full border-b border-line bg-paper-raised">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <Link href="/" className="font-display text-sm font-semibold tracking-tight">
          Bayanihan Rewards
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {CITIZEN_LINKS.map((link) => (
              <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
            ))}
          </div>

          {isOrganizer && (
            <>
              <span className="hidden h-4 w-px bg-line sm:block" />
              <div className="flex items-center gap-1">
                {ORGANIZER_LINKS.map((link) => (
                  <NavLink key={link.href} {...link} active={isActive(pathname, link.href)} />
                ))}
              </div>

              <span className="hidden h-4 w-px bg-line sm:block" />
              <Link
                href="/wallet"
                aria-label="Wallet sandbox"
                title="Wallet sandbox"
                className={cn(
                  "flex items-center justify-center rounded-lg p-1.5 transition-colors",
                  isActive(pathname, "/wallet")
                    ? "bg-maroon text-paper-raised"
                    : "text-slate hover:bg-paper hover:text-ink"
                )}
              >
                <Wallet className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
