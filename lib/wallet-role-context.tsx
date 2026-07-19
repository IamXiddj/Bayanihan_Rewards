"use client";

// lib/wallet-role-context.tsx
//
// A single, app-wide answer to "is the connected wallet a citizen or an
// organizer," shared between the Nav (which decides what to show) and any
// page that wants to gate its own content the same way. Without this,
// each page would independently re-detect the wallet and the Nav would
// have no way to know a page just connected one — so nav links wouldn't
// update until a full reload.
//
// Role here is deliberately simple and matches how the rest of the app
// already works: "organizer" means this wallet address owns a row in
// public.organizations (see app/api/organization/create's self-service
// registration flow). There's no separate "admin" concept enforced
// anywhere else in the app today — the `role` column on public.users
// includes 'admin' but nothing currently checks it — so "organizer" is
// treated as the one elevated tier for now. Wiring a real `admin` role in
// would mean checking that column here too once something actually reads
// it elsewhere.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getPublicKey, isFreighterInstalled } from "@/lib/wallet";

export type Role = "citizen" | "organizer";

interface WalletRoleState {
  address: string | null;
  role: Role;
  /** True until the first silent connection check has resolved. */
  loading: boolean;
  /** Re-runs the silent Freighter check + role lookup from scratch. */
  refresh: () => void;
  /** Call right after a page's own connectWallet() succeeds, so the nav
   * (and any other consumer) updates immediately instead of waiting for
   * the next silent check on a future page load. */
  setConnectedAddress: (address: string) => void;
}

const WalletRoleContext = createContext<WalletRoleState | null>(null);

async function resolveRole(address: string): Promise<Role> {
  try {
    const res = await fetch(`/api/organizer/status?wallet=${encodeURIComponent(address)}`);
    if (!res.ok) return "citizen";
    const data = await res.json();
    return data.role === "organizer" ? "organizer" : "citizen";
  } catch {
    // Network hiccup or the route being briefly unavailable shouldn't
    // silently grant organizer access — fail closed.
    return "citizen";
  }
}

export function WalletRoleProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("citizen");
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const installed = await isFreighterInstalled();
      if (!installed) {
        setAddress(null);
        setRole("citizen");
        return;
      }
      let pubKey: string;
      try {
        pubKey = await getPublicKey();
      } catch {
        // Extension present but this site isn't allowed yet — same as
        // disconnected for role purposes.
        setAddress(null);
        setRole("citizen");
        return;
      }
      setAddress(pubKey);
      setRole(await resolveRole(pubKey));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const setConnectedAddress = useCallback((newAddress: string) => {
    setAddress(newAddress);
    void resolveRole(newAddress).then(setRole);
  }, []);

  return (
    <WalletRoleContext.Provider value={{ address, role, loading, refresh: check, setConnectedAddress }}>
      {children}
    </WalletRoleContext.Provider>
  );
}

export function useWalletRole(): WalletRoleState {
  const ctx = useContext(WalletRoleContext);
  if (!ctx) {
    throw new Error("useWalletRole must be used within a WalletRoleProvider");
  }
  return ctx;
}
