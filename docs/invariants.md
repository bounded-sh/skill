# Invariants — Declaring the Non-Negotiables

Invariants are **transaction postconditions**: declared once on a collection,
proven at deploy ([verify-and-counterexamples.md](verify-and-counterexamples.md)),
and enforced atomically on every write path at runtime — including `set-many`
batches, where the whole batch commits or nothing does.

Every invariant accepts an optional `name`. The name is what comes back in the
`409` when a write violates it, so **name them like error codes**:
`spend_cap`, `no_minting`, `task_tenancy`.

Common keys: `type`, `field`, `name`, `scope` (alternate path template to
bind), `onchain` (coverage claim — see the last section).

## `conserve` — sums don't change

The total of an `Int`/`UInt` field across the collection is preserved by
every transaction: transfers can move value, nothing can mint or burn it. A
`set-many` that debits one document must credit another **in the same batch**.

```json
{
  "accounts/$accountId": {
    "fields": { "balance": "Int", "owner": "String!" },
    "tier": "durable",
    "invariants": [
      { "type": "conserve", "name": "no_minting",
        "field": "balance", "materialization": "direct" }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | `Int` or `UInt` field to conserve |
| `materialization` | no | `direct` (default): sums the write set. `materialized`: keeps a backing aggregate row. `sharded`: spreads the aggregate across fixed shard rows for hot collections. Both non-direct modes require `tier: "durable"` and **fail closed** on missing/corrupt aggregate state |
| `scope` | no | Alternate path template to bind |
| `name` | no | Stable name surfaced on `409` |

## `rollingSum` — caps over time windows

The sum of a `UInt` field over a sliding window of the last `windowSeconds`
never exceeds `limit`. Capped collections are **append-only event logs**:
updates and deletes are rejected (`409 append_only`), so the history a cap is
computed from cannot be rewritten. Platform creation time is the clock.

```json
{
  "agents/$agentId/spend/$spendId": {
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "invariants": [
      { "type": "rollingSum", "name": "per_agent_hourly_cap",
        "field": "amount", "windowSeconds": 3600, "limit": 100,
        "scopeVariable": "$agentId" },
      { "type": "rollingSum", "name": "global_daily_cap",
        "field": "amount", "windowSeconds": 86400, "limit": 1000 }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | `UInt` field that is summed |
| `windowSeconds` | yes | Positive safe integer window length |
| `limit` | yes | Nonnegative safe integer cap |
| `scopeVariable` | no | A `$variable` from the path — see partitioned caps below |
| `name` | no | Stable name surfaced on `409` |

`rollingSum` requires `tier: "durable"` and rejects `materialization` /
`pathVariable` metadata.

### Partitioned caps (`scopeVariable`)

With `"scopeVariable": "$agentId"`, the cap holds **per value** of that
variable: every agent gets its own 100/hr budget instead of all agents sharing
one pool. The proof is the same rolling-limit algebra, quantified per
partition — the verifier's obligation message says
`per $agentId partition` explicitly.

Use partitioned caps for per-agent budgets, per-user quotas, per-tenant rate
ceilings. Use an unpartitioned cap for global ceilings. Both can coexist on
the same field (example above: per-agent hourly + global daily).

### Multi-window caps

Declare several `rollingSum` invariants on the **same field** with different
`windowSeconds` — each window is tracked and proven independently (hourly and
daily above). Changing a window's length starts that window's tracking fresh.

## `tenantTag` — documents carry their tenant

Binds a `String` field to a path variable: every accepted write to
`tenants/$tenantId/tasks/$taskId` has `tenant == $tenantId`, always. This is
the anchor of tenant isolation — once tagged, data cannot be written under
one tenant while claiming another.

```json
{ "type": "tenantTag", "name": "task_tenancy",
  "field": "tenant", "pathVariable": "$tenantId" }
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | `String` tag field |
| `pathVariable` | yes | `$variable` that must exist in the (scoped) path |

## `tenantEdge` — references stay inside the tenant

Protects a reference field: the document it points at must exist, live in
`targetScope`, and carry the **same tenant tag** as the source. References
are exact document paths, or bare ids resolved via `targetPathVariable`.

```json
{
  "tenants/$tenantId/tasks/$taskId": {
    "fields": { "tenant": "String", "assigneeRef": "String", "title": "String" },
    "invariants": [
      { "type": "tenantTag", "field": "tenant", "pathVariable": "$tenantId" },
      { "type": "tenantEdge", "name": "assignee_same_tenant",
        "field": "tenant", "referenceField": "assigneeRef",
        "targetScope": "tenants/$tenantId/members/$memberId",
        "targetField": "tenant", "targetPathVariable": "$memberId" }
    ]
  },
  "tenants/$tenantId/members/$memberId": {
    "fields": { "tenant": "String" },
    "invariants": [
      { "type": "tenantTag", "field": "tenant", "pathVariable": "$tenantId" }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | Source tenant tag field (`String`) |
| `referenceField` | yes | `String` field holding the reference |
| `targetScope` | yes | Path template of the target — must exist in the policy |
| `targetField` | yes | Tenant tag field on the target (`String`) |
| `targetPathVariable` | no | For bare-id references: which target path variable the id fills |

Tag both ends: `tenantEdge` compares tags, so source and target scopes each
need their `tenantTag`.

## `onchain` — coverage claims are verified, not trusted

Each invariant may declare `"onchain"`: `"offchainOnly"`,
`"onchainUnsupported"`, or `"onchainSupported"`. The offchain realtime runtime
enforces **all four** invariant types. `onchainSupported` is accepted only for
the subset the onchain runtime actually enforces — direct `conserve`,
`tenantTag`, and `rollingSum` (epoch-bucketed) — and only on collections
declared `"onchain": true`. Anything beyond the subset is **rejected at verify
time**; an onchain runtime receiving unknown metadata rejects the write rather
than skipping the check. Details: [proof-coverage.md](proof-coverage.md).

## When NOT to use an invariant (use rules)

Invariants are for properties of the **data** that must hold across every
transaction, forever. If the property is about **who** may act, or about a
single write in isolation, it belongs in `rules`:

| Requirement | Use | Why |
|---|---|---|
| "Only the owner can update" | rule | authorization, single write |
| "Balances never go negative" | rule (`@newData.balance >= 0`) | single-write predicate; add `conserve` only if the *total* must also hold |
| "Status must be one of three values" | rule | payload validation |
| "An agent spends at most 100/hr" | invariant (`rollingSum`) | no single-write rule can see the history |
| "Transfers can't mint money" | invariant (`conserve`) | property of the *batch*, not of one write |
| "Tasks never reference another tenant's member" | invariant (`tenantEdge`) | property of cross-document state |

Rule of thumb: if violating it means a bug in your app, write a rule. If
violating it means losing money or leaking a tenant, write an invariant — and
let the prover carry it. Declaring rule-shaped conditions as invariants buys
nothing (the rule path is already proven for auth/immutability properties)
and costs you flexibility: invariants bind every write path, including your
own migrations.

## Related

- [verify-and-counterexamples.md](verify-and-counterexamples.md) — what each invariant compiles to in the proof report
- [data-plane.md](data-plane.md) — how violations surface at runtime (409 + name)
- [proof-coverage.md](proof-coverage.md) — which runtime enforces what
