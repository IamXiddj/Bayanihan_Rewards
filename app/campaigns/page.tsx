import { Users, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JoinCampaignButton } from "@/components/JoinCampaignButton";

interface CampaignRow {
  id: string;
  on_chain_id: number | null;
  title: string;
  description: string | null;
  reward_amount: number;
  reward_asset: string;
  max_participants: number | null;
  status: string;
  organization: { id: string; name: string; type: string; logo_url: string | null } | null;
}

export default async function CampaignsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      on_chain_id,
      title,
      description,
      reward_amount,
      reward_asset,
      max_participants,
      status,
      organization:organizations ( id, name, type, logo_url )
    `
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .returns<CampaignRow[]>();

  const campaigns = data ?? [];

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto max-w-2xl text-center mb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Active Campaigns</h1>
        <p className="mt-2 text-sm text-slate">
          Join a campaign, get verified by the organizer, and claim your BAYANI.
        </p>
      </header>

      <div className="woven-divider mx-auto max-w-2xl mb-10" />

      <div className="mx-auto max-w-2xl space-y-4">
        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            Couldn&apos;t load campaigns: {error.message}
          </p>
        )}

        {!error && campaigns.length === 0 && (
          <p className="rounded-xl border border-line bg-paper-raised px-4 py-6 text-center text-sm text-slate">
            No active campaigns yet.
          </p>
        )}

        {campaigns.map((campaign) => (
          <article
            key={campaign.id}
            className="rounded-2xl border border-line bg-paper-raised p-5 md:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                {campaign.organization && (
                  <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate">
                    {campaign.organization.name}
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">
                      {campaign.organization.type.toUpperCase()}
                    </span>
                  </p>
                )}
                <h2 className="font-display text-lg font-medium">{campaign.title}</h2>
                {campaign.description && (
                  <p className="mt-1 text-sm text-slate">{campaign.description}</p>
                )}
              </div>
              <div className="shrink-0 rounded-xl bg-maroon/10 px-3 py-2 text-center">
                <p className="flex items-center gap-1 text-lg font-semibold text-maroon">
                  <Sparkles className="h-4 w-4" />
                  {campaign.reward_amount}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-maroon/70">
                  {campaign.reward_asset}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs text-slate">
                <Users className="h-3.5 w-3.5" />
                {campaign.max_participants && campaign.max_participants > 0
                  ? `Capped at ${campaign.max_participants} participants`
                  : "Open to everyone"}
              </p>
              {campaign.on_chain_id !== null ? (
                <JoinCampaignButton campaignId={campaign.id} onChainCampaignId={campaign.on_chain_id} />
              ) : (
                <span className="text-xs text-slate">Not yet on-chain</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
