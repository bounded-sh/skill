# Anonymous accounts + transferable, provable ownership

The smoothest onboarding Bounded offers: a **guest** signs in with **zero friction**
— no email, no wallet extension, no popup — and still gets a real, durable
identity that owns data. Later they can **upgrade** (attach an email so they don't
lose it) or **transfer ownership** of the account to another key — and the
transfer rules are enforced by the proven boundary, not by app code.

This works because in Bounded **a keypair *is* an account**. A guest is just an
ed25519 keypair generated in the browser that signs the same auth challenge a
wallet would.

> **The `user` object.** Every authenticated session exposes
> `{ id: string, address: string | null, email: string | null }`:
> - `@user.id` — the **universal, stable identity**, always present. For a guest
>   (or any wallet login) it equals the signing key's public address; for an
>   email/social login it's the account identity. **Use this for ownership.**
> - `@user.address` — a **real onchain wallet address**, present for wallet/guest
>   keypairs and `null` for email-only logins. Use it only for onchain/wallet
>   semantics.
> - `@user.email` — the verified, lowercased email (email logins only; `null`
>   for wallet/guest).
>
> Ownership in this doc is keyed by `@user.id`, not the raw wallet address. For a
> guest those two are the same value today — but keying on `@user.id` is what lets
> a guest **upgrade to email** (section 4) and keep owning the same data even if
> the underlying key isn't the identity anymore.

---

## 1. Anonymous sign-in (the guest)

```ts
import { init, signInAnonymously } from 'bounded-sh'

await init({ appId: '<APP_ID>', network: 'bounded-staging' })
const me = await signInAnonymously()   // generates + persists a keypair, mints a session
// me.id === the guest's stable identity (use this for ownership). Durable across reloads.
// me.address === the same public key (the onchain/wallet view of the guest key).
```

`signInAnonymously()` generates a non-extractable ed25519 key (stored so an XSS
can *sign* but never read the private key), runs nonce → sign → session, and
you're authenticated. No backend change — it's the wallet-signature path with a
local key.

> CLI equivalent (and how it's already proven): the `bounded` CLI is itself a
> generated keypair signing this exact challenge. `bounded whoami` shows the
> address; every `bounded` command is a "guest" session under the hood.

## 2. Model ownership as DATA (so it can move)

**Don't** scope a user's data by their raw `@user.id`. Scope it by an
**account id**, and record the owner in the account document. Then ownership can
be transferred without touching the data.

`examples/ownership.policy.json`:

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
  },
  "accounts/$accountId/items/$itemId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && @user.id == get(/accounts/$accountId).owner",
      "update": "@user.id != null && @user.id == get(/accounts/$accountId).owner",
      "delete": "@user.id != null && @user.id == get(/accounts/$accountId).owner"
    },
    "fields": { "text": "String" }
  }
}
```

The load-bearing rules:
- **create** `@user.id == @newData.owner` — you can only create an account
  you list yourself as owner of.
- **update** `@user.id == @data.owner` — only the **current** owner (the
  value already stored) may change the row. Changing `owner` *is* the transfer.

## 3. Transfer ownership (no key handoff)

The current owner writes the account with a new `owner`. That's it — the `update`
rule checks the *old* owner, so only they can hand it off:

```ts
// current owner transfers to `recipientId` (the recipient's @user.id)
await set(`accounts/${accountId}`, { owner: recipientId, label })
```

After this, the original owner is locked out and the recipient can write. This is
**revocable, auditable, and single-owner** — unlike sharing a private key.

**Proven on staging** (two independent guest keypairs A, B):

| step | actor | result |
|---|---|---|
| create `accounts/acc1` (owner=A) | A | ✅ |
| try to seize it (owner=B) | B | ❌ 403 — not owner |
| transfer (owner→B) | A | ✅ A is current owner |
| write again | A | ❌ 403 — no longer owner |
| write | B | ✅ B owns it now |

## 4. Upgrade a guest (keep the data, add recovery)

Upgrading is **account linking**, not a new identity. Link the guest's key to an
email so the user can recover it / use it on another device — the address (and
all its data) stays the same:

```bash
bounded link --env staging   # links this key to an email account
```

(Programmatic SDK linking follows the same control plane the CLI uses.)

## 5. The transfer is *proven*, automatically (the Bounded difference)

The rules above *enforce* single-owner transfer. Bounded also **proves** it.
`bounded verify` / deploy auto-detects a self-gated `owner` field and discharges
a **transfer-authority** obligation:

> *"any change to `owner` requires `@user.id == @data.owner` (the current
> holder) — ownership is transferable but unseizable"*

- ✅ correct policy (update gated on `@data.owner`) → **PROVED**.
- ❌ a policy that gates transfer on `@newData.owner` (so anyone could set
  themselves as owner) → **DISPROVED**, with a concrete counterexample
  (`@data.owner = someone-else`, `@newData.owner = me`).

So "we wrote the rule carefully" becomes a machine-checked guarantee across every
account, for all inputs, forever — no extra annotation needed. (See
`docs/verify-and-counterexamples.md`.)

---

## When to use this

- **Invite links / shareable sessions** — recipient lands, gets a guest identity,
  optionally receives a transferred account.
- **Try-before-signup** — let people use the app immediately; upgrade to email later.
- **Agent identities** — each agent is a guest keypair; hand an account between agents.

## Gotchas

- Scope data by **accountId**, never raw `@user.id`, or it can't be transferred.
- `create` must check `@newData.owner` (incoming), `update`/transfer must check
  `@data.owner` (existing). Mixing them up either lets anyone seize accounts or
  locks out transfers.
- Guest keys live on the device. Tell users to **upgrade (link email)** before
  they care about not losing the account.
