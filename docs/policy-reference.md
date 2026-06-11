# Policy Reference — `policy.json`

One JSON file defines the backend: collections, types, auth rules, side-effect
hooks, and invariants. Everything is validated at deploy; the constraints are
proven. Invariants get their own doc: [invariants.md](invariants.md).

## Collections & path templates

Top-level keys are **path templates**. Segments alternate between a collection
name and a `$variable` (the document id), so paths always have an even number
of segments:

```json
{
  "tenants/$tenantId/invoices/$invoiceId": {
    "fields":     { "...": "..." },
    "rules":      { "read": "...", "create": "...", "update": "...", "delete": "..." },
    "tier":       "durable",
    "hooks":      { "offchain": { "create": "..." } },
    "invariants": []
  }
}
```

- Collection names: letters and digits, starting with a letter.
- Id segments: `$camelCase` — they become **path variables** usable in rules
  and invariants (`$tenantId == @user.address`).
- Nesting encodes ownership: a write to `tenants/t1/invoices/i9` binds
  `$tenantId = "t1"` for every rule on that template.
- Two templates may not collide modulo variable names — `users/$a` and
  `users/$b` together is a deploy error.

## Fields

`fields` maps names to types. Names start with a letter; `id`, `pathId`, and
platform-prefixed names are reserved.

| Type | Meaning |
|---|---|
| `String` | UTF-8 string |
| `Int` | Signed safe integer |
| `UInt` | Unsigned safe integer — required for `rollingSum` fields |
| `Bool` | true / false |
| `Float` | Decimal. **Not allowed on onchain collections** — use Int/UInt |
| `Address` | Wallet / account address |

Suffixes compose with every base type:

- `?` — optional (`String?`)
- `!` — **readonly after create** (`String!`) — immutability becomes a proof
  obligation, not a convention
- `!?` — both (`String!?`)

## Rules & the expression language

`rules` gates `read`, `create`, `update`, `delete` with boolean expressions.
A false rule rejects with `403` + a trace, and the prover analyzes the same
expressions at deploy.

```json
"rules": {
  "read":   "@user.address != null && @data.ownerId == @user.address",
  "create": "@user.address != null && @newData.ownerId == @user.address",
  "update": "@data.ownerId == @user.address && @newData.ownerId == @data.ownerId",
  "delete": "@data.ownerId == @user.address"
}
```

### Variables

| Variable | Meaning | Restrictions |
|---|---|---|
| `@user.address` | Authenticated caller (keypair identity); `null` when unauthenticated | — |
| `@data.field` | Existing document | **not** in `create` rules |
| `@newData.field` | Incoming document | **not** in `delete` rules |
| `@time.now` | Server time | — |
| `$pathVariable` | Any variable from the path template | — |
| `get(/path)` | Read another doc, **pre-transaction** state | unquoted path, leading `/` |
| `getAfter(/path)` | Read another doc, **post-batch (staged)** state | not in `read` rules |

`get(/users/$userId).role` — property access chains off the call. `@data` /
`@newData` must reference a specific field (`@data.foo`, never bare `@data`).

### Operators & literals

- Logic: `&&`, `||`; comparisons `==` `!=` `<` `<=` `>` `>=`.
- Arithmetic: `+` `-` `*` `//` (integer division) `**`. Plain `/` is reserved
  for paths — using it for division is a validation error.
- Literals: numbers (decimals only on offchain collections), quoted strings,
  `true`, `false`, `null`.
- **No ternary, no switch, no string concatenation.** Branching is
  `(cond && A) || (!cond && B)` chained. Path building embeds variables
  directly: `get(/teams/@newData.teamId/members/@user.address)`.

### Semantic constraints the validator enforces

- `@data` cannot appear in `create` rules (nothing exists yet); `@newData`
  cannot appear in `delete` rules (nothing is being written).
- Collections declared `"onchain": true` must use `"read": "true"` — onchain
  data is public and the validator rejects pretending otherwise.
- Onchain rules cannot `get()` offchain collections.

## Tiers

| Tier | Semantics | Use for |
|---|---|---|
| `durable` | Committed before the caller sees success. **Required** for `rollingSum` and materialized/sharded conservation | money, ledgers, anything an invariant protects |
| `checkpointed` | Interval-batched to storage; bounded loss window on hard failure | high-write app state, presence, counters |
| `ephemeral` | In-memory only; gone on restart; fastest | game ticks, cursors, transient rooms |

Declaring `rollingSum` (or `materialized`/`sharded` conservation) on a
non-durable collection is a **deploy error**, never a silent downgrade.

## Hooks

`hooks.offchain` / `hooks.onchain` attach side effects to
`create`/`update`/`delete` — transfers, plugin calls, derived writes. Hooks
are expressions chained with `&&`, so a falsy guard short-circuits later
effects.

```json
"hooks": {
  "offchain": {
    "create": "@TokenPlugin.transfer(@newData.from, @newData.to, @newData.amount)"
  }
}
```

**Hooks never gate.** There is no throw-from-a-hook. Authorization lives in
`rules`; cross-transaction correctness lives in `invariants`. If you want a
hook to "fail the write", you want a rule predicate or an invariant.

## Related

- [invariants.md](invariants.md) — declaring the non-negotiables
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — proving the policy
- [data-plane.md](data-plane.md) — writing against the deployed policy
