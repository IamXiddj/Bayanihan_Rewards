import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records a participation row after the citizen has already joined the
 * campaign on-chain (this endpoint doesn't touch the contract itself — see
 * components/JoinCampaignButton.tsx, which calls the contract directly via
 * Freighter, then calls this route with the result).
 *
 * Uses the admin client rather than RLS: there's no Freighter-session-backed
 * Supabase Auth yet (still queued — see lib/supabase/server.ts's own
 * comments), so wallet ownership here is only as strong as "this wallet
 * address was passed in the request body," not cryptographically verified.
 * Fine for a testnet demo; worth tightening before this is a real product.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const campaignId: string | undefined = body?.campaignId;
  const walletAddress: string | undefined = body?.walletAddress;
  const txHash: string | undefined = body?.txHash;

  if (!campaignId || !walletAddress || !txHash) {
    return NextResponse.json(
      { error: "campaignId, walletAddress, and txHash are all required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({ wallet_address: walletAddress }, { onConflict: "wallet_address" })
    .select("id")
    .single();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Could not resolve a user for this wallet." },
      { status: 500 }
    );
  }

  const { error: participationError } = await supabase.from("participations").insert({
    campaign_id: campaignId,
    user_id: user.id,
  });

  if (participationError) {
    // Unique violation (campaign_id, user_id) means they already joined —
    // the on-chain call would have failed with AlreadyJoined before this
    // route was ever reached in that case, but treat it as success here
    // too rather than surfacing a confusing 500.
    if (participationError.code === "23505") {
      return NextResponse.json({ ok: true, alreadyJoined: true });
    }
    return NextResponse.json({ error: participationError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, txHash });
}
