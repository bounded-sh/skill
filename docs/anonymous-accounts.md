# Anonymous (guest) accounts + seamless upgrade

The smoothest onboarding Bounded offers: a **guest** signs in with **zero friction**
— no email, no wallet extension, no popup — gets a real, durable identity that owns
data, and **later upgrades to a real account (email) while keeping the exact same
identity and all its data**. This is the Firebase/Supabase "anonymous auth" model,
enforced by Bounded's proven boundary.

In Bounded **a keypair *is* an account**: a guest is an ed25519 keypair generated in
the browser that signs the same auth challenge a wallet would. The upgrade preserves
that identity at the **auth layer** (the email account *adopts* the guest's id), so
your policies and data never change — `@user.id` is stable across the upgrade.

> **The `user` object** — `{ id, address, email, isAnonymous }`:
> - `user.id` / `@user.id` — the **universal, stable identity**, always present.
>   For a guest it's the keypair's address; for an email login it's the account id.
>   **After an upgrade it is UNCHANGED** (the email account adopts the guest's id).
>   Use this for ownership.
> - `user.address` / `@user.address` — a real onchain wallet address (guest/wallet
>   logins); `null` for email-only logins.
> - `user.email` / `@user.email` — verified lowercased email (email logins only).
> - `user.isAnonymous` — **`true` for a guest, `false` after upgrade** (Firebase
>   parity). Use it to decide whether to show a "save your account" prompt. Also
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

Without `auth.anonymous: true`, `signInAnonymously()` is **refused by the issuer**
(403). The flag travels in your deployed policy, so it's version-locked and per-env
(deploy a different policy per environment to vary it).

## 1. Anonymous sign-in (the guest)

```ts
import { init, signInAnonymously, getCurrentUser } from 'bounded-sh'

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

## 3. Upgrade the guest (keep the SAME identity + data)

Send a code, then `linkEmail` — Firebase `linkWithCredential` parity:

```ts
import { signInAnonymously, sendEmailOtp, linkEmail, getCurrentUser } from 'bounded-sh'

await signInAnonymously()                 // user.isAnonymous === true
// ...user does stuff, owns data keyed by @user.id...

await sendEmailOtp('user@example.com')    // emails a 6-digit code
const user = await linkEmail('user@example.com', '123456')
user.isAnonymous   // false — now a real account
user.id            // UNCHANGED — same id the guest had → all its data is still theirs
```

What happens under the hood: the issuer verifies the guest token, and **if the email
is brand-new** the new account *adopts the guest's id* — so `@user.id` (and every row
owned by it) carries over with zero migration. **If the email already exists**, the
user just signs into that existing account (no merge — it stays its own identity),
exactly like Firebase/Supabase. Show the upgrade prompt with `getCurrentUser()?.isAnonymous`.

> **Google / social upgrade** — `linkWithRedirect({ redirectUri })` does the same
> seamless, id-preserving upgrade via a Google (OIDC) redirect: stash the guest,
> redirect to sign in with Google, and `completeLoginFromRedirect()` finishes the
> link automatically. Same rule applies — brand-new social account = id preserved,
> existing = stays separate.

## 4. Alternative: transferable ownership (ownership-as-data)

Independent of the upgrade, Bounded lets you model ownership as **data** so it can be
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

Proven on staging (guests A, B): A creates (owner=A) ✅ · B seizes ❌403 · A transfers
to B ✅ · A writes again ❌403 · B writes ✅.

---

## When to use this

- **Try-before-signup** — use the app instantly as a guest; `linkEmail` later, keep everything.
- **Invite links / shareable sessions** — recipient lands as a guest, optionally receives a transferred account.
- **Agent identities** — each agent is a guest keypair; hand an account between agents via the transfer pattern.

## Gotchas

- Anonymous is **opt-in** — set `"auth": { "anonymous": true }` in policy or guest sign-in is 403'd.
- `@user.isAnonymous == false` (not `!@user.isAnonymous`); offchain-only.
- Upgrade preserves `@user.id` only for a **brand-new** email; linking an existing
  email signs into it (separate identity, no merge). Prompt to upgrade before users
  care about not losing the account (guest keys live on the device).
- For transferable ownership, scope by **accountId**, never raw `@user.id`; `create`
  checks `@newData.owner`, `update`/transfer checks `@data.owner`.
