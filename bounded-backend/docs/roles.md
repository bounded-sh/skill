# Roles — provably-scoped admin / editor / viewer

**What's in here:** the top-level `roles` block — declare a role whose members
get cross-collection `read`/`write` access, governed entirely by the policy (not
an out-of-band god-mode). For per-document, rule-based admin (e.g. "an admin can
hide any post") see [admin-and-ownership.md](admin-and-ownership.md); for macros
in role members see [constants-and-defs.md](constants-and-defs.md).

## When to use roles vs the admins collection

| Need | Use |
|---|---|
| "Admins can read/write **everything**" (a dashboard, support tooling) | **`roles` block** (this doc) |
| "An admin can edit/delete **any** doc in a *specific* collection" | `roles` with `write: ["posts"]` |
| "An admin can do a thing only when a per-doc condition holds" | rule + `get(/admins/...)` — [admin-and-ownership.md](admin-and-ownership.md) |

Roles are the cleanest way to express "this set of principals is privileged
across collections." They are **additive**: a policy with no `roles` block
behaves exactly as before.

> **No bootstrap problem here.** A `roles` block lists its `members` statically
> in the policy (e.g. `@const.ADMIN`), so the admin set exists the moment you
> deploy — nothing to seed. The chicken-and-egg only affects the **data-driven**
> `admins/$userId` collection (keyed by `@user.id`, where membership is a row you
> must write); its
> genesis idiom (`@const.FOUNDER` clause + `bounded data set` from the founder)
> is in [admin-and-ownership.md](admin-and-ownership.md#bootstrapping-the-first-admin--the-genesis-flow).

## Shape

```json
{
  "roles": {
    "admin":  { "members": ["<id1>", "<id2>"], "read": "*",          "write": "*" },
    "editor": { "members": ["<id3>"],          "read": "*",          "write": ["posts", "comments"] },
    "viewer": { "members": ["<id4>"],          "read": ["posts"] }
  },
  "posts/$id": { "rules": { "read": "@user.id != null && @user.id == @data.owner", "create": "...", "update": "...", "delete": "false" }, "fields": { "owner": "String", "body": "String" } }
}
```

- `members` — a non-empty array of principal identities, matched against the
  caller's `@user.id` (the **universal stable identity** — always present for an
  authenticated user; for a wallet login it equals the wallet address, for an
  email/social login it is the account identity). Role membership is an
  identity/auth gate, so it keys on `@user.id`, not the wallet `@user.address`
  (which is null for email-only logins). Use `@const.NAME` to keep these
  identities in a `constants` block — see
  [constants-and-defs.md](constants-and-defs.md).
- `read` — gates the `read` action. `"*"` = every collection; an array lists
  collection names (the first path segment, e.g. `"posts"` for `posts/$id`).
- `write` — gates `create`, `update`, AND `delete` (same convention).
- Omit `read` or `write` to grant only the other. At least one is required.

## Semantics (exactly what the runtime does)

A write or read is authorized if **either**:

1. the caller holds a role whose grant covers this `(action, collection)`, **or**
2. the collection's own rule for that action passes.

So roles are a *grant on top of* the per-collection rules — they never restrict.
Concretely, for a caller who is a member of `admin` with `read:"*"`:

- reading a collection whose `read` rule would deny them → **allowed**
- reading a collection with **no `read` rule at all** (deny-by-default) → **allowed**
- a non-member is unaffected: the per-collection rule still decides (so a missing
  rule still denies them).

Anonymous callers (no authenticated identity — `@user.id == null`) are **never** granted a role.

## Why this is "provably-scoped", not god-mode

The grant lives in the compiled policy (`app.roles`), so it is inspectable and
provable like any other rule — not a hidden bypass flag. `bounded verify`
**surfaces** every role grant as an advisory and flags the over-broad `*` ones:

```
[PASS] role 'admin': read grant
       read:* — over-broad: members may read ALL collections (4: posts, comments, users, audit). Ensure the 2 member(s) are trusted.
[PASS] role 'admin': write grant
       write:* — over-broad: members may write ALL collections (4: ...). Ensure the 2 member(s) are trusted.
```

These advisories **PASS** (a governed grant is legitimate) — they exist so you
can see exactly what each role exposes before you ship it. Prefer the narrowest
grant that works: `write: ["posts"]` over `write: "*"` when an editor only
touches posts.

## Recipe — an admin dashboard that can read everything

```json
{
  "constants": { "ADMIN": "<your-admin-user-id>" },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "users/$id":  { "rules": { "read": "@user.id == $id", "create": "@user.id == $id", "update": "@user.id == $id", "delete": "false" }, "fields": { "name": "String", "email": "String" } },
  "orders/$id": { "rules": { "read": "@user.id != null && @user.id == @data.buyer", "create": "@user.id != null && @user.id == @newData.buyer", "update": "false", "delete": "false" }, "fields": { "buyer": "String", "total": "UInt" } }
}
```

Normal users read only their own `users`/`orders` rows; the `admin` member reads
every row in every collection — which is exactly what a dashboard or support
console needs, with zero god-mode code path. The ownership gates key on
`@user.id` (the universal stable identity), so they hold for wallet **and**
email/social logins alike. `@const.ADMIN` is the admin's `@user.id`, not a wallet
address — a wallet login's id equals its address, so existing wallet-based admin
values keep working. Pairs with the local dashboard template (`bounded dev`).

## Common mistakes

- **Granting `write:"*"` when you meant read-only.** `write` covers delete too.
  An admin dashboard usually wants `read:"*"` only.
- **Putting an identity literal in `members` and forgetting preview vs prod.**
  Use `@const.ADMIN` (the admin's `@user.id`) + an `environments` block so each
  environment injects its own admin — see [environments.md](../../bounded-deploy/docs/environments.md).
- **Expecting a role to *restrict* access.** Roles only ever *grant*; to restrict,
  tighten the per-collection rule.

## Related
- [access-control.md](access-control.md) — the `access` block, control roles, custom capabilities, external contributors & **platform super-admins**
- [admin-and-ownership.md](admin-and-ownership.md) — per-doc, rule-based admin + `verifyAuthorityClosure`
- [constants-and-defs.md](constants-and-defs.md) — `@const.NAME` in members
- [environments.md](../../bounded-deploy/docs/environments.md) — per-environment admin addresses
- [policy-reference.md](policy-reference.md) — all top-level blocks
