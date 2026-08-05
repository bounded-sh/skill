# Onchain - Solana collections & client-signed transactions

**What's in here / when to read this:** putting a collection on Solana, what
changes when a write is a real chain transaction your wallet signs, the
`--protocol` choices, the rules that are legal onchain, the eventual-consistency
mirror (don't read-after-write), the `0xbc4` deploy gotcha + `--skip-preflight`,
policy upgrade governance, and game settlement with server-signed
transactions. Client-signed game handoff is not currently supported.

This is the home for everything onchain. [data-plane.md](../../bounded-backend/docs/data-plane.md) and
[proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) summarize and point here.
Read [solana-capability-status.md](solana-capability-status.md) before selecting any Solana plugin or primitive.

## Contents

- [Opt in and protocols](#default-is-off-chain--opt-in-deliberately)
- [Capability status](#check-capability-status-before-building)
- [Onchain writes and reads](#what-changes-when-a-collection-is-onchain)
- [Onchain update patches](#onchain-updates-are-patches)
- [Identity rules](#onchain-rules-useraddress-only)
- [Mirror consistency and recovery](#the-mirror-is-eventually-consistent--dont-read-after-write)
- [Poofnet parity](#poofnet-onchain-simulation-on-realtime_offchain)
- [Transaction-size limit](#transaction-size-limit-one-hook--one-solana-transaction)
- [Policy upgrade governance](#policy-upgrade-governance-runtime-v3)
- [Proof coverage](#proof-coverage-onchain)
- [Game settlement](#game-settlement-the-two-directions)

## Default is off-chain / opt in deliberately

Every collection is **off-chain** (Bounded's durable store) unless you choose
otherwise, and the off-chain protocol is the default. Going onchain is two
decisions that must agree:

1. deploy the app on an onchain **protocol**, and
2. mark **each** onchain collection `"onchain": true` in the policy.

### `--protocol`

| Protocol | Where data lives | When |
|---|---|---|
| `realtime_offchain` | Bounded's durable store (no chain) | **default** - fastest, no wallet signing, full feature set |
| `realtime_devnet` | Solana **devnet** program accounts | test the real onchain path with throwaway SOL |
| `realtime_mainnet` | Solana **mainnet** program accounts | production onchain (owned by your wallet, immutably - see below) |

```bash
# off-chain (default) - omit --protocol or pass realtime_offchain
bounded deploy ./policy.json --create --name my-app

# onchain on devnet
bounded deploy ./policy.json --create --name my-app --protocol realtime_devnet
```

## Mainnet apps are owned by your wallet, immutably

This is the one thing to get right before creating a mainnet app, because it
cannot be undone.

A devnet app is owned on-chain by the Bounded platform admin, which is why the
platform can sign its policy updates for you. A **mainnet** app is not: it is
owned on-chain by the wallet that created it, that owner is written once and can
never be reassigned, and only that wallet can authorize a policy update.

What follows from that:

- **Create mainnet apps from the machine holding the key you want to own them.**
  `bounded deploy --create --protocol realtime_mainnet` sends your local CLI
  wallet as the intended owner and the server refuses any wallet you have not
  proven you control. Creating an app for an address whose key lives elsewhere -
  a browser wallet, a teammate's machine - produces an app that can never deploy
  a policy again.
- **A mainnet app cannot be ownership-transferred or ejected.** The Bounded-side
  transfer would move the database record while the on-chain owner stayed put,
  leaving the recipient an app they could never deploy to. Both are refused.
- **`--starter-policy` is not available on mainnet.** Seeding a starter policy
  would need the server to sign on your behalf, which it cannot do. Create the
  app, then deploy your policy.
- **Deploying is otherwise normal.** The CLI checks whether a permit is needed,
  has the server mint one bound to the exact policy you are deploying, signs it
  locally, and deploys - one command, no extra step. Your private key never
  leaves your machine, and the permit cannot authorize a different policy than
  the one it was issued for.
- **Mainnet creation needs a paid account.** Creating a mainnet app spends real
  rent on an account that is immutable once it exists, so it is granted by your
  account's plan (`pro`/`enterprise`). There is no API key or shared secret to
  obtain; if your plan does not include it you get a `mainnet_not_entitled`
  refusal telling you to upgrade. Devnet needs no entitlement.

```bash
# onchain on mainnet - owned by your local CLI wallet
bounded deploy ./policy.json --create --name my-app --protocol realtime_mainnet
```

If you see `owner_not_established`, the app's on-chain account is not owned by a
usable wallet. That is an integrity error rather than a state to recover from:
the app was not created through the current path, and Bounded will not silently
reassign ownership to repair it.

## Check capability status before building

Protocol selection does not make every discovered plugin usable on that network.
Bounded tracks function discovery, deployed-runtime support, and retained live verification separately.
The deployed program is recorded as runtime v4 on both devnet and mainnet-beta (2026-08-05), but the runtime version does not prove that an external protocol is deployed or configured.
Consult the [157-function devnet catalog](solana-capability-status.md) before generating a policy or presenting an operation as supported.
Jupiter, Phoenix, and DFlow are unavailable on devnet.
Kamino's KLend program IS deployed and executable on devnet at its mainnet address; what is unestablished there is a usable market and reserve set.
SPL stake pool, Raydium CPMM, Meteora DLMM, and most Kamino calls additionally need Solana runtime v4; that runtime is now live on both clusters, so they are no longer refused at deploy time for runtime reasons, but they stay unverified until retained live proof exists.
Meteora is blocked pending a replacement external config.
Pump.fun, PumpSwap, and Tensor remain unverified until retained live proof exists.

```json
{
  "players/$id": {
    "onchain": true,
    "fields": { "score": "UInt", "wallet": "Address", "active": "Bool" },
    "rules": {
      "read":   "true",
      "create": "@user.address != null && @newData.wallet == @user.address",
      "update": "@user.address != null && @data.wallet == @user.address",
      "delete": "@user.address != null && @data.wallet == @user.address"
    }
  }
}
```

Every write binds the record to its owner: `@newData.wallet == @user.address` on
create, `@data.wallet == @user.address` on update and delete.
A bare `@user.address != null` would authorize *any* signed-in wallet to
overwrite or delete *any* player's record - the id `$id` alone never proves
ownership, so per-user data must compare the caller to the record's owner field
(or bind `$id == @user.address`).
For a value the client must not set for itself - like `score` in a leaderboard -
write it from a trusted server function instead of the client.

## What changes when a collection is onchain

- **A write/delete is a real Solana transaction the user's wallet signs.** It is
  signed **client-side** by the user's own wallet (Phantom) - Bounded never holds
  the user's key. The document is a program account/PDA; the write returns its
  transaction signature. This is the crypto-native path: the user authorizes
  every mutation on-chain, themselves. (A delete is the same tx with a `null`
  body.)
- **Field types map to on-chain types** - `UInt`→u64, `Int`→i64, `String`,
  `Bool`, `Address`→a 32-byte pubkey.
- **Reads, lists, `subscribe`, and `aggregate` work identically.** Bounded
  mirrors the on-chain state into the read path, so you query an onchain
  collection like any other.
- **On-chain data is public** - anyone can read the chain. Use `"read": "true"`.

### Onchain updates are patches

An onchain update object is a patch, not a replacement document.
The program starts with the stored fields and applies operations only for keys present in the submitted object.
Fields omitted from the update remain unchanged.

A field declared with `!` is write-once.
Include it when creating the document, but omit it from every update payload.
Supplying the readonly key again is still a write operation, even when the value is identical, and the transaction fails with the Anchor error name `FieldReadOnly`.
The update rule can and should keep its immutability clause because `@newData` represents the merged candidate document.

```jsonc
// Create includes the write-once owner.
{ "owner": "<wallet>", "value": 1, "note": "created" }

// Update sends only mutable fields.
{ "value": 2, "note": "updated" }
```

After confirming the update transaction, poll the Bounded mirror until it contains the new mutable values and the original readonly value.
Do not treat omission as deletion, and do not copy the complete mirrored document back into an onchain update.

## Onchain rules: `@user.address` only

Inside an `onchain: true` collection, rules may reference **only
`@user.address`** (the wallet). **`@user.id`, `@user.email`, AND
`@user.isAnonymous` are all rejected onchain** - they are off-chain identity
concepts the Solana program has no notion of. The wallet is the only principal
the chain sees.

```
"create": "@user.address != null"        // ✓ legal onchain
"create": "@user.id != null"             // ✗ rejected - id is off-chain only
"create": "@user.isAnonymous == false"   // ✗ rejected - onchain too
```

This is the opposite of the off-chain default: off-chain, prefer the universal
`@user.id`; onchain, you have nothing but `@user.address`. See
[policy-reference.md](../../bounded-backend/docs/policy-reference.md) for the full identity triad.

## The mirror is eventually-consistent / don't read-after-write

The read path is a **mirror** of on-chain state that runs a few seconds behind
the chain. A `get` **immediately** after an onchain `set`/`delete` can still
return the prior value until the indexer catches up. This is **not** a stale
cache - it self-corrects.

- **Do not read immediately after a write and call that confirmation.**
  First confirm the returned transaction signature at the required commitment.
  Then poll or subscribe until the exact expected Bounded mirror, query, reveal, account, or denied state appears.
- A returned signature proves submission, not indexing or reveal completion.
  A toast proves neither.
  A stale first mirror read is not evidence that the transaction failed.
- Give every automated acceptance run a unique run ID and a bounded polling deadline.
  Preserve only sanitized public signatures, explorer links, and postcondition results.
- For an onchain `data set`, `data set-many`, or `data delete`, the CLI `--json`
  receipt deliberately contains only `transactionId` and `chain`.
  It never returns the raw server transaction, serialized transaction, or signed
  transaction bytes.
  Treat the public transaction ID as the input to independent confirmation, not
  as proof that the mirror has indexed the expected state.

## Gotcha: `0xbc4` AccountNotInitialized

> **On an onchain-protocol app, forgetting `"onchain": true` on a collection is a
> hard failure, not a silent off-chain fallback.** Bounded routes the app's
> collection writes on-chain for this protocol, but deploy only
> **registers** the collections you marked `onchain: true`. A collection left
> without the flag is written on-chain yet was never registered - so every write
> to it fails `AccountNotInitialized` (Solana custom error **`0xbc4`**) with no
> off-chain fallback.

So on `realtime_devnet` / `realtime_mainnet`, mark **every** collection
`onchain: true`. `bounded deploy` warns and names any unflagged collections. (On
the off-chain `realtime_offchain` protocol it's the reverse: `onchain: true`
collections are stored off-chain - deploy prints that warning too.)

### Diagnose custom errors by the live Anchor log name

A numeric Solana custom error can be decoded incorrectly when a local IDL or client error table does not match the deployed program revision.
When the numeric label is ambiguous, inspect the RPC simulation or confirmed transaction logs from the exact deployed program.
Treat the live Anchor `Error Code` name and `Error Message` as authoritative for diagnosis.
If the logs name `FieldReadOnly`, fix the update payload by omitting the readonly field even when a stale numeric table suggests another error.
Preserve deployed ABI discriminants and correct the stale decoder or IDL mapping.
Do not renumber program errors merely to make a local numeric table agree.

## Poofnet: onchain simulation on `realtime_offchain`

On `realtime_offchain` (the default protocol, aka **poofnet**), `onchain: true`
collections don't reject or no-op - the platform **simulates onchain execution**
in the realtime runtime.
Poofnet models many source surfaces, including token flows, external trading plugins, and `@OraclePlugin.getRandomNumber`.
That model is development evidence only.
It does not prove external devnet program availability, replacement configuration, real-network funding, or a live transaction.
A policy that verifies on Poofnet still needs every called function checked against the [devnet capability catalog](solana-capability-status.md).

- **Auto-faucet.** The first mutating action by a wallet grants it a one-time
  **10 SOL + 1,000 USDC** (simulated). No funding step; the USDC is the on-ramp
  into perps collateral (`emberDeposit`) and stable-quoted pools.
  This simulated Poofnet balance does not make the mainnet-only `@TokenPlugin.USDC` constant usable on devnet.
- **Onchain-parity result fields.** Every write to an `onchain: true` path is
  stamped at commit with `_transaction_hash` (signature-shaped) and
  `_block_number` (sim slot).
  A **failed** onchain hook still **persists the doc** and stamps `_error_message`
  with the failure reason - read it back or subscribe to surface trade errors in UI.
  **A record existing is NOT proof the onchain action succeeded.**
  `_error_message` being present means the action **FAILED**; it is a failure signal
  to gate on, not merely UI text.
  Any rule, hook, subscription, or UI that represents "successful onchain execution"
  MUST branch on the *absence* of `_error_message` (or an explicit success marker)
  and **fail closed** otherwise - never grant a mint, unlock, claim, or downstream
  write just because the row appeared or a post-commit hook fired.
  On a real chain a failed transaction would not commit the success state, so
  treating record-existence as success is a sandbox-only mistake that breaks on
  mainnet.
- **Both hooks run.** A collection declaring `hooks.onchain` **and**
  `hooks.offchain` runs both on poofnet - onchain first (as the chain program
  would, inside the tx), then offchain (post-commit) - matching real-network
  semantics.
- **Offchain-only plugin reads have no working chain-query placement today.**
  Source examples include `@PhoenixPerpsPlugin.getPositionSize` and `@DeFiPlugin.getMeteoraSwapQuote`, which verify rejects inside `onchain: true` collections.
  The current named-query executor does not activate standalone chain execution for an `onchain: false` path.
  Do not recommend an offchain view collection as a workaround until the runtime is fixed.
- **Query errors are explicit.** A failed or undeclared named query returns a
  per-row `error` alongside `result: null` - `runQuery` (client ≥0.0.42) throws
  it; the CLI (≥0.0.56) prints it verbatim.
- **Current chain-backed named queries must be declared on an `onchain: true` path.**
  They never sign or submit, but current chain execution still requires an authenticated `userAddress` even when the path's read rule is public.
  Catalog browsing, form validation, and local preflight remain wallet-free.
  Actual chain-query execution does not.
  `queryArgs` are staged into `@newData` for the query expression.
  Preserve the same result/error shape on Poofnet and Solana, subject to mirror finality.
- **Extended mutation primitives are capability-gated.** Runtime-v2 source adds
  `@CPI`, `@Solana`, `@Bytes`, and `@App`; arbitrary CPI and cross-app mutation
  must have a real Poofnet state model or fail closed. See
  [policy-primitives.md](policy-primitives.md) before using them.

### Mirror completeness

Bounded schedules confirmed read-backs for paths written through its onchain
write API, so those documents enter the offchain read store and subscriptions.
Do not assume that every external program transaction or independently-submitted
write is mirrored until the environment's authenticated Helius indexer has been
verified end to end. The indexer must decode `set_documents*`, reread authoritative
Document accounts, handle deletes and cross-app targets, reject stale/replayed
events, and route by the decoded app id. Synthetic log-only indexing is not enough.

Mirror recovery assumes deliveries can stop for hours or days. Runtime source
persists a strongly-consistent per-network/program cursor, acknowledges live
events only after durable enqueue, and applies authoritative account rereads with
per-path slot fences. A scheduled recovery job scans finalized history from the
exact predecessor signature and advances with compare-and-swap only after every
app batch applies. Missing history triggers a finalized full-account inventory:
changed/new Documents are upserted, absent paths are tombstoned, and unchanged
paths advance their fence without a duplicate update event. Replay rebuilds
mirror state; it does not run hooks, callbacks, billing, or sponsorship effects.
Live or historical apps with missing routing metadata or typed deterministic
path/schema incompatibilities in current policies remain explicit reconciliation
debt instead of blocking valid apps. Convert only recognized app-local `400`
codes to debt; untyped rejections and transport/RPC/DO failures still retry.
Recovery commits a conservative partial baseline, continues finalized catch-up
for routable apps, and retries the unresolved full inventory daily; it never
replays application side effects. An i64/u64 outside JavaScript's safe integer
range quarantines the **whole app** from that event/inventory as explicit debt;
never round, stringify, or partially mirror it. Other apps still reconcile. Live
events record debt, apply/register only routable batches, and acknowledge after
the exact debt set persists; finalized backfill may advance with the same debt.
Persist exact unresolved IDs separately from the bounded human status summary;
if migrating a legacy sampled reason, force full inventory instead of treating
the sample as complete. Register recovered app IDs with the cursor in chunks of
at most 1,000 so a larger inventory persists the complete routing set. Retryable
decoder or sink failures can still reach the DLQ.
Full reconciliation replaces the mirrored user-data object, so fields removed
onchain do not survive through normal offchain patch semantics.

The runtime-v2 ingestion path uses network-specific raw Helius webhooks and a
durable queue. It acknowledges only after enqueue, decodes/rereads in the scoped
Node helper, and applies slot-fenced upserts or tombstones per decoded app. Treat
this as available only after that environment has the queue/DLQ, webhook secret,
RPC, persisted logs/alerts, and end-to-end recovery checks configured. Internal
cursor/queue status and repaired-DLQ replay require a dedicated recovery-operator
secret (`X-Onchain-Recovery-Secret`); a broad service secret must be rejected.
Status covers both the primary queue and DLQ and alerts on unavailable metrics,
old/large primary backlog, or a non-empty DLQ. The scheduled monitor must page a
configured operations recipient directly through the Worker `EMAIL` binding;
structured logs alone are not paging. Page a primary backlog of at least 1,000
or any nonempty DLQ immediately. Require age-only or metrics-unavailable signals
to persist through a second observation at least ten minutes later. Persist
incident state: after a page, suppress all repeats for six hours even if the alert
set changes, and clear only after two healthy samples at least ten minutes apart.
Scheduled recovery controls must also coalesce while the primary queue has
backlog; one cursor-based scan can catch up all finalized history after delivery
resumes. Large snapshots use
numbered chunks in an app-local staging area and become visible only after the
complete write set passes slot and invariant checks. Repeated chunks and
completed runs are idempotent. Compiler/runtime source support is not proof of an
operating mirror.

App builders do **not** create per-app Helius webhooks. Bounded owns one raw
program webhook per environment/network (`rawDevnet` for devnet) at
`/webhook/helius/<network>`, covering the exact program-id allowlist accepted by
that environment's ingress. Update that registration rather than adding another;
do not mix an unsupported legacy program into the same batched delivery.
The provider `authHeader` must equal the dedicated environment
`HELIUS_WEBHOOK_SECRET`. Operator status/replay uses a separate
`ONCHAIN_RECOVERY_OPERATOR_SECRET`; never reuse a broad internal service key.
Before calling a mirror live, prove:

1. Wrong auth returns `401`, while a confirmed raw transaction returns `200`
   only after `queued: 1`.
2. The queue consumer decodes the authoritative accounts, applies a slot-fenced
   app batch, and advances/registers recovery state.
3. Replaying the same signature is harmless; a prolonged delivery pause catches
   up oldest-first from finalized history without rerunning app side effects.
4. Queue failures alert, poison reaches the DLQ, and corrected replay is accepted
   only through the scoped validator. For a drill, start with an empty primary
   queue, restore the normal retry policy before replaying, verify the repaired
   event applies once, and remove only the known drill message from the DLQ.
5. The direct Email alert reaches the configured operations recipient. Prove
   immediate paging for at least 1,000 primary messages and any DLQ backlog, plus
   two-observation confirmation for age/metrics-only signals. Keep provider quota
   and legacy registrations in the release checklist; never delete them implicitly.

For production, keep provider delivery absent/disabled and pause queue delivery
before changing the stack. Deploy and verify the lossless decoder/developer API,
then the Worker with queue/DLQ bindings and both dedicated secrets. Reconcile,
resume under observation, and drain primary/DLQ backlog while reviewing explicit
debt. Create or update the environment webhook **last**, then prove a real
provider delivery. Never activate ingress against an unproven or unhealthy sink.

An absent Document PDA is a normal `null` read. Wrong owner/discriminator,
malformed account data, RPC failure, or an integer outside JavaScript's safe
range is an unavailable/error result, never a fabricated miss or rounded value.

### `--skip-preflight`

On `set` / `set-many`, an **onchain-only** flag: skip RPC preflight simulation so
failing txs still land on-chain (useful when simulation is flaky or you want the
on-chain error rather than a client-side preflight reject). No effect on the
realtime data plane. See [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#--skip-preflight).

## Transaction-size limit: one hook = one Solana transaction

Each onchain hook builds **one Solana transaction per write**, and a Solana
transaction has a hard **1232-byte packet limit** (effective ~1182 after
signatures). A hook that packs too much into one write - a single big instruction,
or several actions `&&`-chained, or a large `setMany` bundle - produces a
transaction that **won't fit and fails with "Transaction too large"**.

The runtime automatically compresses an over-limit transaction against the
**standard platform lookup table** (framework programs, sysvars, plugin
authorities, WSOL move from 32-byte keys to 1-byte indexes), so hooks whose bulk
is *fixed well-known accounts* land even past ~1182 uncompressed - e.g. the
Meteora `createAccount + createMeteoraConfig` launch-config hook (~1225B raw,
~1104B compressed) deploys and lands. What compression can NOT save: **per-write
accounts** (fresh mints, ATAs, per-doc PDAs, user wallets) and **instruction
data** (your argument bytes). If a hook is too big because of those, only
restructuring fixes it.

Bounded surfaces the limit at two points so you don't discover it when a user's
write fails on-chain:

- **`bounded verify` / `bounded deploy` (compile-time).** The validator estimates
  each `onchain: true` collection's single-document hook transaction **after
  standard-LUT compression**. If it still exceeds the limit, deploy is **rejected**
  with a message naming the collection, the hook, the actions, the sizes and the
  fix. This gate runs for **every** Solana protocol - devnet, mainnet, mainnet-
  preview **and poofnet** (`realtime_offchain`). Poofnet enforcing it is
  deliberate: a policy proven on poofnet is expected to move to mainnet unchanged,
  so an unfittable hook must fail the poofnet deploy TODAY, not the mainnet deploy
  months later (sim == mainnet parity). **Never work around this gate by deploying
  poofnet-only and hoping** - the same write is rejected by poofnet's runtime
  guard anyway. The gate blocks only on the **confident, devnet-measured** size -
  a hook built purely from not-yet-calibrated plugin calls is never false-blocked
  at deploy; the runtime guard still checks the live estimate.
- **Runtime (poofnet).** On `realtime_offchain`, the actual write is checked
  against the same compression-aware model: a write confidently over the cap even
  compressed is **rejected 413** ("would fail on mainnet"); estimate-driven
  overages **warn without blocking**. The 413 carries the full reason in both
  `error` and `message` (so `err.message` in the SDK is actionable) and is
  recorded as a **decision** - `bounded decisions` answers "why did my write
  fail". A warn-band write succeeds with a `warnings: [...]` array on the
  response. Bundles repeating the same action are estimated with calibrated
  **repeat costs** - repeated accounts dedupe on-chain, so N calls cost less than
  N× one call. An app-configured lookup table (`appConfig.lutAddress`) demotes a
  residual overage to a warning (the builder compresses with it too).

### When verify rejects a hook for size - how to fix it, in order

1. **Split the hook across collections/writes.** One write = one transaction, so
   independent actions belong in separate collections (each with its own small
   hook) or sequential writes. Only actions that genuinely must commit atomically
   belong `&&`-chained in one hook. Note the flip side: a Bounded write commits
   atomically, so splitting REMOVES atomicity between the parts - sequence them
   from a function (create A, then create B; handle the "A exists, B failed"
   retry) rather than pretending they were atomic.
2. **A single oversized instruction cannot be split.** If one plugin call alone
   is over the limit, splitting does nothing - the only levers are fewer/shorter
   arguments and lookup-table compression.
3. **Pass fewer arguments.** Optional args you omit cost zero bytes; every
   address argument adds ~32 bytes of key plus account metas, and the serialized
   argument text rides verbatim inside the transaction data. If a default is
   acceptable, do not spell it out.
4. **String length is real bytes on the wire.** Token names, symbols, and
   especially **URIs** are serialized into the transaction (and often hashed into
   PDA derivations). A 150-character metadata URI is 150 bytes you may not have.
   Use short hosts/paths for onchain URIs; keep symbols tight; never put
   paragraphs in an onchain field.
5. **Keep `onchain: true` collections lean.** Every declared field of the
   document is serialized into the same transaction as the hook. Display copy,
   descriptions, tags, denorm counters - all of that belongs in a parallel
   **offchain** collection keyed by the same id, not on the onchain doc.
6. **Fewer documents per write.** A `setMany` bundles every onchain doc into ONE
   transaction. Batch in smaller writes when the estimator warns.
7. **Lookup tables for account-heavy hooks.** The standard platform table is
   applied automatically; if your hook references many *stable* extra accounts
   (a fixed pool, a fixed vault set), configure an app lookup table containing
   them. Per-write accounts can never be table-compressed - restructure instead.

A useful mental model for budgeting: base transaction overhead is roughly
~470 bytes (signatures, header, compute-budget, shared accounts) and each plugin
call adds its marginal cost (a token create ~280B, a transfer ~140B, a Meteora
config ~720B). If your hook's calls plus argument text can't fit in what remains
under 1182, restructure before you deploy - the gate is telling you every single
write to that collection would fail on a real chain, which is exactly the kind of
guarantee failure Bounded exists to catch at deploy time.

## Policy upgrade governance (runtime v3)

Governed upgrades are **not yet available on mainnet**; a mainnet policy
declaring `governance.upgrade`, and mainnet enrollment, are both rejected at
validation. The section below applies to devnet today.

Onchain apps have three upgrade modes. **Wallet** mode is the legacy/default
mode and uses the app owner's signed permit. **Policy** mode
lets a stable onchain controller path authorize an exact policy manifest.
**Immutable** mode permanently rejects policy changes. Policy and immutable
governance require a deployed runtime-v3 program; never infer that capability
from local source or compiler support.

Enrollment is an explicit owner-signed second phase after the controller and
all governed paths exist. It records the exact current path set and state hashes,
so a policy declaration alone cannot claim chain governance. A governed update
binds the controller approval to a sorted Merkle manifest of every final upsert
or deletion. The admin may only stage, seal, finalize, and activate those exact
operations; legacy permits are rejected after enrollment.

Sessions are replay-safe and recoverable. Repeating a landed stage/write/seal/
activate does not double-count, a base-state replay resets an interrupted stream,
and a chain-complete update can be reattached if database publication failed.
After expiry, an unstaged session may be cancelled; any staged session must be
extended and resumed without discarding progress. Chain state is authoritative:
read it before publishing or changing `governance.upgrade`, and never downgrade a
policy/immutable app through an offchain-only policy edit.

## Proof coverage onchain

The **same compiled rule bytecode** runs in the realtime runtime and the onchain
program, so rule properties (auth-required, immutability, implication) hold
identically on both. The verified onchain invariant subset includes direct,
materialized, and sharded `conserve`; epoch-bucketed `rollingSum` (including a
path-variable scope); `tenantTag`; and full-path `tenantEdge`. Materialized and
sharded conservation use aggregate-state PDAs. `tenantEdge.targetPathVariable`,
`rollingSum.resetAtMs`, and cross-scope variants fail closed. Full table in
[proof-coverage.md](../../bounded-backend/docs/proof-coverage.md).

## Game settlement: the two directions

When a game must settle a transaction (mint a reward, move tokens, record an
on-chain result), there are two patterns. They differ on **who holds the signing
key**.

### 1. Server-signed - composable today

The deterministic tick can `call` a function (see
[live-runtime.md](../../bounded-backend/docs/live-runtime.md) and
[principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md)). For settlement, the tick
`call`s a `settle`-type function that **holds the signing capability** - via a
live `session.live.runAs` service identity plus a declared function secret
holding the service keypair - and submits the Solana transaction itself, then
writes the authoritative result.

```ts
// live.tick - the game decides a winner and asks the settle function to pay out
return {
  state: { ...state, phase: "settling" },
  call: { fn: "settle", args: { winner: state.winner, pot: state.pot }, as: state.winner },
};
```

```json
{
  "functions": {
    "settle": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/settle.ts",
      "secrets": ["SETTLE_KEYPAIR"]
    }
  }
}
```

For a live tick, put the funded service identity on `session.live.runAs` and gate
the function with `@origin`. Function-local `actAs` is still the right tool for
admin/scheduled service actions, but deploy requires every `actAs` function's
`auth` rule to imply the app admin predicate; don't pair `actAs` with
`auth: "true"`.

The settle function signs with its own service keypair (a function secret, never
the user's key) and submits the tx. Good for **"the game settles"** - the house
pays out, mints the reward, records the result. This is the recommended path
today. The signing key is a function secret; see
[service-keys.md](../../bounded-backend/docs/service-keys.md) for `actAs` + the on-chain signing key, and
[ai-npcs.md](../../bounded-backend/docs/ai-npcs.md) for the same `call` primitive driving an NPC.

> The `as` field is a validation hint, not an identity or billing override (the
> field a developer writes is always **`as`**). A live call runs under the
> configured live-call principal. See
> [principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md).

### 2. Client-signed handoff - not currently supported

The server **never holds the user's key**. The intended pattern:

1. The tick surfaces a `pendingAction = { ref, kind: 'signTx', tx }` in that
   player's **view** (`views(state)` → read via `live.subscribeView`).
2. The client's own wallet (Phantom) signs **and submits** the tx.
3. The client returns `{ ref, txid }` as an ordinary **intent** (`live.intent`).
4. The tick does **not** trust the returned `txid`. It `call`s a verifier (or a
   blessed onchain-confirm) that checks the tx actually **landed** on-chain
   before changing authoritative state.

```ts
// Illustration only; pendingAction surfacing + verify-on-confirm is not currently supported
function views(state) {
  const out = {};
  for (const p of state.players) {
    out[p.id] = {
      ...projectFor(p, state),
      pendingAction: p.owesEntry
        ? { ref: `entry:${p.id}`, kind: "signTx", tx: state.entryTxFor[p.id] }
        : null,
    };
  }
  return out;
}
```

This keeps the user's key with the user (the chain authorizes the move, not the
server) while the game stays the authority on **outcome** (it only advances state
after confirming the tx). Do not build against this pattern today:
`pendingAction` surfacing and the trust-nothing verify-on-confirm loop are not
currently supported. For settlement you can ship now, use server-signed above.

## Related

- [data-plane.md](../../bounded-backend/docs/data-plane.md) - write/read semantics; onchain summary points here
- [proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) - which invariants hold onchain; points here
- [policy-reference.md](../../bounded-backend/docs/policy-reference.md) - the identity triad; onchain-forbidden vars
- [service-keys.md](../../bounded-backend/docs/service-keys.md) - `actAs` + the on-chain signing key for server-signed settle
- [live-runtime.md](../../bounded-backend/docs/live-runtime.md) - the `call` primitive a tick uses to settle
- [principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md) - who `@user` is for a live call (`as`, SYSTEM, `actAs`)
- [ai-npcs.md](../../bounded-backend/docs/ai-npcs.md) - the same `call` primitive driving an NPC
- [hooks-and-anti-cheat.md](../../bounded-backend/docs/hooks-and-anti-cheat.md#onchain-update-signing-note) - the mainnet permit
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#--skip-preflight) - `--protocol`, `--skip-preflight`
