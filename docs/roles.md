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
> `admins/$address` collection (where membership is a row you must write); its
> genesis idiom (`@const.FOUNDER` clause + `bounded data set` from the founder)
> is in [admin-and-ownership.md](admin-and-ownership.md#bootstrapping-the-first-admin--the-genesis-flow).

## Shape

```json
{
  "roles": {
    "admin":  { "members": ["<addr1>", "<addr2>"], "read": "*",          "write": "*" },
    "editor": { "members": ["<addr3>"],            "read": "*",          "write": ["posts", "comments"] },
    "viewer": { "members": ["<addr4>"],            "read": ["posts"] }
  },
  "posts/$id": { "rules": { "read": "@user.address == @data.owner", "create": "...", "update": "...", "delete": "false" }, "fields": { "owner": "Address", "body": "String" } }
}
```

- `members` — a non-empty array of principal strings (wallet addresses). Use
  `@const.NAME` to keep addresses in a `constants` block — see
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

Anonymous callers (no authenticated address) are **never** granted a role.

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
  "constants": { "ADMIN": "<your-wallet-address>" },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "users/$id":  { "rules": { "read": "@user.address == $id", "create": "@user.address == $id", "update": "@user.address == $id", "delete": "false" }, "fields": { "name": "String", "email": "String" } },
  "orders/$id": { "rules": { "read": "@user.address == @data.buyer", "create": "@user.address == @newData.buyer", "update": "false", "delete": "false" }, "fields": { "buyer": "Address", "total": "UInt" } }
}
```

Normal users read only their own `users`/`orders` rows; the `admin` member reads
every row in every collection — which is exactly what a dashboard or support
console needs, with zero god-mode code path. Pairs with the local dashboard
template (`bounded dev`).

## Common mistakes

- **Granting `write:"*"` when you meant read-only.** `write` covers delete too.
  An admin dashboard usually wants `read:"*"` only.
- **Putting an address literal in `members` and forgetting staging vs prod.**
  Use `@const.ADMIN` + an `environments` block so each environment injects its
  own admin — see [environments.md](environments.md).
- **Expecting a role to *restrict* access.** Roles only ever *grant*; to restrict,
  tighten the per-collection rule.

## Related
- [admin-and-ownership.md](admin-and-ownership.md) — per-doc, rule-based admin + `verifyAuthorityClosure`
- [constants-and-defs.md](constants-and-defs.md) — `@const.NAME` in members
- [environments.md](environments.md) — per-environment admin addresses
- [policy-reference.md](policy-reference.md) — all top-level blocks
