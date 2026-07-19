import { Megaphone, Users, Gift, CheckCircle2, Landmark, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RequireOrganizer } from "@/components/RequireOrganizer";

interface PlatformStats {
  total_campaigns: number;
  active_campaigns: number;
  total_participants: number;
  rewards_issued: number;
  bayani_issued: number;
  rewards_claimed: number;
  bayani_claimed: number;
  total_organizations: number;
}

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: stats, error } = await supabase
    .from("platform_stats")
    .select("*")
    .single<PlatformStats>();

  const cards = stats
    ? [
        {
          label: "Active campaigns",
          value: stats.active_campaigns,
          sub: `${stats.total_campaigns} total`,
          icon: Megaphone,
        },
        {
          label: "Organizations",
          value: stats.total_organizations,
          sub: "LGUs, schools, NGOs",
          icon: Landmark,
        },
        {
          label: "Participants",
          value: stats.total_participants,
          sub: "unique citizens",
          icon: Users,
        },
        {
          label: "BAYANI issued",
          value: stats.bayani_issued,
          sub: `${stats.rewards_issued} reward${stats.rewards_issued === 1 ? "" : "s"}`,
          icon: Gift,
        },
        {
          label: "BAYANI claimed",
          value: stats.bayani_claimed,
          sub: `${stats.rewards_claimed} of ${stats.rewards_issued} claimed`,
          icon: CheckCircle2,
        },
      ]
    : [];

  return (
    <RequireOrganizer>
      <main className="min-h-screen px-4 py-12 md:py-20">
        <header className="mx-auto max-w-2xl text-center mb-10">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-forest" />
            Stellar Testnet
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-2 text-sm text-slate">Platform-wide activity, computed straight from the ledger of record.</p>
        </header>

        <div className="woven-divider mx-auto max-w-2xl mb-10" />

        <div className="mx-auto max-w-2xl">
          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              Couldn&apos;t load analytics: {error.message}
            </p>
          )}

          {stats && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-line bg-paper-raised p-5">
                  <card.icon className="h-5 w-5 text-maroon mb-3" />
                  <p className="font-display text-3xl font-semibold">
                    {card.label === "BAYANI issued" || card.label === "BAYANI claimed" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="h-5 w-5 text-gold" />
                        {card.value}
                      </span>
                    ) : (
                      card.value
                    )}
                  </p>
                  <p className="mt-1 text-sm font-medium">{card.label}</p>
                  <p className="text-xs text-slate">{card.sub}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </RequireOrganizer>
  );
}
