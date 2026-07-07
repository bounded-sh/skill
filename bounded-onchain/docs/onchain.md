# Onchain — Solana collections & client-signed transactions

**What's in here / when to read this:** putting a collection on Solana, what
changes when a write is a real chain transaction your wallet signs, the
`--protocol` choices, the rules that are legal onchain, the eventual-consistency
mirror (don't read-after-write), the `0xbc4` deploy gotcha + `--skip-preflight`,
the mainnet human-signed policy permit, and game settlement with server-signed
transactions. Client-signed game handoff is not currently supported.

This is the home for everything onchain. [data-plane.md](../../bounded-backend/docs/data-plane.md) and
[proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) summarize and point here.

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

- **Don't read-after-write to confirm an onchain mutation.** Trust the returned
  transaction signature, or use `subscribe`, which delivers the change once
  mirrored.
- For agents: a write that returns a signature **succeeded**; a follow-up read
  returning the old value is the mirror lagging, not a failed write.

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

### `--skip-preflight`

On `set` / `set-many`, an **onchain-only** flag: skip RPC preflight simulation so
failing txs still land on-chain (useful when simulation is flaky or you want the
on-chain error rather than a client-side preflight reject). No effect on the
realtime data plane. See [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#-skip-preflight).

## Mainnet policy updates need a human-signed permit

Updating a **mainnet** app's policy requires an onchain **authority-permit
signature** — the on-chain program must see a signed permit from the app
authority before accepting a new policy.

- **The default path never hits it.** Off-chain / devnet apps update their policy
  with no onchain signature. You only encounter the permit on a `realtime_mainnet`
  program.
- **Frictionless agent signing of the permit is not currently supported.** For now a
  mainnet policy update is a deliberately human-gated step. When advising an
  agent, assume the default off-chain path. See
  [hooks-and-anti-cheat.md](../../bounded-backend/docs/hooks-and-anti-cheat.md#onchain-update-signing-note).

## Proof coverage onchain

The **same compiled rule bytecode** runs in the realtime runtime and the onchain
program, so rule properties (auth-required, immutability, implication) hold
identically on both. Invariants are a verified subset onchain — `conserve`
(direct), `rollingSum` (epoch-bucketed, conservative), and `tenantTag` are
enforced; materialized/sharded `conserve` and `tenantEdge` **fail closed**
(rejected at verify if declared `onchainSupported`, rejected at runtime if
metadata arrives). Full table in [proof-coverage.md](../../bounded-backend/docs/proof-coverage.md).

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
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#-skip-preflight) — `--protocol`, `--skip-preflight`
