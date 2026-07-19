# Deploying Bayanihan Rewards to Stellar Testnet

Every command below is checked against the current official Stellar CLI docs
(Stellar CLI v27.0.0) — not just recalled from memory. A few things changed
recently enough to be worth flagging up front:

- The wasm target is **`wasm32v1-none`**, not the older
  `wasm32-unknown-unknown`. Needs Rust **1.84+** (your `Cargo.toml` already
  declares `1.89.0`).
- `stellar contract build` now builds *and* optimizes in one step — no
  separate `cargo build` or `--optimize` flag needed.
- **State-changing invokes need `--send=yes`.** Without it, `stellar
  contract invoke` only simulates the call and prints what *would* happen —
  it won't actually write anything on-chain. It's a flag on `invoke` itself,
  so it goes **before** the `--` separator, alongside `--id`,
  `--source-account`, and `--network` — not after it with the function's
  own arguments. Putting it after `--` makes the CLI try to match it
  against the function's own parameters and fail with something like
  `unexpected argument '--send' found`.
- CLI flag names are auto-generated from the contract's Rust parameter
  names, and they keep their underscores as-is — `token_id` becomes
  `--token_id`, not `--token-id`. If a flag below doesn't match, the CLI is
  self-documenting: append `-- <function> --help` before running the real
  call, e.g. `stellar contract invoke --id bayanihan-rewards --source-account
  admin --network testnet -- initialize --help`.
- **Every command below uses literal, pasted-in values — no `$(...)`
  substitution.** That bash/PowerShell syntax doesn't exist in Windows
  Command Prompt (`cmd.exe`), where it silently gets split into garbage
  extra arguments instead of erroring clearly. Pasting real values works
  identically in cmd, PowerShell, and Git Bash, so that's what's used
  throughout.
- **Don't skip a deploy step.** `stellar contract asset deploy` (Step 4,
  the BAYANI token) and `stellar contract deploy` (Step 3, the Bayanihan
  Rewards contract itself) are two different contracts — both need to run,
  in order, or the alias for whichever one you skipped won't exist yet and
  every later step referencing it will fail with `contract not found`.

I can't run any of this myself — this sandbox has no network path to Stellar's
testnet/RPC/Friendbot, and (as covered when we built the contract) no working
Rust+wasm toolchain either. Everything below is meant to run on your own
machine.

---

## 0. Prerequisites

Check what you've already got:
```
rustc --version
rustup target list --installed
stellar --version
```
You need `rustc` 1.84.0+, `wasm32v1-none` in the installed targets list, and
`stellar` 27.x. Fix whichever is missing:
```
rustup update
rustup target add wasm32v1-none
```

**Stellar CLI (Windows):**
```
winget install --id Stellar.StellarCLI
```
Alternative: download the installer from
https://github.com/stellar/stellar-cli/releases/latest, double-click it, then
restart your terminal.

---

## 1. Set up identities

```
stellar keys generate admin --network testnet --fund
stellar keys generate bayani-issuer --network testnet --fund
stellar keys generate citizen-test --network testnet --fund
```
If a name already exists from an earlier session, that's fine — it's still a
valid funded identity, no need to regenerate it. Get its address any time
with `stellar keys address <name>`.

Write down every address you get back before moving on — every command
below needs one pasted in, and copy-paste is the only reliable way to avoid
typos in a 56-character key.

---

## 2. Build the contract

```
cd contracts/bayanihan-rewards
stellar contract build
```
Output lands at `target\wasm32v1-none\release\bayanihan_rewards.wasm`
(Windows path separators — adjust to `/` if you're building from macOS/Linux
or WSL).

---

## 3. Deploy the Bayanihan Rewards contract

```
stellar contract deploy --wasm target\wasm32v1-none\release\bayanihan_rewards.wasm --source-account admin --network testnet --alias bayanihan-rewards
```
Prints a Contract ID starting with `C...` — **save it**, that's your
`SOROBAN_CONTRACT_ID`. The `--alias` lets every later command refer to it as
`bayanihan-rewards` instead of the full ID.

---

## 4. Get a BAYANI token to initialize with

The contract's `initialize` needs a `token_id` — the address of a deployed
Stellar Asset Contract (SAC). This is the minimum needed to get the contract
running end to end today; the fuller BAYANI asset architecture (separate
issuer/distribution accounts, citizen trustline flow, redemption) is still
its own piece, so treat this as scaffolding, not the final design.

First get the issuer's address:
```
stellar keys address bayani-issuer
```
Then paste it into the asset code (format is `CODE:ISSUER_ADDRESS`):
```
stellar contract asset deploy --source-account bayani-issuer --network testnet --asset BAYANI:<paste bayani-issuer's address here> --alias bayani
```
Prints another `C...` Contract ID — that's your `token_id`.

---

## 5. Initialize Bayanihan Rewards

Get the address you want stored as admin (pick one identity and use it for
both `--source-account` and `--admin` below, so they match):
```
stellar keys address admin
```
Then:
```
stellar contract invoke --id bayanihan-rewards --source-account admin --network testnet --send=yes -- initialize --admin <paste admin's address here> --token_id <paste the bayani token's C... address from step 4 here>
```

---

## 6. Fund the contract's BAYANI balance

`claim_reward` pays out of the contract's own balance, so it needs BAYANI
before anyone can claim anything. Paste in the `bayanihan-rewards` Contract
ID from step 3:
```
stellar contract invoke --id bayani --source-account bayani-issuer --network testnet --send=yes -- mint --to <paste the bayanihan-rewards C... address from step 3 here> --amount 1000000
```

---

## 7. Smoke-test the whole flow

Get the test participant's address first:
```
stellar keys address citizen-test
```

```
stellar contract invoke --id bayanihan-rewards --source-account admin --network testnet --send=yes -- create_campaign --organizer <admin's address> --title "Barangay Clean-Up Drive" --reward_amount 50 --max_participants 0
```
Note the campaign id it returns (starts at `0`).

```
stellar contract invoke --id bayanihan-rewards --source-account citizen-test --network testnet --send=yes -- join_campaign --participant <citizen-test's address> --campaign_id 0

stellar contract invoke --id bayanihan-rewards --source-account admin --network testnet --send=yes -- verify_participant --organizer <admin's address> --campaign_id 0 --participant <citizen-test's address>

stellar contract invoke --id bayanihan-rewards --source-account admin --network testnet --send=yes -- issue_reward --organizer <admin's address> --campaign_id 0 --participant <citizen-test's address>
```

**Before claiming, the participant needs a trustline to BAYANI.** A classic
Stellar account can't hold a custom asset until it opts in — without this,
`claim_reward` fails with a "trustline entry is missing" error from the
token contract (not a bug in `lib.rs`). Paste in `bayani-issuer`'s address
from step 4:
```
stellar tx new change-trust --source-account citizen-test --network testnet --line BAYANI:<paste bayani-issuer's address from step 4 here>
```
This is a real product requirement, not just a test-setup step — any
citizen using the live app will need a BAYANI trustline before their first
claim, which the Reward Wallet page will need to prompt for via Freighter.

```
stellar contract invoke --id bayanihan-rewards --source-account citizen-test --network testnet --send=yes -- claim_reward --participant <citizen-test's address> --campaign_id 0
```

Read-only checks (no `--send=yes` needed):
```
stellar contract invoke --id bayanihan-rewards --source-account admin --network testnet -- get_campaign --campaign_id 0

stellar contract invoke --id bayani --source-account admin --network testnet -- balance --id <citizen-test's address>
```
The second one should show `50` — proof the whole join → verify → issue →
claim cycle actually moved tokens.

---

## 8. Save these for later

Add to your `.env`:
```
NEXT_PUBLIC_STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_CONTRACT_ID=<the C... address from step 3>
```
And note down the `bayani` token contract ID too — the backend API routes
will need it once the frontend gets wired up to this deployed contract.

---

## Troubleshooting

- **`"trustline entry is missing for account"`** → the receiving account
  hasn't opted in to hold BAYANI yet. Run `stellar tx new change-trust
  --source-account <name> --network testnet --line BAYANI:<issuer address>`
  for that account first. Check *which* contract the error names in the
  diagnostic events before assuming it's one of `lib.rs`'s own `Error`
  codes — a coincidentally-matching number from the token contract's error
  enum is not the same thing as ours.
- **`contract not found: <alias>`** → that alias was never actually
  deployed — check you ran the matching `stellar contract deploy` or
  `stellar contract asset deploy` step, not just `build`.
- **`unexpected argument '--send' found`** → `--send=yes` is in the wrong
  place. It belongs before the `--` separator (it's a flag on `invoke`
  itself), not after it with the function's own arguments.
- **`error: unexpected argument found` referencing a flag with a hyphen
  where the contract uses an underscore** → contract flags keep the
  underscore from the Rust parameter name (`--token_id`, `--campaign_id`,
  not `--token-id`/`--campaign-id`).
- **"Nothing happened" after an invoke** → missing `--send=yes` (in the
  right place — see above); it only simulated.
- **`Error(Contract, #6)` on `create_campaign`/etc.** → that's
  `Error::CampaignFull` per `lib.rs` — check the error code against the enum
  in the contract (codes 1-13, in declaration order).
- **Flags don't match what's above** → append `-- <function> --help` before
  `--send=yes` and use the flag names it reports.
- **`$(...)` fails with "unexpected argument"** → that's Command Prompt
  rejecting bash-style substitution. Paste the literal value instead — see
  the note at the top.
- **Emojis show as `?` in the CLI output** → cosmetic only (PowerShell/cmd
  don't render them); switch to Windows Terminal if it bothers you.
