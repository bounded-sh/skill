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
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
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
  CLI's convention): `"read": "@user.address == @const.ADMIN"` →
  `@user.address == '7xKQ...wallet'`; `"@data.n > @const.DAILY_CAP"` →
  `@data.n > 5000`.

## defs — reusable rule fragments

```json
{
  "constants": { "ADMIN": "7xKQ...wallet" },
  "defs": {
    "isOwner": "@user.address == @data.owner",
    "isAdmin": "@user.address == @const.ADMIN",
    "canEdit": "@def.isOwner || @def.isAdmin"
  },
  "posts/$id": {
    "rules": {
      "read": "true",
      "create": "@user.address == @newData.owner",
      "update": "@def.canEdit",
      "delete": "@def.isAdmin"
    },
    "fields": { "owner": "Address", "body": "String" }
  }
}
```

- A def is a **rule-fragment string**. Reference it as `@def.name`.
- Defs are inlined **wrapped in parens** so they compose safely inside larger
  boolean expressions: `@def.canEdit` above becomes
  `((@user.address == @data.owner) || (@user.address == '7xKQ...wallet'))`.
- Defs may reference **other defs and constants** (resolved recursively). A
  **cycle is a compile error**.

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
| `--constants NAME=value` (CLI flag) | command line | client-side, before send | one-off overrides / CI injection |
| `@constants.NAME` (legacy) | `--constants` flags | client-side | pre-existing; prefer `@const` + a block |

For values that differ per environment (staging vs prod admin address, caps),
keep `@const.NAME` and supply the values from an `environments` block —
[environments.md](environments.md).

## Related
- [environments.md](environments.md) — per-environment `@const` values + appId targeting
- [roles.md](roles.md) — `@const.ADMIN` in role members
- [invariants.md](invariants.md) — `@const` for caps/limits
- [policy-reference.md](policy-reference.md) — all top-level blocks
