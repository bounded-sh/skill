# Embedded wallets (`auth.wallets`) — a wallet on every login

Turn on a policy flag and **every email-carrying login also gets a non-custodial
Solana wallet**, with its address exposed to your rules as `@user.address`. This is
the "wallets all around" model: a plain email/social/`web_login` user — who normally
has **no** wallet — gets one automatically, and Bounded **never holds the key**.

Wallets are **Crossmint** smart wallets with an **email admin signer**. The user
authorizes signatures client-side (email OTP / passkey via Crossmint); Bounded's
server can create-or-fetch the wallet and read its address but **cannot sign** —
custody stays with the user.

> **What ships today:** provisioning + `@user.address` population **and** client-side
> **signing** — a logged-in email user can approve transactions with their wallet from
> your app via `signAndSubmitTransaction` (see [§3 Signing](#3-signing-with-the-wallet)).
> Signing runs in a Bounded-hosted popup; Bounded still never holds the key.

---

## 0. Opt in (wallets are OFF by default)

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
> [auth.md → How `@user.*` reaches your rules](auth.md#how-user-reaches-your-rules).

## 3. Signing with the wallet

An email user with `@user.address` can **approve and submit** a Solana transaction
with their embedded wallet, from any app on any origin:

```ts
import { signAndSubmitTransaction } from '@bounded-sh/client'
import { VersionedTransaction } from '@solana/web3.js'

// Build your Solana transaction (instructions from the smart wallet address).
// Call from a USER GESTURE (click/tap) — signing opens a popup.
async function onClick(tx: VersionedTransaction) {
  const signature = await signAndSubmitTransaction(tx)   // resolves with the tx hash
  console.log('submitted', signature)
}
```

How it works: signing runs in a **Bounded-hosted popup** (`auth.bounded.sh/wallet/signer`)
that loads Crossmint's client SDK. The user does a one-time email verification (Crossmint
sign-in code, then a "confirm it's you" code the first time on a new device); after that,
the session is remembered on that device and later signs need no code. Bounded never holds
the key — the codes go to the user's email, and the popup refuses to sign unless the wallet
matches the signed-in account.

**Supported vs not:**

- ✅ `signAndSubmitTransaction(tx)` — signs **and submits** atomically, returns the hash.
  Crossmint Solana **smart wallets** sign+submit as one step (they're gasless-capable).
- ❌ `signMessage(msg)` and `signTransaction(tx)` (sign without submit) **throw** a clear
  "unsupported for embedded smart wallets — use signAndSubmitTransaction" error. Smart
  wallets cannot produce a raw detached signature, by design.
- ❌ No `auth.wallets`, or a non-wallet login → signing throws an informative error telling
  you to enable wallets (or use a wallet provider like Phantom for raw-signature apps).

**Gotchas:**

- **Call from a user gesture.** A blocked popup rejects with a clear "call from a click
  handler" error.
- **First sign asks for two codes** (Crossmint sign-in + device confirmation); subsequent
  signs on the same device/browser ask for none until the session expires.
- Works from **any app origin** — the popup is on Bounded's origin, so your app never ships
  the Crossmint key and no per-app origin setup is needed.

## 4. Non-custody guarantees

- The wallet's **only** admin signer is the user's **email** — Bounded never
  requests a server/api-key signer and never attaches delegated signers.
- Bounded's server key can create-or-fetch the wallet and read its address; it
  **cannot** move funds. Every transfer requires the user's client-side Crossmint
  authorization (email OTP / passkey).
- Provisioning is **best-effort and fail-open**: if Crossmint is unreachable, the
  login still succeeds *without* a wallet claim and the next login retries — a
  wallet hiccup never blocks a user from signing in.

## Gotchas

- Wallets are **opt-in** — no `auth.wallets`, no wallet, `@user.address` stays `null`
  for email logins (unchanged behavior).
- **Solana only** in v1.
- **Email-carrying logins only** — phone-only / guest sessions get no embedded wallet.
- `environment` **staging ≠ production** — switching it gives the user a different
  address (separate Crossmint worlds).
- **Signing is `signAndSubmitTransaction` only** — `signMessage` / `signTransaction`
  throw (smart wallets sign+submit atomically). See [§3 Signing](#3-signing-with-the-wallet).
- **Signing needs a user gesture** (opens a popup) and a one-time email verification per
  device.
