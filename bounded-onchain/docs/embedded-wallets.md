# Embedded wallets (`auth.wallets`) — the canonical login: a wallet on every login

**This is the canonical Bounded login.** Turn on one policy flag and **every
email-carrying login also gets a non-custodial Solana wallet**, with its address
exposed to your rules as `@user.address`. This is the "wallets all around" model: a
plain email/social/`web_login` user gets a real wallet automatically — no seed
phrase, no extension, no leaving the email flow — while keeping a stable account
identity (`@user.id`), and Bounded **never holds the key**. Keep it on for any app
that touches wallets, tokens, or onchain state (most Bounded apps); a purely offchain
app may leave it off, and its users simply have `@user.address == null`.

Wallets are **Crossmint** smart wallets with an **email admin signer**. The user
authorizes signatures client-side (email OTP / passkey via Crossmint); Bounded's
server can create-or-fetch the wallet and read its address but **cannot sign** —
custody stays with the user.

> **What ships today:** provisioning + `@user.address` population, client-side
> **signing of app-built transactions** — a logged-in email user can build a real
> Solana transaction in your app and approve+submit it with their wallet via
> `signAndSubmitTransaction`, getting the on-chain hash back
> (see [§3 Signing](#3-signing-with-the-wallet); **proven end-to-end through the
> published `@bounded-sh/client` 0.0.38+**) — **and** a hosted **wallet page** to view
> balance / send tokens at `auth.bounded.sh/wallet`
> (see [§4 The wallet page](#4-the-wallet-page-view-balance--send--cash-out)).
> Everything runs in a Bounded-hosted surface; Bounded still never holds the key.

> **Want to get PAID (accept USDC to a wallet you own, non-custodially)?** That's a
> separate policy block — see **[accept-crypto.md](accept-crypto.md)**
> (`payments.acceptCrypto`). Receiving funds needs no signing at all.

> **Want users to bring their OWN wallet instead?** If your users already have a
> Solana wallet (Phantom / any Wallet-Standard wallet) and you want them to **log in
> with it** — their real wallet as `@user.address`, a full local signing surface
> (`signMessage` / `signTransaction` / `signAndSubmitTransaction`, no popup) — that's
> **wallet login** (`init({ authMethod: 'phantom', walletLogin: true })`), a different
> feature from this one. `auth.wallets` here gives an **email** user an **embedded**
> (Crossmint) smart wallet with no wallet of their own; wallet login lets a
> wallet-holding user sign in with their **real** wallet. They're independent and can
> coexist — a wallet-login user's real `@user.address` is **not** overwritten by
> `auth.wallets`. Full comparison + code:
> [auth.md → Solana wallet login (bring your own)](../../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own).

---

## The recommended login for an onchain app

For any app that touches wallets, tokens, or onchain state (most onchain apps), this
is the **prescribed default login** — turn on `auth.wallets` and offer **two** ways
in, side by side, so every user lands with a usable wallet no matter how they arrive:

1. **Email / social — the primary path.** With `auth.wallets` on, a normal Bounded
   Auth login auto-provisions a non-custodial **Crossmint** wallet. Most users pick
   this: no wallet software, no seed phrase. `@user.id` is their account id and
   `@user.address` is the Crossmint wallet.
2. **Connect wallet — the companion path.** For users who already hold a Solana
   wallet, add **wallet login** so they sign in with their **real** wallet (SIWS).
   `@user.address` is that real wallet, and `auth.wallets` never overwrites it.

The one policy change that turns the primary path on:

```json
{ "auth": { "wallets": true } }
```

Client — the primary path is the default `init`; the companion is opt-in via
`walletLogin`:

```ts
import { init, loginWithRedirect, completeLoginFromRedirect } from "@bounded-sh/client";

await init({ appId: "<APP_ID>" });      // Bounded Auth (email/social); auth.wallets gives each a Crossmint wallet
await completeLoginFromRedirect();       // finish a hosted return on app load
loginWithRedirect({ methods: ["email", "google", "apple"] });   // the primary "Sign in" button
```

For the **Connect wallet** companion (a real Solana wallet, injected + mobile), see
[auth.md → Solana wallet login (bring your own)](../../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own)
and enable it with `walletLogin: true`. Whichever way a user signs in, **key
ownership and identity on `@user.id`** (always present, no first-login lag) and use
`@user.address` only for wallet / onchain semantics.

---

## 0. Turn it on (the canonical config)

Add a top-level `auth` block to `policy.json`:

```json
{
  "auth": { "wallets": true },
  "notes/$id": {
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.owner == @user.address"
    },
    "fields": { "owner": "String", "text": "String" }
  }
}
```

`"wallets": true` provisions against **Crossmint production** (real wallets — the
default, because real wallets are the product). Without the flag, nothing changes:
no wallet is created, `@user.address` stays `null` for email logins, and existing
apps are completely unaffected. The flag travels in your deployed policy, so it's
version-locked and re-provisions on change.

### Choosing the Crossmint environment (test vs real)

The Crossmint environment is a **policy setting**, not tied to your Bounded
environment — so you can test the full flow against Crossmint **staging** while
running on Bounded production, then flip one line to go live:

```json
{ "auth": { "wallets": { "environment": "staging" } } }      // Crossmint STAGING wallets
{ "auth": { "wallets": { "environment": "production" } } }   // Crossmint PRODUCTION wallets
{ "auth": { "wallets": true } }                              // shorthand for production
```

Staging and production are **separate Crossmint worlds** — the same user gets a
**different** `@user.address` in each. Flipping `environment` re-provisions the user
into the other world on their next login (their staging wallet and production wallet
are distinct addresses).

## 1. What the user gets

On the next login of any **email-carrying** session (email OTP, social/OAuth, or a
hosted `web_login`), the issuer get-or-creates the user's wallet and stamps its
address into the token. In your app and rules:

```ts
import { init, getCurrentUser } from '@bounded-sh/client'
await init({ appId: '<APP_ID>' })
const me = getCurrentUser()
me.address   // e.g. "6dXW1PpGytekwU2THryxHxRYGEDZx2pXqGambrMsfAuk" — their Solana wallet
me.id        // unchanged — the universal @user.id (Better Auth account id)
```

- **One wallet per identity, platform-wide.** The wallet is keyed to the user's
  email at Crossmint, so the **same user gets the same address across every Bounded
  app** that enables wallets (in the same Crossmint environment).
- **Idempotent + stable.** Re-login returns the same address; a token refresh keeps
  the `@user.address` claim.
- **Scope:** wallets attach to **email-carrying** logins only. A pure guest
  (anonymous) or phone-only session has no email signer, so it gets no embedded
  wallet (a guest already has its own keypair `@user.address`).

## 2. Use `@user.address` in rules

With wallets on, `@user.address` is a first-class ownership key for email users:

```json
"create": "@user.address != null && @newData.owner == @user.address"
```

The document is owned by the wallet address; only that user can create their own
rows, and no one can forge another's (a mismatched `owner` is rejected). The
`@user.address != null` guard is mandatory — it keeps an unauthenticated caller from
satisfying `null == null`.

> **Without `auth.wallets`, keep using `@user.id`.** For apps that do NOT enable
> wallets, email/social users have `@user.address == null`, so ownership rules must
> use `@user.id` (always present). Enabling `auth.wallets` is exactly what makes
> `@user.address` safe to key on for email users. See
> [auth.md → How `@user.*` reaches your rules](../../bounded-frontend/docs/auth.md#how-user-reaches-your-rules).

## 3. Signing with the wallet

An email user with `@user.address` can **approve and submit** a Solana transaction
your app builds, with their embedded wallet, from any app on any origin. This is
**proven end-to-end** through the published `@bounded-sh/client` (0.0.38+) — the app
builds a transaction and gets back a real, on-chain tx hash:

```ts
import { signAndSubmitTransaction, getCurrentUser } from '@bounded-sh/client'
import {
  PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, Connection,
} from '@solana/web3.js'

// Call from a USER GESTURE (click/tap) — signing opens a popup.
async function onClick() {
  const me = getCurrentUser()                     // me.address === the smart wallet
  const owner = new PublicKey(me.address)
  const conn = new Connection('https://api.devnet.solana.com')  // staging = devnet
  const { blockhash } = await conn.getLatestBlockhash()

  // Build a v0 transaction with the SMART WALLET as the fee payer + as the account
  // your instructions reference. Crossmint extracts the instructions, sponsors the
  // fee, and re-wraps them for the smart wallet (see requirements below).
  const ix = SystemProgram.transfer({ fromPubkey: owner, toPubkey: owner, lamports: 0 })
  const msg = new TransactionMessage({
    payerKey: owner, recentBlockhash: blockhash, instructions: [ix],
  }).compileToV0Message()
  const tx = new VersionedTransaction(msg)

  const hash = await signAndSubmitTransaction(tx)  // resolves with the on-chain tx hash
  console.log('submitted', hash)                   // verify on the devnet explorer
}
```

How it works: signing runs in a **Bounded-hosted popup** (`auth.bounded.sh/wallet/signer`)
that loads Crossmint's client SDK. The user does a one-time email verification (Crossmint
sign-in code, then a "confirm it's you" code the first time on a new device); after that,
the session is remembered on that device and later signs need no code. Bounded never holds
the key — the codes go to the user's email, and the popup refuses to sign unless the wallet
matches the signed-in account.

### Transaction-building requirements (what the smart wallet accepts)

Crossmint smart wallets are **PDA (program) accounts**, not plain keypairs. When you
`signAndSubmitTransaction(tx)`, Crossmint takes your transaction's **instructions**,
puts its own sponsor as the on-chain fee payer, and re-wraps everything for the smart
wallet's execution. So build your transaction like this:

- **Set the fee payer / `payerKey` to the smart wallet address** (`@user.address`).
  Crossmint overrides the actual on-chain fee payer to its gas sponsor, but the
  instructions must reference the smart wallet as the acting account.
- **Do NOT pre-sign** and do NOT add other signers. The smart wallet signs on the
  popup; the SDK serializes your unsigned tx. (Multi-sig / co-signer / a different
  fee-payer keypair does **not** map onto the single-smart-wallet execution model —
  that's why routing Bounded's own on-chain program writes through Crossmint is a
  separate, harder problem.)
- **A recent blockhash is required** to build a valid v0 message, but its exact value
  isn't load-bearing (Crossmint rebuilds the wrapped tx server-side).
- Legacy `Transaction` and `VersionedTransaction` are both accepted; v0 is preferred.
- The SDK sends the serialized transaction **base58-encoded** (Crossmint's endpoint
  rejects base64). This is handled for you — just build a normal web3.js transaction.

**Supported vs not:**

- ✅ `signAndSubmitTransaction(tx)` — the primary API: signs **and submits** an
  app-built transaction atomically, returns the on-chain hash. Crossmint Solana
  **smart wallets** sign+submit as one step (gasless / sponsor-paid).
- ✅ Sending a token is a common special case — you can build an SPL/`SystemProgram`
  transfer and pass it to `signAndSubmitTransaction`, or use the hosted
  **wallet page** (§4) which has a ready-made Send form.
- ❌ `signMessage(msg)` and `signTransaction(tx)` (sign without submit) **throw** a clear
  "unsupported for embedded smart wallets — use signAndSubmitTransaction" error. Smart
  wallets cannot produce a raw detached signature, by design. **If you need raw
  signatures**, use **wallet login** instead (`authMethod: 'phantom'`, `walletLogin: true`)
  — a real keypair wallet whose `signMessage` / `signTransaction` work locally
  ([auth.md → Solana wallet login](../../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own)).
- ❌ No `auth.wallets`, or a non-wallet login → signing throws an informative error telling
  you to enable wallets (or use **wallet login** for raw-signature / wallet-native apps).

### When to use which

- **`signAndSubmitTransaction(tx)` (SDK)** — your app builds the exact transaction
  (any instruction: transfers, program calls) and wants the hash back in code. This
  is the golden path; use it whenever the app authors the transaction.
- **The hosted wallet page (§4)** — no code: the user views balance and sends tokens
  with a ready-made form. Use it for "let the user manage their wallet" surfaces.
- **`signMessage`/`signTransaction`** — not available on embedded smart wallets. If
  you need raw signatures, use **wallet login** (`authMethod: 'phantom'`,
  `walletLogin: true`) — a real keypair wallet — instead
  ([auth.md → Solana wallet login](../../bounded-frontend/docs/auth.md#solana-wallet-login-bring-your-own)).

**Gotchas:**

- **Call from a user gesture.** A blocked popup rejects with a clear "Popup blocked —
  call signAndSubmitTransaction() from a user gesture" error.
- **First sign asks for two codes** (Crossmint sign-in + a 9-digit device confirmation);
  subsequent signs on the same device/browser ask for none until the session expires.
- **First login on a fresh email may not have `@user.address` yet.** Provisioning the
  Crossmint wallet takes a few seconds — longer than the login's fail-open budget — so
  it's created in the background and appears on the user's **next** login (the login
  always succeeds; the wallet claim just lands a beat later). Guard your sign button on
  `getCurrentUser()?.address` and prompt a quick re-login if it's still `null`.
- Works from **any app origin** — the popup is on Bounded's origin, so your app never ships
  the Crossmint key and no per-app origin setup is needed.

## 4. The wallet page (view balance · send · cash out)

Bounded hosts a ready-made page where a user can **see their embedded-wallet
balance and send tokens** — no code to write:

```
https://auth.bounded.sh/wallet                 # Crossmint production wallets (default)
https://auth.bounded.sh/wallet?env=staging     # Crossmint staging (test) wallets
```

- **Sign in with your email** (the one your wallet is attached to). If you're already
  logged into a Bounded app on `auth.bounded.sh`, the page **prefills** that email; you
  still complete the Crossmint email code, so Bounded never holds the key.
- **Balance** — shows `USDC` and `SOL` (plus `USDXM`, the Crossmint test stablecoin, on
  staging). On staging a **Fund test tokens** button drips test USDXM for trying the flow.
- **Send** — pick a token, paste a recipient Solana address, enter an amount; the page runs
  the same non-custodial approval as `signAndSubmitTransaction` (an emailed code on first use)
  and shows the **submitted transaction hash + an explorer link**.
- The cloud dashboard (`dashboard.bounded.sh`) links to it from the header (**Wallet**).

### Cash out / offramp

There is **no built-in fiat offramp yet**. The honest interim path, shown in the page's
**Cash out** box: **send USDC to your exchange or on-ramp deposit address** (Coinbase,
Kraken, etc.) with the Send box, then withdraw to fiat there. A native offramp is a KYC/KYB
-gated Crossmint server product (not exposed to the client wallet SDK), planned for a later
slice — until then, "send to your exchange address" is the supported cash-out story.

## 5. Non-custody guarantees

- The wallet's **only** admin signer is the user's **email** — Bounded never
  requests a server/api-key signer and never attaches delegated signers.
- Bounded's server key can create-or-fetch the wallet and read its address; it
  **cannot** move funds. Every transfer requires the user's client-side Crossmint
  authorization (email OTP / passkey).
- Provisioning is **best-effort and fail-open**: the login never blocks on wallet
  creation. On a **brand-new email**, creating the Crossmint wallet takes a few
  seconds — longer than the login's short provisioning budget — so the wallet is
  created in the background and `@user.address` appears on the user's **next** login.
  The first login always succeeds; it just may not carry the wallet claim yet. (If
  Crossmint is unreachable it's the same story: log in without a wallet, retry next
  time.) Guard sign actions on `getCurrentUser()?.address`.

## Gotchas

- Wallets ride the **`auth.wallets`** flag — it's the canonical config, but a purely
  offchain app can leave it off, in which case no wallet is created and
  `@user.address` stays `null` for email logins.
- **Solana only** in v1.
- **Email-carrying logins only** — phone-only / guest sessions get no embedded wallet.
- `environment` **staging ≠ production** — switching it gives the user a different
  address (separate Crossmint worlds).
- **Signing is `signAndSubmitTransaction` only** — `signMessage` / `signTransaction`
  throw (smart wallets sign+submit atomically). See [§3 Signing](#3-signing-with-the-wallet).
- **Build the tx with the smart wallet as fee payer, unsigned, no extra signers** —
  Crossmint re-wraps the instructions for the smart wallet (§3 requirements).
- **Signing needs a user gesture** (opens a popup) and a one-time email verification per
  device (first sign = two codes; then none).
- **First login on a fresh email may lack `@user.address`** (background provisioning) —
  it lands on the next login; guard sign actions on `getCurrentUser()?.address`.
