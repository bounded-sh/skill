# Anonymous (guest) accounts

The smoothest onboarding Bounded offers: a **guest** signs in with **zero friction**
— no email, no wallet extension, no popup — and gets a real, durable identity that
owns data. This is the Firebase/Supabase "anonymous auth" model, enforced by
Bounded's policy-enforced boundary. The current published client supports this
flow in browsers with WebCrypto Ed25519 + IndexedDB; standard React Native does
not provide the required IndexedDB key store.

In Bounded **a keypair *is* an account**: a guest is an ed25519 keypair generated in
the browser that signs the same auth challenge a wallet would. It is durable across
reloads and owns data keyed by its stable `@user.id`.

> **Moving to a real account.** Send the guest through hosted
> `loginWithRedirect`; the current client returns a real account with a **distinct
> `@user.id`** and does not export an id-preserving link helper. To carry guest
> data over, model ownership as **transferable data** and use the two-login
> handoff below while the old guest can still authorize the transfer.

> **The `user` object** — `{ id, address, email, isAnonymous }`:
> - `user.id` / `@user.id` — the **universal, stable identity**, always present.
>   For a guest it's the keypair's address; for an email login it's the account id.
>   Use this for ownership.
> - `user.address` / `@user.address` — a real onchain wallet address. Present for
>   guest and wallet logins, and **by default for email/social logins too**: an
>   embedded Turnkey wallet is eagerly provisioned on first login with no
>   `auth.wallets` block needed. It is `null` for phone-only sessions, apps that set
>   `auth.wallets: false`, the legacy lazy `authMode: "bounded"` path, and on a
>   wallet-config lookup failure - see
>   [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md).
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

Without `auth.anonymous: true`, `signInAnonymously()` is refused — the issuer
returns a clear error the SDK surfaces verbatim: *"Anonymous auth is not enabled for
this app. Add `"auth": { "anonymous": true }` to policy.json and redeploy."* (a
`403 anonymous_auth_disabled`). The flag travels in your deployed policy, so it's
version-locked and per-env (deploy a different policy per environment to vary it).

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
local key — durable across reloads. `logout()` ends the session but keeps the
device key, so a later anonymous login returns to the same guest. The published
package does not export a `forgetGuest()` helper; clearing the browser's
site data removes the IndexedDB key and creates a new guest on the next login.

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

> **Keep the `@user.id != null` in front of it.** `@user.isAnonymous == false` is
> not an authentication check on its own: it means "not a guest", and it is also
> `false` for a caller with **no session at all**. `@user.id != null` is what
> proves someone is authenticated; `@user.isAnonymous` only narrows *which kind*
> of authenticated user it is.

## 2b. Guests are offchain-only in the browser - and warn your users

Treat a guest as a **temporary, try-the-app identity**. Two things the platform does, and one
thing you must do:

- **A guest cannot complete an onchain write on any real network.** On mainnet the platform
  refuses it fail-closed: a guest write to a `realtime_mainnet`/`solana_mainnet` (or
  `*_mainnet_preview`) collection returns **403 `anonymous_onchain_blocked`** before any
  transaction is built. On devnet the platform *permits* the write and returns a built
  transaction, and then the browser SDK will not sign it - a guest session's `signTransaction`
  throws `Guest (anonymous) auth is offchain-only`, and the guest device key (a non-extractable
  WebCrypto Ed25519 key) has no transaction-byte signing path. Onchain reads, offchain writes,
  and poofnet simulation are all still allowed, so a guest can still explore your app. (See
  [onchain.md](../../bounded-onchain/docs/onchain.md#guests-cannot-complete-an-onchain-write).)
- **A guest is dropped on upgrade.** Signing in with email or a wallet creates a **new** real
  account - the guest's keypair, its data, and any funds sitting in the guest device wallet do
  **not** carry over (see §3/§4 for the deliberate patterns to migrate data before upgrading).

Because of that, and because the platform can't stop someone *depositing* into a guest's device
wallet from off-platform, **show a guest-mode warning** whenever `user.isAnonymous` is true:

```jsx
const { user } = useAuthUser();

{user?.isAnonymous && (
  <Banner>
    You're browsing as a guest. This is temporary - your data and this guest wallet will be
    lost when you sign in with email or a wallet. Don't deposit or send funds to your guest
    account. Sign in to save your progress and transact.
  </Banner>
)}
```

Adapt the tone to your app, but keep the two load-bearing points: **temporary (data/funds lost on
upgrade)** and **don't fund the guest wallet**. Prompt the upgrade before any real transaction.

## 3. Migrate browser guest data to a real account

Send the guest through hosted login. `loginWithRedirect` signs them in as a
**new** real account:

```ts
import { completeLoginFromRedirect, get, getCurrentUser, loginWithRedirect, set, signInAnonymously } from '@bounded-sh/client'

await signInAnonymously()                 // user.isAnonymous === true
// ...user does stuff, owns data keyed by @user.id...

// Show the "create a real account" prompt with getCurrentUser()?.isAnonymous, then:
await loginWithRedirect({ methods: ['email', 'google'] })   // web: no redirectUri needed
// (once on app load)
const user = await completeLoginFromRedirect()
if (!user || user.isAnonymous || !user.id) throw new Error('expected a real account')
user.isAnonymous   // false — a real account
user.id            // their REAL account id — DISTINCT from the guest's id
```

Here the real account has its **own** `@user.id` — the guest id is **not** adopted,
so any data the guest created is still owned by the *guest* id. Do **not** try to
transfer it immediately after `completeLoginFromRedirect()`: at that point the
real account is acting, while the transfer rule below authorizes only the old
guest owner.

For a client-only migration, use this explicit two-login handoff:

1. Before the first hosted redirect, save the guest id and the account/document
   ids to migrate in `sessionStorage`.
2. After hosted login returns, save the new real `user.id` as the recipient.
3. Call `signInAnonymously()` again. The persisted browser key restores the old
   guest; assert that its id equals the saved guest id.
4. While acting as that guest, update each transferable owner field to the saved
   real id. The runtime-enforced old-owner rule authorizes each handoff; the
   generated transfer-authority obligation proves that a non-owner cannot seize it.
5. Run hosted login a second time to restore the real session, assert its id, and
   clear the pending migration state.

```ts
const HANDOFF_KEY = 'pending_guest_handoff'
type PendingGuestHandoff = {
  phase: 'capture-real' | 'transfer-as-guest' | 'return-real'
  guestId: string
  accountIds: string[]
  realId?: string
}

// Before the first redirect:
const guest = getCurrentUser()
if (!guest?.isAnonymous || !guest.id) throw new Error('expected a browser guest with an id')
const accountIds: string[] = ['<account-id>'] // collect the guest-owned rows your app migrates
sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
  phase: 'capture-real', guestId: guest.id, accountIds,
} satisfies PendingGuestHandoff))
await loginWithRedirect({ methods: ['email', 'google'] })

// Call once on web app load. A normal hosted login has no handoff record and
// returns immediately after completing the login.
export async function completeHostedLoginAndGuestHandoff() {
  const real = await completeLoginFromRedirect()
  const raw = sessionStorage.getItem(HANDOFF_KEY)
  if (!raw) return real

  let pending: PendingGuestHandoff
  try {
    const candidate = JSON.parse(raw)
    const validPhase = ['capture-real', 'transfer-as-guest', 'return-real'].includes(candidate?.phase)
    const validIds = typeof candidate?.guestId === 'string'
      && Array.isArray(candidate?.accountIds)
      && candidate.accountIds.every((id: unknown) => typeof id === 'string' && id.length > 0)
    const validRealId = candidate?.phase === 'capture-real'
      || (typeof candidate?.realId === 'string' && candidate.realId.length > 0)
    if (!validPhase || !validIds || !validRealId) throw new Error('invalid handoff shape')
    pending = candidate
  } catch {
    sessionStorage.removeItem(HANDOFF_KEY)
    throw new Error(
      'Guest handoff state was invalid and was cleared. No ownership change was attempted; '
      + 'sign back in as the original browser guest and restart the handoff.',
    )
  }

  if (pending.phase === 'capture-real') {
    if (!real || real.isAnonymous || !real.id) {
      await loginWithRedirect({ methods: ['email', 'google'] })
      return null
    }
    pending = { ...pending, phase: 'transfer-as-guest', realId: real.id }
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(pending))
  }

  if (pending.phase === 'transfer-as-guest') {
    const realId = pending.realId
    if (!realId) throw new Error('real account id is missing; refusing to transfer')
    const restoredGuest = await signInAnonymously()
    if (!restoredGuest?.isAnonymous || restoredGuest.id !== pending.guestId) {
      throw new Error('guest identity changed; refusing to transfer')
    }
    for (const accountId of pending.accountIds) {
      const account = await get(`accounts/${accountId}`)
      if (!account) throw new Error(`account ${accountId} was not found`)
      if (account.owner === realId) continue // a prior partial attempt completed this row
      if (account.owner !== restoredGuest.id) throw new Error(`owner changed for ${accountId}`)
      await set(`accounts/${accountId}`, { ...account, owner: realId })
    }

    pending = { ...pending, phase: 'return-real' }
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(pending))
    await loginWithRedirect({ methods: ['email', 'google'] })
    return null
  }

  if (!real) {
    await loginWithRedirect({ methods: ['email', 'google'] })
    return null
  }
  if (real.isAnonymous || real.id !== pending.realId) {
    throw new Error('real identity changed; refusing to finish the handoff')
  }
  sessionStorage.removeItem(HANDOFF_KEY)
  return real
}
```

The callback completes ordinary hosted logins before looking for migration state,
guards missing/malformed storage, and makes row transfer idempotent for a retry
after a reload. Surface its errors in app-specific recovery UI. Clearing corrupt
handoff metadata does not delete guest data or the IndexedDB guest key; send the
user back through the original guest login and let them restart. If a second
hosted round trip is unacceptable, design a one-time claim-token Bounded
Function that authenticates both sides and test its replay/expiry behavior;
plain client code cannot make the new real session act as the old guest.

## 4. Carry data across with transferable ownership (ownership-as-data)

This is also the proven way to move a guest's data to their real account. Bounded
lets you model ownership as **data** so it can be
**transferred** between identities under an enforced old-owner rule, with the
generated transfer-authority obligation proved by `bounded verify` — useful for
invite links, handing an account between agents, or moving data to a different
key without sharing a private key. Scope data by an **account id** and store the
owner:

```json
{
  "accounts/$accountId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && @user.id == @newData.owner",
      "update": "@user.id != null && @user.id == @data.owner",
      "delete": "false"
    },
    "fields": { "owner": "String!", "label": "String" }
  }
}
```

- **create** `@user.id != null && @user.id == @newData.owner` — you must be logged
  in, and can only create an account you own.
- **update** `@user.id != null && @user.id == @data.owner` — only the logged-in
  **current** owner may change it.
  Changing `owner` *is* the transfer; the rule checks the *old* owner, so it's
  revocable, auditable, single-owner. `bounded verify`/deploy auto-proves the
  transfer-authority obligation (ownership is transferable but **unseizable**) — see
  [verify-and-counterexamples.md](../../bounded-backend/docs/verify-and-counterexamples.md).
- **Reject the logged-out/ownerless case explicitly.** `owner` is `String!`
  (required, never absent), and both rules require `@user.id != null`.
  A logged-out caller has `@user.id == null`; without these guards `@user.id ==
  @newData.owner` collapses to `null == null` (true), letting a stranger create an
  ownerless account and edit any ownerless row.
  Guests are fine - an anonymous guest still carries a real `@user.id`, so the
  transfer/invite flow above is unaffected.

```ts
// current owner hands off to recipientId (their @user.id) — only the old owner can:
await set(`accounts/${accountId}`, { owner: recipientId, label })
```

Behavior (guests A, B): A creates (owner=A) ✅ · B seizes ❌403 · A transfers
to B ✅ · A writes again ❌403 · B writes ✅.

---

## When to use this

- **Try-before-signup (browser)** — use the app instantly as a guest; create a real
  account later via `loginWithRedirect`, and use the two-login transfer (§3 + §4).
- **Invite links / shareable sessions** — recipient lands as a guest, optionally receives a transferred account.
- **Agent identities** — each agent is a guest keypair; hand an account between agents via the transfer pattern.

## Gotchas

- Anonymous is **opt-in** — set `"auth": { "anonymous": true }` in policy or guest sign-in is 403'd.
- `@user.isAnonymous == false` (not `!@user.isAnonymous`); offchain-only.
- Hosted `loginWithRedirect` yields a **distinct** real `@user.id`; the current
  client has no exported id-preserving link helper. A real session cannot directly
  transfer data still owned by the guest. Use the two-login handoff (§3) with
  transferable ownership (§4), or a separately secured claim Function. Prompt
  before users care about not losing data (guest keys live on the device).
- For transferable ownership, scope by **accountId**, never raw `@user.id`; `create`
  checks `@newData.owner`, `update`/transfer checks `@data.owner`.
