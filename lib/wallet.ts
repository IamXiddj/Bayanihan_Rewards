// lib/wallet.ts
//
// Freighter wallet integration for Bayanihan Rewards.
//
// A note on naming: this file exposes connectWallet / disconnectWallet /
// getPublicKey / signTransaction / verifyWallet because that's the interface
// this project's spec asks for. Freighter's own current package
// (@stellar/freighter-api) no longer calls its address getter
// `getPublicKey` — that's `getAddress()` now — and it has no
// "disconnectWallet" call at all, because there's no server-side session
// for a browser wallet extension to end. Both are handled below: the first
// as a thin, clearly-commented wrapper, the second as a local reset of this
// app's own connection state.

import {
  isConnected as freighterIsConnected,
  isAllowed as freighterIsAllowed,
  requestAccess,
  getAddress,
  getNetworkDetails,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";

export const EXPECTED_NETWORK_PASSPHRASE: string = Networks.TESTNET;

export type WalletErrorCode =
  | "NOT_INSTALLED"
  | "USER_REJECTED"
  | "WRONG_NETWORK"
  | "NOT_CONNECTED"
  | "UNKNOWN";

export class WalletError extends Error {
  code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

/**
 * Freighter doesn't return a stable machine-readable code for "the user
 * closed the popup or hit reject" — just an error message. This matches on
 * the wording it has historically used for that case, falling back
 * gracefully (as an UNKNOWN error) if Freighter ever changes the wording.
 */
function looksLikeUserRejection(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("declined") || m.includes("rejected") || m.includes("denied");
}

/**
 * Confirms the Freighter extension is present in this browser at all.
 * Cheap to call before anything else, since every other call below will
 * otherwise fail confusingly (usually by hanging) with no extension
 * installed.
 */
export async function isFreighterInstalled(): Promise<boolean> {
  const result = await freighterIsConnected();
  return Boolean(result.isConnected) && !result.error;
}

/**
 * Connects to Freighter: confirms the extension is installed, then
 * requests account access. `requestAccess` is what prompts the user the
 * first time (or silently returns the address if this site is already
 * allowed). Returns the connected G... address.
 */
export async function connectWallet(): Promise<string> {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new WalletError(
      "NOT_INSTALLED",
      "Freighter isn't installed. Install it from freighter.app, then reload this page."
    );
  }

  const access = await requestAccess();
  if (access.error) {
    const message = access.error.message ?? "Freighter didn't grant access.";
    if (looksLikeUserRejection(message)) {
      throw new WalletError("USER_REJECTED", "Connection request was declined in Freighter.");
    }
    throw new WalletError("UNKNOWN", message);
  }

  return access.address;
}

/**
 * Clears this app's own idea of the connection. There is no Freighter-side
 * "log out" — the user can separately revoke this site's access from
 * inside the Freighter extension if they want to fully disconnect there
 * too.
 */
export function disconnectWallet(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("bayanihan:lastAddress");
  }
}

/**
 * Returns the currently connected public key without prompting the user
 * again. Named `getPublicKey` to match this project's spec; internally
 * this is Freighter's current `getAddress()` — see the file header.
 */
export async function getPublicKey(): Promise<string> {
  const allowed = await freighterIsAllowed();
  if (allowed.error || !allowed.isAllowed) {
    throw new WalletError("NOT_CONNECTED", "Connect your wallet first.");
  }
  const result = await getAddress();
  if (result.error) {
    throw new WalletError(
      "UNKNOWN",
      result.error.message ?? "Could not read the wallet's address."
    );
  }
  return result.address;
}

/**
 * Confirms the connection is actually safe to use for a sensitive action:
 * extension installed, this site allowed, and Freighter currently set to
 * the network this app expects (Stellar Testnet). Call this right before
 * anything that moves funds, not just once at page load — the person can
 * switch networks in Freighter at any time.
 */
export async function verifyWallet(): Promise<{ address: string; network: string }> {
  const installed = await isFreighterInstalled();
  if (!installed) {
    throw new WalletError("NOT_INSTALLED", "Freighter isn't installed.");
  }

  const allowed = await freighterIsAllowed();
  if (allowed.error || !allowed.isAllowed) {
    throw new WalletError("NOT_CONNECTED", "Connect your wallet first.");
  }

  const network = await getNetworkDetails();
  if (network.error) {
    throw new WalletError(
      "UNKNOWN",
      network.error.message ?? "Could not read the wallet's network."
    );
  }
  if (network.networkPassphrase !== EXPECTED_NETWORK_PASSPHRASE) {
    throw new WalletError(
      "WRONG_NETWORK",
      `Freighter is set to ${network.network}. Switch it to Test Net to use Bayanihan Rewards.`
    );
  }

  const addr = await getAddress();
  if (addr.error) {
    throw new WalletError(
      "UNKNOWN",
      addr.error.message ?? "Could not read the wallet's address."
    );
  }

  return { address: addr.address, network: network.network };
}

/**
 * Sends a built transaction's XDR to Freighter for the user to review and
 * sign, and returns the signed XDR — ready to hand to
 * stellar.ts#submitSignedTransaction.
 */
export async function signTransaction(transactionXdr: string): Promise<string> {
  const result = await freighterSignTransaction(transactionXdr, {
    networkPassphrase: EXPECTED_NETWORK_PASSPHRASE,
  });
  if (result.error) {
    const message = result.error.message ?? "Signing failed.";
    if (looksLikeUserRejection(message)) {
      throw new WalletError("USER_REJECTED", "Transaction was declined in Freighter.");
    }
    throw new WalletError("UNKNOWN", message);
  }
  return result.signedTxXdr;
}
