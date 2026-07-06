# Accept crypto (`payments.acceptCrypto`) — get paid USDC, non-custodially

Declare **one policy block** and your app can accept **USDC on Solana**, paid
**directly** into a wallet address you own. Bounded **verifies the payment
on-chain** and (optionally) **emails you** when it lands — but **never holds your
keys or funds** at any point.

```json
{
  "payments": {
    "acceptCrypto": {
      "settleTo": "89MCqR8aE7HfJudgDxD9ujsfRQvWw7kh44jXX1TA3wWB",
      "token": "usdc",
      "environment": "production",
      "notify": "seller@example.com"
    }
  }
}
```

- **`settleTo`** (required) — a base58 Solana address **you own**. This is where
  buyers pay **directly**. Paste your embedded-wallet address from
  [`auth.bounded.sh/wallet`](embedded-wallets.md#4-the-wallet-page-view-balance--send--cash-out),
  or any wallet / PDA. Bounded never touches this address's keys.
- **`token`** (required) — `"usdc"` (the only supported token in v1; on `staging`
  this is the Crossmint test stablecoin on devnet).
- **`environment`** (optional, default `"production"`) — `"staging"` verifies
  against Solana **devnet** (pairs with `auth.wallets: { environment: "staging" }`
  for testing); `"production"` verifies against **mainnet**.
- **`notify`** (optional) — an email that gets a branded "you received X USDC"
  message when a payment settles. Best-effort; it never blocks settlement.

> **What ships today:** the **direct-transfer rail** — a buyer pays your `settleTo`
> address directly with USDC, then your app submits the transaction to Bounded,
> which verifies it on-chain and records a settlement. **Fee is 0** on this rail
> (a direct transfer can't be split). A **credit-card → USDC** buyer rail (buyer
> pays by card / Apple Pay / Google Pay, seller still receives USDC to `settleTo`)
> also **exists** — it's built and staging-proven behind a platform flag, with
> production activation pending Crossmint commercial enablement. When it's on,
> **sellers change nothing** (see [§5](#5-the-card-rail-crossmint-checkout)).

`payments` is a **control-plane** policy block, like `openApps` / `boundaries`. It
adds **zero prover obligations** and does not change any of your collections or
rules — it just declares that your app accepts crypto.

---

## 1. Seller setup (three steps)

1. **Get an address to be paid at.** The easiest is your own Bounded embedded
   wallet: sign in at `auth.bounded.sh/wallet` and copy the address. (Any Solana
   address or PDA works — it just has to be one you control.)
2. **Declare it in `policy.json`** with the block above, then `bounded verify`
   and `bounded deploy`. Allow ~30-40s for the policy to take effect.
3. **Accept payments** via the intents API (below). Add `notify` if you want an
   email each time money lands.

That's the whole seller side. There is **no onboarding, no KYC, no account to
create** — because Bounded never custodies your funds; you already own the wallet.

---

## 2. The intents API (`/crypto/*` on the Bounded host)

The rail is a small, rail-agnostic **intent → verify → settled** pipeline. The
capability for every call is the **unguessable intent id** — there are no secrets.

Base URL: `https://host.bounded.sh` (production) / `https://host-staging.bounded.sh`
(staging). CORS is open to `*.bounded.page` and `bounded.sh`.

### Create an intent — `POST /crypto/intents`

```jsonc
// request
{ "appId": "<24-hex app id>", "amountUsdc": 5, "memo": "order-1234" }  // memo optional

// 200 response
{
  "intentId": "b1f0…-uuid",
  "settleTo": "89MCqR8a…",     // pay THIS address
  "token": "usdc",
  "environment": "production",
  "amount": 5,
  "feeBps": 0,
  "expiresAtMs": 1751830000000,
  "verifyUrl": "/crypto/intents/b1f0…-uuid/verify"
}
```

The intent just *names where and how much to pay*. If the app hasn't declared
`payments.acceptCrypto`, this returns **403 `crypto_not_enabled`** (fail-closed).

### Pay it

The buyer sends `amount` USDC to `settleTo` on Solana — from the Bounded
[wallet page](embedded-wallets.md#4-the-wallet-page-view-balance--send--cash-out),
from `signAndSubmitTransaction` in your app, or from **any** wallet. Bounded is not
in the money path; the transfer is buyer → seller directly. Capture the resulting
**transaction signature**.

### Verify + settle — `POST /crypto/intents/:id/verify`

```jsonc
// request
{ "txSignature": "4bWA6z3Z…base58…" }

// 200 response (settled)
{
  "intentId": "b1f0…", "appId": "…", "status": "settled",
  "amount": 5, "token": "usdc", "environment": "production",
  "settleTo": "89MCqR8a…",
  "feeBps": 0, "rail": "direct-transfer",
  "evidence": { "txSignature": "4bWA6z3Z…", "payer": "2fHvpS3W…", "paidUsd": 5, "verifiedAtMs": 175… },
  "settledAtMs": 175…,
  "notification": { "attempted": true, "ok": true }
}
```

Bounded verifies **on-chain** (the same checklist as the x402 rail): the transaction
is **finalized** and didn't error, the **amount received at `settleTo`** (post − pre
token balance for the correct mint/environment) is **at least** the intent amount,
and each **signature settles exactly one intent, globally** (replay-guarded).
FAIL-CLOSED: any uncertainty → no settlement. Re-verifying a settled intent returns
the same record (idempotent). Wrong amount → **402 `insufficient_payment`**; a
signature already used by another intent → **409 `signature_already_used`**; a
tx that isn't finalized yet → **402 `payment_not_final`** (retry shortly).

### Poll status — `GET /crypto/intents/:id`

Returns `{ status: "pending" | "settled", intent, settlement? }`. The seller's
`notify` email is never exposed here.

---

## 3. Fee semantics + the rail seam

- **`feeBps` is 0 on both rails today.** A buyer→seller transfer can't be split, so
  the direct-transfer rail takes nothing; the card rail (§5) is also non-custodial —
  Crossmint delivers USDC straight to `settleTo`, so there is no split point — and
  likewise records **`feeBps 0`**. The field exists so a rail that *does* support a
  platform-fee split can populate it later (mirrors Bounded Pay's 1% fiat fee).
  Bounded **never takes a fee by touching seller funds** post-settlement.
- **The rail seam.** Internally, settlement funnels through one function,
  `markSettled(intent, evidence)`. The direct-transfer rail calls it after on-chain
  verification; the **card rail** (a Crossmint checkout webhook, §5) calls the
  **same** function after **its own** verification (a signed delivery event),
  passing its own evidence — **without changing the policy block, the intent shape,
  or your setup.** Your `payments.acceptCrypto` declaration is rail-agnostic on
  purpose, so enabling the card rail is a platform flag, not a seller change.

---

## 4. Crypto vs. Bounded Pay (Stripe) — two separate, coexisting pipelines

Bounded has **two independent payment pipelines**. They never touch each other's
money or config, and **the same app can enable both**.

| | **Accept crypto** (this doc) | **Bounded Pay** ([bounded-pay.md](bounded-pay.md)) |
|---|---|---|
| Policy / setup | `payments.acceptCrypto` block; paste a wallet address | `/connect/*`; seller onboards a Stripe account |
| Money | Buyer pays **USDC** on Solana **directly to the seller's wallet** | Buyer pays by **card**; Stripe processes and pays out fiat |
| Bounded's role | **Verifies on-chain only** — never in the money path | **Platform** on a Stripe destination charge |
| Custody | **Non-custodial** (Bounded never holds funds/keys) | Stripe is money transmitter + merchant of record |
| Fee | **0** (direct transfer can't split) | **1%** platform fee + Stripe processing fees |
| Routes | `/crypto/*` | `/connect/*` |

**When to use which:** want to be paid in **stablecoin to a wallet you own**, with
zero fee and no onboarding → **accept crypto**. Want **card checkout with fiat
payouts** and are OK with Stripe onboarding + a 1% fee → **Bounded Pay**. Enabling
one has **no effect** on the other.

---

## 5. The card rail (Crossmint checkout)

A **credit-card → USDC** buyer flow — the buyer pays with a **card, Apple Pay, or
Google Pay** and the seller still receives **USDC to `settleTo`** — is **built and
staging-proven**, sitting behind a platform feature flag
(`CROSSMINT_CARD_RAIL_ENABLED`). It's **on in staging** (end-to-end proven) and
**off on production**, pending Crossmint **commercial enablement** (Crossmint must
grant the `orders.create` scope on the production key after a KYB + signed order
form). When that lands, flipping the flag turns it on — **no code or seller change.**

**For sellers, nothing changes.** You keep the **same `payments.acceptCrypto`
block** and the same setup. When a buyer chooses the card option, Bounded creates a
**Crossmint checkout order** that delivers USDC to your `settleTo`, and settlement
flows through the **exact same verify → `markSettled` seam** (§3) — the seller
notification email and settled record are **identical** to the direct rail. The rail
records **`rail: "crossmint-checkout"`, `feeBps: 0`** (non-custodial: Crossmint, a
licensed processor, charges the card and delivers USDC directly to the seller, so
there's no platform split point).

**For buyers,** the card flow runs in **Crossmint's embedded checkout** (card / Apple
Pay / Google Pay), which includes **Crossmint's own KYC** (a Persona identity flow)
as the regulated card→crypto gate. Bounded is never in the money path — Crossmint
settles USDC to the seller and signs a delivery webhook that Bounded verifies before
recording the settlement.

Under the hood (when the flag is on) `bounded-host` exposes
`POST /crypto/checkout` (create a Crossmint order for an intent),
`GET /crypto/checkout/:id` (the Bounded-hosted embedded checkout page), and
`POST /crypto/webhooks/crossmint` (the svix-signed `orders.delivery.completed`
webhook → `markSettled`). With the flag **off**, these routes are inert (checkout
`404`, webhook no-ops) and buyers simply pay USDC directly (the direct rail).

For card payments settling to **fiat** (not USDC), use
[Bounded Pay](bounded-pay.md) instead.

---

## 6. Signing + receiving — what a smart wallet can and can't do

Embedded wallets are Solana **smart wallets** (a smart *account*, not a raw
keypair), so a few semantics matter here:

- **Receiving needs no signing at all.** Being paid to `settleTo` is just an
  inbound transfer — nothing to authorize. Any seller wallet/PDA works.
- **Sending / paying** an intent is an **"approve an execution"** model:
  `signAndSubmitTransaction` (in-app) or the wallet page's **Send** — authorized by
  the user's **email-OTP-derived signer in the browser** (a Crossmint TEE iframe).
  This is **browser-only**; it cannot run headless / server-side.
- Smart wallets **cannot produce raw signatures** — `signMessage` and classic
  `signTransaction` are **unsupported** and throw an informative error. See
  [embedded-wallets.md §3](embedded-wallets.md#3-signing-with-the-wallet).
- **First signature on a device = two emailed codes** (sign-in + device confirm);
  after that a persisted session = **zero codes**.

---

## 7. Cash out

Cash-out today = **send USDC to your exchange deposit address** (Coinbase, Kraken,
…) from the [wallet page](embedded-wallets.md#4-the-wallet-page-view-balance--send--cash-out),
then withdraw to fiat there. A **native in-app fiat offramp** is future work: it
requires Bounded doing a one-time **platform KYB** with Crossmint plus **per-user
KYC** at cash-out time (Crossmint is the regulated party; Bounded stays
non-custodial). Until then, the send-to-exchange path is the supported story.
