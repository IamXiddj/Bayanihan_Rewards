import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_TYPES = ["lgu", "school", "ngo", "private"] as const;

/**
 * Registers an organization for a wallet — a purely off-chain concept.
 * The contract itself doesn't know about organizations, only about
 * whichever address calls create_campaign as `organizer`; this table
 * exists so the frontend can group campaigns by who's running them and
 * gate the organizer UI behind "does this wallet manage anything."
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const walletAddress: string | undefined = body?.walletAddress;
  const name: string | undefined = body?.name;
  const type: string | undefined = body?.type;

  if (!walletAddress || !name || !type) {
    return NextResponse.json(
      { error: "walletAddress, name, and type are all required." },
      { status: 400 }
    );
  }
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(
      { wallet_address: walletAddress, role: "organizer" },
      { onConflict: "wallet_address" }
    )
    .select("id")
    .single();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Could not resolve a user for this wallet." },
      { status: 500 }
    );
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ owner_id: user.id, name, type, wallet_address: walletAddress })
    .select("id, name")
    .single();

  if (orgError) {
    if (orgError.code === "23505") {
      return NextResponse.json(
        { error: "An organization is already registered for this wallet." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  return NextResponse.json({ organization: org });
}
