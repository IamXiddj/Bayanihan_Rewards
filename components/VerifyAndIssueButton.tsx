"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert, Check } from "lucide-react";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import { WalletError } from "@/lib/wallet";
import { getBayanihanRewardsClient } from "@/lib/soroban";

type Status = "idle" | "verifying" | "issuing" | "recording" | "done" | "error";

export function VerifyAndIssueButton({
  participationId,
  campaignId,
  onChainCampaignId,
  participantWallet,
  participantUserId,
  organizerWallet,
  rewardAmount,
  onDone,
}: {
  participationId: string;
  campaignId: string;
  onChainCampaignId: number;
  participantWallet: string;
  participantUserId: string;
  organizerWallet: string;
  /** Human-facing BAYANI amount (e.g. 50), not the raw on-chain units. */
  rewardAmount: number;
  onDone?: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      const client = await getBayanihanRewardsClient({
        publicKey: organizerWallet,
        signTransaction: freighterSignTransaction,
      });

      setStatus("verifying");
      const verifyTx = await client.verify_participant({
        organizer: organizerWallet,
        campaign_id: BigInt(onChainCampaignId),
        participant: participantWallet,
      });
      await verifyTx.signAndSend();

      setStatus("issuing");
      const issueTx = await client.issue_reward({
        organizer: organizerWallet,
        campaign_id: BigInt(onChainCampaignId),
        participant: participantWallet,
      });
      const issueSent = await issueTx.signAndSend();
      const txHashIssue = issueSent.sendTransactionResponse?.hash ?? "";

      setStatus("recording");
      const recordRes = await fetch("/api/campaign/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participationId,
          campaignId,
          userId: participantUserId,
          rewardAmount,
          txHashIssue,
        }),
      });
      if (!recordRes.ok) {
        const data = await recordRes.json().catch(() => null);
        throw new Error(
          data?.error ??
            "Verified and issued on-chain, but couldn't save that here. The next load may show this as still pending — it's already done on-chain, so re-verifying will fail; refresh instead."
        );
      }

      setStatus("done");
      onDone?.();
    } catch (err) {
      setStatus("error");
      if (err instanceof WalletError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't verify and issue the reward.");
      }
    }
  }

  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest">
        <Check className="h-3.5 w-3.5" /> Verified & issued
      </span>
    );
  }

  const busy = status === "verifying" || status === "issuing" || status === "recording";

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-paper-raised transition-colors hover:bg-forest/85 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {status === "verifying" && "Confirm verify in Freighter…"}
        {status === "issuing" && "Confirm issue in Freighter…"}
        {status === "recording" && "Saving…"}
        {(status === "idle" || status === "error") && `Verify & issue ${rewardAmount} BAYANI`}
      </button>
      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
          <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
