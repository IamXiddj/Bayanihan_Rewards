"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, Wallet, TriangleAlert } from "lucide-react";
import { connectWallet, getPublicKey, isFreighterInstalled, WalletError } from "@/lib/wallet";
import { useWalletRole } from "@/lib/wallet-role-context";
import { VerifyAndIssueButton } from "@/components/VerifyAndIssueButton";
import { OrganizationRegisterForm } from "@/components/OrganizationRegisterForm";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";

interface Participation {
  id: string;
  verified: boolean;
  rewarded: boolean;
  user: { id: string; wallet_address: string; full_name: string | null } | null;
}

interface OrganizerCampaign {
  id: string;
  on_chain_id: number | null;
  title: string;
  reward_amount: number;
  reward_asset: string;
  participations: Participation[];
}

export default function OrganizerPage() {
  const { setConnectedAddress, refresh: refreshWalletRole } = useWalletRole();
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<OrganizerCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async (wallet: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/organizer/campaigns?wallet=${encodeURIComponent(wallet)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't load your campaigns.");
      }
      setOrgId(data.organizationId ?? null);
      setOrgName(data.organizationName ?? null);
      setCampaigns(data.campaigns ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load your campaigns.");
    } finally {
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
        void loadCampaigns(pubKey);
      } catch {
        // Not yet connected — leave the connect prompt showing.
      }
    })();
  }, [loadCampaigns, setConnectedAddress]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const pubKey = await connectWallet();
      setAddress(pubKey);
      setConnectedAddress(pubKey);
      void loadCampaigns(pubKey);
    } catch (err) {
      setConnectError(err instanceof WalletError ? err.message : "Couldn't connect to Freighter.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 md:py-20">
      <header className="mx-auto max-w-2xl text-center mb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Organizer</h1>
        <p className="mt-2 text-sm text-slate">
          Verify participants and issue their BAYANI rewards.
        </p>
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
              {connecting ? "Connecting…" : "Connect organizer wallet"}
            </button>
            {connectError && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4" /> {connectError}
              </p>
            )}
          </div>
        ) : loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your campaigns…
          </p>
        ) : loadError ? (
          <div className="rounded-2xl border border-line bg-paper-raised p-6 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm text-danger">
              <TriangleAlert className="h-4 w-4" /> {loadError}
            </p>
            <button
              onClick={() => void loadCampaigns(address)}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
            >
              Try again
            </button>
          </div>
        ) : !orgName ? (
          <OrganizationRegisterForm
            walletAddress={address}
            onRegistered={() => {
              void loadCampaigns(address);
              refreshWalletRole();
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate">
                Signed in as <span className="font-medium text-ink">{orgName}</span>
              </p>
              {orgId && (
                <CreateCampaignForm
                  organizerWallet={address}
                  organizationId={orgId}
                  onCreated={() => void loadCampaigns(address)}
                />
              )}
            </div>
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="rounded-2xl border border-line bg-paper-raised p-5 md:p-6">
                <h2 className="font-display text-lg font-medium">{campaign.title}</h2>
                <p className="mb-4 text-xs text-slate">
                  {campaign.reward_amount} {campaign.reward_asset} per verified participant
                </p>
                {campaign.participations.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-sm text-slate">
                    <Users className="h-4 w-4" /> No one has joined yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {campaign.participations.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2"
                      >
                        <span className="font-mono text-xs text-slate">
                          {p.user?.wallet_address
                            ? `${p.user.wallet_address.slice(0, 6)}…${p.user.wallet_address.slice(-6)}`
                            : "Unknown participant"}
                        </span>
                        {p.rewarded ? (
                          <span className="text-xs font-medium text-forest">Verified & issued</span>
                        ) : campaign.on_chain_id !== null && p.user ? (
                          <VerifyAndIssueButton
                            participationId={p.id}
                            campaignId={campaign.id}
                            onChainCampaignId={campaign.on_chain_id}
                            participantWallet={p.user.wallet_address}
                            participantUserId={p.user.id}
                            organizerWallet={address}
                            rewardAmount={campaign.reward_amount}
                            onDone={() => void loadCampaigns(address)}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
