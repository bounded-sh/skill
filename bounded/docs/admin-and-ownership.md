# Owner, admins & the "no god-mode" model

**What's in here / when to read this:** how ownership works in Bounded and why
there is **no implicit creator bypass**. Read this whenever an app needs an
admin/moderator/owner with data powers (moderation, config, refunds).

> **Which "admin" do you mean?** If the admin is one of your **app's end-users** with
> elevated in-app powers (a forum **moderator**, a game admin) that changes at runtime →
> you're in the right place: make a data-plane `admins/$userId` collection (below). If the
> admin **operates the app** (deploys policy/UI, manages billing/settings) — your team —
> that's the **control plane**: use `bounded share --role` or the `access` block, see
> [access-control.md](access-control.md). They're different; the `access` block does NOT
> replace an `admins` collection. (`get(/admins/...)` = your collection; `get(/__admins__/...)`
> = the reserved control-plane bridge.)

> **Want "admins read/write everything"?** The cleanest path is the top-level
> `roles` block — a provably-scoped grant the verifier surfaces. See
> [roles.md](roles.md). This doc covers the complementary, *per-document*
> rule-based model (e.g. "an admin may hide any post") and the
> `verifyAuthorityClosure` proof obligation. The two compose.

## The differentiator: invariants bind EVERYONE

Firebase/Supabase ship a **service-role / admin SDK that bypasses your rules**.
Bounded does **not**. There is no creator god-mode on the data plane: the policy
governs every actor, and **invariants bind everyone — the owner included.**
Nobody — not the owner, not an admin, not a function — can violate an invariant.

This is deliberate. "The owner can do anything" is exactly the hole that makes a
proven backend unprovable. So Bounded splits authority into two planes:

## Two planes

| Plane | What it covers | Who has it | How |
|---|---|---|---|
| **Control plane** | Manage the app: deploy/replace policy + UI, add/remove collaborators, configure functions + secrets, billing, delete the app | **Owner + control roles** (`admin`/`developer`/`viewer`/`billing` + custom) | The owner's keypair; others via `bounded share --role` / the `access` block — see [access-control.md](access-control.md) |
| **Data plane** | Read/write app **data** | **Whoever the policy rules + invariants allow — and ONLY them** | Declared in `policy.json`. **No owner bypass.** |

The owner's legitimate reign is the *control plane* (it's their app). On the
*data plane* the owner is just another `@user.id` — if you want the creator
to moderate posts or issue refunds, you must **grant that explicitly in the
policy**, and even then they remain bound by every invariant.

> **Identity, in one line.** The SDK `user` object is `{ id, address, email }`.
> `@user.id` is the **universal stable identity** — always present for an
> authenticated user (for wallet logins it equals the wallet address; for
> email/social logins it is the account identity). `@user.address` is a **real
> onchain wallet address** — present for wallet logins, **null** for email-only
> logins. `@user.email` is the verified, lowercased email (email logins only;
> null for wallet). Use **`@user.id` for ownership / membership / admin gates**;
> reserve `@user.address` for genuinely onchain / wallet operations. (Inside an
> `onchain:true` collection only `@user.address` is allowed — `@user.id`,
> `@user.email`, and `@user.isAnonymous` are forbidden there.)

## Granting data powers explicitly — the admins collection

Declare an `admins/$userId` collection and gate the privileged actions on
membership in it. The create rule must include a **genesis clause** so the first
admin can seed itself — see the bootstrap section below for why.

```json
{
  "constants": { "FOUNDER": "<the-creators-user-id>" },
  "admins/$userId": {
    "fields": { "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && (get(/admins/@user.id) != null || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null"
    }
  },
  "posts/$postId": {
    "fields": { "author": "String!", "body": "String", "hidden": "Bool?" },
    "tier": "durable",
    "rules": {
      "read": "true",
      "create": "@user.id != null && @newData.author == @user.id",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null"
    }
  },
  "proofs": {
    "attestations": [
      { "claim": "the admin set only grows through existing admins, seeded only by the founder",
        "kind": "authorityClosure", "roleScope": "admins/$userId",
        "initialMember": "@const.FOUNDER" }
    ]
  }
}
```

*(Validates clean against the real PolicyValidator.)*

- Only an existing admin **or the founder** can mint an admin. The
  `@user.id == @const.FOUNDER` disjunct is the **genesis clause**: on a
  fresh app where `get(/admins/@user.id)` is null for everyone, it lets the
  one constant founder identity create the first admin row (`admins/<FOUNDER>`).
  After that, `get(/admins/@user.id) != null` carries every subsequent
  promotion — the founder clause is dormant once the set is non-empty.
- End-users default to **least privilege**: an author may create their own post;
  only an admin may hide or delete one.
- The admin gate is the same `get()` expression the prover already understands —
  so "who may moderate" stays declarative and analyzable, not buried in code.
  Note the gate keys on `@user.id` (stable identity), so an email-login admin
  (no wallet) and a wallet-login admin are gated identically.

## Linked accounts: one stable identity across logins

`bounded link` / email `bounded share` bind a human's **CLI keypair** and their
**auto-provisioned embedded wallet** together as admin-collaborators ([auth.md](auth.md)).
Because you gate on `@user.id` — the **universal stable identity** that is the
same regardless of which login the human used — you seed the admins collection
**once** at the account's `@user.id`, and the gate matches every authenticated
request from that account.

This is exactly why ownership/membership should key on `@user.id` rather than
`@user.address`: `@user.address` is the *specific acting wallet* (and is **null**
for an email-only login), so gating membership on it would miss email logins and
fracture across an account's wallets. Reserve `@user.address` for genuinely
onchain operations where you need a real wallet pubkey.

## Bootstrapping the first admin — the genesis flow

There is a chicken-and-egg here that bites every fresh app: a create rule of
**only** `get(/admins/@user.id) != null` means you must *already* be an
admin to create one. On a brand-new app **nobody** is — the app owner is **not**
implicitly an admin on the data plane (no god-mode). And `bounded data set` does
**not** bypass create rules: the owner shows up as just another
`@user.id`, so a genesis `set` to `admins/<owner>` is rejected with
`403 Policy failed`. There is no system/bootstrap principal that side-steps the
rule.

The idiom that actually works, end to end:

1. **Put a constant founder identity in the policy** —
   `"constants": { "FOUNDER": "<user-id>" }` (use an `environments` block for a
   per-env founder, see [environments.md](environments.md)).
2. **Add the genesis clause to the `admins` create rule** —
   `get(/admins/@user.id) != null || @user.id == @const.FOUNDER`
   (shown in the collection above). This is the *only* sanctioned side door, and
   it admits exactly one identity.
3. **Seed once from the founder identity** — run
   `bounded data set --path admins/<FOUNDER> --data '{"active":true}'` **as the
   founder** (the identity whose `@user.id` equals `@const.FOUNDER`). The
   genesis disjunct now passes and the first admin row lands.
4. **Promote everyone else through the founder/admin** — every later
   `admins/<x>` write is carried by `get(/admins/@user.id) != null`; the
   genesis clause never fires again once the set is non-empty.

Pair this with the `authorityClosure` attestation above (`initialMember:
"@const.FOUNDER"`) to **prove** the founder is the *only* bootstrap — the proof
shows every write path into the admin scope implies the writer is already an
admin, except the founder genesis, so there is no extra side door hiding in the
rules. (Do **not** claim `bounded data set` alone seeds the admin — it is
governed by the same create rule and 403s without the genesis clause.)

## Prove the admin set is well-formed

The proof engine has a dedicated operation, **`verifyAuthorityClosure`**, that
proves the role collection is *closed under the founder*: every write path into
the admin scope (create rules, hooks, plugin calls) implies the writer is already
an admin (no self-promotion, no side doors), and — given `initialMember` — that
the create path forces the founder in. It's the formal version of "only an admin
can make an admin." (`authorityClosure` currently supports only a **flat**
`admins/$userId` role scope — see [invariants.md](invariants.md#attestations--global-policy-wide-claims)
for the multi-tenant pattern and the nested-scope limitation.)

> It runs in the verification engine (the same one `bounded verify` drives). The
> `bounded verify --operation` flag exposes a subset today
> (`verifyForDeploy`/`checkTautology`/`checkContradiction`/`checkSatisfiability`/`checkImplication`
> — see [cli-reference.md](cli-reference.md)); `verifyAuthorityClosure` is an
> engine operation, not yet a CLI `--operation` value. Structure the admins
> collection as above so the closure property holds, and `verifyForDeploy` proves
> the per-rule obligations.

## Agent guidance — designing the admin model

When you build an app, **identify who the owner/admin is** (the creator) and
**what admin actions the app genuinely needs** (moderation, config, refunds).
Then:

1. Express each admin action as an **explicit, admin-gated rule**
   (`get(/admins/@user.id) != null`) — **never** as a bypass.
2. Keep every constraint that must hold (caps, conservation, isolation) in an
   **invariant** — admins are bound by it too.
3. Default end-users to **least privilege**; widen only where the description
   requires it.
4. Add a **genesis clause** (`|| @user.id == @const.FOUNDER`) to the admins
   create rule, then seed the founder's `@user.id` from the founder identity — see
   the bootstrap flow above. A plain `bounded data set` without the clause 403s.
5. Gate ownership/membership on `@user.id` (the always-present stable identity),
   not `@user.address` — the wallet address is null for email logins and is only
   appropriate for onchain operations.

If you catch yourself wanting "the owner can just do X," stop: write the rule
that says *which* X and *to whom*, and let the prover keep everyone honest.

## Related

- [auth.md](auth.md) — keypair identity, `bounded link`, email `bounded share`, collaborators
- [policy-generation-guide.md](policy-generation-guide.md) — the "who is the admin?" step
- [invariants.md](invariants.md) — the constraints that bind admins too
- [functions.md](functions.md) — functions are gated by an `auth` rule, same admin pattern
- [cli-reference.md](cli-reference.md) — `verify --operation`, `share`/`link`/`collaborators`
