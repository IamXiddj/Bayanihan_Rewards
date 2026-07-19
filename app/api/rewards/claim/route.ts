import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rewardId: string | undefined = body?.rewardId;
  const txHash: string | undefined = body?.txHash;

  if (!rewardId || !txHash) {
    return NextResponse.json({ error: "rewardId and txHash are required." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("rewards")
    .update({ claimed: true, claimed_at: new Date().toISOString(), stellar_tx_hash: txHash })
    .eq("id", rewardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
