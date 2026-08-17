# Accept crypto (`payments.acceptCrypto`) - get paid USDC, non-custodially

Declare **one policy block** and your app can accept **USDC on Solana**, paid
**directly** into a wallet address you own. Bounded **verifies the payment
on-chain** and (optionally) **emails you** when it lands - but **never holds your
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

- **`settleTo`** (required) - a base58 Solana address **you own**. This is where
  buyers pay **directly**. Paste your embedded-wallet address from
  [`auth.bounded.sh/wallet`](embedded-wallets.md#turnkey-login-and-signing),
  or any wallet / PDA. Bounded never touches this address's keys.
- **`token`** (required) - `"usdc"` (the only supported token in v1; staging
  uses the platform's configured devnet test mint).
- **`environment`** (optional, default `"production"`) - `"staging"` verifies
  against Solana **devnet**; `"production"` verifies against **mainnet**. Wallet
  provisioning does not have an environment selector.
- **`notify`** (optional) - an email that gets a branded "you received X USDC"
  message when a payment settles. Best-effort; it never blocks settlement.

The `payments.acceptCrypto` token registry is separate from TokenPlugin constants.
Its staging `"usdc"` value means the platform-configured devnet test stablecoin.
`@TokenPlugin.USDC` is mainnet-only and is unsupported for TokenPlugin operations on devnet.
Use an app-created devnet mint for TokenPlugin labs, but do not substitute that mint into the v1 payment rail.

> **What ships today:** the **direct-transfer rail** - a buyer pays your `settleTo`
> address directly with USDC, then your app submits the transaction to Bounded,
> which verifies it on-chain and records a settlement. **Fee is 0** on this rail
> (a direct transfer can't be split). For card payments with fiat settlement,
> integrate a card provider directly from a Function.

`payments` is a **control-plane** policy block, like `openApps` / `boundaries`. It
adds **zero prover obligations** and does not change any of your collections or
rules - it just declares that your app accepts crypto.

---

## 1. Seller setup (three steps)

1. **Get an address to be paid at.** The easiest is your own Bounded embedded
   wallet: sign in at `auth.bounded.sh/wallet` and copy the address. (Any Solana
   address or PDA works - it just has to be one you control.)
2. **Declare it in `policy.json`** with the block above, then `bounded verify`
   and `bounded deploy`. Allow ~30-40s for the policy to take effect.
3. **Accept payments** via the intents API (below). Add `notify` if you want an
   email each time money lands.

That's the whole seller side. There is **no onboarding, no KYC, no account to
create** - because Bounded never custodies your funds; you already own the wallet.

---

## 2. The intents API (`/crypto/*` on the Bounded host)

The rail is a small, rail-agnostic **intent → verify → settled** pipeline. The
capability for every call is the **unguessable intent id** - there are no secrets.

Base URL: `https://host.bounded.sh` (production) / `https://host-staging.bounded.sh`
(staging). CORS is open to `*.bounded.page` and `bounded.sh`.

### Create an intent - `POST /crypto/intents`

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

The buyer sends `amount` USDC to `settleTo` on Solana - from the Bounded
[wallet page](embedded-wallets.md#turnkey-login-and-signing),
from `signAndSubmitTransaction` in your app, or from **any** wallet. Bounded is not
in the money path; the transfer is buyer → seller directly. Capture the resulting
**transaction signature**.

### Verify + settle - `POST /crypto/intents/:id/verify`

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

> **Bind each payment to its order with a per-order reference.** On its own,
> verification proves only that *some* payment of the right amount reached `settleTo`
> and that each signature settles one intent - **not** that the payment was made *for
> this order*. Because every order shares one `settleTo`, two pending orders for the
> same amount are otherwise indistinguishable (whoever calls `/verify` first claims a
> given on-chain payment), and a unique-amount trick does **not** help - an attacker can
> match the amount. Close the gap with a **per-order reference** the app controls:
> generate an unguessable reference per order, record it server-side, require the
> buyer's transfer to carry it, and settle an order only against a transaction that
> carries *that order's* reference.

**Per-order reference binding** (app-side, works today - layer it on top of `/verify`):

```ts
import { Connection, Keypair } from "@solana/web3.js";

// 1. Create the order server-side with an unguessable per-order reference. Keep
//    `reference` out of any collection other users can read: it is the token that
//    decides which order a payment belongs to.
const reference = Keypair.generate().publicKey.toBase58(); // Solana Pay-style reference
await ctx.bounded.set(`orders/${orderId}`, {
  buyer: ctx.user.id, amountUsdc: 5, reference, status: "pending",
});

// 2. The buyer includes `reference` as a read-only account (Solana Pay reference)
//    in the USDC transfer to `settleTo`, submits it, and captures the signature.

// 3. Check the reference BEFORE calling /verify. /verify is what marks an intent
//    settled and burns that signature globally, so verifying first can attach a
//    payment made for another order to THIS intent - the real payer then gets
//    409 signature_already_used and their order can never settle.
const order = await ctx.bounded.get(`orders/${orderId}`);
if (order.status !== "pending") throw new Error("order is not pending");

// The RPC host has to be declared in `boundaries.egress`, or the read is refused.
const connection = new Connection(RPC_URL, "finalized");
const tx = await connection.getTransaction(txSignature, {
  commitment: "finalized",
  maxSupportedTransactionVersion: 0,
});
// Only STATIC account keys are inspected, so a reference smuggled through an address
// lookup table reads as absent and is refused - have the buyer attach it directly.
const carriesReference = tx?.transaction.message
  .getAccountKeys()
  .staticAccountKeys.some((key) => key.toBase58() === order.reference);
if (!carriesReference) throw new Error("payment is not for this order");

// 4. Only now settle, then grant the entitlement and flip the order to "settled" in
//    ONE atomic ctx.bounded batch, so a replayed call cannot grant twice.
const verified = await fetch(`${HOST}/crypto/intents/${intentId}/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ txSignature }),
}).then((res) => res.json());
if (verified.status !== "settled") throw new Error("not settled");
```

Verification still enforces the amount, finality, and one-signature-per-intent
replay guard; the per-order reference is the app-side layer that binds the accepted
payment to the specific order before any value is released.

### Poll status - `GET /crypto/intents/:id`

Returns `{ status: "pending" | "settled", intent, settlement? }`. The seller's
`notify` email is never exposed here.

---

## 3. Fee semantics

- **`feeBps` is 0.** A buyer-to-seller transfer cannot be split, so the direct
  transfer rail takes nothing. The field leaves room for a future rail that can
  support a platform-fee split. Bounded never takes a fee by touching seller
  funds after settlement.
- Internally, verified settlement funnels through `markSettled(intent,
  evidence)`. Treat the current public surface as direct transfer only.

---

## 4. Crypto and direct card providers

The managed crypto rail verifies direct USDC transfers to the seller's wallet.
For card payments or fiat payouts, integrate the chosen provider directly from
a Function using app secrets.
Keep provider settlement idempotent and grant app value only after trusted
server-side verification.

---

## 5. Signing and receiving with Turnkey

Embedded wallets are Turnkey-backed Solana wallets. A few semantics matter here:

- **Receiving needs no signing at all.** Being paid to `settleTo` is just an
  inbound transfer - nothing to authorize. Any seller wallet/PDA works.
- **Sending or paying** an intent uses `signAndSubmitTransaction` in the app.
- Turnkey also supports raw `signMessage` and `signTransaction` through the
  normal auth provider. Each signing action requires user approval in the
  Bounded signer window.
- Browser signing is interactive. It is not a headless server signer.

---

## 6. Cash out

Cash-out today = **send USDC to your exchange deposit address** (Coinbase, Kraken,
...) from the [wallet page](embedded-wallets.md#turnkey-login-and-signing),
then withdraw to fiat there. A native in-app fiat offramp is future work. Until
then, the send-to-exchange path is the supported story.
