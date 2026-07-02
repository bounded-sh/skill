# Policy Generation Guide

**What's in here / when to read this:** the method for turning a plain-English
app description into a correct `policy.json` that verifies clean. Read it before
writing any policy.

The product is the policy. A backend that "works" but lets an agent overspend, or
lets one tenant read another's data, is broken-but-compiling. A good policy makes
those failures *provably impossible*.

## The method (eight steps)

Work in this order. Each step narrows the next.

1. **Collections & path keys** — what objects exist, and how ownership nests.
2. **Field types** — the shape of each document; mark `!` readonly and `?` optional.
3. **Auth rules** — who may read/create/update/delete each collection.
4. **Identify the boundaries** — the properties that must hold *forever, across
   every write*, or money/tenancy/quotas break. This is the step everyone skips.
5. **Express boundaries as invariants** — `conserve` / `rollingSum` /
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
| Set once and never changed (owner, author)? | Mark `!` to *declare* an immutability obligation — then your `update` rule must satisfy it (assert `@newData.f == @data.f`, or `update: "false"`). |
| Genuinely optional? | Mark `?` — but then **null-guard it in rules** (see step 8). |
| An onchain collection? | No `Float` (use Int/UInt). |

Prefer `!` aggressively, but know what it does: `!` *declares* an obligation your
`update` rule must satisfy — it is **not** auto-enforced. Marking `createdAt:
"UInt!"` on its own makes `bounded verify` **FAIL** ("Update rule allows
`@data.createdAt` to change") until you either assert the field is preserved in
the update rule or forbid updates entirely:

```jsonc
"createdAt": "UInt!",
"rules": {
  // satisfy the ! obligation: the field can never change on update …
  "update": "@user.id == @data.owner && @newData.createdAt == @data.createdAt"
  // … or, if the doc is never updated at all: "update": "false"
}
```

Done right, an `owner: "String!"` field (holding `@user.id`, the universal
identity) plus `@newData.owner == @data.owner` in the update rule *proves* no
payload can ever reassign ownership — a strong guarantee, but one your rule has
to honor. Use `Address` only for fields that hold a real onchain wallet address.

### Step 3 — Auth rules

`rules` gates the four actions with boolean expressions. **An omitted action
defaults to deny.** Give every collection an explicit, deliberate rule for each of
`read`, `create`, `update`, `delete` — even if the answer is `"false"`.

> A literal `"false"` rule is the **intentional always-deny idiom** for
> append-only / immutable / server-authoritative collections, and `bounded
> deploy` **accepts** it. `bounded verify` surfaces it as a **non-blocking
> advisory** (intentional deny) — it does **not** block deploy (see
> [verify-and-counterexamples.md](verify-and-counterexamples.md#human-in-the-loop-findings)).

The expression language (full reference in
[policy-reference.md](policy-reference.md)):

- `@user` — the authenticated caller, or `null` if unauthenticated. It has three
  fields: `@user.id` — the **universal stable identity**, always present for an
  authenticated user (for wallet logins it equals the wallet address; for
  email/social logins it is the account identity); `@user.address` — a **real
  onchain wallet address**, present for wallet logins and `null` for email-only
  logins; `@user.email` — the verified, lowercased email (email logins only;
  `null` for wallet). **Use `@user.id` for ownership / membership / identity /
  auth guards.** Use `@user.address` only for onchain / wallet semantics
  (and in `onchain: true` collections it is the *only* user field allowed —
  `@user.id`, `@user.email`, and `@user.isAnonymous` are forbidden there). Use `@user.email` for
  email-gating.
- `@data.field` — the existing document (not in `create`).
- `@newData.field` — the incoming document (not in `delete`).
- `@time.now` — server time, **Unix seconds** (NOT milliseconds — see the trap below).
- `$pathVariable` — any variable from the path.
- `get(/path).field` — read another document's pre-transaction state.

> **⏱ TIME UNITS — seconds (policy) vs milliseconds (client). A silent timestamp
> bug.** The policy/proof layer is **Unix SECONDS**: `@time.now`, `rollingSum`
> `windowSeconds`, `scheduledAt`, and any timestamp *field you compare against
> `@time.now`* must be seconds. But the SDK/client side is **MILLISECONDS**: JS
> `Date.now()`, and the auto-stamped system fields `_createdAt` / `_updatedAt`, are
> ms. **Never compare across units** — a seconds value vs `Date.now()` is 1000×
> off, so a freshness/TTL check sees every row as ancient (or far-future) and
> silently drops it (looks like "the data isn't arriving" when it is).
>
> **Use the SDK helpers instead of hand-rolling — they keep you in seconds:**
> - **Writing a timestamp a policy reads → `serverTimestamp()`** (from
>   `@bounded-sh/client`/`server`): the *server* stamps it in seconds, so it matches
>   `@time.now` **and can't be forged by the client** — the right choice for TTLs,
>   rate windows, anti-cheat. `set("posts/p1", { createdAt: serverTimestamp() })`.
> - **Comparing in client/render code → `now()`** (seconds), not `Date.now()` (ms);
>   and **`toSeconds(x)`** to convert any ms value (`Date.now()`, or a doc's
>   `_createdAt`/`_updatedAt`) first. **`toMillis(s)`** goes back to ms for
>   `new Date(...)`. e.g. `if (now() - toSeconds(doc._updatedAt) > 15) …`.
>
> Pick ONE unit per field (seconds, to match the policy) and convert only at the
> JS edge. To use a ms system field inside a *rule* against `@time.now`, divide by
> 1000.
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
"create": "@user.id != null && @newData.owner == @user.id"
```

Without the `@user.id != null &&`, an unauthenticated caller writing
`owner: null` satisfies `null == null` and the rule passes. The prover will hand
you this exact counterexample; write the guard up front. (Ownership keys off
`@user.id`, the universal identity — not `@user.address`, which is `null` for
email-only logins. Reserve `@user.address` for onchain/wallet semantics.)

Cross-collection authorization uses `get()`:

```json
"update": "@user.id != null && get(/orgs/$orgId/members/@user.id).role == \"admin\""
```

#### Who is the admin? (do this while writing rules)

There is **no implicit creator god-mode** — Bounded has no service-role bypass,
and invariants bind the owner too. So ask explicitly: **who is the owner/admin,
and what admin actions does this app genuinely need?** (moderation, config,
refunds). Declare an `admins/$userId` collection and gate each privileged action
on membership — never a bypass:

```json
"update": "@user.id != null && get(/admins/@user.id) != null"
```

Only an admin can mint an admin (no self-promotion); seed the creator's `@user.id`
at bootstrap; default end-users to least privilege; admins stay bound by every
invariant. Full model + the validated `admins` collection:
[admin-and-ownership.md](admin-and-ownership.md).

Distinguish two questions. The above is the **data plane** ("who may moderate the
data"). The separate **control plane** — who may deploy policy/UI, manage billing,
share access, run cloud edits, or act as a **platform super-admin** across tenants —
is the `access` block + `bounded share --role`. If the app has collaborators, external
contributors, or is a multi-tenant platform, read
[access-control.md](access-control.md) and add an `access` block; for a plain B2C app
the creator is `owner` and you need none of it.

### Step 4 — Identify the boundaries

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
limits, there is a boundary hiding in it. Name each one as a sentence
("each buyer spends at most $5000/day"); step 5 turns the sentence into an
invariant.

For per-actor or per-tenant caps, make the actor/tenant a **path variable** before
you write the invariant. A per-agent spend cap should look like
`agents/$agentId/spend/$spendId` with `"scopeVariable": "$agentId"` and
`update`/`delete` set to `"false"`. Do not partition on the event id
(`$spendId`) — that gives each event its own cap and proves the wrong property.

If you skip this step, the policy still compiles — it just doesn't protect
anything. This is the #1 way a generated policy is *wrong but green*.

### Step 5 — Express boundaries as invariants

Each boundary maps to one invariant type. Full detail and every key in
[invariants.md](invariants.md); the mapping:

| Boundary sentence | Invariant |
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

Only what the description asks for. **Use the least-powerful tool that works** —
prefer a proven tier over an un-proven one:

- access control + provable constraints → **rules + invariants** (steps 3–5);
- a simple in-boundary side-effect that reacts to a write → a **hook**;
- logic that must **leave the boundary** (call an external API, use a secret) →
  a **function** — the only un-proven tier; reach for it last.

Decide with [functions-when-to-use.md](functions-when-to-use.md). Then add:

- **Side effects on write** → `hooks.offchain.{create,update,delete}` (call
  `@DocumentPlugin.putDocument` / `updateField`). See
  [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md).
- **Recurring jobs** (reset a quota nightly) → `hooks.scheduled.<name>` + a
  `schedule: { every, run }`.
- **One-shot timers** (fire a reminder when due) → `hooks.scheduled.<name>` +
  `dueRows: { run, onComplete }`.
- **Call an external API then write** → a top-level `functions` entry; invoke on
  demand, or name it in a `schedule`/`dueRows` `run` to run on a cadence as the
  system principal. See [functions.md](functions.md).
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
2. **The `null == null` auth bypass** — `@newData.owner == @user.id` is
   satisfied by an unauthenticated caller writing `owner: null`. Fix: prepend
   `@user.id != null &&`.

Never weaken the property to make a proof pass — the counterexample is a write
production would have accepted. Strengthen the expression, re-verify until clean,
run the [quality checklist](quality-checklist.md), then `bounded deploy`.

---

## Worked examples

Three complete, validator-clean policies (team SaaS, spend-cap marketplace,
realtime game) live in **[policy-examples.md](policy-examples.md)** so this guide
stays focused on method. Read them once you have the eight steps.

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
| Write rule without `@user.id != null` | DISPROVED (`null == null` bypass) | lead with the auth guard |
| Optional field in a numeric guard | DISPROVED (`null` counterexample) | null-guard or make it required |
| No invariant on a money/quota field | green but unprotected | add the invariant (step 4) |

## Related

- [policy-examples.md](policy-examples.md) — the three full worked policies
- [policy-reference.md](policy-reference.md) — full syntax for every config key
- [invariants.md](invariants.md) — invariant types and the RULES-vs-INVARIANTS guide
- [admin-and-ownership.md](admin-and-ownership.md) — the "who is the admin?" model (no god-mode)
- [functions-when-to-use.md](functions-when-to-use.md) — when to reach for a function (and when not)
- [quality-checklist.md](quality-checklist.md) — the pre-deploy self-check
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — reading proof failures
