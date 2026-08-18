# Policy-native financial state machines

Read this before building an auction, order book, escrow workflow, staged token
launch, pooled settlement, batch distribution, or any onchain flow that must
make progress across several transactions.

The central design rule is simple: **policy owns truth; functions and keepers
only propose the next legal transition.** A function may calculate a payload or
turn a crank, but the collection rules must independently derive and constrain
every value that moves money, allocates tokens, or advances lifecycle state.

## Choose the right Bounded mechanism

| Need | Use | Do not substitute |
|---|---|---|
| authorize one document and pin its fields | `rules.create/update/delete` | a hook or trusted frontend check |
| require committed pre-state | `get(/path)` | a stale client read |
| bind sibling writes in a realtime data-plane batch | `getAfter(/path)` plus `requiresInBatch` | `getAfter` alone |
| atomically advance onchain sibling state | one receipt hook with derived `@DocumentPlugin.updateField` calls | relying on realtime-only batch completeness |
| mutate a narrow derived field onchain | `@DocumentPlugin.updateField` | caller-authored full-head updates |
| cap a time-windowed flow | `rollingSum` | an unmaintained counter |
| conserve value across collections | `conserve` where its supported shape fits | only unit/property tests |
| make slow work resumable | append-only operation receipts and a bounded cursor | one transaction that scans every participant |
| drive permissionless progress | a user, function, or keeper submitting the next derived receipt | giving the driver economic discretion |
| move funds | an onchain hook after policy authorization | authorization hidden inside the hook |

Read the backend [data-plane guide](../../bounded-backend/docs/data-plane.md)
for exact batch semantics and [invariants](../../bounded-backend/docs/invariants.md)
for the supported conservation and rolling-cap shapes.

## Start with identities, units, and lifecycle

Write three small tables before writing policy.

### Identity table

Separate permanent identity from display names and mutable routing:

| Concept | Example shape | Property |
|---|---|---|
| permanent root | `rootId` | immutable; keys custody and all security paths |
| display name | `slug` | mutable or replaceable; never a custody key |
| workload | `workloadId` + epoch/digest | frozen into the operation when current code matters |
| wallet | `@user.address` | transaction principal, not the logical entity id |
| service role | distinct policy constant per duty | separately commissioned, rotated, and revoked |

If two entities can hold funds concurrently, use one namespaced
[named PDA](custody-and-pdas.md) per permanent root. Do not put all auctions,
markets, or tenants into `@contract.address` and rely only on bookkeeping.

### Unit table

Name the unit and scale of every numeric field. For example:

| Quantity | Unit |
|---|---|
| deposit, demand, refund | lamports |
| allocation, supply | token base units |
| price | lamports times `PRICE_SCALE` per token base unit |
| time | seconds or milliseconds, stated explicitly |
| progress | fixed-point parts in `0..PROGRESS_SCALE` |
| fee | basis points in `0..10_000` |

Never compare or add values from different rows until the equation converts
them into the same unit. Keep the derivation beside the policy expression.
Fixed-point factors that cancel on paper still have to appear on the correct
side of an integer `mulDiv` expression.

### Lifecycle table

List each state, who may propose its exit, the exact preconditions, the receipt
that proves it, and the bounded recovery path. A typical shape is:

```text
opening -> active -> closing -> settled
                   \-> expired/refunding -> aborted
```

Terminal states must be mutually exclusive. If the first refund makes normal
settlement impossible, stamp that abort in the same policy-authorized operation
and make every later pool/claim rule reject it.

## Head plus receipts, not a writable god document

Use an immutable or direct-update-disabled head for frozen terms and current
summary state. Advance it only through narrow operation receipts whose rules
prove one transition:

```text
heads/$rootId
operations/$rootId/start/$checkpointId
operations/$rootId/step/$checkpointId/$cursor
operations/$rootId/finalize/$checkpointId
settlements/$rootId/$positionId
```

Each receipt should:

1. bind its path variables back to fields and the permanent root;
2. read the current head with `get`;
3. pin all caller-supplied outputs to policy-derived equations;
4. update only the fields owned by that transition;
5. be replay-safe by construction;
6. leave either a legal next step or a bounded exit/refund.

`@DocumentPlugin.updateField` is useful here because a receipt can advance a
small set of head fields without reopening the whole head to caller updates.
Keep hook-derived fields null or absent in the receipt's create rule so the
caller cannot forge them.

## `get`, `getAfter`, and complete batches

These meanings are different:

- `get(/x)` reads committed pre-transaction state.
- `getAfter(/x)` reads final staged state if the batch writes `/x`, otherwise it
  falls back to the committed value.
- `@data` is the current document before an update.
- `@newData` is the candidate document after the submitted patch is merged.

That fallback means `getAfter(/x) != null` does **not** prove this batch wrote
`/x`. For a realtime data-plane batch whose legs must be atomic:

1. use `getAfter` to content-bind each leg to the sibling's final fields;
2. use `requiresInBatch` to require the sibling path structurally;
3. make the sibling bind back to the same operation/root id.

`requiresInBatch` is enforced by the realtime/client data plane and is not an
onchain proof obligation. For an onchain transition, prefer one receipt whose
hook performs every derived sibling mutation with `@DocumentPlugin.updateField`
inside the same transaction. Do not make Solana safety depend only on the
realtime batch-completeness check.

For a pre-state transition, use both old and new facts where needed, such as
`get(/head).status == "active" && getAfter(/head).status == "closing"`.

## Bound work by aggregate state, not participant count

Never finish a financial lifecycle by listing all users and assuming the list
is complete. Pagination, timeouts, mirror lag, and partial reads can turn a
failed scan into a false "done" result.

Instead, maintain sufficient aggregate state as entries arrive. For a price
process, that may be one row per distinct price linked in sorted order. For a
distribution, it may be a sharded sum and an append-only cursor. Then:

- cap the number of aggregate nodes independently of participant count;
- process one or a small fixed number per receipt;
- store a cursor and all accumulator state needed to resume;
- let any authenticated wallet submit the next exact transition;
- settle each participant lazily from immutable entry data plus final aggregate
  snapshots.

Permissionless means authority-free, not cost-free. The maximum node count is
also a transaction-count and incentive budget. Rehearse the maximum structure
on the target network.

## Lazy settlement needs sufficient snapshots

An O(1) claim is possible only if the aggregate process freezes enough data to
reconstruct one participant's outcome without history traversal. Typical inputs
are:

- immutable entry amount, limit, start progress, and start accumulator;
- the participant's aggregate bucket exit progress and accumulator;
- terminal head price/status;
- pool/mint completion evidence;
- any per-entry rounding reserve.

The claim rule must derive spend, allocation, fee legs, and refund from those
values. The client may mirror the calculation for review, but its numbers are
not authoritative.

Gate a filled claim on the external prerequisites it depends on. A token claim
must not become legal merely because the head says `settled`; require the exact
successful mint and pool receipts too. Refund and normal settlement paths must
be exclusive and serialize through shared state.

## Arithmetic discipline

### Derive dimensions before optimizing expressions

Suppose:

- `S` is remaining token base units;
- `q` is remaining progress parts;
- `Q` is the full progress scale;
- `p` is scaled lamports per token base unit;
- `P` is the price scale;
- `D` is lamports of effective demand.

The demand supportable at price `p` is:

```text
Dmax = floor(S * Q * p / (q * P))
```

and its inverse price is:

```text
p = ceil(D * q * P / (S * Q))
```

Dropping `Q` from both inverse formulas can still produce plausible positive
integers and conserve total value, while selecting the wrong price. This is why
"tests pass" and "conservation holds" do not establish dimensional correctness.

Use `@MathPlugin.mulDivFloor` and `mulDivCeil` for full-precision products when
their [capability status](solana-capability-status.md) supports the target. For
ordinary rule arithmetic, follow the bounded-int guidance in
[policy primitives](policy-primitives.md#rule-arithmetic-is-bounded-on-chain---write-pins-division-first).

### State every rounding direction

- round debits and required funding conservatively;
- round allocations so aggregate issuance cannot exceed supply;
- reserve the worst per-participant rounding error before committing pooled
  funds;
- carry quotient/remainder pairs when repeated flooring would drift;
- prove denominators positive before division.

JavaScript `number` is not a financial integer transport beyond `2^53 - 1`.
Use `bigint` for local arithmetic and convert only after an explicit safe-integer
check when the current document transport requires a JSON number.

### Keep an independent differential oracle

A policy helper and policy string that repeat the same equation are one
implementation, not two independent checks. A useful differential oracle:

- derives the equations separately from the units table;
- does not import production transition helpers;
- covers undersubscribed, oversubscribed, exact-boundary, marginal, late-entry,
  maximum-value, and randomized books;
- compares lifecycle decisions, not only final conservation totals.

## Onchain receipt success and retry

An operation id is not idempotency if a failed external effect permanently
occupies it.

On real Solana, a failed transaction does not commit its Document write. On
Poofnet, the primary onchain-flagged row commits before its simulated hook:

- `_transaction_hash` identifies the current simulated attempt;
- success is `_hook_completed == _transaction_hash`;
- failure is `_error_message != null` with no matching completion;
- between primary commit and hook completion, neither outcome is established.

Therefore never treat row existence or merely `_error_message == null` as
success. A Poofnet subscriber, client, or function must wait for the matching
completion marker. On real Solana, confirm the transaction and then poll the
exact mirror postcondition.

### Reserved receipt stamps are Poofnet-only. Never read them in a rule.

This deserves its own hard line, because the failure mode is permanent fund
lockup and it survives every proof and test you will run before the target
network.

`_transaction_hash`, `_hook_completed`, and `_error_message` are written by
the SIMULATOR. On a real chain the program stores none of them - a failed
onchain hook reverts the whole write, so document existence is itself the
completion proof there, and the chain mirror carries different metadata
(`_txSignature`/`_txSlot`) that arrives asynchronously and is not readable at
rule-evaluation time. A policy rule that requires
`_transaction_hash != null && _hook_completed == _transaction_hash` is
therefore correct on Poofnet and PERMANENTLY UNSATISFIABLE on a real-chain
protocol: it can never pass, for anyone, ever.

The trap is asymmetric in the worst way. Deposit rules rarely carry receipt
gates, and payout rules attract them - the strict stamp check FEELS like extra
safety on exactly the legs that move money out. Ship that and the deployed
app becomes a one-way valve: bids, deposits, and pool seeds go in; no claim,
refund, or payout can ever pass. Nothing catches it early, because the formal
proof models the stamps as ordinary nullable fields and every test lane runs
on the simulator, where they exist. The first thing that notices is a real
user on the real chain who cannot withdraw.

The portable pattern: the hook writes a DECLARED field (`bidderPaidAt`,
`settledAt`) as one of its own atomic effects, and downstream rules gate on
that field or on the hook-maintained head/cursor state. A declared field
written inside the hook commits atomically with the money movement on both
planes, so the same rule text is correct everywhere. Reserved `_` stamps are
for Poofnet clients and subscribers; client code that inspects them must
branch per protocol (existence-is-success on real chains).

Before real funds, run the full lifecycle - in, progress, and every money-OUT
leg - once against the target network semantics: either a test lane that
never writes the simulator stamps, or a devnet end-to-end. A green simulator
corpus proves nothing about receipt-gated rules on the chain.

For a semantic operation that must survive transient failure, choose one of
these policy shapes:

1. **Retryable same row.** Allow update only when the stored row has
   `_error_message != null` and no matching completion. Require every immutable
   economic input, root binding, destination, and operation kind to equal
   `@data`, and change only a mutable attempt nonce/time field. The new attempt
   receives a fresh `_transaction_hash`; wait for its matching completion.
2. **Intent plus attempts.** Create one immutable intent at
   `intents/$operationId`, then fresh `attempts/$operationId/$attemptId` rows.
   Every attempt derives identical effects from the intent. A separate
   finalization transition accepts exactly one attempt whose completion marker
   matches its transaction hash.

Do not use a create-only `settlements/$positionId` receipt with no update or
alternate attempt path when it is the participant's only claim/refund route.
Inject a hook failure in tests and prove eventual retry without a double effect.

## Roles and automation

Separate keys for materially different duties. Opening an economic object,
attesting an external review, resolving a hold, and operating a venue should
not silently share one writer identity. For each environment:

- validate every role constant as a real address;
- reject placeholder and unintended duplicate values at release;
- run a signing canary for each role;
- document rotation and revocation;
- freeze the relevant role/version digest into the root operation when later
  transitions depend on it.

A keeper or function is optional liveness infrastructure. It may read state,
build the next derived receipt, submit it, and wait for its outcome. It must not
choose prices, payouts, recipients, or terminal status outside equations the
policy independently pins.

## Evidence ladder

Keep these claims separate:

| Claim | Evidence |
|---|---|
| policy parses and types | compiler/validator |
| authorization and supported invariant obligations hold | `bounded verify` and its exact proof report |
| transition equations match the design | independent differential/property tests |
| Poofnet behavior is modeled | Poofnet E2E including injected failures |
| transaction fits and external programs behave | retained target-network execution |
| UI reconciles ambiguous responses | browser E2E with confirmation and mirror polling |

Before accepting value, exercise the complete target-network lifecycle with a
unique run id: open, fund, multiple aggregate levels, interrupted and resumed
progress, terminal success, external account creation, at least two different
lazy outcomes, timeout/refund, ambiguous response, injected failure/retry, and
the maximum bounded-work case. Confirm public transaction signatures first,
then poll every exact mirror postcondition. Poofnet, local compilation, and a
returned signature do not replace that run.

## Final review checklist

- Permanent root identity keys every custody and lifecycle path.
- Concurrent pots use distinct namespaced PDAs.
- Frozen terms have no broad update path.
- Every transition is policy-derived, replay-safe, and leaves a next step or
  bounded exit.
- Realtime `getAfter` companion assumptions are backed by `requiresInBatch`;
  onchain transitions do not rely on that realtime-only gate.
- Work is capped by aggregate nodes, never participant enumeration.
- One participant can settle from immutable data plus bounded snapshots.
- Units and scales are explicit; inverse formulas round consistently.
- Conservation and per-participant rounding reserves are both covered.
- Tests use an independent arithmetic/state-machine oracle.
- Success requires a matching hook/transaction outcome, not row existence.
- Every failed semantic receipt has a legal retry path.
- Writer roles are distinct and commissioned in every target environment.
- Maximum transaction bytes, account locks, compute, rent, and ATA behavior are
  exercised on the target network.
- Documentation labels compiled, tested, proved, Poofnet-modeled, and
  live-network-verified claims accurately.
