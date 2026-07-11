# Invariants — Declaring the Boundaries

**What's in here / when to read this:** the six boundary invariant types —
`conserve`, `rollingSum`, `flowBound`, `bound`, `tenantTag`, and `tenantEdge` —
plus the runtime-maintained `windowSum` aggregate and the rule-vs-invariant
decision.

Write-gating invariants are **transaction postconditions**. On documented
offchain mutation surfaces that route through invariant evaluation, they run
before commit and `set-many` batches remain atomic. Coverage does not extend to
unsupported type/plane combinations or inherited rows merely because a declaration was
enabled; onchain coverage is type-specific. Four types
(`conserve`, `rollingSum`, `tenantTag`, `tenantEdge`) have general invariant
encodings **discharged by SMT** during `bounded verify`; `bound` is shape-specific
(scalar offchain fields are proved, while `.values` maps remain `UNKNOWN`)
([verify-and-counterexamples.md](verify-and-counterexamples.md)). `flowBound` is
runtime-enforced but **not SMT-proven** and produces a non-blocking advisory with
proof status `UNKNOWN`, not a proof certificate. `windowSum` is structurally
validated and runtime-maintained. It is primarily a readable aggregate, has no
SMT aggregate obligation, and still write-gates updates/deletes on its event leg
to keep that history append-only.

Every invariant accepts an optional `name`, surfaced in the `409` when a write
violates it. **Name them like error codes:** `spend_cap`, `no_minting`,
`task_tenancy`.

There are six boundary types: `conserve`, `rollingSum`, `flowBound`, `bound`,
`tenantTag`, and `tenantEdge`. `windowSum` is declared in the same `invariants`
array as a seventh declaration type: it primarily maintains a readable aggregate
rather than enforcing a cap or integrity inequality, while still making its event
collection append-only.

> **Identity in the rule examples below.** The SDK `user` object is
> `{ id: string, address: string | null, email: string | null, isAnonymous: boolean }`. `@user.id` is
> the **universal stable identity** — always present for an authenticated user
> (for a wallet login it equals the wallet address; for an email/social login it
> is the account identity) — so the auth-guard, ownership, and membership rules in
> the examples below use `@user.id` (e.g. `owner == @user.id`,
> `get(/admins/@user.id)`, `@user.id != null`). `@user.address` is a **real
> onchain wallet address** (null for email-only logins) and is reserved for
> wallet/onchain semantics; `@user.email` is the verified, lowercased email (null
> for wallet logins). Inside an `"onchain": true` collection, `@user.id`,
> `@user.email`, and `@user.isAnonymous` are **forbidden** — only `@user.address` is allowed.

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
| "A user's withdrawals never exceed their deposits" | invariant (`flowBound`) | cross-collection, cumulative, and partitioned by user |
| "Show the exact 10-minute volume" | aggregate (`windowSum`) | maintains a readable sliding-window sum; it is not a cap |
| "A doc always belongs to its tenant" | invariant (`tenantTag`) | binds the tag on supported invariant-evaluated mutation paths |
| "A reference never crosses tenants" | invariant (`tenantEdge`) | property of cross-document state |

Rule of thumb: **if violating it means an app bug, write a rule. If violating it
means losing money or leaking a tenant, write an invariant.** Then check its
reported proof status: `PROVED` and `UNKNOWN` are materially different guarantees.
Declaring rule-shaped conditions as invariants buys nothing and costs flexibility
— invariants bind supported mutation paths once enabled, so plan migrations and
inherited-state validation explicitly.

Common base keys are `type`, `field`, optional `name`, and optional `onchain`
(coverage claim — last section). Metadata is type-specific: in particular,
`flowBound` and `windowSum` reject `scope` in v1 and must be declared directly on
their outflow/event collection.

## `conserve` — sums don't change

The total of an `Int`/`UInt` field across the collection is preserved by every
transaction: transfers can move value, nothing can mint or burn it. A `set-many`
that debits one document must credit another **in the same batch**.

```json
{
  "accounts/$accountId": {
    "fields": { "balance": "Int", "owner": "String!" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && @newData.owner == @user.id && @newData.balance == 0",
      "update": "@user.id != null && @data.owner == @user.id && @newData.owner == @data.owner && @newData.balance >= 0",
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

**Genesis — how value enters (read this before you ship).** `conserve` locks the
total at *whatever the sum already is the moment the invariant goes live*. The
proof has no concept of a privileged mint: a `create` or `set` that raises the
sum is rejected as minting, even for the app owner, even server-side. So the
example above — `create: balance == 0` **and** `update: balance >= 0` — is a
**frozen-at-0** system: every account is born at 0, can never go negative, and
the sum can never move off 0, so nothing can ever hold value. That schema is a
*transfer* schema, not a complete one. Pick a genesis model:

- **Seed, then conserve (positive balances — validated).** Deploy the policy
  *without* the `conserve` invariant, write your opening supply
  (`set accounts/treasury {balance: 1_000_000}`), then redeploy *with*
  `conserve` added. The total is now frozen at 1,000,000 and every later
  transfer is checked against it. (Verified e2e: seed `alice=100` pre-conserve,
  add conserve, `setMany [alice=70, bob=30]` → ✅ conserved at 100, a later
  `set alice=200` → `409`.) This is the normal way to launch a fixed-supply
  system. The seeding window is owner-only by virtue of the create/update rules,
  not the invariant.
- **Credit/debt (sum stays 0 — validated).** Drop `>= 0` from the update rule so
  balances may go negative. Every account starts at 0; a transfer is a balanced
  `set-many` that debits one and credits another (`[alice: -30, bob: +30]`), and
  the total stays exactly 0 forever. (Verified: balanced `set-many` → ok; a lone
  `set bob=80` that would mint → `409`.) Use this for ledgers/IOUs where the net
  is meant to be zero. Note the `>= 0` rule and the credit/debt model are
  mutually exclusive — if you keep `>= 0`, a system that starts at 0 can never
  move.
- **Onchain-backed.** If the value mirrors an on-chain balance, set
  `"onchain": true` on the invariant (see the onchain section) so genesis lives
  on the chain, not in a privileged offchain write.

The takeaway: there is no "admin mint" escape hatch — that is the entire point of
`conserve`. Decide genesis by *deploy order* (seed before the invariant) or by
*model* (credit/debt nets to 0), not by trying to write past the proof.

**Authorizing a transfer — the simple owner rule blocks cross-owner credits.** A peer
transfer debits one account and credits *another owner's* account in the same batch. But
`"update": "@data.owner == @user.id"` only lets you change accounts **you own** — so the
credit leg is rejected `403`, and a real transfer between two different owners is
*impossible*, even though `conserve` is satisfied. (Validated by dogfooding: a Treasury→Alice
transfer under that rule failed `403`; nothing partial applied.) To allow transfers without
allowing theft, let the owner change their own account **OR** let anyone *increase* (credit)
any account — and never let a non-owner *decrease* one:

```json
"update": "@user.id != null && @newData.owner == @data.owner && @newData.balance >= 0 && (@data.owner == @user.id || @newData.balance > @data.balance)"
```

`@data.owner == @user.id` = you may move your own balance (the debit leg); `@newData.balance
> @data.balance` = anyone may *credit* (the credit leg); a non-owner *decrease* matches
neither clause, so theft is rejected `403`. `conserve` then forces every credit to be
matched by a debit in the same `set-many`. Validated end-to-end: cross-owner transfer ✅,
stealing from another account → `403`, a lone mint → `409`, total supply unchanged. (For a
ledger/IOU you'd drop `>= 0`; for hold-then-release flows, gate the credit clause further.)

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
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
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

### Recipe — rate-limit an action with a separate event log

The examples above cap a field that *is* the value being limited (a spend log
where `amount` is the spend). The other common shape is **rate-limiting a
different action**: "no more than N messages / requests / moves per window." The
action you want to limit (a chat message, an API call, a game move) lives in its
own collection; you cap it by **atomically appending one weight=1 event to a
dedicated append-only log** in the *same* `setMany` as the real write, and put the
`rollingSum` on the log.

```json
{
  "messages/$messageId": {
    "fields": { "author": "Address!", "body": "String!", "createdAt": "UInt!" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && @newData.author == @user.address",
      "update": "false", "delete": "false"
    }
  },
  "users/$userId/posts/$postId": {
    "description": "Append-only per-author rate-limit log. Every message appends one weight=1 event here in the SAME atomic setMany.",
    "fields": { "author": "Address!", "weight": "UInt!" },
    "tier": "durable",
    "rules": {
      "read":   "@user.address != null && $userId == @user.address",
      "create": "@user.address != null && $userId == @user.address && @newData.author == @user.address && @newData.weight == 1",
      "update": "false", "delete": "false"
    },
    "invariants": [
      { "type": "rollingSum", "name": "messages_per_hour_cap",
        "field": "weight", "windowSeconds": 3600, "limit": 50, "scopeVariable": "$userId" }
    ]
  }
}
```

```ts
// Client writes BOTH legs in one atomic setMany — the message and its cap event
// commit together or not at all. The 51st post in an hour fails the whole batch
// (409), so the message is never written either.
await setMany([
  { path: `messages/${id}`,            document: { author: user.address, body, createdAt } },
  { path: `users/${user.address}/posts/${postId}`, document: { author: user.address, weight: 1 } },
]);
```

Three things make this airtight, and each is a common omission:

1. **Atomic pairing.** Write the action and the cap event in **one `setMany`**.
   Because `setMany` is all-or-nothing, you can't do the action without recording
   the event, and a rejected cap event (over the limit) rolls back the action too.
2. **Pin the weight in the create rule** (`@newData.weight == 1`). Without this a
   client can append `weight: 0` (or omit it) and **the cap never increments** —
   the limit is silently bypassed. The rule, not the client, fixes the per-event
   cost. (Use a small fixed set, e.g. `@newData.weight == 1 || @newData.weight == 5`,
   if different actions cost different amounts.)
3. **Append-only + scoped path.** `update`/`delete` are `"false"` so the history
   can't be rewritten, and `$userId == @user.address` (or `$userId == @user.id`)
   means a caller can only append under their own partition — the same
   `scopeVariable` the cap partitions on. A caller can't dilute someone else's
   budget or inflate their own by writing under another partition.

This is the pattern behind the scaffolder's chat template and any "N per window
per user" limit. Cap the field that *is* the value (the spend-log shape above)
only when the action's magnitude is itself the thing being limited.

## `windowSum` — an exact sliding-window aggregate you can READ and SORT BY

Where `rollingSum` *caps* a windowed sum at write time, `windowSum` *maintains* one
as a readable field: declare it on an **append-only event collection** and the
runtime keeps `target.targetField` equal to the exact sum of `field` over the last
`windowSeconds` — adding each event's value on create and subtracting it
automatically when the event ages out of the window (alarm-driven, no cron, no
sweep). The result is a plain numeric field: readable, subscribable, **sortable**
— and the ranked-query engine auto-indexes it, so "top-N by 10-minute volume" is
an O(k) first-class query. This is the primitive behind trending feeds and
leaderboards ([trending-feeds.md](trending-feeds.md)).

```json
{
  "trades/$marketId/ev/$id": {
    "fields": { "size": "UInt!" },
    "tier": "durable",
    "rules": { "read": "true", "create": "@user.id != null", "update": "false", "delete": "false" },
    "invariants": [{
      "type": "windowSum",
      "name": "vol10m",
      "field": "size",
      "windowSeconds": 600,
      "target": "markets/$marketId",
      "targetField": "vol10m"
    }]
  },
  "markets/$marketId": {
    "fields": { "vol10m": "UInt?" },
    "rules": { "read": "true", "create": "@user.id != null && @newData.vol10m == null", "update": "false", "delete": "false" }
  }
}
```

Semantics and constraints (validated at deploy):

1. **Exact, not approximate.** Every increment enqueues an exact decrement at
   `createdAt + windowSeconds`; Σ decrements == Σ increments per event, so the
   field is the true windowed sum at all times (up to alarm latency, typically a
   few seconds). No EWMA drift, no bucket coarseness.
2. **The event collection becomes append-only** (like `rollingSum`): an update or
   delete would falsify the maintained sum, so both are rejected.
3. **`field` must be `UInt`; `targetField` must be declared numeric**
   (`UInt?`/`Int?`) on a target template whose path variables all resolve from the
   event path. Both collections `durable` tier, non-session, offchain (v1).
4. **`targetField` is runtime-owned.** Pin it null in the target's user-writable
   rule branches (`@newData.vol10m == null`) so callers can't seed it; the
   runtime's own writes bypass rules but still honor declared invariants.
5. **Missing target**: the first event merge-creates it. A target deleted before
   an event expires drops the pending decrement (never resurrects the doc).
6. `bounded verify` reports a declared `windowSum` as a **non-blocking advisory**
   ("structurally validated, runtime-maintained") — it is an aggregate, not a
   write-gating cap, so it carries no proof obligation and cannot wedge a deploy.

Choose `rollingSum` when you need to **enforce** "no more than X per window";
choose `windowSum` when you need to **read/rank by** "how much in the last
window." They compose: the same event log can carry both.

## `flowBound` — per-partition "outflow never exceeds inflow" across two collections

`flowBound` gates a cumulative flow independently for every value of a path
variable. For each partition `p`, the offchain runtime enforces:

```text
sum(outflow.field where scopeVariable = p)
  <= sum(inflow.field where scopeVariable = p)
```

The canonical shape is an escrow where each user's releases can never exceed
that same user's deposits. Declare the invariant on the **outflow collection**
(the leg being gated), and point its `inflow` object at the other collection:

```json
{
  "vault/$user/deposits/$depositId": {
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null && $user == @user.id",
      "create": "@user.id != null && $user == @user.id",
      "update": "false",
      "delete": "false"
    }
  },
  "vault/$user/releases/$releaseId": {
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null && $user == @user.id",
      "create": "@user.id != null && $user == @user.id",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      {
        "type": "flowBound",
        "name": "released_le_deposited",
        "field": "amount",
        "scopeVariable": "$user",
        "inflow": {
          "collection": "vault/$user/deposits/$depositId",
          "field": "amount"
        },
        "onchain": "offchainOnly"
      }
    ]
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `field` | yes | Nonoptional `UInt` field summed on the declaring outflow collection |
| `scopeVariable` | yes | A `$variable` that appears as a complete path segment in both collection templates; each value gets an independent bound |
| `inflow.collection` | yes | Existing, distinct durable offchain collection template whose sum supplies the bound |
| `inflow.field` | yes | Nonoptional `UInt` field summed on the inflow collection |
| `name` | no | Stable name surfaced on a `409` |
| `onchain` | no | Omit it or set `offchainOnly`; every other value is rejected for `flowBound` v1 |

Semantics and structural requirements:

1. **Each partition is isolated.** Deposits under `alice` cannot fund releases
   under `bob`. Every outflow create is checked against all committed inflow and
   outflow records for its own `scopeVariable` value.
2. **Both staged legs count atomically.** A deposit and release in the same
   `setMany` are evaluated together. Deposit 100 + release 100 passes at
   equality; deposit 100 + release 101 rejects the entire batch.
3. **Both legs are append-only.** The invariant itself rejects an update or
   delete of either an inflow or outflow record with `409`, even if a collection
   rule accidentally allows it. Keep explicit `update: "false"` and
   `delete: "false"` rules too, so the policy documents the intended API.
4. **Inflow-only creates validate values, then skip the aggregate scan.** Each
   staged inflow amount is still checked for append-only shape and a present,
   nonnegative safe integer. Because a valid inflow create only raises the bound,
   v1 then returns without summing the committed corpus. Normal auth rules and
   schema validation still apply.
5. **Use nonoptional values.** Deploy/config validation accepts only `UInt` (or
   readonly `UInt!`) and rejects optional `UInt?`/`UInt!?`. Config/runtime
   backstops reject malformed invariant metadata and any evaluated missing, null,
   negative, fractional, or unsafe amount.
6. **Both collections are ordinary durable, non-session, distinct, offchain
   document collections.** The same `scopeVariable` token must occur in both
   templates. `flowBound` v1 does not support a `scope` remap, cannot be declared
   on an onchain collection, and rejects `type: "storage"` on either leg because
   the file upload/finalize lifecycle is not a document-transaction surface.

### v1 state and scaling limits

- **Activation is not a corpus migration.** Enabling `flowBound` does not scan,
  validate, or repair existing inflow/outflow rows. `bounded verify` validates
  policy structure and reports the runtime advisory; it does not prove that
  pre-existing stored state satisfies the inequality or value requirements.
  Audit and, if needed, repair the inherited corpus before enabling append-only
  enforcement.
- **Outflow checks use full committed-corpus scans.** v1 reads both relative
  collections and filters the affected partitions while summing. Keep each
  collection corpus deliberately bounded; latency and work grow with corpus size.
- **Individual safe integers do not guarantee a safe aggregate.** All running
  sums must remain within `Number.MAX_SAFE_INTEGER`. Inflow-only writes validate
  individual amounts but skip the aggregate scan, so cumulative inflow can
  overflow even when every record is valid. A later outflow scan can then reject
  or fail closed until the corpus is repaired; append-only application writes are
  not a repair mechanism.

### Read and decline privacy

`flowBound` gates writes; it does not grant or restrict reads. Keep explicit read
rules on both legs. Also treat write permission as a capacity-observation channel:
with `errorDisclosure: "full"`, a decline exports numeric `cap`, `current`, and
`attempted` values to the caller even if that caller cannot read the underlying
rows. Minimal disclosure removes those numbers, but accept-versus-decline still
reveals the predicate “would this attempted outflow fit?” to any allowed writer.
Use narrow create authorization and minimal disclosure when balances or remaining
capacity are sensitive; redaction cannot remove the accept/decline predicate.
See [Error disclosure](policy-reference.md#error-disclosure).

> **Current verification status: runtime-enforced, not SMT-proven.** Structural
> validation checks relationship metadata such as the two collection templates,
> scope variable, field types, tier, and onchain mode, and rejects malformed
> declarations.
> A well-formed declaration is then emitted by `bounded verify` as a non-blocking
> `flowBound ... (runtime-enforced advisory)` with proof status `UNKNOWN`. The
> offchain realtime Worker enforces the inequality at write time, but the
> verifier does **not** generate or discharge an SMT obligation for its algebra
> today. Do not interpret a green overall verify verdict, structural validation,
> or the advisory's non-blocking `passed` flag as a formal proof or certificate.

Choose `conserve` when a total must stay constant; `rollingSum` to cap a windowed
sum; `windowSum` to READ a windowed sum; `flowBound` when one flow must never
outrun another per user/tenant/market.

## `bound` — hard ceilings / floors on a field (anti-cheat)

A numeric field (or every value of a map field) must always satisfy a fixed
comparison against a constant `limit`. Enforced on the **standard** write paths
(direct client write, function `ctx.bounded`, hooks, and the live-runtime
checkpoint) — so a server-authoritative game's score, a counter, or a level can't be
stored out of range, no matter what a client (or a buggy tick) proposes.

> **`bound` proof status depends on its shape.** A scalar `bound` on an offchain
> authoritative collection has an SMT-proved field-bound postcondition: every
> accepted write satisfies `field op limit`. A `.values` map is still a
> non-blocking runtime-enforced advisory with proof status `UNKNOWN`, because the
> proof obligation does not yet quantify over every map value even though the
> runtime checks them all. An onchain `bound` is not enforced by the onchain
> runtime and must not be used for an onchain guarantee. In every supported
> offchain shape, enforcement applies to authoritative durable writes and the live
> checkpoint; ephemeral per-player views remain read-rule-governed projections.

```json
{
  "rooms/$roomId": {
    "tier": "checkpointed",
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "fields": { "score": "Int" },
    "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800 } },
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

**What gets enforced and proved:** offchain, any write whose post-state has the
bounded field (or any value of the bounded map) violating `op limit` is rejected
(`409` + `name`). At a live checkpoint, the room snapshot is gated before it
reaches the authoritative store. `bounded verify` proves the scalar offchain
postcondition; `.values` remains runtime-enforced with an `UNKNOWN` advisory.
Declare a `bound` on the **authoritative collection** — the room/durable state the
checkpoint persists — not on a `.../view/$x` subcollection. A per-player view is
a read-rule-governed projection, not a source of truth, so invariants do not apply
there by design. See [live-runtime.md](live-runtime.md) and
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

> ⚠️ **Isolation needs the READ RULE too — `tenantTag`/`tenantEdge` are write-time
> *integrity*, not read access.** They prove a doc can't be mis-tagged and a reference
> can't cross tenants. They do **not** govern who can *read*. If your read rule is just
> `"@user.id != null"`, **every signed-in user can read every tenant** — a cross-tenant
> read leak — and `bounded verify` still says `✓ Proven` (it proved the integrity
> invariants, not read isolation). Validated by dogfooding: with a permissive read rule,
> tenant B's user read tenant A's task verbatim. For true "data can't leak between
> tenants," **gate reads (and member-only writes) on tenant membership**:
>
> ```json
> "read":   "@user.id != null && get(/tenants/$tenantId/members/@user.id) != null",
> "create": "@user.id != null && get(/tenants/$tenantId/members/@user.id) != null"
> ```
>
> (Keep the `@user.id != null &&` guard — a bare `get(/.../@user.id) != null` can't yet
> be *proven* auth-requiring by the verifier, so the guard makes the auth obligation
> pass.) Members self-join with `"create": "@user.id != null && $memberId == @user.id"`
> to bootstrap. So: `tenantTag` + `tenantEdge` = nothing is mis-tagged or cross-linked;
> the membership read rule = nobody reads another tenant. You need **both**.

## `tenantEdge` — references stay inside the tenant

Protects a reference field: the document it points at must live in `targetScope`
and carry the **same tenant tag** as the source. References are exact document
paths, or bare ids resolved via `targetPathVariable`.

```json
{
  "tenants/$tenantId/tasks/$taskId": {
    "fields": { "tenant": "String", "assigneeRef": "String", "title": "String" },
    "rules": {
      "read":   "@user.id != null && get(/tenants/$tenantId/members/@user.id) != null",
      "create": "@user.id != null && get(/tenants/$tenantId/members/@user.id) != null",
      "update": "false", "delete": "false"
    },
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
    "rules": {
      "read":   "@user.id != null && get(/tenants/$tenantId/members/@user.id) != null",
      "create": "@user.id != null && $memberId == @user.id",
      "update": "false", "delete": "false"
    },
    "invariants": [
      { "type": "tenantTag", "field": "tenant", "pathVariable": "$tenantId" }
    ]
  }
}
```

Reads + member-only writes are gated on tenant membership (so no cross-tenant leak);
the `members` collection self-joins (`$memberId == @user.id`) to bootstrap. Validated
end-to-end: tenant B's user is rejected reading tenant A's task, the wrong-tenant tag is
rejected `409`, and a cross-tenant reference is rejected `409` — while a member reads
their own tenant fine.

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

Invariant declarations can generally state an `"onchain"` coverage claim:
`"offchainOnly"`, `"onchainUnsupported"`, or `"onchainSupported"`. Type-specific
restrictions still win. In particular, `flowBound` and `windowSum` v1 are
**offchain-only**: omit `onchain` or use `"offchainOnly"`; an onchain collection
or any stronger claim is structurally rejected.

The offchain realtime runtime enforces all six boundary invariant types and
maintains `windowSum`. Do not infer onchain parity from that statement: an
`"onchainSupported"` claim is valid only where the onchain runtime has the
corresponding implementation and the collection is declared `"onchain": true`.
For `flowBound`, structural rejection is the current fail-closed boundary; there
is no onchain implementation. See [proof-coverage.md](proof-coverage.md) for the
coverage matrix.

<a id="attestations--global-policy-wide-claims"></a>

## `proofs.attestations` — GLOBAL, policy-wide claims

Invariants (above) attach to **one** collection. Some guarantees are **global** —
they span every collection and every read/write surface in the policy. Declare
those in **`proofs.attestations`**. This is proof-only metadata: it adds
`bounded verify` obligations but does not change runtime authorization or
invariant enforcement.

```json
{
  "members/$memberId": { "fields": { "active": "Bool" },
    "rules": { "read": "@user.id != null && get(/members/@user.id) != null", "create": "@user.id != null && get(/members/@user.id) != null" } },
  "projects/$projectId": { "fields": { "owner": "String", "name": "String" },
    "rules": { "read": "@user.id != null && get(/members/@user.id) != null", "create": "@user.id != null" } },
  "agents/$agentId/spend/$spendId": { "fields": { "amount": "UInt" }, "tier": "durable",
    "rules": { "read": "true", "create": "@user.id != null", "update": "false", "delete": "false" } },

  "proofs": {
    "attestations": [
      { "claim": "admins cannot read projects they are not a member of",
        "kind": "roleGatedRead", "scope": "projects/$projectId", "role": "members/$memberId" },
      { "claim": "no agent can exceed its daily spend cap",
        "kind": "rollingSum", "scope": "agents/$agentId/spend/$spendId",
        "field": "amount", "windowSeconds": 86400, "limit": 1000, "scopeVariable": "$agentId" }
    ]
  }
}
```

The older top-level `attestations` array is still accepted for backward
compatibility, but new policies should use `proofs.attestations`.

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
  "gatedBy": "get(/tenants/$tenantId/members/@user.id) != null" }
```

With both `role` (the nested member scope) and `gatedBy` (the predicate the read
rule must imply), the nested case **proves**: `✓ READ EXPOSURE: read rule
provably implies membership`.

### Nested authority — `authorityClosure` is flat-only (known limitation)

`authorityClosure` currently supports **only a flat `<collection>/$docId` role
scope**; a nested `tenants/$tenantId/members/$memberId` is rejected (`not a simple
<collection>/$docId path`) and there is **no** keying param that makes a nested
scope work today (this is a known limitation). For a multi-tenant admin set, the
recommended pattern is a **flat `admins/$userId` registry** alongside the nested
tenant data:

```json
{
  "constants": { "FOUNDER": "<the-creators-user-id>" },
  "admins/$userId": {
    "fields": { "tenant": "String", "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && (get(/admins/@user.id) != null || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null"
    }
  },
  "proofs": {
    "attestations": [
      { "claim": "the admin set only grows through existing admins",
        "kind": "authorityClosure", "roleScope": "admins/$userId",
        "initialMember": "@const.FOUNDER" }
    ]
  }
}
```

Keep tenant scoping for that admin as an ordinary field (`tenant`) gated in
rules; the *closure* proof rides the flat `admins/$userId` scope. Use a nested
`roleGatedRead` + `gatedBy` (above) for the per-tenant read isolation.

### Plain-string shorthand — and the rule you MUST follow

You may write a bare sentence:

```json
"proofs": {
  "attestations": ["no agent can exceed its daily spend cap"]
}
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
path is already proven for auth/immutability) and constrains every supported
invariant-evaluated mutation path once enabled. Validate inherited state and plan
migrations separately.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — choosing invariants from a description
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — what each invariant compiles to in the proof report
- [data-plane.md](data-plane.md) — how violations surface at runtime (409 + name)
- [proof-coverage.md](proof-coverage.md) — which runtime enforces what
