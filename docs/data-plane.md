# Data Plane — `bounded data set / set-many / get`

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

## Failure semantics

| What failed | Status | What you get back | What committed |
|---|---|---|---|
| Invariant violated | `409` `postcondition failed: invariant "<name>" ...` | the invariant's **declared name** (e.g. `spend_cap`), its type, and the arithmetic that failed | nothing |
| Rule denied | `403` | the failed action plus a **trace** of the predicate that evaluated false | nothing |
| Update/delete on a capped collection | `409 append_only` | rolling-cap collections reject history rewrites by design | nothing |
| Policy fails verification at deploy | deploy fails | the proof report with counterexamples | previous-good policy stays active |

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

The same atomic semantics apply through the SDKs. `@bounded/client` writes from a
browser (wallet-signed, with live subscriptions); `@bounded/server` writes from a
server (vault-signed) and verifies webhooks. A batch is `setMany([...])`; a guarded
batch uses `getAfter()` in the rule exactly as above.

```ts
import { setMany, buildAccounts } from "@bounded/client";
await setMany([
  buildAccounts("alice", { balance: 50 }),
  buildAccounts("bob",   { balance: 150 }),
]);   // one atomic transaction; conserve(balance) checked over the batch
```

## Related

- [policy-generation-guide.md](policy-generation-guide.md) — designing the policy these writes hit
- [queries.md](queries.md) — reads: filters, sort, paging, aggregations, joins
- [invariants.md](invariants.md) — what produces the 409s
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — the same examples at proof time
- [proof-coverage.md](proof-coverage.md) — which runtime enforces which check
