import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records that a participation has been verified and rewarded, after both
 * the contract's verify_participant and issue_reward calls have already
 * succeeded on-chain (see components/VerifyAndIssueButton.tsx). The
 * original spec lists a single "verify" endpoint rather than a separate
 * "issue" one — this collapses both into one recorded step, matching that,
 * since an organizer doing one without the other isn't a real scenario.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const participationId: string | undefined = body?.participationId;
  const campaignId: string | undefined = body?.campaignId;
  const userId: string | undefined = body?.userId;
  const rewardAmount: number | undefined = body?.rewardAmount;
  const txHashIssue: string | undefined = body?.txHashIssue;

  if (!participationId || !campaignId || !userId || rewardAmount === undefined) {
    return NextResponse.json(
      { error: "participationId, campaignId, userId, and rewardAmount are all required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { error: participationError } = await supabase
    .from("participations")
    .update({ verified: true, rewarded: true, verified_at: new Date().toISOString() })
    .eq("id", participationId);

  if (participationError) {
    return NextResponse.json({ error: participationError.message }, { status: 500 });
  }

  const { error: rewardError } = await supabase.from("rewards").upsert(
    {
      campaign_id: campaignId,
      user_id: userId,
      amount: rewardAmount,
      asset_code: "BAYANI",
      claimed: false,
      stellar_tx_hash: txHashIssue,
    },
    { onConflict: "campaign_id,user_id" }
  );

  if (rewardError) {
    return NextResponse.json({ error: rewardError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
