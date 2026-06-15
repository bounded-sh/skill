# Anonymous accounts + transferable, provable ownership

The smoothest onboarding Bounded offers: a **guest** signs in with **zero friction**
— no email, no wallet extension, no popup — and still gets a real, durable
identity that owns data. Later they can **upgrade** (attach an email so they don't
lose it) or **transfer ownership** of the account to another key — and the
transfer rules are enforced by the proven boundary, not by app code.

This works because in Bounded **a keypair *is* an account**. A guest is just an
ed25519 keypair generated in the browser that signs the same auth challenge a
wallet would. `@user.address` is its public key.

---

## 1. Anonymous sign-in (the guest)

```ts
import { initBounded, signInAnonymously } from 'bounded-sh'

await initBounded({ appId: '<APP_ID>' })
const me = await signInAnonymously()   // generates + persists a keypair, mints a session
// me.address === the guest's public key. Durable across reloads.
```

`signInAnonymously()` generates a non-extractable ed25519 key (stored so an XSS
can *sign* but never read the private key), runs nonce → sign → session, and
you're authenticated. No backend change — it's the wallet-signature path with a
local key.

> CLI equivalent (and how it's already proven): the `bounded` CLI is itself a
> generated keypair signing this exact challenge. `bounded whoami` shows the
> address; every `bounded` command is a "guest" session under the hood.

## 2. Model ownership as DATA (so it can move)

**Don't** scope a user's data by their raw `@user.address`. Scope it by an
**account id**, and record the owner in the account document. Then ownership can
be transferred without touching the data.

`examples/ownership.policy.json`:

```json
{
  "accounts/$accountId": {
    "rules": {
      "read": "true",
      "create": "@user.address == @newData.owner",
      "update": "@user.address == @data.owner",
      "delete": "false"
    },
    "fields": { "owner": "String", "label": "String" }
  },
  "accounts/$accountId/items/$itemId": {
    "rules": {
      "read": "true",
      "create": "@user.address == get(`accounts/${accountId}`).owner",
      "update": "@user.address == get(`accounts/${accountId}`).owner",
      "delete": "@user.address == get(`accounts/${accountId}`).owner"
    },
    "fields": { "text": "String" }
  }
}
```

The load-bearing rules:
- **create** `@user.address == @newData.owner` — you can only create an account
  you list yourself as owner of.
- **update** `@user.address == @data.owner` — only the **current** owner (the
  value already stored) may change the row. Changing `owner` *is* the transfer.

## 3. Transfer ownership (no key handoff)

The current owner writes the account with a new `owner`. That's it — the `update`
rule checks the *old* owner, so only they can hand it off:

```ts
// current owner transfers to `recipientAddress`
await set(`accounts/${accountId}`, { owner: recipientAddress, label })
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

## 5. Make the transfer *provable* (the Bounded difference)

The rules above *enforce* single-owner transfer. To *prove* it — "ownership can
**only** ever change via a write authorized by the current owner, across every
account, forever" — add the authority-closure obligation and run `bounded verify`.
That turns "we wrote the rule carefully" into a machine-checked guarantee with a
counterexample if it's ever violable. (See `docs/verify-and-counterexamples.md`
and the negative-authority obligation.)

---

## When to use this

- **Invite links / shareable sessions** — recipient lands, gets a guest identity,
  optionally receives a transferred account.
- **Try-before-signup** — let people use the app immediately; upgrade to email later.
- **Agent identities** — each agent is a guest keypair; hand an account between agents.

## Gotchas

- Scope data by **accountId**, never raw `@user.address`, or it can't be transferred.
- `create` must check `@newData.owner` (incoming), `update`/transfer must check
  `@data.owner` (existing). Mixing them up either lets anyone seize accounts or
  locks out transfers.
- Guest keys live on the device. Tell users to **upgrade (link email)** before
  they care about not losing the account.
