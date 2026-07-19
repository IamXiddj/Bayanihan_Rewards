import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
      id,
      on_chain_id,
      title,
      description,
      banner_url,
      reward_amount,
      reward_asset,
      max_participants,
      status,
      created_at,
      organization:organizations ( id, name, type, logo_url )
    `
    )
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data });
}
