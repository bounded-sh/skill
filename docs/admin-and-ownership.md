# Owner, admins & the "no god-mode" model

**What's in here / when to read this:** how ownership works in Bounded and why
there is **no implicit creator bypass**. Read this whenever an app needs an
admin/moderator/owner with data powers (moderation, config, refunds).

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
membership in it. Seed it with the creator's wallet at bootstrap.

```json
{
  "admins/$address": {
    "fields": { "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && get(/admins/@user.address) != null",
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
  }
}
```

*(Validates clean against the real PolicyValidator.)*

- Only an existing admin can mint another admin (`create` is gated on
  `get(/admins/@user.address) != null`) — **no self-promotion**. Seed the first
  admin out-of-band at bootstrap: a server-signed `set` from `bounded-sh/server`
  (the vault keypair, see [../guides/building-a-backend.md](../guides/building-a-backend.md)),
  or write the creator's address once with `bounded data set`
  ([data-plane.md](data-plane.md)).
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

## Prove the admin set is well-formed

The proof engine has a dedicated operation, **`verifyAuthorityClosure`**, that
proves the role collection is *closed under the founder*: every write path into
the admin scope (create rules, hooks, plugin calls) implies the writer is already
an admin (no self-promotion, no side doors), and — given `initialMember` — that
the create path forces the founder in. It's the formal version of "only an admin
can make an admin."

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
4. Seed the admins collection with the creator's address(es) at bootstrap.

If you catch yourself wanting "the owner can just do X," stop: write the rule
that says *which* X and *to whom*, and let the prover keep everyone honest.

## Related

- [auth.md](auth.md) — keypair identity, `bounded link`, email `bounded share`, collaborators
- [policy-generation-guide.md](policy-generation-guide.md) — the "who is the admin?" step
- [invariants.md](invariants.md) — the constraints that bind admins too
- [functions.md](functions.md) — functions are gated by an `auth` rule, same admin pattern
- [cli-reference.md](cli-reference.md) — `verify --operation`, `share`/`link`/`collaborators`
