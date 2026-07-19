// lib/stellar.ts
//
// Testnet Horizon helpers: balance lookups, and building/submitting a
// plain XLM payment. This file only talks to the Stellar network itself;
// lib/wallet.ts is the only thing that talks to Freighter.

import {
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";

export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE: string = Networks.TESTNET;
export const FRIENDBOT_URL = "https://friendbot.stellar.org";

export const explorerTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccountUrl = (address: string) =>
  `https://stellar.expert/explorer/testnet/account/${address}`;

const server = new Horizon.Server(HORIZON_TESTNET_URL);

export type StellarErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "INVALID_ADDRESS"
  | "INSUFFICIENT_BALANCE"
  | "NETWORK_ERROR"
  | "TX_FAILED";

export class StellarError extends Error {
  code: StellarErrorCode;

  constructor(code: StellarErrorCode, message: string) {
    super(message);
    this.name = "StellarError";
    this.code = code;
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; response?: { status?: number } };
  return e?.name === "NotFoundError" || e?.response?.status === 404;
}

function findNativeBalance(
  balances: Horizon.HorizonApi.BalanceLine[]
): Horizon.HorizonApi.BalanceLineNative | undefined {
  return balances.find(
    (b): b is Horizon.HorizonApi.BalanceLineNative => b.asset_type === "native"
  );
}

function findAssetBalance(
  balances: Horizon.HorizonApi.BalanceLine[],
  assetCode: string,
  assetIssuer: string
): Horizon.HorizonApi.BalanceLineAsset | undefined {
  return balances.find(
    (b): b is Horizon.HorizonApi.BalanceLineAsset =>
      "asset_code" in b && b.asset_code === assetCode && b.asset_issuer === assetIssuer
  );
}

export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

export function truncateAddress(address: string, lead = 6, tail = 6): string {
  if (address.length <= lead + tail) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * Fetches the native XLM balance for an account. Throws a StellarError
 * with code ACCOUNT_NOT_FOUND for an address that hasn't been funded yet —
 * a fresh testnet keypair has no ledger entry at all until Friendbot (or a
 * payment) creates one.
 */
export async function getXlmBalance(publicKey: string): Promise<string> {
  try {
    const account = await server.loadAccount(publicKey);
    return findNativeBalance(account.balances)?.balance ?? "0";
  } catch (err) {
    if (isNotFound(err)) {
      throw new StellarError(
        "ACCOUNT_NOT_FOUND",
        "This account doesn't exist on Testnet yet. Fund it with Friendbot first."
      );
    }
    throw new StellarError("NETWORK_ERROR", "Couldn't reach the Stellar Testnet network.");
  }
}

/**
 * Fetches an account's BAYANI balance and whether it has a trustline at
 * all. Returns `hasTrustline: false` (not an error) for an account that
 * simply hasn't opted in to hold BAYANI yet — that's an expected, common
 * state (see the trustline note in DEPLOYMENT.md), not a failure.
 */
export async function getBayaniBalance(
  publicKey: string,
  bayaniIssuer: string
): Promise<{ balance: string; hasTrustline: boolean }> {
  try {
    const account = await server.loadAccount(publicKey);
    const line = findAssetBalance(account.balances, "BAYANI", bayaniIssuer);
    return line ? { balance: line.balance, hasTrustline: true } : { balance: "0", hasTrustline: false };
  } catch (err) {
    if (isNotFound(err)) {
      throw new StellarError(
        "ACCOUNT_NOT_FOUND",
        "This account doesn't exist on Testnet yet. Fund it with Friendbot first."
      );
    }
    throw new StellarError("NETWORK_ERROR", "Couldn't reach the Stellar Testnet network.");
  }
}

/**
 * Requests 10,000 test XLM for a fresh keypair from Friendbot. Testnet
 * only — Friendbot has no equivalent on the public network.
 */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  } catch {
    throw new StellarError("NETWORK_ERROR", "Couldn't reach Friendbot. Try again in a moment.");
  }
  if (!response.ok) {
    throw new StellarError("NETWORK_ERROR", "Friendbot funding failed. Try again in a moment.");
  }
}

/**
 * Builds an unsigned change-trust transaction so an account can hold
 * BAYANI. Same operation as `stellar tx new change-trust` in
 * DEPLOYMENT.md, built here so the frontend can prompt for it via
 * Freighter instead of requiring a CLI step.
 */
export async function buildTrustBayaniTransaction(
  accountPublicKey: string,
  bayaniIssuer: string
): Promise<Transaction> {
  let account;
  try {
    account = await server.loadAccount(accountPublicKey);
  } catch (err) {
    if (isNotFound(err)) {
      throw new StellarError(
        "ACCOUNT_NOT_FOUND",
        "This account doesn't exist on Testnet yet. Fund it with Friendbot first."
      );
    }
    throw new StellarError("NETWORK_ERROR", "Couldn't reach the Stellar Testnet network.");
  }

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset("BAYANI", bayaniIssuer),
      })
    )
    .setTimeout(60)
    .build();
}

/**
 * Builds an unsigned native-XLM payment transaction, ready for Freighter
 * to sign. Validates the destination address and does a rough
 * pre-submission balance check so obviously-bad sends fail fast with a
 * clear message instead of a raw Horizon error.
 */
export async function buildPaymentTransaction(
  sourcePublicKey: string,
  destinationPublicKey: string,
  amount: string
): Promise<Transaction> {
  if (!isValidStellarAddress(destinationPublicKey)) {
    throw new StellarError(
      "INVALID_ADDRESS",
      "That doesn't look like a valid Stellar address — it should start with G and be 56 characters."
    );
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new StellarError("INVALID_ADDRESS", "Enter an amount greater than 0.");
  }

  let sourceAccount;
  try {
    sourceAccount = await server.loadAccount(sourcePublicKey);
  } catch (err) {
    if (isNotFound(err)) {
      throw new StellarError(
        "ACCOUNT_NOT_FOUND",
        "Your account doesn't exist on Testnet yet. Fund it with Friendbot first."
      );
    }
    throw new StellarError("NETWORK_ERROR", "Couldn't reach the Stellar Testnet network.");
  }

  const available = Number(findNativeBalance(sourceAccount.balances)?.balance ?? "0");
  // Rough headroom for the account's base reserve plus the network fee;
  // Horizon is still the final word, this just fails fast with a clearer
  // message than a raw op_underfunded response.
  if (available < numericAmount + 1) {
    throw new StellarError(
      "INSUFFICIENT_BALANCE",
      "Not enough XLM to cover that amount plus Stellar's minimum reserve and network fee."
    );
  }

  return new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(60)
    .build();
}

/**
 * Submits a Freighter-signed transaction (its signed XDR string) to
 * Testnet and returns the resulting transaction hash.
 */
export async function submitSignedTransaction(signedXdr: string): Promise<string> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  try {
    const result = await server.submitTransaction(transaction);
    return result.hash;
  } catch (err) {
    const e = err as {
      response?: { data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } } };
    };
    const codes = e?.response?.data?.extras?.result_codes;
    if (codes) {
      const opCodes = codes.operations ?? [];
      if (opCodes.includes("op_underfunded")) {
        throw new StellarError(
          "INSUFFICIENT_BALANCE",
          "Insufficient balance to cover this payment plus fees."
        );
      }
      if (opCodes.includes("op_no_destination")) {
        throw new StellarError(
          "ACCOUNT_NOT_FOUND",
          "The destination account doesn't exist on Testnet yet."
        );
      }
      throw new StellarError(
        "TX_FAILED",
        `Transaction failed: ${codes.transaction ?? opCodes.join(", ") ?? "unknown reason"}`
      );
    }
    throw new StellarError("NETWORK_ERROR", "Couldn't reach the Stellar Testnet network to submit.");
  }
}
