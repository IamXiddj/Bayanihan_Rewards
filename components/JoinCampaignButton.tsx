"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, TriangleAlert, HandHeart } from "lucide-react";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import {
  connectWallet,
  getPublicKey,
  isFreighterInstalled,
  verifyWallet,
  WalletError,
} from "@/lib/wallet";
import { getBayanihanRewardsClient } from "@/lib/soroban";
import { useWalletRole } from "@/lib/wallet-role-context";

type Status = "checking" | "idle" | "connecting" | "joining" | "recording" | "joined" | "error";

export function JoinCampaignButton({
  campaignId,
  onChainCampaignId,
}: {
  /** Supabase's own UUID for this campaign row — not the on-chain id. */
  campaignId: string;
  /** The u64 the contract itself uses to identify this campaign. */
  onChainCampaignId: number;
}) {
  const { setConnectedAddress } = useWalletRole();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  // On mount, if a wallet is already connected, find out whether it's
  // joined this campaign already rather than waiting for a click to find
  // out via a failed on-chain call.
  useEffect(() => {
    (async () => {
      const installed = await isFreighterInstalled();
      if (!installed) {
        setStatus("idle");
        return;
      }
      let publicKey: string;
      try {
        publicKey = await getPublicKey();
        setConnectedAddress(publicKey);
      } catch {
        setStatus("idle");
        return;
      }
      try {
        const res = await fetch(
          `/api/campaign/participation?campaignId=${encodeURIComponent(campaignId)}&wallet=${encodeURIComponent(publicKey)}`
        );
        const data = await res.json();
        setStatus(data.joined ? "joined" : "idle");
      } catch {
        setStatus("idle");
      }
    })();
  }, [campaignId, setConnectedAddress]);

  async function handleJoin() {
    setError(null);
    try {
      setStatus("connecting");

      const installed = await isFreighterInstalled();
      if (!installed) {
        throw new WalletError(
          "NOT_INSTALLED",
          "Install Freighter from freighter.app to join this campaign."
        );
      }

      let publicKey: string;
      try {
        publicKey = await getPublicKey();
      } catch {
        publicKey = await connectWallet();
      }
      setConnectedAddress(publicKey);
      await verifyWallet();

      setStatus("joining");
      const client = await getBayanihanRewardsClient({
        publicKey,
        signTransaction: freighterSignTransaction,
      });

      const tx = await client.join_campaign({
        participant: publicKey,
        campaign_id: BigInt(onChainCampaignId),
      });
      const sent = await tx.signAndSend();
      const txHash = sent.sendTransactionResponse?.hash ?? "";

      setStatus("recording");
      const recordRes = await fetch("/api/campaign/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, walletAddress: publicKey, txHash }),
      });
      if (!recordRes.ok) {
        const data = await recordRes.json().catch(() => null);
        throw new Error(
          data?.error ??
            "Joined on-chain, but couldn't save it here — the organizer won't see you yet. Refresh and try again."
        );
      }

      setStatus("joined");
    } catch (err) {
      // AlreadyJoined (contract error #7) means the check above missed an
      // existing participation — treat it as the same success state
      // rather than surfacing a confusing failure for something that's
      // actually fine.
      if (err instanceof Error && /already.?joined/i.test(err.message)) {
        setStatus("joined");
        return;
      }
      setStatus("error");
      if (err instanceof WalletError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't join this campaign. Try again.");
      }
    }
  }

  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-paper px-3 py-2 text-sm text-slate">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    );
  }

  if (status === "joined") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-forest/10 px-3 py-2 text-sm font-medium text-forest">
        <Check className="h-4 w-4" /> Joined
      </span>
    );
  }

  const busy = status === "connecting" || status === "joining" || status === "recording";

  return (
    <div>
      <button
        onClick={handleJoin}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-maroon px-3 py-2 text-sm font-semibold text-paper-raised transition-colors hover:bg-maroon-dark disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandHeart className="h-4 w-4" />}
        {status === "connecting" && "Connecting…"}
        {status === "joining" && "Confirm in Freighter…"}
        {status === "recording" && "Almost there…"}
        {(status === "idle" || status === "error") && "Join campaign"}
      </button>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
          <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
