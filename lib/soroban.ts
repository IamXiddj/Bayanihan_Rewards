// lib/soroban.ts
//
// Shared wrapper around the deployed Bayanihan Rewards contract, built on
// @stellar/stellar-sdk's `contract.Client` — the JS/TS equivalent of the
// auto-generated `BayanihanRewardsClient` used in the contract's own Rust
// tests. Runs the same in Client Components (where Freighter can sign) and
// on the server (read-only calls only — there's no wallet to sign with
// there).
//
// A note on typing: contract.Client's methods are generated at runtime from
// the contract's on-chain spec, so TypeScript has no static knowledge of
// `create_campaign`, `join_campaign`, etc. BayanihanRewardsMethods below is
// a hand-written shim matching contracts/bayanihan-rewards/src/lib.rs
// exactly, so call sites get real autocomplete and type-checking instead of
// falling back to `any` everywhere. The success-value generics are left as
// `unknown` rather than guessed at further — see the note on
// AssembledTransaction below.

import { contract, Networks } from "@stellar/stellar-sdk";
import type { AssembledTransaction, ClientOptions } from "@stellar/stellar-sdk/contract";

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const NETWORK_PASSPHRASE: string = Networks.TESTNET;
export const BAYANIHAN_REWARDS_CONTRACT_ID = process.env.NEXT_PUBLIC_SOROBAN_CONTRACT_ID ?? "";
export const BAYANI_TOKEN_CONTRACT_ID = process.env.NEXT_PUBLIC_BAYANI_TOKEN_CONTRACT_ID ?? "";

/**
 * Stellar assets (including BAYANI, wrapped from a classic asset) always
 * use 7 decimal places — the same convention XLM uses. Every raw amount
 * the contract stores or returns is an integer in the smallest unit, not
 * whole BAYANI. Route every contract-facing amount through these two
 * functions rather than passing human numbers straight through — that gap
 * is exactly what produced the 50-raw-units-instead-of-50-BAYANI mismatch
 * fixed in supabase/migrations/0004_fix_reward_scale.sql.
 */
export const BAYANI_DECIMALS = 7;

/** Converts a human-facing BAYANI amount (e.g. 50) into the raw i128 the
 * contract actually expects (e.g. 500000000n). */
export function toRawBayaniAmount(displayAmount: number): bigint {
  return BigInt(Math.round(displayAmount * 10 ** BAYANI_DECIMALS));
}

/** Converts a raw i128 amount from the contract/token back into a
 * human-facing BAYANI amount for display. */
export function fromRawBayaniAmount(rawAmount: bigint | number): number {
  return Number(rawAmount) / 10 ** BAYANI_DECIMALS;
}

// Mirrors the #[contracterror] enum in contracts/bayanihan-rewards/src/lib.rs
// exactly (same order, same numbers), so a failed call surfaces as a
// readable message instead of a bare "Error(Contract, #9)".
export const BAYANIHAN_REWARDS_ERROR_TYPES: Record<number, { message: string }> = {
  1: { message: "Contract has not been initialized yet." },
  2: { message: "Contract has already been initialized." },
  3: { message: "Not authorized for this action." },
  4: { message: "Campaign not found." },
  5: { message: "This campaign is no longer active." },
  6: { message: "This campaign has reached its participant limit." },
  7: { message: "You've already joined this campaign." },
  8: { message: "You haven't joined this campaign yet." },
  9: { message: "This participation has already been verified." },
  10: { message: "This participation hasn't been verified yet." },
  11: { message: "A reward has already been issued for this participation." },
  12: { message: "No reward has been issued for this participant yet." },
  13: { message: "This reward has already been claimed." },
};

/** Shape of a campaign as the contract itself returns it (see the Campaign
 * struct in lib.rs) — snake_case field names, matching the Rust struct's
 * XDR-serialized shape exactly, not the camelCase used elsewhere in the
 * frontend. */
export interface OnChainCampaign {
  id: bigint;
  organizer: string;
  title: string;
  reward_amount: bigint;
  max_participants: number;
  participant_count: number;
  active: boolean;
}

export interface OnChainRewardInfo {
  participant: string;
  amount: bigint;
  claimed: boolean;
}

/**
 * Hand-written shim for the contract's actual method set (see
 * contracts/bayanihan-rewards/src/lib.rs). `unknown` on each
 * AssembledTransaction's generic is intentional: the exact client-side
 * shape of a Rust `Result<T, Error>` return value hasn't been verified
 * against a live call yet, so this leaves that as an explicit gap rather
 * than guessing. Narrow it with an `as` once the first real call confirms
 * the shape, the same way we've been correcting CLI flag guesses all
 * session.
 */
export interface BayanihanRewardsMethods {
  initialize(args: { admin: string; token_id: string }): Promise<AssembledTransaction<unknown>>;
  create_campaign(args: {
    organizer: string;
    title: string;
    reward_amount: bigint;
    max_participants: number;
  }): Promise<AssembledTransaction<unknown>>;
  join_campaign(args: {
    participant: string;
    campaign_id: bigint;
  }): Promise<AssembledTransaction<unknown>>;
  verify_participant(args: {
    organizer: string;
    campaign_id: bigint;
    participant: string;
  }): Promise<AssembledTransaction<unknown>>;
  issue_reward(args: {
    organizer: string;
    campaign_id: bigint;
    participant: string;
  }): Promise<AssembledTransaction<unknown>>;
  claim_reward(args: {
    participant: string;
    campaign_id: bigint;
  }): Promise<AssembledTransaction<unknown>>;
  get_campaign(args: { campaign_id: bigint }): Promise<AssembledTransaction<unknown>>;
  get_participants(args: { campaign_id: bigint }): Promise<AssembledTransaction<unknown>>;
  get_rewards(args: { campaign_id: bigint }): Promise<AssembledTransaction<unknown>>;
}

export type BayanihanRewardsClient = contract.Client & BayanihanRewardsMethods;

/** Minimal SEP-41 token interface — just what the Reward Wallet UI needs. */
export interface TokenMethods {
  balance(args: { id: string }): Promise<AssembledTransaction<unknown>>;
}

export type BayaniTokenClient = contract.Client & TokenMethods;

/** Builds a Client for the BAYANI token contract (a Stellar Asset Contract),
 * for reading a wallet's BAYANI balance. Read-only — omit publicKey /
 * signTransaction entirely, since a balance check never needs signing. */
export async function getBayaniTokenClient(): Promise<BayaniTokenClient> {
  if (!BAYANI_TOKEN_CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_BAYANI_TOKEN_CONTRACT_ID is not set.");
  }
  const client = await contract.Client.from({
    contractId: BAYANI_TOKEN_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
  });
  return client as BayaniTokenClient;
}

/**
 * Builds a Client for the deployed Bayanihan Rewards contract.
 *
 * Pass `publicKey` + `signTransaction` (Freighter's own exported function
 * matches this shape directly — see lib/wallet.ts) for calls that need to
 * sign and submit. Omit both for read-only calls, which only simulate and
 * never need a wallet at all.
 */
export async function getBayanihanRewardsClient(options?: {
  publicKey?: string;
  signTransaction?: ClientOptions["signTransaction"];
}): Promise<BayanihanRewardsClient> {
  if (!BAYANIHAN_REWARDS_CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_SOROBAN_CONTRACT_ID is not set.");
  }
  const client = await contract.Client.from({
    contractId: BAYANIHAN_REWARDS_CONTRACT_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: SOROBAN_RPC_URL,
    errorTypes: BAYANIHAN_REWARDS_ERROR_TYPES,
    ...options,
  });
  return client as BayanihanRewardsClient;
}
