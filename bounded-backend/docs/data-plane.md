# Data Plane — `bounded data set / set-many / get`

**What's in here / when to read this:** write semantics — single writes, atomic
`set-many` batches, `getAfter` composition, append-only rules, and the
`409`/`403` failure codes.

Once the policy is deployed, all writes go through the data plane. Every
write is checked against rules and invariants atomically; rejections are
fail-closed and nothing partial is ever applied.

## Commands

```bash
# Write one document
bounded data set --path "agents/a1/spend/s1" --data '{"amount": 60}'

# Read one document
bounded data get --path "agents/a1/spend/s1"

# Atomic batch — bare array or {"documents":[...]}; each entry {path, document}
cat > bundle.json <<'EOF'
[
  { "path": "accounts/alice", "document": { "balance": 50 } },
  { "path": "accounts/bob",   "document": { "balance": 150 } }
]
EOF
bounded data set-many --from-json bundle.json
```

## On-chain vs off-chain collections

By default every collection is **off-chain** (Bounded's durable store) and `set`/
`get`/`set-many`/`delete`/`subscribe`/`aggregate` all just work — the rest of this
doc is about that off-chain write path.

To store a collection **on Solana** instead, two things are required together:
deploy the app with an on-chain protocol (`bounded deploy <policy.json> --create
--name <n> --protocol realtime_devnet`, or a mainnet protocol) **and** mark **each**
on-chain collection `"onchain": true`. The on-chain write path differs in ways that
matter — a write is a **real Solana transaction**, reads come from an
**eventually-consistent mirror** (no read-after-write), data is **public**, rules may
reference **only `@user.address`** (`@user.id`/`@user.email`/`@user.isAnonymous` are
rejected), and an unflagged collection is stored off-chain rather than on Solana.
Unflagged collections are legal in an on-chain-protocol app and commit off-chain on
their own; the hard `AccountNotInitialized` (`0xbc4`) failure applies when a *single*
batch mixes an onchain path with an unflagged one, and to legacy apps carrying no
policy at all.

> **See [onchain.md](../../bounded-onchain/docs/onchain.md)** for the full on-chain story: field-type mapping,
> client-signed transactions, `--protocol` values, the eventual-consistency mirror,
> the `0xbc4` gotcha, `--skip-preflight`, and the mainnet human-signed policy permit.

## Collection tier is not the physical document backend

`tier: "durable" | "checkpointed" | "ephemeral"` is a policy/runtime semantic:
it decides when a collection becomes durable and which invariant/session shapes
are valid. It does **not** select SQLite or Postgres. Postgres-primary storage is
a platform-operated, per-app persistence backend behind the same Durable Object
single writer; there is no public policy key or app-builder migration endpoint
for it. Rules, invariants, atomic batches, and collection-tier behavior stay in
front of either backend.

In Postgres-primary mode, an acknowledged document mutation has already been
synchronously appended to a durable local SQLite outbox. Remote Postgres replay
is asynchronous; a cold start hydrates Postgres and overlays every still-pending
outbox entry before serving state. A missing connector, invalid hydration, or
exhausted outbox fails closed with `503` (`storage_unavailable` or the typed
`postgres_hydration_limit`) rather than falling back to a stale SQLite document
corpus; capacity/availability failures are retryable, while an oversized
hydration corpus requires operator action.

The current implementation envelopes are operational limits, **not permanent
public API promises**: hydration is capped at 25,000 rows and 32 MiB of serialized
documents; the pending outbox at 25,000 rows and 64 MiB; and one replay page at
256 rows / 4 MiB. The internal migration is resumable and write-fenced, and live
EVM collections remain SQLite-only. Do not market the current Postgres path as
unbounded storage or encode these numbers into application behavior.

## Failure semantics

| What failed | Status | What you get back | What committed |
|---|---|---|---|
| Invariant violated | `409` `postcondition failed: invariant "<name>" ...` | the invariant's **declared name** (e.g. `spend_cap`), its type, and the arithmetic that failed | nothing |
| Optimistic write snapshot changed | `409` `code: "mutation_conflict"`, `retryable: true` | HTTP data writes surface this after one bounded internal retry; realtime WebSocket writes may surface the first conflict | nothing |
| **Write** rule denied (create/update/delete) | `403` | the failed action plus a **trace** of the predicate that evaluated false | nothing |
| Function `invoke` auth rule denied | `403` `Forbidden: auth rule denied` | denied before the body runs | nothing |
| **Read** rule denied | **`200`** with `{"data": null}` (single) or `{"data": []}` (list) | **no `403`** — denied reads are *hidden*, not errored (see below) | n/a |
| Update, or a non-expired `rollingSum` delete | `409` invariant violation | live rolling-cap history cannot be rewritten; only a policy-authorized offchain row strictly older than every effective window may be deleted | nothing |
| Update/delete on a `windowSum` event collection | `409` invariant violation | maintained-aggregate event history is fully append-only | nothing |
| Policy fails verification at deploy | deploy fails | the proof report with counterexamples | previous-good policy stays active |

> **How much detail you get back is governed by `errorDisclosure`.** The
> message *detail* in the rows above (the invariant name/formula, the failed
> rule trace) is sent to the client only under **full** disclosure. The default
> in production is **minimal** — a generic message plus a stable `code`, with the
> invariant name/formula and rule expression withheld. Enforcement is identical
> either way, and the **full** reason is always written to the decision log
> (`bounded decisions --denied-only`). Set per-collection or policy-global; see
> [policy-reference.md](policy-reference.md#error-disclosure).

> **Error envelope.** Every rejection returns
> `{ "error", "code", "status", "requestId" }`. `code` is a stable category you
> can branch on even in minimal mode: **`policy_denied`** (`403` for writes and
> function invokes; read denial is hidden as an empty `200`) and
> **`invariant_violation`** (`409` — a postcondition like `rollingSum`/`conserve`
> was violated), and **`mutation_conflict`** (`409`, `retryable: true` — the
> optimistic document/rule snapshot changed during the write). HTTP data writes
> retry one complete attempt internally; realtime WebSocket writes can return
> the first conflict. A mutation conflict is never evidence that a cap was
> exhausted.

> **Read denials never return `403`.** A read your `read` rule denies comes back
> with HTTP `200` and an **empty payload** — `{"data": null}` for a single
> document, `{"data": []}` for a collection list (silent read-hiding / filtering).
> This is deliberate (you can't distinguish "doc doesn't exist" from "you may not
> see it"), but it means an agent **must not wait for a `403` on a read** — it
> will never come. `403` is the write/`invoke` contract only. To tell "denied"
> from "genuinely empty", check from an identity you know *is* permitted.

Agent rule of thumb:

- `409 invariant_violation` means the **state** forbids it. Backing off is correct; retrying the
  same capped write will keep failing until enough of the window ages out.
  Poll cheaply (read the collection, sum the window) or schedule — don't
  hammer the write path.
- `409 mutation_conflict` means concurrent state changed during evaluation.
  HTTP data writes already retried once; realtime WebSocket writes may not have.
  Reload exact state and retry only the idempotent operation. Do not stamp a
  wall/cap receipt from this response.
- `403` means **you** may not do it. Fix the caller or the payload, not the
  timing.

A non-zero exit code from `bounded data set`/`set-many` plus the structured
error is the whole contract — there is nothing to roll back, because nothing
was applied.

### Debugging a denied write

A denied write returns `403` with a trace of the predicate that evaluated false
— but that's only the *current* attempt. To see recent history (which writes were
allowed vs denied, by whom, and why), use **`bounded decisions`**:

```
$ bounded data set --app-id <id> --path "rooms/r1" --data '{"name":"x"}'
✗ 403 Policy failed: Expression evaluated to false

$ bounded decisions --app-id <id> --denied-only
TIME       DECISION  ACTION  PATH      ACTOR         REASON
23:40:08Z  DENY      create  rooms/r1  89MnyG..1ZTe  Policy failed: Expression evaluated to false
           ↳ Policy failed: "89MnyG…" != "owner…" -> false | resolved: @user.id="89MnyG…", get("rooms/r1")={"owner":"owner…"}, @time.now="1785346554"
```

On denies, the log carries an owner-scoped `detail` line (also in `--json`):
the failed comparisons with their actual operand values, plus how every
variable the rule touched resolved — `@time.now`, `@newData.*`, `get()` reads,
path variables. The CALLER's 403 stays generic on purpose: rules read
documents with system authority, so the resolved values are evidence for the
app team, not for the denied writer. If a deny hinges on time, the resolved
`@time.now` is right there — compare it against the written timestamp before
suspecting anything else.

The backend keeps a bounded (~200-entry, denies-prioritized) in-memory ring
buffer of recent WRITE decisions per app. `bounded decisions` reads it
(owner/collaborator gated); `--json` emits one object per line for agents. See
[cli-reference.md](../../bounded-deploy/docs/cli-reference.md#debugging-denied-writes--bounded-decisions).

## Worked example: the spend cap

With `rollingSum(amount) ≤ 100` over 3600s (name `spend_cap`) declared on
`agents/$agentId/spend/$spendId`:

```
$ bounded data set --path "agents/a1/spend/s1" --data '{"amount": 60}'
✓ committed                                  # window sum: 60 / 100

$ bounded data set --path "agents/a1/spend/s2" --data '{"amount": 60}'
✗ 409 postcondition failed: invariant "spend_cap" requires rolling sum(agents/$agentId/spend/$spendId.amount) <= 100   # 60+60=120   [full disclosure]
  nothing committed

$ bounded data set --path "agents/a1/spend/s3" --data '{"amount": 40}'
✓ committed                                  # window sum: 100 / 100

$ bounded data set --path "agents/a1/spend/s4" --data '{"amount": 1}'
✗ 409 postcondition failed: invariant "spend_cap" requires rolling sum(agents/$agentId/spend/$spendId.amount) <= 100   # 100+1=101   [full disclosure]
```

> The full invariant message above (name + formula) is sent only under **full**
> disclosure. In **minimal** mode (the prod default) the same `409` returns a
> generic message — "This change was rejected because it would violate a data
> constraint." — plus `code: "invariant_violation"`; the name/formula stays in
> the decision log. See [policy-reference.md](policy-reference.md#error-disclosure).

## Atomic `set-many`

`set-many` submits multiple writes as **one transaction**: every rule, every
invariant, every hook passes for the whole batch or the whole batch is
rejected. This is what makes `conserve` usable — a transfer is a debit and a
credit that only exist together:

```
# accounts alice=100, bob=100; conserve(balance) "no_minting"

# balanced: -50 / +50 → accepted
[
  { "path": "accounts/alice", "document": { "balance": 50 } },
  { "path": "accounts/bob",   "document": { "balance": 150 } }
]
$ bounded data set-many --from-json transfer.json
✓ committed 2 document(s)                    # 100+100 → 50+150, total preserved

# unbalanced: -50 / +40 → whole batch rejected
$ bounded data set-many --from-json bad-transfer.json
✗ 409 invariant_violation: no_minting
  conserve(balance): write-set sum 190 != 200
  nothing committed — neither document changed
```

## In-batch composition

Rules evaluate against the transaction's **final staged state**: every rule in
the batch sees every proposed document via `getAfter()`, independent of array
order. That turns `set-many` into a composition primitive — guard documents
and the writes they gate travel in one atomic unit, with no TOCTOU window
between check and act. `get()` still reads the committed pre-batch snapshot.

Allowlist example - the guard must not be writable by the caller it gates.
Declare `allowlist/$userId` so only an admin can add entries, and gate
`gated/$docId` on it. Key the gate on `@user.id` (present for every login), not
`@user.address` (empty for email/social users):

```json
{
  "allowlist/$userId": {
    "rules": { "read": "true", "create": "get(/admins/@user.id) != null", "update": "false", "delete": "false" },
    "fields": { "approved": "Bool" }
  },
  "gated/$docId": {
    "rules": { "read": "true", "create": "getAfter(/allowlist/@user.id).approved == true" },
    "fields": { "value": "UInt" }
  }
}
```

An admin seeds the allowlist once. The caller's batch then creates **only** the
gated write; the rule admits it by reading the admin-controlled allowlist entry
(a doc the batch does not touch, so `getAfter` reads its committed value):

```json
[
  { "path": "gated/g1", "document": { "value": 7 } }
]
```

```
$ bounded data set-many --from-json compose.json
✓ committed 1 document(s)
```

> **A `getAfter()` gate is only an authorization gate when the referenced document
> cannot be created or edited by the same caller in the same batch.**
> Reciprocal rules may safely require each other's final staged values for ordinary
> *data* relationships, where write ordering is not an authorization primitive.
> But a caller-writable guard is no guard: if the batch could also create
> `allowlist/<self>` with `approved: true`, the caller self-approves and passes in
> one atomic unit, so the allowlist protects nothing.
> Keep guard documents admin- or service-created, and only *read* them in the batch.

## getAfter() FALLS BACK to committed state

The single most expensive misreading available here, so know it before you write
a rule that depends on it.

`getAfter(/path)` is **not** "the value this batch is writing". It is "the final
value of that document" — and for a document the batch does not touch, that is
simply its **committed** value. So:

```jsonc
// reads as "this batch settles the position"
"getAfter(/positions/@newData.ref).status == \"kept\""
// MEANS "this position has ever been settled" — and stays true forever
```

Measured on a live protocol: every payout rule was written in that shape, so a
wallet with no relationship to an already-settled position minted a **second**
backing credit against it and the write landed. Repeat per settled position and
the entire escrow drains — every user's funds.

Two guards, and you generally need both:

- **Check PRE-state too.** `get(...)` is the committed snapshot, so pairing
  `get(x).status != "kept"` with `getAfter(x).status == "kept"` is what actually
  says *this batch performs the transition*.
- **Make the obligation UNIQUE.** The only uniqueness the platform gives you is
  the document id, and the caller chooses it. If one payout may exist per
  position, key it by the position (`payouts/$positionId`) and assert
  `$payoutId == @newData.ref` in the rule. Otherwise the same rule is
  satisfiable N times in a single batch, each write a fresh id.

The general form: **a rule that authorises a transfer must be true only during
the transition that earns it, and only once.**

## Atomic is not the same as COMPLETE

This is the trap that composition sets, and it has cost real money.

A batch commits all-or-nothing, so nothing lands half-written. But **each
document's rule is evaluated independently, and nothing obliges a caller to
include every write your operation logically needs.** A hostile client can send
a SUBSET of the batch, and if the rules you wrote do not reference each other,
every one of them passes and you get a state your code can never produce.

Concretely, from a gacha pool. Advancing a draw was meant to be three writes:
mark the pull resolved, mark the won item assigned, and update the aggregate
that tracks what is still in the pool. A client submitted only the first two:

```jsonc
// both of these rules passed on their own
{ "path": "acquisitions/a1", "document": { "status": "allocated", ... } },
{ "path": "positions/p9",    "document": { "status": "allocated", ... } }
// ...and the aggregate write was simply omitted
```

The aggregate kept counting an item that was gone, and its pending-draw counter
never dropped. Worse, the pull was no longer `pending`, so the expiry path that
would have cleaned it up no longer applied either. Permanently stuck, with no
recovery path and no rule broken.

**The declarative fix: `requiresInBatch`.** A collection-level key that refuses
any mutating write unless the same atomic batch also writes the named path(s):

```jsonc
"positions/$positionId": {
  // bare array = create/update/delete; or per-action:
  // { "update": ["pool/main", "nftescrow/$positionId"], "delete": ["pool/main"] }
  "requiresInBatch": ["pool/main"],
  "rules": { ... }
}
```

- Entries may bind the collection's OWN path variables
  (`"nftescrow/$positionId"` resolves with the matched write's id, exactly like
  `getAfter(/nftescrow/$positionId)` in a rule).
- A refused batch answers 403 `incomplete_batch` **naming the missing path**.
- A single-document `set` or `delete` is a batch of one, so it is refused
  whenever the collection requires companions for that action — route the whole
  operation through one `setMany`.
- Presence is sufficient: the batch is all-or-nothing, so a required write that
  is present but fails its own rule aborts everything anyway.
- It is a runtime obligation, not a proof obligation — `bounded verify` output
  does not change, and the enforcement is fail-closed on every client batch
  (HTTP and WebSocket alike).

Declare it on every collection whose writes only make sense alongside an
aggregate, escrow, or ledger leg. The cross-referencing technique below remains
the deeper tool when you also need the *content* of the companion writes bound,
not just their presence.

**The content-binding fix: make the legs require each other.** Pick the aggregate as the anchor,
have it name the documents it is moving for, and have each document require to
see that aggregate move in the same batch:

```jsonc
// on the aggregate: name what this write is for
"poolAllocate": "@newData.lastOp == \"allocate\"
                 && getAfter(/positions/@newData.lastRef).drawId == @newData.lastAcq
                 && getAfter(/solcredits/@newData.lastAcq).kind == \"pullfee\""

// on each document: refuse unless the aggregate moved for ME
"positions": "... && getAfter(/pool/main).lastOp == \"allocate\"
                  && getAfter(/pool/main).lastRef == $positionId"
```

Two notes from doing this:

- **`get()`/`getAfter()` cannot be nested.** `get(/a/getAfter(/b/x).ref)` is
  rejected, so when one rule must reach two related documents, carry a SECOND
  reference field on the anchor (`lastRef` and `lastAcq` above) rather than
  chaining through one.
- **Ask the question directly for every multi-document operation you write:**
  *if a caller sent only some of these writes, would each remaining rule still
  pass?* If yes, you do not have an operation — you have several writes that
  usually travel together.

Composition rules:

- **Order does not affect `getAfter()` visibility** — each rule sees the final
  staged value for every distinct path in the batch.
- `get()` reads pre-batch state; `getAfter()` reads final staged state. Use
  `getAfter` for any post-condition ("balance still ≥ floor after the
  transfer").
- **Distinct paths per entry** — in-batch path collisions reject.
- Invariants are evaluated against the **whole batch** (that is how the
  balanced transfer above passes `conserve`).

### Require companion writes with `requiresInBatch`

Atomicity does not force a caller to include every logical leg.
A hostile client can otherwise omit one write and submit a smaller batch whose remaining rules all pass.
Declare `requiresInBatch` on a collection when mutating one document is only valid with specific companion paths:

```json
"positions/$positionId": {
  "requiresInBatch": {
    "update": ["pool/main", "nftescrow/$positionId"],
    "delete": ["pool/main"]
  },
  "rules": {
    "read": "true",
    "create": "@user.id != null",
    "update": "@user.id != null",
    "delete": "@user.id != null"
  }
}
```

A bare string array applies to create, update, and delete.
The per-action object may contain only `create`, `update`, and `delete`, with at most eight distinct document paths per action.
A referenced `$variable` must be bound by the declaring collection's own path template.
The required path must address another collection declared in the same policy and cannot be a vacuous reference to the declaring collection itself.

A single-document set or delete is still a batch of one and is refused when it lacks a required companion.
Any real mutation of the required path satisfies the presence check.
A delete of a nonexistent document is a no-op and satisfies nothing.
Because the batch is all-or-nothing, a companion write that fails its own rule or invariant aborts the complete operation.
The HTTP and WebSocket client mutation lanes enforce this before rule evaluation.
Platform-derived hook, reveal, room-settlement, and other system writes are outside the client-batch guard and remain governed by their own declarations.

An incomplete batch returns HTTP 403 or a WebSocket error with code `incomplete_batch`.
The message names the triggering write, declaring collection, and missing concrete paths, and the decision log records the refusal.
`requiresInBatch` is runtime-enforced and structurally validated.
It is not an SMT proof obligation, so a green proof report does not replace an allow and deny policy test for the complete batch.

For one-click market settlement, pair this with
[`proofs.transferAuthority`](policy-reference.md#conditional-transfer-authority):
put the shared sale predicate in `defs`, use it in the good's `holder` update
rule, and reference the same def from the proof declaration. The wallet
collection uses `conserve` so the Ink/payment leg cannot mint or burn. The buyer
submits the good move plus both wallet updates in one `setMany`; a missing or
wrong payment rejects the whole batch.

## Window-live append-only caps

Collections under a `rollingSum` reject every `update`, so live cap history
cannot be rewritten by a compromised agent or retry loop. Write each spend as a
new document with a fresh id; idempotency comes from your ids, not overwrites.

Deletes remain denied unless the policy explicitly authorizes them. Even then,
the offchain runtime accepts only a row whose trusted platform `_createdAt` is
strictly before every matching window's effective start
(`max(now - windowSeconds, resetAtMs)`). Exact-boundary, live, future, and invalid
timestamps fail closed. Onchain-supported rolling caps remain fully no-delete.
This lets an intentional retention sweeper bound storage without weakening any
live window.

## SDK write path

The same atomic semantics apply through the SDKs. `@bounded-sh/client` writes from a
browser (user-signed, with live subscriptions); `@bounded-sh/server` writes from a
server (keypair-signed). A batch is `setMany([{ path, document }, ...])`; a
guarded batch uses `getAfter()` in the rule exactly as above.

```ts
import { setMany } from "@bounded-sh/client";   // or `vault.setMany` from @bounded-sh/server
await setMany([
  { path: "accounts/alice", document: { balance: 50 } },
  { path: "accounts/bob",   document: { balance: 150 } },
]);   // one atomic transaction; conserve(balance) checked over the batch
```

## Related

- [onchain.md](../../bounded-onchain/docs/onchain.md) — on-chain collections, client-signed transactions, `--protocol`, the mirror, `0xbc4`
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) — `bounded data set/set-many/get` flags
- [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) — `set`/`setMany` from TypeScript
- [policy-generation-guide.md](policy-generation-guide.md) — designing the policy these writes hit
- [queries.md](queries.md) — reads: filters, sort, paging, aggregations, joins
- [invariants.md](invariants.md) — what produces the 409s
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the same examples at proof time
- [proof-coverage.md](proof-coverage.md) — which runtime enforces which check
