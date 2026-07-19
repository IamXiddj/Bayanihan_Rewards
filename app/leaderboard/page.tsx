import { Trophy, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

interface LeaderboardRow {
  user_id: string;
  wallet_address: string;
  full_name: string | null;
  rewards_claimed: number;
  total_bayani: number;
}

function truncate(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
}

const RANK_STYLES = [
  "bg-gold/15 text-gold border-gold/30",
  "bg-slate/15 text-slate border-slate/30",
  "bg-maroon/15 text-maroon border-maroon/30",
];

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("total_bayani", { ascending: false })
    .limit(20)
    .returns<LeaderboardRow[]>();

  const rows = data ?? [];

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto max-w-2xl text-center mb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-sm text-slate">
          Citizens ranked by BAYANI claimed across every campaign — public, the same way any
          on-chain activity is.
        </p>
      </header>

      <div className="woven-divider mx-auto max-w-2xl mb-10" />

      <div className="mx-auto max-w-2xl space-y-2">
        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            Couldn&apos;t load the leaderboard: {error.message}
          </p>
        )}

        {!error && rows.length === 0 && (
          <p className="rounded-xl border border-line bg-paper-raised px-4 py-6 text-center text-sm text-slate">
            No claimed rewards yet — this fills in as citizens complete campaigns.
          </p>
        )}

        {rows.map((row, i) => (
          <div
            key={row.user_id}
            className="flex items-center justify-between rounded-xl border border-line bg-paper-raised px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                  RANK_STYLES[i] ?? "border-line bg-paper text-slate"
                }`}
              >
                {i < 3 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div>
                <p className="font-medium">{row.full_name || "Anonymous citizen"}</p>
                <p className="font-mono text-xs text-slate">{truncate(row.wallet_address)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1 font-semibold text-maroon">
                <Sparkles className="h-3.5 w-3.5" />
                {row.total_bayani}
              </p>
              <p className="text-xs text-slate">
                {row.rewards_claimed} reward{row.rewards_claimed === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
