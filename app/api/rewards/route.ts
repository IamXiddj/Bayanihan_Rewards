import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ rewards: [] });
  }

  const { data: rewards, error } = await supabase
    .from("rewards")
    .select(
      `
      id,
      amount,
      asset_code,
      claimed,
      claimed_at,
      stellar_tx_hash,
      campaign:campaigns ( id, on_chain_id, title )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rewards: rewards ?? [] });
}
