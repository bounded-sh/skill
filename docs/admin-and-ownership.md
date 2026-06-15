# Owner, admins & the "no god-mode" model

**What's in here / when to read this:** how ownership works in Bounded and why
there is **no implicit creator bypass**. Read this whenever an app needs an
admin/moderator/owner with data powers (moderation, config, refunds).

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
| **Control plane** | Manage the app: deploy/replace policy, add/remove collaborators, configure functions + secrets, delete the app | **Owner + admin-collaborators** | The owner's keypair; others via `bounded link` / `bounded share` ([auth.md](auth.md)) |
| **Data plane** | Read/write app **data** | **Whoever the policy rules + invariants allow — and ONLY them** | Declared in `policy.json`. **No owner bypass.** |

The owner's legitimate reign is the *control plane* (it's their app). On the
*data plane* the owner is just another `@user.address` — if you want the creator
to moderate posts or issue refunds, you must **grant that explicitly in the
policy**, and even then they remain bound by every invariant.

## Granting data powers explicitly — the admins collection

Declare an `admins/$address` collection and gate the privileged actions on
membership in it. The create rule must include a **genesis clause** so the first
admin can seed itself — see the bootstrap section below for why.

```json
{
  "constants": { "FOUNDER": "<the-creators-wallet-address>" },
  "admins/$address": {
    "fields": { "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && (get(/admins/@user.address) != null || @user.address == @const.FOUNDER)",
      "update": "@user.address != null && get(/admins/@user.address) != null",
      "delete": "@user.address != null && get(/admins/@user.address) != null"
    }
  },
  "posts/$postId": {
    "fields": { "author": "Address!", "body": "String", "hidden": "Bool?" },
    "tier": "durable",
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.author == @user.address",
      "update": "@user.address != null && get(/admins/@user.address) != null",
      "delete": "@user.address != null && get(/admins/@user.address) != null"
    }
  },
  "attestations": [
    { "claim": "the admin set only grows through existing admins, seeded only by the founder",
      "kind": "authorityClosure", "roleScope": "admins/$address",
      "initialMember": "@const.FOUNDER" }
  ]
}
```

*(Validates clean against the real PolicyValidator.)*

- Only an existing admin **or the founder** can mint an admin. The
  `@user.address == @const.FOUNDER` disjunct is the **genesis clause**: on a
  fresh app where `get(/admins/@user.address)` is null for everyone, it lets the
  one constant founder address create the first admin row (`admins/<FOUNDER>`).
  After that, `get(/admins/@user.address) != null` carries every subsequent
  promotion — the founder clause is dormant once the set is non-empty.
- End-users default to **least privilege**: an author may create their own post;
  only an admin may hide or delete one.
- The admin gate is the same `get()` expression the prover already understands —
  so "who may moderate" stays declarative and analyzable, not buried in code.

## Linked accounts: an account is a set of wallets

`bounded link` / email `bounded share` bind a human's **CLI keypair** and their
**Privy embedded wallet** together as admin-collaborators ([auth.md](auth.md)).
So one "account" is really a *set* of wallet addresses. When you seed the admins
collection, seed **each** address the creator acts from. In a rule,
`@user.address` is always the **specific acting wallet** — so an admin gate
matches whichever of the account's wallets made the request, provided that
address is in `admins`.

## Bootstrapping the first admin — the genesis flow

There is a chicken-and-egg here that bites every fresh app: a create rule of
**only** `get(/admins/@user.address) != null` means you must *already* be an
admin to create one. On a brand-new app **nobody** is — the app owner is **not**
implicitly an admin on the data plane (no god-mode). And `bounded data set` does
**not** bypass create rules: the owner's keypair shows up as just another
`@user.address`, so a genesis `set` to `admins/<owner>` is rejected with
`403 Policy failed`. There is no system/bootstrap principal that side-steps the
rule.

The idiom that actually works, end to end:

1. **Put a constant founder address in the policy** —
   `"constants": { "FOUNDER": "<wallet>" }` (use an `environments` block for a
   per-env founder, see [environments.md](environments.md)).
2. **Add the genesis clause to the `admins` create rule** —
   `get(/admins/@user.address) != null || @user.address == @const.FOUNDER`
   (shown in the collection above). This is the *only* sanctioned side door, and
   it admits exactly one address.
3. **Seed once from the founder identity** — run
   `bounded data set --path admins/<FOUNDER> --data '{"active":true}'` **as the
   founder wallet** (the keypair whose address equals `@const.FOUNDER`). The
   genesis disjunct now passes and the first admin row lands.
4. **Promote everyone else through the founder/admin** — every later
   `admins/<x>` write is carried by `get(/admins/@user.address) != null`; the
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
`admins/$address` role scope — see [invariants.md](invariants.md#attestations--global-policy-wide-claims)
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
   (`get(/admins/@user.address) != null`) — **never** as a bypass.
2. Keep every constraint that must hold (caps, conservation, isolation) in an
   **invariant** — admins are bound by it too.
3. Default end-users to **least privilege**; widen only where the description
   requires it.
4. Add a **genesis clause** (`|| @user.address == @const.FOUNDER`) to the admins
   create rule, then seed the founder's address from the founder identity — see
   the bootstrap flow above. A plain `bounded data set` without the clause 403s.

If you catch yourself wanting "the owner can just do X," stop: write the rule
that says *which* X and *to whom*, and let the prover keep everyone honest.

## Related

- [auth.md](auth.md) — keypair identity, `bounded link`, email `bounded share`, collaborators
- [policy-generation-guide.md](policy-generation-guide.md) — the "who is the admin?" step
- [invariants.md](invariants.md) — the constraints that bind admins too
- [functions.md](functions.md) — functions are gated by an `auth` rule, same admin pattern
- [cli-reference.md](cli-reference.md) — `verify --operation`, `share`/`link`/`collaborators`
