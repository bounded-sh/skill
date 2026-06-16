# Constants (`@const`) and Defs (`@def`)

**What's in here:** two additive top-level policy blocks that keep policies DRY —
`constants` for named values (`@const.NAME`) and `defs` for reusable rule
fragments (`@def.name`). Both are resolved at **compile time** (server-side,
during deploy and verify), so the stored/proved policy contains only literals.
For *per-environment* values see [environments.md](environments.md).

## constants — named values

```json
{
  "constants": { "ADMIN": "7xKQ...wallet", "DAILY_CAP": 5000, "OPEN": true },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "spend/$id": {
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "invariants": [ { "type": "rollingSum", "name": "cap", "field": "amount", "windowSeconds": 86400, "limit": "@const.DAILY_CAP" } ]
  }
}
```

- Values may be **string, number, or boolean**.
- Reference anywhere a value appears: rule strings, role members, invariant
  limits, field defaults.
- **Type is preserved when the whole value is one `@const`**: `"limit": "@const.DAILY_CAP"`
  compiles to the number `5000`, not the string `"5000"`.
- **Embedded in a rule, strings are quoted, numbers/bools are raw** (matching the
  CLI's convention): `"read": "@user.id == @const.ADMIN"` →
  `@user.id == 'acct_...admin'`; `"@data.n > @const.DAILY_CAP"` →
  `@data.n > 5000`.

## defs — reusable rule fragments

```json
{
  "constants": { "ADMIN": "acct_...admin" },
  "defs": {
    "isOwner": "@user.id == @data.owner",
    "isAdmin": "@user.id == @const.ADMIN",
    "canEdit": "@def.isOwner || @def.isAdmin"
  },
  "posts/$id": {
    "rules": {
      "read": "true",
      "create": "@user.id == @newData.owner",
      "update": "@def.canEdit && @newData.owner == @data.owner",
      "delete": "@def.isAdmin"
    },
    "fields": { "owner": "String", "body": "String" }
  }
}
```

- A def is a **rule-fragment string**. Reference it as `@def.name`.
- Defs are inlined **wrapped in parens** so they compose safely inside larger
  boolean expressions: `@def.canEdit` above becomes
  `((@user.id == @data.owner) || (@user.id == 'acct_...admin'))`.
- Defs may reference **other defs and constants** (resolved recursively). A
  **cycle is a compile error**.

> **Identity vs. wallet in these fragments.** The runtime `user` object is
> `{ id: string, address: string | null, email: string | null }`:
> - `@user.id` — the **universal stable identity**, always present for an
>   authenticated user (equals the wallet address for wallet logins; the account
>   identity for email/social logins). **Use this for ownership / membership /
>   admin / auth-guard checks** — the `isOwner` / `isAdmin` defs above.
> - `@user.address` — a **real onchain wallet address**; present for wallet
>   logins, **null** for email-only logins. Use it **only** for onchain / wallet
>   semantics. In `onchain: true` collections, `@user.id` and `@user.email` are
>   forbidden — only `@user.address` is allowed there.
> - `@user.email` — the verified, lowercased email (email logins only; null for
>   wallet). Use it for email-gating.
>
> So an offchain `ADMIN` constant holds a `@user.id` value (e.g. `acct_...`),
> and `owner` fields that store identity should be `String` (not `Address`).

## Resolution model (where it happens)

```
policy.json ──► (deploy / verify) ──► resolvePolicyMacros ──► validate ──► compile ──► store
                                       @const / @def inlined          literals only
```

- Runs **before** validation, bytecode compilation, and proof — so the prover and
  the realtime worker only ever see literals. Macros add **no runtime cost** and
  nothing new for the worker to understand.
- The `constants`/`defs` blocks are kept on the stored policy for transparency
  (they are reserved keys; they are never treated as collections).
- **Errors** (surfaced at `bounded deploy` / `bounded verify`):
  - `@const.X is not defined in the constants block`
  - `@def.x is not defined` / dangling macro with no source block
  - `cyclic @def reference involving "x"`
  - `constants.X must be a string, number, or boolean`

## `@const` vs `@constants` vs `--constants` (don't confuse them)

| Token / flag | Source | Resolved | Use for |
|---|---|---|---|
| **`@const.NAME`** | the policy's `constants` block | server-side, compile time | the normal case — values that live with the policy |
| `--constants NAME=value` (CLI flag) | command line | client-side, before send | one-off overrides / CI injection — **overrides `@const.NAME`** (overlaid onto the `constants` block, winning over any `environments` value; digit-only values become numbers) and also fills legacy `@constants.NAME` |
| `@constants.NAME` (legacy) | `--constants` flags | client-side text substitution (write it **unquoted**: `"limit": @constants.CAP`) | pre-existing; prefer `@const` + a block |

For values that differ per environment (staging vs prod admin address, caps),
keep `@const.NAME` and supply the values from an `environments` block —
[environments.md](environments.md).

## Related
- [environments.md](environments.md) — per-environment `@const` values + appId targeting
- [roles.md](roles.md) — `@const.ADMIN` in role members
- [invariants.md](invariants.md) — `@const` for caps/limits
- [policy-reference.md](policy-reference.md) — all top-level blocks
