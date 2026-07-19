import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lightweight role check for a wallet — just "does an organization exist
 * for this address," without the heavier campaign + participation lists
 * /api/organizer/campaigns also returns. Used by the nav (and any
 * organizer-only page gate) on every load, so it stays as cheap as
 * possible rather than reusing the bigger route.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    role: org ? "organizer" : "citizen",
    organizationId: org?.id ?? null,
    organizationName: org?.name ?? null,
  });
}
