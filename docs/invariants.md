# Invariants — Declaring the Non-Negotiables

**What's in here / when to read this:** the five invariant types — `conserve`,
`rollingSum`, `bound`, `tenantTag`, `tenantEdge` — and the rule-vs-invariant decision.

Invariants are **transaction postconditions**: declared once on a collection
and enforced atomically on every write path at runtime — including hooks, ticks,
schedules, and `set-many` batches, where the whole batch commits or nothing does.
Nothing has an exemption from an invariant. Four of the five types
(`conserve`, `rollingSum`, `tenantTag`, `tenantEdge`) are additionally **proven
at deploy** ([verify-and-counterexamples.md](verify-and-counterexamples.md)).
`bound` is **runtime-enforced only** — the proof engine does not support it
(see its section) — so a policy with a `bound` does not pass `verify`/`deploy`.

Every invariant accepts an optional `name`, surfaced in the `409` when a write
violates it. **Name them like error codes:** `spend_cap`, `no_minting`,
`task_tenancy`.

There are five types: `conserve`, `rollingSum`, `bound`, `tenantTag`, `tenantEdge`.

## RULES vs INVARIANTS — the decision

This is the call you make in step 4 of generation. Get it right and the policy
protects what matters; get it wrong and it's green but hollow.

> **Rules** answer *who may act* and judge **one write in isolation**.
> **Invariants** answer *what must hold across every transaction*, including
> writes a rule can't see (the rest of the batch, the history, another document).

| Requirement | Use | Why |
|---|---|---|
| "Only the owner can update" | rule | authorization, single write |
| "Status must be one of three values" | rule | payload validation |
| "Balance never goes negative" | rule (`@newData.balance >= 0`) | single-write predicate |
| "The total balance never changes" | invariant (`conserve`) | property of the *batch*, not one write |
| "An agent spends at most 100/hr" | invariant (`rollingSum`) | no single write can see the history |
| "A doc always belongs to its tenant" | invariant (`tenantTag`) | binds the tag on every write path |
| "A reference never crosses tenants" | invariant (`tenantEdge`) | property of cross-document state |

Rule of thumb: **if violating it means an app bug, write a rule. If violating it
means losing money or leaking a tenant, write an invariant** and let the prover
carry it. Declaring rule-shaped conditions as invariants buys nothing and costs
flexibility — invariants bind every write path, including your own migrations.

Common keys across types: `type`, `field`, `name`, `scope` (an alternate path
template to bind the invariant to), `onchain` (coverage claim — last section).

## `conserve` — sums don't change

The total of an `Int`/`UInt` field across the collection is preserved by every
transaction: transfers can move value, nothing can mint or burn it. A `set-many`
that debits one document must credit another **in the same batch**.

```json
{
  "accounts/$accountId": {
    "fields": { "balance": "Int", "owner": "Address!" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && @newData.owner == @user.address && @newData.balance == 0",
      "update": "@user.address != null && @data.owner == @user.address && @newData.owner == @data.owner && @newData.balance >= 0",
      "delete": "false"
    },
    "invariants": [
      { "type": "conserve", "name": "no_minting", "field": "balance", "materialization": "direct" }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | `Int` or `UInt` field to conserve |
| `materialization` | no | `direct` (default): sums the write set. `materialized`: keeps a backing aggregate row. `sharded`: spreads the aggregate across fixed shard rows for hot collections. Both non-direct modes require `tier: "durable"` and **fail closed** on missing/corrupt aggregate state. |
| `scope` | no | Alternate path template to bind |
| `name` | no | Stable name surfaced on `409` |

**What gets proven:** the runtime postcondition is *equivalent* to "affected
after-sum == affected before-sum" (delta equivalence), plus an induction step over
arbitrary multi-document write sets — so no batch, of any size, can change the
total.

**When:** balances, token supply, pooled funds, anything where value must move but
not appear or vanish.

## `rollingSum` — caps over time windows

The sum of a `UInt` field over a sliding window of the last `windowSeconds` never
exceeds `limit`. Capped collections are **append-only event logs**: updates and
deletes are rejected (`409 append_only`), so the history a cap is computed from
cannot be rewritten. Platform creation time is the clock.

> **`"update": "false"` / `"delete": "false"` is the correct idiom** for an
> append-only collection (and for any server-authoritative or immutable
> collection). A literal `false` rule is an **intentional deny**, not a mistake —
> it says "no caller may ever take this action." `bounded verify` surfaces it as a
> **non-blocking advisory** (an intentional-deny note); it is *not* reported as
> "unsatisfiable (dead code)" and does *not* fail verification or deploy. The
> canonical example below is correct and deployable. The alternative — omitting
> the rule entirely — also denies (omitted ⇒ deny), but writing `false` explicitly
> documents the intent.

```json
{
  "agents/$agentId/spend/$spendId": {
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
    "invariants": [
      { "type": "rollingSum", "name": "per_agent_hourly_cap",
        "field": "amount", "windowSeconds": 3600, "limit": 100, "scopeVariable": "$agentId" },
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
| `scopeVariable` | no | A `$variable` from the path — partitioned caps below |
| `name` | no | Stable name surfaced on `409` |

`rollingSum` requires `tier: "durable"` and rejects `materialization` /
`pathVariable` metadata.

**What gets proven:** if the runtime admits only nonnegative appended records and
the projected window sum is within `limit`, the resulting sum stays within `limit`
— for every possible sequence of appends.

### Partitioned caps (`scopeVariable`)

With `"scopeVariable": "$agentId"`, the cap holds **per value** of that variable:
every agent gets its own 100/hr budget instead of all agents sharing one pool. The
proof is the same rolling-limit algebra, quantified per partition. Use partitioned
caps for per-agent budgets, per-user quotas, per-tenant rate ceilings; use an
unpartitioned cap for global ceilings. Both can coexist on the same field (above:
per-agent hourly + global daily).

### Multi-window caps

Declare several `rollingSum` invariants on the **same field** with different
`windowSeconds` — each window is tracked and proven independently. Changing a
window's length starts that window's tracking fresh.

### Onchain rolling caps

A `rollingSum` may claim `onchain: "onchainSupported"` only on an onchain
collection and only with `windowSeconds <= 31536000`; the onchain runtime enforces
it epoch-bucketed (conservatively — it can over-enforce near the boundary, never
under-enforce). See [proof-coverage.md](proof-coverage.md).

## `bound` — hard ceilings / floors on a field (anti-cheat)

A numeric field (or every value of a map field) must always satisfy a fixed
comparison against a constant `limit`. Enforced on **every** write path — including
the live-runtime checkpoint — so a server-authoritative game's score, a counter, or
a level can never be stored out of range, no matter what a client (or a buggy tick)
proposes.

> **`bound` is RUNTIME-enforced but NOT proof-backed today.** Unlike the other
> four types, `bound` is **not** discharged by the proof engine: `bounded verify`
> rejects it with `Invariant type "bound" is not supported by proof mode`, and a
> policy that declares one cannot pass `verify` / `deploy` while the bound is
> present. The only invariant types the prover discharges today are `conserve`,
> `rollingSum`, `tenantTag`, and `tenantEdge` (see
> [proof-coverage.md](proof-coverage.md)). Use `bound` only where you accept a
> runtime-only ceiling and don't need a deploy-time proof — or, for a *proven*
> cap, express it as a `rollingSum` (a per-window total) or a single-write rule
> predicate (`@newData.score <= 11`), both of which the prover backs. The example
> below shows the shape `bound` *would* take; it does **not** prove.

```json
{
  "rooms/$roomId": {
    "tier": "checkpointed",
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
    "fields": { "score": "Int" },
    "session": { "live": { "module": "pong", "everyMs": 33 } },
    "invariants": [
      { "type": "bound", "name": "score_ceiling", "field": "score", "op": "<=", "limit": 11 }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | The field to bound. `foo.values` bounds **every value** of a map field `foo` (e.g. a per-player score map). |
| `op` | yes | One of `<=`, `>=`, `<`, `>`, `==` |
| `limit` | yes | The constant compared against (use `@const.NAME` to name it) |
| `name` | no | Stable name surfaced on the `409` |

**What gets enforced (NOT proven):** at runtime, any write whose post-state has
the bounded field (or any value of the bounded map) violating `op limit` is
rejected (`409` + `name`). At a live checkpoint, the room's snapshot is gated by
this before it reaches the provable store. But this is a **runtime-only** check —
the proof engine does not discharge a `bound` obligation (see the callout above),
so it carries no deploy-time guarantee and a policy with a live `bound` will not
pass `verify`/`deploy`. See [live-runtime.md](live-runtime.md) and
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md).

## `tenantTag` — documents carry their tenant

Binds a `String` field to a path variable: every accepted write to
`tenants/$tenantId/tasks/$taskId` has `tenant == $tenantId`, always. This is the
anchor of tenant isolation — once tagged, data cannot be written under one tenant
while claiming another.

```json
{ "type": "tenantTag", "name": "task_tenancy", "field": "tenant", "pathVariable": "$tenantId" }
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | `String` tag field |
| `pathVariable` | yes | `$variable` that must exist in the (scoped) path |

**What gets proven:** an accepted write implies the tag field equals the declared
path variable — there is no payload that tags a document with the wrong tenant.

`tenantTag` does not accept `materialization` or `scopeVariable`.

## `tenantEdge` — references stay inside the tenant

Protects a reference field: the document it points at must live in `targetScope`
and carry the **same tenant tag** as the source. References are exact document
paths, or bare ids resolved via `targetPathVariable`.

```json
{
  "tenants/$tenantId/tasks/$taskId": {
    "fields": { "tenant": "String", "assigneeRef": "String", "title": "String" },
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "@user.address != null", "delete": "@user.address != null" },
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
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "@user.address != null", "delete": "@user.address != null" },
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
| `targetField` | yes | Tenant tag field on the target (`String`) — must be `String` in the target's `fields` |
| `targetPathVariable` | no | For bare-id references: which target path variable the id fills |

**What gets proven:** an accepted reference write implies the source and target
tenant tags match — a task can never reference another tenant's member. **Tag both
ends:** `tenantEdge` compares tags, so source and target scopes each need their own
`tenantTag`. (`tenantEdge` with `targetPathVariable` stays offchain-only.)

**Writing the reference (`targetPathVariable` set):** the `referenceField` value is
a **BARE id**, not a full path. With the example above, write `assigneeRef: "A1"`
(NOT `"tenants/A/members/A1"`) — a full path errors with *"requires a single target
path segment"*. The id is resolved INSIDE the source tenant
(`tenants/<sourceTenantId>/members/A1`), so you structurally cannot point at another
tenant, and **the target must already exist** or the write is rejected (*"requires
tenants/A/members/A1 to exist before … can reference it"*). So order writes
target-first: create the member, then the task that references it.

## `onchain` — coverage claims are verified, not trusted

Each invariant may declare `"onchain"`: `"offchainOnly"`, `"onchainUnsupported"`,
or `"onchainSupported"`. The offchain realtime runtime enforces **all four**
types. `onchainSupported` is accepted only for the subset the onchain runtime
actually enforces — direct `conserve`, `tenantTag`, and `rollingSum`
(epoch-bucketed) — and only on collections declared `"onchain": true`. Anything
beyond the subset is **rejected at verify time**; an onchain runtime receiving
unknown metadata rejects the write rather than skipping the check. Details:
[proof-coverage.md](proof-coverage.md).

## `attestations` — GLOBAL, policy-wide claims

Invariants (above) attach to **one** collection. Some guarantees are **global** —
they span every collection and every read/write surface in the policy. Declare
those in a top-level **`attestations`** array (a sibling of your collections, not
nested inside one):

```json
{
  "members/$memberId": { "fields": { "active": "Bool" },
    "rules": { "read": "get(/members/@user.address) != null", "create": "get(/members/@user.address) != null" } },
  "projects/$projectId": { "fields": { "owner": "Address", "name": "String" },
    "rules": { "read": "get(/members/@user.address) != null", "create": "@user.address != null" } },
  "agents/$agentId/spend/$spendId": { "fields": { "amount": "UInt" }, "tier": "durable",
    "rules": { "read": "true", "create": "@user.address != null", "update": "false", "delete": "false" } },

  "attestations": [
    { "claim": "admins cannot read projects they are not a member of",
      "kind": "roleGatedRead", "scope": "projects/$projectId", "role": "members/$memberId" },
    { "claim": "no agent can exceed its daily spend cap",
      "kind": "rollingSum", "scope": "agents/$agentId/spend/$spendId",
      "field": "amount", "windowSeconds": 86400, "limit": 1000, "scopeVariable": "$agentId" }
  ]
}
```

### Human text vs. machine obligation

Every attestation has two halves, kept together:

- **`claim`** — the human sentence (what you'd tell a user/auditor).
- **`kind` + params** — the machine obligation Bounded actually proves with Z3.

The proof report echoes the `claim` onto each result, so the English statement and
its `PROVED` / `DISPROVED` (+ counterexample) sit side by side.

| `kind` | Use it for | Key params |
|---|---|---|
| `roleGatedRead` | "only `<role>` members can read `<scope>`/`<field>`" — closes EVERY read path (rules, relationships, queries, field exposures), not just one rule | `role`, and `scope` or `field`; **`gatedBy`** when `role` is nested (below) |
| `authorityClosure` | "membership of `<roleScope>` only grows through gated additions — no side doors" | `roleScope` (**flat `<collection>/$docId` only**), optional `initialMember` |
| `rollingSum` | a windowed cap proven **globally** (same algebra as the per-collection invariant) | `scope`, `field`, `windowSeconds`, `limit`, optional `scopeVariable` |

### Nested role scopes — `roleGatedRead` needs `gatedBy`

`roleGatedRead` derives the membership predicate automatically **only** when
`role` is a flat `<collection>/$docId` path (e.g. `members/$memberId`). For a
**multi-tenant** app, membership lives nested under the tenant
(`tenants/$tenantId/members/$memberId`), and the default derivation can't infer
the keying — verify rejects it:

```
✗ input (UNSUPPORTED)
  Role scope "tenants/$tenantId/members/$memberId" is not a simple
  "<collection>/$docId" path and no gatedBy membership predicate was provided
```

Supply an explicit **`gatedBy`** membership predicate alongside `role`. `role` is
still required (a `gatedBy` with no `role` errors `Role scope 'undefined' not
found`):

```json
{ "claim": "only members of an org can read that org's tasks",
  "kind": "roleGatedRead",
  "scope": "tenants/$tenantId/tasks/$taskId",
  "role":  "tenants/$tenantId/members/$memberId",
  "gatedBy": "get(/tenants/$tenantId/members/@user.address) != null" }
```

With both `role` (the nested member scope) and `gatedBy` (the predicate the read
rule must imply), the nested case **proves**: `✓ READ EXPOSURE: read rule
provably implies membership`.

### Nested authority — `authorityClosure` is flat-only (known limitation)

`authorityClosure` currently supports **only a flat `<collection>/$docId` role
scope**; a nested `tenants/$tenantId/members/$memberId` is rejected (`not a simple
<collection>/$docId path`) and there is **no** keying param that makes a nested
scope work today (this is a known limitation). For a multi-tenant admin set, the
recommended pattern is a **flat `admins/$address` registry** alongside the nested
tenant data:

```json
{
  "admins/$address": {
    "fields": { "tenant": "String", "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && (get(/admins/@user.address) != null || @user.address == @const.FOUNDER)",
      "update": "@user.address != null && get(/admins/@user.address) != null",
      "delete": "@user.address != null && get(/admins/@user.address) != null"
    }
  },
  "attestations": [
    { "claim": "the admin set only grows through existing admins",
      "kind": "authorityClosure", "roleScope": "admins/$address",
      "initialMember": "@const.FOUNDER" }
  ]
}
```

Keep tenant scoping for that admin as an ordinary field (`tenant`) gated in
rules; the *closure* proof rides the flat `admins/$address` scope. Use a nested
`roleGatedRead` + `gatedBy` (above) for the per-tenant read isolation.

### Plain-string shorthand — and the rule you MUST follow

You may write a bare sentence:

```json
"attestations": ["no agent can exceed its daily spend cap"]
```

But a sentence on its own proves **nothing**. The verifier surfaces it as a
**non-blocking advisory**: status `UNSUPPORTED` with a "NOT proven (advisory) —
bind to prove" note. It is **never counted as proven** (that preserves soundness —
a bare claim is never treated as attested), but it also **does not fail the run or
block deploy**. **A natural-language claim is never trusted until you compile it
into a bound `{ claim, kind, ... }` obligation.** That compilation is YOUR job
when generating a policy: read the user's English guarantee, pick the `kind` that
captures it, and fill in the params. A bare string is fine as a visible TODO
marker you can ship with — it just buys no guarantee until you bind it.

Mapping intent → kind:
- "X can only be read by members/owners/admins" → `roleGatedRead`.
- "only existing admins can add admins" / "the admin set can't be hijacked" → `authorityClosure`.
- "no more than N per window" / "spend/rate cap" → `rollingSum` (add `scopeVariable` for per-entity caps).
- A cross-collection sum that must stay constant → usually a per-collection `conserve` invariant, not an attestation (attestations don't yet have a `conserve` kind).

Attestations run in the same `verify` pass as invariants and show up under the
`__policy__/attestations` scope of the report.

## When NOT to use an invariant

See the RULES-vs-INVARIANTS table at the top. In short: if the property is about
*who* may act, or about a single write in isolation, it is a rule, not an
invariant. Declaring rule-shaped conditions as invariants buys nothing (the rule
path is already proven for auth/immutability) and binds every write path — including
your migrations.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — choosing invariants from a description
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — what each invariant compiles to in the proof report
- [data-plane.md](data-plane.md) — how violations surface at runtime (409 + name)
- [proof-coverage.md](proof-coverage.md) — which runtime enforces what
