import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records a campaign in Supabase after create_campaign has already
 * succeeded on-chain (see components/CreateCampaignForm.tsx, which calls
 * the contract directly via Freighter and passes the returned on-chain id
 * here). reward_amount is stored in human-facing BAYANI units — the raw,
 * decimal-scaled amount only exists at the point of the actual contract
 * call; see lib/soroban.ts's toRawBayaniAmount.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const organizationId: string | undefined = body?.organizationId;
  const title: string | undefined = body?.title;
  const description: string | undefined = body?.description;
  const rewardAmount: number | undefined = body?.rewardAmount;
  const maxParticipants: number | undefined = body?.maxParticipants;
  const onChainId: number | undefined = body?.onChainId;

  if (!organizationId || !title || rewardAmount === undefined || onChainId === undefined) {
    return NextResponse.json(
      { error: "organizationId, title, rewardAmount, and onChainId are all required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organizationId,
      title,
      description: description ?? null,
      reward_amount: rewardAmount,
      reward_asset: "BAYANI",
      max_participants: maxParticipants ?? 0,
      status: "active",
      on_chain_id: onChainId,
    })
    .select("id, on_chain_id, title")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaign });
}
