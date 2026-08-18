# Policy cheat sheet

One screen of the things every policy uses. Full semantics: [policy reference](policy-reference.md). Onchain plugin signatures: [plugin catalog](../../bounded-onchain/docs/plugins.md).

## Skeleton

```json
{
  "auth": { "wallets": true },
  "constants": { "ADMIN": "8f...Yk" },
  "tenants/$tenantId/invoices/$invoiceId": {
    "description": "what this collection is",
    "tier": "durable",
    "fields": { "owner": "Address!", "amount": "UInt!", "paid": "Bool" },
    "rules": { "read": "...", "create": "...", "update": "...", "delete": "..." },
    "invariants": [],
    "hooks": { "onchain": {}, "offchain": {} },
    "queries": { "name": { "returnType": "UInt", "query": "..." } }
  }
}
```

Paths alternate collection/`$variable` (always an even number of segments). An omitted rule denies. Two templates may not collide modulo variable names.

## Field types

Exactly `String`, `Int`, `UInt`, `Bool` (never `Boolean`), `Float` (offchain only), `Address`; suffixes `?` optional, `!` readonly-after-create, `!?` both. No arrays or objects - use sub-collections. No `Timestamp` - use `UInt` seconds. Every `!` field needs `@newData.x == @data.x` in the update rule (or `update: "false"`). Leading `_` names are reserved system fields. `fields` may be omitted, but then each field's type is inferred from the rules, so declare a field's type whenever rules compare it as more than one type - a fieldless collection whose rules compare one field to both a string and a number is refused at deploy and named.

## Rule variables

| Variable | Use | Restriction |
|---|---|---|
| `@user.id` | ownership, membership (universal principal) | offchain only |
| `@user.address` | wallet semantics; the only principal in onchain rules | - |
| `@user.email` / `@user.isAnonymous` | verified email; guest gate (`== false`, no unary `!`) | offchain only |
| `@origin.kind` / `@origin.module` ... | platform-set call provenance (`'live'`, `'user'`) | offchain only |
| `@data.f` / `@newData.f` | stored vs incoming field | not in create / not in delete |
| `@time.now` | server rule clock (seconds); pair with `serverTimestamp()` | - |
| `$pathVar` | path template variable | - |
| `get(/p)` / `getAfter(/p)` | pre-transaction / staged post-write read | unquoted path, leading `/`; `getAfter` not in read rules |
| `@const.X` / `@def.x` | declared constant / reusable rule fragment | never `@constants.` |

## Operators

`&&` `||`, `==` `!=` `<` `<=` `>` `>=`, `+ - * ** //` (integer division; plain `/` is for paths only). No ternary, no string concatenation: branch with `(cond && A) || (!cond && B)`; embed variables in paths directly (`get(/teams/@newData.teamId/members/@user.address)`).

## Tiers

`durable` (committed before success; required for `rollingSum` and materialized/sharded conservation) - `checkpointed` (interval-batched) - `ephemeral` (in-memory). See [policy reference](policy-reference.md#tiers).

## Where logic goes

| You want | Plane |
|---|---|
| authorization / validation (403) | `rules` - pure boolean, proven by `bounded verify` |
| cross-transaction caps, conservation, tenant isolation (409) | `invariants`: `rollingSum`, `windowSum`, `flowBound`, `conserve`, `tenantTag`, `tenantEdge`, `bound` - [invariants](invariants.md) |
| side effects on write | `hooks.offchain` (DocumentPlugin only; post-commit, never gates) / `hooks.onchain` (all onchain plugins; `false` aborts the whole Solana write) - [hooks](hooks-scheduled-webhooks.md) |
| moving funds, custody | `hooks.onchain` + the custody rule - [custody and PDAs](../../bounded-onchain/docs/custody-and-pdas.md) |
| read shaped for clients | `queries` (named, typed) - [queries](queries.md) |
| server logic beyond expressions | functions - [when to use](functions-when-to-use.md) |

## Onchain collection extras

`"onchain": true` requires `"read": "true"`; rules use `@user.address` only; no `Float`; cannot `get()` offchain collections; updates are patches - omit `!` fields from update payloads or the program rejects with `FieldReadOnly`. Real-network budgets and failure lookup: [onchain troubleshooting](../../bounded-onchain/docs/onchain-troubleshooting.md).

## Five most common rejections

1. `Boolean` as a type (use `Bool`); `Number`/`Timestamp` (use `UInt`).
2. `!` field without a preservation clause in the update rule.
3. Mutating plugin call in `rules` or in `hooks.offchain` (belongs in `hooks.onchain`).
4. Client-computed "now" compared against `@time.now` (use `serverTimestamp()`).
5. `@user.id`, `@origin.*`, or `Float` inside an `onchain: true` collection.
