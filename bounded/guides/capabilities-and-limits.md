# Capabilities & Limits

**What's in here / when to read this:** an honest map of what Bounded is great at,
what it does **not** do, scale ceilings, and the proof boundary. Read it before
promising a user something Bounded can't deliver.

## What Bounded is great for

| Strength | Why |
|---|---|
| **Complete agent-built apps** | One project can carry a client-rendered web UI or React Native client plus policy, runtime, and deployment. A complete build should exercise the user flow and an intentional boundary rejection, not stop at backend generation. |
| **Managed app services** | Hosted auth, governed data, files/search, Functions, payments, AI services, ordinary realtime subscriptions, and live rooms share one app identity instead of requiring a separate service for each concern. |
| **Web delivery** | Build any client UI that emits static assets, preview it, then publish it to a `bounded.page` slug or custom domain with `bounded site deploy`. React Native uses the same client/runtime while native packaging remains external. |
| **Provable realtime backend** | One `policy.json` → collections and auth rules enforced at runtime, with declared invariants and generated safety obligations proved by Z3 at deploy. Constraint-breaking writes are `409`s, never partial. |
| **Money / value safety** | `conserve` proves a total can't be minted or destroyed; `rollingSum` proves spend/rate caps per window and per actor. These are proofs, not prompt instructions. |
| **Multi-tenant isolation** | `tenantTag` / `tenantEdge` prove documents and references stay inside their tenant - "nothing leaks across orgs" discharged at deploy. |
| **Agent backends** | Zero-ceremony wallet/keypair identity; an agent can go from description to deployed without a human auth step ([building-for-agents.md](../../bounded-backend/docs/building-for-agents.md)). |
| **Realtime games** | Server-authoritative tick loop, fog-of-war views, proven per-player rate caps, automatic settlement ([../docs/realtime-and-games.md](../../bounded-backend/docs/realtime-and-games.md)). |
| **Onchain power-ups** | A verified subset of invariants enforces on Solana too, while each function has a separate network status ([proof coverage](../../bounded-backend/docs/proof-coverage.md), [Solana devnet catalog](../../bounded-onchain/docs/solana-capability-status.md)). |
| **Imperative escape hatch (Functions)** | When declarative policy can't express it - *fetch a third-party API, transform, then write* - a **Bounded Function** runs your code. We don't prove its logic, but its writes still go through invariants and only policy-authorized callers can invoke it ([functions.md](../../bounded-backend/docs/functions.md)). |

## What Bounded does NOT support

| Limit | Use instead |
|---|---|
| **No native iOS/Android SDK** | Ship to phones with **React Native** + `@bounded-sh/client` ([building-for-react-native.md](../../bounded-frontend/docs/building-for-react-native.md)). |
| **No request-time frontend server on Bounded hosting** | Bounded hosts static or prerendered client assets. Use static export, or keep request-time SSR/ISR/framework API routes on an external frontend host while using Bounded app services. |
| **No native-binding compute** | Functions and the backend runtime are best for API calls, transforms, SDK writes, and JavaScript/TypeScript code. Use your own server as a `@bounded-sh/server` client for native-binding workloads. |
| **Long-running / batch / background work** | The **300s wall is Functions-only.** Don't run multi-minute work in a Function; use a backend-runtime project with resumable scheduled steps, or a Flue agent for a multi-step tool-use loop. |
| **No array/object fields; no ternary; `/` reserved** | Model lists as sub-collections; branch with `(c && A) \|\| (!c && B)`; use `//` for integer division ([../docs/policy-reference.md](../../bounded-backend/docs/policy-reference.md)). |
| **No blanket Solana-plugin guarantee** | Check the [per-function devnet catalog](../../bounded-onchain/docs/solana-capability-status.md). Compiler discovery, Poofnet simulation, and proof contracts do not establish live network support. |

Top-level `constants` and `defs` are supported and compile to literals; reference
them as `@const.NAME` and `@def.name`. Top-level scoped `roles` are also
supported. See [constants-and-defs.md](../../bounded-backend/docs/constants-and-defs.md)
and [roles.md](../../bounded-backend/docs/roles.md).

## Solana support is network-specific

Bounded records function discovery, deployed-runtime support, and live-network verification separately.
Jupiter, Phoenix, and DFlow are unavailable on current devnet. Kamino's program IS deployed there, but no usable market has been established, so it is equally untestable in practice.
Meteora is not blocked: the replacement DAMM v2 config was adopted on 2026-07-29 and the deployed runtime targets it, so its rows are unverified pending live proof.
Pump.fun, PumpSwap, and Tensor remain unverified until retained live proof exists.
The built-in `@TokenPlugin.USDC` constant is mainnet-only, so devnet TokenPlugin scenarios must use an app-created mint.
See [solana-capability-status.md](../../bounded-onchain/docs/solana-capability-status.md) for all 157 function rows.

## Scale Ceilings

Each app has a single-writer consistency boundary for atomic invariant
enforcement. The trade-offs:

- **Storage**: design large/cold data explicitly instead of treating one app as
  unlimited storage.
- **Throughput**: bounded by the single writer. Scale horizontally by
  **tenant-sharding** via path design or, for games, separate rooms.
- **Hot aggregates**: a write-hot `conserve` total can use `materialization:
  "sharded"` to spread the aggregate across shard rows
  ([../docs/invariants.md](../../bounded-backend/docs/invariants.md)).

If a single logical entity must sustain very high write throughput against one
invariant, that is the case to design around (shard the tenant, split the room).

## Mainnet policy updates need the owner's signature

Offchain (realtime) and **devnet** apps deploy policy updates with `bounded deploy` directly.
A devnet app is owned on-chain by the Bounded platform admin, so the platform signs its policy updates for you - a keyless web-login deploy needs no permit and no local key.

A **mainnet** app is owned on-chain by the wallet that created it, so every policy update carries an owner-signed authority permit.
That signature is wired, not deferred: from a CLI keypair it happens inside the one `bounded deploy` command (the CLI has the server mint a permit bound to that exact policy, verifies it locally, and signs it), and from a web-login account it is one browser approval per deploy.
Budget the owner's signature for mainnet policy changes; nothing else about the flow is manual.
Full mechanics: [onchain.md](../../bounded-onchain/docs/onchain.md#mainnet-apps-are-owned-by-your-wallet-immutably).

## SDK status: beta

The SDK ships as **two** npm packages: `@bounded-sh/client` for the browser/RN
client, and `@bounded-sh/server` for the keypair client + `verifyWebhook` (the
shared `@bounded-sh/core` comes in transitively). Both are published on npm -
`npm i @bounded-sh/client` for a frontend, `npm i @bounded-sh/server` for a
backend. The operation surface in
[../docs/sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) is stable in shape; Bounded
is in beta, so treat versions as pre-release.

## What is NOT proven

The proof boundary is precise - don't overclaim it:

- Blocking proofs cover **declared invariants** and generated safety obligations.
  Authorization rules are enforced and may be inputs to an obligation, but a
  green report is not a blanket proof that every access rule matches product
  intent. An invariant you did not declare is not proven (green != safe).
- Proofs are about the policy and its enforcement algebra, **not** about
  application code. Your frontend, agent, or server can still have bugs - they
  just can't corrupt the declared constraints.
- **Liveness is not claimed**: rejecting every invalid write is proven; accepting
  every valid shape is not.
- A subset of invariants **fails closed** onchain (rejected at verify time rather
  than under-enforced). Full layer-by-layer map:
  [../docs/proof-coverage.md](../../bounded-backend/docs/proof-coverage.md).
- A function's *logic* is not proven. Its writes go through enforced rules and
  proved invariants, and its invocation is gated by the `auth` rule. Normal
  functions write as the verified caller; `actAs`
  service-identity functions are privileged and must be admin-gated. They are
  *un-proven logic, contained by enforced rules and proved invariant walls.*

## Function proof boundary

Functions today are contained by enforced rules and proved invariant walls:
their writes must pass policy rules and invariants, and their invocation must
pass the function `auth` rule.
The function body's imperative logic is not itself proven, so keep hard
guarantees in policy. Detail:
[../docs/functions-when-to-use.md](../../bounded-backend/docs/functions-when-to-use.md#current-proof-boundary).

## Related

- [../docs/proof-coverage.md](../../bounded-backend/docs/proof-coverage.md) - exactly what is proven on which runtime
- [building-a-backend.md](../../bounded-backend/docs/building-a-backend.md) - hooks vs your own server code
- [building-for-react-native.md](../../bounded-frontend/docs/building-for-react-native.md) - the mobile story
- [../docs/invariants.md](../../bounded-backend/docs/invariants.md) - `conserve`/`rollingSum`/tenant invariants and sharding
- [../docs/hooks-scheduled-webhooks.md](../../bounded-backend/docs/hooks-scheduled-webhooks.md) - in-boundary logic and webhooks
