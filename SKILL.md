---
name: bounded
description: >-
  Use to BUILD AND USE Bounded (bounded.sh) — a provable Convex/Supabase-class
  realtime backend an agent builds from a description. Covers: generating a
  policy.json (collections, field types, auth rules, and provable invariants —
  spending caps, conservation, tenant isolation), running `bounded verify` for
  SMT proof reports with counterexamples, deploying through the fail-closed proof
  gate, and reading/writing data via `bounded data` or the `@bounded-sh` SDK
  packages (`@bounded-sh/client` for web/React Native, `@bounded-sh/server`
  for server). This SKILL.md is a ROUTER:
  it maps your intent to the one doc that answers it. Triggers: "bounded",
  "bounded.sh", "bounded CLI", "bounded verify", "bounded deploy", "policy.json",
  "provable backend", "formally verified database", "Convex alternative",
  "Supabase alternative", "realtime backend", "invariant", "spending cap",
  "rollingSum", "conserve", "tenantTag", "tenantEdge", "proof report",
  "counterexample", "agent spend cap", "multiplayer game backend", "fog-of-war",
  "server-authoritative", "tick", "anti-cheat", "live runtime", "session.live",
  "bounded live", "live module", "realtime room", "Figma clone", "collaborative editor",
  "whiteboard", "live dashboard", "per-client view", "provable replay",
  "native game",
  "service key", "server wallet", "backend identity", "payout bot", "actAs",
  "__managers__", "__owners__", "__collaborators__", "logsAuth",
  "who can view logs", "function log access", "linked accounts",
  "hooks", "scheduled", "webhooks",
  "@bounded-sh", "@bounded-sh/client", "@bounded-sh/server", "collaborator", "bounded share",
  "bounded link", "share by email", "admin", "admins collection", "no god-mode",
  "roles", "roles block", "provably-scoped admin", "read everything",
  "admin dashboard", "constants block", "@const", "defs", "@def",
  "reusable rule fragment", "environments", "staging and production",
  "multi-environment", "per-environment", "--environment",
  "verifyAuthorityClosure", "functions", "bounded functions", "function",
  "invoke", "escape hatch", "when to use a function", "scheduled function",
  "call Stripe", "call an API", "third-party API", "ctx.bounded", "ctx.env",
  "syncStripe", "getPage", "aggregate", "search", "pagination",
  "don't lose my key", "back up my key", "account recovery", "lost wallet",
  "wallet safety", "key safety", "credentials", "~/.bounded/credentials",
  "BOUNDED_PRIVATE_KEY", "who owns the app", "AI NPC", "AI player", "NPC brain",
  "tick calls a function", "live call", "session.live.calls", "@effect",
  "system principal", "service principal", "acting user", "origin", "@origin",
  "ctx.origin", "onchain", "Solana data", "client transaction",
  "client-signed transaction", "sign onchain", "mainnet", "devnet",
  "--protocol", "realtime_devnet", "graduate a function", "eject to Cloudflare".
---

# Bounded

Bounded (bounded.sh) is a **provable realtime backend an agent builds from a
description**. You write one JSON policy — collections, field types, auth rules,
and **invariants** (the non-negotiables: spending caps, conserved totals, tenant
isolation) — and a Z3-based prover checks every declared constraint at deploy
time, returning concrete counterexamples on failure. At runtime a single-writer
cell per app enforces those constraints atomically over a realtime Durable
Object. Everything is fail-closed: a constraint-breaking write is a `409`, an
unprovable policy never deploys, nothing partial is ever applied.

## The loop

```
describe app → generate policy.json → bounded verify → read counterexamples →
fix → bounded verify (clean) → bounded deploy (same gate) → use via SDK / CLI
```

`bounded verify` does not say "tests passed" — it proves a property over *all*
inputs and, on failure, hands you the exact assignment that breaks your policy.
That is the heart of Bounded.

## Lookup — find THE one file in one hop

**This SKILL.md is an index, not a textbook.** Look your need up in *one* of the
three tables below — by **task**, by **symbol**, or by **error** — open the single
file it points to (jump to the `#section` when given), and stop. Each doc opens
with a one-line "what's in here" so you can confirm relevance instantly. Don't
load multiple files to answer one question; follow a doc's "Related" footer only
for the *next* question.

### (a) By task → exact file (and section)

| I want to… | Go to |
|---|---|
| Write a correct policy from a description (the method) | [docs/policy-generation-guide.md](docs/policy-generation-guide.md) **(start here for any backend)** |
| See full, validated example policies | [docs/policy-examples.md](docs/policy-examples.md) |
| **Add a spending / rate cap** | [docs/invariants.md](docs/invariants.md#rollingsum--caps-over-time-windows) · example below |
| **Conserve a total / build a transfer** (no minting) | [docs/invariants.md](docs/invariants.md#conserve--sums-dont-change) · example below |
| **Isolate tenants** (data/refs can't cross orgs) | [docs/invariants.md](docs/invariants.md#tenanttag--documents-carry-their-tenant) |
| **Cap a field / anti-cheat a game score** (hard ceiling/floor) | [docs/invariants.md](docs/invariants.md#bound--hard-ceilings--floors-on-a-field-anti-cheat) |
| **Make an admin who reads/writes everything** (dashboard, support) | [docs/roles.md](docs/roles.md) · example below |
| **Make a per-doc admin / moderator** (no creator god-mode) | [docs/admin-and-ownership.md](docs/admin-and-ownership.md) · example below |
| **DRY up a policy** (named values `@const`, reusable rule fragments `@def`) | [docs/constants-and-defs.md](docs/constants-and-defs.md) · example below |
| **Deploy one policy to staging + production** (per-env appId + constants) | [docs/environments.md](docs/environments.md) · example below |
| **Decide: rule vs invariant vs hook vs function** | [docs/functions-when-to-use.md](docs/functions-when-to-use.md) |
| **Outgrow a Bounded function** (move heavy/long-running code to your own Cloudflare Worker) | [docs/functions-graduation.md](docs/functions-graduation.md) |
| **Call an external API (Stripe/LLM) then write** | [docs/functions.md](docs/functions.md) · example below |
| **Deploy backend code / an agent with custom npm deps, persistent state, or its own schedule** (run full Cloudflare power THROUGH Bounded — sealed/metered/capped) | [docs/backend-runtime.md](docs/backend-runtime.md) |
| **Host a static frontend** (`bounded site deploy ./dist` → `<app>.bounded.page`, with `<app>-api.bounded.page` for the backend) — **static bundles only** (Vite/CRA/static export); **not** SSR Next.js / request-time servers | [docs/frontend-hosting.md](docs/frontend-hosting.md#what-it-can-and-cannot-host) |
| **Give an app a nice URL** (a vanity `<slug>.bounded.page`, or your own custom domain on Pro) | [docs/domains.md](docs/domains.md) |
| **Plans, pricing & paying** (free/pro/enterprise, the $5 AI bucket + top-ups, upgrade via Stripe or x402, admin adjust plan/credit/overrides) | [docs/billing.md](docs/billing.md) |
| **Give backend code an API key** (Stripe/OpenAI secret — declare in manifest, `bounded secret put`, read via `ctx.secrets.get` or auto-inject on egress) | [docs/secrets.md](docs/secrets.md) |
| **Gate access on app managers / owner / collaborators** (incl. linked accounts) or **control who views function logs** (`logsAuth`) | [docs/identity-and-logs.md](docs/identity-and-logs.md) |
| **Have a function act as its own backend identity** (payout bot, market-maker, settler — mint a key, policy authorizes its address) | [docs/service-keys.md](docs/service-keys.md) |
| **Run a function / hook on a schedule** | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md#hooksscheduled--schedule--recurring-jobs) · [docs/functions.md](docs/functions.md#scheduled-functions-run-a-function-on-a-cadence) |
| Add hooks / one-shot timers / webhooks | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| **What anti-cheat can / can't provably guarantee** (hooks bypass rules but never invariants; on-chain signing) | [docs/hooks-and-anti-cheat.md](docs/hooks-and-anti-cheat.md) |
| **Build a game with a server tick + settlement** (bytecode `session.tick` model) | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| **Build an AI NPC / AI player** (the tick `call`s a function; `session.live.runAs`-funded LLM, `actAs` per-function override; an agent joining a room as a player) | [docs/ai-npcs.md](docs/ai-npcs.md) |
| **Who is the actor / system vs service principal / origin auth** (what `@user` is when a tick calls a function; `@origin` host-set + unforgeable; the function's `auth` rule IS evaluated for live; `session.live.runAs` funds it) | [docs/principals-and-origins.md](docs/principals-and-origins.md) |
| **Store data on Solana / sign onchain or client transactions / go to mainnet** (`onchain` collections, `--protocol`, `@user.address`-only, client-signed tx is ROADMAP) | [docs/onchain.md](docs/onchain.md) |
| Full rule / field-type / `get()`/`getAfter()` **syntax reference** | [docs/policy-reference.md](docs/policy-reference.md) |
| **Let users log in** (email is the default — inline OTP; guest = `signInAnonymously()`; Phantom = `authMethod:'phantom'`, opt-in for onchain/money apps) | [docs/auth.md](docs/auth.md#end-user-auth--the-user-object) · example below |
| **Log an agent / Playwright into a deployed authed app to e2e-test** (inject a real keypair session into the browser — no login UI; mint via CLI, seed `localStorage`) | [docs/testing-authed-apps.md](docs/testing-authed-apps.md) |
| **Don't lose my key / back up / recover my account** (the credentials file IS your account; `bounded link` it; gitignore secrets) | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) |
| **Anonymous / guest users, invite links, try-before-signup; transfer or upgrade an account** | [docs/anonymous-accounts.md](docs/anonymous-accounts.md) |
| **Share an app by email / link my account** | [docs/auth.md](docs/auth.md#linking--teams) · example below |
| **Paginate / filter / sort** a collection | [docs/queries.md](docs/queries.md#sort-limit-cursor-pagination) · example below |
| **Aggregate** (count/sum/avg/min/max/group) | [docs/queries.md](docs/queries.md#aggregations) · example below |
| **Full-text search** | [docs/files-and-search.md](docs/files-and-search.md) · example below |
| **Subscribe to live data** | [docs/sdk-reference.md](docs/sdk-reference.md#subscribe-live--subscribe) · example below |
| Upload / read files | [docs/files-and-search.md](docs/files-and-search.md) |
| Build for an **agent** / **web** / **mobile** / **server** / **realtime room** | [guides/building-for-agents.md](guides/building-for-agents.md) · [guides/building-a-webapp.md](guides/building-a-webapp.md) · [guides/building-for-react-native.md](guides/building-for-react-native.md) · [guides/building-a-backend.md](guides/building-a-backend.md) · [docs/live-runtime.md](docs/live-runtime.md) |
| **Build a server-authoritative realtime app** (game, Figma-style editor, whiteboard, dashboard — 3 pure fns, no deploy) | [docs/live-runtime.md](docs/live-runtime.md) |
| Run `bounded verify` / read counterexamples | [docs/verify-and-counterexamples.md](docs/verify-and-counterexamples.md) |
| Know what's proven on which runtime | [docs/proof-coverage.md](docs/proof-coverage.md) |
| Every CLI command + flag | [docs/cli-reference.md](docs/cli-reference.md) |
| Every SDK method | [docs/sdk-reference.md](docs/sdk-reference.md) |
| Read/write semantics, atomic batches | [docs/data-plane.md](docs/data-plane.md) |
| Self-check before deploy | [docs/quality-checklist.md](docs/quality-checklist.md) |
| What Bounded is **NOT** good for | [guides/capabilities-and-limits.md](guides/capabilities-and-limits.md) |

### (b) By symbol / keyword → file

| Symbol | File |
|---|---|
| `rollingSum`, `windowSeconds`, `scopeVariable`, `limit` | [docs/invariants.md](docs/invariants.md#rollingsum--caps-over-time-windows) |
| `bound`, `op` (`<=`/`>=`/`==`), `field.values`, anti-cheat ceiling | [docs/invariants.md](docs/invariants.md#bound--hard-ceilings--floors-on-a-field-anti-cheat) |
| `conserve`, `materialization: "sharded"` | [docs/invariants.md](docs/invariants.md#conserve--sums-dont-change) |
| `tenantTag`, `tenantEdge` | [docs/invariants.md](docs/invariants.md#tenanttag--documents-carry-their-tenant) |
| `rules` (`read`/`create`/`update`/`delete`), `@user`, `@data`, `@newData`, `get()`, `getAfter()` | [docs/policy-reference.md](docs/policy-reference.md) |
| `roles`, `members`, `read:"*"`, `write:["posts"]`, provably-scoped admin | [docs/roles.md](docs/roles.md) |
| `admins/$userId`, `verifyAuthorityClosure` | [docs/admin-and-ownership.md](docs/admin-and-ownership.md) |
| `constants`, `@const.NAME`, `defs`, `@def.name` | [docs/constants-and-defs.md](docs/constants-and-defs.md) |
| `environments`, `--environment`, per-env appId/constants | [docs/environments.md](docs/environments.md) |
| `functions`, `auth`, `entry`, `secrets`, `ctx.env`, `ctx.bounded`, `ctx.user` | [docs/functions.md](docs/functions.md) |
| `__managers__` / `__owners__` / `__collaborators__`, reserved identity sets, `logsAuth`, who can view logs, linked accounts, manager-gated | [docs/identity-and-logs.md](docs/identity-and-logs.md) |
| service key / server wallet, `actAs` (policy `functions` field), backend identity, payout bot, `@constants.PAYOUT_BOT` | [docs/service-keys.md](docs/service-keys.md) |
| hook bypasses rules but never invariants, anti-cheat boundary (provable vs not), on-chain signature | [docs/hooks-and-anti-cheat.md](docs/hooks-and-anti-cheat.md) |
| `schedule` (`every`/`run`), `dueRows`, `hooks.scheduled`, `hooks.offchain`, `webhooks`, `enforceRules` | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| `session.tick`, `hooks.tick`, `settleTo`, fog-of-war (bytecode session model) | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| `session.live`, `module`, `everyMs`, `snapshotEveryTicks`, `secrets` (live), facet, Worker Loader | [docs/live-runtime.md](docs/live-runtime.md) |
| `session.live.calls`, `@effect`, the `call` primitive (`{state,call:{fn,args,as}}`), `as` (optional; gates same-tick check only — NOT wired to identity today) | [docs/principals-and-origins.md](docs/principals-and-origins.md) · [docs/ai-npcs.md](docs/ai-npcs.md) |
| `@origin`, `@origin.kind` (`'live'`/`'user'`/`'scheduled'`/`'function'`/`'webhook'`, always set), `@origin.module`/`.path`/`.room`/`.tick`, `ctx.origin` (host-set, unforgeable; offchain-only — forbidden onchain) | [docs/principals-and-origins.md](docs/principals-and-origins.md) · [docs/policy-reference.md](docs/policy-reference.md) |
| `session.live.runAs` (session-wide live-call identity; funds AI NPCs), `actAs` as a **system / service principal** (what `@user` is on a live call); precedence `actAs > runAs > anonymous system` | [docs/principals-and-origins.md](docs/principals-and-origins.md) · [docs/service-keys.md](docs/service-keys.md) |
| AI NPC / AI player, `npcBrain`, tick-calls-a-function, `ctx.ai.run` billing on a live call | [docs/ai-npcs.md](docs/ai-npcs.md) |
| `onchain: true`, `--protocol` (`realtime_devnet`/`realtime_mainnet`), `--skip-preflight`, client-signed tx, `0xbc4`, devnet/mainnet | [docs/onchain.md](docs/onchain.md) |
| live game *feel*: input cadence, interpolation, prediction, `session.intentRule` | [docs/realtime-netcode.md](docs/realtime-netcode.md) |
| `init`/`tick`/`views` (native live functions) | [docs/live-runtime.md](docs/live-runtime.md) |
| `bounded live deploy/upload`, `GET /live/status`, `POST /live/intent`, `live.intent`, `subscribeLiveView` | [docs/live-runtime.md](docs/live-runtime.md) |
| plans (`free`/`pro`/`enterprise`), `aiBucketUsdCents`, AI credit bucket, `aiCreditGrantedUsd`, overrides, Stripe `/billing/checkout`/`/billing/portal`, x402 `/billing/x402/intent`/`/billing/x402/settle`, `admin.bounded.page` / `/admin/account` | [docs/billing.md](docs/billing.md) |
| `tier` (`durable`/`checkpointed`/`ephemeral`) | [docs/policy-reference.md](docs/policy-reference.md) · [docs/invariants.md](docs/invariants.md) |
| `links`, `relationships`, `queries`, `$regex`/`$gte`/`$in` | [docs/queries.md](docs/queries.md) |
| `getPage`, `queryAggregate`, `count`, `setMany`, `subscribe`, `getIdToken` | [docs/sdk-reference.md](docs/sdk-reference.md) |
| `search`, `setFile`, `getFiles`, storage collection | [docs/files-and-search.md](docs/files-and-search.md) |
| `bounded link`, `bounded share`, `collaborators` | [docs/auth.md](docs/auth.md#linking--teams) |
| `~/.bounded/credentials`, `BOUNDED_PRIVATE_KEY`, `.bounded/app.json` marker, `ownerKeySource`, key backup / account recovery / `bounded whoami` | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) |
| anonymous / guest / `signInAnonymously`, invite link, transfer ownership, upgrade account, ownership-as-data | [docs/anonymous-accounts.md](docs/anonymous-accounts.md) |
| `bounded functions deploy/list/invoke/logs` | [docs/cli-reference.md](docs/cli-reference.md#functions-the-imperative-escape-hatch) |
| `bounded data get/aggregate/search` `--filter`/`--sort`/`--cursor` | [docs/cli-reference.md](docs/cli-reference.md#data-plane) |
| `verifyWebhook`, `createWalletClient`, `@bounded-sh/server` | [docs/sdk-reference.md](docs/sdk-reference.md) |

### (c) By error / status → file

| You hit… | Meaning · file |
|---|---|
| `409` + an invariant name (e.g. `spend_cap`, `no_minting`) | state forbids the write; back off — [docs/data-plane.md](docs/data-plane.md) · [docs/invariants.md](docs/invariants.md) |
| `403` | rule denied the caller/payload — fix the request — [docs/data-plane.md](docs/data-plane.md) · [docs/auth.md](docs/auth.md) |
| `409 append_only` | capped collections are append-only logs — [docs/data-plane.md](docs/data-plane.md) |
| `deploy fails` / `DISPROVED` + counterexample | unprovable policy; read the breaking assignment — [docs/verify-and-counterexamples.md](docs/verify-and-counterexamples.md) |
| Validator rejects (`@constants`, `/` division, `@data` in create…) | static errors + fixes — [docs/policy-generation-guide.md](docs/policy-generation-guide.md#common-mistakes-caught-by-the-validator-or-the-prover) |
| `503` from a function invoke | Functions not configured on the platform — [docs/functions.md](docs/functions.md) |
| `403`/`404` from a function invoke | `auth` rule denied / unknown function — [docs/functions.md](docs/functions.md) |

## Minimal validated examples

Each snippet is the smallest thing that works for one capability and validates
against the real PolicyValidator (policies) or is a real SDK/CLI call (code).
Open the linked doc for the full treatment.

### Spend cap — [docs/invariants.md](docs/invariants.md)

```json
{ "spend/$spendId": {
  "rules": { "read": "@user.id != null",
             "create": "@user.id != null && @newData.agent == @user.id",
             "update": "false", "delete": "false" },
  "fields": { "agent": "String!", "amountUsd": "UInt" },
  "tier": "durable",
  "invariants": [ { "type": "rollingSum", "name": "daily_spend_cap",
    "field": "amountUsd", "windowSeconds": 86400, "limit": 5000, "scopeVariable": "$spendId" } ] } }
```

### Conserve + transfer — [docs/invariants.md](docs/invariants.md) · [docs/data-plane.md](docs/data-plane.md)

```json
{ "accounts/$accountId": {
  "rules": { "read": "@user.id != null",
             "create": "@user.id != null && @newData.owner == @user.id",
             "update": "@user.id != null && @data.owner == @user.id", "delete": "false" },
  "fields": { "owner": "String!", "balance": "UInt" },
  "tier": "durable",
  "invariants": [ { "type": "conserve", "name": "no_minting", "field": "balance" } ] } }
```

A transfer is one atomic `setMany` of both accounts (see data-plane.md).

### Admin model — [docs/admin-and-ownership.md](docs/admin-and-ownership.md)

```json
{ "admins/$userId": {
    "fields": { "active": "Bool" }, "tier": "durable",
    "rules": { "read": "@user.id != null",
      "create": "@user.id != null && get(/admins/@user.id) != null",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null" } },
  "posts/$postId": {
    "fields": { "author": "String!", "body": "String", "hidden": "Bool?" }, "tier": "durable",
    "rules": { "read": "true",
      "create": "@user.id != null && @newData.author == @user.id",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null" } } }
```

### Roles — admin reads everything — [docs/roles.md](docs/roles.md)

```json
{ "constants": { "ADMIN": "<your-user-id>" },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "orders/$id": { "fields": { "buyer": "String", "total": "UInt" },
    "rules": { "read": "@user.id != null && @user.id == @data.buyer", "create": "@user.id != null && @user.id == @newData.buyer", "update": "false", "delete": "false" } } }
```
Normal users read only their own orders; the `admin` member reads every row. `bounded verify` lists the grant and flags `read:*` as over-broad.

### Constants + defs (DRY) — [docs/constants-and-defs.md](docs/constants-and-defs.md)

```json
{ "constants": { "CAP": 5000 },
  "defs": { "isOwner": "@user.id == @data.owner" },
  "posts/$id": { "fields": { "owner": "String", "body": "String" },
    "rules": { "read": "true", "create": "@user.id == @newData.owner", "update": "@def.isOwner", "delete": "@def.isOwner" } } }
```
`@const`/`@def` resolve at compile time (deploy + verify); the worker sees only literals.

### Environments — one file, two apps — [docs/environments.md](docs/environments.md)

```sh
bounded deploy ./policy.json --environment staging      # → staging appId + staging constants
bounded deploy ./policy.json --environment production   # → production appId + production constants
```
The `environments` block (per-env `appId` + `constants`) is resolved client-side; a normal policy ships.

### Function (fetch third-party → write) — [docs/functions.md](docs/functions.md)

```json
{ "functions": { "syncStripe": {
  "auth": "get(/admins/@user.id) != null",
  "entry": "functions/syncStripe.ts", "timeout": 30, "secrets": ["STRIPE_KEY"] } } }
```
```ts
export default async function (args, ctx) {
  const r = await fetch("https://api.stripe.com/v1/...", {
    headers: { Authorization: `Bearer ${ctx.env.STRIPE_KEY}` } });
  await ctx.bounded.set(`subs/${ctx.user.id}`, { active: (await r.json()).active });
  return { ok: true };
}
```

### Scheduled function — [docs/functions.md](docs/functions.md#scheduled-functions-run-a-function-on-a-cadence)

```json
{ "rollups/$day": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "total": "UInt" }, "schedule": { "every": "1d", "run": "rollupDaily" } },
  "functions": { "rollupDaily": {
    "auth": "get(/admins/@user.id) != null", "entry": "functions/rollupDaily.ts", "timeout": 120 } } }
```

### Live subscription — [docs/sdk-reference.md](docs/sdk-reference.md#subscribe-live--subscribe)

```ts
import { subscribe } from "@bounded-sh/client";
const stop = await subscribe("rooms/r1/view/" + myId, { onData: render });
```

### Native live runtime (3 pure fns, no deploy) — [docs/live-runtime.md](docs/live-runtime.md)

Server-authoritative loop for any realtime room (multiplayer game, Figma-style
editor, whiteboard, live dashboard). Pong below is one example.

```json
{ "rooms/$roomId": { "tier": "checkpointed",
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800 } } },
  "rooms/$roomId/view/$userId": { "tier": "ephemeral",
    "rules": { "read": "$userId == @user.id", "create": "false", "update": "false", "delete": "false" } } }
```
Upload + drive: `bounded live deploy pong.live.ts --app-id <id>`, then
`subscribe("rooms/r1/view/"+userId,{onData:render})` and `POST /live/intent {path,intent}`.

### Email share — [docs/auth.md](docs/auth.md#linking--teams)

```sh
bounded share teammate@example.com --app-id <id>   # auto-provisions their embedded wallet; added as admin
```

### Pagination / aggregation / search — [docs/queries.md](docs/queries.md) · [docs/files-and-search.md](docs/files-and-search.md)

```sh
bounded data get       --app-id <id> --path orders --filter '{"total":{"$gte":100}}' --sort createdAt:desc --limit 20
bounded data aggregate --app-id <id> --path spend  --group category --count --sum amount
bounded data search    --app-id <id> --path notes  --query "shipping"
```

## Setup (60 seconds)

```bash
# Install the CLI (Bounded is in beta):
curl -fsSL https://get.bounded.sh/install.sh | sh   # installs `bounded` to your PATH
```

**No login step.** The first `bounded` command generates an ed25519 keypair in
`~/.bounded/credentials` (base58 `privateKey`; or supply `BOUNDED_PRIVATE_KEY`) —
the keypair *is* the identity, so agents go from zero to deployed without a human
auth step. **This key OWNS every app you create — back it up or `bounded link` it
on day one (lose it unlinked → apps are unrecoverable).**
Details: [docs/auth.md](docs/auth.md) · [docs/key-and-account-safety.md](docs/key-and-account-safety.md).

```bash
bounded init                            # scaffold policy.json (a capped spend ledger)
# edit policy.json — see docs/policy-generation-guide.md
bounded deploy ./policy.json --create --name my-app   # creates app, prints <appId>
bounded verify ./policy.json --app-id <appId>         # PROVED / DISPROVED + counterexamples
bounded data set --app-id <appId> --path spend/s1 --data '{"amount":60}'
bounded data get --app-id <appId> --path spend
```

## Core mental model

- **Rules answer *who may act*.** Each action (`read`/`create`/`update`/`delete`)
  is a boolean expression; a denied action is a `403`. Omitted actions default to
  deny.
- **Identity is `@user` = `{ id, address, email, isAnonymous }`** (SDK `user`
  object is the same shape).
  - **`@user.id`** — the **universal, stable identity, always present** for an
    authenticated user. For wallet logins it equals the wallet address; for
    email/social (Bounded Better Auth) logins it is the account identity. **Use it
    for ownership / membership / identity / auth guards** (`owner == @user.id`,
    `get(/admins/@user.id)`, doc ids keyed on the user, `@user.id != null`).
  - **`@user.address`** — a **real onchain wallet address; present for wallet
    logins, `null` for email-only logins.** Use it **only** for onchain / wallet
    semantics. **Hard rule: inside `onchain: true` collections/rules, only
    `@user.address` is allowed — `@user.id`, `@user.email`, and
    `@user.isAnonymous` are forbidden.**
  - **`@user.email`** — the verified, lowercased email (email logins only; `null`
    for wallet). Use it for email-gating.
  - **`@user.isAnonymous`** — strict boolean; `true` only for guest/anonymous
    tokens. Gate with `== false` (no unary `!` on special vars). Also offchain-only.
- **Invariants answer *what must hold across every transaction*** — caps,
  conservation, tenancy. Proven at deploy, enforced atomically at runtime
  (`409` + the invariant's declared name). They bind **every** write path:
  hooks, ticks, schedules, batches, your own migrations.
- **Proofs are over all inputs.** `PROVED` ≠ "tests passed"; `DISPROVED` hands
  you the breaking assignment.
- **Everything fails closed.** Unprovable policies don't deploy; runtime checks
  reject rather than skip.

Failure semantics are in the **(c) By error / status** table above and in full in
[docs/data-plane.md](docs/data-plane.md).

## Best practices

- **Name invariants like error codes** (`spend_cap`, `no_minting`) — the name is
  the `409` your error handling branches on.
- **Verify locally before every deploy** — reading counterexamples is the fast loop.
- **Treat a DISPROVED as information**, not an obstacle: strengthen the rule
  (add `@user.id != null`, null-check optionals), never weaken the property.
- **Use `set-many` whenever correctness spans writes** (transfers, guard + gated
  write) — one atomic batch is not a TOCTOU race; a sequence of `set`s is.
- **Don't update capped documents** — `rollingSum` collections are append-only;
  write each event with a fresh id.
- **Safety: your key IS your account — back it up.** `~/.bounded/credentials` owns
  every app you create; lose it without linking and the apps are unrecoverable. Run
  `bounded link` on day one (attaches the key to your email account) or
  `bounded share` a backup owner, and gitignore every secret-bearing path (the CLI
  manages this; the public `.bounded/app.json` marker is safe to commit). Never
  echo or commit a private key. — [docs/key-and-account-safety.md](docs/key-and-account-safety.md)
- **Machine docs:** `https://bounded.sh/llms.txt` and
  `https://bounded.sh/llms-full.txt` stay in sync with this skill.
