# Policy Reference — `policy.json`

One JSON file defines the backend: collections, types, auth rules, side-effect
hooks, schedules, webhooks, search, and invariants. Everything is validated at
deploy; the constraints are proven. Invariants get their own doc:
[invariants.md](invariants.md). For the method of *generating* a policy, see
[policy-generation-guide.md](policy-generation-guide.md).

## Collections & path templates

Top-level keys (other than `links`) are **path templates**. Segments alternate
between a collection name and a `$variable` (the document id), so paths always have
an even number of segments:

```json
{
  "tenants/$tenantId/invoices/$invoiceId": {
    "fields":     { "...": "..." },
    "rules":      { "read": "...", "create": "...", "update": "...", "delete": "..." },
    "tier":       "durable",
    "invariants": []
  }
}
```

- Collection names: letters and digits, starting with a letter.
- Id segments: `$camelCase` (alphanumeric after `$`) — they become **path
  variables** usable in rules and invariants (`$tenantId == @user.address`).
- Nesting encodes ownership: a write to `tenants/t1/invoices/i9` binds
  `$tenantId = "t1"` for every rule on that template.
- Two templates may not collide modulo variable names — `users/$a` and `users/$b`
  together is a deploy error.

## Fields

`fields` maps names to types. Names start with a letter and contain only
alphanumerics and underscores; `id`, `pathId`, `_id`, and `tarobase_*` names are
reserved.

| Type | Meaning |
|---|---|
| `String` | UTF-8 string. Required for `tenantTag`/`tenantEdge` fields. |
| `Int` | Signed safe integer. |
| `UInt` | Unsigned safe integer. **Required for `rollingSum` fields.** |
| `Bool` | true / false |
| `Float` | Decimal. **Not allowed on onchain collections** — use Int/UInt. |
| `Address` | Wallet / account address. |

Suffixes compose with every base type:

- `?` — optional (`String?`)
- `!` — **readonly after create** (`String!`) — immutability becomes a proof
  obligation, not a convention.
- `!?` — both (`String!?`)

There are **no array or object field types**. Model a list as a sub-collection.

## Rules & the expression language

`rules` gates `read`, `create`, `update`, `delete` with boolean expressions. A
false rule rejects with `403` + a trace, and the prover analyzes the same
expressions at deploy. **An omitted rule defaults to deny.**

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
| `@time.now` | Server time (seconds) | — |
| `@contract.address` | The app's contract/escrow address (onchain) | — |
| `$pathVariable` | Any variable from the path template | — |
| `get(/path)` | Read another doc, **pre-transaction** state | unquoted path, leading `/` |
| `getAfter(/path)` | Read another doc, **post-batch (staged)** state | not in `read` rules |

`get(/users/$userId).role` — property access chains off the call. `@data` /
`@newData` must reference a specific field (`@data.foo`, never bare `@data`).

> **There is no `@constants`.** The only special variables are `@user.address`,
> `@data`, `@newData`, `@time.now`, `@contract.address`. Express "admin" by
> comparing a `get()`-read role field or a literal address — not a constant.

### Operators & literals

- Logic: `&&`, `||`; comparisons `==` `!=` `<` `<=` `>` `>=`.
- Arithmetic: `+` `-` `*` `//` (integer division) `**`. **Plain `/` is reserved
  for paths — using it for division is a validation error.**
- Literals: numbers (decimals only on offchain collections), quoted strings
  (`"..."`, `'...'`, or `` `...` ``), `true`, `false`, `null`.
- **No ternary, no switch, no string concatenation.** Branch with
  `(cond && A) || (!cond && B)` chained. Build paths by embedding variables
  directly: `get(/teams/@newData.teamId/members/@user.address)`.

### Plugin functions in rules

Rules may call read-only plugin functions, e.g. `@StringUtils.length(@newData.body)
<= 280`. Transactional plugin calls belong in hooks, not rules. Available plugins
depend on the deployment; the validator rejects unknown identifiers.

### Semantic constraints the validator enforces

- `@data` cannot appear in `create` rules (nothing exists yet); `@newData` cannot
  appear in `delete` rules (nothing is being written).
- Collections declared `"onchain": true` must use `"read": "true"` — onchain data
  is public and the validator rejects pretending otherwise.
- Onchain rules cannot `get()` an offchain collection.

## Tiers

| Tier | Semantics | Use for |
|---|---|---|
| `durable` | Committed before the caller sees success. **Required** for `rollingSum` and materialized/sharded conservation. | money, ledgers, anything an invariant protects |
| `checkpointed` | Interval-batched to storage; bounded loss window on hard failure. | high-write app state, presence, counters |
| `ephemeral` | In-memory only; gone on restart; fastest. | game ticks, cursors, transient rooms |

Declaring `rollingSum` (or `materialized`/`sharded` conservation) on a non-durable
collection is a **deploy error**, never a silent downgrade.

## Hooks

`hooks.offchain` / `hooks.onchain` attach side effects to `create`/`update`/`delete`.
Offchain hooks call **offchain** plugins — chiefly `@DocumentPlugin`:

```json
"hooks": {
  "offchain": {
    "create": "@DocumentPlugin.updateField(\"counters/global\", \"total\", \"1\")"
  }
}
```

| Offchain hook call | Effect |
|---|---|
| `@DocumentPlugin.putDocument(path, data)` | create/replace a document |
| `@DocumentPlugin.updateField(path, field, value)` | set one field |

Onchain hooks (on `"onchain": true` collections) call onchain plugins like
`@TokenPlugin.transfer(...)`. **An onchain plugin in an offchain hook is rejected.**

Hooks also include `tick` and `scheduled` groups, plus an `enforceRules` flag —
full treatment in [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md):

```json
"hooks": {
  "tick":      { "advance": "@DocumentPlugin.updateField(\"rooms/sys\", \"tick\", \"1\")" },
  "scheduled": { "resetQuota": "@DocumentPlugin.updateField(\"quotas/g\", \"used\", \"0\")" },
  "enforceRules": false
}
```

**Hooks never gate.** There is no throw-from-a-hook. Authorization lives in
`rules`; cross-transaction correctness lives in `invariants`. By default a hook
bypasses the per-actor rules (it is privileged server logic); set `enforceRules`
to hold a hook to the same rules an external caller faces. A hook can never break
a proven invariant.

## Every accepted config key

The validator accepts exactly these keys on a collection (anything else is
rejected):

| Key | Shape | Doc |
|---|---|---|
| `fields` | `{ name: Type }` | this doc |
| `rules` | `{ read, create, update, delete }` | this doc |
| `tier` | `"durable" \| "checkpointed" \| "ephemeral"` | this doc |
| `invariants` | array of invariant objects | [invariants.md](invariants.md) |
| `onchain` | boolean | [proof-coverage.md](proof-coverage.md) |
| `hooks` | `{ offchain, onchain, tick, scheduled, enforceRules }` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `enforceRules` | boolean (collection-level) | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `schedule` | `{ every, run }` or an array of them | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `dueRows` | `{ run, onComplete?, doneField? }` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `webhooks` | `[{ url, on: [...] }]` | [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) |
| `search` | `{ fields: [...] }` | [files-and-search.md](files-and-search.md) |
| `queries` | `{ name: { returnType, query } }` | [queries.md](queries.md) |
| `session` | `{ settleTo, settleFrom, settleRule, checkpointSeconds, tick }` | [realtime-and-games.md](realtime-and-games.md) |
| `relationships` | `{ name: { type, collection, ... } }` | [queries.md](queries.md) |
| `type` | `"llm" \| "api" \| "storage"` | [files-and-search.md](files-and-search.md) |
| `service` / `model` / `prompt` | strings (for `type:"api"`/`"llm"`) | [files-and-search.md](files-and-search.md) |
| `isPassthrough` / `isRevealPath` | booleans (onchain) | [proof-coverage.md](proof-coverage.md) |
| `description` / `operationDetails` / `functionDescription` | docstrings | — |

Top-level `links` (an array, alongside the collection keys) declares
relationships across collections — see [queries.md](queries.md).

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — turning a description into a policy
- [invariants.md](invariants.md) — declaring the non-negotiables
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — proving the policy
- [data-plane.md](data-plane.md) — writing against the deployed policy
