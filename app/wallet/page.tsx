"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Droplets,
  LogOut,
} from "lucide-react";
import {
  connectWallet,
  disconnectWallet,
  getPublicKey,
  isFreighterInstalled,
  signTransaction,
  verifyWallet,
  WalletError,
} from "@/lib/wallet";
import {
  buildPaymentTransaction,
  explorerAccountUrl,
  explorerTxUrl,
  fundWithFriendbot,
  getXlmBalance,
  StellarError,
  submitSignedTransaction,
  truncateAddress,
} from "@/lib/stellar";
import { cn } from "@/lib/utils";
import { RequireOrganizer } from "@/components/RequireOrganizer";

type SendStatus = "idle" | "building" | "awaiting-signature" | "submitting" | "success" | "error";

export default function WalletSandboxPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const refreshBalance = useCallback(async (pubKey: string) => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const bal = await getXlmBalance(pubKey);
      setBalance(bal);
    } catch (err) {
      if (err instanceof StellarError) {
        setBalanceError(err.message);
        if (err.code === "ACCOUNT_NOT_FOUND") setBalance(null);
      } else {
        setBalanceError("Couldn't load the balance. Try again.");
      }
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  // On load, silently pick up an already-allowed connection (no prompt) —
  // Freighter has no session of its own to restore, so this is just a
  // quiet check rather than a real "reconnect".
  useEffect(() => {
    (async () => {
      const installed = await isFreighterInstalled();
      if (!installed) return;
      try {
        const pubKey = await getPublicKey();
        setAddress(pubKey);
        void refreshBalance(pubKey);
      } catch {
        // Not yet allowed for this site — leave the disconnected state as is.
      }
    })();
  }, [refreshBalance]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const pubKey = await connectWallet();
      await verifyWallet();
      setAddress(pubKey);
      void refreshBalance(pubKey);
    } catch (err) {
      if (err instanceof WalletError) {
        setConnectError(err.message);
      } else {
        setConnectError("Couldn't connect to Freighter. Try again.");
      }
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setAddress(null);
    setBalance(null);
    setBalanceError(null);
    setSendStatus("idle");
    setSendError(null);
    setTxHash(null);
    setDestination("");
    setAmount("");
  }

  async function handleFund() {
    if (!address) return;
    setFunding(true);
    setBalanceError(null);
    try {
      await fundWithFriendbot(address);
      await refreshBalance(address);
    } catch (err) {
      setBalanceError(err instanceof StellarError ? err.message : "Friendbot funding failed.");
    } finally {
      setFunding(false);
    }
  }

  async function handleCopy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;

    setSendError(null);
    setTxHash(null);

    try {
      await verifyWallet();

      setSendStatus("building");
      const transaction = await buildPaymentTransaction(address, destination.trim(), amount.trim());

      setSendStatus("awaiting-signature");
      const signedXdr = await signTransaction(transaction.toXDR());

      setSendStatus("submitting");
      const hash = await submitSignedTransaction(signedXdr);

      setTxHash(hash);
      setSendStatus("success");
      setDestination("");
      setAmount("");
      void refreshBalance(address);
    } catch (err) {
      setSendStatus("error");
      if (err instanceof WalletError || err instanceof StellarError) {
        setSendError(err.message);
      } else {
        setSendError("Something went wrong sending that transaction.");
      }
    }
  }

  const sendBusy =
    sendStatus === "building" || sendStatus === "awaiting-signature" || sendStatus === "submitting";

  return (
    <RequireOrganizer>
    <main className="min-h-screen flex flex-col items-center px-4 py-12 md:py-20">
      <header className="w-full max-w-md text-center mb-8">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-3 py-1 text-xs font-medium text-slate mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Stellar Testnet
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Wallet Sandbox</h1>
        <p className="mt-2 text-sm text-slate">
          Check your Testnet XLM balance, fund a fresh wallet, or send a test payment.
          This is a general-purpose Stellar tool, separate from campaign rewards.
        </p>
      </header>

      <div className="woven-divider w-full max-w-md mb-8" />

      <section className="w-full max-w-md rounded-2xl border border-line bg-paper-raised p-6 md:p-8 shadow-[0_1px_0_0_rgba(38,33,27,0.04)]">
        {!address ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-maroon/10">
              <Wallet className="h-6 w-6 text-maroon" />
            </div>
            <h2 className="font-display text-lg font-medium mb-1">Connect your wallet</h2>
            <p className="text-sm text-slate mb-5">
              You'll need the Freighter extension, set to Test Net.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-maroon px-4 py-3 text-sm font-semibold text-paper-raised transition-colors hover:bg-maroon-dark disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {connecting ? "Connecting…" : "Connect Freighter"}
            </button>
            {connectError && (
              <p className="mt-3 flex items-start gap-1.5 text-left text-sm text-danger">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                {connectError}
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs text-slate mb-1">Connected address</p>
                <div className="flex items-center gap-2">
                  <a
                    href={explorerAccountUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm hover:text-maroon transition-colors"
                  >
                    {truncateAddress(address)}
                  </a>
                  <button
                    onClick={handleCopy}
                    aria-label="Copy address"
                    className="text-slate hover:text-ink transition-colors"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1 text-xs text-slate hover:text-ink transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>

            <div className="rounded-xl bg-paper px-4 py-3 mb-5">
              <p className="text-xs text-slate mb-1">Balance</p>
              {balanceLoading ? (
                <p className="flex items-center gap-2 text-sm text-slate">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </p>
              ) : balance !== null ? (
                <p className="font-mono text-2xl font-medium">
                  {Number(balance).toLocaleString(undefined, { maximumFractionDigits: 7 })}{" "}
                  <span className="text-sm text-slate font-sans">XLM</span>
                </p>
              ) : (
                <p className="text-sm text-slate">Not funded on Testnet yet.</p>
              )}
              {balanceError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {balanceError}
                </p>
              )}
              {balance === null && !balanceLoading && (
                <button
                  onClick={handleFund}
                  disabled={funding}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-xs font-medium hover:border-gold transition-colors disabled:opacity-60"
                >
                  {funding ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Droplets className="h-3.5 w-3.5 text-gold" />
                  )}
                  {funding ? "Funding…" : "Fund with Friendbot"}
                </button>
              )}
            </div>

            <div className="woven-divider mb-5" />

            <form onSubmit={handleSend} className="space-y-3">
              <h3 className="font-display text-base font-medium">Send a test payment</h3>
              <div>
                <label htmlFor="destination" className="block text-xs text-slate mb-1">
                  Destination address
                </label>
                <input
                  id="destination"
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="G..."
                  required
                  className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-mono text-sm outline-none focus:border-maroon"
                />
              </div>
              <div>
                <label htmlFor="amount" className="block text-xs text-slate mb-1">
                  Amount (XLM)
                </label>
                <input
                  id="amount"
                  type="number"
                  step="0.0000001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10"
                  required
                  className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 font-mono text-sm outline-none focus:border-maroon"
                />
              </div>
              <button
                type="submit"
                disabled={sendBusy || !destination || !amount}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-maroon px-4 py-3 text-sm font-semibold text-paper-raised transition-colors hover:bg-maroon-dark disabled:opacity-60"
              >
                {sendBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {sendStatus === "building" && "Building transaction…"}
                {sendStatus === "awaiting-signature" && "Confirm in Freighter…"}
                {sendStatus === "submitting" && "Submitting…"}
                {!sendBusy && "Send XLM"}
              </button>
            </form>

            {sendStatus === "success" && txHash && (
              <div className="mt-4 rounded-xl border border-forest/30 bg-forest/5 px-4 py-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-forest">
                  <CircleCheck className="h-4 w-4" /> Sent
                </p>
                <a
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-slate hover:text-forest transition-colors"
                >
                  {truncateAddress(txHash, 8, 8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {sendStatus === "error" && sendError && (
              <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                <p className="flex items-start gap-1.5 text-sm text-danger">
                  <CircleX className="h-4 w-4 mt-0.5 shrink-0" /> {sendError}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="w-full max-w-md text-center mt-8">
        <p className="text-xs text-slate">
          Testnet only — these tokens have no real-world value.
        </p>
      </footer>
    </main>
    </RequireOrganizer>
  );
}
