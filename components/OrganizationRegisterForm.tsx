"use client";

import { useState } from "react";
import { Loader2, Building2, TriangleAlert } from "lucide-react";

const ORG_TYPES: { value: string; label: string }[] = [
  { value: "lgu", label: "LGU (barangay / city / municipal)" },
  { value: "school", label: "School / university / TESDA" },
  { value: "ngo", label: "NGO" },
  { value: "private", label: "Private organization" },
];

export function OrganizationRegisterForm({
  walletAddress,
  onRegistered,
}: {
  walletAddress: string;
  onRegistered: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("lgu");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/organization/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, name, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't register this organization.");
      }
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't register this organization.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6 md:p-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-maroon/10">
        <Building2 className="h-6 w-6 text-maroon" />
      </div>
      <h2 className="mb-1 text-center font-display text-lg font-medium">Register your organization</h2>
      <p className="mb-5 text-center text-sm text-slate">
        No organization is linked to this wallet yet — set one up to start creating campaigns.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="org-name" className="mb-1 block text-xs text-slate">
            Organization name
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Barangay 143"
            required
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-maroon"
          />
        </div>
        <div>
          <label htmlFor="org-type" className="mb-1 block text-xs text-slate">
            Organization type
          </label>
          <select
            id="org-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-maroon"
          >
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || !name}
          className="w-full rounded-xl bg-maroon px-4 py-3 text-sm font-semibold text-paper-raised transition-colors hover:bg-maroon-dark disabled:opacity-60"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Registering…
            </span>
          ) : (
            "Register organization"
          )}
        </button>
        {error && (
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
