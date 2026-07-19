"use client";

import { useState } from "react";
import { Loader2, PlusCircle, TriangleAlert } from "lucide-react";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api";
import { WalletError } from "@/lib/wallet";
import { getBayanihanRewardsClient, toRawBayaniAmount } from "@/lib/soroban";

export function CreateCampaignForm({
  organizerWallet,
  organizationId,
  onCreated,
}: {
  organizerWallet: string;
  organizationId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardAmount, setRewardAmount] = useState("50");
  const [maxParticipants, setMaxParticipants] = useState("0");
  const [status, setStatus] = useState<"idle" | "creating" | "recording">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = Number(rewardAmount);
    const cap = Number(maxParticipants);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a reward amount greater than 0.");
      return;
    }

    try {
      setStatus("creating");
      const client = await getBayanihanRewardsClient({
        publicKey: organizerWallet,
        signTransaction: freighterSignTransaction,
      });

      const tx = await client.create_campaign({
        organizer: organizerWallet,
        title,
        reward_amount: toRawBayaniAmount(amount),
        max_participants: cap,
      });
      const sent = await tx.signAndSend();

      // create_campaign returns a plain u64 (not wrapped in Result), so
      // `.result` should be the on-chain campaign id directly. This is the
      // first real exercise of that return path — if the raw value comes
      // back in an unexpected shape, this Number() conversion is the first
      // place to look.
      const onChainId = Number(sent.result as unknown as bigint | number);

      setStatus("recording");
      const res = await fetch("/api/campaign/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          title,
          description: description || undefined,
          rewardAmount: amount,
          maxParticipants: cap,
          onChainId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Created on-chain, but couldn't save it to the database.");
      }

      setTitle("");
      setDescription("");
      setRewardAmount("50");
      setMaxParticipants("0");
      setOpen(false);
      setStatus("idle");
      onCreated();
    } catch (err) {
      setStatus("idle");
      if (err instanceof WalletError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't create this campaign.");
      }
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-maroon/30 bg-maroon/5 px-4 py-2.5 text-sm font-semibold text-maroon transition-colors hover:bg-maroon/10"
      >
        <PlusCircle className="h-4 w-4" /> New campaign
      </button>
    );
  }

  const busy = status !== "idle";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-line bg-paper-raised p-5 md:p-6 space-y-3"
    >
      <h3 className="font-display text-base font-medium">New campaign</h3>
      <div>
        <label htmlFor="campaign-title" className="mb-1 block text-xs text-slate">
          Title
        </label>
        <input
          id="campaign-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Barangay Clean-Up Drive"
          required
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-maroon"
        />
      </div>
      <div>
        <label htmlFor="campaign-description" className="mb-1 block text-xs text-slate">
          Description (optional)
        </label>
        <textarea
          id="campaign-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-maroon"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="campaign-reward" className="mb-1 block text-xs text-slate">
            Reward (BAYANI)
          </label>
          <input
            id="campaign-reward"
            type="number"
            min="1"
            value={rewardAmount}
            onChange={(e) => setRewardAmount(e.target.value)}
            required
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-maroon"
          />
        </div>
        <div>
          <label htmlFor="campaign-cap" className="mb-1 block text-xs text-slate">
            Max participants
          </label>
          <input
            id="campaign-cap"
            type="number"
            min="0"
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-maroon"
          />
          <p className="mt-1 text-[10px] text-slate">0 = unlimited</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !title}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-maroon px-4 py-2.5 text-sm font-semibold text-paper-raised transition-colors hover:bg-maroon-dark disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "creating" && "Confirm in Freighter…"}
          {status === "recording" && "Saving…"}
          {status === "idle" && "Create campaign"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-xl border border-line px-4 py-2.5 text-sm text-slate hover:bg-paper disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </form>
  );
}
