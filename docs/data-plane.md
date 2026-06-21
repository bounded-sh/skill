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
`get`/`set-many`/`delete`/`subscribe`/`aggregate` all just work.

To store a collection **on Solana**, two things are required together:
1. deploy the app with an on-chain protocol: `bounded deploy <policy.json> --create --name <n> --protocol realtime_devnet` (or a mainnet protocol), and
2. mark **each** on-chain collection `"onchain": true` in the policy.

```json
{
  "players/$id": {
    "onchain": true,
    "fields": { "score": "UInt", "wallet": "Address", "active": "Bool" },
    "rules": { "read": "true", "create": "@user.address != null", "update": "@user.address != null", "delete": "@user.address != null" }
  }
}
```

What changes for an on-chain collection:
- A write/delete is a **real Solana transaction your wallet signs** (the document is a program account/PDA). Field types map to on-chain types — `UInt`→u64, `Int`→i64, `String`, `Bool`, `Address`→a 32-byte pubkey.
- **Reads, lists, `subscribe`, and `aggregate` work identically** — Bounded mirrors the on-chain state into the read path, so you query it like any collection.
- On-chain data is **public** (anyone can read the chain): use `"read": "true"`, and rules may reference **only `@user.address`** (the wallet) — `@user.id` / `@user.email` are rejected inside `onchain: true` collections.

> **Gotcha — on an on-chain-protocol app, forgetting `"onchain": true` is a hard failure, not a silent off-chain fallback.** On an on-chain protocol the worker routes **every** collection's write on-chain (it keys on the *protocol*), but deploy only **registers** the collections you marked `onchain: true`. A collection left without the flag is written on-chain yet was never registered on-chain — so every write to it fails `AccountNotInitialized` (Solana custom error **`0xbc4`**) with no off-chain fallback. So on `realtime_devnet`/`realtime_mainnet`, mark **every** collection `onchain: true`. `bounded deploy` now warns and names any unflagged collections. (On the off-chain `realtime_offchain` protocol it's the reverse: `onchain: true` collections are stored off-chain — see the warning deploy prints there too.)

## Failure semantics

| What failed | Status | What you get back | What committed |
|---|---|---|---|
| Invariant violated | `409` `postcondition failed: invariant "<name>" ...` | the invariant's **declared name** (e.g. `spend_cap`), its type, and the arithmetic that failed | nothing |
| **Write** rule denied (create/update/delete) | `403` | the failed action plus a **trace** of the predicate that evaluated false | nothing |
| Function `invoke` auth rule denied | `403` `Forbidden: auth rule denied` | denied at the dispatcher before the body runs | nothing |
| **Read** rule denied | **`200`** with `{"data": null}` (single) or `{"data": []}` (list) | **no `403`** — denied reads are *hidden*, not errored (see below) | n/a |
| Update/delete on a capped collection | `409 append_only` | rolling-cap collections reject history rewrites by design | nothing |
| Policy fails verification at deploy | deploy fails | the proof report with counterexamples | previous-good policy stays active |

> **Read denials never return `403`.** A read your `read` rule denies comes back
> with HTTP `200` and an **empty payload** — `{"data": null}` for a single
> document, `{"data": []}` for a collection list (silent read-hiding / filtering).
> This is deliberate (you can't distinguish "doc doesn't exist" from "you may not
> see it"), but it means an agent **must not wait for a `403` on a read** — it
> will never come. `403` is the write/`invoke` contract only. To tell "denied"
> from "genuinely empty", check from an identity you know *is* permitted.

Agent rule of thumb:

- `409` means the **state** forbids it. Backing off is correct; retrying the
  same capped write will keep failing until enough of the window ages out.
  Poll cheaply (read the collection, sum the window) or schedule — don't
  hammer the write path.
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
✗ 403 Policy failed: Expression evaluated to false (comparison != failed)

$ bounded decisions --app-id <id> --denied-only
TIME       DECISION  ACTION  PATH      ACTOR         REASON
23:40:08Z  DENY      create  rooms/r1  89MnyG..1ZTe  Policy failed: Expression evaluated to false (comparison != failed)
```

The backend keeps a bounded (~200-entry, denies-prioritized) in-memory ring
buffer of recent WRITE decisions per app. `bounded decisions` reads it
(owner/collaborator gated); `--json` emits one object per line for agents. See
[cli-reference.md](cli-reference.md#debugging-denied-writes--bounded-decisions).

## Worked example: the spend cap (staging-verified)

With `rollingSum(amount) ≤ 100` over 3600s (name `spend_cap`) declared on
`agents/$agentId/spend/$spendId`:

```
$ bounded data set --path "agents/a1/spend/s1" --data '{"amount": 60}'
✓ committed                                  # window sum: 60 / 100

$ bounded data set --path "agents/a1/spend/s2" --data '{"amount": 60}'
✗ 409 postcondition failed: invariant "spend_cap" requires rolling sum(spend/$id.amount) <= 100   # 60+60=120
  nothing committed

$ bounded data set --path "agents/a1/spend/s3" --data '{"amount": 40}'
✓ committed                                  # window sum: 100 / 100

$ bounded data set --path "agents/a1/spend/s4" --data '{"amount": 1}'
✗ 409 postcondition failed: invariant "spend_cap" requires rolling sum(spend/$id.amount) <= 100   # 100+1=101
```

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

Rules evaluate against **staged** state: the rule for entry *N* sees the
results of entries 0..*N-1* via `getAfter()`. That turns `set-many` into a
composition primitive — guard documents and the writes they gate travel in
one atomic unit, with no TOCTOU window between check and act.

Allowlist example. `gated/$docId` has the create rule:

```
getAfter(/allowlist/@user.address).approved == true
```

One batch creates the allowlist entry AND the gated write:

```json
[
  { "path": "allowlist/agentA", "document": { "approved": true } },
  { "path": "gated/g1",         "document": { "value": 7 } }
]
```

```
$ bounded data set-many --from-json compose.json
✓ committed 2 document(s)
```

Reverse the order and the gate sees no staged entry — the whole batch `403`s.

Composition rules:

- **Order matters** — stage the guard before the write that reads it.
- `get()` reads pre-batch state; `getAfter()` reads staged state. Use
  `getAfter` for any post-condition ("balance still ≥ floor after the
  transfer").
- **Distinct paths per entry** — in-batch path collisions reject.
- Invariants are evaluated against the **whole batch** (that is how the
  balanced transfer above passes `conserve`).

## Append-only caps

Collections under a `rollingSum` are append-only event logs: `update` and
`delete` are rejected — both offchain and onchain — so the history a cap is
computed from cannot be rewritten, not by a compromised agent and not by your
own retry loop. Write each spend as a new document with a fresh id;
idempotency comes from your ids, not from overwrites.

## SDK write path

The same atomic semantics apply through the SDKs. `bounded-sh` writes from a
browser (user-signed, with live subscriptions); `bounded-sh/server` writes from a
server (keypair-signed). A batch is `setMany([{ path, document }, ...])`; a
guarded batch uses `getAfter()` in the rule exactly as above.

```ts
import { setMany } from "bounded-sh";   // or `vault.setMany` from bounded-sh/server
await setMany([
  { path: "accounts/alice", document: { balance: 50 } },
  { path: "accounts/bob",   document: { balance: 150 } },
]);   // one atomic transaction; conserve(balance) checked over the batch
```

## Related

- [cli-reference.md](cli-reference.md) — `bounded data set/set-many/get` flags
- [sdk-reference.md](sdk-reference.md) — `set`/`setMany` from TypeScript
- [policy-generation-guide.md](policy-generation-guide.md) — designing the policy these writes hit
- [queries.md](queries.md) — reads: filters, sort, paging, aggregations, joins
- [invariants.md](invariants.md) — what produces the 409s
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the same examples at proof time
- [proof-coverage.md](proof-coverage.md) — which runtime enforces which check
