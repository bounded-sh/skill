# Capabilities & Limits

**What's in here / when to read this:** an honest map of what Bounded is great at,
what it does **not** do, scale ceilings, and the proof boundary. Read it before
promising a user something Bounded can't deliver.

## What Bounded is great for

| Strength | Why |
|---|---|
| **Provable realtime backend** | One `policy.json` → collections, auth rules, and invariants proven by Z3 at deploy and enforced atomically by Bounded. Constraint-breaking writes are `409`s, never partial. |
| **Money / value safety** | `conserve` proves a total can't be minted or destroyed; `rollingSum` proves spend/rate caps per window and per actor. These are proofs, not prompt instructions. |
| **Multi-tenant isolation** | `tenantTag` / `tenantEdge` prove documents and references stay inside their tenant — "nothing leaks across orgs" discharged at deploy. |
| **Agent backends** | Zero-ceremony keypair identity; an agent goes from description to deployed without a human auth step ([building-for-agents.md](building-for-agents.md)). |
| **Realtime games** | Server-authoritative tick loop, fog-of-war views, proven per-player rate caps, automatic settlement ([../docs/realtime-and-games.md](../docs/realtime-and-games.md)). |
| **Onchain power-ups** | A verified subset of invariants enforces on Solana too ([../docs/proof-coverage.md](../docs/proof-coverage.md)). |
| **Imperative escape hatch (Functions)** | When declarative policy can't express it — *fetch a third-party API, transform, then write* — a **Bounded Function** runs your code. We don't prove its logic, but its writes still go through invariants and only policy-authorized callers can invoke it ([functions.md](../docs/functions.md)). |

## What Bounded does NOT support

| Limit | Use instead |
|---|---|
| **No native iOS/Android SDK** | Ship to phones with **React Native** + `@bounded-sh/client` ([building-for-react-native.md](building-for-react-native.md)). |
| **No native-binding compute** | Functions and the backend runtime are best for API calls, transforms, SDK writes, and JavaScript/TypeScript code. Use your own server as a `@bounded-sh/server` client for native-binding workloads. |
| **Long-running / batch / background work** | The **300s wall is Functions-only.** Don't run multi-minute work in a Function; use a backend-runtime project with resumable scheduled steps, or a Flue agent for a multi-step tool-use loop. |
| **No `@constants` or built-in roles in rules** | Express "admin" via a `get()`-read role or an address literal; pass deploy-time values with the CLI `--constants` flag. |
| **No array/object fields; no ternary; `/` reserved** | Model lists as sub-collections; branch with `(c && A) \|\| (!c && B)`; use `//` for integer division ([../docs/policy-reference.md](../docs/policy-reference.md)). |

## Scale Ceilings

Each app has a single-writer consistency boundary for atomic invariant
enforcement. The trade-offs:

- **Storage**: design large/cold data explicitly instead of treating one app as
  unlimited storage.
- **Throughput**: bounded by the single writer. Scale horizontally by
  **tenant-sharding** via path design or, for games, separate rooms.
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

## SDK status: beta

The SDK ships as **two** npm packages: `@bounded-sh/client` for the browser/RN
client, and `@bounded-sh/server` for the keypair client + `verifyWebhook` (the
shared `@bounded-sh/core` comes in transitively). Both are published on npm —
`npm i @bounded-sh/client` for a frontend, `npm i @bounded-sh/server` for a
backend. The operation surface in
[../docs/sdk-reference.md](../docs/sdk-reference.md) is stable in shape; Bounded
is in beta, so treat versions as pre-release.

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
- **Functions are the only un-proven tier.** A function's *logic* is not proven —
  only that its writes go through your invariants and its invocation is gated by
  the `auth` rule. Normal functions write as the verified caller; `actAs`
  service-identity functions are privileged and must be admin-gated. They are
  *un-proven logic, contained by proven walls.*

## Function proof boundary

Functions today are contained by proven walls: their writes must pass policy
rules and invariants, and their invocation must pass the function `auth` rule.
The function body's imperative logic is not itself proven, so keep hard
guarantees in policy. Detail:
[../docs/functions-when-to-use.md](../docs/functions-when-to-use.md#current-proof-boundary).

## Related

- [../docs/proof-coverage.md](../docs/proof-coverage.md) — exactly what is proven on which runtime
- [building-a-backend.md](building-a-backend.md) — hooks vs your own server code
- [building-for-react-native.md](building-for-react-native.md) — the mobile story
- [../docs/invariants.md](../docs/invariants.md) — `conserve`/`rollingSum`/tenant invariants and sharding
- [../docs/hooks-scheduled-webhooks.md](../docs/hooks-scheduled-webhooks.md) — in-boundary logic and webhooks
