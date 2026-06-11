# Policy Generation Guide

This is the methodology: how to turn a plain-English app description into a
correct `policy.json` that verifies clean. Read it before writing any policy.

The product is the policy. A backend that "works" but lets an agent overspend, or
lets one tenant read another's data, is a broken backend that happens to compile.
A good policy makes those failures *provably impossible*. This guide gets you
there.

## The method (eight steps)

Work in this order. Each step narrows the next.

1. **Collections & path keys** — what objects exist, and how ownership nests.
2. **Field types** — the shape of each document; mark `!` readonly and `?` optional.
3. **Auth rules** — who may read/create/update/delete each collection.
4. **Identify the non-negotiables** — the properties that must hold *forever, across
   every write*, or money/tenancy/quotas break. This is the step everyone skips.
5. **Express non-negotiables as invariants** — `conserve` / `rollingSum` /
   `tenantTag` / `tenantEdge`.
6. **Choose tiers** — `durable` for anything an invariant protects; `ephemeral` /
   `checkpointed` only when justified.
7. **Add the extras the description needs** — hooks, scheduled jobs, webhooks,
   search, files. Nothing the description didn't ask for.
8. **Verify → read counterexamples → fix → deploy.**

---

### Step 1 — Collections & path keys

A collection is a **path template**: a top-level key in `policy.json`. Segments
alternate between a collection name and a `$variable` (the document id), so a path
always has an even number of segments.

```
orgs/$orgId                      # a collection of orgs
orgs/$orgId/members/$memberId    # members nested under an org
orgs/$orgId/docs/$docId          # docs nested under an org
```

Nesting encodes **ownership and scope**. A write to `orgs/o1/docs/d9` binds
`$orgId = "o1"` for every rule and invariant on that template — you get the
tenant for free in the path. Reach for nesting whenever a child belongs to a
parent (members of an org, orders of a buyer, messages in a room).

Map nouns in the description to collections. "Orgs have members and documents" →
three templates above. "Each buyer places orders" → `buyers/$buyerId/orders/$orderId`.

There are **no array or object fields**. Model a list as a sub-collection, not a
field: members are `orgs/$orgId/members/$memberId`, never a `members` array.

### Step 2 — Field types

`fields` maps names to types. Base types: `String`, `Int`, `UInt`, `Bool`,
`Address`, `Float`. Suffixes compose: `?` optional, `!` readonly-after-create,
`!?` both.

| Decision | Rule |
|---|---|
| Will an invariant sum this field over time? | Use `UInt` (rollingSum **requires** UInt). |
| Will an invariant conserve this total? | Use `Int` or `UInt`. |
| Is it a tenant tag the policy will bind? | Use `String` (tenantTag/tenantEdge require String). |
| A timestamp? | `UInt` Unix seconds. There is no Timestamp type. |
| Set once and never changed (owner, author)? | Mark `!` so immutability becomes a proof obligation. |
| Genuinely optional? | Mark `?` — but then **null-guard it in rules** (see step 8). |
| An onchain collection? | No `Float` (use Int/UInt). |

Prefer `!` aggressively. An `owner: "Address!"` field proves no payload can ever
reassign ownership — a free, strong guarantee.

### Step 3 — Auth rules

`rules` gates the four actions with boolean expressions. **An omitted action
defaults to deny.** Give every collection an explicit, deliberate rule for each of
`read`, `create`, `update`, `delete` — even if the answer is `"false"`.

The expression language (full reference in
[policy-reference.md](policy-reference.md)):

- `@user.address` — the authenticated caller, or `null` if unauthenticated.
- `@data.field` — the existing document (not in `create`).
- `@newData.field` — the incoming document (not in `delete`).
- `@time.now` — server time, seconds.
- `$pathVariable` — any variable from the path.
- `get(/path).field` — read another document's pre-transaction state.
- `getAfter(/path).field` — read staged (in-batch) state.
- Operators: `&&` `||` `==` `!=` `<` `<=` `>` `>=` `+` `-` `*` `//` `**`.
  **`//` is integer division; plain `/` is reserved for paths and is rejected.**
- **No ternary.** Branch with `(cond && A) || (!cond && B)`.

There is **no built-in role system and no `@constants`**. Express "admin" by
comparing against a member's role read with `get()`, or against a known address
literal. (`@constants.ADMIN` is *not* a valid variable — the validator rejects it.)

The single most important rule pattern — **always lead a write rule with an auth
guard**:

```json
"create": "@user.address != null && @newData.owner == @user.address"
```

Without the `@user.address != null &&`, an unauthenticated caller writing
`owner: null` satisfies `null == null` and the rule passes. The prover will hand
you this exact counterexample; write the guard up front.

Cross-collection authorization uses `get()`:

```json
"update": "@user.address != null && get(/orgs/$orgId/members/@user.address).role == \"admin\""
```

### Step 4 — Identify the non-negotiables

Stop and ask: **what must be true no matter what any caller, agent, hook, or bug
does?** These are the properties a rule alone cannot guarantee, because a rule
only sees one write in isolation. Look for:

- **Money / value that must not be created or destroyed** → conservation. ("A
  transfer moves balance; the total never changes.")
- **Quotas / rate limits / budgets over time** → rolling caps. ("This agent
  spends at most 100/hour." "A player sends at most 20 inputs/second.")
- **Tenant / ownership isolation** → tenant tags and edges. ("A document always
  belongs to its org." "An order's items never reference another seller.")

If the description involves spending, balances, multi-tenant data, or per-actor
limits, there is a non-negotiable hiding in it. Name each one as a sentence
("each buyer spends at most $5000/day"); step 5 turns the sentence into an
invariant.

If you skip this step, the policy still compiles — it just doesn't protect
anything. This is the #1 way a generated policy is *wrong but green*.

### Step 5 — Express non-negotiables as invariants

Each non-negotiable maps to one invariant type. Full detail and every key in
[invariants.md](invariants.md); the mapping:

| Non-negotiable sentence | Invariant |
|---|---|
| "The total of X never changes" | `conserve` on a UInt/Int field |
| "At most N of X per window (per actor)" | `rollingSum` (+ `scopeVariable` for per-actor) |
| "This document always belongs to its $tenant" | `tenantTag` |
| "This reference stays inside the same tenant" | `tenantEdge` |

Give every invariant a `name` — it is the `409` error code at runtime.

```json
"invariants": [
  { "type": "rollingSum", "name": "daily_spend_cap",
    "field": "amountUsd", "windowSeconds": 86400, "limit": 5000,
    "scopeVariable": "$buyerId" }
]
```

### Step 6 — Choose tiers

| Tier | Semantics | Use for |
|---|---|---|
| `durable` | Committed before the caller sees success. **Required** for `rollingSum` and materialized/sharded `conserve`. | money, ledgers, quotas — anything an invariant protects |
| `checkpointed` | Interval-batched to storage; bounded loss window on hard failure. | high-write app state, presence, counters |
| `ephemeral` | In-memory only; gone on restart; fastest. | game ticks, cursors, transient room state |

Default to `durable`. Declaring `rollingSum` or non-direct `conserve` on a
non-durable collection is a **deploy error**, not a silent downgrade — so even a
realtime game's per-player rate-cap collection must be `durable`.

### Step 7 — Add the extras the description needs

Only what the description asks for:

- **Side effects on write** → `hooks.offchain.{create,update,delete}` (call
  `@DocumentPlugin.putDocument` / `updateField`). See
  [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md).
- **Recurring jobs** (reset a quota nightly) → `hooks.scheduled.<name>` + a
  `schedule: { every, run }`.
- **One-shot timers** (fire a reminder when due) → `hooks.scheduled.<name>` +
  `dueRows: { run, onComplete }`.
- **Notify an external system** → `webhooks: [{ url, on }]`.
- **Full-text search** → `search: { fields: [...] }`. See
  [files-and-search.md](files-and-search.md).
- **File uploads** → a `type: "storage"` collection.
- **Realtime rooms / multiplayer** → a `session` block + `hooks.tick`. See
  [realtime-and-games.md](realtime-and-games.md).

### Step 8 — Verify, read counterexamples, fix, deploy

```bash
bounded verify
```

Every DISPROVED is a concrete breaking assignment. The two you will hit most:

1. **The `null` counterexample** — an optional field makes a "tautology" false.
   `amount <= 100 || amount > 100` is DISPROVED by `amount = null`. Fix: drop the
   `?`, or guard (`@newData.amount != null && @newData.amount <= 100`).
2. **The `null == null` auth bypass** — `@newData.owner == @user.address` is
   satisfied by an unauthenticated caller writing `owner: null`. Fix: prepend
   `@user.address != null &&`.

Never weaken the property to make a proof pass — the counterexample is a write
production would have accepted. Strengthen the expression, re-verify until clean,
run the [quality checklist](docs/quality-checklist.md), then `bounded deploy`.

---

## Worked example A — Team SaaS (orgs, members, docs)

**Description:** "Orgs have an owner. Owners and admins can add members with a
role. Any member can read and write the org's documents; only admins can delete
them. Documents are searchable, and a document's author must be a member of the
same org. Nothing leaks across orgs."

Non-negotiables identified in step 4:

- Members and docs **always belong to their org** → `tenantTag` on each.
- A doc's `authorRef` **must point at a member of the same org** → `tenantEdge`.

This policy verifies clean against the real validator.

```json
{
  "orgs/$orgId": {
    "fields": { "name": "String", "owner": "Address!" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && @newData.owner == @user.address",
      "update": "@user.address != null && @data.owner == @user.address",
      "delete": "@user.address != null && @data.owner == @user.address"
    }
  },
  "orgs/$orgId/members/$memberId": {
    "fields": { "org": "String", "role": "String", "wallet": "Address!" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && (get(/orgs/$orgId).owner == @user.address || get(/orgs/$orgId/members/@user.address).role == \"admin\")",
      "update": "@user.address != null && get(/orgs/$orgId/members/@user.address).role == \"admin\"",
      "delete": "@user.address != null && get(/orgs/$orgId).owner == @user.address"
    },
    "invariants": [
      { "type": "tenantTag", "name": "member_org", "field": "org", "pathVariable": "$orgId" }
    ]
  },
  "orgs/$orgId/docs/$docId": {
    "fields": { "org": "String", "title": "String", "body": "String", "authorRef": "String" },
    "tier": "durable",
    "search": { "fields": ["title", "body"] },
    "rules": {
      "read": "@user.address != null && get(/orgs/$orgId/members/@user.address).role != null",
      "create": "@user.address != null && get(/orgs/$orgId/members/@user.address).role != null",
      "update": "@user.address != null && get(/orgs/$orgId/members/@user.address).role != null",
      "delete": "@user.address != null && get(/orgs/$orgId/members/@user.address).role == \"admin\""
    },
    "invariants": [
      { "type": "tenantTag", "name": "doc_org", "field": "org", "pathVariable": "$orgId" },
      { "type": "tenantEdge", "name": "author_same_org",
        "field": "org", "referenceField": "authorRef",
        "targetScope": "orgs/$orgId/members/$memberId",
        "targetField": "org", "targetPathVariable": "$memberId" }
    ]
  }
}
```

What the proofs buy you here: membership is the *closure* of the owner plus
admin-gated additions (`get()`-based role checks); a document can never be written
under one org while tagged with another (`tenantTag`); and an author reference can
never cross orgs (`tenantEdge` ties source and target tags). "Nothing leaks across
orgs" is no longer a hope — it is discharged at deploy.

## Worked example B — Marketplace (listings, orders, spend cap)

**Description:** "Sellers post listings (publicly readable, only the seller edits
their own). Buyers place orders; an order is immutable once placed. A buyer can
spend at most $5,000 per day across all orders. Listings are searchable, and a
listing always belongs to its seller; an order always belongs to its buyer."

Non-negotiables:

- A listing belongs to its seller, an order to its buyer → `tenantTag` on each.
- Per-buyer daily spend ceiling → `rollingSum` with `scopeVariable: "$buyerId"`.
- Orders immutable → `update`/`delete` are `"false"` (rules, not invariants).

Verifies clean:

```json
{
  "sellers/$sellerId/listings/$listingId": {
    "fields": { "seller": "String", "title": "String", "priceUsd": "UInt", "active": "Bool" },
    "tier": "durable",
    "search": { "fields": ["title"] },
    "rules": {
      "read": "true",
      "create": "@user.address != null && $sellerId == @user.address && @newData.seller == @user.address",
      "update": "@user.address != null && $sellerId == @user.address",
      "delete": "@user.address != null && $sellerId == @user.address"
    },
    "invariants": [
      { "type": "tenantTag", "name": "listing_seller", "field": "seller", "pathVariable": "$sellerId" }
    ]
  },
  "buyers/$buyerId/orders/$orderId": {
    "fields": { "buyer": "String", "listingRef": "String", "seller": "String", "amountUsd": "UInt" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null && $buyerId == @user.address",
      "create": "@user.address != null && $buyerId == @user.address && @newData.buyer == @user.address",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      { "type": "tenantTag", "name": "order_buyer", "field": "buyer", "pathVariable": "$buyerId" },
      { "type": "rollingSum", "name": "daily_spend_cap",
        "field": "amountUsd", "windowSeconds": 86400, "limit": 5000,
        "scopeVariable": "$buyerId" }
    ]
  }
}
```

The order collection is an **append-only event log** because of the rolling cap:
`update`/`delete` are rejected so the spend history a cap is computed from can't be
rewritten. Each order is a new document with a fresh id. The `$buyerId ==
@user.address` guard in the order rule means the path itself enforces "you may
only place orders under your own buyer id."

## Worked example C — Realtime game (rooms, tick, fog-of-war, settlement)

**Description:** "Players join a room. The server advances game state on a fast
tick — clients never write state, only send *intents*. Each player has a
fog-of-war view: they only see what they're allowed to. A player can send at most
20 input-weight per second. When the room ends, per-player scores settle into a
durable results table."

Design moves (full rationale in [realtime-and-games.md](realtime-and-games.md)):

- Room and view/score collections are `ephemeral` (fast, in-memory ticks).
- State is **server-authoritative**: `update`/`delete` are `"false"`; only the
  `hooks.tick` advances state. Clients write to `intents` only.
- Fog-of-war: each player reads only `view/$playerId` where `$playerId ==
  @user.address`.
- Per-player rate cap is a `rollingSum` — which **requires `durable` tier**, so the
  `intents` collection is durable while the rest of the room is ephemeral.
- `session.settleTo` + `settleFrom` fold per-player scores into a durable
  `results` row when the room ends.

Verifies clean:

```json
{
  "rooms/$roomId": {
    "tier": "ephemeral",
    "fields": { "status": "String", "tick": "UInt" },
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "tick": { "advance": "@DocumentPlugin.updateField(\"rooms/system\", \"tick\", \"1\")" }
    },
    "session": {
      "checkpointSeconds": 5,
      "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 },
      "settleTo": "results/$roomId",
      "settleFrom": { "collection": "rooms/$roomId/scores/$playerId", "field": "points", "op": "sum", "as": "total" }
    }
  },
  "rooms/$roomId/intents/$intentId": {
    "tier": "durable",
    "fields": { "player": "String", "kind": "String", "weight": "UInt" },
    "rules": {
      "read": "false",
      "create": "@user.address != null && @newData.player == @user.address",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      { "type": "rollingSum", "name": "input_rate_cap",
        "field": "weight", "windowSeconds": 1, "limit": 20, "scopeVariable": "$roomId" }
    ]
  },
  "rooms/$roomId/view/$playerId": {
    "tier": "ephemeral",
    "fields": { "visibleJson": "String" },
    "rules": {
      "read": "@user.address != null && $playerId == @user.address",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  },
  "rooms/$roomId/scores/$playerId": {
    "tier": "ephemeral",
    "fields": { "points": "UInt" },
    "rules": {
      "read": "@user.address != null",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  },
  "results/$resultId": {
    "tier": "durable",
    "fields": { "total": "UInt" },
    "rules": {
      "read": "@user.address != null",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  }
}
```

There is no write path for a forged tick (`update: "false"` everywhere on state);
a client patched to "see everything" still can't, because hidden data never enters
its `view/$playerId`; and superhuman input rates are rejected by the proven
`input_rate_cap`. What no backend can cure — a script firing *legal* inputs at
*human* timing — is called out honestly in
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md).

---

## Common mistakes (caught by the validator or the prover)

| Mistake | What happens | Fix |
|---|---|---|
| `@constants.ADMIN` in a rule | rejected: not a valid variable | compare a `get()`-read role, or an address literal |
| `@TokenPlugin.transfer` in `hooks.offchain` | rejected: onchain plugin in offchain context | use `@DocumentPlugin.putDocument` / `updateField` |
| `a / b` for division | rejected: `/` is for paths | use `//` (integer division) |
| `@data` in a `create` rule | rejected: nothing exists yet | use `@newData` |
| `@newData` in a `delete` rule | rejected: nothing being written | use `@data` |
| `rollingSum` on `ephemeral`/`checkpointed` | deploy error | set `tier: "durable"` |
| `rollingSum` field typed `Int` | rejected: must be `UInt` | use `UInt` |
| onchain collection with `"read": "<expr>"` | rejected: onchain data is public | set `"read": "true"` |
| Write rule without `@user.address != null` | DISPROVED (`null == null` bypass) | lead with the auth guard |
| Optional field in a numeric guard | DISPROVED (`null` counterexample) | null-guard or make it required |
| No invariant on a money/quota field | green but unprotected | add the invariant (step 4) |

## Related

- [policy-reference.md](policy-reference.md) — full syntax for every config key
- [invariants.md](invariants.md) — invariant types and the RULES-vs-INVARIANTS guide
- [quality-checklist.md](quality-checklist.md) — the pre-deploy self-check
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — reading proof failures
</content>
