# Embedded wallets (`auth.wallets`) — a wallet on every login

Turn on a policy flag and **every email-carrying login also gets a non-custodial
Solana wallet**, with its address exposed to your rules as `@user.address`. This is
the "wallets all around" model: a plain email/social/`web_login` user — who normally
has **no** wallet — gets one automatically, and Bounded **never holds the key**.

Wallets are **Crossmint** smart wallets with an **email admin signer**. The user
authorizes signatures client-side (email OTP / passkey via Crossmint); Bounded's
server can create-or-fetch the wallet and read its address but **cannot sign** —
custody stays with the user.

> **Slice-1 scope (what ships today):** provisioning + `@user.address` population.
> A logged-in email user gets a wallet address you can key ownership on and receive
> funds to. **Client-side signing of onchain writes is not wired yet** — an email
> user with `@user.address` populated cannot yet sign onchain transactions from the
> SDK (that's the next slice). Use this for identity, ownership, and receive-address
> semantics today.

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

## 3. Non-custody guarantees

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
- **Signing isn't wired yet** (slice-1). `@user.address` is populated and usable for
  ownership/receive today; client-side onchain signing lands in a later slice.
