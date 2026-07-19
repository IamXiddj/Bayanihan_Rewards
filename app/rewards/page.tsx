"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet, Sparkles, TriangleAlert, Check } from "lucide-react";
import { connectWallet, getPublicKey, isFreighterInstalled, WalletError } from "@/lib/wallet";
import { useWalletRole } from "@/lib/wallet-role-context";
import { getBayaniTokenClient, fromRawBayaniAmount } from "@/lib/soroban";
import { ClaimRewardButton } from "@/components/ClaimRewardButton";

interface Reward {
  id: string;
  amount: number;
  asset_code: string;
  claimed: boolean;
  claimed_at: string | null;
  stellar_tx_hash: string | null;
  campaign: { id: string; on_chain_id: number | null; title: string } | null;
}

export default function RewardsPage() {
  const { setConnectedAddress } = useWalletRole();
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);

  const loadEverything = useCallback(async (wallet: string) => {
    setBalanceLoading(true);
    setLoading(true);
    try {
      const [balanceResult, rewardsRes] = await Promise.all([
        (async () => {
          try {
            const token = await getBayaniTokenClient();
            const tx = await token.balance({ id: wallet });
            const raw = (tx.result as unknown as bigint) ?? 0n;
            return fromRawBayaniAmount(typeof raw === "bigint" ? raw : BigInt(raw));
          } catch {
            return null;
          }
        })(),
        fetch(`/api/rewards?wallet=${encodeURIComponent(wallet)}`).then((r) => r.json()),
      ]);
      setBalance(balanceResult);
      setRewards(rewardsRes.rewards ?? []);
    } finally {
      setBalanceLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const installed = await isFreighterInstalled();
      if (!installed) return;
      try {
        const pubKey = await getPublicKey();
        setAddress(pubKey);
        setConnectedAddress(pubKey);
        void loadEverything(pubKey);
      } catch {
        // Not yet connected — leave the connect prompt showing.
      }
    })();
  }, [loadEverything, setConnectedAddress]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const pubKey = await connectWallet();
      setAddress(pubKey);
      setConnectedAddress(pubKey);
      void loadEverything(pubKey);
    } catch (err) {
      setConnectError(err instanceof WalletError ? err.message : "Couldn't connect to Freighter.");
    } finally {
      setConnecting(false);
    }
  }

  const unclaimed = rewards.filter((r) => !r.claimed);
  const claimed = rewards.filter((r) => r.claimed);

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto max-w-2xl text-center mb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">My Rewards</h1>
        <p className="mt-2 text-sm text-slate">Your BAYANI balance and claimable rewards.</p>
      </header>

      <div className="woven-divider mx-auto max-w-2xl mb-10" />

      <div className="mx-auto max-w-2xl">
        {!address ? (
          <div className="rounded-2xl border border-line bg-paper-raised p-6 text-center">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-xl bg-maroon px-4 py-3 text-sm font-semibold text-paper-raised hover:bg-maroon-dark disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
            {connectError && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4" /> {connectError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-paper-raised p-6 text-center">
              <p className="text-xs text-slate mb-1">BAYANI balance</p>
              {balanceLoading ? (
                <p className="flex items-center justify-center gap-2 text-sm text-slate">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : (
                <p className="font-mono text-3xl font-semibold text-maroon">
                  {balance !== null ? balance.toLocaleString() : "—"}
                </p>
              )}
            </div>

            {loading ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading rewards…
              </p>
            ) : (
              <>
                <div>
                  <h2 className="mb-2 font-display text-base font-medium">Ready to claim</h2>
                  {unclaimed.length === 0 ? (
                    <p className="rounded-xl border border-line bg-paper-raised px-4 py-4 text-sm text-slate">
                      Nothing to claim right now.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {unclaimed.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{r.campaign?.title ?? "Campaign"}</p>
                            <p className="flex items-center gap-1 text-xs text-slate">
                              <Sparkles className="h-3 w-3" /> {r.amount} {r.asset_code}
                            </p>
                          </div>
                          {r.campaign?.on_chain_id !== null && r.campaign?.on_chain_id !== undefined && (
                            <ClaimRewardButton
                              rewardId={r.id}
                              onChainCampaignId={r.campaign.on_chain_id}
                              participantWallet={address}
                              onClaimed={() => void loadEverything(address)}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {claimed.length > 0 && (
                  <div>
                    <h2 className="mb-2 font-display text-base font-medium">Claimed</h2>
                    <ul className="space-y-2">
                      {claimed.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-paper-raised px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{r.campaign?.title ?? "Campaign"}</p>
                            <p className="text-xs text-slate">
                              {r.amount} {r.asset_code}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs text-forest">
                            <Check className="h-3.5 w-3.5" /> Claimed
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
