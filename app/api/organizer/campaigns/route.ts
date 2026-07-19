import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lists campaigns organized by the given wallet, each with its
 * participant list. Uses the admin client — same known simplification as
 * /api/campaign/join: wallet ownership here is trusted from the query
 * param, not cryptographically verified, since Freighter-session-backed
 * Supabase Auth still isn't wired up.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, type")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json({ organizationId: null, organizationName: null, campaigns: [] });
  }

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      on_chain_id,
      title,
      reward_amount,
      reward_asset,
      status,
      participations (
        id,
        verified,
        rewarded,
        created_at,
        user:users!user_id ( id, wallet_address, full_name )
      )
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (campaignsError) {
    return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  }

  return NextResponse.json({ organizationId: org.id, organizationName: org.name, campaigns: campaigns ?? [] });
}
