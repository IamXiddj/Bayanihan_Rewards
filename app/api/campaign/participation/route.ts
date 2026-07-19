import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reports whether a wallet has already joined a given campaign, and how
 * far that participation has gotten — lets JoinCampaignButton show the
 * right state on load instead of only finding out after a failed
 * `join_campaign` call (AlreadyJoined, error #7).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const wallet = searchParams.get("wallet");

  if (!campaignId || !wallet) {
    return NextResponse.json(
      { error: "campaignId and wallet query params are both required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ joined: false });
  }

  const { data: participation } = await supabase
    .from("participations")
    .select("id, verified, rewarded")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participation) {
    return NextResponse.json({ joined: false });
  }

  return NextResponse.json({
    joined: true,
    verified: participation.verified,
    rewarded: participation.rewarded,
  });
}
