# Invariants — Declaring the Non-Negotiables

**What's in here / when to read this:** the five invariant types — `conserve`,
`rollingSum`, `bound`, `tenantTag`, `tenantEdge` — and the rule-vs-invariant decision.

Invariants are **transaction postconditions**: declared once on a collection
and enforced atomically on every write path at runtime — including hooks, ticks,
schedules, and `set-many` batches, where the whole batch commits or nothing does.
Nothing has an exemption from an invariant. Four of the five types
(`conserve`, `rollingSum`, `tenantTag`, `tenantEdge`) are additionally **proven
at deploy** ([verify-and-counterexamples.md](verify-and-counterexamples.md)).
`bound` is **runtime-enforced** (an over-limit write is rejected `409`) but **not
proof-backed** — it deploys fine, it just shows as *unproven* in `verify`
(advisory, non-blocking; see its section).

Every invariant accepts an optional `name`, surfaced in the `409` when a write
violates it. **Name them like error codes:** `spend_cap`, `no_minting`,
`task_tenancy`.

There are five types: `conserve`, `rollingSum`, `bound`, `tenantTag`, `tenantEdge`.

> **Identity in the rule examples below.** The SDK `user` object is
> `{ id: string, address: string | null, email: string | null }`. `@user.id` is
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

## `bound` — hard ceilings / floors on a field (anti-cheat)

A numeric field (or every value of a map field) must always satisfy a fixed
comparison against a constant `limit`. Enforced on the **standard** write paths
(direct client write, function `ctx.bounded`, hooks, and the live-runtime
checkpoint) — so a server-authoritative game's score, a counter, or a level can't be
stored out of range, no matter what a client (or a buggy tick) proposes.

> **`bound` is RUNTIME-enforced but NOT yet formally SMT-proven — a non-blocking
> ADVISORY.** Like every invariant, a `bound` is a postcondition on the
> **authoritative** state: it is enforced on every durable write **and at the live
> checkpoint** (a room snapshot whose value violates it is rejected — the last valid
> checkpoint stays; an over-limit direct write is rejected `409`). `bounded verify`
> surfaces it as **`[UNPROVEN]` … (runtime-enforced advisory)** — read that as "not
> discharged by the prover", *not* "counterexample found"; it does **not** block
> `deploy`, and the overall verdict still reads `✓ … Safe to deploy`. It is not a
> `[PASS]` only because the prover doesn't yet discharge a `bound` obligation: a
> **scalar** `bound` is provable at parity with `tenantTag`; the open modeling gap is
> the `.values` **map** case, where the runtime checks *all* values but the
> single-value proof obligation doesn't yet quantify over them. (This has nothing to
> do with the ephemeral **view** layer — invariants are postconditions on the
> authoritative/checkpointed state; the per-player view is a read-rule-governed
> *projection*, so declare a `bound` on the **authoritative collection**, never a
> `.../view/$x` subcollection.) The four types the prover fully discharges today are
> `conserve`, `rollingSum`, `tenantTag`, and `tenantEdge` (see
> [proof-coverage.md](proof-coverage.md)). So: use `bound` for a real runtime ceiling
> you don't need a *proof* of; for a *proven* cap, express it as a `rollingSum`
> (per-window total) or a single-write rule predicate (`@newData.score <= 11`) — both
> prover-backed.

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

**What gets enforced (NOT proven):** at runtime, any write whose post-state has
the bounded field (or any value of the bounded map) violating `op limit` is
rejected (`409` + `name`). At a live checkpoint, the room's snapshot is gated by
this before it reaches the provable store. But this is a **runtime-only** check —
the proof engine does not discharge a `bound` obligation (see the callout above),
so it carries no deploy-time *proof*. A policy with a `bound` **does pass
`verify`/`deploy`** (the `bound` shows as a non-blocking `[UNPROVEN]` advisory, not a
blocking `[FAIL]`). Declare a `bound` (like any invariant) on the **authoritative
collection** — the room/durable state, which is what the checkpoint folds through your
invariants. Not on a `.../view/$x` subcollection: the per-player view is a
read-rule-governed *projection* of the already-gated state, not a source of truth, so
invariants don't apply there by design. See [live-runtime.md](live-runtime.md) and
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

Each invariant may declare `"onchain"`: `"offchainOnly"`, `"onchainUnsupported"`,
or `"onchainSupported"`. The offchain realtime runtime enforces **all four**
types. `onchainSupported` is accepted only for the subset the onchain runtime
actually enforces — direct `conserve`, `tenantTag`, and `rollingSum`
(epoch-bucketed) — and only on collections declared `"onchain": true`. Anything
beyond the subset is **rejected at verify time**; an onchain runtime receiving
unknown metadata rejects the write rather than skipping the check. Details:
[proof-coverage.md](proof-coverage.md).

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
path is already proven for auth/immutability) and binds every write path — including
your migrations.

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — choosing invariants from a description
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — what each invariant compiles to in the proof report
- [data-plane.md](data-plane.md) — how violations surface at runtime (409 + name)
- [proof-coverage.md](proof-coverage.md) — which runtime enforces what
