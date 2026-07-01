# Bounded + Bind — Master Context Pack

> **Purpose of this document.** A single, dense, breadth-first context pack covering
> every repo in the Bounded/Bind product family, assembled to seed a very capable AI
> model. It favors *completeness of surface area* over polish: every feature, module,
> command, capability, pricing detail, and honesty boundary is captured, with explicit
> maturity flags. Maturity legend used throughout:
>
> - **[SOLID]** — looks production-shaped, tested, or deployed.
> - **[PARTIAL]** — real but half-built / incomplete edges.
> - **[STUB/MOCK]** — placeholder, mock, or scaffolding only.
> - **[TODO]** — a called-out gap / not implemented.
>
> Source-of-truth branches read for this pack: **TaroBase = `bounded` branch**; all
> other repos = **`main`** (bounded-site read from `main` = what is live now).
> Assembled 2026-07-01. Prerelease: **no public users yet.**

---

## 0. TL;DR — what this all is

**Bounded (bounded.sh)** is a *provable realtime backend for apps* — think
Convex / Supabase / Firebase, but with one hard differentiator: you declare your
entire backend as a single **`policy.json`** (collections + rules + **invariants**),
and a **Z3-backed proof engine formally verifies the invariants at deploy time
(fail-closed)**. The runtime data plane then enforces those same rules atomically —
a write that would break an invariant (even one that looks individually valid) is
rejected with `409` and *nothing is applied*. The pitch: **"the backend that can
prove your app can't go wrong,"** built for the age where **agents write your code,
spend your money, and store your users' data.**

**Bind** is a separate, higher layer: a **client-agnostic, runtime-target-agnostic
prompt-to-app build platform** ("prompt → live app"). It owns AI-driven build
orchestration — gates, budgets, evidence, resumable workflows — and ships apps onto a
runtime target. Its **first-class runtime target is Bounded**, but the architecture is
target-agnostic. Bind is where the "use a superhuman AI to actually build/ship apps"
story lives; Bounded is the safe substrate those apps run on.

The strategic thesis (owner's framing): a vastly more capable AI is imminent; the
winners will be those who can *safely* let it write, spend, and ship. Bounded's proof
layer + Bind's orchestrated, gated, budgeted build loop are precisely a "let a
superhuman agent build and run real apps without it going off the rails" stack.

---

## 1. The repo ecosystem (6 repos)

| Repo | Language / stack | Role in the product | Rough size |
|---|---|---|---|
| **TaroBase** (branch `bounded`) | TS monorepo (Yarn Berry) | **Bounded itself** — the core platform: proof engine, policy engine, data plane, runtime, functions, live/realtime, SDK, CDK, token plugin, host worker | ~1,090 files |
| **bounded-cli** | **Go** | The `bounded` CLI — verify/deploy/dashboard/live-edit/data/functions/onchain + local dashboard daemon; distributed via `get.bounded.sh` | 97 files |
| **bounded-pay** | Bounded app (policy.json + TS functions) | **Bounded Pay** — provable payments + platform ledger; Stripe Connect platform; deployed prod app `6a3c5cc4c23db87fb06f4ea1` | 11 files |
| **bounded-site** | Vite + React + TS | **bounded.sh** marketing homepage + pricing/pay/link/upgrade/legal pages | 90 files |
| **skill** | Markdown (Claude/agent skill) | The public **`bounded` skill** — AI-facing docs that teach an agent to build/operate Bounded apps (SKILL.md + ~45 docs + guides) | 51 files |
| **bind** | TS monorepo (Bun workspaces) | **Bind** — prompt-to-app build orchestration platform layered on Bounded (core engine, adapters, API, worker, studio, testbed, docs) | 374 files |

**How they fit together:**

```text
                 ┌─────────────────────────────────────────────┐
   end user /    │                    BIND                      │
   agent prompt  │  prompt-to-app build platform (/v1 API)      │
      │          │  orchestration · gates · budgets · evidence  │
      ▼          │  resumable BuildWorkflow (start→gates→live)  │
  "build me      │  local-ai (Codex/Claude CLI) drives codegen  │
   an app"       │  RuntimeTargetAdapter ── first-class ──┐     │
                 └───────────────────────────────────────┼─────┘
                                                          ▼
                 ┌─────────────────────────────────────────────┐
                 │                  BOUNDED                     │
                 │  policy.json → `bounded verify` (Z3 proof) → │
                 │  `bounded deploy` → atomic runtime data plane│
                 │  functions · live/realtime · auth · files    │
                 │  ctx.ai / ctx.services · hooks · onchain      │
                 │        (TaroBase monorepo + host worker)     │
                 └───────────────────────────────────────────  ┘
                        ▲              ▲               ▲
             bounded-cli │   @tarobase │js-sdk   Bounded Pay (policy app)
             (Go, verify/ │  (browser/  │         Stripe Connect ledger,
              deploy/etc) │   server)   │         1% platform fee
                          │             │
                    bounded-site (bounded.sh marketing + pricing)
                    skill/ (AI-facing docs that operate all of the above)
```

**Distribution / release surface (from READMEs):** the CLI installs via
`curl -fsSL https://get.bounded.sh/install.sh | sh` (Cloudflare R2 bucket
`bounded-cli` behind `get.bounded.sh`); the SDK publishes via
`scripts/publish-sdks.sh`; the realtime worker deploys via `wrangler deploy`; the
site deploys on Vercel (push to `main` = prod, `staging`). The **master release
runbook** for *every* component is `bounded-cli/release/PUBLISHING.md`.

---

## 2. Bounded's core mental model (the vocabulary the AI must know)

**Public workflow:**
```text
describe app → generate policy.json → bounded verify → fix/accept proof results → bounded deploy → use via SDK/CLI
```
`bounded verify` is the proof loop; `bounded deploy` validates, compiles, and pushes
the policy. Runtime rule + invariant checks **fail closed.**

**policy.json** = the whole backend as data: collections (paths like
`accounts/$accountId`), per-collection **fields** (typed: `Int`, `UInt`, `String!`,
…), **rules** (`read`/`create`/`update`/`delete` boolean expressions), and
**invariants** (proof obligations). Plus `constants` (`@const`), reusable `@def`
fragments, `functions`, `hooks`, and multi-environment overlays.

**Expression language** used in rules: `@user` (`.id`, `.address`), `@data`
(current row), `@newData` (proposed row), `@time`, `@origin`, plus `get(/path)` and
`getAfter(/path)` cross-document reads, and `@const.*`.

**The four invariant types (the differentiator):**

| Invariant | Proves | Typical use |
|---|---|---|
| `rollingSum` | a summed field stays under a cap **within a time window** (`windowSeconds`, `scopeVariable`) | spend caps, rate limits per agent/user |
| `conserve` | a summed field **never changes** (no minting/burning) | balances, points, P&L, token supply |
| `bound` | hard ceiling/floor on a field | anti-cheat, physical limits |
| `tenantTag` / `tenantEdge` | every document carries its tenant; cross-tenant edges are impossible | multi-tenant isolation |

**Error contract the AI must reason about:**
- `403` — a write / function invoke failed a rule (auth/ownership/role/function auth). **Denied *reads* are hidden as `200` + empty data, never `403`.**
- `409` + invariant name — the transaction would violate an invariant; nothing applied.
- `429` + `dimension`/`projectedUsage` — a plan limit or spend cap would be exceeded.
- `DISPROVED` + counterexample — the prover found a breaking assignment; strengthen policy and re-verify.

**Two billing buckets (user-visible):**
1. **AI / external-services bucket** — funds `ctx.ai.run` and managed third-party API proxy calls (`ctx.services`).
2. **Bounded infra bucket** — metered platform usage at public Bounded rates.

Free accounts get **$0.50/month AI trial credit** and **cannot top up**; Pro+ can top
up eligible buckets. Both the bucket and any app-level cap must have room before
cost-bearing work runs. **Managed third-party services are billed at provider cost
+ 5% (itemized)**; users can opt out by integrating providers with their own keys.
**Bounded Pay charges a 1% platform fee on top of Stripe's own fees.**

**Setup (canonical):**
```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init                 # writes policy.json + public bounded.json
bounded deploy --create --name my-app
bounded verify
bounded dashboard
```
No signup: the first auth-needing command mints an **ed25519 identity** at
`~/.bounded/credentials`; that key owns apps created with it. Link with
`bounded link --email you@example.com`. Never commit private keys.

---

## 3. What Bounded explicitly does NOT claim (honesty boundaries)

(The product docs + site are deliberately honest about scope — important for
positioning and for not over-promising to the new AI. Detailed in the site + skill
sections; summarized here as a flag.) Anti-cheat/invariants prove *state
transitions* obey declared bounds; they do **not** prove application-level intent,
off-chain truth, or things outside the policy's modeled state. Denied reads are
silent (empty `200`). Onchain reads are not confirmation. These boundaries recur in
`ScopeLimits` on the site and `hooks-and-anti-cheat.md` / `capabilities-and-limits.md`
in the skill.

---

<!-- The sections below are contributed by per-area deep dives:
  10 tarobase-core-engine · 11 tarobase-sdk-cdk-token · 12 tarobase-audit-meta
  20 bind-packages · 21 bind-apps
  30 bounded-cli · 31 bounded-pay
  40 bounded-site · 50 capability-catalog
Then a synthesis: maturity matrix + business/prompt-prep appendix. -->
---

## Document Map

Read in this order for a first pass: **§0 → §9 (Synthesis) → §5 (Capability Catalog)**.
Pair any task with **§9**, the maturity reality-check.

| # | Section | What it covers |
|---|---|---|
| §0 | Overview & Ecosystem | What Bounded & Bind are; the 6 repos; core mental model; honesty boundaries |
| §1 | Bounded Client SDK core (`tarobase-core` / `-server`) | `@bounded-sh/client`+`server` wire contract, transports, auth, Solana signing |
| §2 | Bounded SDK, CDK & Token Plugin | JS SDK API; the **real engine** in `packages/cdk` (Cloudflare Workers + Z3 + Kani); EVM token plugin |
| §3 | Bounded Monorepo: Audit, Ops & Maturity | `bounded-audit/`, security audit, auth redesign, release ops, honest findings |
| §4 | Bind: Core Packages | Orchestration engine: state machine, gates, budget ledger, resumable workflow, adapters |
| §5 | Bind: Apps, Examples, Agents & Docs | `/v1` API, worker parity, Studio, testbed, 13 agent contracts, go-live audit |
| §6 | Bounded CLI (Go) | Full command tree, dashboard daemon, live-edit, verify/deploy, release runbook |
| §7 | Bounded Pay | Provable payments ledger (deployed prod), Stripe Connect, bps splits, caps |
| §8 | Bounded Site (bounded.sh) | Live homepage copy, positioning, pricing, legal pages, stale-README warning |
| §5C | Bounded Capability Catalog | The richest section: every feature/limit from the public docs, with syntax |
| §9 | Cross-Repo Synthesis & Maturity | Real-vs-aspirational matrix, open gaps, strategic read — **the reality check** |
| §A | Prompt-Prep Appendix | How to seed the new model, guardrails, master-prompt skeletons, fast facts |

**Maturity legend:** [SOLID] production-shaped · [PARTIAL] half-built · [STUB/MOCK]
placeholder · [TODO] called-out gap.

---
# Bounded Core Engine (tarobase-core + tarobase-server)

> **SCOPE CORRECTION — READ FIRST.** These two packages are **NOT** the Bounded backend engine. They are the **client-facing SDK contract** published as `@bounded-sh/core` (shared browser+server core, v0.0.26) and `@bounded-sh/server` (Node/keypair SDK, v0.0.26). The *actual* engine described in the brief — `policy.json` parsing/compilation, the Z3/SMT proof engine, invariant verification (`rollingSum`/`conserve`/`bound`/`tenantTag`/`tenantEdge`), the atomic data plane, and the realtime tick loop — lives in a **separate, remote Cloudflare-native service** (the "realtime worker", `functions.bounded.sh` dispatcher, `wallet-auth.bounded.sh`/`auth.bounded.sh` issuers). These SDK packages only hold the **wire contract, transports, auth/session plumbing, and Solana transaction assembly** that *talk to* that engine. Grep for `z3|invariant|rollingSum|conserve|tenantTag|getAfter|policy.json compile` returns **zero engine code here** — only doc comments and one error-code string (`invariant_violation`). Where the engine is referenced, comments point to `realtime-worker/src/effects-core.ts` and `BOUNDED-LIVE-EFFECTS-SPEC.md` (not in these packages). This section documents what these packages *do* provide and infers the engine's contract from the client side.

## 1. Directory / Module Map

### `packages/tarobase-core` (`@bounded-sh/core`) — [SOLID]
| Path | Purpose |
|---|---|
| `src/index.ts` | Public export barrel: data ops, subscribe, functions, live, live-effects, field-values, time, session managers, Solana program IDLs. |
| `src/types.ts` | `AuthProvider`, `User` (`id`/`address`/`email`/`isAnonymous`), `EVMTransaction`, `SolTransaction`, `TransactionResult`, `SubscriptionOptions`, `Offchain{Instruction,Transaction}`. |
| `src/time.ts` | Unit-safety helpers: `now()` (Unix **seconds**), `toSeconds()`, `toMillis()`. Documents the seconds(policy)-vs-ms(JS) footgun. |
| `src/client/operations.ts` | **The data plane client** (1778 lines): `get/getMany/set/setMany/setFile/getFiles/search/count/aggregate/queryAggregate/runQuery/runExpression`, principal-scoped read cache, Borsh validation of server-supplied Solana txns. |
| `src/client/config.ts` | `ClientConfig`, `init()`, network presets (`bounded`/`bounded-staging`/`bounded-production`), `isBoundedNetwork()`, `getWebhookKeysUrl()`. |
| `src/client/subscription.ts` | Stable public `subscribe()` facade → delegates to v2. |
| `src/client/subscription-v2.ts` | Multiplexed WebSocket v2 protocol: subscribe/intent frames, ack correlation, reconnect, token refresh, `wsIntent`/`wsIntentReliable`. |
| `src/client/realtime-store.ts` | **[PARTIAL/legacy]** pre-v2 in-memory store w/ IndexedDB, optimistic writes, storage **tiers** (durable/checkpointed/ephemeral). Being phased out. |
| `src/client/functions.ts` | `functions.invoke(name,args)` → POST `functions.bounded.sh/invoke`; auto-attaches session token. |
| `src/client/live.ts` | `live.intent/status/subscribeView` — server-authoritative rooms client. |
| `src/client/live-effects.ts` | **Author-facing** live-module effect types (`ai`/`function`/`agent`/`http`/`onchain`/`data`/`schedule`), `withEffects`, `defineLiveModule`. |
| `src/client/field-values.ts` | `increment()`, `serverTimestamp()` server-resolved field operations. |
| `src/utils/api.ts` | Axios HTTP transport `makeApiRequest()`, 401-refresh, structured error envelope. |
| `src/utils/auth-api.ts` | SIWS session mint/refresh/revoke against the wallet issuer; issuer allowlisting. |
| `src/utils/utils.ts` | `getIdToken`, `createAuthHeader`, `deriveUserIdentityFromIdToken` (JWT claim → `{id,address,email}`). |
| `src/utils/*session-manager.ts` | `session-manager` (selector), `web-` (localStorage), `rn-` (React Native adapter), `server-` (per-keypair). |
| `src/utils/sol/` | Solana program IDLs (`poof…Mainnet/Devnet`, `taro6…Devnet`) + `sol-utils.ts` (compute estimation, tx build helpers). |

### `packages/tarobase-server` (`@bounded-sh/server`) — [SOLID]
| Path | Purpose |
|---|---|
| `src/index.ts` | Re-exports core; exposes `createWalletClient`, `WalletClient`, webhook verification. |
| `src/global.ts` | `init()` → core init with `isServer:true, skipBackendInit:true, authProvider:null`. |
| `src/wallet-client.ts` | **`WalletClient`** — per-keypair, self-contained identity for all data/subscribe/invoke/live ops. |
| `src/explicit-client-only.ts` | Top-level CRUD/auth exports that **fail closed** (no ambient server signer). |
| `src/auth/index.ts` | `getAuthProvider()` — always throws ("not process-global"). |
| `src/auth/providers/solana-keypair-provider.ts` | Ed25519 message signing (tweetnacl), Solana tx build/submit/confirm, presigned-tx validation, priority fees, 5× retry. |
| `src/auth/providers/offchain-auth-provider.ts` | Wraps a provider; **blocks** real Solana txns for `chain==='offchain'` (poofnet). |
| `src/webhooks.ts` | `verifyWebhook()` — Ed25519 signature verify, skew check, replay store. |
| `src/utils.ts` | Server `getIdToken`. |

## 2. Policy Engine (as seen from the SDK contract)

**The policy compiler/validator is not in these packages.** The SDK's contract with it:

- **Expression language surface** appears only in doc comments and `runExpression`. `runExpression(expr, args, {returnType})` and `runQuery(path, queryName, args)` POST to `/queries`; the server evaluates the policy expression and returns `{result, trace?}` (the **trace** — `{variable, resolvedValue, operation, result}[]` — is returned only on non-mainnet networks, a debugging affordance). Referenced tokens (`@user.id/.address/.email`, `@time.now`, `@data`, `@newData`, `get()`, `getAfter()`) are documented in `types.ts`/`time.ts`/`live.ts` but **compiled and evaluated remotely**.
- `@user.id` = `custom:userId` claim (universal identity); `@user.address` = `custom:walletAddress` (real wallet, else null); `@user.email` = lowercased `email` claim. Derived client-side by `deriveUserIdentityFromIdToken` to *mirror* the worker's `auth.ts` — this file is the canonical statement of the principal model.
- **Time unit** is load-bearing: policy/`@time.now`/`rollingSum windowSeconds`/`scheduledAt` are **Unix seconds**; `_createdAt`/`_updatedAt` and `Date.now()` are **ms**. `serverTimestamp()` stamps seconds server-side (forgery-proof) → intended for TTL/rate-window/anti-cheat rules.
- **Anonymous auth** is a `policy.json` toggle (`"auth": { "anonymous": true }`) — surfaced only via the issuer error string in `auth-api.ts`.
- `search: { fields:[…] }` and read rules are declared in policy; the SDK's `search()`/`queryAggregate()` respect them server-side ("results the caller cannot read are omitted").

## 3. Proof / Verify System (Z3 / invariants)

**Entirely absent from these packages — [not present in scope].** No SMT translation, no counterexample generation, no `conserve`/`bound`/`tenantEdge` code. The *only* trace of the proof system is the **runtime rejection contract**: a write that violates a proven invariant returns HTTP **409** with a structured envelope `{ code: "invariant_violation", status, requestId, message }`. The SDK surfaces this so app code can branch on it — see §4. The `requestId` "correlates with the decision log" (comment in `api.ts`), implying the engine emits a per-decision audit log. Inferred (not verifiable here) engine flow:

```
deploy(policy.json):
  parse collections+fields+rules+invariants
  for each invariant I:
     phi := translate(I, rules)      # -> SMT formula (Z3)
     if UNSAT(not phi): mark PROVED
     else: model := get_model(); report DISPROVED with counterexample
runtime write W:
  if any invariant would break under W: reject 409 invariant_violation
  else if rule denies: reject 403 policy_denied
  else commit atomically + fire webhooks/subscriptions
```

The SDK does **not** know invariant kinds; it only distinguishes `policy_denied` (403) vs `invariant_violation` (409) by `code`.

## 4. Data Plane / Runtime (client contract)

`set(path, doc)` is sugar for one-element `setMany`. Writes go `PUT /items` with `{documents:[{destinationPath, document}]}`. Fields starting with `_` are stripped (reserved/system). **Delete** = `set(path, null)` (routed through the `delete` rule). Path parity rule everywhere: even segments = document, odd = collection.

**Response status semantics:**
| Status | Meaning |
|---|---|
| `200` (`true` / `{success:true,…}`) | Committed offchain, atomically. |
| `202` | Needs a client-signed transaction; body carries `transactions[]` (Solana) or `offchainTransaction`. |
| `402` `INSUFFICIENT_BALANCE` | Wallet lacks SOL → thrown as typed `InsufficientBalanceError` (address, deficitLamports/Sol). |
| `403` `policy_denied` | Rule denied. |
| `404` | `→ {data:null}` (not thrown) for reads. |
| `409` `invariant_violation` | A proven invariant would break. |

**Atomicity / batching:** `setMany` sends all docs in one `PUT /items` → one atomic multi-doc write ("The Durable Object serializes writes per room"). `getMany` batches ≤30 doc paths via `POST /items/batch`, with **per-path** error classification (`NOT_FOUND`/`UNAUTHORIZED`/`INVALID_PATH`/`REQUEST_FAILED`). **Field operations** `increment()`/`serverTimestamp()` are resolved atomically server-side (verified race-free: "20 concurrent +1 → exactly 20").

**Storage tiers** (`realtime-store.ts`, legacy): `durable` / `checkpointed` / `ephemeral`. Ephemeral deltas overwrite; durable/checkpointed accumulate. `live` view docs are ephemeral.

**Server-supplied transaction hardening** (`operations.ts`, keypair-provider): before signing any server-built/co-signed Solana tx, the SDK **Borsh-parses** the `set_documents` instruction and asserts: exactly one Bounded instruction; only allowlisted programs (Bounded mainnet/devnet + ComputeBudget + System, but raw System *instructions* rejected); `appId` matches config; **the on-chain write path-set exactly equals the requested write paths** (`assertSamePathSet`). This prevents a malicious server from getting the user to sign writes to paths they didn't request.

## 5. Auth Runtime, Roles, Service Keys

- **Principals:** identity model `{id (custom:userId), address (custom:walletAddress), email}` from a verified idToken; wallet logins have `id===address`. Guest (`isAnonymous`) = durable device-keypair identity (`signInAnonymously`), upgradeable while preserving `id`.
- **Login methods** (`config.authMethod`): `email` (Bounded Better Auth OTP), `guest`, `phantom`, `mobile-wallet-adapter`, `privy`/`privy-expo`, plus stubs (`wallet` is an **[STUB] "unimplemented; don't use"**). Two issuers: `authApiUrl` (wallet/SIWS + guest) and `humanAuthApiUrl` (email/social). `createSessionWithSignature` forwards a wallet authMethod verbatim (guest → `is_anonymous` claim); non-wallet methods rejected by issuer.
- **`__owners__` / `__admins__` / `actAs` / `runAs`:** **not present** in these packages — ownership/roles live in `policy.json` + the worker. `onBehalfOf` (in live-effects) is the closest analog: run an effect *as* a player whose intent you processed this tick (no privilege escalation).
- **Service keys:** the server SDK identity **is** a Solana keypair. `createWalletClient({keypair})` builds a self-contained `WalletClient`; each holds its own `ServerSessionManager` (per-keypair, **not** process-global). `getAuthProvider()`/top-level ops fail closed. Session tokens auto re-signed when JWT is within 60s of expiry.
- **Session hygiene:** JWT↔wallet binding check before store; app-id guard (reject cross-app sessions); refresh dedupe; refresh token only POSTed to allowlisted issuer origins (XSS-tamper defense); `_clearAuth` per-wallet 401 retry that never touches global state. Read caches are **principal-scoped** (`<appId>:<hash(principal)>|path`) — security fix "H1" preventing one user's private read leaking to another in SSR/shared-process/login-switch; no-auth reads are uncacheable.

## 6. Functions Runtime

Client side only: `functions.invoke(name, args, {timeoutMs, headers})` POSTs `{appId, functionName, args}` to `functions.bounded.sh/invoke` with the caller's session token auto-attached; throws `FunctionInvokeError` on 401/403(auth-rule deny)/404/503. `WalletClient.invoke` runs as the wallet's identity. **The function runtime itself** (`ctx.user`, `ctx.bounded`, `ctx.ai`, `ctx.services`, `ctx.env`, `ctx.secrets`, hooks, scheduled functions) is **remote and not in these packages** — the SDK is purely the dispatcher client. Doc comments confirm the dispatcher "evaluates the function's `auth` policy rule."

**Webhooks (server, [SOLID]):** `verifyWebhook(rawBody, headers, opts)` — fetches hosted Ed25519 keys (`/.well-known/bounded-webhook-keys.json`, in-memory TTL cache, key-rotation refresh), verifies `X-Bounded-Signature` over raw bytes via WebCrypto, enforces `X-Bounded-Timestamp` == signed `payload.timestamp` within skew (default 300s), rejects replays (`keyId:signature` key, pluggable `WebhookReplayStore`, default in-memory), optional `expectedAppId`. Payload: `{id, appId, path, operation: create|update|delete, document, previousDocument, timestamp}`.

## 7. Live / Realtime Runtime

Client surface for **server-authoritative rooms** (worker ticks ~30 Hz in a per-room Durable Object facet):
- `live.intent(roomPath, intent, {fireAndForget})` — rides the open per-room WS socket (`wsIntent` fire-and-forget for high-freq input; `wsIntentReliable` awaits an ack so join/ready/leave surface denials), HTTP `/live/intent` fallback before the socket exists. Caller address taken server-side from the token — never sent in body. Room derived from path; clients never set `X-Room-Id`.
- `live.status(roomPath)` → `{available, started, running, tick, module, etag, generation, connections, stopReason (idle|lifetime|error|manual|evicted), lastErr, …}`.
- `live.subscribeView(roomPath, {userId?, onData})` → subscribes to `<roomPath>/view/<userId>` (keyed by `@user.id`; policy `read: $userId == @user.id`), routed to the per-room DO.

**Live-effects author model (`live-effects.ts`, [SOLID types, runtime remote]):** the `tick(state, intents, dt)` reducer stays **pure/synchronous** — it cannot call out. Instead it **emits `Effect[]`** (via `withEffects`); the platform runs them off the deterministic loop and re-injects each result as an `EffectResult` on the reserved `@effect` intent address on a later tick, so **replay is bit-identical** (recorded results, never re-executed/re-charged). Effect kinds: `ai` (LLM/**AI NPCs**), `function`, `agent` (**Flue agents**), `http` (secret injected host-side by name), `onchain` (set/delete w/ optional player `cosign`), `data`, `schedule`. Charged kinds (`ai`/`function`/`agent`/`onchain`) require a stable `id` for idempotency. `onBehalfOf` runs as a player from the same tick. Source of truth stated as `realtime-worker/src/effects-core.ts` (out of scope).

## 8. Onchain / Solana, Files/Search, AI NPCs, Flue Agents

- **Solana [SOLID]:** deep. Two Bounded programs (mainnet `poof4b5pk…`, devnet `taro6Cv…`), full Anchor IDLs bundled, `set_documents` v1/v2 discriminators, LUT support, priority-fee estimation (Helius `getPriorityFeeEstimate` ×1.2), `signAndSubmitTransaction`, presigned-blockhash freshness checks, 5× exponential-backoff retry, `offchain`/poofnet mode that blocks real txns. `SolTransaction` supports server-prebuilt sponsored/co-signed base64 txns.
- **Files [SOLID]:** `setFile(path, file, {metadata})` → presigned-S3-URL flow via `POST /storage/url` (server enforces size limit + validates metadata against the storage collection's `fields`/CREATE rule); `getFiles(path)`; `set(path, null)` deletes.
- **Search/Aggregate [SOLID]:** `search(path, query, {fields})` full-text over declared search fields; `queryAggregate(spec)` (deterministic groupBy/count/sum/avg/min/max — preferred on Bounded); `count`/`aggregate` route to `queryAggregate` on Bounded (legacy AI-prompt path only off-Bounded). Field names validated against `^[a-zA-Z0-9_.]+$` (prompt-injection guard).
- **AI NPCs / Flue agents:** only as **effect kinds** (`ai`, `agent`) in `live-effects.ts`. No agent runtime code here.

## 9. Tests (what's real)

Node `--test` style (`.test.ts` run via `run-*.mjs` harnesses with import-map stubs). **tarobase-core** `test` runs: config-network, read-principal (JWT→principal cache keying), row-shape (bare `id` + single-doc envelope), transport (CRUD uses HTTP not WS), public-export-surface, live-auth, live-view-principal (view scoping), subscription-auth-error (anon sockets, expired-token no-socket, identity switch), onchain-validation (Borsh parse + path-set + program allowlist + network gating), websocket-auth-url. Plus `auth-api-revoke.test.ts`. **tarobase-server** `test` runs: `solana-keypair-provider.blockhash` (presigned freshness/parse/allowlist) and `server-global-provider` (fail-closed enforcement). `webhooks.test.mjs` exists (delivery/verify) but is not wired into the `test` script. **Coverage skews to security-critical paths**: principal cache isolation, onchain tx validation, auth failure modes, export surface. No engine/proof tests (engine is remote).

**Config/deps of note:** TypeScript 5.9, Rollup build (`tsc → rollup → d.ts`), ESM+CJS dual output. Deps: `@solana/web3.js` 1.98, `@coral-xyz/anchor` 0.31, `@solana/spl-token`, `tweetnacl`, `bs58`, `reconnecting-websocket`, `rpc-websockets`, `axios`+`axios-retry`, `lodash`. `@bounded-sh/server` depends on `@bounded-sh/core`. Author "Poof.new", MIT, published `@bounded-sh/*`.

## 10. Maturity Assessment

- **[SOLID]** Data-plane client (`operations.ts`), config/networks, auth-api + session managers (web/rn/server), webhook verification, Solana keypair provider + tx hardening, functions/live/live-effects *client contracts*, field-values, time helpers. Heavily commented with named security fixes ("H1", "audit SDK LOW-7", "audit-8") — signals real audits.
- **[PARTIAL]** `realtime-store.ts` (legacy pre-v2 store, explicitly being superseded by `subscription-v2`); `count`/`aggregate` carry a legacy AI-prompt branch only used off-Bounded.
- **[STUB/MOCK]** `authMethod: 'wallet'` ("unimplemented stub; don't use"); `SolanaKeypairProvider.login/logout/restoreSession` throw "Not implemented" (unused — server uses signature sessions). `getAuthProvider()` intentionally throws.
- **[TODO]** `sol-utils.ts` heap-frame estimation TODO; `operations.ts` optimistic-update/return-shape TODOs after onchain confirm; audit-8 DeFi-aware System-transfer block deferred (whole-program allowlist on preInstructions was reverted for breaking Jupiter/Phoenix flows).
- **[OUT OF SCOPE / NOT PRESENT]** The entire proof engine (Z3/SMT, invariant translation, DISPROVED counterexamples, proof coverage), `policy.json` compiler/validator, the runtime data plane that *enforces* invariants, the functions/live execution runtime, `__owners__`/`__admins__`/`actAs`/`runAs` role machinery. All remote (realtime worker / issuers / dispatcher). These packages are the **contract and transport**, production-grade, but they are the SDK — not the engine.
# Bounded SDK, CDK & Token Plugin

Catalog of three packages in the TaroBase monorepo: the client **JS SDK**
(`@bounded-sh/client` / published as `@tarobase/js-sdk`), the **infra** package
(`packages/cdk` — misnamed; it is really Cloudflare Workers + AWS Lambda layers +
Fly.io, not AWS CDK), and the **EVM token plugin** (`@tarobase/token-plugin` —
Solidity/ERC-20, *not* Solana despite the "Solana plugin" framing).

Bounded is a *provable realtime backend*: a policy-governed data layer with
Mongo-style deterministic queries, cursor pagination, aggregation, full-text
search, relationship joins, and live subscriptions, backed by a Cloudflare
Durable Object with formally-verified (Z3 / Kani) rule and invariant evidence.

---

## 1. Package / Module Map

### 1.1 `packages/js-sdk` (`@bounded-sh/client` v0.0.32)
```
src/
  index.ts                 web entry (re-exports @bounded-sh/core + auth + hooks)
  index.native.ts          React-Native entry ("react-native" export condition)
  global.ts                init(), currentUser state, onAuthStateChanged/Loading
  platform.ts              PlatformAdapter/StorageAdapter (web ↔ RN abstraction)
  utils.ts                 getIdToken() wrapper
  global.ts / *.d.ts       ambient stubs for optional peers (privy, expo, bs58, solana-mobile)
  hooks/useQuery.ts        reactive realtime query hook (Convex-style)
  auth/
    index.ts               getAuthProvider(), signInAnonymously, OTP shims, login/logout
    oidc-auth.ts           OAuth2/OIDC Authorization-Code + PKCE (redirect & popup)
    solana-rpc.ts          RPC URL normalization + network constants
    hooks/useAuth.ts       React auth hook { user, loading, login, logout }
    providers/
      email-auth-provider.ts       inline email/text OTP (Better-Auth issuer)
      guest-auth-provider.ts       anonymous device-local ed25519 identity
      guest-keystore.ts            keypair persistence
      offchain-auth-provider.ts    wraps a provider for "offchain/poofnet" chain
      phantom-wallet-provider.ts   Phantom (web) — behind optional-provider error
      privy-wallet-provider.ts     Privy web (optional)
      privy-expo-provider.ts       Privy React-Native (hook-bridged)
      solana-mobile-wallet-provider.ts   Mobile Wallet Adapter (~1600 lines)
      transaction-utils.ts, sol/sol-utils.ts   tx (de)serialization
```
The **actual CRUD/query/subscribe implementation lives in `@bounded-sh/core`**
(v0.0.26, a dependency) and is re-exported wholesale (`export * from
"@bounded-sh/core"`). The js-sdk package itself is the *auth + platform +
React-hooks + provider* layer.

### 1.2 `packages/cdk` (private, v0.1.0 — NOT AWS CDK)
No `cdk.json`, no `aws-cdk-lib`. The name is legacy. Actual contents:
```
cloudflare/           13 Cloudflare Workers (each with wrangler.toml/.jsonc)
  realtime-worker/      the realtime backend — RealtimeDB Durable Object (SQLite)
  functions-dispatcher/ Workers-for-Platforms dispatch namespace router
  bounded-host/         tenant app host (verifies Bounded JWT)
  bounded-router/       edge router (verifies Bounded JWT)
  bounded-auth/         auth worker (rate-limited, fail-closed)
  bounded-betterauth/   Better-Auth issuer (D1-backed, migrations/)
  bounded-dev-api/      developer/control-plane API
  bounded-admin/        admin worker
  heartbeat-dispatcher/ liveness/heartbeat fan-out
  spike-agent-facet/    agent-facet DO (generated runtime)
  bounded-mail-forwarder/, bounded-page-redirect/, bounded-auth-tester/,
  bounded-remote-edit-sandbox/, bounded-setup/
layers/               AWS Lambda layers (yarn workspaces)
  schema/  data-layer/  mongodb/  sol-helper/(anchor)  ai-utils/
  third-party-utils/  auth-utils/  utils/
db-ops/               Mongo migrations + executors + CLI (ts-node db-ops/src/cli.ts)
express-servers/      Fly.io session-management / developer-api express apps
evidence/             formal-verification gate scripts (Kani / policy invariants)
```
Multi-cloud: **Cloudflare** (edge/realtime), **AWS Lambda** (layers), **Fly.io**
(long-lived express servers), **MongoDB** (app data + ws-connections),
**R2** (files), **KV/D1** (Cloudflare storage).

### 1.3 `packages/tarobase-token-plugin` (`@tarobase/token-plugin` v0.0.18)
```
manifest.js              plugin manifest (onchain fn map, chains, deployed addrs)
src/serverIndex.js       runTransformation() — rewrites tx bundles (approvals)
src/browserIndex.js      createBrowserClient() — read-only calls + approveTokenTx
src/utils.js             executeHoistedFunction()
contracts/
  TokenPlugin.sol        main: transfer / transferWholeTokens / createToken / views
  TokenFactory.sol       deploys new Token instances
  Token.sol              ERC-20 (OpenZeppelin)
  SharedDefinitions.sol  Config / FieldSet / PluginState structs
scripts/deploy.js        Hardhat deploy
test/{server,contracts}.test.js   mocha + hardhat tests
dist/{esm,cjs}/          built bundles
```
Toolchain: **Hardhat + OpenZeppelin + ethers** → this is **EVM/Solidity**, chains
`base_testnet`, `monad_testnet`, `localhost`/`LOCAL`.

---

## 2. JS SDK — Public API Surface  `[SOLID]`

### 2.1 Init & config
```ts
import { init, getConfig } from '@bounded-sh/client';
await init({ appId: 'APP_ID' });                         // hosted email login is default
await init({ appId, network: 'bounded-staging' });       // network preset
await init({ appId, chain: 'solana_mainnet', rpcUrl });  // onchain needs explicit rpcUrl
```
`init(Partial<ClientConfig>)` selects an `AuthProvider`, initializes core,
restores any persisted session, and drives `authLoading`. Onchain writes require
an explicit `rpcUrl` (no bundled default). Chains: `offchain`, `solana_devnet`,
`solana_mainnet`, `surfnet`. RPC constants exported:
`SOLANA_DEVNET_RPC_URL`, `SOLANA_MAINNET_RPC_URL`, `SURFNET_RPC_URL`
(`https://surfpool.fly.dev`).

### 2.2 Auth flows

| Flow | Functions | Notes |
|---|---|---|
| **Hosted OIDC (redirect)** `[SOLID]` | `loginWithRedirect({redirectUri?, methods?, provider?, prompt?})`, `completeLoginFromRedirect()` | OAuth2 Auth-Code + **PKCE (S256)** + state/CSRF; web = full-page redirect, RN = expo-web-browser inline. `custom:appId` bound to OIDC client. |
| **Hosted OIDC (popup)** `[SOLID]` | `loginWithPopup({width?,height?})`, `completeLoginInPopup(origin)` | Web only; postMessage back to opener. |
| **Account upgrade** `[SOLID]` | `linkWithRedirect(...)`, `linkEmail(email, code)` | Firebase `linkWithCredential` parity — carries guest id-token as single-use hint; preserves `@user.id` if new. |
| **Inline email/text OTP** `[SOLID]` | `sendEmailOtp(email)`, `verifyEmailOtp(email, code)`, `sendTextOtp(phone)`, `verifyTextOtp(phone, code)` | Better-Auth issuer; works web + RN. Note: retired on RN hosted path (throws migration error there). |
| **Guest / anonymous** `[SOLID]` | `signInAnonymously()`, `GuestAuthProvider.forgetGuest()` | Device-local ed25519 keypair signs SIWS challenge; pubkey = `@user.address`; `isAnonymous:true`; **offchain only** (tx signing throws). |
| **Wallet — Phantom / Privy / MWA** `[PARTIAL]` | `loginWithPrivy()`, provider classes | Web Phantom/Privy resolve an `optionalProviderError` in the default entry (must opt into a dedicated entry). RN Privy works via bridged `PrivyExpoProvider`. `wallet`/`rainbowkit`/`onboard` = `console.warn("not yet supported")` `[STUB]`. |

State/session:
```ts
getCurrentUser(): User | null
onAuthStateChanged(cb): () => void        // fires immediately with current
onAuthLoadingChanged(cb): () => void; getAuthLoading(): boolean
login(opts?): Promise<User|null>; logout(): Promise<void>   // logout revokes refresh-token family server-side
useAuth(): { user, loading, login, logout }                 // React; SSR-guarded
getIdToken(): Promise<string|null>
```
`User = { id, address, email, isAnonymous?, provider }`. `user.id` is the
universal identity (`@user.id` in policies); wallet logins → `id === address`;
email/social → `email` set, `address` null. Identity is derived from the id-token
in `withUserIdentity()`.

### 2.3 CRUD semantics `[SOLID]` (re-exported from core)
Paths: **odd segments = collection, even = document**.
```ts
get(path)                              // even → the document
get(path, opts)                        // odd  → { data:[...], nextCursor, status }
getMany(paths[])                       // ≤30 DOCUMENT paths; [{path,data,error?}], ordered
                                       //   error.code ∈ NOT_FOUND|UNAUTHORIZED|INVALID_PATH
set('users/123', {…})                  // set specific doc
set('posts', {…})                      // odd path → server-assigned random id
set('posts/789', null)                 // delete (no standalone delete export)
setMany([{path, document}, …])         // ATOMIC multi-write (null document = delete)
docId()                                // generate an id
```
`setMany` is atomic (pair with policy `getAfter` for cross-collection
invariants, e.g. unique-username claims). Fields prefixed `tarobase_` are
stripped (reserved).

### 2.4 Query surface `[SOLID]`
```ts
get(path, { filter, sort, limit, cursor, includeSubPaths, shape });
```
- **filter** — Mongo-style, server-evaluated, nests ≤ **8 levels**. Bare value =
  equality (or *array-contains* on array fields).
- **sort** — `{ field: 1|-1 }`, multi-key by object order, dot-paths.
- **limit** — default **100**, max **1000**.
- **cursor** — opaque **keyset** cursor (`nextCursor` / `X-Next-Cursor`); **no
  numeric offset**.
- **includeSubPaths** — also read nested subcollections (each read-gated).
- **shape** — relationship joins (policy `links`).

Filter operators: `$gt $gte $lt $lte $ne $in $nin $all $size $elemMatch $exists
$type $regex(+$options) $not $and $or $nor`. Read rules always intersect every
filter. Schema'd collections must declare any field used in
filter/sort/search/groupBy (else 400 `cannot query undeclared field`).

**Count / aggregate:**
```ts
count(path, { filter })                         // → { value }  (needs read:"true")
aggregate(path, op, { field, filter })          // op ∈ count|uniqueCount|sum|avg|min|max → { value }
queryAggregate(path, { groupBy:[], count:bool, sum:[], avg:[], min:[], max:[] }, { filter })
   // → AggregateRow[]: { group?, count?, sum?, avg?, min?, max? } (one row per group)
```
**Search (full-text):**
```ts
search(path, query, { fields?, limit?, cursor? })   // needs policy search:{ fields:[...] }
```
**Joins:** policy `links: [{ from:"projects.ownerId", to:"users", reverse:"ownedProjects" }]`.
Forward `get('projects', { shape:{ owner:{} } })` (drops trailing `Id`); reverse
`get('users', { shape:{ ownedProjects:{} } })`. Many-to-many via `relationships`
+ `through` join tables; each related doc independently read-gated.

**Escape hatches** (re-exported): `runQuery`, `runQueryMany`, `runExpression`,
`runExpressionMany`.

### 2.5 Live / subscribe `[SOLID]`
```ts
const unsub = await subscribe(path, {
  filter, sort, limit, cursor, includeSubPaths, shape,
  onData: (v) => …,     // full server-sorted+limited snapshot on EVERY change
  onError: (e) => …,
});
await unsub();
// bare-callback shorthand: subscribe('posts', d => …)
```
`useQuery<T>(path, options)` — React reactive wrapper returning
`{ data, loading, error }`; auto-subscribes, `path=null` skips, SSR-guarded.
Auth changes trigger `reconnectWithNewAuth()` on live sockets.

### 2.6 Files, signing, browser-vs-server `[SOLID]`
```ts
setFile(path, file, opts?)     // upload to R2-backed storage collections
getFiles(path)                 // list stored files
signMessage(msg); signTransaction(tx); signAndSubmitTransaction(tx)  // wallet ops
deserializeTransaction(...)    // Solana tx helper
```
- **Browser client** (`@bounded-sh/client` / `bounded-sh`): wallet + hosted auth,
  needs `window`. Guards throw actionable errors if a browser wallet method runs
  in Node.
- **Server client** (`bounded-sh/server`, in core): signs with an explicit
  keypair via **`createWalletClient({ keypair })`** — service/machine identities,
  no browser, no popup. (Implementation lives in `@bounded-sh/core`; the js-sdk
  guards reference it in every browser-in-Node error.)
- **React Native**: `index.native.ts` entry; configure `setPlatform({ storage,
  atob, btoa, hasDOM:false })` + `ReactNativeSessionManager.configure(...)`
  before `init()`. Optional peers: expo-web-browser, expo-crypto, MMKV.

### 2.7 Build/publish
Rollup (CJS `index.js` + ESM `index.mjs` + `index.native.*` + `.d.ts`);
`exports` map with `react-native` condition. Deps of note:
`@bounded-sh/core@0.0.26`, `@coral-xyz/anchor@0.31.1`, `@solana/web3.js@1.98.4`,
`bs58`, `rpc-websockets`. Large optional peer set (Privy, Phantom, Solana-mobile,
Solana Kit, Expo) all `optional:true`. **Tests**: 8 `*.source.test.mjs` in
`src/auth/**` (guest keystore, oidc-auth, logout-revoke, provider-singleton,
solana-rpc + fallback, privy, mock-auth). `[SOLID]`, published (`0.0.32`).

---

## 3. `packages/cdk` — Infrastructure  (Cloudflare + AWS layers + Fly.io)

**Not AWS CDK.** README still says `cdk deploy staging` (aspirational/legacy);
real deploy is `wrangler` (workers), `fly deploy` (express), yarn-workspace layer
builds, and `db-ops` for Mongo.

### 3.1 Cloudflare Workers (13)

| Worker | Role | Key bindings | Maturity |
|---|---|---|---|
| **realtime-worker** | The realtime backend. `RealtimeDB` **Durable Object** (SQLite-backed, `new_sqlite_classes`), WebSocket fan-out, rule evaluation, cron/alarm-driven scheduled hooks, read-backs, onchain settle, `ctx.ai` via CF AI Gateway. ~7000-line DO. | DO `REALTIME_DB=RealtimeDB`, KV `REALTIME_APPS`, R2 `FILE_STORAGE` (`bounded-files-*`), AI binding, per-env routes (`realtime-staging.bounded.sh`) | `[SOLID]` |
| **functions-dispatcher** | Workers-for-Platforms dispatch-namespace router (routes tenant code). | dispatch namespace | `[SOLID]` (security-tested) |
| **bounded-host** | Tenant app host; verifies Bounded JWT (JWKS/RS256). `flue-runtime` generated loader. | DO refs, JWT verify | `[SOLID]` |
| **bounded-router** | Edge router; `verify-bounded-jwt`. | JWT verify | `[SOLID]` |
| **bounded-auth** | Auth worker; rate-limited, fail-closed. | KV/rate-limit | `[SOLID]` (rate-limit + fail-closed tests) |
| **bounded-betterauth** | Better-Auth OIDC issuer (email/social OTP), `migrations/` (D1). | D1, rate-limit | `[SOLID]` |
| **bounded-dev-api** | Developer/control-plane API (prod + dev wrangler). | DO, prod config | `[PARTIAL/SOLID]` |
| **bounded-admin** | Admin surface. | — | `[PARTIAL]` |
| **heartbeat-dispatcher** | Liveness/heartbeat fan-out. | tests present | `[SOLID]` |
| **spike-agent-facet** | Agent-facet DO (generated `track-c-loaded-agent`). | DO | `[PARTIAL]` (spike) |
| **bounded-mail-forwarder** | Inbound mail forward. | Email | `[PARTIAL]` |
| **bounded-page-redirect** | Page redirects. | — | `[SOLID]` |
| **bounded-remote-edit-sandbox** | Remote-edit sandbox DO. | DO, scripts | `[PARTIAL]` |
| bounded-auth-tester / bounded-setup | test harness / setup scripts | — | `[STUB/tooling]` |

**Durable Objects found**: `RealtimeDB` (realtime-worker, the core), plus DO
classes in spike-agent-facet, bounded-dev-api, bounded-host,
bounded-remote-edit-sandbox. Compatibility date `2026-06-01`,
`nodejs_compat`.

### 3.2 AWS Lambda layers (`layers/*/nodejs`, yarn workspaces)
| Layer | Provides |
|---|---|
| **schema** | Policy schema + **Z3 proof grammar** (`generate:proof-grammar`) — formal rule verification. `[SOLID]` |
| **data-layer** | Core data access abstraction. `[SOLID]` |
| **mongodb** | Mongo driver/helpers (app data + ws-connections). `[SOLID]` |
| **sol-helper** | Solana/**Anchor** helpers (`anchor test`, on-chain settle). `[SOLID]` |
| **ai-utils** | LLM/AI helpers. `[PARTIAL]` |
| **third-party-utils** | Integrations. `[PARTIAL]` |
| **auth-utils** | JWT/auth helpers. `[SOLID]` |
| **utils** | Shared (`utils-layer`, has `src/` + scripts). `[SOLID]` |

### 3.3 db-ops, express-servers, evidence
- **db-ops** — Mongo migration engine: `migrations/` (app-users, app-collection),
  `executors/`, `mongo/`, `commands/`, `schemas/`, `templates/`, CLI
  `ts-node db-ops/src/cli.ts`; tests in `__tests__`. `[SOLID]`
- **express-servers/developer-api** — long-lived Express app deployed to **Fly.io**
  (`fly-configs/session-management.{staging,prod}.toml`). `[SOLID]`
- **evidence** — formal-verification gates run in `test:evidence`:
  `verify-policy-deploy-invariant-gates.mjs`,
  `verify-realtime-invariant-enforcement.mjs`,
  `verify-solana-kani-evidence.mjs`, `run-solana-kani-proofs.mjs` (**Kani** Rust
  model-checking proofs for the Solana path). `[SOLID]` — this is the "provable"
  in "provable realtime backend".

### 3.4 Tests / build
`yarn test` = generate Z3 proof grammar → jest → cloudflare-security suite
(dispatcher, auth rate-limit fail-closed, realtime auth-transport /
effects-forgery / deny-default rule-evaluator, JWT verification on router+host).
`test:evidence` runs the formal proofs. Notable deps: `@aws-sdk/client-s3`,
`viem`/`@wagmi/core`, `siwe`, `@solana/web3.js`, `ethereumjs-util`. Yarn 4.5.3.
**Overall CDK maturity: `[SOLID]` for realtime/auth/data core; `[PARTIAL]` for
admin/mail/agent-spike workers.**

---

## 4. Token Plugin — EVM / ERC-20  `[PARTIAL]`

**Reality check:** despite the "Solana plugin" framing, this is **EVM/Solidity**
(Hardhat, OpenZeppelin, ethers). Chains: `base_testnet`, `monad_testnet`,
`localhost`/`LOCAL`. Deployed addresses hard-coded in `manifest.js` (e.g.
base_testnet `0xd60F…7afF`, monad_testnet `0x4e97…6706`).

### 4.1 What it plugs into
A Tarobase **plugin** referenced in policy hooks as `@TokenPlugin.<fn>`. The
manifest declares `onchainFunctions.transactional` (state-changing, with
**hoisted** args extracted from the policy expression) and
`onchainFunctions.readOnly` (view calls + hoisted-value getters), plus
`variables` (USDC/NATIVE/ETH/MON per chain), `supportedChains`, and
`deployedAddresses`. The core engine loads `manifest`, `pluginName`, and
`runTransformation`/`createBrowserClient`.

### 4.2 Manifest methods
- **Transactional**: `transfer(address,address,address,uint256)`,
  `transferWholeTokens(address,address,address,uint256)`,
  `createToken(address,uint256,string,string)`,
  `createDefaultToken(string,string,address)`.
- **Read-only (view)**: `getBalance(token,acct)`, `getAllowance(token,owner,spender)`,
  `getTokenDecimals(token)`, `convertToSmallestUnits(token,units)`, plus hoisted
  getters (`transferERC20Address/Sender/Amount`, `transferWholeTokens…`).

### 4.3 Server side — `src/serverIndex.js` (`runTransformation`)
The load-bearing logic: rewrites a **transaction bundle** so ERC-20 transfers
succeed. For each `@TokenPlugin.transfer` / `.transferWholeTokens` hook it:
1. resolves hoisted token address / sender / amount via `executeHoistedFunction`;
2. skips if sender ≠ current user (and ≠ zero/`msg.sender`);
3. for **native** token (`address(0)`) → sets the `set` tx's `value` field (one
   native transfer per tx, else throws);
4. for **ERC-20** → reads on-chain `allowance(sender, tarobaseContract)`; if
   insufficient, **prepends/merges an `approve` tx** for the required amount
   (`transferWholeTokens` scales by on-chain `decimals()`).
Exports: `{ pluginName, manifest, runTransformation }`. Contains a `TODO` about
sender ≠ `msg.sender` handling. `[SOLID]` for the approval-injection path.

### 4.4 Browser side — `src/browserIndex.js` (`createBrowserClient`)
`createBrowserClient(network, providerOrSigner, authProvider, tarobaseContractAddress)`
dynamically builds an ethers `Interface` for every read-only manifest fn (so
`client.getBalance(...)` etc. work), plus:
- `client.approveTokenTx(tokenAddress)` → builds an ERC-20 `approve(spender,
  MaxUint256)` tx and calls `authProvider.runTransaction(...)`;
- `client.USDC` = per-network USDC address.
Exports `{ pluginName, manifest, createBrowserClient }`.

### 4.5 Contracts
- **TokenPlugin.sol** — `transfer` (native via `msg.value`/contract balance, or
  ERC-20 `transferFrom`/`transfer`), `transferWholeTokens` (decimals-aware),
  `convertToSmallestUnits` (internal), `getTokenDecimals`, `getBalance`,
  `getAllowance`, `createToken` (via factory, stores address in `fieldStorage`),
  `createDefaultToken` (1B supply, 18 dec). Events `TransferSuccessful`,
  `TokenCreated`. Has `admin`, `conditionContracts[]`, `pluginContracts[]`,
  `configs`, `fieldStorage`, reentrancy/delegatecall flags, `pluginStates`
  (SharedDefinitions structs) — scaffolding for the broader plugin framework.
- **TokenFactory.sol** — `createToken(owner, supply, name, symbol)` deploys a
  `Token`, emits `TokenCreated`.
- **Token.sol** — OpenZeppelin ERC-20.

**Trading / bonding curve / transferAuthority**: **not present.** There is no
buy/sell, no bonding curve, and no `transferAuthority` function in these
contracts — the plugin is transfer + factory-mint + views only. (The "trading /
transferAuthority" capabilities described for the Solana story are **not
implemented here**.) `[STUB/absent]` for those; `[SOLID]` for transfer/create.

### 4.6 Tests / build
`test/contracts.test.js` (Hardhat/chai — contract behavior) and
`test/server.test.js` (mocha — `runTransformation` approval logic). Build via
Rollup → `dist/{esm,cjs}/{browser,server}Index.js`. Deps: hardhat 2.22,
OpenZeppelin 5.1, ethers, mocha/chai. Published `@tarobase/token-plugin@0.0.18`.
**Testnet-only** (no mainnet addresses) → `[PARTIAL]` overall.

---

## 5. Maturity Summary

| Area | Flag | Note |
|---|---|---|
| JS SDK auth (hosted OIDC, email OTP, guest) | `[SOLID]` | Published, tested, PKCE-secure |
| JS SDK CRUD / query / aggregate / search / joins / subscribe | `[SOLID]` | Deterministic, read-rule-gated (impl in core) |
| JS SDK wallet (web Phantom/Privy, MWA, rainbowkit/onboard) | `[PARTIAL]`/`[STUB]` | Optional-provider errors / "not yet supported" warns |
| Realtime-worker `RealtimeDB` DO | `[SOLID]` | Core provable realtime engine |
| Cloudflare auth/router/host/dispatcher | `[SOLID]` | Security-tested, fail-closed |
| Lambda layers (schema/Z3, data, mongo, sol-helper, auth) | `[SOLID]` | Z3 + Kani formal evidence |
| Admin / mail-forwarder / agent-spike / remote-edit | `[PARTIAL]` | Peripheral/experimental |
| Token plugin transfer + factory + views | `[SOLID]` | ERC-20, testnet |
| Token plugin trading / bonding curve / transferAuthority | `[ABSENT]` | Not implemented |
| Token plugin overall | `[PARTIAL]` | Testnet-only, EVM (not Solana) |

**Production-ready:** JS SDK data/auth core, realtime-worker + Cloudflare
auth/routing, Lambda data/schema/sol layers, db-ops, Fly.io express servers.
**Experimental / partial:** browser wallet providers, admin/mail/agent-spike
workers, and the token plugin (EVM testnet, transfer-only — no
trading/authority-transfer).
# Bounded Monorepo: Audit, Docs, Ops & Maturity Signals

This documents the "meta" layer of the Bounded/TaroBase monorepo — everything **outside `packages/`**: the large `bounded-audit/` production-readiness audit, two standalone security/design reports, internal realtime docs, operational scripts, `.claude` skills, `.github` CI, and root configuration. Bounded is a prerelease provable realtime backend (`policy.json` + Z3 proof engine + atomic data plane) with **no users yet**; the owner (amit@poof.new) commissioned an aggressive self-audit. The meta layer is the single best signal of what is real vs. unfinished.

**Naming note:** The repo directory is `TaroBase` and packages are still `@bounded-sh/*` / `tarobase-*`. "Bounded" is the product/brand; "TaroBase"/"Tarobase" is the legacy name. The on-chain Anchor program is called `tarobase`. Product surfaces referenced throughout live in *sibling* repos not present here: `bounded-cli` (Go), `bounded-pay`, `bounded-site`, `bounded-skill`. This repo (`bounded-monorepo`) holds the backend/runtime/SDK packages plus this audit.

---

## 1. `bounded-audit/` — Production-Readiness Security & Correctness Audit [SOLID, ~active]

98 files. This is a **living, evidence-first security + correctness audit** started 2026-06-27, driven largely by AI agents ("Codex"/Claude fleet) coordinated by the owner. It is not a one-shot pentest report; it is an operational audit workspace with a strict completion standard: every scenario must end in (a) passing automated test evidence, (b) passing staging/prod e2e with command+env+timestamp, or (c) a documented residual risk with severity/owner/mitigation. Deploy/build/health/lint/publish alone is explicitly declared **insufficient** to close a finding.

### Structure
- **Top-level artifacts:** `README.md` (audit index + running deploy ledger), `findings.md` (1375 lines — the core register), `modality-trace.md` (fallback/legacy-path removal log), `scenario-catalog.md` (user/failure stories with `todo|traced|tested|fixed|risk` status), `test-plan.md` (local/staging/prod command matrix), `code-map.md` (security-critical surfaces + patched-surface evidence table), `asks-for-user.md` (fixture/credential blockers), `no-backend-policy.json`, `function-smoke.ts`.
- **Dated evidence files:** ~20 `*-2026-06-27/28.md` files and per-version smokes (`sdk-0.0.13/14/15/17/18/20-public-smoke.md`, `public-cli-0.0.12–0.0.14-production-e2e.md`, `security-hardening-2026-06-28.md`, `security-followup-2026-06-28.md`, `poof-onchain-smoke`, `runtime-modality-*`, `e2e-coverage-gaps`).
- **`fleet/`** — a multi-agent coordination kit (created 2026-06-28) for launching "many Codex agents against the same checkouts." Contains `README.md`, `RUNBOOK.md`, `coordinator-rules.md`, `coordinator-log.md`, `shared-agent-prompt.md`, `board.md` (Wave 1/2/3 slot tracker with named agents like Turing/Feynman/Euler and their UUIDs), `red-team-playbook.md` (attacker models + abuse chains), `sweep-methodology.md`, `area-backlog-100.md`, `launch-wave-1.md`, plus `prompts/wave-01..03/*` (per-area agent prompts), `evidence/*` (per-slot findings), and `harnesses/*.mjs` (safe fault-probe scripts). The "100 agents" framing is explicitly elastic, not a work cap.

### What it found — the maturity signal
The audit records **~100+ findings** across CLI, SDK, backend workers, Pay, site, auth, and onchain. Severity scale: critical (unauthorized value transfer/privesc/RCE) → high (boundary failure/DoS/money-auth bug) → medium → low. Status semantics distinguish `released/deployed` (artifact shipped, NOT behavioral proof), `prod-negative tested` (a failure path exercised in prod), and `fixed locally` (static/unit only).

**Headline: as of 2026-06-28, no open high/medium findings remain from the modality queue.** Nearly everything is `deployed` or `released`, with a large share carrying prod **negative** e2e (denials proven) but **happy-path/concurrency e2e still gated on external fixtures** (Stripe, x402, browser auth, DNS, collaborator cookies, funded mainnet wallet).

Concrete high/critical findings (all fixed):
- **PAY-005 [CRITICAL→fixed]:** split checkout trusted caller-supplied Stripe accounts/bps and return URLs → could route proceeds to attacker accounts. Now registry-derived, server-side Connect state required, return URLs restricted to Bounded origins, constant-time `METER_SECRET`.
- **AUTH-MOCK-001 / SDK-023 [HIGH→released 0.0.20]:** mock/offchain auth signatures could pass as real identity. `mockAuth`, `MockAuthProvider`, `DEFAULT_TEST_ADDRESS`, `signMessageMock` all removed; data-layer now requires real Ed25519 fee-payer sigs.
- **DEVAPI-STALE-AUTH-001 [HIGH]:** cached app records authorized **revoked collaborators/admins** until cache expiry → sensitive auth moved to fresh DB reads (`getFreshAppDetails()`).
- **REALTIME-UNPOLICIED-001 [HIGH]:** realtime could serve reads/writes under empty/default policy when config absent → now fails closed (`app_config_unavailable` etc.).
- **PAY-008 [HIGH]:** six stale value-transfer/debug functions (`settle_debug`, `connectStripe`, `createCheckout`…) remained callable in prod outside source policy → deleted; `bounded functions delete` shipped (CLI-011).
- **SITE-CONTROL-ACTOR-001, DEVAPI-MULTI-ISSUER-001, HOST-WILDCARD-BYPASS-001, LIVE-SCOPED-KEY-001, REALTIME-LIVE-ACK-001, BACKEND-036/038/043/049 [all HIGH→deployed]:** caller-supplied actor fallback; multi-issuer token acceptance; wildcard AI-provider config + staging test-header auth bypasses; broad internal secret authorizing live dispatch; failed live intents acked+billed as success; stale-config room mutations; Free-plan synthesis on billing outage; staging OTP echo leak.
- Many SDK/CLI token-in-URL leaks (SDK-003, CLI-012), OIDC refresh (AUTH-001), fail-closed billing (MOD-027), etc.

**Still OPEN / residual (the honest unfinished list):**
- **PAY-006 [MEDIUM, open]:** whether direct client creates of `purchases/$sessionId` intent docs stay allowed or move behind a service-authoritative endpoint — a product decision, not yet made.
- **BACKEND-004 [HIGH, open/mitigated]:** the **policy-update path is not proven atomic across Solana + Mongo + Durable Object + runtime state.** Acknowledged as genuinely hard ("a Solana/Mongo/DO transaction cannot be made truly atomic in-process"); needs a durable operation ledger/reconciler with rollback-forward and stale-version rejection. This is the most significant structural gap in the "atomic data plane" claim.
- **DEPLOY-001 [HIGH, partially closed]:** deploys done, but full paid Stripe/Connect, paid x402 replay, private-site stale-cookie/rollback, live-upload worker path, and funded/mainnet onchain write e2e remain fixture-blocked.
- **Onchain Anchor follow-ups** (from SECURITY_AUDIT_REPORT below) — DFlow discriminator allowlist, DBC slippage, route attestation.
- `modality-trace.md` "Pending Modality Candidates" MOD-P003–P028: P1 items include Postgres-primary storage mode still coexisting with SQLite, SDK dual realtime clients (RealtimeStore vs subscription-v2), subscription 5-min stale-snapshot cache, onchain write-path fixture. Lower-priority P2/P3 cleanup (CLI cache consolidation, legacy JSON aliases) tracked but not blocking.

The audit's own **DoD is met for negatives; happy-path behavioral coverage is fixture-limited** — a very honest state for a prerelease.

---

## 2. `SECURITY_AUDIT_REPORT.md` — Anchor Program Audit [SOLID]

Standalone audit (2026-03-09) of the on-chain **Anchor program `poof4b5pk1L9tmThvBmaABjcyjfhFGbMbQP5BXk2QZp`** (`sol-helper/.../programs/tarobase/src/`), focused on CPI trust boundaries, PDA security, and the ~14,000-line bytecode interpreter's DeFi integrations. **19 findings.**

| Severity | Count | Fixed | Remaining |
|---|---|---|---|
| Critical | 3 | 3 | 0 |
| High | 2 | 2 | 0 |
| Medium | 7 | 0 | 7 |
| Low | 3 | 1 | 2 |
| Informational | 4 | — | — |

- **FINDING-01 [CRIT→fixed `950344e`]:** unvalidated CPI `tx_data` let attackers invoke *any* instruction (not just swaps) on Jupiter/Meteora DBC/DFlow. Added `validate_cpi_discriminator()` allowlist (Jupiter 6 discriminators, DBC 1). Had a literal `// TODO` in the source acknowledging the gap.
- **FINDING-03A/03B [CRIT→fixed]:** `execute_query`/`execute_query_standalone` allowed real CPI with caller-supplied bytecode → **drain any app's escrow.** Fixed by hardcoding `simulate=true` (client already used `.simulate()`, so never exploited in the wild).
- **FINDING-02 [HIGH→PARTIAL]:** DFlow discriminator validation is only a `len>=8` placeholder — **still open**, needs `anchor idl fetch` + real allowlist.
- **FINDING-15 [MEDIUM→OPEN, pending attestation]:** `tx_data`/`ra_indices` are server-built but pass **through the client**, which can tamper (reorder CPI accounts to redirect swap output). Jupiter + DFlow paths marked PENDING ATTESTATION; Meteora/Pump.fun safe by on-chain ATA derivation. Planned fix: server-side route attestation/signing — **not yet implemented.**
- Open MEDIUMs: no incoming-CPI caller verification (FINDING-04), DBC zero-slippage/MEV (FINDING-05), PDA seed concatenation ambiguity mitigated by admin-only app creation (FINDING-06), no post-CPI balance checks (FINDING-08), `execute_query` documented "READONLY" but executes CPI (FINDING-07). Informational: all outgoing CPI program IDs hardcoded (good), Solana runtime blocks re-entrancy, ghost mode correctly restrictive.

Signal: the on-chain core had **real, severe (escrow-drain) bugs that are now fixed**, but a class of client-tamperable swap data (FINDING-15) and DeFi slippage/DFlow gaps remain as documented residual risk.

---

## 3. `AUTH_SESSION_REDESIGN.md` — Platform-wide Silent Auth [SOLID, design→deployed]

Design (DESIGN LOCKED 2026-06-21) replacing the old model (single 24h bearer idToken, `refreshToken:""`, hard logout at TTL) with **rotating refresh tokens + short access token + silent refresh** — the Supabase/Firebase/Auth0 model, chosen because it works on any app origin without same-site cookies. Platform-wide (`bounded-betterauth` worker), not admin-specific.

- Access token: RS256 JWT, target **TTL 1h** (verified via JWKS by realtime worker). Refresh token: opaque, high-entropy, **30-day rolling, single-use, rotated every refresh**, stored **hashed** in D1 with `family_id`. **Reuse detection = revoke entire family** (10s `REUSE_INTERVAL` tolerance for concurrency).
- New `POST /session/refresh {refreshToken, appId}`; reuse/expired/revoked → 401 `session_revoked` + family revoke. appId-scoped (token for app X can't refresh into app Y).
- **Security gate results (3 independent passes):** Pass 1 clean; Pass 2 (codex adversarial) found 4 — F1 rotation-race family-revoke escape (HIGH), F2 guest→email upgrade left old family alive + stored `''` refresh (HIGH), F3 persisted issuer used as refresh URL without allowlist (MED), F4 refresh token logged via axios error (MED) — **ALL FIXED in `54c6a7d1`**; Pass 3 verified. Documented assumption: F1's fix relies on **D1 single-DB write serialization** (no wrapping transaction) — re-verify if the store moves off D1.
- **Deployed 2026-06-21** to staging + prod (`auth.bounded.sh`, `wallet-auth.bounded.sh`); full mint→rotate→reuse→revoke e2e PASS. **Notably: access TTL kept at 24h, NOT flipped to 1h** — deferred until app SDKs adopt silent refresh. Email/BetterAuth live mint not e2e-tested (no test inbox). Remaining: move `bounded-admin` onto `@bounded-sh/web`.

---

## 4. `docs/realtime/` — Realtime Engine Internal Docs [PARTIAL]

Four docs for the Cloudflare Durable-Object-based realtime engine (the new data plane replacing the SQS+MongoDB indexer model).
- **PLAN-AND-ADR.md** (DRAFT, 2026-06-03, "Author: Claude (lead engineer)"): ADR that first corrects an AI-written handoff brief (factual errors about `realtime_offchain` enum, nonexistent test files). Key architecture decisions: one DO per app, single SQLite table (~8 cols) for all collections with JSON blobs; **cut SQS and MongoDB sessions from the DO** (direct WS broadcast + SQLite `BEGIN/COMMIT` transactions); files → R2; onchain indexer POSTs to `/internal/index` with `X-Internal-Secret`. Owner scoped **out of v1: reducers and scheduled tables** (machinery exists, not exposed as DSL).
- **PARITY-STATUS.md:** frank parity map vs the old client-API. **Full parity:** PUT/GET/DELETE items, WS subscriptions + RPC, bytecode policy enforcement, deny-by-default, fail-closed auth, storage tiers, auto-indexing, atomic batch writes, tenant isolation. **Partial:** `/config` (minimal when unloaded), **`PUT /items/sync` is a STUB** (real onchain sync needs indexer wiring), cursor pagination (offset-based). **NOT implemented:** JWT user identity in this path (`@user.address` always null), `POST /queries` (stub), prompt/AI filtering, shape/relationship joins, onchain indexer integration, R2 file storage, admin `__all__` paths, geo restrictions, DFlow proxy.
- **GETTING-STARTED.md:** live endpoints (`realtime.bounded.sh` / `realtime-staging.bounded.sh`), curl quick-test.
- **DEPLOYMENT-PLAN.md:** step-by-step rollout; hardcodes CF account `ccb9d9a85...`, KV namespace `2b502556...`; a mix of human/AI ("YOU"/"ME") steps.

Signal: the realtime engine is **substantially built and live but has explicit stubs** (`/items/sync`, `POST /queries`) and deferred features (joins, prompt filtering, onchain indexing) — consistent with the audit's `PARTIAL` framing.

---

## 5. `scripts/` — Operational Scripts [SOLID, small]

- **`publish-sdks.sh`:** the SDK release process. Bumps `@bounded-sh/core`, `@bounded-sh/client` (js-sdk), `@bounded-sh/server` to one version, publishes core first, rewrites client/server deps to the new core, works around the npm read-replica lag by copying `dist` locally instead of re-installing. Ends by printing manual steps to update poof `_template/{staging,v3,v2.1,v2,v1}` with `bun install`. Confirms **three published SDK packages** and a downstream Poof template consumer.
- **`build-bounded-sh.mjs`:** SDK build helper.
- **`cognito-global-signout.sh`:** legacy AWS Cognito global signout — vestige of the pre-Bounded-issuer auth era (Cognito is being actively retired per findings BACKEND-050 / DEVAPI-MULTI-ISSUER-001).
- **`add-codes.sh`:** small utility.
- Master release runbook lives in the sibling repo: `bounded-cli/release/PUBLISHING.md` (per README).

---

## 6. `.claude/` and `.github/` — Automation [SOLID]

**`.claude/`** contains **only `skills/`** — no `settings.json`, agents, or commands at this level.
- **`bounded-sdk`** skill: authoritative SDK usage guide (init/auth, CRUD, deterministic query surface — Mongo-style filter/sort/cursor/count/aggregate/full-text/joins/subscribe). Explicitly warns `prompt` is LEGACY/unsupported (returns raw docs, does not filter). Source of truth cited: `operations.ts` + `packages/docs/docs/querying.md`.
- **`integrate-plugin`** skill: a large, mature **11-phase autonomous workflow** to integrate a new Solana plugin end-to-end (research → architecture → instruction scoping [user-gate] → plan loop [user-gate] → implementation → review loop → static addresses/LUT → Anchor e2e tests → test execution → security review → cleanup). Includes `phases/01-11`, `checklists/` (architecture-decision, review-gates, static-addresses, pre-done), `references/` (Phoenix case study, ghost-mode, escrow-PDA/source-resolution, LUT addresses, argument-ergonomics, touchpoints, fixture-generation), and code `templates/` (Rust interpreter/utils handlers, grammar `.ne` additions, AST-to-bytecode, manifests, e2e tests). This is the codified institutional knowledge for extending the on-chain interpreter.

**`.github/workflows/`** (two):
- **`build.yml` (Build Verification):** on push to `main` + all PRs. Node **22.14.0**, Yarn Berry cache. Installs each package separately (`tarobase-core`, `tarobase-server`, `js-sdk`, `cdk`) + `npm ci` for six CF workers (bounded-auth, bounded-betterauth, functions-dispatcher, realtime-worker, bounded-router, bounded-host). Builds+tests core/server, builds js-sdk against local core, builds CDK, and runs **`yarn run test:evidence` ("CDK formal evidence gates")** then `yarn run test`. Discord webhook on failure. The Next.js build step is **commented out**. The `test:evidence` gate is the CI hook into the Z3/formal-proof coverage.
- **`claude-pr-review.yml`:** `anthropics/claude-code-action@v1` on PR open/sync; reviews `gh pr diff` for security/critical-bugs/breaking-changes, posts one comment, `--max-turns 30`, restricted tools. Uses `ANTHROPIC_API_KEY` secret.

Signal: heavy AI-in-the-loop development (Claude/Codex agents author code, audits, and PR reviews); CI covers builds + formal-evidence gates but **no deploy automation in CI** (deploys are manual `wrangler`/scripts, tracked by version hash in the audit ledger).

---

## 7. Root Config — Monorepo Setup [SOLID]

- **No root `package.json`** and **no root `yarn.lock`** — this is a **non-hoisted, per-package** Yarn Berry setup. Each package (`packages/{cdk,js-sdk,tarobase-core,tarobase-server,tarobase-token-plugin}` + the CF workers) installs independently (mirrored in CI). `.yarnrc.yml` sets the Berry release; `.yarn/releases/` holds the pinned Yarn binary.
- **`.nvmrc` / CI: Node 22.14.0.**
- **`.env.example`** is minimal and reveals an **Ethereum/EVM local-dev heritage** (not the current Solana/CF stack): `env=local`, `PRIVATE_KEY=` (from local **Ganache** ethereum emulator), `LOCAL_URL=http://localhost:8545`, `BASE_TESTNET_URL` (a **Coinbase Base-Sepolia RPC with an embedded API key** — a leaked credential in the example file), `SECRETS_MANAGER_ETH_ADMIN_KEY=EthAdminSecret`, `SECRETS_MANAGER_SOL_ADMIN_KEY=SolAdminSecret`. This file is **stale** relative to the real integration surface.

**Real integrations (aggregated from audit/docs/hardening, since `.env.example` is outdated):** Cloudflare (Workers, Durable Objects, KV, R2, Hyperdrive, Containers, D1), Solana (Helius devnet/mainnet RPC, Surfpool/`SURFPOOL_RPC_URL`), Stripe (+ Stripe Connect), x402 Solana payments, MongoDB, Privy, BetterAuth/OIDC (Google/GitHub/Apple), legacy AWS Cognito (retiring), Composio + AI providers (via `ctx.ai` services bucket), Helius webhooks, Vercel (bounded-site). Scoped secrets seen in findings: `BOUNDED_LIVE_SYSTEM_KEY`, `APP_CONFIG_READ_SECRET`, `BILLING_DEBIT_SECRET`, `BOUNDED_HOST_INTERNAL_SECRET`, `CF_DOMAINS_API_TOKEN`, `METER_SECRET`, `HELIUS_WEBHOOK_SECRET`, `HOST_MAP_SECRET`, `X-Internal-Secret`, `X-Usage-Read-Secret`, `X-Billing-Secret`. A major audit theme is **replacing broad shared secrets with narrow scoped ones** (SECRET-SCOPE-FALLBACK-001, DEVAPI-CONFIG-SECRET-001).

---

## 8. Overall Maturity Signals

**Production-readiness:** Prerelease with production infrastructure already live and deployed (Workers, Pay app `6a3c5cc4c23db87fb06f4ea1`, SDKs to npm through `@bounded-sh/*@0.0.23`, CLI through `0.0.29/0.0.30`, admin, site). The deploy pipeline is real but **manual + evidence-logged**, not CI-gated. Auth silent-refresh is deployed but the security-hardening 1h-access-TTL flip is **deferred**.

**Known risks / genuinely unfinished:**
1. **Atomicity of the "atomic data plane" is aspirational at the policy-update boundary** (BACKEND-004 open): Solana + Mongo + DO + runtime cannot be made atomic in-process; no durable reconciler yet. Directly qualifies the product's headline claim.
2. **On-chain client-tamperable swap route data** (FINDING-15) awaits server-side attestation; DFlow discriminator allowlist incomplete (FINDING-02); DBC swaps have zero slippage protection (FINDING-05).
3. **Realtime engine stubs:** `PUT /items/sync` and `POST /queries` are stubs; onchain indexer wiring, relationship joins, prompt filtering, R2 file storage not implemented in the realtime path.
4. **Happy-path/concurrency e2e is fixture-blocked** across Pay (Stripe/Connect), x402, browser auth (OTP/OIDC UI), private-site cookie revocation, and funded onchain writes. Negatives are proven; positives largely are not.
5. **Product decisions pending:** PAY-006 (direct purchase-intent writes), non-USD settlement, mandatory `eventId`.
6. **Stale artifacts:** `.env.example` reflects an abandoned EVM/Ganache path and leaks a Base-Sepolia RPC key; `cognito-global-signout.sh` is a legacy vestige.

**Positive signals:** Deep, self-critical, evidence-standard audit that refuses to count builds/deploys as proof; systematic **fail-closed / minimal-modality** philosophy (removing every fallback, legacy, and alternate-identity path — see 30+ MOD-xxx removals); scoped-secret separation; escrow-drain criticals found and fixed before any users; three-pass adversarial review on auth; strong developer tooling (formal `bounded verify` in CI as `test:evidence`, 11-phase plugin integration skill, Claude PR review). The overall picture: **a security-serious, heavily AI-developed prerelease where the boundary/denial behavior is hardened and proven, while transactional atomicity, external-fixture happy paths, and a handful of on-chain DeFi hardening items are the honest remaining work.**
# Bind: Core Packages (orchestration engine)

Bind is "a client-agnostic, runtime-target-agnostic prompt-to-app build platform." Client products (poof.new, a studio, a CLI) call the `/v1` HTTP surface; Bind owns orchestration, AI execution, gates, budgets, evidence, and Bounded-backed runtime work. The heart is a **resumable build workflow**: `BuildWorkflow.start(contract)` drives a run to its first pause/gate; `resume(runId)` continues from persisted position + recorded gate decisions all the way to `live`. Everything is written against platform ports (Clock/IdFactory/stores) so the SAME engine runs locally (SystemClock, crypto ids, SQLite) and on Cloudflare (Workflow/DO time, journal-pinned ids, D1). This document catalogs eight packages.

## 1. Package / module map

- **@bind/core** (`packages/core/src`) — the engine. Files: `types.ts` (contracts), `state-machines.ts` (transition tables), `flow.ts` (data-driven step plan + safe predicate evaluator), `workflow.ts` (2401 lines — BuildWorkflow start/resume/drive/steps), `gates.ts`, `budget.ts`, `events.ts`, `evidence.ts`, `coordinators.ts` (Project/Run), `reconciler.ts`, `platform.ts` (Clock/IdFactory/ContractRegistry ports), `runtime-target.ts` (RuntimeTargetAdapter interface + registry), `agent-executor.ts` (BuildAgentExecutor + personas + prompt composer), `source.ts` (SourceManager: fork/commit/promote/tag), `leases.ts` (fencing tokens), `backoff.ts`, `callbacks.ts` (client webhooks), `design-producer.ts`, `browser.ts` (render/UI-test types), `projections.ts`, `redact.ts`, `validation.ts`, `api-auth.ts`, `api-quota.ts`, `pricing.ts`, `ai-usage`, `expo-doctor.ts`, `native-config.ts`, `ids.ts`, `errors.ts`, `workspace.ts`, `app-id.ts`. Exports flat via `index.ts` plus subpaths `./flow`, `./types`.
- **@bind/bounded-adapter** — first-class Bounded (Tarobase) `RuntimeTargetAdapter`. `bounded-adapter.ts` (adapter, ~1400 lines), `native-runner.ts` (BoundedCliRunner), `webapp-runner.ts` (vite build/serve/scan), `browser-runner.ts` (Playwright), `native-android.ts`, `design-producers.ts`, `bounded-session.ts`, `bounded-facts.ts`, `staging.ts`, `lint-bounded-policy.ts`, `policy-hash.ts`, `ed25519.ts`, `safe.ts` (Workers-safe barrel). Deep `__tests__/`.
- **@bind/local-ai** — `local-cli-agent.ts` (drives Codex/Claude CLI as a BuildAgentExecutor), `caching-agent-executor.ts`, `index.ts`. Depends on core + local-store.
- **@bind/local-store** — `event-log.ts` (SQLite append-only, D1-shaped), `index.ts` (`LocalStateStore` KV snapshot), `artifact-cache.ts` (content-addressed fs cache), `bun-sqlite.d.ts`.
- **@bind/client** — public TS SDK for `/v1`: `index.ts` (BindClient + contract builder + SSE), `describe.ts` (event→human semantics).
- **@bind/react** — hooks over client: `index.ts`.
- **@bind/expo-kit** — Expo runtime-target kit: `expo-skill.ts`, `render.ts`, `scaffold.ts`, `tokens.ts` + vendored `template/v1`.
- **@bind/webapp-kit** — web kit: `bounded-skill.ts`, `prepare.ts`, `tokens.ts` (no template; agent generates).

All packages: `version 0.0.0`, ESM, `tsc -b` build/typecheck, `bun test src/**/*.test.ts`. Kits + local-store are `private`.

## 2. @bind/core — architecture

### Contracts / types (`types.ts`) [SOLID]
`BuildContract` is the immutable input packet: identity (`clientProductId`, `externalCustomer/Workspace/Project`, `bindProjectId`), `prompt`/`attachments`/`constraints`/`appType`/`successCriteria`, `playbookId/Version`, `runtimeTarget` (`RuntimeTargetRef {targetType, adapterId, targetVersion?, targetProfile?}`), `requiredCapabilities`/`preferredCapabilities` (`RuntimeCapabilityRequirement`), `environments`, and nested policy bundles: `PolicyBundle {flow, rule, quality, security, retention, notification}`, `BudgetPolicy`, `ApprovalPolicy`, `OutputPolicy`, optional `EntitlementPolicy`, plus frontend-config knobs `designPreferences`/`browserPreferences`/`qaPreferences`/`nativePreferences` and an `edit?: {changeRequest, baseRunId}` iteration context. 24 `RUNTIME_CAPABILITIES` (auth, persistent-data, policy-rules, formal-proof, functions, live-rooms, web/native-frontend, preview/production-deploy…). 6 `RUNTIME_TARGET_TYPES` (bounded-app, static-site, worker-app, mobile-backend, external-managed, custom-private). `BuildRun` carries the live state: `state`, `attempt`, `position` (index into the resolved flow — the resume cursor), `activeGateId?`, `forkRepoId/canonicalRepoId/buildCommitSha`, transient `resumeState?`.

### Build state machine (`state-machines.ts`) [SOLID]
`BUILD_RUN_TRANSITIONS` is an explicit adjacency table; `assertTransition` throws `bind.invalid_transition` on any illegal move (every coordinator transition is guarded). Pseudocode of the happy path + branches:

```
draft
  → validating_contract → (clarifying ↺) → estimated
  estimated → awaiting_budget → queued
  queued → planning → designing
  designing → waiting_design_approval → building        (design gate; can rewind→designing)
  building → verifying → previewing
  previewing → waiting_preview_approval
             → waiting_security_review
             → waiting_entitlement_approval
             → waiting_production_approval → shipping → live
  live → building            (iteration / edit loop re-enters)

  # cross-cutting:
  ANY working state → paused          (budget overrun)   → back to captured resumeState
  ANY non-terminal  → failed | cancelled
  paused → {estimated,queued,planning,designing,building,verifying,previewing,cancelled,failed}
  failed → {queued,planning,building,cancelled}   # recovery re-drive
```

Two derived sets drive resume semantics:
- `RESUMABLE_RUN_STATES` = the `waiting_*` gate states + `estimated` — resume on an **external decision** (the DO, the Worker HTTP route, and the local API all gate "resume after decide" on this one set so they can't drift).
- `IN_FLIGHT_RUN_STATES` = {queued, planning, designing, building, verifying, previewing, shipping} — mid-work states with no driver after a crash; a **startup reconciler** re-drives them (`isInFlightResumable`). `paused` and gate-waiting states are excluded (they wait on a decision, not autonomous re-drive).

### Flow: data-driven step plan (`flow.ts`) [SOLID]
The workflow executes a `FlowDefinition {id, version, steps: FlowStep[]}` rather than a hardcoded list. `FlowStep` is a discriminated union: `FlowActionStep {kind:"action", name, enabledWhen?, label?}` and `FlowGateStep {kind:"gate", name, gateType, waitingState?, requiredArtifacts, rewindTo, allowedDecisions?, timeoutSeconds?, decisionMode?}`. `StepName` vocabulary spans ~30 actions (validate, estimate, reserve_budget, plan, design, design_producers, design_judge, serve_design_gallery, source, expo_doctor, build, compile, source_scan, verify, preview, serve_preview, capture_preview, fidelity_referee, api_probe, qa_review, native_build, native_qa, coverage_probe, performance_judge, ship). `BASE_STEPS` is the default (byte-compatible with the historical hardcoded plan); `withWebSteps()` inserts real source/compile/serve/QA steps for web-frontend contracts; `withMobileSteps()` adds an `expo_doctor` gate after `source` plus optional native tiers. Named library `NAMED_FLOWS`: `bind-default`, `bind-webapp`, `bind-expo`, `fast-preview`, `guarded-preview`, `qa-gated`, `fidelity-gated`, `poofy-phases`. `resolveFlow(contract)` picks: inline `targetOverrides.flow` > `flowRef` > computed default; each override is gated by `allowedPlaybookOverrides` (throws if not allowed), then entitlement gates are injected by placement anchor and `gateDecisionModes` overrides applied.

**FlowDecisionMode** = `"human"` (pause) | `"skip"` (auto-advance) | `{autoApproveIf: <predicate>}`. The predicate runs through a **hand-written safe evaluator** (`tokenize`→`Parser` recursive-descent, `||`/`&&`/comparisons; NO eval), over a **frozen** evidence context. `autoApproveIf` may only reference `FLOW_EVIDENCE_KEYS` (compileOk, contentProbeOk, qaReviewPassed, fidelityFaithful, sourceMarkersClean, …), validated at flow-validate time. `enabledWhen` references `appType`/`targetType`/`capability:*`/`nativeQa:*`. Evidence is scoped to the **current attempt** (`eventTypesInAttempt`) so a rewind can't re-pass a gate on stale pre-rewind evidence. `FLOW_PALETTE` exports the exact authoring vocabulary so a UI builder can't drift from the validator.

### Events (`events.ts`) [SOLID]
~130 typed `BIND_EVENT_TYPES` (`bind.<domain>.<verb>`). `EventRecord {eventId, eventType, schemaVersion:1, aggregateType, aggregateId, runId?, attemptId?, idempotencyKey, producer, createdAt, visibility, redactionClass, payload}`. `createEvent` derives a deterministic `idempotencyKey` from `[eventType, aggregate, runId, attemptId, payload]` (attemptId included so a re-emitted event on a later attempt is a distinct record — the freshness window depends on this). `EventStore` interface: `append` (idempotent — dedupes by key, returns prior), `list(filter)`, `getByIdempotencyKey`. `InMemoryEventStore` is the reference; local-store's SqliteEventStore and a D1 store are drop-ins.

### Gates + GateDecision (`gates.ts`, types) [SOLID]
11 `GATE_TYPES`: clarification_required, estimate_approval, scope_approval, design_review, preview_review, security_review, budget_topup_required, manual_recovery_required, entitlement_required, production_approval, cancellation_confirmation. 9 `GateDecisionType`: approve, request_changes, reject, skip, cancel, top_up_budget, reduce_scope, retry, escalate. `GateManager.open()` mints a `BuildGate {state:"open", requiredArtifacts, allowedDecisions?, producedBy, expiresAt?}`; `decide()` records a `GateDecision {decisionId, gateId, runId, decision, decidedBy, idempotencyKey, note?, metadata?}` with hard security invariants: idempotent by `(gateId, idempotencyKey)`; gate must be `open`; **no self-approval** (producer can't decide its own gate); **no automation** (`isAutomationPrincipal` deny-lists `bind.*`, `agent*`, `workflow`, `adapter`, `system`, `noop`, `chaos`); the internal `authorizer:flow-rule` principal is usable ONLY via `internalAutoDecide` (external callers passing it are rejected — closes the auto-approve bypass); `allowedDecisions` enforced. Gates expire via `expire(now)`.

### Budget ledger (`budget.ts`) [SOLID]
`BudgetLedger` tracks `BudgetReservation {state, maxBudgetUnits, consumedUnits, releasedUnits, stepCeilings?, consumedByCategory?, overrunBehavior?, pauseBeforeOverrun?}` through states requested→authorized→reserved→consuming→overrun_pending→released/settled/denied. 8 `UsageCategory` (agent_model, sandbox, compile, browser_qa, runtime_target, storage_artifacts, external_api, operator_intervention). `request()`→`reserve()`→`consume()`/`tryConsume()`. `consume()` throws on overrun; `tryConsume()` NEVER throws — returns `{status: ok|duplicate|ceiling|overrun}` so the workflow can pause instead of fail. Per-category `stepCeilings` are STRICT and are NOT raised by a top-up (only `topUp()` raises `maxBudgetUnits`); a step at ceiling must `reduce_scope`, not top up. Every consume is idempotent by key and emits a `UsageLedgerEntry`.

Workflow consume pseudocode (`workflow.consume`):
```
res = budget.tryConsume(reservation, category, units, key=stableKey(usage,run,attempt,step))
if ok|duplicate: append bind.usage.reported; return
behavior = reservation.overrunBehavior ?? "pause"
if behavior == "cancel": transition paused→cancelled; release; throw BudgetTerminalSignal
else:
  gate = gates.open(budget_topup_required, allowed=[top_up_budget, reduce_scope, cancel])
  run.resumeState = ctx.stepEntryState          # exact state the parked step needs to re-run
  transition → paused; setActiveGate(gate)
  throw BudgetPauseSignal                        # caught by drive() → returns result with the gate
```
On resume, `resumeBudgetGate` reads the decision: cancel/reject→cancelled; `top_up_budget`→grant a full additional budget; `reduce_scope`→grant only 1 unit (spend-constraining), then restore `resumeState` (or the step's working state) and continue.

### Coordinators (`coordinators.ts`) [SOLID]
`ProjectCoordinator` — one active run per project (`admitRun` throws `bind.project.active_run_exists`), registers canonical repo, emits `contract.created`/`repo.created`, `completeRun` frees the slot, `hydrateActiveRuns` rebuilds the slot map from persisted runs. `RunCoordinator` — owns `BuildRun` lifecycle: `createRun` (state=draft, attempt=1, position=0, emits `run.started`), `transition` (guarded by the state machine, emits `run.transitioned`/`failed`/`cancelled`), `setPosition`, `startAttempt` (++attempt — the evidence-freshness boundary), `setActiveGate`, `setResumeState`, `setRefs`. `resumeState` is explicitly persisted in `cloneRun` (the cloud rebuilds a fresh engine on every resume).

### Resumable workflow (`workflow.ts`) [SOLID]
`BuildWorkflow(services, {dryRun, agentExecutor, designProducers, onCheckpoint})`. `WorkflowServices` bundles all stores + registry + clock/ids + optional callbacks. Three public entrypoints:
- `register(contract)` — validate + create run + fork repo + persist contract, WITHOUT driving (returns runId fast for async drive).
- `start(contract)` = register then `drive(runId)`.
- `resume(runId)` = re-`drive` from persisted `position` (idempotent — completed steps aren't re-run; agent/budget/source side effects not repeated).
- `cancel(runId)` — terminal for any non-completed run; releases reservation, clears gate, transitions cancelled.

`drive()` pseudocode:
```
guard terminal states (live/failed/cancelled → return)
acquire lease run:<id> (3h TTL, fencing token)
resolve flow; build DriveContext(contract, adapter, steps, stepIndex, ctx.dryRun, commitSha)
if resumed past 'source' and adapter.generateAppSource: REBUILD ctx.web plan (else compile skips)
if run.paused && activeGate: resumeBudgetGate → pause|terminal|advance
while run.position < steps.length:
  reread live state; if cancelled/failed → stop cooperatively
  step = steps[position]
  if step.enabledWhen not satisfied: position++ ; continue
  if step.kind == gate: driveGate → pause|terminal|advance
  else:
    leases.assertFresh(fencingToken)          # newer attempt/reconciler invalidates us
    ctx.stepEntryState = current state
    paused = driveAction(step.name)
    if paused: return result(activeGate)
    if ctx.rewound: renew lease; checkpoint; continue    # compile→source self-fix
    position++ ; renew lease ; await onCheckpoint()      # progress + crash-survival
catch BudgetPause/Terminal → return result
catch err → release reservation; backoff.record; transition failed; checkpoint; rethrow
finally → release lease; if terminal settleRun (stop preview); emit client webhooks (best-effort)
```

`driveGate` pseudocode:
```
if !gateRequired(contract, gateType): position++ ; return advance
if run.activeGateId: d = decisionFor(gate); if !d return pause; return applyDecision(d)
mode = effectiveDecisionMode(contract, step)     # human-production + required-security guards force "human"
if mode == "skip": position++; append gate.skipped; return advance
if step.waitingState: transition(waitingState)
gate = gates.open(...); setActiveGate; append gate.opened
if mode is {autoApproveIf}:
   if evaluatePredicate(expr, evidenceContext(currentAttemptEvents)):
       d = gates.decide(approve, decidedBy=flow-rule, internalAutoDecide=true)
       append gate.auto_decided; return applyDecision(d)
   append gate.auto_declined
return pause
```
`applyDecision`: approve/skip/top_up/reduce_scope→advance; request_changes/retry→`startAttempt` + rewind position to `stepIndex[rewindTo]` + record attempt_started + (design rewind clears artifacts/feeds note); escalate→pause; reject/cancel→cancelled + release. The action steps orchestrate the adapter (validate/plan/design/source/compile/serve/scan/verify/api_probe/qa_review/fidelity/ship) — each consumes budget, appends evidence events, and can self-rewind (e.g. `compile`→`source`, `qa_review`→`source`) up to `maxWebBuildAttempts` (env `BIND_MAX_WEB_BUILD_ATTEMPTS`, default 10). Fail-closed verdict parsers (`parseQaVerdict`, `parseFidelityVerdict`, `parsePerfVerdict`, design) require an explicit `*_VERDICT: PASS`/`SCORE=` on its own line — a missing/crashed critic never silently passes.

### Reconciler (`reconciler.ts`) [SOLID]
Global sweep (Cron/DO alarm): `expire` stale leases + timed-out gates; for each expired gate emits a deterministic `gate.decided(expired)` event and fails/cancels the run behind it (`FAILABLE_FROM` = the waiting states + paused; entitlement timeout→cancelled, else→failed) so a stuck approval can't hold a project slot forever. Emits the client `run.failed` webhook for sweep-failed runs (it doesn't go through `drive`).

### Platform ports (`platform.ts`) [SOLID]
`Clock` (SystemClock / FixedClock for replay), `IdFactory` (CryptoIdFactory / SeededIdFactory — deterministic replay ids), `ContractRegistry` (durable contract-by-run so a resumed run re-derives its plan without the caller re-supplying it). The stated rule: never read wall-clock or mint a random id inside a replayable step — go through these ports so Cloudflare replay is deterministic.

### RuntimeTargetAdapter port (`runtime-target.ts`) [SOLID]
The seam between engine and runtime. ~20 required lifecycle methods (describeCapabilities, validate/checkCompatibility sync; plan/provision/verify/deployPreview/probeIdentity/deployProduction/collectEvidence/collectUsage/suspend/destroy async) + ~15 optional web/native methods (generateAppSource, buildApp, runExpoDoctor, runNativeBuild/Qa, servePreview, scanWorkspace, probeBackend/Coverage, serveDesignGallery, runRender, runUiTest, stopPreview). Everything returns `AdapterEnvelope<T> {status: ok|blocked|failed|skipped, retryable, owner, normalized?, evidenceRefs, warnings, usageDelta?, nextRequiredAction?}`; `assertEnvelope` maps non-ok→BindError. `RuntimeTargetRegistry` resolves by `adapterId`.

### BuildAgentExecutor port (`agent-executor.ts`) [SOLID]
`BuildAgentExecutor {executorId, describe(), execute(input): Promise<result>}`. `execute` input carries stage/contract/prompt/idempotencyKey/dryRun/workspaceDir?/writeMode?/readsFiles?. Stages: plan, design, design_prototype, design_judge, design_handoff, build, source, qa_review, fidelity_judge, performance_judge. `AGENT_STAGE_PERSONAS` is a DATA table (mission, writeMode, readsFiles, filesOwned, filesNotToEdit, outputHeadings) — prompt selection is data, not a switch. `buildAgentPrompt` is a pure composer (shared rules → run context → persona → build input → prior evidence → output contract). `NoopBuildAgentExecutor` returns `skipped` (the deliberate no-provider fallback).

## 3. bounded-adapter — mapping a Bind build onto Bounded

`BoundedRuntimeTargetAdapter` (`adapterId="bounded"`, targetType `bounded-app`) maps a `BuildContract` onto a Bounded **policy.json** (domain model / collections / rules / SMT invariants), a scaffold (`bounded/functions.ts`, `live-intents.ts`, contract JSON), and per-env app-ids. The agent co-authors `policy.json`; Bind injects the `environments`/`appId`/`defs` block (`finalizeAgentPolicy`), with a hardcoded tenant template fallback (`policyFor`). **Three execution paths** selected by `executionMode` + injected runners:

- **dry-run** [SOLID as a mode] — default, Workers-safe, no runner. Returns deployment *plans* + synthetic-pass adapter evidence; `verifyRuntime` emits a "pass" with the warning "Native bounded verify execution is intentionally disabled"; `probeBackend` honestly returns `apiProbesPass:false, skipped`. Not a stub — a deliberate honest-skip.
- **local testbed** [SOLID] — `createBoundedTestbedAdapter`/`createBoundedStagingAdapter` (node-only, `staging.ts`) inject `BoundedCliRunner` + `LocalWebAppRunner` + `LocalBrowserRunner`. Spawns the real `bounded` CLI against the staging dev-api pool; runs real `bun install --ignore-scripts` + `vite build`, serves dist on loopback, content-probes/scans, publishes to `<slug>.bounded.page`. `validateContract` blocks non-staging endpoints without a production opt-in.
- **Cloudflare Worker** [SOLID] — imports from `@bind/bounded-adapter/safe`; injects a `SandboxBoundedRunner` + a `@cloudflare/playwright` binding browser runner (same `renderWithBrowser`, ~3-line `getBrowser` swap). No `node:*` reaches workerd. Every native method is `if (!this.runner) return undefined` → dry-run fallback.

**CLI/SDK calls:** no `@tarobase/js-sdk` in the adapter — it shells the `bounded` CLI (`native-runner.ts`, scoped-env spawn + transient retry): `verify <policy> --env <pool> --json`, `deploy <policy> --env --environment [--create --name] --json`, `whoami`, `data get/set --app-id --path --data --env --json`, `site deploy <dist> --app-id`, `domains slug`, `site privacy`, `version`. Generated app code uses documented HTTP (`getIdToken()+POST ${FUNCTIONS_URL}/invoke`, `POST /live/intent`). Browser automation via Playwright; design images via fal.ai / OpenAI Images. Supporting: `lint-bounded-policy.ts` (pure deterministic policy validator+autofixer run before remote verify — defaults omitted rules to deny, pins readonly `!` fields, prepends `@user.id != null` guards, flags empty literals/type mismatches/dup invariants), `policy-hash.ts` (FNV-1a, dep-free), `ed25519.ts` (throwaway WebCrypto guest keypairs for cross-caller isolation probes), `bounded-session.ts` (reshapes `~/.bounded/sessions.json` into localStorage for pre-boot P5a auth injection), `bounded-facts.ts` (static ids + source-dated capability descriptors — many `emulated`/`experimental`). `native-runner` derives cross-caller read-isolation probe plans from the deployed policy (`deriveProbePlan`); `native-android.ts` does off-Cloudflare Android build/boot-smoke (degrades to SKIP without toolchain/device).

## 4. local-ai — driving Codex/Claude CLI [SOLID]

`LocalCliAgentExecutor.execute` implements `BuildAgentExecutor`: creates `<artifactsRoot>/runs/<runId>/agents/<stage>/`, writes `prompt.md`, spawns the CLI, captures `stdout/stderr/final.md/metadata.json`. `commandFor` builds provider args:
- **Codex** (stdin-fed): write stage → `exec --cd <cwd> --sandbox workspace-write --output-last-message <final>`; reasoning → `--sandbox read-only --ephemeral`. Optional `--model` + `-c model_reasoning_effort=`. No usage metering (the one deferred item).
- **Claude** (prompt as final arg): write → `--print --no-session-persistence --permission-mode acceptEdits --add-dir <cwd> --output-format json`; readsFiles → `--tools Read`; reasoning → `--tools ""`. Parses JSON `{result, usage, total_cost_usd}` → `AgentUsage`.

Async `spawn` (never `spawnSync` on the hot path), 10 MB output cap, SIGKILL on timeout (write stages ≥600s). Transient retry (≤3, backoff, on rate-limit/5xx/429/529/network) — but write-mode timeouts are NOT retried. Provider detection: sync `--version` probe + optional `verifyAuth` (real minimal prompt, downgrades only on explicit auth-failure regex, never on timeout). `BIND_AI_PROVIDER=auto|codex|claude|off`, per-stage pinning via `BIND_AI_STAGE_PROVIDERS`. Strong security seams: `buildScopedEnv` passes only the agent's own provider keys, drops cross-provider/secret/`NODE_OPTIONS`/`LD_PRELOAD`; `assertWorkspaceScoped` blocks traversal. `CachingAgentExecutor` intercepts only `source`+writeMode: key = hash of `[sourceSignature(contract), preHash(workspaceDir), "source", attempt, provider]`; on hit restores the dir + synthesizes a byte-identical result (durationMs=0); caches only `ok` runs producing `package.json`; `attempt` in key forces fresh AI on rewind.

## 5. local-store — event log + snapshots [SOLID]

Two stores. **`SqliteEventStore`** (`event-log.ts`) — append-only, "the D1-parity seam" (identical DDL/SQL is meant to run on Cloudflare D1):
```sql
create table bind_events (
  seq integer primary key autoincrement,      -- monotonic ordering / cursor
  event_id text not null, idempotency_key text not null unique,
  event_type text, aggregate_type text, aggregate_id text, run_id text,
  created_at text, record text not null);       -- full EventRecord as JSON
-- indexes on run_id, aggregate_id, event_type; WAL mode
```
`append` uses `insert or ignore`; on `changes===0` (dup key) returns the already-recorded event (idempotent, no clobber). `list(filter)` + `readFrom(seqExclusive)` order by `seq asc`; projections are rebuilt by replaying in seq order (no whole-state snapshot clobber). Separately, `index.ts`'s **`LocalStateStore`** is a KV snapshot table `bind_local_state(key,value,updated_at)` holding JSON blobs for events/runs/gates/decisions/budget/evidence/source/contracts/idempotentResponses (a simpler save/load projection layer). **`artifact-cache.ts`** (node-only, no `bun:sqlite`) — content-addressed fs store `<root>/cache/<ns>/<key>/` with `payload/`, `meta.json`, `.committed`; immutable, first-writer-wins, atomic rename, symlink-escape guard, excludes; makes AI source-gen / vite build reproducible byte-for-byte; disabled via `BIND_ARTIFACT_CACHE=off`.

## 6. client / react / expo-kit / webapp-kit — integrator surface

**@bind/client [SOLID].** `BindClient({baseUrl, apiKey?, fetch?, routes?})`, bearer auth, auto idempotency-key on mutations. Method groups → `/v1`: `meta.get` (GET /v1/meta), `flows.validate|resolve`, `runs.create` (POST /v1/runs — builds the contract if only input/config given), `runs.list|get|status|events|evidence|usage|gates|openGate|artifacts` (GETs under /v1/runs/:id), `runs.cancel`, `runs.decideGate` (POST /v1/gates/:id/decisions), `runs.stream` (SSE). SSE: `AbortController` + `last-event-id`, `parseSseChunk`/`frameFromEvent` map server events (run.state, run.waiting, preview.ready, qa.frame, run.terminal, run.error, engine) to a `BindStreamFrame` union; returns `{close, closed}`. Free fns: `createBuildContract(config,input)` (assembles the whole contract — forces `auth=true`+`persistentData=true`, default gate `production_approval`, budget stepCeilings), `withInlineFlow`/`withFlowRef`, `validateBindConfig`, `createIdempotencyKey`; `BindApiError` carries the server error envelope. `describe.ts` maps raw events to `{title, detail?, actor, phase?}` via an `EVENT_SPEC` table (actor = builder|designer|architect|qa|system).

**@bind/react [SOLID].** `createElement`-based (no JSX). `BindClientProvider`/`useBindClient`; `useStartRun` → `{start, data, error, loading}`; `useRunStream(runId)` → rich `{frames, snapshot, activeGate, appUrl/designUrl/staging/production, runState, phase, events, terminal, qaFrame, connected, error, eventTypes, preview}` with SSE + auto-reconnect (2^n backoff cap 10s, 6 attempts) + poll fallback (3s) + event dedup by eventId; `useOpenGate` → `{gate, decision, loading, error, refresh}`; `useGateDecision` → `{decide, loading, error}`; `useRunHistory` → `{runs, loading, error, refresh}`. (Thin tests — 2 cases.)

**@bind/expo-kit [SOLID].** Ships a vendored `template/v1` (Expo SDK 54 / RN 0.81.5 / React 19 harness with `@bounded-sh/client@0.0.24`, expo-router, the load-bearing `src/lib/boundedClient.ts` doing Origin-header fetch + AsyncStorage sync cache + email-auth init). `expo-skill.ts` = the source-agent instruction doc `EXPO-BOUNDED.md` (Hermes rules, headless email-OTP, `bounded/policy.json`, `bind/qa-flow.json`). `render.ts` = pure `__BIND_*__` token substitution (Workers-safe); `scaffold.ts` = fs scaffold → `{workspaceDir, distDir, buildCommand:["bunx","expo","export","--platform","web","--output-dir","dist"], files, skillPath}`; `tokens.ts` = deterministic `expoTokensFromContract`.

**@bind/webapp-kit [SOLID].** No template — the agent generates the whole app. `bounded-skill.ts` = `BOUNDED-SDK.md` web source-agent skill (React+Vite+`@bounded-sh/client`, policy authoring w/ SMT `bounded verify`, design-quality + security bars) + `buildSourceBrief`. `prepare.ts` = `prepareWorkspace(dir)` → `{workspaceDir, buildCommand:["bun","run","build"], distDir, skillPath}` (only lays down the skill). `tokens.ts` = `tokensFromContract`, `deriveTitle`, `boundedSiteSlug(contract,appId)` (must match `deploySite`).

## 7. Tests & scripts

Every published package: `test: bun test src/**/*.test.ts`, `typecheck/build: tsc -b`. **core:** core.test (invariants — budget overrun, gate self-approval/automation/flow-rule guards, reconciler timeout, evidence supersede, lease fencing), flow.test, resume-in-flight.test (startup re-drive set), schema-parity.test (public TS values can't drift from schema), prompt-composer, browser, design-spec, expo-doctor, native-config, ai-usage, api-auth. **bounded-adapter:** the deepest suite — `webapp-parity.test` (replay determinism), `workflow-resume.test`, `budget-overrun`, `credential-isolation`, `transient-retry`, `proof-status`, `policy-fidelity`, `lint-bounded-policy`/`lint-rewind`, browser (render/uitest/auth-injection/q3-lenses/screencast), probe-plan/probe-backend, site-deploy, expo-adapter/engine, design-producers/engine, appid-consistency, build-cache, bounded-session; fakes `fake-browser-runner`/`fake-webapp-runner`. No file literally named "chaos" — parity + resume + transient-retry cover the replay/fault surface. **local-ai:** local-cli-agent, caching-agent-executor, provider-auth-probe. **local-store:** local-store, artifact-cache. **client:** describe, index. **react:** index. **expo-kit:** tokens/expo-skill/render/scaffold. **webapp-kit:** prepare.

## 8. Maturity summary

| Package | Flag | Notes |
|---|---|---|
| @bind/core | **[SOLID]** | Complete engine; state machine + gates + budget + resumable workflow + reconciler + ports all real and tested; no TODO/FIXME in source. |
| @bind/bounded-adapter | **[SOLID]** (dry-run/testbed/CF paths); **[PARTIAL]** capability facts + design fidelity referee | Real CLI/vite/Playwright/gradle; dry-run is a deliberate honest-skip. `bounded-facts` capabilities mostly emulated/experimental; fidelity referee "deferred". |
| @bind/local-ai | **[SOLID]** | Real Codex/Claude CLI, security scoping, retry, caching. Deferred: Codex per-call usage metering. |
| @bind/local-store | **[SOLID]** | Append-only D1-shaped log + KV snapshot + content-addressed cache; careful atomicity/traversal guards. |
| @bind/client | **[SOLID]** | Full /v1 surface, SSE reconnect, contract builder, error envelope; tested. |
| @bind/react | **[SOLID]** | 5 hooks with reconnect + poll fallback; light test coverage. |
| @bind/expo-kit | **[SOLID]** | Real vendored Expo harness, pure render + fs scaffold, 18 tests. |
| @bind/webapp-kit | **[SOLID]** | Deterministic tokens/slug + source-agent skill; only `prepare` is tested. |
# Bind: Apps, Examples, Agents & Docs

Bind is a client-agnostic, runtime-target-agnostic prompt-to-app build platform. Client products talk to a `/v1` API; Bind owns orchestration, AI execution, gates, budgets, evidence, and Bounded-backed runtime work. The organizing principle is **one resumable `@bind/core` engine** (`BuildWorkflow.start()` → gate → `resume(runId)` → `live`) driven over two substrates: local SQLite (`apps/api`) and Cloudflare D1 (`apps/worker`), proven equivalent by a byte-identical event-stream parity test. This document catalogs the apps, examples, agent contracts, and source docs. Packages (`@bind/core`, `client`, `react`, `bounded-adapter`, `local-ai`, `local-store`, `webapp-kit`, `expo-kit`) are out of scope here except where apps consume them.

## 1. Directory / Module Map

- **apps/api** [SOLID] — Local `/v1` HTTP+SSE server (`src/server.ts`, 1140 LOC). Wires every `@bind/core` service (event store, workflow, gates, budget, leases, coordinators, source, evidence, reconciler) over `@bind/local-store` SQLite. Two modes: `dry-run` (default, no side effects) and `local-testbed` (real Bounded CLI + local AI).
- **apps/worker** [SOLID, typechecked; needs your CF account to deploy] — Cloudflare Worker (`src/worker.ts`, 1506 LOC) running the identical engine over D1. Modules: `engine.ts` (hydrate→run→flush), `d1-state.ts`/`d1-shim.ts` (D1 store), `coordinators-do.ts` (Durable Objects), `build-workflow-entrypoint.ts` (Workflows), `queue.ts` (Queues), `cloud-build-runner.ts`/`cloud-webapp-runner.ts` (Sandbox builds), `sandbox-bounded-runner.ts` (Bounded CLI-in-Sandbox), `client-callbacks.ts` (signed webhooks), `idempotency.ts`, `preview-urls.ts`, `ai-response.ts`, `cloudflare-ai-agent.ts`. `wrangler.toml`, `migrations/0001_init.sql`, `smoke.sh`, `scripts/cf-bootstrap.sh` + `deploy-production.sh`. Heavily test-covered (parity, tenant-isolation, resume, idempotency, admission).
- **apps/studio** [SOLID] — Reference UI + BFF. Server (`src/server.ts`, 399 LOC) is a Bun BFF exposing `/api/*`; `run-manager.ts`/`run-engine.ts` build a per-run engine bundle; `drive-worker.ts` subprocess drive; `supervisor.ts`/`supervise.ts` crash-restart; `observing-event-store.ts` SSE bus; `post-ship-probe*.ts`, `bootstrap-policy.ts`, `bounded-credential.ts`, `artifacts.ts`. React web SPA (`web/src/`) with surfaces: compose, editor (flow graph), library, history, env, cockpit.
- **apps/testbed** [SOLID] — One-machine verification harness: ~22 runner scripts (`run-*.ts`), `doctor.ts`, `parity.test.ts`, `cache-determinism.test.ts`, sample contracts.
- **apps/docs** [PARTIAL] — Static Vite/React single-page docs site (`src/main.tsx`) that renders a curated shelf of Markdown from `docs/`.
- **examples/** — `node-script`, `custom-ui-react`, `third-party-integration` (public `@bind/client` integration proofs).
- **agents/** — 13 agent prompt contracts + `shared/bind-agent-common.md` + `README.md`.
- **docs/** — ~40 Markdown/JSON files: platform/architecture, integrations, dated audits, hardening notes, manifests, specs.

## 2. apps/api — the `/v1` API Surface

`server.ts` is a single Bun `Bun.serve` router bound to loopback (`127.0.0.1:8787`) by default, with a CORS wrapper (reflects Origin, allows `idempotency-key`, `x-bind-async`, `last-event-id`). Control-plane auth is optional (`BIND_API_KEYS`); when set, Bearer/`x-api-key` is required, `/v1/admin/*` needs an admin key, and a per-client daily quota (`quotaCounters`) applies to POSTs. Mutating routes require an `Idempotency-Key` header with **body-bound idempotency**: same key + same SHA-256 body → replay; same key + different body → 409 `bind.idempotency_key_reused`. Responses cap at 5000 idempotent records (LRU eviction).

**Endpoints:**
- `GET /health` — service, mode, aiProvider, authEnabled.
- `GET /v1/meta` — apiVersion, schemaVersion, gate/decision enums, entitlement placements/requirement types, runtime capabilities/target types, registered adapters + capabilities, named flows, flow palette, evidence keys.
- `POST /v1/flows/validate` — validate a `FlowDefinition` (returns `{ok, issues}`).
- `POST /v1/flows/resolve` — resolve a contract into its concrete flow.
- `POST /v1/runs` — SDK-style `{input, config}` or `{contract}`; registers a run, returns **202 `{contractId, run, status:"accepted"}`**, drives it in the background.
- `POST /v1/contracts` — raw `BuildContract`; sync path returns full `{run, gate, evidence, sealedEvidence, usage, agentResults, eventCount}`; `?async=1`/`x-bind-async:1` returns 202 and background-drives.
- `GET /v1/runs` — list runs.
- `GET /v1/runs/:id` — full snapshot: `{run, status, activeGate, gates, previews, latestEvidence(≤10, non-operator), usage}`.
- `GET /v1/runs/:id/stream` — SSE (`engine`, `run.state`, `run.waiting`, `preview.ready`, `run.terminal`, `heartbeat`); honors `Last-Event-ID`.
- `GET /v1/runs/:id/gates` | `/gate` | `/status` | `/events` | `/evidence` | `/usage` (usage returns budget ledger + `aiUsage` token rollup) | `/artifacts` (safe public manifest, http(s) URIs + sha256 only).
- `POST /v1/runs/:id/cancel` — idempotent cancel.
- `GET /v1/gates/:id` — gate + context + decision.
- `POST /v1/gates/:id/decisions` — record a `GateDecisionType` (`approve`/`request_changes`/`reject`/`skip`/`cancel`/`top_up_budget`/`reduce_scope`/`retry`/`escalate`); requires non-empty `decidedBy`; entitlement gates enforce authorizer principal; appends `bind.gate.decided`; resumes the run (sync or 202 async). Budget-overrun pause resumes on a `budget_topup_required` gate.
- `GET /v1/runtime-targets` — adapters + capabilities.
- `POST /v1/admin/reconcile` | `GET /v1/admin/debug` | `GET /v1/admin/local-state`.

**hydrate → sync-engine → flush.** At startup the `LocalStateStore` loads a snapshot (events, runs, gates, decisions, budget, evidence, source, contracts, idempotent responses) and rehydrates every in-memory service — this is *hydrate*. Each request runs the **synchronous** `@bind/core` engine (`workflow.start`/`resume`/`cancel`/`register`) — *sync*. After every mutation `persistState()` writes the full snapshot back — *flush*. Long builds (AI + vite + Bounded verify/deploy take minutes) run via `backgroundDrive()` (a deferred macrotask so the 202 flushes before the blocking `spawnSync` load begins); `resumeInterruptedRuns()` re-drives in-flight runs on startup from persisted checkpoints. In `local-testbed` mode `ensureBoundedApp()` mints a real per-product Bounded app per environment (staging + production) before the run so the frontend builds against a real appId.

## 3. apps/worker — Cloudflare Deploy Target

Runs the **byte-for-byte identical `@bind/core` engine**; only the substrate differs — hydrate from / flush to **D1** instead of SQLite. `README.md` states the seam explicitly: `Worker fetch → D1StateStore.load() → BuildWorkflow.start()/resume() → D1StateStore.flush()`. It exposes the same `/v1` surface as apps/api (meta, runs, contracts, gate decisions, snapshot/status/events/evidence/usage/artifacts, stream SSE, cancel, flows/validate+resolve, runtime-targets, admin reconcile/debug) **plus** `POST /v1/admin/resume-all` and, when `BIND_ENABLE_DEBUG_ROUTES=1`, debug probes (`/v1/admin/sandbox-test`, `/build-app`, `/bounded-sandbox-probe`, `/model-probe`), and `GET /preview/:runId/*` serving R2-hosted dist.

**Cloudflare primitives used:**
- **D1** — append-only event log (`bind_events`, same DDL as `@bind/local-store`), projection cache (`bind_state`), API quota counters, durable idempotency (`bind_idempotency`). Reads hit D1 directly.
- **Durable Objects** — `RunCoordinatorDO` / `ProjectCoordinatorDO` (`coordinators-do.ts`): single-writer serialization per run/project via `blockConcurrencyWhile`, so concurrent gate decisions/resumes can't race; a repeating alarm runs the reconciler (15-min cadence). The DO owns the hydrate→engine→flush cycle — the structural parity seam.
- **Workflows** — `BuildWorkflowEntrypoint`: the `BuildWorkflow` plan as `step.do(...)` + `step.waitForEvent(gate)`; byte-determinism makes replay safe. Hosts the multi-minute async cloud build.
- **Queues** — `queue.ts`: idempotent consumer for signed-callback delivery, cleanup, reconciliation, with retry → dead-letter.
- **R2** (`ARTIFACTS`) — raw evidence + built web-app dist served at `/preview/:runId/*`.
- **AI Gateway** (`AI` binding) — cloud build-agent stages run through AI Gateway (metering/spend limits); default Workers-AI llama fallback, overridable `BIND_AI_MODEL`.
- **Sandbox** (container DO) — per-run: `bun install` + `vite build` (same toolchain as local host) and **Bounded CLI-in-Sandbox** (`SandboxBoundedRunner` fetches the `bounded` binary from `get.bounded.sh`, injects the signing key as a file, does real verify/proof/deploy + `site deploy` → `bounded.page`).
- **Cron** — `scheduled()` sweeps expired idempotency/quota, compacts blobs, runs a retention sweep of terminal runs, reconciles timed-out gates/leases, and re-drives interrupted runs via Workflows.

Web builds are supported on the Worker only when `AI`+`Sandbox`+`ARTIFACTS`+`BUILD_WORKFLOW` are present; missing infra fails loud with `503 bind.webbuild.unavailable` (never silently routed). Generated apps are Bounded-backed by contract; a raw web contract lacking `persistent-data` → `bind.contract.not_wired`; a cloud web build without `BIND_BOUNDED_PRIVATE_KEY` → `bind.config.missing_signing_key`. Abuse controls: `BIND_REQUIRE_AUTH=1` fail-closed, per-client request quota (default 5000), separate build cap `BIND_MAX_BUILDS_PER_DAY` (default 200, skipped on idempotent replay, applies even to anon), per-project single-active-run admission (409), container `max_instances=10`.

**Parity maintenance.** `apps/testbed/src/parity.test.ts` (via `bun run test:parity`) drives the SAME engine over the in-memory store and the D1-shaped append-only SQLite log with a `FixedClock` + `SeededIdFactory` and asserts a **byte-identical event stream** (same ids, timestamps, payloads). Dedicated worker tests cover parity, tenant-isolation, resume-workflow, resume-in-flight, idempotency, D1 state, web admission, preview URLs, AI agent, source-parse, and callbacks. `bun run worker:smoke` boots workerd/Miniflare locally and asserts the full DO+D1 lifecycle (no real AI/Sandbox/Bounded).

## 4. apps/studio — Reference UI + BFF

Studio is the reference product UI, showing what a client builds on top of `/v1`. The **BFF** (`src/server.ts`) imports `@bind/*` in-process and runs builds in the background, streaming engine events over SSE. It has two run modes: **Preview** (real AI build + live preview, Bounded runs dry, no key needed) and **Production** (real Bounded verify + deploy). BFF endpoints (`/api/*`): `health`, `palette` (flow actions/gates/named flows), `env` (env health: AI providers, Bounded key/CLI, image keys), `flows/validate` + `flows/resolve`, `POST /runs` (start, 202), `GET /runs` (list), `runs/:id/stream` (SSE via `RunEventBus`, replays disk-only historical runs), `runs/:id/gates/:gateId/decisions` (decide, 202), `runs/:id/cancel`, and reads: `status`, `events`, `evidence`, `usage`, `resolved-flow`, `preview`, `native-reports`, `gates`, `gate`, `gates/:id`, `artifacts` (+ `artifacts/file`), and `design/gallery/*` (serves persisted design mockup gallery). The web SPA consumes these via `@bind/client` pointed at `/api/*`. `MAX_CONCURRENT_RUNS=3`; `studio:supervise` restarts the crash-prone real-AI BFF and reaps orphaned codex/drive-worker processes.

**Screens** (React Router nav rail): **Compose** (`ContractComposer` — author `BuildInput` + config, pick design medium image/html), **Editor** (`FlowEditor` visual flow graph + `Inspector` + `PredicateEditor` for gate predicates like `compileOk == true && contentProbeOk == true`), **Library** (`FlowLibrary` named flows), **Runs** (`RunHistory`), **Env** (`EnvHealth` — AI/Bounded/image key readiness with amber "present-but-incomplete"), and the **Run Cockpit** (`RunCockpit`): `StageTimeline`, `BudgetMeter`, `GatePanel` (approve/request-changes with reviewer feedback fed into the next attempt), `DetailTabs`, `QaFindings` (advisory security/a11y/perf), `QaScreencast` (live headless QA browser screencast). **Gating UX**: gates open the cockpit's GatePanel; streamed `run.waiting` frames surface the open gate; a decision resumes the run through the same engine.

## 5. apps/testbed — What It Exercises

The confidence-ladder harness. `run-local-suite.ts` (`bun run test:local`) chains: doctor → repo-check → chaos → ai-detect → dry-run → api-dry-run → restart-durability → cloudflare-parity → (opt) ai-exec → (opt) bounded-staging. Notable runners:
- `run-restart-durability.ts` — pauses a gated run, **KILLs the process**, restarts against the same SQLite, approves the gate, asserts resume-to-`live` from persisted state (the local proof of the CF DO/D1 durability guarantee).
- `run-parity-suite.ts` — behavioral parity + script-contract + docs-mapping + api-dry-run checks.
- `run-chaos-suite.ts` — failure injection: agent failure releases budget, gate idempotency scoped per gate, local-state round-trip.
- Webapp verticals (real AI required): `run-webapp-testbed` (prompt→AI generates real @bounded-sh/client + Vite app→bun install+vite build→serve+content probe), `run-webapp-engine-testbed` (full engine flow offline), `run-webapp-design-testbed` (design phase: mockup gallery before build), `run-webapp-staging-testbed` (real Bounded backend behind generated app + api_probe: read + valid write persists + rule-violating write blocked 403), `run-webapp-unified-testbed` (AI co-designs policy.json + frontend → verify SMT → deploy → live data-plane probe), `run-webapp-site-deploy-testbed` (→ live `bounded.page`), `run-webapp-edit-testbed` (iteration/edit loop, same app id, data preserved), plus render/render-testbed. `doctor.ts` env checks; `bounded:list`/`bounded:cleanup` manage staging apps; `probe-local-ai.ts` detects Codex/Claude.

## 6. apps/docs — Documentation Site (feature-set pitch)

A Vite/React SPA (`src/main.tsx`) that renders a curated shelf of `docs/` Markdown plus a modes matrix, repo-surface atlas, and evidence/command table. **Modes shown**: Cloud (`apps/worker` — hosted /v1, auth, quota, D1, DO, Workflows, AI Gateway, Sandbox, R2, real Bounded CLI-in-Sandbox), Local Bounded (`BIND_RUNTIME_MODE=local-testbed`), Dry Run (SDK shape/idempotency/gates/budgets, no external spend). **Doc pages listed in the site nav** (grouped Start/Integrate/Operate/Reference): Platform Overview, Repo Atlas, Repo Audit 2026-06-30, Integration Quickstart, SDK Reference, Config Reference, Runtime Modes, API Contract, Cloudflare Deploy, Production Go-Live, Architecture, Bounded Adapter, Local Testing. The README exposes a broader shelf: Architecture, API Contract, BuildContract JSON Schema, Build-A-UI-On-Bind + Quickstart + SDK + React + Consuming-From-External-App + Config-Reference + API-Lifecycle + Troubleshooting + What-To-Build + Studio-Reference + Developer-Checklist + Flow-Cookbook, Bounded Adapter, Playbooks, Local Testbed/Studio/Testing, Operations, Hardening 2026-06-19, Audit Backlog, Source Manifest, Prompt Audit, Agent Contracts.

## 7. examples/ — Public Integration Proofs

All use only `@bind/client` over `/v1` (the supported boundary; none reach into core/adapter internals).
- **node-script** [SOLID] — Minimal `BindClient` for scripts/CLIs/backends: `bind.runs.create({input, config})` with `defineBindConfig` (clientProductId, `flow:{ref:"fast-preview"}`, `gates:{required:["production_approval"]}`, `designPreferences:{medium:"html"}`), then streams events and auto-approves gates.
- **custom-ui-react** [SOLID] — Vite app using `@bind/react` hooks over a running local API.
- **third-party-integration** [SOLID] — Deliberately "boring" out-of-repo product fixture (`src/smoke.ts`): imports only `@bind/client`, talks HTTP/SSE, creates a run from `BuildInput + BindAppConfig`, streams it, handles the production gate, verifies the final snapshot. Driven by `bun run test:third-party` / `ci:integration`.

## 8. agents/ — Prompt Contracts & Operating Rules

Agents are **prompt contracts, not runtime code** — Bind Core stays the authority for gates, budget, state, source/release refs, evidence, and runtime target selection. Agents own recommendations and structured outputs only. The 13 agents:
- **BriefAgent** — normalize client intent into a build-ready brief; flag ambiguity/clarification; suggest playbooks without picking a target.
- **EstimationAgent** — estimate budget units by category, recommend required gates, identify runtime capability needs before spend.
- **ProjectAgent** — project intake; confirm identifiers/workspace, check for an existing active run, summarize status (no long-running execution).
- **RuntimeTargetAgent** — validate target fit via generic capabilities vs adapter contract; compatibility reports; recommend gates on mismatch.
- **RuntimePolicyAgent** — translate generic safety needs into adapter-neutral policy requirements; detect money/tenant/quota/role/file/realtime/function/schedule/webhook risk.
- **BoundedPolicyAgent** — generate Bounded `policy.json` (collections, rules, invariants, functions, hooks, sessions, files/search), proof-obligation notes, SDK-wrapper; documented Bounded commands only.
- **DesignAgent** — design artifacts + implementation direction; flag decisions needing human/client approval.
- **BuildAgent** — make scoped source changes in a sandbox, produce commit-ready source, keep generated artifacts out of Git.
- **VerifyAgent** — run deterministic checks; reject missing/malformed/stale/zero-ref evidence; decide sufficiency for the next gate.
- **QAAgent** — exercise verified previews from a user-behavior view; confirm preview identity (project/env/commit); browser smoke against distinctive visible content.
- **ReleaseAgent** — confirm production approval, use a clean sandbox from the exact approved commit, verify deploy + runtime identity.
- **RecoveryAgent** — classify failure ownership, compute blocker fingerprint, apply same-signal consecutive backoff, propose one targeted recovery action.
- **DocumentationAgent** — keep docs/site/examples/agent-contracts accurate on every change.

**Shared operating rules** (`shared/bind-agent-common.md`, loaded before any agent acts): required inputs (`runId`, `attempt`, `bindProjectId`, contract excerpt, phase/step, step budget ceiling, active target+capabilities, required gates, source/evidence refs, fencing token). **Forbidden**: approve/skip a gate, spend beyond ceiling, deploy production, write secrets anywhere, use target-specific APIs from Core, claim readiness from HTTP 200 alone, claim deploy from a queued job, claim proof from a hollow/zero-obligation proof, fast-retry a human-owned wait, end with background work running without a durable continuation id. **Structured output envelope**: `{status(ok|blocked|failed), owner, summary, artifacts, evidenceRefs, docsImpact, usageEstimate, nextRequiredAction, warnings}`. **Evidence rules**: durable refs, corrections supersede, preview evidence carries target identity, production evidence carries exact commit/artifact/deployment/probe refs. **Stop→blocked** on missing input, ceiling breach, missing capability, human decision required, secret detected, undocumented command, or stale fencing token. Mandatory documentation-sync assessment before every handoff.

## 9. docs/ (source) — Audit & Maturity Signals

**Platform/architecture**: platform-overview, repo-atlas, architecture, api, build-contract.schema.json, bounded-adapter, webapp-flow, cloudflare-deploy, operations, playbooks, local-testbed/studio/testing, implementation-notes. **Integrations** (`docs/integrations/*`): README, quickstart, sdk-reference, react, config-reference, runtime-modes, api-lifecycle, consuming-from-an-external-app, what-to-build, studio-reference, developer-checklist, flow-cookbook, troubleshooting. **Manifests/specs**: source-manifest.md, prompt-audit.md, build-contract.schema.json, webapp-flow-spec-2026-06-19.json, audit-2026-06-19.json, honest-audit-2026-06-20.json, poofy-remaining-gaps.json, poofy-to-bind-plan.json, cloud-migration-plan.md.

**Audit/maturity docs** (dated audits are historical evidence, not current status):
- **repo-audit-2026-06-30.md (CURRENT)** — Verdict: *"The repo is in a stronger state than older audit docs imply. The main platform spine is coherent: public SDK → /v1 → one core engine → Bounded-backed app execution."* ~49,867 LOC. Confirms Worker DOES support web builds (fixed a stale "Worker rejects all web contracts" claim); dry-run is intentionally no-side-effect; all generated apps are Bounded-backed (no static/no-backend lane). **Top risk (High before broad resale): multi-tenant reads/gates are NOT caller-scoped in the Worker** — `/v1/runs` and run reads load from D1 without filtering by authenticated `clientId`. Medium risks: cloud browser QA skip-degrades without a browser-runner binding; live-cloud confidence depends on deployed smoke (not local workerd); historical docs may confuse operators; prod custom-domain fallback unverified; heavier CI after adding `docs:build`. States: *"the most important remaining production hardening is not another parallel app path; it is caller isolation, live-cloud smoke discipline, and cloud browser QA parity."*
- **production-go-live.md** — READY: prompt→Bounded-backed app→`bounded.page` preview/site (async, metered, cost-capped, auth-guarded) — *"Ready for single-integrator validation"*; auto-provision + real `bounded verify`/deploy (fail-closed on missing key/persistent-data); explicit human production approval. WARN/FAST-FOLLOW: **multi-integrator (multiple API keys on one worker) needs per-tenant isolation — "Fast-follow before reselling to other integrators."** Prioritized fast-follows: (1) **per-tenant isolation** (bind each run to `clientId`, scope `GET /v1/runs`, 403/404 cross-tenant reads+gate decisions), (2) real spend metering (AI tokens + container wall-clock into ledger, non-overridable per-run ceiling, AI-Gateway spend limits), (3) cloud browser QA runner, (4) ops (scope D1/SSE reads to run_id, max SSE lifetime, Logpush/DLQ alerting). In-place controls: auth fail-closed, request + build quotas, per-project admission, container concurrency cap, per-run budget ceiling, idempotency dedup, credential-file (not cmdline) key, failed runs persist as `failed`, cron re-drives interrupted runs.
- **hardening-2026-06-19.md** + **audit-backlog-2026-06-19.md** — earlier hardening pass and backlog (redaction, replay-protected callbacks, body-bound idempotency). **audit-2026-06-22.md**, **honest-audit-2026-06-20.json**, **next-steps-2026-06-23.md** — dated snapshots superseded by 2026-06-30. Trajectory: **dry-run mechanics → local-testbed real Bounded → cloud parity → production hardening**, with per-tenant isolation the single largest remaining gap before multi-tenant resale.

## 10. Root — Bun Scripts & Dead-Code

`package.json` (bun workspaces: `packages/*`, `apps/*`, `examples/*`). Key scripts: `build`/`typecheck` (`tsc -b`), `typecheck:worker`, `test` (all `*.test.ts`), `check` (typecheck+worker-typecheck+test — the broad local gate), `doctor`(+`:bounded`/`:cloudflare`). Testbed suites: `test:local` (default confidence gate, no external side effects), `test:api`, `test:third-party`, `test:integration` (examples typecheck + studio build + docs build + third-party), `ci:integration` (check + integration + worker deploy:check + audit:dead), `test:chaos`, `test:restart`, `test:parity`, `test:bounded` (real Bounded staging), `test:local:ai`. Worker: `worker:dev`/`smoke`/`deploy:check`/`deploy:test`/`deploy:production`, `cf:bootstrap:test`/`production`. Servers: `local:api`, `testbed:api` (local-testbed mode), `studio:dev`/`build`/`server`/`supervise`, `docs:dev`/`build`. Testbed webapp runners: `testbed:webapp[:engine|:staging|:unified|:design|:edit|:site]`, `testbed:local`. Tools: `ai:probe`, `bounded:list`/`cleanup`, `audit:dead`. **knip** (`audit:dead` = `knip@5.61.3 --include files,exports,dependencies,unlisted`) — configured per-workspace with test-file entries; `cloudflare` dep ignored. Run as CI gate; **no dead-code findings surfaced in the audit docs** (a clean `audit:dead` is part of `ci:integration`).

## 11. Maturity Per App

- **apps/api** — [SOLID]. Full `/v1` surface, SQLite-backed durable state, body-bound idempotency, background drive + startup resume, both dry-run and local-testbed modes, `server.test.ts` coverage. Loopback-bound by default (open admin routes not LAN-reachable).
- **apps/worker** — [SOLID for local/typecheck; PARTIAL for live-cloud proof]. Same engine over D1 with DO/Workflows/Queues/R2/AI-Gateway/Sandbox all wired and unit/parity/smoke-tested on workerd. Not deployable without your own Cloudflare account/bindings/secrets; live cloud AI/Sandbox/Bounded build is unproven except by deployed smoke. **Known gap: per-tenant read/gate isolation not yet implemented** (High risk before multi-integrator).
- **apps/studio** — [SOLID]. Reference UI + BFF with real Preview/Production modes, SSE, gating UX, artifact/design-gallery inspection, supervisor for crash resilience; unit tests for supervisor/probe/contract-prep/run-manager and web lib.
- **apps/testbed** — [SOLID]. Broad harness (parity/chaos/restart/dry-run/api/webapp verticals); the real correctness backbone (parity + restart-durability are load-bearing proofs).
- **apps/docs** — [PARTIAL]. Functional static site rendering the doc shelf + modes/atlas/evidence tables; a reference/marketing surface, not product-critical (newly added in the 2026-06-30 pass).
- **examples** — [SOLID] across node-script, custom-ui-react, third-party-integration; all typecheck in CI and exercise only the public `@bind/client` boundary.
- **agents** — [SOLID as contracts]. 13 well-specified prompt contracts + rigorous shared operating rules; they are behavior specs, not executable code (Core enforces the actual gates/budgets/evidence).

**Overall trajectory**: a coherent single-engine platform whose local and cloud substrates are parity-proven; production-ready for a single integrator; the dominant remaining hardening item across the current audit and go-live docs is **per-tenant (caller) isolation in the Worker**, followed by real spend metering, cloud browser-QA parity, and live-cloud smoke discipline.
# Bounded CLI (Go)

`bounded` is the command-line interface for **Bounded**, a *provable realtime backend*. The developer workflow: describe an app → write `policy.json` (collections + rules + invariants) → `bounded verify` (server-side Z3 formal proof, fail-closed) → fix counterexamples → `bounded deploy` → read/write through the policy-enforced data plane via SDK or CLI. The CLI installs via `curl -fsSL https://get.bounded.sh/install.sh | sh`, ships a local multi-project **dashboard daemon** (JSON API on `127.0.0.1:8085`, Vite web UI on `:8008`), manages an **ed25519** identity at `~/.bounded/credentials`, and reads a public per-project `bounded.json`.

Module path: `github.com/poofdotnew/bounded-cli`. Go 1.26. Entry point `cmd/bounded/main.go` calls `cli.Execute()`. The whole surface is Cobra. **Notable maturity signal:** across 88 Go files (36 test files) there are essentially zero `TODO`/`FIXME`/`not implemented` markers in non-test code — this is a shipped, dogfooded tool. The lone `panic` is a `data.go` init-time programming guard; "mock/stub" hits are all in test scaffolding and doc comments.

## 1. Directory / module map

- **`cmd/bounded/main.go`** — 6-line entry; delegates to `internal/cli.Execute()`.
- **`internal/cli/`** (the command tree, ~40 non-test files) — every Cobra command lives here. `root.go` defines `rootCmd`, persistent flags (`--json`, `--quiet`, `--env`), config load in `PersistentPreRunE`, JSON error emission, welcome banner, and update-check post-run. Each command file has an `init()` that self-registers via `rootCmd.AddCommand`.
- **`internal/bounded/`** — the **data-plane client** (`client.go`): one `Client` per `(appId, chain, session)`, does nonce+sign login, attaches `Authorization: Bearer <IDToken>` + `X-App-Id`. Also `items.go` (get/set/delete/set-many), `queries.go` (query/aggregate/search/get-many), `submit.go` (write bundle assembly), `live.go` (LiveIntent/LiveStatus), `session*.go` (session + on-disk session cache).
- **`internal/auth/`** — `solana.go` (ed25519 keypair, base58, Solana tx sign/inspect), `auth.go` (`Manager`: nonce → sign → session token), `session.go` (nonce/session HTTP client), `token_cache.go` (token reuse).
- **`internal/config/`** — `config.go` (Config load, identity resolution), `credentials.go` (`~/.bounded/credentials`, key sources), `account.go` (email account profiles), `environments.go` (production/staging URL table), `project_config.go` (`bounded.json`), `app.go` (`.bounded/app.json` marker), `live_edit.go` (live-edit registry), `atomicfile.go` (atomic writes).
- **`internal/output/`** — `output.go`: format switch (human / JSON / quiet), `Print`/`Success`/`Info`/`Warn`/`JSON`.
- **`release/`** — `release.sh`, `install.sh`, `RELEASE.md`, `PUBLISHING.md` (master runbook).
- **`docs/`** — `live-edit-server-contract.md` (server contract for the live-edit propose/validate/deploy flow).

## 2. Complete command surface

Persistent (root) flags on **every** command: `--json`, `--quiet`, `--env <production|staging>` (also `BOUNDED_ENV`). `--version`/`-v` prints the build string. `BOUNDED_NO_WELCOME=1` silences the first-run banner.

```
bounded
├── version [--check]                 print version/commit/build; --check hits get.bounded.sh/VERSION
├── init [--force]                    write starter policy.json + bounded.json (spend-cap example)
├── deploy [policy.json]              validate+compile+push policy to an app
│     --app-id --constants NAME=v --environment --create --name --protocol --public
├── verify [policy.json]              run the formal proof engine; print PROVED/report; exit 1 on fail
│     --app-id --constants --environment
│     --operation verifyForDeploy|checkTautology|checkContradiction|checkSatisfiability|checkImplication
│     --expression --rule --property
├── decisions                         recent WRITE policy decisions (why allowed/denied)
│     --app-id --limit --denied-only
├── data                              policy-enforced data plane (--app-id, --chain realtime|mainnet)
│     ├── set        --path --data [--skip-preflight]
│     ├── set-many   --from-json [--skip-preflight]        (atomic, ≤100 docs)
│     ├── delete     --path [--skip-preflight]
│     ├── get        --path [--prompt --limit --cursor --include-subpaths --shape --filter --sort]
│     ├── get-many   --path (repeatable) | --from-json
│     ├── query      --name --args --path                 (named policy query)
│     ├── aggregate  --path --group --count --sum --avg --min --max --filter
│     └── search     --path --query --fields --limit --cursor   (full-text)
├── subscribe <path>                  stream realtime changes (NDJSON)
│     --app-id --path --chain --include-subpaths --filter --limit --once --timeout
├── dev                               run the local dashboard (vibecodeable base template)
│     --app-id --port(8008) --api-port(8085) --force --policy
├── dashboard                         multi-project local dashboard (daemon API + web UI)
│     --port(8008) --api-port(8085) --force --no-web
├── whoami                            show identity (id/address/linked email/env)
├── link [--email] [--no-browser] [--timeout]   link keypair to an email account (device flow / OTP)
├── account                           show project's account source (bounded.json)
│     └── use [profile] --global --project --env
├── live-edit                         local live-edit app registry
│     ├── register  (large flag set — see §4)
│     └── list
├── functions (alias fn)              imperative escape hatch (unproven code, proven boundary)
│     ├── deploy <name>  --entry --app-id --auth --act-as --logs-auth --sandbox --timeout --secret K=V --runtime
│     ├── list   --app-id            (alias ls)
│     ├── delete <name> --app-id     (alias rm/remove)
│     ├── invoke <name> --app-id [--data --chain]
│     └── logs   <name> --app-id
├── runtime                           deploy/run WHOLE backend projects THROUGH Bounded (sealed caps)
│     ├── init [dir] [--force]        scaffold bounded.manifest + index.ts agent
│     ├── deploy [dir] --app-id --manifest
│     ├── info --app-id              (codeId/profileId/kind/manifest/lockset)
│     └── invoke <agent> --app-id [--session --data]
├── live                              native live modules (init/tick/views realtime runtime)
│     ├── deploy <file> --app-id --name
│     ├── intent <room-path> --app-id --intent --chain
│     └── status <room-path> --app-id --chain
├── site                              publish a static frontend to a mapped Bounded host
│     ├── deploy [dir] --app-id --public --variant --variant-label --force
│     ├── privacy [status|private|public] --app-id
│     ├── variants --app-id
│     ├── rollback [deployId] --app-id --variant
│     └── promote <variantId> --app-id
├── domains                           vanity + custom domains (--app-id)
│     ├── slug [slug] [--release]     claim <slug>.bounded.page
│     ├── list
│     ├── add <domain>                (Pro)
│     └── remove <domain>
├── secret                            backend app secrets (env.SECRETS.get)
│     ├── put <NAME> [VALUE] --app-id [--value-stdin --value-env]
│     ├── list --app-id               (names only, never values)
│     └── rm <NAME> --app-id
├── services                          discover Bounded-managed 3rd-party API tools
│     ├── search <query> --limit
│     └── describe <toolkit-or-tool-slug> --limit
├── share <wallet|email> --role <developer|admin|viewer|billing> --app-id
├── unshare <wallet> --app-id
├── collaborators --app-id            (alias shares)
├── access --app-id                   who can administer (roles, members, visibility)
├── billing                           manage plan
│     ├── checkout [--plan pro|services_topup|infra_topup --no-open --print --app-id]
│     ├── portal   [--no-open --print --app-id]
│     └── status   [--app-id]
├── upgrade [--no-open --print --app-id]   start Bounded Pro (Stripe Checkout link)
└── connect                           Bounded Pay seller onboarding + checkout (--auth-app-id)
      ├── onboard [--no-open --print]   Stripe Connect onboarding
      ├── status
      └── checkout --merchant --amount --currency --product --project-id --platform-id --success-url --cancel-url ...
```

Command-area detail:

- **`init`** writes a starter `policy.json` — an append-only per-agent `spend` ledger `agents/$agentId/spend/$entryId` with a `rollingSum` invariant `spend_cap` (≤100 per agent per rolling 3600s) — plus a committable `bounded.json`, and ensures a managed `.gitignore` block. Prints a 5-step next-steps recipe (deploy --create → verify → data set → data get → dashboard).
- **`deploy`** substitutes `@constants.NAME`/overlays `@const` block, resolves the client-side `environments` block (overlay constants, capture appId, strip block), validates JSON, and POSTs `updateApp {appModifications.policy}` to the dev-API. `--create` first POSTs `createApp {appName, appAuth:"phantom", appProtocol, sitePrivate}`, and runs schema validation *before* provisioning (avoids orphan apps). It emits two protocol traps: onchain collections on an offchain protocol (stored offchain silently) and unflagged collections on an onchain protocol (writes fail `AccountNotInitialized 0xbc4`). Writes `.bounded/app.json` marker + records project defaults, and warns if the owning key is unlinked (loss = orphaned app).
- **`data`** subcommands go through `internal/bounded.Client` against `RealtimeURL`; writes carry stable error `[code]` tags (`policy_denied`=403, `invariant_violation`=409) and a `trace`/`invariant` field. `set-many`/`delete` bundles are atomic all-or-nothing, capped at 100 items (`maxWriteItems`, client-preflighted).
- **`functions`** = imperative escape hatch: code Bounded does NOT prove but whose writes pass the proven boundary and whose invocation is a policy rule (`--auth` required on every deploy). `--act-as` service identity must be admin-gated. Deploys POST `/bounded/functions/deploy`.
- **`runtime`** = deploy a whole backend project (source dir + `bounded.manifest`, ≤5MB/file, excludes node_modules/.git/dist). Bundled server-side into an immutable artifact via `/bounded/runtime/deploy`; `invoke` mints a session token for the target app and POSTs `<RuntimeURL>/agents/<agent>/<session>`.
- **`live`** = native server-authoritative live modules; `deploy` uploads source to the code registry (`/bounded/live/deploy`, key `<appId>/<module>.js`, hot-loaded), `intent` drives a room tick loop via realtime worker, `status` fetches room diagnostics.

## 3. Proof / verify integration (Z3)

**Z3 runs server-side, not in the CLI.** `go.mod` has no SMT/Z3 binding. `bounded verify` (in `internal/cli/policy.go`) builds an `operation` object, then POSTs `/verify-formal` with `{engine:"proof", policy, operation[, appId]}` to the environment's `DevAPIURL` (Cloudflare container `dev-api.bounded.sh`), authenticated with a token minted for the **platform app** (never the target app). Timeout 5 minutes. appId is *optional* — you can prove a policy before any app exists.

The response `result` has `passed` (overall) and `details[]` of checks; each check has `passed`, `proofStatus` (`PROVED`/`DISPROVED`/`UNKNOWN`/`UNSUPPORTED`/`TIMEOUT`), `obligation`/`check`, `message`, and optional `counterexample.assignments`. `renderProofResult` prints a legend and per-obligation lines marked **`[PASS]`** (actually proven), **`[FAIL]`** (a real counterexample — printed as `counterexample: var = value`), or **`[UNPROVEN]`** (advisory: not decided, e.g. runtime-enforced `bound`, intentional public read, append-only deny). It distinguishes `schema:` validation failures (invalid policy, no counterexample) from proof counterexample failures in the closing verdict. Global `attestations` (human-readable claims) render in a dedicated section grouped by claim (PASS only when every sub-obligation is PROVED). `plainEnglish()` translates proof-obligation jargon (rolling-limit algebra, conservation/delta-equivalence, tenant tag binding, immutability, read exposure, epoch-bucket conservatism) into sentences. On overall fail, `verify` calls `os.Exit(1)` (**fail-closed**). Other operations: `checkTautology`/`checkContradiction`/`checkSatisfiability` (need `--expression`), `checkImplication` (needs `--rule` + `--property`). `deploy --create` reuses the same `/verify-formal` endpoint to extract only `schema:`-prefixed issues as a pre-provision gate.

## 4. Local dashboard daemon + live-edit

`bounded dashboard` (and `bounded dev`) run a local Go HTTP daemon on `127.0.0.1:8085` plus a Vite web UI on `:8008` (a pristine template copied into `~/.bounded/dashboard`; `--force` re-copies over local remixes, `--no-web` runs the API only). `dev` is the single-project vibecodeable dashboard; `dashboard` is the multi-project variant (both share the daemon and the same port flags; `dev` additionally takes `--policy` to precompute a Proofs-panel report and `--app-id`).

**Daemon JSON API routes** (registered in `dashboard.go`, all wrapped in `withCORS`):
- `GET /apps`, `/apps/…` — live-edit registered apps (`handleLiveEditApps`, `handleLiveEditAppSub`).
- `/api/apps`, `/api/apps/…` — dashboard project list + per-app subresources (`handleApps`, `handleAppSub`).
- `/api/link`, `/api/switch-account` — link a key to email / switch account profile from the UI.
- `/api/billing/status|checkout|portal` — proxy billing to the dev-API.
- `/api/health` — liveness.
The daemon holds `liveJobs map[string]*liveEditJob` (guarded by `liveMu`) — the in-process registry of running local **live-edit agent jobs**.

**Live-edit** (`bounded live-edit`, config in `internal/config/live_edit.go`) registers a local app so a browser widget can drive an AI editing agent on the user's own machine. `register` flags configure the whole loop: `--repo` (local checkout the agent edits), `--origin` (deployed URL), `--project`, `--scope app|app+policy`, `--dev-mode remote|localhost` (+`--localhost-url`), `--dashboard-url`, `--feedback-path` (default `boundedfeedback` collection), `--admin-address` (authorized wallets; else creator mode), `--root-lock` (globs locked even from app+policy edits), and shell **command templates** the daemon expands and runs: `--agent-command`, `--build-command`, `--deploy-command`, `--rollback-command`. Cloud/source options: `--frontend-dir`, `--dist-dir`, `--backend-runtime-dir`, `--artifacts on|off`, `--source-provider auto|github|artifacts|none`, `--artifact-push on|off`, `--edit-mode canonical|variant`.

**Propose → validate → deploy flow** (per `docs/live-edit-server-contract.md`): the widget submits a natural-language change ("propose"); the daemon runs the configured agent command against the local repo, then the build command; changes are **validated** (in `app+policy` scope the new policy is re-verified so live-edits can't break invariants; `root-lock` globs are refused); then **deployed** (default `bounded site deploy` of the dist, or the custom deploy command). Widget **feedback** is recorded to the `boundedfeedback` collection; **agent jobs** stream status through the daemon's `liveJobs` map and the `/apps/…` routes. `site` variants (`--variant`/`promote`/`rollback`/`variants`) back the canonical-vs-variant edit modes for owner review.

## 5. Auth / identity / key management

Identity is an **ed25519 keypair** (`internal/auth/solana.go`): `LoadKeypair(secret)` decodes a base58 secret, derives the key from a 32-byte seed (`ed25519.NewKeyFromSeed`), address = base58 pubkey. The keypair also signs Solana transactions (`SignTransaction`/`InspectTransaction`/`parseTransaction`) — the Solana surface is transaction signing for the onchain data-plane path, not a standalone command.

Credentials live at **`~/.bounded/credentials`** (`config.CredentialsPath`; 32-byte seed + 32-byte pubkey). **Key-source precedence / labels:** env `BOUNDED_PRIVATE_KEY` (`KeySourceEnv`), project `.bounded/credentials` (`KeySourceProject`), account profile `~/.bounded/accounts/<profile>/credentials` (`KeySourceProfile`), global `~/.bounded/credentials` (`KeySourceGlobal`). `requireIdentity()` → `cfg.EnsureIdentity()` generates+persists a fresh keypair on first use (zero-ceremony).

**Session auth** (`internal/auth/auth.go` `Manager`, `session.go`): `FetchNonce` → sign the nonce-bound message (`GenSolanaMessage(address, appID, nonce)` with issuedAt/expiration) → `CreateSession` returns an `IDToken` (RS256, realtime verifies via JWKS). Tokens are cached (`token_cache.go`) and reused until expiry. The dev-API always authenticates against the **platform app** token, not the target app.

**Environments** (`internal/config/environments.go`):
| field | production | staging |
|---|---|---|
| PlatformAppID | `697d5189a1e3dd2cc1a82d2b` | `6993d4b0b2b6ac08cd334dfb` |
| AuthURL | wallet-auth.bounded.sh | wallet-auth-staging… |
| HumanAuthURL | auth.bounded.sh | auth-staging… |
| DevAPIURL | dev-api.bounded.sh | dev-api-staging… |
| RealtimeURL | realtime.bounded.sh | realtime-staging… |
| FunctionsURL | functions.bounded.sh | functions-staging… |
| RuntimeURL | host.bounded.sh | host-staging… |

**`whoami`** prints id/address/linked email/env. **`link`** runs a device-authorization flow: prints a verification URL + code + a fingerprint, polls `/auth/device/poll` until `approved`, records the linkage. Headless `--email` mode posts to `HumanAuthURL` `/email`, reads the 6-digit OTP from stdin, `/verify`, then `/auth/device/approve`. Linking (or `share`-ing a backup owner) is the only recovery path for a lost key. **`account use [profile]`** sets `bounded.json` account source (`--global`/`--project`/`--env`). **`connect`** is Bounded Pay / Stripe Connect (onboard/status/checkout, per-account via `--auth-app-id`; many split flags now deprecated in favor of the Bounded Pay registry).

## 6. Data-plane & functions from the CLI

`data` builds a `bounded.Client` (`newRealtimeClient`) → nonce+sign login → REST against `RealtimeURL` with `Bearer IDToken` + `X-App-Id`. Reads (`get`/`get-many`/`query`/`aggregate`/`search`) and writes (`set`/`set-many`/`delete`) map to `internal/bounded/items.go` + `queries.go`. Writes are policy-enforced atomically; `--chain` selects `realtime_offchain` (v1 default) vs reserved `solana_mainnet`. `functions deploy` uploads source + full policy entry (`--auth` mandatory, optional `--act-as`, `--logs-auth`, `--sandbox`, `--secret K=V`→`ctx.env.K`, `--timeout` 1–300s) to `/bounded/functions/deploy`; `invoke` attaches the caller's session token (same identity as a data write).

## 7. Onchain / Solana

There is **no dedicated `onchain` command**. Solana surfaces two ways: (1) the ed25519 keypair signs Solana transactions (`auth/solana.go` full tx parser/signer) for the onchain data-plane path; (2) app protocol selection — `deploy --protocol realtime_offchain` (default) vs onchain protocols (`realtime_devnet`/`realtime_mainnet`), with `data --chain mainnet` (`ChainMainnet="solana_mainnet"`) reserved for the direct-Solana path "arriving later". `--skip-preflight` on writes skips RPC preflight simulation for onchain protocols. deploy's two protocol traps (§2) guard the onchain/offchain mismatch that yields `AccountNotInitialized (0xbc4)`.

## 8. release/ — how every Bounded component ships

`PUBLISHING.md` is the **master runbook** (current: SDK `@bounded-sh/*` 0.0.3, CLI 0.0.7). Ship order & targets:
1. **SDK** `@bounded-sh/{core,client,server}` → **npm** via `Tarobase-integ2/scripts/publish-sdks.sh <ver>` (dir names still `tarobase-*` on disk; npm names `@bounded-sh/*`; needs an npm **Automation** token in `~/.npmrc`).
2. **Realtime worker** (the live data plane) → **Cloudflare Worker** `bounded-realtime` at `realtime.bounded.sh` via `wrangler deploy --env production` (and `--env staging` → `bounded-realtime-staging`). Deploy deliberately — one worker serves every app.
3. **CLI** `bounded` binary + `install.sh` → **R2 bucket `bounded-cli`** behind `get.bounded.sh` (custom domain, no Worker) via `bounded-cli/release/release.sh <ver>`.
4. **Dependents** — bump/rebuild/redeploy apps (e.g. the demo) onto the new SDK.
5. **E2E** — `bounded deploy ./policy.json --create --name e2e --env staging` then production. CF account `ccb9d9a85d963479d13e7dde46d98d6d`.

**`release.sh`** builds a 4-target matrix `darwin/amd64 darwin/arm64 linux/amd64 linux/arm64` with `CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS"` (stamps version/commit/date into `internal/cli` vars), then `wrangler r2 object put` uploads each as `bounded-<os>-<arch>` (latest) **and** `v<ver>/bounded-<os>-<arch>` (versioned), plus `install.sh` and a `VERSION` text file. Fresh upload is live immediately (R2 custom domain, no redeploy). **`install.sh`** detects OS/arch via `uname` (maps x86_64→amd64, aarch64→arm64; darwin/linux only), downloads `https://get.bounded.sh/bounded-<os>-<arch>`, installs to a bin dir; overrides `BOUNDED_INSTALL_DIR`, `BOUNDED_VERSION` (pin a `v<version>/` copy). The CLI self-checks `get.bounded.sh/VERSION` and nags when stale (`bounded version --check`; TTY-only, 24h-cached, non-fatal — never affects `--json`/scripts). `RELEASE.md` documents the R2/zone setup (`get.bounded.sh` → bucket `bounded-cli`, zone `bounded.sh`).

## 9. docs/

Single file: `docs/live-edit-server-contract.md` — the server contract for the live-edit propose/validate/deploy flow, widget feedback, and agent jobs (summarized in §4).

## 10. Tests & dependencies

**36 `_test.go` files** — near-parity coverage across `cli/` (policy, data, functions, runtime, live, live_edit, dashboard [1331 lines of tests], share, secret, site, connect, decisions, identity, account, environments, billing, subscribe, access_report, upload_safety), `bounded/` (items, queries, submit, session_cache), `auth/` (solana, auth, session, token_cache), `config/` (account, credentials, atomicfile, app, project_config, linkdiscovery, live_edit). `internal/bounded/doc.go` documents fully HTTP-stubbed offline tests.

**go.mod deps of note:** `spf13/cobra` (command tree) + `pflag`; `coder/websocket` (realtime subscribe); `fatih/color` + `mattn/go-isatty`/`go-colorable` (TTY output); `mr-tron/base58` (Solana/ed25519 addresses); `golang.org/x/term`. **No Z3/SMT binding** (proofs are server-side), **no SDK import** (the JS/TS SDK `@bounded-sh/*` ships separately on npm), no HTTP router (stdlib `net/http` + `http.ServeMux`).

## 11. Maturity per command area

- **[SOLID]** `init`, `deploy`, `verify` (full proof rendering incl. counterexamples/attestations/plain-English + fail-closed exit), `data` (all 8 subcommands wired to the realtime client), `subscribe`, `functions` (deploy/list/delete/invoke/logs), `runtime` (init/deploy/info/invoke), `live` (deploy/intent/status), `site` (deploy/variants/rollback/promote/privacy), `domains`, `secret`, `whoami`, `link` (both browser + headless OTP), `account`/`account use`, `share`/`unshare`/`collaborators`/`access`, `decisions`, `dashboard`/`dev` daemon + web UI, `live-edit register`/`list`, `billing`/`upgrade`/`connect`, `services`, `version`. All hit real dev-API / realtime / host endpoints with real auth.
- **[PARTIAL]** onchain data plane — `--chain mainnet` / `solana_mainnet` and `realtime_devnet|mainnet` protocols are declared and the tx signer exists, but the direct-Solana path is documented as "arriving later" (v1 data plane = realtime worker only). `connect checkout` split flags are deprecated (registry-backed). `site deploy --force` is reserved/no-op.
- No **[STUB/MOCK]** or **[TODO]** command areas in production code — mocks exist only in tests.
# Bounded Pay (provable payments ledger)

**Maturity: [SOLID]** — deployed prod app `6a3c5cc4c23db87fb06f4ea1` at `bounded-pay.bounded.page` (created 2026-06-24, owner wallet `GFdiGThC8DJ5oMdDYj1xgyQJjWkje6EbzH2jdUMcuWBt`, linked `amit.ishairzay@gmail.com`). Real policy + four TypeScript functions + a passing test suite. Zero TODO/FIXME/mock/stub markers in source. The only "aspirational" edges are documented activation gaps (see syncUsage secrets) and explicit non-features (subscriptions, non-USD, webhook fanout).

Bounded Pay is **Bounded's payments product implemented as a Bounded app** — a `policy.json` (proven backend) plus functions — NOT a bespoke backend. It is the **Stripe Connect platform ledger**: Bounded is the Connect *platform*; apps/merchants are *connected accounts* Stripe pays directly; Stripe is the money transmitter (Bounded never touches funds). Bounded's cut is **1%** of gross (`boundedBps`) plus Stripe's processing fee. Crucially, the Stripe platform **key** and the `/connect/*` + `/billing/*` HTTP endpoints live in the `bounded-host` worker inside the TaroBase monorepo — **not in this app**. This app holds only the *provable ledger*; it holds **no secrets** (verification is done via unguessable session-id capability reads against the host).

## 1. Files and roles

- `policy.json` [SOLID] — the proven backend: collections + rules + prover invariants + function registry.
- `functions/claimPurchase.ts` [SOLID] — buyer-invoked idempotent purchase-intent write after Stripe redirect.
- `functions/settle.ts` [SOLID] — SETTLER-identity conserved ledger booking of one paid session (simple or split).
- `functions/recordUsage.ts` [SOLID] — per-event metering + fail-closed cap reservation.
- `functions/syncUsage.ts` [SOLID] — live host usage feed → charges + caps (delta vs cursor).
- `tests/pay-functions.test.mjs` [SOLID] — node:test suite compiling the 4 fns via `tsc` and exercising them with an in-memory ctx mock.
- `README.md`, `MODULE.md`, `PLATFORM.md` [SOLID] — deploy/ops, app-integration guide, platform guide.
- `.bounded/app.json` [SOLID] — public deploy marker (appId, env, owner). `.gitignore` protects keys/secrets.

## 2. policy.json — collections, rules, money model

Constant `SETTLER = 8ipcCEeXo5Lobo44yEDq32Aff331aWnVDubhSWYQ7a6o` — the ed25519 **service identity** that the money-writing functions `actAs`. Only SETTLER can create/update balances, settlements, entitlements, charges, cursors. All collections are `tier: "durable"`.

**Identity/auth collections:**
- `admins/$userId` — `{active:Bool}`. Read/write gated to managers (`/__managers__`) or active admins. Powers the `settle`/`recordUsage`/`syncUsage` function `auth` (must be `.active == true`; a test asserts the policy never uses the weaker `!= null` form).
- `merchants/$merchantId` — `{owner:String!, displayName?}`. Public read; create-only by owner where `$merchantId == @user.id`; owner-immutable; no delete.

**Conserved money ledger:**
- `accounts/$accountId` — `{balance:Int}`. Read: any authed user. Create: only SETTLER, and `balance == 0` (accounts always start empty). Update: only SETTLER. Delete: false. **Invariant `conserve` name `no_minting` on `balance`** — the prover guarantees no atomic write can create or destroy total balance; every settlement must sum to zero. Well-known account ids: `gateway` (Bounded's inbound holding), `platform` (Bounded's 1% fee pot), `<merchantId>`, plus split-mode `platform_<platformId>` (external platform's share), `stripe` (Stripe processing fee sink).

**Purchase/settlement (per-session, create-only = idempotent):**
- `purchases/$sessionId` — `{buyer:String!, merchantId:String!, createdAt:UInt}`. Read by buyer/merchant/SETTLER. Create by any authed user *where they are the buyer*. update/delete false → replay hits `update:false`. This is a reconciliation *hint*, never proof of payment.
- `settlements/$sessionId` — `{buyer, merchantId, currency:String!, platformId?, gross:UInt, fee:UInt, net:UInt, platformShare?, stripeFee?}`. Read by buyer/merchant/SETTLER. **Create only by SETTLER and `currency == "usd"`.** update/delete false → this create-only marker is the **idempotency proof**: a session can never double-credit.

**Volume cap:**
- `merchants/$merchantId/volume/$eventId` — `{amount:UInt}`, SETTLER-create-only. **Invariant `rollingSum` `merchant_daily_volume_cap`**: field `amount`, `windowSeconds 86400`, `limit 1000000` ($10,000 in cents), scoped per `$merchantId`. Caps gross settled volume per merchant per rolling 24h.

**Entitlements (cross-app):**
- `entitlementClaims/$userId/items/$claimId` — `{source!, ref!, createdAt}`, self-owned create-only (user's own claims).
- `entitlements/$userId/items/$entitlementId` — `{active:Bool, productId, source, expiresAt?}`, SETTLER-create/update only.

**Platform/project/usage ledger (the "platform ledger"):**
- `platforms/$platformId` — `{owner:String!, name?, stripeAccountId?, platformBps:UInt, boundedBps:UInt}`. Public read. **Create/update only by managers** (`/__managers__`) — i.e. **admin/Bounded-operator-only registration**; owner-immutable on update. The platform wallet itself CANNOT create/edit its own platform row (revenue split is not self-serve).
- `projects/$projectId` — `{platformId:String!, owner?, name?}`. Create by a manager OR by the platform owner (`@newData.owner==@user.id && get(/platforms/platformId).owner==@user.id`) — **self-service, only under a platform you own**. `projectId` is conventionally the user app's Bounded appId. platformId/owner immutable on update.
- `limits/$projectId/scopes/$scope` — `{platformId:String!, owner?, capMicroUsd:UInt, spentMicroUsd:UInt}`. `$scope` is a category (`ai`, `infra.compute`, `email.sent`, …) or `total`. Create by manager/project-owner with `spentMicroUsd==0`. **Update rule is the crux of fail-closed metering**: the *owner/manager* may change `capMicroUsd` (budget authority — raise/lower freely) but must leave `spentMicroUsd` unchanged; **only SETTLER may advance `spentMicroUsd`**, and only monotonically upward (`>= old`) and never above cap (`<= capMicroUsd`), with `capMicroUsd` held constant. So spend can only be reserved by the metering service, and can never exceed the budget the platform set.
- `cursors/$projectId/cats/$category` — `{cumulativeMicroUsd:UInt}`, SETTLER-create/update. High-water mark for the live usage feed diff.
- `charges/$chargeId` — `{platformId!, projectId!, category!, sourceEventId?, microUsd:UInt, periodYm:UInt, createdAt:UInt}`. **Append-only cost ledger**, SETTLER-create-only, update/delete false. Read by managers/active-admins/SETTLER/platform-owner. Aggregated (group by category/project/period) for usage reads and billing.

**Money model / bps splits.** `platformBps + boundedBps + userBps = 10000` (userBps is implied, not stored). Example: creator 80% / platform 19% / Bounded 1% → `platformBps=1900, boundedBps=100`. Bounded uses **separate charges and transfers**: funds land in Bounded's balance (`gateway`), then the host Connect webhook transfers each share. **The platform absorbs Stripe's processing fee**; the user (merchant) and Bounded get *clean* bps of gross. Conservation: simple mode requires `net + fee == gross`; split mode requires `net + fee + platformShare + stripeFee == gross`, all enforced in `settle` before the atomic write and re-proven by `no_minting`. Spend caps are **fail-closed**: per-category AND `total` limit docs must both exist and match the project or the metered op is denied (never records uncapped usage).

## 3. functions/ — logic, service identity, act-as

All three money/meter functions declare `actAs: 8ipcCEeXo5Lobo44yEDq32Aff331aWnVDubhSWYQ7a6o` (SETTLER) and `auth: @user.id != null && get(/admins/@user.id).active == true` — an active admin *invokes*, but the function *writes as* SETTLER (the act-as pattern: caller-gated invocation, service-identity data-plane writes). `claimPurchase` runs as the buyer (`auth: @user.id != null`, no act-as). All validate path segments via `/^[A-Za-z0-9_-]{1,128}$/` (rejects dotted categories like `ai.model` rather than rewriting — tested).

**claimPurchase(args, ctx):** `buyer = ctx.user.id`; validate `sessionId`; `GET host/connect/session?id=…`; reject if not ok / not paid / `s.buyer != buyer`; validate merchant; `set purchases/<sessionId> {buyer, merchantId, createdAt}`; on create-conflict, if existing matches buyer+merchant return `alreadyClaimed`, else rethrow. Never touches the ledger.

**settle(args, ctx):** short-circuit if `settlements/<id>` exists (`alreadySettled`); require existing `purchases/<id>`; re-`GET /connect/session` (Stripe = source of truth, never the user-authored claim); require paid; require verified merchant+buyer **match the purchase doc** (blocks front-run intents — tested); require `currency == "usd"` (tested reject on eur); parse `gross/fee/net`, validate `net+fee==gross` (non-split); `ensure` accounts exist (create balance 0); one atomic `setMany`: `gateway -= gross`, `<merchant> += net`, `platform += fee`, write `volume/<id>=gross` (rollingSum), create `settlements/<id>`. **Split mode:** additionally validate platform row exists and its `owner`/`stripeAccountId` match the verified session, `net+fee+platformShare+stripeFee==gross`, and credit `platform_<platformId> += platformShare`, `stripe += stripeFee`. Note: settlement is **per-session by id** (triggered by host webhook/admin), not a cron sweep — Bounded functions have no collection-list primitive.

**recordUsage({projectId, category, microUsd, eventId}, ctx):** validate ids + positive integer microUsd; require `eventId` (or legacy `sourceEventId` — compat only, tested). Look up `projects/<projectId>` (unknown → reject). Compute **stable idempotency key** `usage_<sha256(projectId\0category\0eventId)>`; if a charge exists and matches → `alreadyRecorded` (recorded:0); if exists with different amount → `event_id_conflict` (tested). Else build writes: append `charges/<id>` (with `periodYm = UTCyear*100+month`), then for `[category, "total"]` scopes read limit doc — **missing/invalid/would-exceed → return `capExceeded:true` and write nothing** (fail-closed, tested). Otherwise push `spentMicroUsd += amt` per scope; atomic `setMany`; catch handles race (re-check committed charge → alreadyRecorded, else cap_exceeded).

**syncUsage({projectId}, ctx):** SETTLER, one project per call. Uses `secrets: ["METER_SECRET"]`. `GET host/connect/app-usage?appId=<projectId>` with `X-Meter-Secret` header → `{categories:{cat:cumulativeMicroUsd}}`. For each category: read `cursors/<projectId>/cats/<cat>`, `delta = cumulative - last`; skip if `delta<=0`; build writes `charges/<uuid>` + cursor advance; reserve against `[category,"total"]` caps identically fail-closed; **if a cap blocks, the cursor does NOT advance** (op stays visibly over budget so upstream gateway denies), tracked in `capFailures`. Returns `{recorded, capped, capFailures?}`. **Activation gap:** requires `METER_SECRET` set on both this app and host, plus `REALTIME_USAGE_SECRET` on host; until then returns a harmless fetch error.

## 4. Three flows (PLATFORM.md) + MODULE.md

PLATFORM.md keeps three flows separate: **(1) Seller sales** — buyer pays creator via `/connect/checkout`, splitting gross between seller/platform/Bounded, booked by claim+settle. **(2) Usage metering** — Bounded records project costs into `charges` and reserves against `limits`; pure policy state. **(3) Platform-customer billing** — the platform charges its *own* SaaS customers with its own billing system (Stripe Billing, invoices, etc.); Bounded does **not** do this and a Stripe payment does NOT change `charges`/`limits` unless the platform's own code writes policy state. Key rule: `spentMicroUsd` is *reserved cost*, never reduced by a customer payment. Platform ops: admin-only platform registration (with bps split + `stripeAccountId`); platform self-serve project-create (only under owned platform, projectId==appId); self-serve budgets (raise/reset anytime, metering can never exceed them); usage reads via `charges` aggregation; per-Bounded-identity Stripe onboarding (`/connect/onboard`, `/connect/status`, one `acct_…` reusable across owned projects). Subscriptions unsupported in `/connect/checkout` (one-off `mode=payment` only); `bounded billing …` bills the *developer's* Bounded account, not end users.

**MODULE.md** — how any app enables card payments: drop the `accounts`/`purchases`/`settlements` module + `claimPurchase`/`settle` into your `policy.json` with your own `<SETTLER>` address (public key only; no private key for data-plane writes), copy the two functions verbatim, and wire 3 host calls (`POST /connect/onboard`, `GET /connect/status`, `POST /connect/checkout` → returns Checkout `url`/`sessionId`, Bounded keeps 1%). App holds **no Stripe keys**. Optional split mode passes registry ids (`appId`,`platformId`) not buyer-supplied splits. Provable guarantees: `conserve` (no value created/destroyed), create-only settlements (idempotent, no double-credit), service-gated writes (buyers can't forge balances), fail-closed spend caps, USD-only.

## 5. tests/

`tests/pay-functions.test.mjs` compiles all four fns with `tsc` to a temp dir, imports them, and runs `node:test` with an in-memory `ctx` mock (create-only `set` throws on existing doc; `setMany` overwrites). Covered: claimPurchase rejects `wrong_buyer` (no writes); settle rejects front-run purchase-intent mismatch (no writes); settle rejects non-USD; recordUsage rejects missing eventId; recordUsage rejects non-canonical category (`ai.model`); recordUsage fails closed on missing `total` cap (no charge written); recordUsage eventId idempotency (replay→alreadyRecorded, different amount→conflict, spent advances correctly); syncUsage doesn't advance cursor/charge when total cap missing (`capFailures`); syncUsage rejects non-canonical category; and a policy assertion that admin powers require `.active == true` (not the weaker `!= null`). Tests focus on **security/fail-closed invariants**, not happy-path booking math.

## 6. Business / pricing

- **Bounded Pay fee: 1% of gross** (`boundedBps=100`) on every seller sale, into `accounts/platform`.
- **Platform (reseller) fee:** whatever bps the platform registers (`platformBps`, e.g. 1900 = 19%); `platformBps + boundedBps + userBps = 10000`.
- **Stripe processing fee** is absorbed by the platform in split mode (sinks to `accounts/stripe`); merchant + Bounded get clean bps of gross.
- **Managed-services markup rule:** "provider cost + 5%" for managed services (the platform bills its customers at cost-plus, metered by `charges` at raw `microUsd` provider cost; the 5% is the platform's/Bounded's managed-services margin layered on top when the platform prices retail). The `charges` ledger records *underlying provider cost*; retail pricing/markup is the platform's own concern.
- **Bounded's own account billing** (separate product): `bounded billing checkout --plan pro | services_topup | infra_topup`, `bounded billing portal` — bills the developer's Bounded account (Bounded Pro subscription + bucket top-ups).
- **Monetizable surfaces:** the 1% Pay fee on all Connect volume; per-category/usage metering (cost-plus managed services); platform revenue-split hosting (Bounded takes 1% of every downstream platform's seller sales); Bounded Pro + infra/services top-ups.

## 7. Maturity

**Deployed and working [SOLID].** Prod app live at a real appId/URL, four non-trivial functions with real Stripe-host verification and prover-backed invariants, a real passing test suite, careful deploy sequencing docs (deploy policy first, functions last; don't re-deploy source policy after — it omits pinned `codeVersion` and would fail-close prod). No mocks/stubs/TODOs in source. Documented **explicit non-features** (not bugs): no app-level Stripe webhook fanout (use scheduled reconciliation over `/connect/session`); no seller subscriptions (one-off Checkout only); USD-only (don't enable non-USD until a currency-partitioned ledger invariant exists). One **activation dependency**: `syncUsage` needs `METER_SECRET`/`REALTIME_USAGE_SECRET` provisioned on app+host+realtime before the live feed works (returns harmless fetch errors until then).
# Bounded Site (bounded.sh homepage & positioning)

Marketing site for **Bounded** (bounded.sh), "the backend you and your AI can trust." Single-page Vite + React 19 + TypeScript app, dark editorial theme, GSAP-driven scroll experience, no router (multi-page via separate HTML entrypoints), self-hosted variable fonts. Repo cataloged from `main` (= live in production, deploys via Vercel on push).

> **CRITICAL STRUCTURE FINDING — the README is stale.** `README.md` and the scope brief describe a component set (Hero, TerminalDemo, ProofArtifact, ProofTable, TwoLayers, HowItWorks, Quickstart, ScopeLimits, Footer). **That design is NOT live.** `src/App.tsx` renders `<PortalApp />`, a scroll-driven "boundary portal" of eight **Acts**. The legacy components (`ProofArtifact.tsx`, `ProofTable.tsx`, `ScopeLimits.tsx`, `Quickstart.tsx`, `Header.tsx`, etc.) still exist in `src/components/` but are **not imported by the homepage** — they only appear in the docs subsite and in the pricing/terms/privacy page chrome. So there is **no live "What gets proven" obligations table, no TwoLayers honest-coverage table, no ScopeLimits "what we do NOT claim" section, no HowItWorks steps, and no 5-command Quickstart on the homepage.** Those exist only in docs (`/docs`, out of this scope) and in machine files (`public/llms.txt`, `llms-full.txt`). This is a major gap versus the brief; flagged per section below. [SOLID codebase, but README = STALE/misleading.]

Maturity overall: [SOLID] — the live Portal homepage, pricing, and legal are complete and polished. The standalone billing/auth flow pages (pay, link, upgrade, connect) are [SOLID] functional React apps hitting real API hosts.

---

## 1. Hero (ActHero — `src/portal/acts/ActHero.tsx`)

Exact HERO copy:

- **Headline (h1):** "The backend you and your AI can trust."
- **Subhead (lead):** "A realtime, agent-first platform with *formally verified* rules for access, state, multiplayer, and money." ("formally verified" is an inline link that scroll-jumps to the formal-verification beat.)
- **CTA:** There is no traditional button pair. The primary CTA is a copy-to-clipboard control (`CopyAgentPrompt`): button label **"Copy the setup prompt"** (with a `›_` glyph and a "copy" / "Copied!" affordance), above it the caption **"Copy for use in Codex, Claude Code, or your preferred AI agent."**
- The hero centerpiece is the animated "boundary square" mark (clickable / keyboard-operable: "Enter, continue to the next section"), which on scroll you literally fall *through* (pinned GSAP pass-through).

Note the noscript/meta headline is the same but the subhead there is longer and describes the "you describe the app; your agent builds it; every write is checked at the boundary" model.

---

## 2. Sections in order — exact copy (the eight Acts)

The live page = `PortalHeader` + `Portal` (ActHero pinned intro, then flow: ActProveAll, ActProven, ActNoTradeoff, ActMoney, ActSurfaces, ActAudience, ActStart) + `Outro` footer.

**Header (`PortalHeader.tsx`):** wordmark `bounded.sh` + a **"beta"** badge. Nav: **"Formal verification"** (scroll-jump), "Docs" (`/docs`), "Pricing" (`/pricing`). On mobile home, Docs/Pricing hide; only the FV jump shows.

**Act 0 — Hero:** (see §1).

**Act 1 — ActProveAll (id `formal-verification`, "Why formal verification"):**
- h2: **"Your app is a target for frontier models like Mythos."**
- Body: "They probe every path through your backend, hunting *the one case your tests missed*. Bounded leaves them nothing to find: [formal verification](/docs#verify) proves the rules you write hold for every possible request, before a single line ships."
- Dot-grid visual, two panes: **"a test: the cases you tried"** vs **"a proof: every possible case"** (a test lights ~7 scattered dots; a proof sweeps the whole 10×5 field).
- Caption: **"Tests check what you thought of. *Proofs check what you didn't.*"**

**Act 2 — ActProven ("Rules that cannot break"):**
- h2: **"Rules that cannot break."**
- ExampleCard prompt: **"Build a task tracker. Only assigned members can open a task, not even an admin."**
- Shows a mock "Tasks" app window (rows: "Ship v2 launch / you · Dana / In progress"; "Q3 billing audit / not assigned / locked"; "Brand refresh / Dana / Done") beside a **"Proven by Bounded"** artifact. (See §3/§4 for the proof list.)
- Explain: "Each rule you write becomes a proof obligation. Run verify before shipping so Bounded proves it holds for every possible request, not just a handful of tests, then enforces it on every write."
- Caption: **"Stated once. *Proven for good.*"**

**Act 3 — ActNoTradeoff ("Realtime, at full speed"):**
- h2: **"Realtime, at full speed."**
- Subhead: "Multiplayer, presence, and live queries run server-authoritative on the same engine that proves your rules."
- ExampleCard prompt: **"Build me an online Pong where two players can play against each other online."** (See §3.)
- Caption: **"Proofs run before you deploy. At runtime, every read, write, and tick stays at *in-memory speed.*"**

**Act 4 — ActMoney ("Finance is a first-class citizen"):**
- h2: **"Money, natively."**
- Subhead: "Balances, escrow, payments, and perps are native, governed by the same proofs as your data."
- ExampleCard prompt: **"Give the agent a trading budget. It may only ever trade $TSLA or $SPCX."** (See §3.)
- Caption: **"Real money. *Not a dollar moves outside your proven rules.*"**
- Sub-CTA line: **"Ask your agent to integrate Bounded with Solana."**

**Act 5 — ActSurfaces ("One backend, all of it"):**
- h2: **"One backend. Every layer."**
- Subhead: "Auth, data, realtime, money: every surface your app needs, under one proof engine."
- Six surface cards (verbatim, see §4 breadth table):
  - **Auth** — "Sessions, roles, and device-linked agents, with every access path proven before it ships."
  - **Functions** — "Server functions that run inside the boundary, under the same proofs as your data."
  - **Realtime** — "Live queries that re-resolve the millisecond a write lands."
  - **Multiplayer** — "Server-authoritative presence, cursors, and shared state. The multiplayer core other backends make you build yourself."
  - **Storage** — "Files and records under one set of invariants, so nothing crosses a tenant it should not."
  - **Finance** — "Balances, escrow, and perps as native primitives. Real money that cannot move outside a proven rule."

**Act 6 — ActAudience ("Who builds on Bounded"):**
- h2: **"Built to be built on."**
- Subhead: "A solo dev with an agent, a team shipping AI features, or a platform launching the apps its users prompt into being: all run on the same proven core."
- Caption: **"You and your agent build the app. *Bounded makes sure it can't break the rules.*"**

**Act 7 — ActStart (id `start`, "Get started"):**
- h2: **"Cross the boundary."**
- `CopyAgentPrompt` (same "Copy the setup prompt" / "Copy for use in Codex, Claude Code, or your preferred AI agent.").
- Secondary CTA: **"Read the docs →"** (`/docs`).

**Outro footer band (`Outro.tsx`):** wordmark + links: Docs, Pricing, Privacy, Terms + "© 2026 Bounded".

---

## 3. TerminalDemo scenario & ProofArtifact content

The README's TerminalDemo (looping spend-cap typewriter, "60 ✓ / 60 → 409 / 40 ✓ / 1 → 409") and its ProofArtifact (Z3 PROVED/DISPROVED with null counterexample) are **not on the live homepage** — that design was replaced by the Acts. [The spend-cap sequence survives only conceptually in the `setupPrompt.ts` and llms.txt.]

The live analogues are the ExampleCard demos:
- **Proof artifact (ActProven):** a static "Proven by Bounded" card with a ✓ seal listing three proof obligations, each tagged **"✓ PROVEN"** (see §4). This is the closest thing to the old ProofArtifact — it shows PROVED-only, no counterexample, for a task-tracker app.
- **Realtime demo (ActNoTradeoff):** a genuinely live, `requestAnimationFrame`-driven 2-player Pong arena ("User A" vs "User B", scoreboard "A 0 · 0 B") with a synced **"server ticks"** feed printing rows like `tick N ball->(x,y) · A.y N · B.y N · User A`. Pane bar reads "arena · multiplayer" + **"16ms tick"** (60Hz). [SOLID, real simulation.]
- **Money demo (ActMoney):** a static **trade ledger** governed by a proven rule "budget: **$TSLA $SPCX** only · ✓ proven." Stats: Balance **$184,920.50**, Escrow **$42,500.00**, Perp PnL **+$1,288.85**. Rows: `BUY $TSLA ×50 @ 412.10` ✓ ALLOWED; `SELL $SPCX ×12 @ 88.65` ✓ ALLOWED; `BUY $NVDA ×200 @ 138.40 · not in budget` **× BLOCKED**; `BUY $TSLA ×30 @ 412.55` ✓ ALLOWED. [SOLID, static representative tape.]

---

## 4. "What gets proven" (ProofTable) & TwoLayers coverage

**No dedicated ProofTable obligations list or TwoLayers honest-coverage table exists on the live homepage.** [Live: TODO/absent versus brief.] The only on-page proof-obligation content is ActProven's three app-specific rows:

- "Only assigned members can open a task" — ✓ PROVEN
- "Admins can't open a task they aren't on" — ✓ PROVEN (starred/highlighted)
- "A task reaches Done only from In progress" — ✓ PROVEN

The breadth/coverage story is told by ActSurfaces' six-card grid (§2). The honest two-layer coverage model ("proven before deploy, enforced at runtime"; functions are NOT proven but can't break invariants; deploy does NOT gate on proofs) lives only in `public/llms.txt` / `llms-full.txt` and `/docs#proven`, not on the homepage. Key honesty facts from llms.txt worth preserving:
- Five invariant types: **conserve, rollingSum, bound, tenantTag, tenantEdge**.
- "verify and deploy are SEPARATE commands, and deploy does NOT gate on the proofs — the proof report is information the user/agent decides on."
- "We do NOT prove a function's logic, but it CANNOT break your invariants."
- Onchain/Solana is "a compatibility surface, not a dependency: Bounded is offchain-first."

---

## 5. ScopeLimits — what the site says it does NOT claim

**No ScopeLimits section on the live homepage** [TODO/absent versus brief]. The strongest honesty boundaries appear in the legal pages and llms.txt (see §7 legal for the warranty disclaimer, which is the real "we do not claim" statement):
- The proof engine verifies **the invariants and rules *you* declare**; Bounded makes no warranty they "capture every property relevant to your application" — you remain responsible for declaring correct invariants and reviewing output before relying on it.
- Deploy does not re-run the prover; the verify report is a decision aid, not a gate.
- Bounded is "not a broker, exchange, custodian, fiduciary, or money-services business."

---

## 6. HowItWorks steps & Quickstart's 5 commands

**Neither is on the live homepage** [absent versus brief]. The homepage's "how" is entirely the copyable **setup prompt** (`src/portal/setupPrompt.ts`, `SETUP_PROMPT`), which is the load-bearing quickstart. Its command flow, verbatim from the prompt:
1. Install CLI + skill: `curl -fsSL https://get.bounded.sh/install.sh | sh` (starts loopback dashboard daemon on `127.0.0.1:8085`; adds skill via `npx skills add bounded-sh/skill`).
2. Install SDK (scope `@bounded-sh`): `npm i @bounded-sh/client` (web/React Native) or `npm i @bounded-sh/server` (Node); `@bounded-sh/core` is transitive.
3. `bounded init` — scaffold `policy.json` + public `bounded.json` (collections → rules → invariants).
4. Declare invariants (rollingSum caps, conserve, tenantTag/tenantEdge, bound; capped collections append-only).
5. `bounded verify` — read the PROVED/DISPROVED report + counterexamples.
6. `bounded deploy` — validates/compiles/pushes; does NOT rerun prover or gate on DISPROVED.
7. `bounded dashboard` — full web UI.
8. Use `@bounded-sh/client` for auth/writes/live subscriptions.

The prompt's closing move: it asks the user yes/no whether to make **future** projects Bounded-aware by appending a note to `~/.claude/CLAUDE.md` (Claude Code) or `~/AGENTS.md`. (A shorter `LLMS_SETUP_PROMPT` variant also exists.)

---

## 7. Standalone pages

### pricing.html → `Pricing.tsx` [SOLID] — CRITICAL BUSINESS CONTEXT
Uses the legacy `Header` + `Footer` chrome. Section eyebrow "Pricing"; title two lines: **"Free to build."** / **"$25 when you outgrow it."**; intro: "Every feature on both tiers — only the limits move." **Exactly two tiers:**

**Free — $0** — tag "Real apps, on the house." — CTA "Start free" (→ `/docs#start`):
- 1 project
- 100 MB storage + files
- Full prover, full runtime, full SDK
- Realtime, proofs, onchain-compatible
- $0.50 AI/external-services trial credit each month

**Pro — $25/month** (featured) — tag "Ship and share." — CTA "Go Pro" (→ `/upgrade`):
- Unlimited projects
- 10 GB storage + files
- Team sharing — invite collaborators
- Unlimited proof runs
- Bandwidth included
- $5 AI/external-services credit each month
- $30 Bounded infra credit each month
- Gas-sponsorship allowance included

Footnote (verbatim key numbers): "We're in beta — limits may evolve. Hitting one is always an **upgrade prompt, never silent billing**. Proofs are never rate-limited mid-deploy. Third-party service proxies are itemized at **provider cost plus 5%**, or you can integrate providers directly with your own API keys. Bounded Pay keeps a **1% platform fee** in addition to Stripe's own processing fees."

Additional billing detail from `UpgradeApp` COPY and llms.txt: two one-off top-up kinds exist for Pro accounts — **`services_topup`** (AI/external-services, provider cost + 5%) and **`infra_topup`** (metered Bounded infra beyond the included bucket). Free accounts cannot buy top-ups; there is also a platform-wide rolling abuse cap on free-trial services usage.

### pay.html → `PayApp.tsx` [SOLID]
`bounded.sh/pay` — Stripe Buyer-checkout return page. Verifies `?status=success&sessionId=cs_...` against `host.bounded.sh` (`/connect/session?id=`) before claiming payment. Phases/headlines: "Verifying payment", "Payment complete" ("Thanks — your purchase went through…"), "Payment not verified", "Checkout canceled" ("No charge was made…"). Explicitly refuses to trust the URL alone.

### link.html → `LinkApp.tsx` [SOLID]
`bounded.new/link` (page says bounded.sh · device authorization) — device-link approval. A `bounded link` CLI device prints a fingerprint; the human signs in via **email OTP** (Cloudflare-native Bounded issuer, hits `auth.bounded.sh` / `dev-api.bounded.sh`, real prod/staging `platformAppId`s), confirms the fingerprint matches, and approves — granting the device admin. Security framing: "If it doesn't, **stop** — someone else may be trying to access your account." Headlines: "Link this device", "Device linked", "Can't link this device."

### upgrade.html → `UpgradeApp.tsx` [SOLID]
`bounded.sh/upgrade` — self-serve Pro checkout. Email OTP → Bounded idToken → `host.bounded.sh/billing/checkout` → Stripe Checkout redirect (validated to `checkout.stripe.com`). Handles `kind=pro|services_topup|infra_topup`. Pro copy: "Bounded Pro / $25/mo / Unlimited projects, 10 GB storage, team sharing, unlimited proof runs, $5 AI/external-services credit, and $30 Bounded infra credit each month." Notes billing is per-account by signed-in identity; suggests `bounded upgrade` in terminal. Handles success/unverified/canceled/unsupported and a "billing keys aren't configured" state. Footer: "bounded.sh · secure checkout by Stripe."

### connect.html → `ConnectApp.tsx` [SOLID] (bonus page, not in brief)
`bounded.sh/connect` — Stripe **Connect** (seller onboarding) return page. "Verifying Stripe connection" / "Onboarding didn't finish." Refuses to treat return URL as proof.

### terms.html → `Terms.tsx` [SOLID legal]
"Bounded Terms of Service," Effective **June 13, 2026**. Adapted from Poof's ToS; **Bounded, Inc., a Delaware corporation**. 25 sections: definitions (incl. "Bounded IP" = policy language + verifiable bytecode format + proof engine; "Money Features" = escrow/balances/payments/transfers/payouts), eligibility (18+), click-wrap, license, IP ownership (you own your Content/Generated Code; Bounded owns Bounded IP + Usage Data), **Money Features & Secrets** (no custody, no advice; you declare correct invariants), fees (non-refundable; 1.5%/mo late interest; provider cost + 5%; Bounded Pay 1% + Stripe fees), acceptable-use, warranty disclaimer ("AS IS"; proof engine verifies only *declared* invariants), **liability cap = greater of $100 or 12-month fees**, indemnification, termination, AAA arbitration in Wilmington DE + class-action waiver, Delaware governing law, 1-year claim limit. Contact legal@bounded.sh; DMCA.

### privacy.html → `Privacy.tsx` [SOLID legal]
"Privacy Policy for Bounded," Last Updated **June 13, 2026**, **Bounded, Inc.**, contact privacy@bounded.sh. Adapted from Poof. Collects: personal data, Project Content (policies/collections/rules/invariants/proof reports/env vars), derivative/usage data, financial data (stored by Stripe), **Money & Balance data + possible KYC**, cookies, third-party comms data (email/SMS/WhatsApp/AI). Standard use/disclosure/security/retention/rights (GDPR/CCPA) sections; "**We do not sell your personal information** for monetary consideration." Not directed to children under 13. US data transfer.

---

## 8. Footer & navigation links (incl. stale/dead ones)

- **Live homepage Outro footer:** Docs (`/docs`), Pricing (`/pricing`), Privacy (`/privacy`), Terms (`/terms`), "© 2026 Bounded". All resolve.
- **Legacy `Footer.tsx`** (used only on pricing/terms/privacy pages): same four links + tagline **"Describe it. Build it. Prove it."** + a mono signature **"writes fail closed"** + "© 2026 Bounded".
- **STALE LINKS — legacy `Header.tsx`** (rendered on pricing/terms/privacy) has nav: **"The build" (`/#build`), "Live" (`/#live`), "Proofs" (`/#proofs`), "Quickstart" (`/#quickstart`)**, Pricing, Docs. Those four anchor IDs **do not exist** on the live Portal homepage (which only has `#formal-verification` and `#start`) — so from a subpage those nav items land at the top of home, effectively **dead anchors**. [PARTIAL/STALE.]
- External CLI/install references: `get.bounded.sh/install.sh`, `github.com/poofdotnew/bounded-cli` (README). No 404/"coming soon" placeholders on the pages themselves.

---

## 9. Meta / branding / theme / fonts / analytics

- **Title:** "Bounded · The backend you and your AI can trust". Subpage titles: "Pricing · Bounded", "Docs · Bounded", "Terms of Service · Bounded", "Privacy Policy · Bounded", "Payment · Bounded", "Link device · Bounded", "Upgrade · Bounded", "Connect · Bounded".
- **Meta description (home):** "The backend you and your AI can trust. A realtime, agent-first backend with formally verified rules for access, state, gaming, and money. Proven before deploy, enforced at runtime." (Note: home meta says "gaming" where the hero says "multiplayer".)
- **OG/Twitter:** og:type website, og:site_name "Bounded", og:image `https://bounded.sh/bounded-180.png`, twitter:card "summary". Canonical `https://bounded.sh/`.
- **Favicon/branding:** `/bounded.svg` (SVG), `/bounded-32.png`, apple-touch `/bounded-180.png`, `favicon.ico`. The mark is the animated "boundary square" (`BoundedMark`/`Logo`), lockup = `Wordmark` ("bounded" + faint ".sh").
- **Color theme (`global.css`):** dark only. bg `#0a0a0b`, panel `#0e0f11`, text `#e8e6de`, dim `#9b9991`, accent green `#6fcf97` (PROVED), red `#e5484d` (DISPROVED), amber `#d6a14d`, blue `#7da7f4`. theme-color `#0a0a0b`. Faint film-grain overlay + radial top glow.
- **Fonts (self-hosted, Fontsource variable):** Source Serif 4 + Newsreader (display serif / headlines), **Hanken Grotesk** (body — note README says "Schibsted Grotesk" but `main.tsx` imports Hanken; schibsted is a dep but unused), **JetBrains Mono** (reserved for artifacts/terminal/proofs). All respect `prefers-reduced-motion`.
- **Analytics:** **None found** — no GA/Plausible/Segment/Vercel Analytics in package.json, HTML, or code. Deps are only React 19, GSAP 3.15, Fontsource. CSP in `vercel.json` is strict (`script-src 'self'`, connect-src limited to `*.bounded.sh`/`*.bounded.page`), which would block third-party analytics anyway. `cleanUrls: true`.

---

## 10. Overall positioning

- **One-liner:** "The backend you and your AI can trust" — a realtime, agent-first backend/platform with **formally verified** rules for access, state, multiplayer, and money; **proven before deploy, enforced at runtime.**
- **Target audience:** developers building with AI coding agents (Claude Code, Codex) — explicitly a solo dev + agent, a team shipping AI features, or a platform whose users "prompt apps into being." The whole homepage is agent-first: the primary CTA copies a prompt for your agent, not a signup form.
- **Differentiators emphasized:** (1) **formal verification / proofs vs tests** — "Tests check what you thought of. Proofs check what you didn't"; the frontier-model threat ("target for frontier models like Mythos"); (2) **no tradeoff** — proofs are pre-deploy, runtime stays in-memory fast (16ms tick multiplayer); (3) **native money** — balances/escrow/perps under the same proofs, "Not a dollar moves outside your proven rules," Solana-compatible; (4) **one backend, every layer** (auth/functions/realtime/multiplayer/storage/finance) under one proof engine; (5) generous **$0 free tier**, simple $25 Pro.
- **Unfinished / placeholder / notable flags:** README is stale/misleading (describes a superseded design). The brief's ProofTable, TwoLayers, ScopeLimits, HowItWorks, and 5-command Quickstart **do not exist on the live homepage** (only in docs/llms.txt). Legacy `Header.tsx` nav (used on pricing/legal pages) points to **non-existent anchors** (`#build`, `#live`, `#proofs`, `#quickstart`). "beta" badge in the nav and "We're in beta — limits may evolve" on pricing. Home meta says "gaming"; hero says "multiplayer" (minor inconsistency). `schibsted-grotesk` font dependency is installed but unused. The fictional model name **"Mythos"** appears as the frontier-model example.
# Bounded Capability Catalog (from public docs)

Bounded (bounded.sh) is a **provable realtime backend for apps**. Workflow: describe app → generate `policy.json` → `bounded verify` (Z3 proof loop) → fix/accept counterexamples → `bounded deploy` → use via SDK/CLI. Runtime rules + invariants **fail closed**. One JSON file defines the backend: collections, field types, auth rules, invariants, hooks, schedules, webhooks, search, functions, sessions, roles, access. `verify` is the Z3 proof loop; `deploy` validates/compiles/pushes (it does **not** re-run the prover or block on DISPROVED). Beta; SDK versions are pre-release.

---

## 1. Policy language (`policy.json`)

**Collections & path templates.** Top-level keys (except reserved blocks) are path templates: alternating `collection`/`$variable` segments, always even count (`tenants/$tenantId/invoices/$invoiceId`). Collection names: letters+digits, start with a letter. `$variable` ids become **path variables** usable in rules/invariants. Nesting encodes ownership (a write binds each `$var`). Colliding templates (`users/$a` + `users/$b`) = deploy error.

**Field types (exact scalar names).** `String`, `Int`, `UInt`, `Bool` (NOT `Boolean` — rejected), `Float` (not allowed onchain), `Address` (wallet/32-byte pubkey). No `Number`/`Timestamp`/`Date` — model time as `UInt` (Unix seconds), lists as **sub-collections**. **No array/object field types.** Suffixes: `?` optional, `!` **readonly-after-create** (adds an immutability proof obligation), `!?` both. System fields (`_id`, `_createdAt`/`_updatedAt`/`_createdBy` in **ms**, onchain `_transaction_hash`/`_block_number`), plus `id`/`pathId` and the whole `_*` namespace, are reserved — readable, never declared/written.

**`!` needs a preservation clause.** Marking a field `!` obligates "no update payload changes it," but the engine does NOT synthesize the check — you must add `@newData.X == @data.X` per `!` field to the `update` rule or deploy fails (`field immutability`). `update:"false"` satisfies it vacuously. A `tenantTag` field does not need `!` (the invariant rebinds it).

**Rules.** `rules` gate `read`/`create`/`update`/`delete` with boolean expressions. **Omitted rule = deny.** A false rule → `403` + trace. `errorDisclosure` (`"full"`|`"minimal"`, per-collection wins over policy-global wins over env default; env default is `minimal` in prod, `full` in dev) controls how much rejection detail reaches the client; the full reason always stays in the decision log (`bounded decisions --denied-only`). Error envelope: `{error, code, status, requestId}`; stable `code` = `policy_denied` (403) / `invariant_violation` (409) even in minimal mode.

**Expression variables:**

| Variable | Meaning / restriction |
|---|---|
| `@user.id` | Universal principal — always present when authed (= wallet addr for wallet logins, account id for email/social). Use for ownership/membership/auth. Offchain only. `null` if unauth. |
| `@user.address` | Real wallet; **null for email/social**. Onchain/wallet semantics only. |
| `@user.email` | Verified lowercased email; null for wallet/guest. Offchain only. |
| `@user.isAnonymous` | Strict bool; `true` only for guests. Gate with `== false` (no unary `!` on special vars). Offchain only. |
| `@origin.kind` | Platform-set, unforgeable provenance, **always set**. Produced: `'live'` (tick), `'user'` (direct call). `'scheduled'/'function'/'webhook'` reserved, not stamped yet. Offchain only. |
| `@origin.path/module/room/tick` | Live/dispatch detail; null when N/A. Gate `module` together with `kind=='live'`. |
| `@data.field` | Existing doc — **not** in `create`. |
| `@newData.field` | Incoming doc — **not** in `delete`. Must reference a field (never bare `@data`). |
| `@time.now` | Server time (seconds). |
| `@contract.address` | App contract/escrow address (onchain). |
| `$pathVariable` | Any path template variable. |
| `get(/path)` | Read another doc, **pre-transaction** state; unquoted leading-`/` path. |
| `getAfter(/path)` | Read another doc, **post-batch staged** state; not in `read` rules. |

**Operators:** `&& || == != < <= > >=`; arithmetic `+ - * ** //` (integer division). Plain `/` reserved for paths — division with it is a validation error. Literals: numbers (decimals offchain only), quoted strings (`"" '' `` ``), `true/false/null`. **No ternary, no switch, no string concatenation** — branch with `(cond && A) || (!cond && B)`; build paths by embedding vars (`get(/teams/@newData.teamId/members/@user.address)`). Rules may call read-only plugin functions (`@StringUtils.length(...) <= 280`); transactional plugin calls go in hooks. Validator enforces: `@data` not in create, `@newData` not in delete, `onchain:true` must use `read:"true"`, onchain rules can't `get()` offchain.

**Constants & Defs.** `constants` block → `@const.NAME` (string/number/bool values; type preserved when whole value is one const, e.g. `"limit":"@const.DAILY_CAP"` → `5000`). `defs` block → `@def.name` reusable rule fragments (inlined wrapped in parens; may reference other defs/constants recursively; cycles = compile error). Both resolved **server-side at compile time** (deploy+verify) so runtime sees only literals (zero runtime cost). There is **no `@constants`** special var. CLI `--constants NAME=value` overrides `@const` client-side (one-off/CI) and fills legacy `@constants.NAME` (written unquoted). Errors: `@const.X is not defined`, `cyclic @def reference`, `constants.X must be string/number/boolean`.

**Environments** (CLI-only, client-side). `environments: { name: { appId, constants } }` — one `policy.json` → many apps (preview/production), each own `appId` + constant overlay. `bounded deploy --environment preview` overlays env constants onto the `constants` block, targets the env `appId` (explicit `--app-id` still wins), strips the `environments` block, ships a normal policy. Combine with `--constants` for CI overrides.

**Tiers.** `durable` (committed before caller sees success; **required** for `rollingSum` and materialized/sharded conserve — declaring them non-durable is a deploy error), `checkpointed` (interval-batched, bounded loss window), `ephemeral` (in-memory, gone on restart, fastest). Use durable for money/ledgers/invariant-protected; checkpointed for high-write app state/presence; ephemeral for game ticks/cursors/rooms.

**Conditional Transfer Authority.** Ownership-like fields (`owner`/`ownerAddress`/`holder`) are protected by a deploy proof: field may stay unchanged or be reassigned only by the current holder. Use `proofs.transferAuthority: [{scope, field, name, allow}]` when a different atomic condition is safe (e.g. a listed good moves to a buyer only when the paired payment lands in the same `setMany`). Deploy proves every field-changing update is holder-authorized OR satisfies `allow`, and that `allow` only assigns to the caller. Not a runtime bypass — the collection `update` rule still authorizes. Put money/points under `conserve` and submit good-move + wallet debit/credit in one atomic `setMany`. Legacy collection-local `transferAuthority` array still accepted. (Ownership-as-data transfer — changing an `owner` field checked against `@data.owner` on update — is auto-proven as transferable-but-unseizable.)

**All top-level blocks:** `links`, `auth` (`{anonymous:bool}`), `functions`, `roles`, `constants`, `defs`, `proofs` (`{transferAuthority?, attestations?}`), `attestations` (legacy alias), `errorDisclosure`, `environments`, `ogRoutes`. Per-collection keys: `fields`, `rules`, `tier`, `errorDisclosure`, `invariants`, `onchain`, `hooks`, `enforceRules`, `schedule`, `dueRows`, `webhooks`, `search`, `queries`, `session`, `relationships`, `type`, `service`/`model`/`prompt`, `isPassthrough`/`isRevealPath`, `description`/`operationDetails`/`functionDescription`.

---

## 2. Invariants (the core differentiator)

Invariants are **transaction postconditions**: declared per collection, enforced atomically on **every** write path (direct, function `ctx.bounded`, hooks, ticks, schedules, file finalize, onchain permissionless, `setMany` batches — whole batch commits or nothing). **Nothing has an exemption — the owner included** (no service-role/admin-SDK bypass like Firebase/Supabase). Four types are also **proven at deploy** (Z3): `conserve`, `rollingSum`, `tenantTag`, `tenantEdge`. `bound` is runtime-enforced only. Optional `name` surfaced in the `409`; name them like error codes (`spend_cap`, `no_minting`). Rules-vs-invariants: rules judge *who may act* on one write; invariants judge *what must hold across every transaction, including writes a rule can't see*. "App bug → rule; losing money/leaking tenant → invariant."

**`rollingSum` — caps over time windows.** Sum of a `UInt` field over the last `windowSeconds` never exceeds `limit`. Keys: `field` (UInt, required), `windowSeconds` (required, ≤31536000 for onchain), `limit` (required), `scopeVariable` (optional `$var` → per-partition cap: each agent/user/tenant gets its own budget), `name`. Requires `tier:"durable"`. Capped collections are **append-only** (`update`/`delete` → `409 append_only`); write each event with a fresh id (`"update":"false"`/`"delete":"false"` is the correct intentional-deny idiom, surfaced as non-blocking advisory). Multi-window: several `rollingSum` on the same field with different windows, each proven independently. **Proves:** if runtime admits only nonnegative appends and projected window sum ≤ limit, resulting sum ≤ limit for every sequence (per partition with `scopeVariable`). **Rate-limit recipe:** to cap a *different* action, append one `weight=1` event to a dedicated append-only log in the **same atomic `setMany`** as the real write, put `rollingSum` on the log, and **pin the weight in the create rule** (`@newData.weight == 1`) — else a client writes `weight:0` and bypasses the cap.

**`conserve` — sums don't change.** Total of an `Int`/`UInt` field across the collection preserved by every transaction: value moves, nothing mints/burns. A debit must be matched by a credit in the same batch. Keys: `field` (required), `materialization` (`direct` default = sums write set; `materialized` = backing aggregate row; `sharded` = spread across shard rows for hot collections — both non-direct require durable and fail closed on missing/corrupt aggregate), `scope`, `name`. **Proves** delta-equivalence (after-sum == before-sum) + induction over arbitrary multi-doc write sets. **Genesis** (no admin-mint escape hatch): conserve locks the total at whatever the sum is when it goes live. Options: (a) **seed-then-conserve** — deploy without the invariant, write opening supply, redeploy with it; (b) **credit/debt** — drop `>=0` so balances go negative, net stays 0; (c) onchain-backed. Peer transfer needs a rule that lets you move your own balance OR lets anyone *credit* any account but never lets a non-owner *decrease* one.

**`bound` — hard ceilings/floors (anti-cheat).** A numeric field (or every value of a `.values` map) must satisfy `op limit`. Keys: `field` (`foo.values` bounds every map value), `op` (`<= >= < > ==`), `limit` (use `@const.NAME`), `name`. **Runtime-enforced but NOT SMT-proven — a non-blocking `[UNPROVEN]` advisory** (reads as "not discharged," not "counterexample found"; does NOT block deploy, verdict still `✓ Safe to deploy`). Enforced on every durable write, function/hook write, and at the **live checkpoint** (over-limit snapshot rejected, last valid checkpoint stays; direct over-limit write → `409`). Open gap is the `.values` map case (runtime checks all values, single-value obligation doesn't yet quantify over them). For a **proven** cap use `rollingSum` or a single-write rule predicate (`@newData.score <= 11`). Declare on the **authoritative** collection, never a `.../view/$x` subcollection.

**`tenantTag` — documents carry their tenant.** Binds a `String` field to a path var: `{type:"tenantTag", field:"tenant", pathVariable:"$tenantId"}`. Every accepted write to `tenants/$tenantId/...` has `tenant == $tenantId`. **Proves** no payload mis-tags. No `materialization`/`scopeVariable`. ⚠️ **Write-time integrity, NOT read access** — you still need a read rule gating on membership (`get(/tenants/$tenantId/members/@user.id) != null`) or every signed-in user reads every tenant (verify still says `✓ Proven` because it proved integrity, not read isolation). Need both.

**`tenantEdge` — references stay inside the tenant.** Protects a reference field: target must live in `targetScope` and carry the same tag. Keys: `field` (source tag), `referenceField`, `targetScope` (must exist in policy), `targetField` (target tag, must be `String`), `targetPathVariable` (for bare-id refs — write the **bare id** `"A1"`, not a full path; resolved inside the source tenant; target must already exist → order writes target-first). **Proves** accepted reference implies source/target tags match. Tag both ends. `targetPathVariable` stays offchain-only.

**Onchain coverage claims** (`onchain: "offchainOnly"|"onchainUnsupported"|"onchainSupported"`). All four types enforced offchain. `onchainSupported` accepted only for the enforced subset — direct `conserve`, `tenantTag`, epoch-bucketed `rollingSum` — on `onchain:true` collections; overclaims rejected at verify; an onchain runtime rejects unknown metadata rather than skipping.

**Global attestations (`proofs.attestations`).** Policy-wide claims spanning every collection/surface. Each: `claim` (human sentence, echoed onto results) + `kind`+params (machine obligation proven by Z3). Kinds:
- **`roleGatedRead`** — "only `<role>` can read `<scope>`/`<field>`" — closes EVERY read path (rules, relationships, queries, exposures). Flat `role` (`members/$memberId`) auto-derives the membership predicate; a **nested** role (`tenants/$tenantId/members/$memberId`) requires an explicit **`gatedBy`** predicate (else `UNSUPPORTED`).
- **`authorityClosure`** — "membership of `<roleScope>` only grows through gated additions — no side doors." **Flat `roleScope` only** (`admins/$userId`); nested is a **known limitation** (no keying param). Optional `initialMember`.
- **`rollingSum`** — a windowed cap proven globally (same algebra + `scopeVariable`).
A **bare-string** attestation proves nothing — surfaced `UNSUPPORTED`, non-blocking advisory ("NOT proven — bind to prove"), never counted as proven (soundness). Compiling English → a bound `{claim, kind, ...}` obligation is the agent's job. Attestations don't yet have a `conserve` kind (use a per-collection `conserve`).

---

## 3. Proof system

`bounded verify` compiles the policy to proof obligations, discharges them with **Z3 (SMT)**. **Verdicts:** `PROVED` (holds over all inputs; a proof certificate — expression, obligation, solver result, integrity hash — is kept for audit), `DISPROVED` (concrete counterexample with exact variable assignments), `UNSUPPORTED/NOT PROVEN` (engine can't prove; never counts as PROVED; if also an invalid runtime declaration, static validation rejects; a bare-string attestation is non-blocking advisory). `verify`/`verify-formal` is **rate-limited ~5 req/min per app owner** (`429` = throttle, back off ~60s).

**Counterexamples are the fix loop.** Canonical patterns: (1) **null counterexample** — `x<=100 || x>100` looks tautological until a field is missing → make required or `!= null &&` guard (don't remove the check). (2) **`null == null` auth bypass** — `@newData.ownerId == @user.id` satisfied by an unauth caller writing `ownerId:null` → prepend `@user.id != null &&` (verifier suggests this verbatim). Never weaken the property to make the proof pass.

**Rule-property obligations:** `<action> rule is satisfiable` (dead-rule detection), `<action> requires authentication`, `field immutability`, `implication`/`equivalence`, `tautology`/`contradiction` (with witnesses), `read rule uses no getAfter()`, `ownership field exists in schema`, `<action> runtime safety` (divide-by-zero advisory). **Invariant obligations:** conservation algebra (delta-equivalence + induction), append-only rolling limit algebra (per partition), onchain epoch-bucket conservatism (bucket sum dominates exact sum → only over-enforces), tenant tag binding, tenant edge preservation, opt-in relationship-edge coverage / depth≤k / declared-graph induction, `combined declared DSL formal claim`. **Function-auth obligations:** `caller-scoped invocation` (no `actAs`) is a report entry; `actAs service identity is admin-gated` — an `actAs` function's `auth` must imply the admin predicate (over-permissive `auth:"true"`/`"@user.id != null"` disproved and **fails verify**).

**Two-layer coverage model.** **Layer A (rule properties):** proven once, enforced identically on realtime + onchain runtimes because the **same compiled bytecode** runs on both (no porting, no drift). **Layer B (invariants):** full offchain; verified subset onchain — `conserve` direct + `tenantTag` + `rollingSum` (epoch-bucketed) enforced; materialized/sharded conserve + `tenantEdge` **fail closed** (rejected at verify if claimed, rejected at runtime if metadata arrives). **Reach:** rules govern DIRECT writes + authorization (hooks bypass create/update/delete unless `enforceRules:true`; verify flags "rule authorization is direct-write-only" advisory when a scope has hooks without enforceRules). Invariants govern EVERY write surface on BOTH planes — unskippable. Onchain rolling caps use 64 epoch buckets in a circular array; conservatism is an SMT-proved obligation and the bucket mechanism is Kani model-checked (263-harness matrix; two earlier bucket formulas were refuted by Kani).

**What is NOT proven (honest limits).** Only **declared** constraints (green ≠ safe — an undeclared invariant isn't proven). Proofs are about policy + enforcement algebra, **not application code** (frontends/agents can be buggy, they just can't corrupt constraints). **Liveness not claimed** — rejecting all invalid writes is proven, accepting every valid shape is not. Rolling caps account exactly the events written to the declared scope (spending that bypasses it is outside the statement — see reserve-at-open below). Tenant isolation is about the declared relationship graph. **Functions are the only un-proven tier** (logic not proven; walls are). **Anti-cheat honest boundary:** SECURE/provable — state manipulation (server-authoritative tick, `update:"false"`), maphacks/wallhacks (fog-of-war per-player views), macro/turbo-fire (proven `rollingSum` per-player caps), forging inputs (append-only owner-attributed log). NOT FULLY SOLVABLE by anyone — **human-speed scripting** (an aimbot firing only legal inputs at human timing but superhuman accuracy sends nothing rules can reject; residual is a statistical/ML problem, best fed the tamper-proof log via webhooks; do not tell users Bounded "solves cheating"). NEVER SECURE — client-authoritative writes and client-reported results/leaderboards (`create:"@newData.winner == @user.address"` only checks self-naming; keep the result server-authoritative and read via the view).

---

## 4. Auth & access control

**Two identity systems.** Dev identity = an ed25519 keypair the CLI + `@bounded-sh/server` sign with; it **owns apps**. End-user auth = Bounded Auth or a wallet, surfaced as `@user.*`. Dev keypair is auto-created at `~/.bounded/credentials` (base58 `privateKey`, mode 0600) on first authed command — no login step. `BOUNDED_PRIVATE_KEY` (base58) overrides for CI. `createWalletClient({keypair})` carries its own signer (one process = many keypairs).

**End-user auth.** **Every human login goes through the hosted redirect flow** (OAuth2 + PKCE at `auth.bounded.sh`): `loginWithRedirect({redirectUri, provider?, methods?})` + `completeLoginFromRedirect()` (or `loginWithPopup`/`completeLoginInPopup`). Covers **email OTP, OAuth/social (Google/Apple/GitHub), and text OTP** through one chooser. Register redirect URIs (exact-match https; localhost for dev). ⛔ **No inline app-origin OTP** — `login()`, `authMethod:'email'`, `sendEmailOtp`/`verifyEmailOtp`/`sendTextOtp`/`verifyTextOtp` are retired (`403 hosted login must be started from the issuer origin`). **`user` object:** `{id, address:string|null, email:string|null, isAnonymous:bool}` — `@user.id` universal/stable, `@user.address` real wallet (null for email/social), `@user.email` verified/null, `@user.isAnonymous`. `authMethod` selects the identity system: Bounded Auth (default), `'phantom'` (Solana wallet, crypto opt-in — `@user.id == @user.address`), `'none'` (disable). (`'wallet'` not implemented.)

**SMS/text OTP** — opt-in, off by default, not exposed unless Bounded enables it + SMS configured. E.164 phone numbers; same posture as email OTP; phone-only users get `@user.id` but `@user.email == null`. Auth only — not consent for app-originated SMS/WhatsApp. React Native uses the same hosted redirect via system browser + deep-link `redirectUri`.

**Anonymous/guest accounts** (opt-in: `"auth":{"anonymous":true}` — off by default, else `signInAnonymously()` → `403`). A guest is a device-local non-extractable ed25519 keypair (XSS can sign but not read), durable across reloads, first-class `@user.id`. `logout()` keeps the key; `forgetGuest()` wipes it. Gate guests out with `@user.isAnonymous == false` (offchain-only; not `!`). ⛔ **No inline id-preserving upgrade** — a guest going real via `loginWithRedirect` becomes a **distinct `@user.id`**. Carry data over with **transferable ownership** (scope by `accountId`, store `owner`; `create:"@user.id == @newData.owner"`, `update:"@user.id == @data.owner"` — changing `owner` IS the transfer, auto-proven transferable-but-unseizable). Browser/RN only (needs `window`/localStorage); Node uses `@bounded-sh/server`.

**Two planes, no god-mode.** **Control plane** = manage the app (deploy policy/UI, collaborators, functions/secrets, billing, delete). **Data plane** = read/write app data, governed ONLY by `policy.json` rules+invariants — **no owner bypass; invariants bind everyone.** **Control roles** (preset bundles): `owner` (everything, one/app, transferable), `admin` (manage + act on data, not delete/transfer/roster), `developer` (read source + deploy policy/functions/UI — the **bounded-agent role**, renames legacy `policy`), `viewer` (read-only management + proofs), `billing`. Grant via `bounded share <email|wallet> --role ...` (works before the invitee signs up; email binds on verification). **Custom roles + atomic capabilities** in the `access` block: `app:view/settings/delete/transfer`, `access:manage`, `billing:manage`, `policy:deploy`, `functions:deploy`, `ui:deploy`, `ui:fork`, `code:read`, `cloud:prompt`, `cloud:apply`, `data:act`. `access.grants` = named subjects (`email`|`wallet`|`team:<name>`|account-id); `access.external` = whole-class opening (`widget`, `propose: signed-in|public`). **Platform super-admins:** app `owner`+`admin` (control) for platform ops; a flat provable `admins/$userId` registry + `authorityClosure` attestation for cross-tenant in-app super-admins.

**The bridge (control roster → data plane, no backdoor).** Runtime injects read-only role sets a policy can opt into: `/__owners__`, `/__admins__`, `/__developers__`, `/__viewers__`, `/__billing__`, `/__collaborators__`, `/__managers__` (owner + every collaborator + their linked wallets/devices). Keyed on `@user.id`, matched across account facets, **write-blocked** (no self-promotion). `get(/__admins__/@user.id) != null` = control-plane bridge (reserved, double-underscore); `get(/admins/@user.id) != null` = your own data-plane collection. Bootstrapping the first data-plane admin needs a **genesis clause** (`|| @user.id == @const.FOUNDER`) — `bounded data set` does NOT bypass create rules (owner is just another `@user.id`; a genesis set without the clause → `403`). `verifyAuthorityClosure` proves the admin set is closed under the founder (engine op, not yet a CLI `--operation`).

**Top-level `roles` block** — `{name:{members, read?, write?}}`, members matched on `@user.id`, `read`/`write` = `"*"` or `["collection",...]` (write covers create+update+delete). Additive grant on top of per-collection rules (never restricts); anonymous never granted a role. Verify surfaces every grant as an advisory (flags over-broad `*`).

**Service keys / backend identities.** A function declares `actAs:"<address>"` → transacts as a fixed service identity; policy authorizes it like any address (`@user.address == @const.PAYOUT_BOT`). `actAs` is admin-gated (its `auth` must imply admin). `session.live.runAs` = session-wide live-call identity (funds AI NPCs; declaring it IS the authorization). **Precedence for live calls: function `actAs` > session `runAs` > anonymous system.** Many service identities per app (one per role). **No private key stored for data-plane/AI writes** — the address is just what the function is authorized to act as. A real private key (a function **secret**, `ctx.env.NAME`) is needed only to cryptographically sign an onchain Solana tx. User-triggered privileged/conserved writes: split **CLAIM** (user-invoked, records an idempotent intent) from **SETTLE** (live-tick `runAs` re-derives every value from the trusted source, does the privileged `setMany`).

**`bounded link`/`share`.** `link` = OAuth device flow (or `--email` headless OTP) binding the keypair to an email account — keypair + email wallet become mutual admin-collaborators (the anti-loss move; never rolls the key). `share` adds a collaborator (email → auto-provisioned embedded wallet; owner-only). `bounded share --role`/`collaborators`/`unshare`/`access` manage the roster (CLI, not SDK).

**End-to-end testing authed apps.** Mint a real SIWS session via CLI (`bounded data get ... --json`, cached at `~/.bounded/sessions.json`), shape into two localStorage keys (`bounded_session_storage`, `bounded_last_auth_method:"email"` — the email provider's `restoreSession` just decodes, works headless), inject via Playwright `addInitScript` before page load → app boots logged in. Wallet/guest apps are fully headless; email-only can't read the OTP headlessly (give test builds a wallet/guest method). Node agents skip all this — use `createWalletClient`.

---

## 5. Data plane

`bounded data set/get/set-many/delete`, or SDK `set/get/getMany/setMany/delete`. Every write checked against rules + invariants **atomically, fail-closed, nothing partial**. **Failure semantics:** invariant violated → `409` + declared name + arithmetic; write rule denied → `403` + predicate trace; function invoke auth denied → `403` before body; **read rule denied → `200` with `{data:null}`/`{data:[]}` (silent hiding, NEVER `403`** — test read-denial with a known-permitted identity, don't wait for a read 403); update/delete on capped collection → `409 append_only`; verify fail at deploy → deploy fails, previous-good policy stays. Agent rule: `409` = state forbids it (back off, don't retry the same capped write); `403` = you may not (fix caller/payload). `bounded decisions [--denied-only] [--json]` reads a ~200-entry in-memory ring buffer of write decisions (owner/collaborator gated).

**Atomic `set-many`** — one transaction; every rule/invariant/hook passes for the whole batch or nothing commits (what makes `conserve` transfers usable). **Max 100 docs/bundle** (upserts + deletes combined; CLI preflights). **In-batch composition:** rules for entry N see staged results of 0..N−1 via `getAfter()` — guard + gated write travel atomically, no TOCTOU. Order matters (stage the guard first); `get()`=pre-batch, `getAfter()`=staged; distinct paths per entry; invariants evaluated over the whole batch. **Append-only caps** reject update/delete (offchain + onchain); fresh id per event, idempotency from your ids. **Delete = `set(path, null)`** (no separate `del`; routed through the `delete` rule; default scaffold `"delete":"false"` blocks it; CLI uses `bounded data delete`). **Server-resolved field values:** `increment(n)` (atomic server-side, serialized — 20 concurrent `increment(1)` = exactly 20; starts from 0), `serverTimestamp()` (server Unix-seconds clock, unforgeable, prefer for any policy-read timestamp). Time helpers `now()`/`toSeconds()`/`toMillis()` avoid the seconds(policy)/ms(JS,`_createdAt`) 1000× trap.

**Queries (runtime, not proven — read rule always enforced).** `get(path, {filter, sort, limit, cursor, shape, prompt, includeSubPaths, bypassCache})`. Single-doc `get` → the doc or `null` (never an envelope); collection `get` → `{data, nextCursor}`. Every row carries `_id` (full path) + `id` (bare leaf key — use for React keys/child paths); `docId(path)` helper. `getMany(paths)` batch-reads. **Filter operators** (MongoDB-style): bare=equality, `$ne $gt $gte $lt $lte $in $nin $regex(+$options) $exists $not $type $and $or $nor`; array ops `$all $size $elemMatch` (array field matches by containment). `sort:{field:1|-1}`, `limit`, `cursor` (opaque, stable under concurrent writes; loop until `nextCursor` null — no separate `getPage`). `prompt` = AI/NL alternative to `filter` (fails 422 if untranslatable, doesn't fall back to whole collection — prefer `filter` for load-bearing reads). **Aggregations:** `count`/`aggregate(path, op, {field?, filter?})` → `{value}` (`count`/`uniqueCount`/`sum`/`avg`/`min`/`max`); `queryAggregate(path, {groupBy?, count?, sum?, avg?, min?, max?}, {filter?})` → one row per group. Read rules enforced (owner-scoped collection sums only caller's rows — no cross-tenant leak). **Policy `queries`** — named typed expression computed from the doc, proven at deploy (`{returnType, query}`), invoked via `runQuery`/`ctx.bounded.runQuery`. **Joins:** `links` (top-level FK edges, source field ends in `Id`, `{from, to, unique?, reverse?}`, expand with `shape`), `relationships` (per-collection, incl. many-to-many via `through`), both read-rule-enforced (unreadable expansions omitted, never leak). Authorization joins = `get()` in a rule.

**Files — `type:"storage"`.** Each doc is a blob addressed by path, same `rules` auth. `setFile(path, file, {metadata})` uploads bytes + sets declared fields atomically (create-only; system metadata `contentType`/`size`/`status`/`uploadedBy`/`createdAt` auto-filled, passing them = 400; validated against declared `fields`, lands in `@newData` for the create rule). `getFiles(path)` → `[{path, url (short-lived signed download), metadata}]`. `file=null` deletes. Offchain only.

**Search — `search:{fields:[...]}`.** Declares full-text-indexed `String` fields (maintained index). Without a `search` block, `search()` falls back to an in-memory full-doc scan (small collections). `search(path, query, {fields?, limit?, cursor?})` — case-insensitive, read-rule-enforced per doc, combinable with filters/paging.

---

## 6. Functions & backend runtime

**Decision hierarchy (most→least proven): rules+invariants → hooks → functions.** Use the least-powerful tool. The deciding question: *does the logic have to LEAVE the boundary?* (external API, secret, imperative multi-step) — No → rule/invariant/hook; Yes → function. Re-implementing access control or a cap *inside* a function is the anti-pattern (un-proven, bypassable) — push authz to the `auth` rule, constraints to invariants.

**Functions** = the only un-proven tier (imperative escape hatch). **Proof boundary:** (1) every write goes through `ctx.bounded` → re-checked by rules + invariants (a violating write → `409` throws; **cannot break an invariant**); (2) invocation policy-gated by the `auth` expression (same engine, before the body runs, deny → `403`). Function *logic* is NOT proven. Declared in the top-level `functions` block: `{auth (required), entry (required, relative TS/JS path, no `..`), timeout (1–300s, default 30), secrets, actAs, logsAuth}`. Caller-scoped functions write as the verified caller; `actAs` functions write as a service identity and must be admin-gated.

**`ctx` API:** `ctx.user` (verified caller `{id, address, email, claims, system?}`), `ctx.auth` (`{enforced, rule, system}` — authz already done), `ctx.bounded` (`get`/`set`/`setMany`/`delete`/`runQuery` — writes re-checked; `setMany` atomic), `ctx.env` (resolved declared secrets), `ctx.secrets.get("NAME")`, `ctx.ai`, `ctx.services`, `ctx.appId`, global `fetch`. **`ctx.ai.run(model, input)` — real AI, NO API keys.** Routes any model through the Bounded AI Gateway, billed to the **app owner's AI/external-services bucket, capped fail-closed** (over budget → denied, never a surprise bill); a failed inference is refunded. `model` is config (swap models codelessly); `input` is the provider request shape (`{messages:[...]}`). Cap per-user/app AI spend provably with an append-only `rollingSum` spend event. **`ctx.services` — managed third-party API discovery/invoke:** `search(query, {limit?})`, `describe(toolkitOrSlug, {limit?})` (build-time/agent planning — also `bounded services search/describe --json`), `invoke(toolSlug, args, {entityId?})` (cost-bearing runtime call through Bounded's managed provider proxy; bills the AI/external-services bucket at **upstream service cost + 5%**, standard/pro tiers itemized separately; fails closed). If a provider key isn't configured → `provider_key_not_configured` (discovery still works; enable it or integrate directly with `fetch`+`ctx.secrets`, opting out of the markup).

**Invoke:** CLI `bounded functions invoke <name> --data '<json>'` (attaches session token) or TS `functions.invoke(name, args)`/`invokeFunction`/`vault.invoke` (attaches token; throws `FunctionInvokeError` with status). Deploy: `bounded functions deploy <name> --entry ... [--auth ...] [--timeout ...]`. `console.*` captured; viewers gated by `logsAuth` (defaults to managers; secret values redacted).

**Three principal contexts for one function:** user invocation (gated by `auth`), system/scheduled run (`@user` all-null, skips user auth), live game `call` (gated by `session.live.calls` whitelist AND the function's `auth` with `@user`=live principal + `@origin` populated). `@origin`-gating (`@origin.kind == 'live' && @origin.module == '<game>'`) is a proven obligation.

**Hooks** (in-boundary side effects, rung 2 — no external calls/secrets, writes still answer to invariants). `hooks.offchain.<create|update|delete>` call `@DocumentPlugin.putDocument(path, data)` / `updateField(path, field, value)`. **Hooks never gate** (no throw; authz→rules, correctness→invariants). By default a hook **bypasses per-actor rules** (privileged server logic) — `enforceRules:true` (collection or hook group) holds it to a caller's rules. **`enforceRules` relaxes rules, never invariants** (a hook can't mint/break conservation/exceed a cap). Only `updateField` is privileged-bypass; `putDocument` always re-checks its destination's create/update rule. `updateField` is a SET not increment (use client `increment()`); `@time.now` doesn't resolve in a hook (use client `serverTimestamp()`). Onchain plugins (`@TokenPlugin.transfer`) only in `hooks.onchain` on `onchain:true` collections.

**Scheduled functions & hooks.** `schedule:{every, run}` (or an array) fires `run` on a cadence; `run` names a `hooks.scheduled.<name>` bytecode hook **or** a top-level `functions.<name>` (fires now — can leave the boundary; add `actAs` so writes satisfy owner rules, else all-null system can't bill AI/satisfy `owner==@user.id`). `every` = `<n>s|m|h|d` (1s–366d). Deploy-order: deploy the function before/with the schedule (self-heals on re-deploy). Schedules offchain-only. `dueRows:{run, onComplete?, doneField?}` = one-shot timers on a `scheduledAt` (Unix-seconds) field, fires once when due then delete/markDone (a function target fires but doesn't yet get the row id — use a scheduled hook for per-row cadence).

**Webhooks** (outbound notify-out, read-only fan-out). `webhooks:[{url (https), on:[create|update|delete]}]`. POSTs a typed JSON event (`{id, appId, path, relativePath, operation, document, previousDocument, timestamp}`) within seconds, **signed with Bounded's Ed25519 key** (asymmetric, no shared secret): headers `X-Bounded-Signature` (base64 over raw body), `X-Bounded-Key-Id` (rotation), `X-Bounded-Timestamp`. Public keys at `GET <base>/.well-known/bounded-webhook-keys.json`. **`verifyWebhook(rawBody, headers, {keysUrl?, maxSkewSeconds?})`** (from `@bounded-sh/server`) fetches/caches the key, checks the signature over the raw body, enforces skew, returns the typed payload or throws `WebhookVerificationError`. Never act on an unverified body; mutate Bounded state only through a `@bounded-sh/server` client (re-checked).

**Backend runtime (Tier 2 graduation)** — for long-running/multi-step work, persistent agent state, custom npm deps, coordinated schedules. Project = `bounded.manifest` (`{name, kind:"agent"|"backend", entry, dependencies, allowedHosts (egress allowlist), aiCapUSD, secrets}`) + TS entry. `kind:"agent"` exports `onInvoke(input, ctx)`/`onSchedule(name, ctx)`; `kind:"backend"` exports `fetch(req, ctx)` served at `<slug>-api.bounded.page`. **`ctx` surface:** `bounded`, `store.get/put` (small app-scoped state), `ai.run`, `services.search/describe/invoke`, `secrets.get`, `fetch` (allowed hosts), `schedule` (`ctx.schedule.every`), `identity`, `log`. `bounded runtime init/deploy/info/invoke`. Deps cooldown-resolved + bundled. **Graduation is mechanical** (same sealed-ctx wrapper). Tier 3 = eject to your own server (`@bounded-sh/server` — you lose managed compute guarantees but data+invariants stay in Bounded; you act as one service identity, email/account-id callers can't be a server signer, you own auth/secrets/scheduling/logs). Long-running rule: split into resumable idempotent scheduled steps, write progress before scheduling the next, stop when complete or the cap/bucket is exhausted.

**Secrets.** Two halves: DECLARE the name (`bounded.manifest` `secrets` / function `secrets` block); SET the value (`bounded secret put NAME --value-stdin --app-id <id>` — per-app store, write-only, `list` shows names only, ≤8KB, ≤100/app, `[A-Za-z_][A-Za-z0-9_]{0,63}`). Read via `ctx.env.NAME` or `ctx.secrets.get("NAME")`. **In-process** (bare name) = code reads the value. **Egress-bound** (`{name, egress:"host"}` = `Authorization: Bearer` default; override `header`/`scheme`/`in:"query"`) = the runtime injects it on outbound `ctx.fetch` to that host; **the value never enters your code** (`ctx.secrets.get` returns null) — best for third-party keys, injection-safe. `uses:[...]` for both (footgun: adding `"in"` re-exposes it). Per-app, isolated; set once, read by every function/component; rotate anytime with no redeploy.

---

## 7. Realtime / live

Every collection is **live** (subscriptions/live queries for free). **React `useQuery(path, opts?)`** → auto-updating `{data, loading, error}` (data = full read-rule-filtered current set, re-renders on any change; `path=null` skips; same filter/shape/sort/limit/prompt as `get`). Imperative **`subscribe(path, {filter, shape, limit, cursor, prompt, onData, onError})`** → single-doc = doc-or-null, collection = a **plain array** (not `get`'s paged envelope; no `sort` — event-ordered) re-delivered whole on every change. ⚠️ **`onData` fires REPEATEDLY** — never treat the first call as final (a peer's later write arrives in a later call; render/merge every call). Rows carry `_id`+`id`; read rules enforced per delivered doc. CLI `bounded subscribe <path> [--once --timeout --filter --limit]` (concrete doc or collection, NOT a `$var` template).

**Two mutually-exclusive tick runtimes per session.** **(a) bytecode `session.tick`** — a `hooks.tick.<name>` reducer + `settleFrom`/`settleTo` settlement (simple counters/timers). Keys: `tick.everyMs` (20–60000), `tick.run`, `tick.maxLifetimeSec` (1–86400), `checkpointSeconds` (1–3600), `settleTo` (durable template outside room subtree), `settleFrom:{collection, field, op:"sum"|"last", as?}`, `settleRule?`. **(b) native `session.live`** — upload a TS module of **three pure functions** (`bounded live deploy <m>.live.ts`): `init(seed)` optional (initial state; `seed.room` = the room's own creation doc — deterministic boot config; runs once at cold start), `tick(state, intents, dtMs, ctx)` required server-authoritative (`intents=[{userId,intent}]` Bounded-ordered; `ctx={presence:userId[], tick}` — evict disconnected players; returns next state), `views(state)` optional → `{[userId]:view}` per-client projection. Types stripped at upload; single self-contained file; return rich views as `{stateJson: JSON.stringify(view)}`. `session.live` fields: `module` (required), `everyMs` (20–60000, ~33≈30Hz), `maxLifetimeSec` (1–86400, required), `snapshotEveryTicks` (1–600), `runAs`, `calls` (function whitelist). Valid only on `ephemeral`/`checkpointed` (never durable/onchain). `secrets` not supported for live modules (route to a function).

**Snapshot vs checkpoint** (distinct): snapshot = live runtime saves state every N ticks (survive churn, bound replay loss; not a proof artifact); checkpoint = on cadence, authoritative state folded **through invariants** into the provable store (durability + replayability + proof; only on `checkpointed`). Per-client `view/$userId` is **always ephemeral** (read `$userId == @user.id`) — **structural fog-of-war**: hidden info is never written to a view it doesn't belong to (patching the client reveals nothing). Symmetric rooms may write a `*` spectator key; fog-of-war rooms must omit it. **act-vs-see-vs-state triad:** `session.intentRule` (who may ACT — send intents; absent → denied, no read-rule fallback), read rules (who may SEE), invariants (what the authoritative STATE may be — declare on the authoritative collection, never a view).

**The `call` primitive.** `tick` is pure/synchronous/egress-disabled (no `get`/`fetch`/sign). To reach out: `return {state, call:{fn, args, as?}}` (or `calls:[...]`). `fn` must be in `session.live.calls`; the function's `auth` rule IS evaluated (`@user`=live principal, `@origin` populated). `as` is a validation hint, NOT an identity override. **Result comes back via the reserved `@effect` address** on a *later* tick (checkpoint cadence, short delay — not instant): match `i.address === "@effect"` + your `effectId` and dedup. **Forgery foreclosure:** a client intent may never carry `@effect`/`__effect` → rejected `403`; only Bounded delivers effect results. **AI NPCs = the tick calls a function** (no NPC primitive). Fund with `session.live.runAs` (a service wallet the owner funds with AI/external-services credit — every live call runs as it, `ctx.ai` Just Works capped at the app account); gate the NPC function with `@origin.kind=='live' && @origin.module=='<game>'`. Anonymous system principal can't bill AI (`402`). Caveats: delayed not instant; dedup on `effectId` (at-least-once); cap NPC rate (`npcShouldSpeak`, one `pendingRef` in flight). Alternative: an **external agent joins AS a player** (`@bounded-sh/server` keypair `subscribeView`s + `live.intent`s — its keypair is its `@user.id`, bills its own AI, gated by `intentRule`).

**Netcode (game feel).** Intents ride the **same WebSocket** as `subscribeView` (one persistent connection; first `join` may fall back to HTTP). `live.intent` awaits ack (a deny **throws** — use for join/ready/leave); `{fireAndForget:true}` skips the ack for high-frequency idempotent input (movement/aim). Playbook: send input only on **change** + throttle (server keeps applying last input); **interpolate remote players** ~100–180ms in the past (only continuous fields, never `hp`/enums/bools); **predict the local player** with the server's movement model + reconcile (soft for small drift, snap for knockback/dash/respawn — fog-of-war gives you only your own authoritative state, exactly what you predict). `session.intentRule` gates ACT separately from SEE (fail-closed). Scaling ceiling is **fan-out** (N views/tick): area-of-interest views (biggest lever, = fog-of-war), delta encoding, relay-tier fan-out, UDP-style transport only at twitch scale; one authoritative sim per room (shard by region/room). Hibernation reconnects (Cloudflare WS Hibernation) are transport, not policy denials. **Reconnect just works** (keyed by stable id — resubscribe, resumes mid-match); guard `join` idempotently by principal or a reconnect duplicates the player; `ctx.presence` = "has an open socket" (instant on clean tab-close, seconds on hard crash).

**Live status.** `GET /live/status?path=<room>` (no auth) / `POST /live/intent` (auth) / SDK `live.status(roomPath)` / `bounded live status <room>` → `{available, started, running, tick, module, etag, stopReason, generation, connections, lastTickAt, nextAlarmAt}`. `live.intent`/`live.subscribeView` re-arm a parked room; a terminal stopped room cold-starts a fresh generation. Cold start takes ~seconds (show a "starting" state); keep-warm with an idempotent low-cost `{type:"ping"}`. **Lobby/discovery:** live rooms aren't listable — use a separate durable index collection (`subscribe`/`get` normally). **Recording results:** the tick-decided winner is server-authoritative (room is `update:"false"`) — read it via `subscribeView`, never `get()`/`subscribe()` the room doc. Cross-room settlement: tick `call`s a settle function (runs as `runAs`/`actAs`, writes the shared durable collection); never trust a client-provided winner.

---

## 8. Live-edit

Change a running app from feedback/NL via the **local daemon** (`bounded dev` / `bounded dashboard`) serving the live-edit API at `http://127.0.0.1:8085` (web UI at `:8008`). **Keep the daemon running** — it's the loopback backend that lists apps, proxies owner-gated reads, runs local edit jobs, flips site privacy, builds, and deploys without the browser holding a key; if down → "daemon not reachable". Deployed HTTPS pages must NOT depend on background localhost (strict Chrome/Safari block public→localhost) — private sites use normal cloud sign-in.

**Register:** `bounded live-edit register --app-id <id> --repo . --origin https://<slug>.bounded.page [--scope app|app+policy --artifacts on|off --source-provider auto|github|artifacts|none --artifact-push on|off --edit-mode canonical|variant --build-command --frontend-dir --dist-dir]`. Scope `app` = app code only (policy read-only, default); `app+policy` = both editable. **Agent loop (`/apps/:appId/...` API):** GET `/apps`, `/apps/<id>`, `/access`, `/policy`, `/feedback` → POST `/propose {instruction, editMode}` (returns `external-agent` mode if no daemon `agentCommand`; otherwise runs in a staged workspace, applies only a passing diff back) → POST `/validate {jobId}` (stop + refuse if it fails, name the `violatedInvariant`) → POST `/deploy/<jobId>` → GET `/jobs/<jobId>`. **Scope gates** at `app`: never edit `policy.json`, `bounded.json`, `.bounded/app.json`, `.bounded/credentials`, `.env*`, `*.key`/`*.keypair.json`, or `rootConstraints` paths. **Widget** (`<script src=".../widget.js">`): animated Bounded-mark launcher opening Prompt / Dashboard / Non-negotiables tabs + an always-visible **privacy toggle** (`GET`/`POST /site-privacy`, owner-gated); reads `policySummary`, mints a widget session, runner selector (codex/claude/opencode/pi). **Cloud live-edit** — in-page deployed experience (browser → mapped origin `/__bounded/widget/...`; Bounded edits server-side against synced source, bills the AI/external-services bucket, publishes a frontend variant); gated on app-scoped sign-in + not opted out of source tracking + current synced source + availability + AI allowlist + bucket room. **Variants** = frontend-only branches (can't grant backend permissions or bypass policy). **Rollback:** `bounded site variants` / `site rollback --variant` / `site promote`; static hosts versioned by the router. **Safety language:** Tier-1 invariants are enforced below app code; `app`-scope edits can't remove them; `app+policy` can change invariants (guarantee changes only after the new policy verifies + deploys); rendered behavior/copy/gameplay are not proven.

---

## 9. Hosting, domains & analytics

**Frontend hosting** — ship a built **static** frontend (`bounded site deploy ./dist --app-id <id>`; must contain `index.html`; replace-deploy prunes stale; caps 25MB/file, 100MB total, 5000 files; live in seconds). **Serves files exactly as uploaded, never executes them.** ✅ Vite/CRA/plain, SPAs (extensionless routes → `index.html`), Astro/SvelteKit/Nuxt static, Next.js static export. ❌ anything needing a server at request time (Next `next start`/SSR/ISR/RSC/API routes/middleware, Remix, SSR frameworks, Express/PHP). Bounded way: static UI + policy for data + function/backend-runtime for server logic. New CLI apps default to a **private hosted-site gate** (owners/managers/collaborators pass with Bounded login; `--public` to opt out; `bounded site privacy private|public|status` or the widget toggle; applies to slug + custom domains, not API hosts). Variants: `--variant <id> --variant-label`; preview via `/__bounded/preview?variant=<id>`. **`ogRoutes`** — per-route social cards: `[{path:"/s/:id", collection:"snapshots/:id", title:"$.title", description, image, defaultTitle/Description/Image}]`; Bounded fetches the doc **as an anonymous reader** (your read rule is the authority — non-public fields can never leak into meta) and stamps OG/Twitter/`<title>` tags server-side; path-based only (not `#hash`), fail-open to the generic card.

**Domains.** Two mapped subdomains on one SSL: `<slug>.bounded.page` (static site, SPA fallback, content-hashed assets cached immutably) and `<slug>-api.bounded.page` (backend runtime, no CORS dance). **Vanity slug (free):** `bounded domains slug <name> --app-id <id>` (globally unique; one canonical/app; reserved labels + raw-appId shapes rejected; auto-added to `allowedOrigins`; `--release` frees). **Agents: claim a slug by default** immediately after `deploy --create` (never route users to raw app-id hosts). **Custom domain (Pro):** `bounded domains add app.yourdomain.com` → prints CNAME + ownership/SSL TXT records; `list` flips pending→active once DNS propagates + cert validates; `remove`. Frontend only (API via the Bounded API host); inherits the privacy gate; if the owner loses Pro, links may be removed/disabled (keep the vanity fallback); apex needs CNAME-at-`@` or Cloudflare flattening. Unmapped hosts 404 (fail-closed — a domain never serves the wrong app).

**Per-app analytics** — every hosted site gets **privacy-respecting product analytics free** (no script to add, no cookie banner, keyed by appId). (1) **Edge request tracking** (server-side, automatic — status family, bucketed path, country, colo, browser, device, bytes, duration; works for non-JS/bots). (2) **Client RUM** (~6KB auto-injected into served HTML only): `page_view`/`route_view`, `performance` (Core Web Vitals FCP/LCP/INP/CLS/TTFB + engaged seconds), `js_error`/`unhandled_rejection`/`resource_error`/`api_error`, `custom_event` (`window.BoundedAnalytics.track`). Privacy: FNV-hashed visitor/session ids, path bucketing (`:num`/`:id`/`:redacted`, query/fragment dropped), secret/PII scrubbing on errors. Read: `GET /app/:id/analytics?range=1h|6h|24h|3d|7d&metric=all|summary|timeseries|pages|errors|devices|countries|referrers&limit=1-50` (owner/collaborator gated) → summary/timeSeries/topPages/errors/devices/countries/referrers. Additive/fire-and-forget (never affects what visitors are served); lags writes by seconds to minutes; counts are sample-weighted estimates.

---

## 10. Onchain (Solana)

Default is **off-chain** (`realtime_offchain` — fastest, no wallet signing, full feature set). Going onchain = two decisions that must agree: deploy on an onchain **protocol** (`realtime_devnet` / `realtime_mainnet`) AND mark **each** onchain collection `"onchain": true`. **What changes:** a write/delete is a **real Solana transaction signed client-side by the user's own wallet** (Phantom — Bounded never holds the user's key; returns the tx signature; delete = tx with null body); docs are program accounts/PDAs; field types map to onchain (`UInt`→u64, `Int`→i64, `Address`→32-byte pubkey; **no `Float`**); data is **public** (`read:"true"` required); rules may reference **only `@user.address`** (`@user.id`/`@user.email`/`@user.isAnonymous` rejected). **Eventual-consistency mirror** — reads run seconds behind; **don't read-after-write to confirm** (trust the returned signature or `subscribe`; an old value after a signed write is the mirror lagging, not a failure). **`0xbc4` gotcha:** on an onchain-protocol app, forgetting `"onchain":true` is a hard `AccountNotInitialized` failure (write routed on-chain but collection never registered), not a silent fallback — mark every collection (deploy warns unflagged ones; on `realtime_offchain` the reverse warning fires). `--skip-preflight` (onchain-only `set`/`set-many`) skips RPC preflight so failing txs still land. **Mainnet policy updates need a human-signed authority permit** — frictionless agent signing not currently supported (deliberately human-gated); off-chain/devnet apps update policy with no signature. Proof coverage onchain = same rule bytecode both runtimes; invariant subset (`conserve` direct, `tenantTag`, epoch-bucketed `rollingSum` enforced; materialized/sharded conserve + `tenantEdge` fail closed).

**Trading (real, shipped — Phoenix + DeFi DEX e2e tests).** A trade = a document write to an `onchain:true` collection whose `hooks.onchain` invokes a plugin function; Bounded builds and **server-signs** the Solana tx (app sponsor wallet pays gas, escrow PDA is the trading authority). First arg is `source` (custody): `@contract.address` = **server custody** (escrow PDA, autonomous desk, no per-order signature — the model for trading agents/desks/treasury/DCA bots) or `@newData.source` = user's own wallet (client-signed). **`@PhoenixPerpsPlugin`** (leveraged long/short, collateral PhUSD, sizes in base lots, `subaccountIndex` 0=cross / 1–100=isolated): write fns `registerTrader`/`emberDeposit`/`emberWithdraw`/`depositFunds`/`withdrawFunds`/`placeLong`/`placeShort`/`closePosition`(side 1=close long, 0=close short)/`transferToIsolated`/`transferToCross`/`syncParentToChild`; read fns `getMarkPrice`/`getPositionSize`/`getUnrealizedPnl`/`getCollateralBalance`/`getPortfolioValue`/`getPhUSDBalance`/`hasPosition`/`isRegistered`. **`@DeFiPlugin`** (spot swaps + LP, Meteora/cp-AMM): `swap`/`getSwapQuote`/`getMeteoraSwapQuote`/`swapInMeteoraVirtualPool`/`createPool`/`addCpAmmLiquidity`/`removeCpAmmLiquidity`/`getPoolAddress` (`@TokenPlugin.SOL`/`USDC` built-in mints). Plugin bodies are trusted; guardrails go on the collection (rules for who/what/where, `rollingSum` loss cap).

**Reserve-at-open loss cap** — making the proven cap bind the *real* onchain loss. A naive daily-loss `rollingSum` only caps the loss rows your code chooses to write at close (a crash/skipped writeback escapes). Fix: for an **isolated-margin** perp, the committed margin IS the max the position can lose (`realized ≤ margin`), so at OPEN append one proven write reserving that margin as worst-case loss in the **same atomic `setMany`** as the `hooks.onchain` order — the cap rejects the batch (and the order) *before the trade exists*; at CLOSE reconcile realized (≤ reserved) into the same window (window can only shrink). PROVEN: no accepted sequence of opens over-reserves per desk, so `realized ≤ reserved ≤ cap`. TRUSTED: the plugin body building/signing the tx. RESIDUAL (integration test, not SMT): that the hook fires and the fill matches on a real market.

---

## 11. Billing

Hard, **fail-closed** limits — an app can't silently become an unbounded bill; cost-bearing work must fit **both** plan limits AND the relevant bucket/app cap. **Two user-visible buckets:** (1) **AI/external-services** — `ctx.ai` + Bounded-managed third-party service proxies; (2) **Bounded infra** — metered platform usage at public rates. **Free** = $0.50/month AI/external-services trial credit, **cannot top up** (upgrade when exhausted); plus a platform-wide rolling free-abuse cap ("free usage paused"). **Pro ($25/mo)** = $5/mo AI/external-services + $30/mo Bounded infra starter credit, **can top up** eligible buckets (`bounded billing checkout --plan services_topup|infra_topup`; `--plan pro` for the subscription; `billing status`/`portal`). Custom domains are Pro-gated. Project creation is account-scoped: **Free = 1 project, Pro/Enterprise unlimited** (`project_limit_exceeded`/`dimension:"maxProjects"` → don't retry; if the key is unlinked, recommend `bounded link` so CLI key + web account share one limit; upgrade to continue).

**Transparent fees (exact public rules):** managed third-party service proxies = **provider cost + 5%** (applicable upstream standard/pro tier first, then the 5% markup; opt out by integrating the provider directly with your own keys — then no markup). **Bounded Pay = 1% platform fee on top of Stripe's own processing fees.** **Limit-error handling (`429`/`402`/usage error with `dimension`/`usage`/`limit`/`projectedUsage`):** don't retry blindly; name the exact exhausted axis; explain reduce-volume / delete-export / upgrade / top-up / adjust-cap. Axes: request operations, datastore reads/writes, file reads/writes, storage, resident compute, AI/external-services bucket, free AI pool, Bounded infra bucket, app-level spend cap. Alert levels: `warn` (approaching), `critical` (urgent action), `exceeded` (blocked). Re-check usage after bulk imports, large `setMany`, uploads, live-room tests, function/AI loops. Don't invent thresholds — use the returned snapshot.

**Bounded Pay** (managed Stripe Connect card payments without Stripe keys in app code). Host `https://host.bounded.sh`. Flow: seller `POST /connect/onboard` (Bounded JWT → `onboardingUrl`; one Stripe Standard connected account per Bounded identity, not per app) → poll `GET /connect/status` until `chargesEnabled` → buyer `POST /connect/checkout` (→ `{url, sessionId}`, redirect to Stripe Checkout, store a pending order keyed by `sessionId`) → success URL `?sessionId=cs_...` → app function `claimPurchase` calls `GET /connect/session?id=...` server-side, verifies `paid`/buyer/merchant/amount/currency, writes an **idempotent** claim through policy → a trusted settlement function grants credits/entitlements (`conserve` for money-like, `rollingSum` for grant caps). **One-off checkout only** (`mode=payment`) — no seller subscriptions, **no per-app webhook fan-out** (Bounded's Connect webhook is for its own bookkeeping/split-transfers); for subscriptions/lifecycle webhooks integrate Stripe Billing directly. Split mode keeps the Bounded seller id (`merchant`) separate from Stripe account ids. `bounded connect onboard/status/checkout` for manual smoke tests. Direct-provider path: same claim-and-settle with your own server verification; never grant value from a client-submitted amount/status without provider verification. Bounded's own account billing (`bounded billing`) is a separate surface from app end-user payments.

---

## 12. Flue agents, key safety & misc

**Flue agents** (multi-step tool-use loop, `bounded-flue@2026.07`) — for a backend AI loop that keeps state, calls tools, reads results, continues across turns, uses Bounded data/AI/secrets/schedules + managed third-party APIs as tools, bounded by usage limits. Pattern: model durable state in collections; give minimal tools; `ctx.ai.run` for capped model calls; `bounded services search/describe --json` at build time, wrap `ctx.services.invoke` as a narrow runtime tool (bills AI/external-services bucket at cost+5%, fails closed, `provider_key_not_configured` → pick another or integrate directly); idempotent tool actions; re-check usage after loops. Deployed via the backend runtime (`bounded runtime deploy/invoke`).

**Key & account safety.** `~/.bounded/credentials` is a base58 64-byte Solana ed25519 secret (mode 0600 in 0700 dir), auto-generated on first authed command, **never shown/backed-up**, and **owns every app you create**. Lose it without linking/sharing/backup → apps are **unrecoverable** (no password reset, no transfer-ownership, no key-recovery command). **Key resolution precedence (first match wins):** `BOUNDED_PRIVATE_KEY` env → `bounded.json` profile (`~/.bounded/accounts/<profile>/credentials`) → project (`<project>/.bounded/credentials`) → global (`~/.bounded/credentials`). Public markers `bounded.json` (`{appId, name, environment, protocol, policy, liveEdit, account}`) and `.bounded/app.json` (`{appId, owner (pubkey), ownerKeySource, sitePrivate, linkedAccount, createdAt}`) are **safe to commit** (never the key); `deploy --create` writes a managed `.gitignore` block (ignores `credentials`/`*.key`/`*.keypair.json`/`.env*`, keeps markers committable). **Three anti-loss mechanisms, all before the loss:** `bounded link` (day-one — binds keypair to email account as mutual admin-collaborators, apps reachable from the web account; never rolls the key), `bounded share --role admin` (backup owner per app), or back up the credentials file. On a new machine, reuse the SAME key or link both to one account — don't let the CLI silently spawn a second identity (a different account can't see the first machine's apps).

**Quality checklist (before deploy).** A policy that verifies clean can still be **hollow** (compiles but a money/quota/tenant property has no invariant — nothing protected) or **leaky** (a write rule satisfiable by an unauth/wrong caller). Checks: every collection has explicit read/create/update/delete; every write rule leads with `@user.id != null`; ownership/role actually checked not just referenced; sensitive reads scoped (not `read:"true"`); identity uses `@user.id` not `@user.address`; no accidental `"true"`/dead/unsatisfiable rules (but `"false"` on immutable/append-only is correct); every money field under `conserve`, quota/rate under `rollingSum` (+`scopeVariable`), multi-tenant under `tenantTag`+`tenantEdge`; invariants named; types match (`rollingSum`→UInt, tenant tag→String, set-once→`!`, optional numeric fields null-guarded); `durable` for invariant-protected; onchain only where needed, no `onchainSupported` overclaim; webhooks verified with `verifyWebhook`; verify reports 0 failed, every DISPROVED fixed by strengthening (never weakening), re-ran verify after the last edit. **Is the product real?** — core value real not `Math.random()`, AI features call `ctx.ai.run`, integrations wired or plainly deferred, money through real rails — proofs make a real app unbreakable but don't make a stub real.

**Capability boundaries.** Great for: provable realtime backend, money/value safety, multi-tenant isolation, agent backends, realtime games, onchain power-ups, imperative escape hatch. Does NOT support: **no native iOS/Android SDK** (ship via React Native + `@bounded-sh/client`), **no native-binding compute** (use your own server as a `@bounded-sh/server` client), **long-running/batch** (the 300s wall is Functions-only — use backend-runtime resumable steps or a Flue loop), no `@constants`/built-in roles in rules, no array/object fields, no ternary, `/` reserved. **Scale ceilings:** each app has a **single-writer consistency boundary** for atomic invariant enforcement — throughput is bounded by the single writer; scale horizontally by **tenant-sharding via path design** or separate game rooms; a write-hot `conserve` total can use `materialization:"sharded"`. **SDK: beta** — `@bounded-sh/client` (browser/RN), `@bounded-sh/server` (Node ≥18, keypair client + `verifyWebhook`), `@bounded-sh/core` (transitive); operation surface stable in shape, versions pre-release.
# Cross-Repo Synthesis: What's Real, What's Not, and Where the Leverage Is

> This section is the honest, editor's-eye reconciliation across all six repos. It
> exists so the seeded AI (and you) can tell **shipped reality** from **aspiration**
> without re-deriving it. Read this before trusting any single claim on the site.

## A. The one-paragraph truth

Bounded is a **genuinely novel, largely-built provable realtime backend**. The
differentiator — declare a backend as `policy.json`, prove invariants with Z3 at
deploy, enforce them atomically at runtime — is **real and running**: the proof
engine (nearley grammar + `z3-solver` in `packages/cdk/layers/schema`), the runtime
data plane (the ~27K-LOC `realtime-worker` Durable Object), the auth issuers, the
functions dispatcher, live/realtime rooms, hosted sites, Bounded Pay, and the Go CLI
all exist and are dogfooded. The audit trail is unusually **honest and
evidence-driven**. **Bind** — the prompt-to-app orchestration layer on top — has a
**solid, tested engine core** (resumable gated workflow, budget ledger, event
sourcing) but is at **"ready for a single integrator," not multi-tenant resale**:
its own audits say so. Nothing is live to the public yet; there are **no users**.
The gap between the two is the opportunity: Bounded is closer to production than Bind,
and Bind is the story that makes Bounded exciting in an agent-driven world.

## B. Where the real engine actually lives (a naming trap to fix)

The brief implied `packages/tarobase-core`/`tarobase-server` were the engine. **They
are not** — they are the **client SDK** (`@bounded-sh/core` + `@bounded-sh/server`,
production-grade wire contract/transport/auth/Solana signing). The **actual engine is
in `packages/cdk`**, which despite its name is **not AWS CDK** — it is a Cloudflare
Workers + AWS-Lambda-layers + Fly.io platform:

| Real engine component | Location | Maturity |
|---|---|---|
| Policy grammar + compiler + **Z3 proof** | `packages/cdk/layers/schema` (nearley + `z3-solver`) | [SOLID] |
| Runtime data plane + invariant enforcement + realtime tick | `packages/cdk/cloudflare/realtime-worker` (`RealtimeDB` DO, ~27K LOC) | [SOLID] |
| Functions runtime (`ctx.*`, Worker Loader isolation) | `packages/cdk/cloudflare/functions-dispatcher` | [SOLID] |
| Tenant supervisor, billing ledger, **Stripe Connect**, `/connect/*` + `/billing/*` | `packages/cdk/cloudflare/bounded-host` | [SOLID] |
| Slug/custom-domain routing, analytics, OG cards | `packages/cdk/cloudflare/bounded-router` | [SOLID] |
| Auth issuers (wallet SIWS; email/OTP/social via Better Auth) | `bounded-auth`, `bounded-betterauth` (D1) | [SOLID] |
| Control plane (deploy, policy compile, billing) | `express-servers/developer-api` (Container) | [SOLID] |
| Cron/schedules | `heartbeat-dispatcher` | [SOLID] |
| Onchain (Solana) programs + **Kani formal proofs** | `layers/sol-helper` + `evidence/` (263-harness Kani matrix) | [SOLID] |
| Agent-facet egress sealing research | `spike-agent-facet` | [PARTIAL] research spike |

**Action for prompts:** when telling the new AI to work on "the Bounded engine,"
point it at `TaroBase/packages/cdk` (bounded branch), not `tarobase-core`.

## C. Cross-repo maturity matrix

| Area | Maturity | Notes |
|---|---|---|
| Proof engine (Z3 rule + invariant obligations) | [SOLID] | rule properties, `conserve`, `rollingSum`, `tenantTag`/`tenantEdge` proven; counterexamples real |
| `bound` invariant | [PARTIAL] | **runtime-enforced but UNPROVEN advisory** — single-value provable at parity, `.values` map case not yet quantified. Site/skill are honest about this |
| Atomic data plane | [SOLID] runtime / [PARTIAL] cross-substrate | **BACKEND-004 (open, HIGH):** policy-update path not proven atomic across Solana + Mongo + Durable Object + runtime; owner acknowledges in-process atomicity impossible, no durable reconciler yet. Directly qualifies the "atomic" claim |
| Client SDK (`@bounded-sh/client`/`server`) | [SOLID] | CRUD, queries, subscribe, auth, webhooks, Solana tx hardening; named audit fixes |
| Realtime/live (rooms, tick, views, effects) | [SOLID] | server-authoritative; effects replay-safe; AI NPCs + Flue agents as effect kinds |
| Onchain / Solana | [SOLID core] / [PARTIAL edges] | Kani-proven bucket math; **open:** FINDING-15 client-tamperable swap route (awaits server attestation), FINDING-02 DFlow discriminator allowlist, FINDING-05 zero-slippage DBC swaps |
| Onchain trading (Phoenix perps, DeFi swaps) | [PARTIAL] | server-signed desk model works; client-signed handoff not supported; reserve-at-open loss cap proven but plugin body is trusted code |
| EVM token plugin (`tarobase-token-plugin`) | [PARTIAL] | **EVM/Solidity, testnet only** (Base/Monad); transfer + factory only; **no trading/bonding-curve/transferAuthority**; minor TODOs |
| Auth (email OTP, OAuth, guest, wallet) | [SOLID] | hosted OIDC+PKCE; rotating single-use refresh tokens (AUTH_SESSION_REDESIGN, deployed). **Deferred:** 1h access-token TTL (still 24h). Text/SMS OTP opt-in, off by default. Inline OTP endpoints retired (403) |
| Bounded CLI (Go) | [SOLID] | ~30+ commands fully wired, dogfooded; **Z3 is server-side only** (CLI POSTs to `/verify-formal`); direct-Solana data path "arriving later" |
| Local dashboard + live-edit daemon | [SOLID] | propose→validate→deploy, widget, variants, HMAC widget tokens |
| Bounded Pay | [SOLID] | **deployed prod app** `6a3c5cc4c23db87fb06f4ea1`; conserved ledger, bps splits, fail-closed caps. Limits: USD-only, one-off checkout (no subscriptions), no app-webhook fanout; `syncUsage` needs `METER_SECRET` provisioned |
| Bounded site (bounded.sh) | [PARTIAL] | **live homepage = 8-Act "Portal"** (`src/App.tsx`), **README is stale** and describes a different component set. Several brief-expected sections (ProofTable, TwoLayers, ScopeLimits, Quickstart) are NOT on the live page; legacy subpage nav links are dead |
| Bind engine (`@bind/core`) | [SOLID] | resumable gated workflow, budget ledger, event sourcing, replay determinism; strict gate security (no self-approval) |
| Bind Bounded adapter | [SOLID exec] / [PARTIAL] | real `bounded verify`/deploy; dry-run is honest-skip; `bounded-facts` capabilities partly emulated; design-fidelity referee deferred |
| Bind Cloudflare worker (`apps/worker`) | [SOLID local] / [PARTIAL cloud] | same `@bind/core` over D1, parity-tested; **worker does not itself build/serve frontends** (web build runs via Sandbox/CLI); live-cloud confidence depends on deployed smoke |
| Bind multi-tenant isolation | [PARTIAL — HIGH RISK] | **`/v1/runs` reads load from D1 without filtering by authenticated `clientId`** — flagged High **before reselling**. Fast-follow, not done |
| Bind production readiness | [PARTIAL] | go-live doc: "**Ready for single-integrator validation**"; fast-follows before multi-integrator resale: per-tenant isolation, real spend metering, cloud browser QA, ops (scoped D1/SSE, Logpush/DLQ) |
| Bind Studio / examples / agent contracts | [SOLID] | Studio reference UI + BFF; 3 runnable examples; 13 agent prompt contracts |

## D. The honesty boundaries (do not let the AI over-promise)

These are stated by the product itself and must survive into any marketing:
- Proofs cover **declared** rules/invariants only — "green ≠ safe" if you didn't
  declare the property. Proofs are about **policy/enforcement algebra, not
  application code** correctness.
- **Liveness is not claimed** — Bounded proves it rejects invalid writes, not that
  it accepts every valid one.
- **Denied reads return empty `200`**, never `403` (test by comparing identities).
- Anti-cheat cannot defeat **human-speed scripting** (legal inputs, superhuman
  execution) — nobody can; Bounded gives the substrate (server-authoritative state,
  proven rate caps, tamper-proof input logs, webhooks to detection).
- Functions' **own logic is not proven** — only their writes (through invariants) and
  their invocation gate (`auth`) are.
- Onchain: eventually-consistent mirror (no read-after-write); mainnet policy updates
  need a human permit (not agent-frictionless yet).

## E. Strategic read (for the token-budget bet)

1. **Lead with Bounded, stage Bind.** Bounded is closest to production and has a
   crisp, defensible wedge ("provable backend for the agent era"). Bind is the
   demand-generation and differentiation story but needs the per-tenant isolation +
   metering fast-follows before it's safe to open to many customers.
2. **The tagline is already agent-first and honest.** Live hero: *"The backend you
   and your AI can trust."* This is the exact positioning for the "superhuman AI
   writes/spends/ships" moment — the proof layer is the trust primitive that lets a
   powerful-but-fallible agent operate on real money/data.
3. **Highest-leverage engineering before launch** (from the audits, ranked):
   (a) Bind per-tenant/caller isolation on `/v1/runs` (HIGH, blocks resale);
   (b) Bounded BACKEND-004 durable reconciler for policy-update atomicity (HIGH,
   qualifies the headline claim); (c) real spend metering in Bind's budget ledger;
   (d) close remaining onchain findings (FINDING-15/02/05) or scope onchain out of v1
   marketing; (e) finish/replace the stale `bounded-site` homepage sections so the
   public story matches the built product.
4. **Monetization already exists**: Pro at $25/mo, two metered buckets (AI/external +
   infra), managed third-party proxy at **provider cost + 5%**, and **Bounded Pay's
   1% platform fee**. That's four revenue lines wired, plus top-ups. The pricing page
   is live but beta.
5. **Biggest narrative risk**: over-claiming "provable/atomic/can't go wrong" while
   BACKEND-004 and `bound`-unproven are open. Keep the ScopeLimits honesty front and
   center — it is itself a differentiator versus hand-wavy competitors.
# Appendix: Using This Pack With The New Model (Prompt-Prep)

> Purpose: this pack is the **seed context** you paste (or attach) so the new,
> much-more-capable model starts every session already knowing the entire
> Bounded/Bind surface. Below: how to load it, guardrails to give the model, and
> ready-to-adapt "master prompt" skeletons for the business/marketing/product work.
> These are starting points — we can refine them together into the exact prompts.

## 1. How to load this pack

- **Order of trust:** Sections `00` (overview) → `90` (synthesis/maturity) are the
  ground truth for *what's real*. `50` (capability catalog) is the richest *what it
  can do*. `40` (site) is *how it's currently pitched*. `10–31` are per-repo detail.
- **Always pair a task with `90`.** It's the antidote to the model over-trusting the
  marketing. Tell the model: "Treat Section 90 as the reality check; never claim a
  capability the maturity matrix flags as [PARTIAL]/[STUB]/unproven without saying so."
- **Point code tasks at the right paths:** engine = `TaroBase/packages/cdk` (bounded
  branch); SDK = `TaroBase/packages/tarobase-*`; CLI = `bounded-cli`; orchestration =
  `bind`; payments = `bounded-pay`; marketing = `bounded-site` (main); docs/skill =
  `skill/bounded`.

## 2. Standing guardrails to give the model (paste into its system/first turn)

1. Distinguish **shipped** from **aspirational**; cite Section 90 maturity flags.
2. Preserve the **honesty boundaries** (Section 90.D) in any external copy — they are
   a differentiator, not a weakness.
3. No fake integrations, no simulated data presented as real (the product's own
   quality checklist forbids it).
4. When proposing engineering, rank by the audit-derived priorities (90.E.3).
5. Money/marketing claims must match live pricing (Free $0 / Pro $25; provider+5%;
   Pay 1%) — no invented numbers.
6. Prefer the least-powerful mechanism (rule > hook > function) when writing Bounded
   apps; keep guarantees in policy, not imperative code.

## 3. Master-prompt skeletons (adapt, don't paste blindly)

### 3a. Go-to-market / positioning
> "You have the full Bounded/Bind context pack. Bounded is a provable realtime
> backend ('the backend you and your AI can trust'); Bind is the prompt-to-app
> orchestration layer on top. We are pre-launch, no users, and a far more capable AI
> just became broadly available. Design a 90-day GTM to reach [ICP: e.g. AI-agent
> builders / indie devs shipping agent apps / vibe-coding platforms] that wins
> *because* customers can now safely let powerful agents write, spend, and ship.
> Constraints: honor the maturity matrix (Section 90) — lead with what's shipped,
> stage Bind behind its per-tenant-isolation fast-follow. Deliverables: positioning
> statement, 3 wedge use-cases with proof-of-value demos we can build this week,
> channel plan, and the exact homepage rewrite (the live one in Section 40 has stale
> sections). Show your reasoning on why this beats Convex/Supabase/Firebase for the
> agent era."

### 3b. Product / roadmap
> "Given Section 90's maturity matrix and ranked gaps, produce a launch-readiness
> plan: (1) the minimum to safely open Bind to multiple paying integrators
> (per-tenant isolation, spend metering, cloud browser QA, ops); (2) whether to close
> BACKEND-004 (policy-update atomicity) before or after launch given it qualifies the
> 'atomic' headline; (3) whether onchain/trading is in or out of the v1 story. For
> each item: scope, risk if shipped without it, and the smallest credible fix. Output
> a sequenced backlog with 'blocks launch' vs 'fast-follow' labels."

### 3c. Demo / proof-of-value builder
> "Using the capability catalog (Section 50) and CLI (Section 30), design 3
> jaw-dropping but *honest* demos that show a powerful agent doing real work on
> Bounded safely: e.g. (a) an agent given a spend cap it provably cannot exceed
> (rollingSum + counterexample shown), (b) a multiplayer game with server-authoritative
> anti-cheat, (c) a payments flow with a conserved ledger that provably can't mint
> money. For each: the policy.json, the agent prompt, the 60-second script, and the
> single screenshot/GIF that sells it."

### 3d. Pricing / monetization
> "Live monetization: Pro $25/mo, two metered buckets (AI/external, infra), managed
> proxy at provider+5%, Bounded Pay 1%. Model 3 pricing/packaging options for the
> agent-era ICP that maximize expansion revenue as agents drive usage, without
> punishing early adopters. Include the value-metric choice, free-tier limits, and how
> Bind's orchestration should be priced relative to raw Bounded."

## 4. Fast facts the model should never get wrong

- Hero (live): **"The backend you and your AI can trust."** Sub: *"A realtime,
  agent-first platform with formally verified rules for access, state, multiplayer,
  and money."*
- Pricing: **Free $0** (1 project, 100 MB, $0.50/mo AI trial, no top-up) · **Pro
  $25/mo** (unlimited projects, 10 GB, team sharing, $5/mo AI + $30/mo infra credit,
  top-ups). Beta.
- Fees: managed third-party = **provider cost + 5%**; **Bounded Pay = 1%** + Stripe.
- Install: `curl -fsSL https://get.bounded.sh/install.sh | sh`.
- Bounded Pay prod app: `6a3c5cc4c23db87fb06f4ea1` (bounded-pay.bounded.page).
- Repos: engine+SDK in `TaroBase` (**bounded** branch), CLI `bounded-cli`, payments
  `bounded-pay`, site `bounded-site`, AI-skill `skill`, orchestration `bind`.
- Release runbook of record: `bounded-cli/release/PUBLISHING.md`.

## 5. Next step (with your user)

After seeding, the highest-value collaboration is turning §3 skeletons into the exact
prompts for your first big runs — pick one lane (GTM, product, demos, pricing), and
we tighten the prompt, the deliverable format, and the guardrails together before you
spend the tokens.


================================================================================
SHARED BUSINESS CONTEXT
(Prepend the technical pack "BOUNDED_BIND_CONTEXT.md" ABOVE this. Then paste ONE
 themed task prompt BELOW this. Reuse this block for every run.)
================================================================================

## Your role and how to treat this

The document above this line is our full technical context pack for **Bounded** and
**Bind** — our infrastructure. This block adds our *business and company* context.
Below this block we will paste ONE focused task. Read the technical pack as ground
truth for what our infra can/can't do today (respect its maturity flags).

You are the most capable model available to us. **We are your customer.** We are
prepared to spend heavily — tokens, dollars, and many autonomous/self-running loops
of you — for outcomes. Our overriding goal: **generate revenue and reputation, by
almost any legitimate means.** We have no strong PMF. We are open to pivoting,
dropping current bets, doing manual work, buying/building hardware, and operating
products we don't personally love. We are also open to being **largely hands-off** —
harnesses where you and future models do most of the work and we mostly execute.

**Every task below must END IN ACTION, WITH CONVICTION** — a clear recommendation and
concrete next steps we can take, not a hedged menu of maybes. Assume we will act on
your strongest recommendation.

## Who we are

- A team of **4**: three **staff-level engineers in the US (Washington DC area)** and
  one **mid-level engineer in India**.
- **$2.1M in the bank.** Burn **~$90k/month** (≈ 23 months runway). Willing to risk a
  large portion of that cash on running many loops of you to find/build revenue.
- We can do manual/operational work ourselves — not purely a "ship code" shop.

## What we have (assets & products)

1. **poofdotnew ("Poof")** — our current main product. Web-based "vibe coding"
   platform (like Lovable / Replit / Bolt). **~$250k ARR.** We are not happy with it.
2. **Bounded** (bounded.sh) — provable realtime backend infra (detailed in the pack).
   Started as ripping the backend out of Poof into its own product.
3. **Bind** — our orchestration engine (detailed in the pack). Runs products like
   Smallhours; highly configurable; potentially **platformized** so third parties can
   build their own Smallhours-like products on it.
4. **Smallhours** — first product built on Bind. An "app maker" in stages: (a) a
   **design phase** with the user, (b) a hands-off **building phase** that builds the
   design and tests it end-to-end, (c) a **marketing phase** (not built yet).
5. **Ratri** — intended **Indian version of Smallhours**: accept **Razorpay**, target
   India, "do what Polsia did in the US" but for India. Currently our clearest forward
   direction (infra + Ratri), though hard to get right.
6. **Robbie Shillstone engagement** — one external person; plan is to **use Smallhours
   to build his app** and keep him updated as it builds. His product: an **IRL
   scavenger-hunt AR experience in NYC.**
7. **cutscene.video** — our own **branching-video maker**. Built; light marketing +
   cheap paid-ad tests to see if it converts.

## Where we are

Startup without much clear direction; no clear PMF. Clearest current direction is
building the infra and launching Ratri. Looking for many options and ways forward;
willing to move as needed.

## The bigger thesis (why now)

Stronger models keep arriving (you, Fable). Belief: we can **pump out products**, get
**marketing** right, build apps/websites/experiences that **convert big** — including
**hardware or whatever's needed** — and make them succeed if AI scales us massively
and we just follow clear instructions. Willing to run **many autonomous loops of you
against real money.**

## Loose ideas we're toying with (non-exhaustive)

- **Tennis-serve simulator** (one of us is a serious tennis player): like a basement
  golf simulator, but usable **outside** (a serve needs high ceilings), and more.
- **AI investment desk** paper-trading harness using you as the desk; possibly our
  highest-leverage option.

## Our posture as your customer

Aggressive spend is on the table (cash + your-compute + long autonomous loops); do not
self-limit to "cheap," but tie spend to expected payoff so we can choose. We want
revenue + reputation, quick wins and big swings. Open to hands-off. Can pivot hard and
do manual work. Nothing is sacred except the goal.


================================================================================
TASK 7 — THE PRODUCT FACTORY (pump out converting products; be hands-off)
================================================================================

Using the technical pack + shared business context above, design our "product factory"
and put it to work (our framing):

> We're building a harness; stronger models keep arriving. We believe we can **pump out
> products**, get **marketing** right, and build apps/websites/experiences that
> **convert big** — including **hardware or whatever's needed** — and make them succeed
> if AI scales us massively and we just follow clear instructions. We're fine being
> **hands-off.** Ideas already in play: a **tennis-serve simulator** usable outside
> (like a basement golf sim, but a serve needs high ceilings), and reviving
> **cutscene.video** (our branching-video maker, in light paid-ad testing).

## Do this

1. **Design the factory as an operating system.** The repeatable pipeline —
   idea sourcing → rapid build (via Smallhours/Bind/Bounded where it fits) → marketing/
   landing/ads → measure conversion → **kill or scale** — with the decision gates and
   how much runs as **autonomous Fable loops** vs our 4 people vs contractors. Define
   the standard "one bet" unit: budget, timebox, and success threshold.
2. **Generate & rank a large slate of candidate products** to run through it (include
   the tennis simulator, cutscene.video revival, and many you invent — digital and
   physical/hardware). For each: the convert-thesis, rough build + marketing cost,
   time-to-first-dollar, and how hands-off it can be.
3. **Pick the first cohort.** The 3–5 bets to run first and why (fastest signal, best
   leverage of our assets/skills, portfolio balance of quick-wins vs swings).
4. **For each first-cohort bet:** the concrete build plan, the marketing/distribution
   plan (channels, creative, paid-test budget), and the conversion metric that decides
   kill vs scale.

## End in action, with conviction

- **The factory's concrete operating procedure** (so we could run it starting Monday).
- **The first 3–5 products to launch**, each with owner tags `[autonomous Fable loop]`
   / `[one of our 4]` / `[manual/contractor]`, a **per-bet budget** and timebox, and the
   kill/scale metric.
- **A 30/60/90-day rollout** and the total budget to commit from our $2.1M. Decide;
   don't hedge.

================================================================================
HOW THIS WILL BE JUDGED — BATTLE ROYALE
================================================================================

Heads up: we are running several prompts like this one in parallel, each a different
strategic lane:
  1) Overall business direction & portfolio
  2) Bounded positioning & GTM
  3) Bounded enterprise
  4) Live-edit / internal-tool builder
  5) AI investment desk
  6) Ratri (India GTM)
  7) Product factory (pump-out converting products)

**Your lane here is: Product factory.**

Every lane's output will be pitted head-to-head against all the others in a battle
royale. We will fund the winner(s) — and we may also MERGE the best pieces across
lanes into one plan. So:

- Make the strongest possible case for THIS lane. Assume it competes against the other
  lanes for real budget, our focus, and our compute.
- Be explicit about **why your recommended direction should beat the alternative lanes**
  for us right now (given our assets, team of 4, $2.1M, ~23-month runway, no PMF).
- Call out **which parts of your plan combine well with other lanes** (a merge), and
  which are mutually exclusive.
- Give the honest case **against** your own lane — when it would be the wrong bet — so
  we can trust the comparison.
- Don't sandbag and don't hedge. Win the fight, or tell us plainly you can't.
