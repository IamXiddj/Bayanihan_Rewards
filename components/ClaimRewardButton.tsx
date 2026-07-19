"use client";

import { useState } from "react";
import { Loader2, Sparkles, TriangleAlert, Check } from "lucide-react";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import { WalletError } from "@/lib/wallet";
import { getBayanihanRewardsClient } from "@/lib/soroban";
import { buildTrustBayaniTransaction, getBayaniBalance, submitSignedTransaction } from "@/lib/stellar";

const BAYANI_ISSUER = process.env.NEXT_PUBLIC_BAYANI_ISSUER_ADDRESS ?? "";

type Status = "idle" | "checking-trustline" | "trusting" | "claiming" | "recording" | "claimed" | "error";

export function ClaimRewardButton({
  rewardId,
  onChainCampaignId,
  participantWallet,
  onClaimed,
}: {
  rewardId: string;
  onChainCampaignId: number;
  participantWallet: string;
  onClaimed?: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setError(null);
    try {
      setStatus("checking-trustline");
      const { hasTrustline } = await getBayaniBalance(participantWallet, BAYANI_ISSUER);

      if (!hasTrustline) {
        setStatus("trusting");
        const trustTx = await buildTrustBayaniTransaction(participantWallet, BAYANI_ISSUER);
        const signedTrust = await freighterSignTransaction(trustTx.toXDR(), {
          networkPassphrase: trustTx.networkPassphrase,
        });
        if (signedTrust.error) {
          throw new WalletError("USER_REJECTED", "Trustline setup was declined in Freighter.");
        }
        await submitSignedTransaction(signedTrust.signedTxXdr);
      }

      setStatus("claiming");
      const client = await getBayanihanRewardsClient({
        publicKey: participantWallet,
        signTransaction: freighterSignTransaction,
      });

      const tx = await client.claim_reward({
        participant: participantWallet,
        campaign_id: BigInt(onChainCampaignId),
      });
      const sent = await tx.signAndSend();
      const txHash = sent.sendTransactionResponse?.hash ?? "";

      setStatus("recording");
      await fetch("/api/rewards/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId, txHash }),
      });

      setStatus("claimed");
      onClaimed?.();
    } catch (err) {
      setStatus("error");
      if (err instanceof WalletError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't claim this reward.");
      }
    }
  }

  if (status === "claimed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest">
        <Check className="h-3.5 w-3.5" /> Claimed
      </span>
    );
  }

  const busy =
    status === "checking-trustline" || status === "trusting" || status === "claiming" || status === "recording";

  return (
    <div>
      <button
        onClick={handleClaim}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:brightness-95 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {status === "checking-trustline" && "Checking wallet…"}
        {status === "trusting" && "Confirm trustline in Freighter…"}
        {status === "claiming" && "Confirm claim in Freighter…"}
        {status === "recording" && "Saving…"}
        {(status === "idle" || status === "error") && "Claim"}
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

