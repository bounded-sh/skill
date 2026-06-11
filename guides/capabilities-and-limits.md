# Capabilities & Limits

An honest map of what Bounded is great at and what it does **not** do. Read this
before promising a user something Bounded can't deliver — and to recognize when
it's the right tool.

## What Bounded is great for

| Strength | Why |
|---|---|
| **Provable realtime backend** | One `policy.json` → collections, auth rules, and invariants proven by Z3 at deploy and enforced atomically over a realtime Durable Object. Constraint-breaking writes are `409`s, never partial. |
| **Money / value safety** | `conserve` proves a total can't be minted or destroyed; `rollingSum` proves spend/rate caps per window and per actor. These are proofs, not prompt instructions. |
| **Multi-tenant isolation** | `tenantTag` / `tenantEdge` prove documents and references stay inside their tenant — "nothing leaks across orgs" discharged at deploy. |
| **Agent backends** | Zero-ceremony keypair identity; an agent goes from description to deployed without a human auth step ([building-for-agents.md](building-for-agents.md)). |
| **Realtime games** | Server-authoritative tick loop, fog-of-war views, proven per-player rate caps, automatic settlement ([../docs/realtime-and-games.md](../docs/realtime-and-games.md)). |
| **Onchain power-ups** | A verified subset of invariants enforces on Solana too ([../docs/proof-coverage.md](../docs/proof-coverage.md)). |

## What Bounded does NOT support

| Limit | Use instead |
|---|---|
| **No native iOS/Android SDK** | Ship to phones with **React Native** + `@bounded/client` ([building-for-react-native.md](building-for-react-native.md)). |
| **No arbitrary server-function runtime** | No Lambda/PartyServer/Edge-function tier. In-boundary logic → policy **hooks** (`hooks.offchain`, `hooks.tick`, `hooks.scheduled`, `dueRows`); outbound integration → **webhooks** + your own server as a `@bounded/server` client ([../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md), [building-a-backend.md](building-a-backend.md)). |
| **No `@constants` or built-in roles in rules** | Express "admin" via a `get()`-read role or an address literal; pass deploy-time values with the CLI `--constants` flag. |
| **No array/object fields; no ternary; `/` reserved** | Model lists as sub-collections; branch with `(c && A) \|\| (!c && B)`; use `//` for integer division ([../docs/policy-reference.md](../docs/policy-reference.md)). |

## Scale ceilings (single-DO model)

Each app runs on a single realtime Durable Object with a single-writer cell —
that's what makes atomic invariant enforcement possible. The trade-offs:

- **Storage**: ~10GB SQLite per DO. Beyond that, opt into **Hyperdrive overflow**
  for cold/large data.
- **Throughput**: bounded by the single writer. Scale horizontally by
  **tenant-sharding** (one DO per tenant via the path's tenant variable) or, for
  games, **per-room** DOs — each room/tenant is its own writer.
- **Hot aggregates**: a write-hot `conserve` total can use `materialization:
  "sharded"` to spread the aggregate across shard rows
  ([../docs/invariants.md](../docs/invariants.md)).

If a single logical entity must sustain very high write throughput against one
invariant, that is the case to design around (shard the tenant, split the room).

## Onchain policy updates need a signer (deferred)

For onchain apps, updating the deployed policy requires a signer step that is not
yet wired in the CLI flow. Offchain (realtime) apps deploy policy updates with
`bounded deploy` directly. Plan onchain policy changes as a human-signed step
until this lands.

## SDK status: beta, not published

`@bounded/client` and `@bounded/server` are **not yet on npm**. The operation
surface in [../docs/sdk-reference.md](../docs/sdk-reference.md) is exported from
source and stable in shape, but treat versions/install as pre-release.

## What is NOT proven

The proof boundary is precise — don't overclaim it:

- Proofs cover **declared** rules and invariants only. An invariant you didn't
  declare isn't proven (green ≠ safe).
- Proofs are about the policy and its enforcement algebra, **not** about
  application code. Your frontend, agent, or server can still have bugs — they
  just can't corrupt the declared constraints.
- **Liveness is not claimed**: rejecting every invalid write is proven; accepting
  every valid shape is not.
- A subset of invariants **fails closed** onchain (rejected at verify time rather
  than under-enforced). Full layer-by-layer map:
  [../docs/proof-coverage.md](../docs/proof-coverage.md).

## Related

- [../docs/proof-coverage.md](../docs/proof-coverage.md) — exactly what is proven on which runtime
- [building-a-backend.md](building-a-backend.md) — hooks vs your own server code
- [building-for-react-native.md](building-for-react-native.md) — the mobile story
- [../docs/invariants.md](../docs/invariants.md) — `conserve`/`rollingSum`/tenant invariants and sharding
- [../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md) — in-boundary logic and webhooks
