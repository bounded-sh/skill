# Anonymous (guest) accounts

The smoothest onboarding Bounded offers: a **guest** signs in with **zero friction**
— no email, no wallet extension, no popup — and gets a real, durable identity that
owns data. This is the Firebase/Supabase "anonymous auth" model, enforced by
Bounded's proven boundary.

In Bounded **a keypair *is* an account**: a guest is an ed25519 keypair generated in
the browser that signs the same auth challenge a wallet would. It is durable across
reloads and owns data keyed by its stable `@user.id`.

> ⛔ **No inline auth-layer "upgrade".** There is **no** `sendEmailOtp` + `linkEmail`
> id-adopting upgrade anymore — those endpoints are retired (`403 inline appId token
> minting is disabled` on every origin). A guest who signs in for real goes through
> the **hosted redirect flow** (`loginWithRedirect`) like any login and comes back as
> their **real account**, which is a **distinct `@user.id`** from the guest. To carry
> a guest's data across to the real account, model ownership as **transferable data**
> and hand it over — see [§4 below](#4-carry-data-across-with-transferable-ownership).

> **The `user` object** — `{ id, address, email, isAnonymous }`:
> - `user.id` / `@user.id` — the **universal, stable identity**, always present.
>   For a guest it's the keypair's address; for an email login it's the account id.
>   Use this for ownership.
> - `user.address` / `@user.address` — a real onchain wallet address (guest/wallet
>   logins); `null` for email-only logins.
> - `user.email` / `@user.email` — verified lowercased email (email logins only).
> - `user.isAnonymous` — **`true` for a guest, `false` for any real login** (Firebase
>   parity). Use it to decide whether to show a "create a real account" prompt. Also
>   available in policy as `@user.isAnonymous` (Supabase parity).

---

## 0. Opt in (anonymous is OFF by default)

Most apps don't want guests, so you **must enable it** in `policy.json` — a top-level
`auth` block:

```json
{
  "auth": { "anonymous": true },
  "notes/$id": { "rules": { "read": "true", "create": "@user.id != null" }, "fields": { "text": "String" } }
}
```

Without `auth.anonymous: true`, `signInAnonymously()` is refused with `403`. The
flag travels in your deployed policy, so it's version-locked and per-env (deploy
a different policy per environment to vary it).

## 1. Anonymous sign-in (the guest)

```ts
import { init, signInAnonymously, getCurrentUser } from '@bounded-sh/client'

await init({ appId: '<APP_ID>' })
const me = await signInAnonymously()   // generates + persists a keypair, mints a guest session
me.isAnonymous   // true
me.id            // the guest's stable identity — use for ownership; durable across reloads
```

`signInAnonymously()` generates a non-extractable ed25519 key (an XSS can *sign* but
never read it), runs nonce → sign → session. It's the wallet-signature path with a
local key — durable across reloads. `logout()` keeps the key (same guest next time);
`forgetGuest()` wipes it (brand-new guest).

## 2. Gate guests in policy with `@user.isAnonymous`

A guest is a first-class identity that owns data — but you often want "**browse as a
guest, must sign up to post**". Gate it in the rule (Supabase `is_anonymous` parity):

```json
"posts/$id": {
  "rules": {
    "read": "true",
    "create": "@user.id != null && @user.isAnonymous == false"
  },
  "fields": { "author": "String", "body": "String" }
}
```

`@user.isAnonymous == false` admits only upgraded/real users. (Write `== false`, not
`!@user.isAnonymous` — the unary `!` isn't supported on special vars.) It's
**offchain-only** — onchain rules must use `@user.address`.

## 3. Convert a guest to a real account (hosted login)

When a guest wants a durable real account, send them through the **same hosted
redirect flow as any login** — there is no inline OTP upgrade (see the ⛔ note at the
top):

```ts
import { signInAnonymously, loginWithRedirect, completeLoginFromRedirect, getCurrentUser } from '@bounded-sh/client'

await signInAnonymously()                 // user.isAnonymous === true
// ...user does stuff, owns data keyed by @user.id...

// Show the "create a real account" prompt with getCurrentUser()?.isAnonymous, then:
await loginWithRedirect({ redirectUri: 'https://yourapp.com/auth/callback' })
// (on the callback route, on load)
const user = await completeLoginFromRedirect()
user.isAnonymous   // false — a real account
user.id            // their REAL account id — DISTINCT from the guest's id
```

The real account has its **own** `@user.id` — the guest id is **not** auto-adopted
(the auth-layer id-adoption upgrade is retired). So any data the guest created is
still owned by the *guest* id. To make it follow the user into their real account,
model that data as **transferable ownership** (next section) and transfer it to the
real `@user.id` right after `completeLoginFromRedirect()`.

## 4. Carry data across with transferable ownership (ownership-as-data)

This is also the proven way to move a guest's data to their real account. Bounded
lets you model ownership as **data** so it can be
**transferred** between identities under a proven rule — useful for invite links,
handing an account between agents, or moving data to a different key without sharing
a private key. Scope data by an **account id** and store the owner:

```json
{
  "accounts/$accountId": {
    "rules": {
      "read": "true",
      "create": "@user.id == @newData.owner",
      "update": "@user.id == @data.owner",
      "delete": "false"
    },
    "fields": { "owner": "String", "label": "String" }
  }
}
```

- **create** `@user.id == @newData.owner` — you can only create an account you own.
- **update** `@user.id == @data.owner` — only the **current** owner may change it.
  Changing `owner` *is* the transfer; the rule checks the *old* owner, so it's
  revocable, auditable, single-owner. `bounded verify`/deploy auto-proves the
  transfer-authority obligation (ownership is transferable but **unseizable**) — see
  [verify-and-counterexamples.md](verify-and-counterexamples.md).

```ts
// current owner hands off to recipientId (their @user.id) — only the old owner can:
await set(`accounts/${accountId}`, { owner: recipientId, label })
```

Behavior (guests A, B): A creates (owner=A) ✅ · B seizes ❌403 · A transfers
to B ✅ · A writes again ❌403 · B writes ✅.

---

## When to use this

- **Try-before-signup** — use the app instantly as a guest; create a real account
  later via `loginWithRedirect`, and transfer any data over (§3 + §4).
- **Invite links / shareable sessions** — recipient lands as a guest, optionally receives a transferred account.
- **Agent identities** — each agent is a guest keypair; hand an account between agents via the transfer pattern.

## Gotchas

- Anonymous is **opt-in** — set `"auth": { "anonymous": true }` in policy or guest sign-in is 403'd.
- `@user.isAnonymous == false` (not `!@user.isAnonymous`); offchain-only.
- **No inline id-preserving upgrade** — `sendEmailOtp`/`linkEmail`/`linkWithRedirect`
  upgrade is retired (403). Going real = `loginWithRedirect` → a **distinct** real
  `@user.id`. Use transferable ownership (§4) to carry the guest's data over. Prompt
  before users care about not losing data (guest keys live on the device).
- For transferable ownership, scope by **accountId**, never raw `@user.id`; `create`
  checks `@newData.owner`, `update`/transfer checks `@data.owner`.
