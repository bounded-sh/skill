# Onchain — Solana collections & client-signed transactions

**What's in here / when to read this:** putting a collection on Solana, what
changes when a write is a real chain transaction your wallet signs, the
`--protocol` choices, the rules that are legal onchain, the eventual-consistency
mirror (don't read-after-write), the `0xbc4` deploy gotcha + `--skip-preflight`,
policy upgrade governance, and game settlement with server-signed
transactions. Client-signed game handoff is not currently supported.

This is the home for everything onchain. [data-plane.md](../../bounded-backend/docs/data-plane.md) and
[proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) summarize and point here.

## Contents

- [Opt in and protocols](#default-is-off-chain--opt-in-deliberately)
- [Onchain writes and reads](#what-changes-when-a-collection-is-onchain)
- [Identity rules](#onchain-rules-useraddress-only)
- [Mirror consistency and recovery](#the-mirror-is-eventually-consistent--dont-read-after-write)
- [Poofnet parity](#poofnet-onchain-simulation-on-realtime_offchain)
- [Transaction-size limit](#transaction-size-limit-one-hook--one-solana-transaction)
- [Policy upgrade governance](#policy-upgrade-governance-runtime-v3)
- [Proof coverage](#proof-coverage-onchain)
- [Game settlement](#game-settlement-the-two-directions)

## Default is off-chain — opt in deliberately

Every collection is **off-chain** (Bounded's durable store) unless you choose
otherwise, and the off-chain protocol is the default. Going onchain is two
decisions that must agree:

1. deploy the app on an onchain **protocol**, and
2. mark **each** onchain collection `"onchain": true` in the policy.

### `--protocol`

| Protocol | Where data lives | When |
|---|---|---|
| `realtime_offchain` | Bounded's durable store (no chain) | **default** — fastest, no wallet signing, full feature set |
| `realtime_devnet` | Solana **devnet** program accounts | test the real onchain path with throwaway SOL |
| `realtime_mainnet` | Solana **mainnet** program accounts | production onchain (policy updates need a human permit — see below) |

```bash
# off-chain (default) — omit --protocol or pass realtime_offchain
bounded deploy ./policy.json --create --name my-app

# onchain on devnet
bounded deploy ./policy.json --create --name my-app --protocol realtime_devnet
```

```json
{
  "players/$id": {
    "onchain": true,
    "fields": { "score": "UInt", "wallet": "Address", "active": "Bool" },
    "rules": {
      "read":   "true",
      "create": "@user.address != null",
      "update": "@user.address != null",
      "delete": "@user.address != null"
    }
  }
}
```

## What changes when a collection is onchain

- **A write/delete is a real Solana transaction the user's wallet signs.** It is
  signed **client-side** by the user's own wallet (Phantom) — Bounded never holds
  the user's key. The document is a program account/PDA; the write returns its
  transaction signature. This is the crypto-native path: the user authorizes
  every mutation on-chain, themselves. (A delete is the same tx with a `null`
  body.)
- **Field types map to on-chain types** — `UInt`→u64, `Int`→i64, `String`,
  `Bool`, `Address`→a 32-byte pubkey.
- **Reads, lists, `subscribe`, and `aggregate` work identically.** Bounded
  mirrors the on-chain state into the read path, so you query an onchain
  collection like any other.
- **On-chain data is public** — anyone can read the chain. Use `"read": "true"`.

## Onchain rules: `@user.address` only

Inside an `onchain: true` collection, rules may reference **only
`@user.address`** (the wallet). **`@user.id`, `@user.email`, AND
`@user.isAnonymous` are all rejected onchain** — they are off-chain identity
concepts the Solana program has no notion of. The wallet is the only principal
the chain sees.

```
"create": "@user.address != null"        // ✓ legal onchain
"create": "@user.id != null"             // ✗ rejected — id is off-chain only
"create": "@user.isAnonymous == false"   // ✗ rejected — onchain too
```

This is the opposite of the off-chain default: off-chain, prefer the universal
`@user.id`; onchain, you have nothing but `@user.address`. See
[policy-reference.md](../../bounded-backend/docs/policy-reference.md) for the full identity triad.

## The mirror is eventually-consistent — don't read-after-write

The read path is a **mirror** of on-chain state that runs a few seconds behind
the chain. A `get` **immediately** after an onchain `set`/`delete` can still
return the prior value until the indexer catches up. This is **not** a stale
cache — it self-corrects.

- **Don't read-after-write to confirm an onchain mutation.** Use the returned
  transaction signature to verify the required commitment/finalization, or use
  `subscribe`, which delivers the change once mirrored.
- For agents: a returned signature identifies the submitted transaction; confirm
  its status when finalization matters. A follow-up mirror read returning the old
  value is not evidence that the transaction failed.

## Gotcha: `0xbc4` AccountNotInitialized

> **On an onchain-protocol app, forgetting `"onchain": true` on a collection is a
> hard failure, not a silent off-chain fallback.** Bounded routes the app's
> collection writes on-chain for this protocol, but deploy only
> **registers** the collections you marked `onchain: true`. A collection left
> without the flag is written on-chain yet was never registered — so every write
> to it fails `AccountNotInitialized` (Solana custom error **`0xbc4`**) with no
> off-chain fallback.

So on `realtime_devnet` / `realtime_mainnet`, mark **every** collection
`onchain: true`. `bounded deploy` warns and names any unflagged collections. (On
the off-chain `realtime_offchain` protocol it's the reverse: `onchain: true`
collections are stored off-chain — deploy prints that warning too.)

## Poofnet: onchain simulation on `realtime_offchain`

On `realtime_offchain` (the default protocol, aka **poofnet**), `onchain: true`
collections don't reject or no-op — the platform **simulates onchain execution**
in the realtime runtime. The full plugin surface works with real state:
Meteora DBC (config/pool/swap with real constant-product reserves + fee
schedules, claimable fee splits), pump.fun (create/buy/curve progress),
SPL tokens (create/transfer/balances), Phoenix perps (register/deposit/
long/short/positions), VRF addresses, and `@MathPlugin.getRandom`. The same
policy verifies unchanged for devnet/mainnet — build on poofnet, switch
protocols to go live.

- **Auto-faucet.** The first mutating action by a wallet grants it a one-time
  **10 SOL + 1,000 USDC** (simulated). No funding step; the USDC is the on-ramp
  into perps collateral (`emberDeposit`) and stable-quoted pools.
- **Onchain-parity result fields.** Every write to an `onchain: true` path is
  stamped at commit with `_transaction_hash` (signature-shaped) and
  `_block_number` (sim slot). A **failed** onchain hook persists the doc and
  stamps `_error_message` with the failure reason — read it back or subscribe
  to surface trade errors in UI.
- **Both hooks run.** A collection declaring `hooks.onchain` **and**
  `hooks.offchain` runs both on poofnet — onchain first (as the chain program
  would, inside the tx), then offchain (post-commit) — matching real-network
  semantics.
- **Offchain-only read functions need an `onchain: false` home.** Read helpers
  like `@PhoenixPerpsPlugin.getPositionSize` or `@DeFiPlugin.getMeteoraSwapQuote`
  are rejected by verify inside `onchain: true` collections. Put those queries on
  a separate `onchain: false` "view" collection (e.g. `market/$tokenId`,
  `phoenixview/$traderId`).
- **Query errors are explicit.** A failed or undeclared named query returns a
  per-row `error` alongside `result: null` — `runQuery` (client ≥0.0.42) throws
  it; the CLI (≥0.0.56) prints it verbatim.
- **Readonly onchain functions also belong in offchain view policies.** An
  `onchain: false` query may resolve chain-backed plugin reads through the
  read-only onchain query executor. This is the standard home for balances,
  pool quotes, positions, and other values that are illegal in an onchain
  mutation rule. It never signs or submits. Offchain rules may read mirrored
  onchain collections too; the reverse direction is forbidden. Preserve the
  same result/error shape on Poofnet and Solana, subject to mirror finality.
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
Historical apps with missing routing metadata or incompatible current policies
remain explicit reconciliation debt instead of blocking valid apps. Recovery
commits a conservative partial baseline, continues finalized catch-up for
routable apps, and retries the unresolved full inventory daily; it never replays
application side effects. An i64/u64 outside JavaScript's safe integer range
quarantines the **whole app** from that event/inventory as explicit debt; never
round, stringify, or partially mirror it. Other apps still reconcile. Live events
record that debt and acknowledge after routable batches apply; finalized backfill
may advance its cursor with the same debt recorded. Transport, RPC, decoder, or
sink failures still retry and can reach the DLQ.
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
structured logs alone are not paging. Large snapshots use numbered chunks in an
app-local staging area and become visible only after the complete write set
passes slot and invariant checks. Repeated chunks and completed runs are
idempotent. Compiler/runtime source support is not proof of an operating mirror.

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
5. The direct Email alert reaches the configured operations recipient for primary
   backlog/metrics failures and a non-empty DLQ. Keep provider quota and legacy
   registrations in the release checklist; never delete them implicitly.

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
signatures). A hook that packs too much into one write — a single big instruction
(e.g. `@DeFiPlugin.createMeteoraConfig` is ~1189B, `@DeFiPlugin.createPool` ~1341B),
or several actions `&&`-chained, or a large `setMany` bundle — produces a
transaction that **won't fit and fails with "Transaction too large"**.

Bounded surfaces this at two points so you don't discover it only when a user's
write fails on-chain:

- **`bounded verify` / `bounded deploy` (compile-time).** On a **devnet/mainnet**
  deploy, the validator estimates each `onchain: true` collection's single-document
  hook transaction. If it exceeds the limit, deploy is **rejected** with a message
  naming the collection, the hook, the actions in it, the estimated size, and the
  fix — so you learn at deploy time, not at runtime. (Not run for `realtime_offchain`,
  which simulates the hook.) `bounded deploy --create` infers the protocol from
  `--protocol`; for an app-less proof pass it explicitly:
  `bounded verify --protocol realtime_devnet ./policy.json` (otherwise the gate only
  fires when the protocol is inferred from `--app-id`). The gate blocks only on the
  **confident, devnet-measured** size — a hook built purely from not-yet-calibrated
  plugin calls is not false-blocked at deploy; the poofnet runtime guard still
  catches it against the live estimate.
- **Runtime (poofnet).** On `realtime_offchain`, the actual write is checked against
  the same model: a write over the hard cap is **rejected 413** ("would fail on
  mainnet"), and one in the 1182–1232 band is **allowed with a warning** (a lookup
  table makes it fit on a real chain). This is the mainnet-reality guard — poofnet
  no longer silently accepts writes a real chain would reject. The 413 carries the
  full reason in both `error` and `message` (so `err.message` in the SDK is
  actionable) and is recorded as a **decision** — `bounded decisions` answers "why
  did my write fail". A warn-band write succeeds with a `warnings: [...]` array on
  the response. Bundles repeating the same action (e.g. a `setMany` of several
  token creates) are estimated with calibrated **repeat costs** — repeated accounts
  dedupe on-chain, so N calls cost less than N× one call. If the app has a lookup
  table configured, an over-cap size warns instead of rejecting (the real builder
  compresses via the LUT).

**Fixes when you hit it:** split the hook across separate collections/writes (each
its own transaction), reduce the actions per write, or move the fixed accounts into
an **address lookup table** so the transaction compresses under the limit.

## Policy upgrade governance (runtime v3)

Onchain apps have three upgrade modes. **Wallet** mode is the legacy/default
mode and uses the app authority's human-signed mainnet permit. **Policy** mode
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

### 1. Server-signed — composable today

The deterministic tick can `call` a function (see
[live-runtime.md](../../bounded-backend/docs/live-runtime.md) and
[principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md)). For settlement, the tick
`call`s a `settle`-type function that **holds the signing capability** — via a
live `session.live.runAs` service identity plus a declared function secret
holding the service keypair — and submits the Solana transaction itself, then
writes the authoritative result.

```ts
// live.tick — the game decides a winner and asks the settle function to pay out
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
the user's key) and submits the tx. Good for **"the game settles"** — the house
pays out, mints the reward, records the result. This is the recommended path
today. The signing key is a function secret; see
[service-keys.md](../../bounded-backend/docs/service-keys.md) for `actAs` + the on-chain signing key, and
[ai-npcs.md](../../bounded-backend/docs/ai-npcs.md) for the same `call` primitive driving an NPC.

> The `as` field is a validation hint, not an identity or billing override (the
> field a developer writes is always **`as`**). A live call runs under the
> configured live-call principal. See
> [principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md).

### 2. Client-signed handoff — not currently supported

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

- [data-plane.md](../../bounded-backend/docs/data-plane.md) — write/read semantics; onchain summary points here
- [proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) — which invariants hold onchain; points here
- [policy-reference.md](../../bounded-backend/docs/policy-reference.md) — the identity triad; onchain-forbidden vars
- [service-keys.md](../../bounded-backend/docs/service-keys.md) — `actAs` + the on-chain signing key for server-signed settle
- [live-runtime.md](../../bounded-backend/docs/live-runtime.md) — the `call` primitive a tick uses to settle
- [principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md) — who `@user` is for a live call (`as`, SYSTEM, `actAs`)
- [ai-npcs.md](../../bounded-backend/docs/ai-npcs.md) — the same `call` primitive driving an NPC
- [hooks-and-anti-cheat.md](../../bounded-backend/docs/hooks-and-anti-cheat.md#onchain-update-signing-note) — the mainnet permit
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#--skip-preflight) — `--protocol`, `--skip-preflight`
