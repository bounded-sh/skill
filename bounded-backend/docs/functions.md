# Functions — the imperative escape hatch

**What's in here / when to read this:** the full Functions reference — declare in
policy, write the `ctx` API, invoke (CLI + TS), deploy, secrets, scheduling, the
proof boundary. **First decide you even need one:**
[functions-when-to-use.md](functions-when-to-use.md).

Declarative policy can't express *"fetch third-party data, then update
accordingly"*: call Stripe / an LLM / any external API, transform the result,
then write. **Functions** close that gap — without breaking the proof thesis.

> **The honest line.** Functions are your imperative escape hatch. Bounded **does
> not prove their logic** — but **they can't break your declared invariants**, and **only
> authorized callers can invoke them**.

## Why functions are still safe (the proof boundary)

Two guarantees hold no matter what a function's code does:

1. **Every write goes back through the policy boundary.** A function writes via
   `ctx.bounded` (the data plane), so authorization rules are enforced and
   declared invariants are re-checked. A function **cannot break a declared
   invariant** — a violating write comes back as a `409` and throws inside the
   function.
2. **Invocation is policy-gated.** *Who* may call a function is the `auth`
   expression — a policy rule, evaluated by the **same engine** as your
   read/create rules, **before** the function runs. Authorization stays
   declarative and analyzable; it does not live in the function body.

What is **not** proven: the function's own logic (the third-party call, the
transform). That's the deliberate trade — imperative power in exchange for
"Bounded proves declared invariant obligations, enforces authorization rules,
and does not prove the function body."

**Caller-scoped vs service identity.** A normal function writes as the verified
caller, so `auth: "true"` means any logged-in caller may invoke it and
`ctx.bounded` still cannot exceed that caller's data-plane authority. A function
that declares `actAs` writes as a backend/service identity and is therefore
privileged: deploy requires its `auth` rule to imply the app's admin predicate
using a runtime-valid expression such as `get(/admins/@user.id).active == true`
(`.active == true` implies the row exists, so it satisfies the deploy gate while
giving you a real off-switch - see [admin-and-ownership.md](admin-and-ownership.md)).
Declare and bootstrap that `admins/$userId` scope before deploying an `actAs` function.

## When to reach for a function — read this first

A Function's **imperative body is not itself proved by `bounded verify`**.
Default to enforced rules and declared invariant obligations, then hooks; reach
for a function **only when the logic must leave the boundary** (external API,
secrets, complex imperative work). The full
decision guide — the hierarchy, the agent-facing rule, and concrete
function-vs-not examples — is its own doc:

> **[functions-when-to-use.md](functions-when-to-use.md) — when to use a function (and when NOT).**
> Read it before adding a function.

One-line rule of thumb: if the logic must *pull from / push to* the outside
world and *then* write, it's a function. If it only *reacts* to a write, it's a
hook (in-boundary) or a webhook (notify-out). Heavy/long compute or
native-binding npm is **not** Bounded — use your own server as a `@bounded-sh/server`
client.

## Declare a function (policy)

Functions live in a top-level `functions` block — a sibling of your collection
paths and `links`, declared once at the root of the policy:

```json
{
  "constants": {
    "FOUNDER": "<founder-user-id>",
    "SUBS_SYNC_ACTOR": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm"
  },
  "subs/$userId": {
    "rules": {
      "read": "@user.id != null && @user.id == $userId",
      "create": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "update": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "delete": "false"
    },
    "fields": { "active": "Bool", "renewsAt": "UInt" }
  },
  "stripeCustomer/$customerId": {
    "rules": {
      "read": "@user.id != null && get(/admins/@user.id) != null",
      "create": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "update": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "delete": "false"
    },
    "fields": { "user": "String" }
  },
  "admins/$adminId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && (get(/admins/@user.id).active == true || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true"
    },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "syncStripe": {
      "auth": "@user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/syncStripe.ts",
      "actAs": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm",
      "timeout": 30,
      "secrets": ["STRIPE_KEY"]
    }
  }
}
```

Seed `admins/<FOUNDER>` once as the founder after deploy, with `{ "active": true }`.
`bounded data set` does not bypass rules; the founder disjunct is what makes the
first write possible. After that, active admins may create later admin rows. See
[admin-and-ownership.md](admin-and-ownership.md#bootstrapping-the-first-admin--the-genesis-flow).
The gate is a **real off-switch**: every privileged rule and the `syncStripe`
`auth` read `get(/admins/@user.id).active == true`, so setting a compromised
admin's row to `{ "active": false }` immediately blocks them from invoking this
`STRIPE_KEY`-signing Function. An active admin performs that deactivating write;
`update` also requires `.active == true`, so a deactivated admin cannot reactivate
themselves. Because this `admins` registry declares `active`, do not gate on
`get(/admins/@user.id) != null` alone - existence never consults `active`, leaving
this money-adjacent Function with no working revocation. (A registry that declares
**no** `active` field may gate on bare existence and revoke by deleting the row;
this example ships `active`, so its gate must read it.)
Replace the sample sync address with one dedicated to your app, using the same
public address for both `SUBS_SYNC_ACTOR` and `syncStripe.actAs`. Admins may
invoke the Function, but only that service identity may create or update
subscription rows; an admin cannot bypass the Function with a direct client
write. That same identity owns the `stripeCustomer/$customerId -> user` mapping,
which a verified Stripe webhook writes on Checkout completion; `syncStripe` reads
the credited account from that mapping instead of trusting a caller-supplied id.
For offchain data writes, the owner-declared `actAs` identity does not
need a private key; cryptographic/onchain signing does.

*(This exact snippet validates clean against the real policy validator.)*

| Key | Meaning |
|---|---|
| `auth` | **Required.** The invocation rule — a policy expression (same language as `rules`). `@user` is the verified caller — `{ id, address, email }` where `@user.id` is the universal stable identity (always present), `@user.address` is a real onchain wallet (present by default for supported email/social logins too, and null for phone-only sessions, `auth.wallets: false` apps, and the legacy lazy `authMode: "bounded"` path), and `@user.email` is the verified email (null for wallet logins). `"true"` = any logged-in caller; `get(/admins/@user.id).active == true` = only active admins (a real off-switch). Gate identity/membership on `@user.id`. Evaluated before the function runs; deny → `403`. |
| `entry` | **Required.** Relative path to the function's source file (e.g. `functions/syncStripe.ts`). No absolute paths, no `..`. |
| `timeout` | Optional. Per-invocation wall-clock seconds, `1`–`300` (default `30`). |
| `secrets` | Optional. UPPER_SNAKE_CASE names exposed to the function as `ctx.env.*`. Only declared names are surfaced. Rejected under top-level `oapp: true`; an oApp function must omit this key. `actAs` is not a secret and remains allowed. |
| `sandbox` | Optional. `true` or `{ "enabled": true }` opts this function into app-scoped `ctx.sandbox` container operations. Omitted/`false` keeps `ctx.sandbox` unavailable. Use only for trusted backend jobs that need isolated command/file execution. **Concurrency-bounded:** a sandbox container is a real shared resource, so an app (and an account, across its apps) may only hold a limited number of live containers at once - each distinct `scope` you pass is a distinct container that counts toward the limit, and a container stays counted for a short idle window after your call returns (it is kept warm, not destroyed). Exceeding the limit is a fail-closed `429` `sandbox_concurrency_limit` (with `retryAfterMs`); reuse the **same** `scope` for sequential steps that share a workspace so they share one container instead of each consuming a slot. Sandbox is a paid capability - a plan (or account) with no sandbox allowance is refused with `403` `sandbox_capability_plan_gated`. |
| `build` | Optional. Grants app-build origination via `ctx.build` (the unified Build system — successor to `ctx.oapps`). `{ profile, create?, edit?, fork?, view?, cancel? }` — the capability *is* the authority (invariant 4). **Cannot** be combined with `webhook` or `browser`: a build capability on an unauthenticated Internet surface would let anonymous callers spend the owner's build funds, so the validator rejects both combinations. Promotion and gate-decision authority are never grantable. See [§ctx.build](#ctxbuild--governed-app-builds). |

**Auth-by-policy is the point.** Because the invocation rule is evaluated by the
same engine as your data rules, "who can call this when" is declarative,
consistent, and analyzable — not buried in imperative code.

## Write a function (the `ctx` API)

A function is a default-exported async function. It receives the caller-supplied
`args` and an injected `ctx`:

```ts
export default async function (args, ctx) {
  // ctx.user   — the verified caller, or the service identity when actAs is set
  //              (the invocation auth gate still evaluated the original caller first)
  // ctx.bounded — pre-authed @bounded-sh/client client; writes go THROUGH invariants
  // ctx.env    — the resolved secrets (declared names): app-store + deploy-time
  // ctx.secrets — await ctx.secrets.get("NAME"); the documented secret accessor
  // ctx.ai     — built-in AI router, no provider key in app code
  // ctx.services — managed third-party API discovery/invoke
  // fetch      — standard outbound HTTP
  return { ok: true };
}
```

| `ctx` member | What it is |
|---|---|
| `ctx.user` | `{ id, address, email, claims, system? }` — the verified caller for a normal function. `ctx.user.id` is the **universal stable identity** (always present; equals `@user.id` in policy) — use it for ownership/membership. `ctx.user.address` is a **real onchain wallet** (equals `@user.address`; present by default for supported email/social logins, null for phone-only sessions, `auth.wallets: false` apps, and the legacy lazy `authMode: "bounded"` path) — use it only for onchain/wallet semantics. For an `actAs` function, Bounded first evaluates `auth` against the original caller and then sets `ctx.user.id == ctx.user.address == actAs`; `ctx.bounded` uses that same service identity. The function body does not receive the original caller as `ctx.user`. |
| `ctx.auth` | `{ enforced, rule, system }` — **authorization the platform ALREADY did for you.** `rule` is the exact policy `auth` expression that passed before your code ran (null for system/scheduled runs). Read this instead of re-implementing authz: if you declared an `auth` gate, it has already passed. |
| `ctx.bounded` | A pre-authed data client: `ctx.bounded.get(path)`, `.set(path, doc)`, `.setMany([{ path, document }, ...])`, `.delete(path)`, and `ctx.bounded.runQuery(path, queryName, args?)`. **Writes are re-checked by enforced rules and proved invariant obligations** — a `409` throws. `setMany` is one atomic batch, so use it for transfers/settlement. `runQuery` runs one of your policy-declared, deploy-validated queries under the acting identity's read authority, so you **reuse policy logic for authz/data instead of re-implementing it** (e.g. an `isTeamMember` query). A query participates in a proof only when a supported proof obligation references it. |
| `ctx.env` | The resolved secrets, narrowed to the names in `functions.<name>.secrets`. Values come from the app secret store (`bounded secret put`); bare `--secret NAME` declares exposure on a standalone deploy, while legacy `--secret NAME=VALUE` overrides the store for that function version. Nothing undeclared leaks in. |
| `ctx.secrets` | The documented secret accessor: `await ctx.secrets.get("NAME")` returns the value (or null). Reads the **same** resolved map as `ctx.env`, so `bounded secret put OPENAI_KEY …` → `ctx.secrets.get("OPENAI_KEY")` works. See [secrets.md](secrets.md). |
| `ctx.ai` | **The built-in AI router — chat (`run`), images (`generateImage`), video (`generateVideo`/`getJob`). No API key.** Routes any model through the Bounded AI Gateway, billed to the app owner's AI/external-services bucket, capped fail-closed. This is how you add an LLM — or native image/video generation — to your app; see [§ctx.ai](#ctxai--real-ai-no-api-keys) and [§media](#ctxai-media-generation--images-sync-and-video-async-jobs) below. |
| `ctx.services` | **Managed third-party API discovery and proxy invoke — `search`, `describe`, `invoke`.** Search/describe help agents find the right API shape. Invoke runs through Bounded's managed provider proxy, billed to the app owner's AI/external-services bucket at the applicable upstream service cost plus 5%, capped fail-closed. See [§ctx.services](#ctxservices--managed-api-discovery-and-invoke). |
| `ctx.enqueue` | **Background jobs — `ctx.enqueue(functionName, payload?, opts?)` → `{ jobId }`.** Schedule another deployed function (or this one) to run *later*, server-side, without blocking. The queued run executes as the **null system principal** (`ctx.user == null`), never as the enqueuer, so the target must opt in with `queueCallable: true` in policy; it receives `payload` as its `args` and meters compute usage exactly like an HTTP invocation. See [§ctx.enqueue](#ctxenqueue--background-jobs). |
| `ctx.build` | **Governed app builds — `create` / `edit` / `fork` / `get` / `cancel`.** Present only when the function's policy declares a `build` capability; otherwise every method returns `{ ok: false, reason: "build_capability_missing" }` with no network call. Originates AI app builds through the unified Build control plane, funded and governed by the named build profile. See [§ctx.build](#ctxbuild--governed-app-builds). |
| `fetch` | The standard global — call any third-party API (a broker, a data feed, Stripe…). **For LLM/AI inference use `ctx.ai`, not `fetch` + your own key.** For Bounded-managed service proxies use `ctx.services`; for providers you integrate directly, keep keys in `ctx.secrets`. |
| `ctx.appId` | The app this function belongs to. |

```ts
export default async function (args, ctx) {
  // gate awareness — the platform already enforced your `auth` rule; don't redo it
  // ctx.auth -> { enforced: true, rule: "@user.id != null", system: false }

  // reuse a policy-declared named query instead of re-implementing the logic
  const total = await ctx.bounded.runQuery(`polls/${args.pollId}`, "total", {});
  return { total };
}
```

```ts
// one atomic settlement batch; nothing partial commits
export default async function settleTrade(args, ctx) {
  const buyer = ctx.user.id;
  const good = await ctx.bounded.get(`goods/${args.goodId}`);
  const sellerWallet = await ctx.bounded.get(`wallets/${good.holder}`);
  const buyerWallet = await ctx.bounded.get(`wallets/${buyer}`);

  await ctx.bounded.setMany([
    { path: `goods/${args.goodId}`, document: { ...good, holder: buyer } },
    { path: `wallets/${good.holder}`, document: { ...sellerWallet, ink: sellerWallet.ink + good.price } },
    { path: `wallets/${buyer}`, document: { ...buyerWallet, ink: buyerWallet.ink - good.price } },
  ]);
  return { ok: true };
}
```

You only write the function body; Bounded handles the wrapper around it.

## ctx.ai — real AI, no API keys

**If your app needs an LLM, you do not need an OpenAI/Anthropic key or endpoint.**
Bounded is your AI router. Call `ctx.ai.run(model, input)` inside any function: it
routes through the Bounded AI Gateway, billed to the **app owner's**
AI/external-services bucket, and
**capped fail-closed** (over budget → the call is denied, never a surprise bill).
This is the difference between an app that *actually reasons* and one that fakes it
with templated strings — reach for `ctx.ai`, not `Math.random()`.

```ts
// functions/scout.ts — real inference, zero keys
export default async function (args, ctx) {
  const operationId = `scout:${args.deskId}:${args.id}:v1`;
  const out = await ctx.ai.run("claude-opus-4-8", {        // any model the gateway routes
    messages: [
      { role: "system", content: "You are a markets analyst. Return ONE JSON thesis." },
      { role: "user", content: args.headlines },
    ],
  }, { idempotencyKey: operationId });
  const text = out.response ?? out.choices?.[0]?.message?.content;
  await ctx.bounded.set(`desks/${args.deskId}/theses/${args.id}`, JSON.parse(text));
  return { ok: true };
}
```

- **Contract:** `ctx.ai.run(model: string, input: any, options: {
  idempotencyKey: string }): Promise<any>`. The key is required and must be a
  1–256-byte UTF-8 string. `model` is
  config (swap models with no code change); `input` is the provider request shape
  (`{ messages: [...] }` for chat).
- **Model ids — LOOK THEM UP, never guess.** The platform admits and prices
  models from **Cloudflare's AI Gateway catalog**; a model absent from it
  refuses with `ai_model_price_unavailable` (400) before any provider work or
  charge. The authoritative, always-current list is
  <https://developers.cloudflare.com/ai-gateway/supported-models/> — fetch it
  (the page has a "View as Markdown" export) whenever you are about to write a
  `ctx.ai.run` call and are not certain the id exists, and use the id exactly
  as listed. Do NOT trust model names from training memory: providers rename
  and retire ids faster than any documentation snapshot, and a plausible-
  looking id that is not in the catalog fails every call.
- **Id shapes.** Bare ids for well-known families normalize automatically
  (`claude-*` → `anthropic/`, `gpt-*` → `openai/`, `grok-*` → `xai/`,
  `deepseek-*` → `deepseek/`, `kimi-*` → `moonshotai/`); `@cf/...` ids are
  Cloudflare-hosted. Known-good, verified live 2026-08-08: `gpt-5.6-luna`
  (cheapest frontier), `gpt-5.6-sol`, `claude-opus-4-8`, `claude-sonnet-5`,
  `claude-haiku-4-5`, `xai/grok-4.5`, `deepseek/deepseek-v4-pro`,
  `moonshotai/kimi-k3`, `@cf/zai-org/glm-5.2` — treat this list as examples,
  not the catalog; the URL above is the catalog.
- **Make the key a business operation, not an invocation.** AI operation keys
  are **app-global** across function names, principals, manual/scheduled paths,
  and retries. Include the callsite/entity/revision when work may intentionally
  differ, for example `prospect:<id>:assessment:v2`. The same key and exact
  model/input/actor replay the stored terminal result without another provider
  call or charge. Reusing it with changed model/input/actor/kind returns `409
  ai_operation_idempotency_conflict`.
- **Direct invokes need outer replay provenance too.** A browser/server call to
  the function must supply an HTTP `Idempotency-Key` in the invoke options;
  scheduled/system calls already carry stable provenance. Without replay-safe
  provenance, a cost-bearing `ctx.ai`/`ctx.services` call fails `503` before
  billing or provider contact.
- **Billing is pinned at admission.** The operation stores its exact model price
  row and pricing-table timestamp before reserving an upper bound. Success
  settles exact reported usage plus the documented 5% and releases the rest;
  cache reads cost 0.1× input, five-minute cache writes 1.25×, and one-hour cache
  writes 2×. A pricing rollover during the call cannot change its settlement.
  Missing/unpriceable usage or an ambiguous provider-started outcome becomes a
  durable `503 ai_operation_attention_required`; it is never guessed, refunded,
  or rerun as fresh provider work. Confirmed pre-provider/provider failures are
  refunded and replay their terminal error.
- **Model ids:** both provider-prefixed ids (`anthropic/claude-sonnet-5`,
  `openai/...`) and Workers-AI ids (`@cf/zai-org/glm-5.2`) route through the
  gateway. If a provider-prefixed id returns *"provider models not enabled for
  this gateway"*, that deployment's provider allowlist is off — fall back to an
  `@cf/*` model and report it. Avoid dated `@cf` model ids from memory; Workers
  AI deprecates them (a 5028 "deprecated" error means pick a current one).
- **Cap it provably.** The per-account AI/external-services bucket is the platform ceiling. For a
  *per-user* / *per-app* AI budget you can prove, write an append-only spend event
  under a `rollingSum` in the same flow (the
  [spend-cap recipe](invariants.md#rollingsum--caps-over-time-windows)) — so "this
  desk spends ≤ $X/day on reasoning" is an invariant, not a hope.

### How your user pays for it — route through Bounded, don't hand-roll

AI/external-services credit is **per-account** (the app owner). Two things to wire and to tell the user:

1. **Use the owner's Bounded account.** Wallet/keypair owners should run
   `bounded link` to attach the owner key to a web account (also the day-one
   key-safety step). Web-account owners should run `bounded account use --web`
   and `bounded login --email ...`. Billing and buckets live on that account.
2. **Top up through Bounded** — never a custom checkout:
   - Stripe: `POST /billing/checkout { kind: "services_topup" }` -> redirect the user to the returned `url`.
   - Crypto (USDC on Solana): `POST /billing/x402/intent` -> pay -> `POST /billing/x402/settle`.
   - Free includes up to $3 of metered AI/external-services usage per rolling 30 days, shared by Build, `ctx.ai`, and `ctx.services`; it allows one Build at a time and cannot top up.
   - Pro ($25/mo) gifts $5/month of AI/external-services credit and $30/month of Bounded infra credit; Team ($99/mo) gifts $20/$100. AI Build consumes the same measured bucket. Top-ups require Pro-or-better.

   Full rails, amounts, and webhooks: [billing.md](../../bounded/docs/billing.md). **If your app
   charges *its own* users for anything, route that through Bounded billing too** —
   don't build a parallel payment page that bypasses the metered, fail-closed ledger.

> The same `ctx.ai` powers AI NPCs / AI players in live rooms (funded via
> `session.live.runAs`); that live-tick path is in [ai-npcs.md](ai-npcs.md). The
> function path above is the **general case for any app**.

### ctx.ai media generation — images (sync) and video (async jobs)

`ctx.ai` also generates **images and video natively** — same no-keys posture,
same fail-closed per-call billing (a per-image / per-second ceiling is reserved
before generation; the actual is settled and the difference refunded; every
failure refunds in full). **Never wire an image/video provider with `fetch` +
your own key — this is built in.**

```ts
// IMAGE — synchronous (seconds). Default model needs zero config.
export default async function makeAvatar(args, ctx) {
  const img = await ctx.ai.generateImage({
    prompt: args.prompt,                    // required
    destinationPath: "avatars",             // a policy-declared type:"storage" collection
    // model?: "@cf/black-forest-labs/flux-2-klein-4b" (the default, FLUX.2, ~1¢)
    // size?, steps?, seed?, negativePrompt?, metadata? (declared fields)
    // returnBase64: true  — skip storage, get raw bytes back (≤8MB)
  });
  // img: { filePath, url?, contentType, model, costCents }
  await ctx.bounded.set(`profiles/${ctx.user.id}`, { avatar: img.filePath });
  return { avatar: img.filePath };
}
```

```ts
// VIDEO — an async JOB (generation takes minutes). Start it, then let the
// frontend live-subscribe to the mirror doc; or poll ctx.ai.getJob(jobId).
export default async function makeClip(args, ctx) {
  const { jobId, jobPath } = await ctx.ai.generateVideo({
    model: "replicate/wan-video/wan-2.7-t2v",  // always explicit for video
    prompt: args.prompt,
    durationSeconds: 8,                        // clamped to the model's max
    destinationPath: "clips",                  // policy-declared storage collection
    // jobPath?: "aiJobs" — declare aiJobs/$jobId in policy and the job status
    // mirrors there as a normal live-subscribable document
  });
  return { jobId, jobPath };                   // jobPath null if not declared
}
```

The essentials:

- **Images land as normal Bounded files** in the storage collection you name —
  queryable, read-rule governed. `filePath` is the durable reference; **persist
  that, not `url`** (a file in an anonymous-readable collection has a tokenless
  permanent URL; a gated file's url is a ~60-second signed link). Resolve fresh
  URLs via `getFiles`.
- **Video completes through a job doc**: `status` walks pending → running →
  succeeded/failed; on success the mp4 is at `filePath`. Declare
  `aiJobs/$jobId` (any non-storage collection) in policy and the frontend gets
  completion via ordinary `subscribe` — no polling loop. Jobs that stall are
  failed + **fully refunded** after a 15-minute timeout; terminal job records
  prune after ~7 days (the FILE is app data and is never pruned).
- **Models are config, not code.** Current lineup: images —
  `@cf/black-forest-labs/flux-2-klein-4b` (default, ~1¢), `flux-2-klein-9b`,
  Leonardo `lucid-origin`/`phoenix-1.0` (all keyless `@cf`), and
  `openai/gpt-image-2` (provider-routed); video —
  `replicate/wan-video/wan-2.7-t2v` (audio, 1080p, 2–15s) and
  `replicate/minimax/hailuo-02`. Provider-prefixed media models need the
  deployment's allowlist + media route (like chat's provider models); `@cf/*`
  image models work everywhere with zero config. An unpriced model is rejected
  403 (`ai_media_model_unknown`) — fail-closed, never a surprise bill.
- **Branchable errors:** `ai_content_moderated` (422, provider content policy —
  refunded), `ai_credit_exhausted` (402), `ai_media_route_missing` (403, the
  deployment hasn't enabled that provider). Catch `e.code`, don't regex messages.
- **Note:** media-priced models are rejected on `ctx.ai.run` (400,
  `ai_media_model_requires_media_api`) — chat's flat per-call billing would
  massively under-charge a diffusion model. Use `generateImage`/`generateVideo`.

## ctx.services — managed API discovery and invoke

Use `ctx.services` when a function or agent needs a third-party API that Bounded
can proxy for the app. This is the managed path for "find the right API, inspect
its schema, then call it" without putting provider credentials in app code.

```ts
export default async function sports(args, ctx) {
  const catalog = await ctx.services.search("sports odds", { limit: 5 });
  const docs = await ctx.services.describe("the_odds_api");

  const games = await ctx.services.invoke("THE_ODDS_API_GET_ODDS", {
    sport: args.sport ?? "basketball_nba",
    regions: "us",
    markets: "h2h"
  }, { idempotencyKey: `sports:${args.id}:odds:v1` });

  await ctx.bounded.set(`sportsSnapshots/${args.id}`, {
    at: Date.now(),
    games: games.result
  });
  return { ok: true, catalog, docs };
}
```

- **Contract:** `ctx.services.search(query, { limit? })`,
  `ctx.services.describe(toolkitOrToolSlug, { limit? })`, and
  `ctx.services.invoke(toolSlug, args, { idempotencyKey: string; entityId? })`.
  The required key is a 1–256-byte UTF-8 string. `args` must be an immutable
  plain finite JSON object when provided (the whole argument may be omitted): no
  `undefined` inside it, non-finite numbers, `BigInt`, sparse
  arrays, accessors, cycles, class instances, `Date`, `Map`, or `Set`.
- **Replay/conflict:** service operation keys are app-global. The same key,
  normalized tool, effective entity, account, and exact snapshotted args replay
  one stored response. Changed tool/args/entity returns `409
  service_invoke_operation_conflict`; an in-flight duplicate returns retryable
  `503 service_invoke_in_flight`. Provider/charge/result-persistence ambiguity
  becomes permanent `503 service_invoke_outcome_unknown` and never calls the
  provider again. `entityId` defaults to the account id, is part of the
  fingerprint, and is also the provider/Observe entity.
- **CLI discovery:** during build, agents can run
  `bounded services search "<query>" --json` and
  `bounded services describe <toolkit-or-tool-slug> --json` to inspect the same
  managed catalog before writing function or agent code.
- **Two use cases:** search/describe are for build-time and agent planning;
  invoke is the runtime tool call. A Flue agent can expose a small wrapper around
  `ctx.services.invoke` as one of its tools.
- **Billing:** search/describe are catalog reads. Invoke is cost-bearing and
  bills the app owner's AI/external-services bucket at the underlying service
  call cost plus 5%. Composio standard and pro-tool calls are itemized
  separately; the 5% Bounded markup is applied to whichever tier the tool uses.
  The same fail-closed bucket/cap rules as `ctx.ai` apply.
- **Refunds:** tool/auth/admission failures happen before charge. After charge,
  confirmed non-OK transport/provider failures refund through their own
  idempotent operation. A lost refund confirmation is queued for retry and the
  persisted terminal response is replayed; caller retries never invoke or
  refund twice. A successful provider result that cannot be durably persisted
  is outcome-unknown, not permission to replay paid work.
- **Provider key UX:** if Bounded has not configured an upstream provider key for
  a selected provider, discovery still works but `invoke` throws
  `provider_key_not_configured` with a hint. Choose an enabled managed provider,
  ask Bounded to enable that provider, or integrate the provider directly with
  `fetch` and your own key in `ctx.secrets`.
- **Opt-out:** if you integrate a provider directly, you pay that provider
  directly and Bounded's managed proxy markup does not apply.

### Chain data toolkits: helius, alchemy — read-only, metered like every managed service

Onchain data lives in the same catalog. Two Bounded-local toolkits — `helius`
(Solana: JSON-RPC reads, DAS asset lookups and search, parsed transaction
history) and `alchemy` (EVM: JSON-RPC reads, token balances/metadata, transfer
history) — resolve through the same `search`/`describe`/`invoke` calls:

```ts
const acct = await ctx.services.invoke("HELIUS_RPC_CALL", {
  method: "getAccountInfo",       // read-only allowlist — writes are rejected
  params: [address, { encoding: "base64" }]
});
const bal = await ctx.services.invoke("ALCHEMY_TOKEN_BALANCES", {
  network: "base-mainnet",        // validated against Bounded's EVM network registry
  address: wallet
});
```

- **Read-only, enforced:** the RPC passthrough tools accept only an explicit
  allowlist of read methods (`getAccountInfo`, `getProgramAccounts` with
  filters, `eth_call`, `eth_getLogs` with a bounded block range, …).
  `eth_sendRawTransaction`, `sendTransaction`, and every signing or
  state-changing method is rejected fail-closed — unknown methods too. Sending
  transactions is a different plane (onchain collections), never this proxy.
- **Metered like every managed service:** each tool has a published provider
  cost (Helius credits / Alchemy compute units) billed to the app owner's
  AI/external-services bucket at cost + 5%, charged before the call and
  refunded if the provider errors. Same fail-closed 402
  (`services_credit_exhausted`) as the rest of `ctx.services`.
- **Rate-isolated per app:** bursty apps get a 429 `chain_data_rate_limited`
  instead of exhausting the shared provider plan.
- `describe("helius")` / `describe("alchemy")` list every tool with its input
  schema and per-call cost. For when to use these versus onchain collections
  and chain views, see the bounded-onchain skill's `chain-data.md`.

For transactional email, SMS, or WhatsApp, use a real provider integration and
keep provider keys in secrets. Do not expose a shared provider key or treat
Bounded Auth OTP as recipient consent for app-originated messages.

## ctx.browser — drive a headless browser, fenced by your egress

Use `ctx.browser` when a function needs to SEE a real page: smoke-test your own
deployed app, read a page that has no API, or prove something renders. It drives
a managed headless browser server-side — no browser dependency in your code.

```ts
export default async function smokeTest(args, ctx) {
  const drive = await ctx.browser.run({
    idempotencyKey: `smoke:${args.checkId}:v1`,
    steps: [
      { action: "goto", url: "https://myapp.bounded.page/" },
      { action: "waitFor", selector: "#app-shell" },
      { action: "readText" },
      { action: "screenshot" }
    ],
    maxSeconds: 45
  });
  return { healthy: drive.ok, sawText: drive.text[0], paid: drive.costMicroUsd };
}
```

Steps are a fixed vocabulary: `goto` (url), `click`/`waitFor` (selector),
`fill` (selector + value), `readText` (optional selector; captured into
`result.text`), `screenshot`. The drive stops at the first failed step and
reports it in `result.steps` — it never throws for a step failure.

**The egress fence.** A browser is the most complete egress bypass there is — one
page load can pull from any host — so every navigation AND every sub-resource the
page requests is checked server-side against the calling FUNCTION's declared
egress (`functions.<name>.egress`, ceilinged by the app-wide `boundaries.egress`).
An undeclared host refuses with `egress_denied` (403) before a session is even
opened; a page that reaches for an undeclared host mid-drive has that request
blocked. An app that declares no egress at all is unfenced, exactly like raw
`fetch`.

**Billing.** Browser time bills per SECOND of open session against the app
owner's prepaid services credit, fail-closed, and settles to actual elapsed
seconds (`result.billedSeconds`, `result.costMicroUsd`, plus the uniform
`result.meter` capability-spend fact). `maxSeconds` (default 60, ceiling 300) is
your own spend fence — the reservation is taken up front and released on settle.

**Replay safety.** Like `ctx.ai`, `ctx.browser.run` requires `idempotencyKey`
and a replay-safe invocation (an `Idempotency-Key` header on direct invokes —
`bounded functions invoke ... --idempotency-key <key>` — or a scheduled run). A
retried invocation replays the SAME drive result instead of opening and billing
a second session. Errors carry stable codes to branch on: `egress_denied`,
`browser_unavailable`, `browser_busy`, `browser_request_invalid`.

### Driving your app SIGNED IN — the agent identity

Most of an app sits behind a login, so a logged-out drive can only ever check the
front door. Add `as` and the drive runs as your app's **agent identity**: a
normal, non-privileged user whose key the platform holds — the principal
Bounded's agents act as *inside* your app.

```ts
const drive = await ctx.browser.run({
  idempotencyKey: `dashboard-check:${args.checkId}:v1`,
  as: { identity: "agent" },              // ← log the drive in
  steps: [
    { action: "goto", url: "https://myapp.bounded.page/dashboard" },
    { action: "waitFor", selector: "#ready" },
    { action: "readText", selector: "#ready" }
  ],
  maxSeconds: 60
});
```

**You declare what it may do, and nothing else.** Put its address in `constants`
and write rules against it in the same language as any other principal. Z3 proves
over it like anything else, and on an oApp it is published in the constitution —
so holders can see that a key the platform holds can act in the app, and exactly
what it may do:

```json
{
  "constants": { "AGENT": "<the address Bounded shows you for this app>" },
  "readings/$id": {
    "fields": { "value": "Number" },
    "rules": {
      "read": "@user.id == @const.AGENT || @user.id == $owner",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  }
}
```

**Grant it the least it needs, and on a live app that usually means READ.** Follow
this one literally, because that grant *is* the whole blast radius: logging a
browser in means the token lives in your app's own `localStorage`, where your
app's page can read it. That is inherent to seeding a browser session, and it is
safe only because the token can do nothing beyond what you declared for that
address. Read is enough to answer "does the dashboard render for a signed-in
user", which is what most drives are for. To exercise WRITE paths — signup,
checkout, delete — use disposable data; never widen the agent's authority on a
live app to make a test pass.

**The platform resolves everything sensitive, and you cannot pass it.** There is
no field for a token, an address or an origin, and supplying one is refused
rather than ignored. Bounded mints the session server-side, seeds it before any
page script runs, and only at an origin your app itself declares — so the drive's
first navigation must target one of your app's own origins. `identity` is a
closed set, today just `"agent"`.

Extra codes on this path: `agent_identity_unavailable` (the platform could not
produce the identity — a misconfiguration, not your app's fault),
`agent_session_mint_failed` (the auth issuer declined),
`target_app_origin_undeclared` (the first navigation is not an origin your app
declares), `target_app_origin_unresolved` (your app declares no https origin to
seed at), and `drive_not_authorized` (driving a DIFFERENT app — an app's agent
identity is granted to the platform, not to whichever app names it, so only
self-drive is authorized).

## ctx.enqueue — background jobs

When a function should kick off work that shouldn't block the caller — fan-out,
a slow follow-up step, a ret-on-failure pipeline — use `ctx.enqueue`. It schedules
a **separate, later** invocation of a deployed function and returns immediately:

```ts
export default async function placeOrder(args, ctx) {
  await ctx.bounded.set(`orders/${args.id}`, { status: "pending", buyer: ctx.user.id });

  // Hand the slow work off to a background job — returns right away.
  const { jobId } = await ctx.enqueue("fulfillOrder", { orderId: args.id });

  // Optionally schedule a delayed retry/reminder (up to 24h out).
  await ctx.enqueue("checkOrderStuck", { orderId: args.id }, { delaySeconds: 3600 });

  return { ok: true, jobId };
}

// Runs LATER as the null SYSTEM principal (ctx.user == null, ctx.auth.system == true) —
// a queued replay is NEVER deputized as the enqueuer. The target must opt in with
// `queueCallable: true` in policy (below); pass any identity the job needs through the
// payload (it arrives as `args`), not via ctx.user.
export default async function fulfillOrder(args, ctx) {
  // ctx.user is the null system principal here; args.orderId + args.buyer came from
  // the enqueuer's payload. Do NOT read the caller from ctx.user on a queued run.
  const order = await ctx.bounded.get(`orders/${args.orderId}`);
  // ... do the slow work, write results through ctx.bounded (as system) ...
  await ctx.bounded.set(`orders/${args.orderId}`, { ...order, status: "fulfilled" });
}
```

The queued target must declare `queueCallable: true` in its policy `functions` entry.
This is the explicit opt-in that authorizes a system-principal background run; a target
that has not opted in has its queued replay dropped (fail-closed):

```jsonc
{
  "functions": {
    "placeOrder":  { "auth": "@user.id != null", "entry": "functions/placeOrder.ts" },
    "fulfillOrder": {
      "auth": "false",              // no human may call it directly
      "entry": "functions/fulfillOrder.ts",
      "queueCallable": true          // ...but it MAY run as a queued background job
    }
  }
}
```

- **Contract:** `ctx.enqueue(functionName: string, payload?: unknown, opts?: { delaySeconds?: number }): Promise<{ jobId }>`.
- **What it runs:** `functionName` must be a **deployed function in this app** (a
  function may enqueue another function or itself; validated at enqueue time).
- **How it runs:** a queued replay is **never deputized as the enqueuer** — it runs as the **null system principal** (`ctx.user == null`, `ctx.auth.system == true`, and every `@user.*` resolves to null), regardless of who enqueued it.
  Because the human `auth` rule is written against a real caller, it cannot authorize a null-user run, so the queued lane instead requires the **target** to opt in with `queueCallable: true` in its policy `functions` entry.
  A target that has not opted in is **rejected fail-closed**: the queued message is dropped (a `function_failed` analytics event is emitted for operators) and the human `auth` rule is never evaluated under a null user.
  Pass any caller identity or context the job needs through the `payload` (it arrives as `args`); do **not** expect the enqueuer in `ctx.user`.
  `ctx.bounded` writes from the queued run still pass your `rules` + invariants as the system principal.
- **Public-origin restriction:** `queueCallable` authorizes **trusted** callers (a cron/heartbeat schedule, an internal run, or a user-authenticated function) to drive a system-principal background run - it does **not** authorize the anonymous internet.
  A queued job that **descends from public ingress** (it was enqueued by a `browser`- or `webhook`-public function, or by any descendant of one) is **refused fail-closed** at replay even when the target declares `queueCallable: true`: the message is dropped and a `function_failed` analytics event is emitted, mirroring the build ban on public-origin runs.
  This prevents an anonymous caller from laundering public ingress into a full system-principal run through your enqueue code.
  If a public-facing function needs to trigger background work, do that work inline in the function (still under its own `auth` rule), not by enqueuing a system-principal job.
- **Delivery:** at-least-once, with Cloudflare-managed retries and a dead-letter
  queue. **Make enqueued functions idempotent** so a retry is safe.
- **Limits:** `payload` must be JSON-serializable and ≤ 96,000 UTF-8 bytes;
  `delaySeconds`
  is 0..86400 (24h). One invocation may emit at most 50 enqueue intents.
- **Breadth budget:** each run also carries a bounded **fan-out breadth budget**
  that its descendant background jobs share, so one app cannot multiply itself
  into an unbounded queue backlog. A **single-successor chain** (enqueue one next
  step, e.g. a paginator/cursor loop) is free and runs unbounded; **fanning out to
  many children** spends the budget, and it shrinks for each further generation, so
  deep *recursive fan-out trees* are cut off. If a run tries to fan out beyond its
  remaining budget the whole enqueue drain is refused (the parent invocation
  surfaces a `429` with `enqueue_descendant_budget_exceeded`); the cross-host
  producer refuses with `enqueue_descendant_budget_unavailable`. The ceiling is
  generous - ordinary fan-out and chains are unaffected - so prefer chains over
  wide recursion for large workloads.
- **Billing:** each queued run is driven back through the normal `/invoke` path,
  so it **meters compute usage to the app's request ledger identically to an HTTP
  invocation** — background work is billed like foreground work.

## ctx.build — governed app builds

`ctx.build` lets a function **originate AI app builds** — create a new app, edit
this app, or fork an app it can read — through the unified Build control plane
(the successor to `ctx.oapps`). Every build is funded, rate-limited, and governed
by a named **build profile** in policy; the platform runs the AI build pipeline
(execute → preview → gate → promote) and the function just submits and, if it
wants, polls or cancels the runs it started.

**Authority is the capability, never the caller (invariant 4).** A function can
call `ctx.build` only if its policy entry declares a `build` capability. Without
it, every method returns `{ ok: false, reason: "build_capability_missing" }` and
makes **no network call** — the platform doesn't even hand the isolate the build
credential. The prompt, attachments, and source refs a function submits are
**data**: they can never change who pays, which app is targeted, the model
allowlist, the budget, the landing behavior, or the required gates. All of that
is resolved server-side from the function's identity and the named profile.

```json
{
  "functions": {
    "maintainApp": {
      "auth": "get(/admins/@user.id) != null",
      "entry": "functions/maintainApp.ts",
      "build": {
        "profile": "maintenance",
        "create": true,
        "edit": "self",
        "fork": false,
        "view": "originated",
        "cancel": "originated"
      }
    }
  },
  "build": {
    "defaultProfile": "maintenance",
    "profiles": {
      "maintenance": {
        "landing": "veto-window",
        "vetoWindow": "48h",
        "origins": ["scheduled-function"],
        "funding": { "mode": "split", "aiSource": "owner", "infraSource": "app", "onExhaustion": "park",
                     "aiEnvelopeMicroUsd": 5000000, "infraEnvelopeMicroUsd": 2000000,
                     "allowPerRunEnvelope": true },
        "limits": { "buildsPerDay": 25, "buildsPerMonth": 300, "maxConcurrent": 2 },
        "effortMax": "high",
        "gates": [{ "type": "veto", "audience": "owner", "window": "48h" }],
        "hooks": { "parked": "notifyOwner", "terminal": "notifyOwner" }
      }
    }
  }
}
```

The `auth` rule uses the runtime-valid admin predicate `get(/admins/@user.id) !=
null` (and needs an `admins` scope bootstrapped, as above).
Do **not** write `hasRole("admin")` in an executable `auth` rule: `hasRole(...)`
is a proof-grammar-only construct that parses during verification but has no
runtime evaluator, so it fails validation (fail-closed) or never resolves to the
admin gate - a broken permission check on a money-spending build function.

**The `build` capability keys** (each grants only submission-side authority):

| Key | Meaning |
|---|---|
| `profile` | The named `build.profiles.<name>` this function submits under. Profile selection is an **authority** decision — a function submits only under the profile policy assigns it, never one the caller picks. |
| `create` | `true` lets it originate a **new** app (`ctx.build.create`). |
| `edit` | `"self"` lets it edit **this** app only (`targetAppId == ctx.appId`); cross-app editing is out of v1. |
| `fork` | `true` lets it fork an app it can read (`ctx.build.fork`). |
| `view` | `"originated"` — may read only runs **it** started (`ctx.build.get`). |
| `cancel` | `"originated"` — may cancel only runs **it** started (`ctx.build.cancel`). |

**Promotion and gate-decision authority are never grantable to a function.**
There is no capability key for them — a proposed build is promoted only by the
profile's landing rule (an owner/admin gate decision, a veto window elapsing, or
an explicit auto-promote profile), never by the submitting function.

**Not on public surfaces.** A function that declares `build` **cannot** also
declare `webhook` or `browser`. Those are unauthenticated Internet surfaces (the
browser `origins` allowlist is a CORS control, not authentication), so a build
capability there would let anonymous callers spend the owner's build funds. The
validator rejects `browser`+`build` and `webhook`+`build` at deploy, and the
runtime never injects build authority into a public-ingress invoke.

### The `ctx.build` API

```ts
interface CtxBuild {
  create(input): Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  edit(input):   Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  fork(input):   Promise<{ runId, targetAppId, status } | { ok: false, reason }>;
  get(runId):    Promise<RunView | { ok: false, reason }>;
  cancel(runId): Promise<{ runId, state, outcome } | { ok: false, reason }>;
}
```

Every method **fails soft**: control-plane rejections come back as
`{ ok: false, reason, status? }` (a stable machine `reason` like
`build_capability_missing`, `not_authorized`, `prompt_required`) — they do not
throw. Submissions return **immediately** with `{ runId, targetAppId, status:
"queued" }`; all build work is async, so poll `ctx.build.get(runId)` (or wire
hooks, below) rather than awaiting completion inline.

Submission input is **data only**:

```ts
await ctx.build.edit({
  prompt: "Add a dark-mode toggle to the settings page",
  effort: "standard",                    // "low" | "standard" | "high" (capped by profile.effortMax)
  // targetAppId defaults to ctx.appId (edit: "self" allows only that)
  // source?: { git: { repo, ref } } | { artifact: { artifactId } }   // typed ref; raw creds rejected
  // attachments?: [{ name, contentType, bytes, ref }]                 // run-scoped, size/type-limited
  // constraints?: string[]
  // baseDeploymentId?: "…"              // CAS assertion: reject if the base already moved
  // idempotencyKey?: "…"                // default: hash of the invocation id + this whole submission; see below
  // funding?: { aiEnvelopeMicroUsd: 3000000 }   // per-run AI cap; see below
});
```

**Per-run funding cap.** When the profile opts in with `funding.allowPerRunEnvelope: true`, **any** submission (`create`, `edit`, or `fork`) may carry `funding: { aiEnvelopeMicroUsd }` (a positive safe integer) to narrow **that run's** AI envelope.
The effective envelope is `min(requested, profile.funding.aiEnvelopeMicroUsd)`, so the profile value is a ceiling and is never raisable per-run.
Without the profile opt-in (or with a non-positive/non-integer value) the field is ignored and the profile envelope applies unchanged.
A clamped envelope below the 800000 micro-USD reservation minimum is refused with `400 ai_envelope_below_minimum` rather than run.
The clamped value is snapshotted at admission, and a park/resume re-clamps it to `min(admitted, live profile)`, so an owner may tighten the cap mid-run but can never widen it; every other field of the resolved profile is pinned for the run's whole life, and a drifted profile fails the resume instead of swapping under it.

**The default idempotency key is per invocation, not per prompt.**
When the invocation is replay-safe it hashes the invocation id together with the app id, function name, operation, and the **full** submitted body, so a retry of that one invocation reproduces the key and replays the same run, while any change to the submission (constraints, source, attachments, effort, profile, target, funding cap) is a different key and a different run.
Two *distinct* invocations that submit the same prompt are two distinct funded runs: a nightly schedule builds every night, and a user who resubmits pays for both.
There is no same-prompt or same-day deduplication, so do not rely on the prompt to make a resubmission safe.
An invocation is replay-safe when it carries host-verifiable provenance: an `Idempotency-Key` on a direct invoke, a scheduled dispatch, or a live-room call.
Anything else (a direct invoke with no key) mints a fresh random key per attempt, so every attempt is a fresh funded run.
Pass an explicit `idempotencyKey` whenever retries must converge on one run regardless of how the function was invoked.
Reusing an explicit key with a changed submission (a narrowed funding cap, say) returns `409 idempotency_conflict` rather than replaying.

### Who may see the app a build produces

**Only the owner.** Two build-profile ceilings widen that, and both are **deny-by-default and boolean-exact**: the key must be the literal JSON `true`.
An absent key, or `false`, leaves the ceiling closed.
A non-boolean like `"true"` or `1` fails policy validation, so the deploy is refused rather than quietly leaving the ceiling shut on a value that reads as open.

| Profile key | What it opens | Refusal while closed |
|---|---|---|
| `viewerGrants` | A submission may carry `viewerGrantSubjects`: 1-8 distinct trimmed user ids or emails (320 chars max each) that get read-only view of the child app. | `400 viewer_grants_not_allowed` |
| `publicRuns` | A submission may carry `public: true`, making the run's app viewable by anyone. | `400 public_runs_not_allowed` |

A request over a closed ceiling is **refused, never silently stripped or downgraded**.
The whole submission fails, so you are never told "ok" while your viewers were dropped or while an app you asked to publish stayed private.

**You open a ceiling on the profile the build runs under, in `policy.json`.**
Both are plain booleans on a `build.profiles.<name>` block, and only the literal `true` opens one.

```jsonc
"build": {
  "defaultProfile": "standard",
  "profiles": {
    "standard": {
      "landing": "approval-required",
      "viewerGrants": true,   // submissions may carry viewerGrantSubjects
      "publicRuns": true      // submissions may carry "public": true
    }
  }
}
```

A profile that names neither key keeps the owner-only default, and the ceiling that applies is the one on the profile the submission actually resolves to, so opening it on one profile opens nothing on any other.
Pass `viewerGrantSubjects` from `ctx.build` only when the resolved profile carries `viewerGrants: true`; against a profile without it the whole build is a `400`.
There is no `public` field on `ctx.build` at all, so a function can never request a public run, open ceiling or not.

### Lifecycle hooks — how the build tells your app what happened

Because builds are async, a profile can name functions to invoke on lifecycle
events under `profiles.<name>.hooks`: `submitted`, `preview_ready`, `parked`,
`terminal`. The control plane invokes that function as a **system** run with the
event and `runId` in `args`. This is how you notify an owner, advance a workflow,
or record a result without polling.

```jsonc
"hooks": { "preview_ready": "notifyOwner", "parked": "notifyOwner", "terminal": "recordBuildResult" }
```

A **veto-window** profile auto-promotes when its window elapses with no
objection, so its `parked` hook is **mandatory** — a veto window nobody is told
about is auto-promotion with extra steps, and the validator/runtime enforce that
a `veto-window` profile declares `hooks.parked`.

## Invoke a function

The supported invoke path today is the **CLI**, which attaches your session
token automatically — the **same token** `bounded data` uses — so Bounded
verifies your identity and evaluates the function's `auth` rule before running it:

```sh
bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'
```

It prints the function's JSON result, or fails with a public error such as
`401` not logged in, `403` the `auth` rule denied you, `404` unknown function,
or the error the function threw.

### From TypeScript

Use the first-class `functions.invoke(name, args)` helper (exported from both
`@bounded-sh/client` and `@bounded-sh/server`). It attaches the caller's session token
automatically — the **same** token the data plane sends — so you never hand-roll
auth headers:

```ts
import { functions } from "@bounded-sh/client"; // or "@bounded-sh/server"

const res = await functions.invoke("syncStripe", { customerId });
// → the function's JSON return value.
```

`invokeFunction(name, args)` is the same call as a plain function if you prefer.
Both accept an optional 3rd arg `{ timeoutMs, headers }`. The top-level helper uses
the ambient session — `BOUNDED_PRIVATE_KEY` on the server (set it, or log in on the
browser). To invoke **as a specific keypair** with no env var, use the wallet
client's own method, which authenticates as that wallet (the function's `auth`
rule + `ctx.user` then reflect it):

```ts
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
const res = await vault.invoke("syncStripe", { customerId });
```

The platform gates the call on the function's `auth` rule using the verified
caller, so the identity the function sees is exactly the one your data rules
would see. On failure it throws `FunctionInvokeError` with the public status
code and message.

## Deploy a function

```sh
bounded functions deploy syncStripe \
  --entry functions/syncStripe.ts \
  --app-id <id> \
  --auth 'get(/admins/@user.id).active == true' \
  --secret STRIPE_KEY \
  --timeout 30

printf '%s' "$STRIPE_KEY" | bounded secret put STRIPE_KEY --value-stdin --app-id <id>
bounded functions list   --app-id <id>
bounded functions logs   syncStripe --app-id <id>
```

The `--entry` may be **TypeScript or JavaScript**. Type annotations are fine.
Bare `--secret STRIPE_KEY` declares the name without putting its value in argv;
`secret put` supplies the app-stored value separately.

**A function may be split across files.** Import siblings with ordinary relative
specifiers and deploy the entry as usual - the CLI uploads the entry plus the
source files in its directory, and the platform bundles them:

```
functions/
  syncStripe.ts        ← --entry, imports "./stripe/charges"
  stripe/
    charges.ts
```

Keep a function's modules inside the entry's own directory: that directory is
what gets uploaded, so an import reaching outside it will not resolve. Only
source extensions travel (`.ts`, `.tsx`, `.js`, `.mjs`, `.json`, …) - a README or
a fixture in that folder is ignored - and `node_modules` is never uploaded, so
npm dependencies still cannot be imported. Limits are 100 files, 512 KB per file
and 2 MB total; an oversize tree is refused locally with those same numbers.
Older CLI versions upload only the entry and refuse a relative import at deploy
time with `Relative import ... cannot be resolved`, so if you see that, update.

Two deploy-ordering notes worth knowing:
- **A policy deploy preserves deployed functions.** When your `policy.json` omits
  the `functions` block, the server carries the already-deployed functions (and
  their pinned code versions) forward, so a plain `bounded deploy` no longer drops
  them — no need to re-run `bounded functions deploy` afterward. To remove a
  function, use `bounded functions delete <name>` (a policy that explicitly
  declares `functions` is still honored verbatim). *(Older behavior wiped the
  functions on any policy deploy; fixed in the dev-api 2026-07-09.)*
- **Pins take ~20–30s to propagate.** A 404 right after a successful
  `functions deploy` usually just needs a short wait, not a redeploy.

A function's `console.*` output is **captured** and viewable; **who** may view it
is the per-function `logsAuth` policy rule (defaults to app managers; declared
secret values are redacted). Set a fixed backend identity with `actAs`. In a
policy file these are `logsAuth` and `actAs`; on standalone function deploys,
pass `--logs-auth` and `--act-as` every time so the complete-entry update
preserves them. See [identity-and-logs.md](identity-and-logs.md) and
[service-keys.md](service-keys.md).

Remove or replace a function with the Bounded CLI when you no longer want it
exposed. Deploy validates the function declaration and updates the app's
registered backend code. Only the app owner or an authorized collaborator may
deploy.

## Worked example — sync a Stripe subscription, then write

`functions/syncStripe.ts`:

```ts
export default async function (args, ctx) {
  // Only admins reach here — `auth` gated the original caller before actAs.
  const { customerId } = args;
  if (!customerId) throw new Error("customerId is required");

  // Derive the credited account from a SERVER-HELD mapping, never from a caller
  // argument. `stripeCustomer/$customerId` is written only by the sync service
  // identity from a verified Stripe webhook / Checkout completion, so it is the
  // trusted link between a paying customer and an app account. Any userId in
  // `args` is untrusted and is deliberately ignored — trusting it would let an
  // admin credit their own account using a stranger's customerId.
  const mapping = await ctx.bounded.get(`stripeCustomer/${customerId}`);
  const userId = mapping?.user;
  if (!userId) throw new Error("no verified mapping for this Stripe customer");

  // 1. Pull from a third-party API using a declared secret.
  const resp = await fetch(
    `https://api.stripe.com/v1/customers/${customerId}/subscriptions`,
    { headers: { Authorization: `Bearer ${ctx.env.STRIPE_KEY}` } }
  );
  if (!resp.ok) throw new Error(`Stripe error ${resp.status}`);
  const data = await resp.json();
  const sub = data.data?.[0];

  // 2. Transform.
  const active = sub?.status === "active";
  const renewsAt = sub?.current_period_end ?? 0;

  // 3. Write THROUGH the boundary. If your policy has, say, an invariant on
  //    `subs`, this write is still checked — the function can't bypass it.
  //    ctx.user and the data client act as SUBS_SYNC_ACTOR, the only identity the
  //    collection allows to create/update rows. The original admin is not ctx.user.
  await ctx.bounded.set(`subs/${userId}`, { active, renewsAt });

  return { ok: true, active, renewsAt };
}
```

Invoke it from your admin dashboard with
`bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'`
(or the TypeScript fetch shown above).

Flow: logged-in admin → invoke (attaches token) → Bounded auth gate (verify token →
resolve `@user` → evaluate `get(/admins/@user.id).active == true` → allow) → the
function (fetch Stripe → transform → `ctx.bounded.set`, re-checked by your rules +
invariants as the declared sync service identity) → returns JSON.

> **Caller-supplied ids are untrusted.** The `auth` boundary proves *who may
> invoke* the Function - not *that the Stripe customer belongs to the account being
> credited*. If the Function trusted a caller-supplied `userId`, an admin (or any
> admin-reachable path: a support tool, an automation, a compromised session) could
> pass a stranger's paying `customerId` with their own `userId` and grant
> themselves a subscription paid for by someone else - or point at an unpaid
> customer to mark a real subscriber unpaid. Derive the credited account from the
> server-held `stripeCustomer/$customerId -> user` mapping that only a verified
> Stripe webhook / Checkout completion (running as the sync service identity) may
> write, and ignore any `userId` in the invocation args.

## Scheduled functions (run a function on a cadence)

> **Available now.** A collection's `schedule { every, run }` whose `run` names a
> top-level `functions.<name>` **fires on the cadence**. It can do
> everything a function can — `ctx.fetch` egress, `ctx.ai.run`, and `ctx.bounded`
> writes through your rules + invariants. Use `actAs` on the function to run it as
> a real identity (so its writes satisfy owner/controller rules) — see below.
>
> **One deploy-ordering rule:** deploy the function before, or together with, the
> policy that schedules it. If you deploy the schedule first, deploy or re-deploy
> the function afterwards so Bounded can attach the schedule to the target.

A function is *meant* to be invokable **on a schedule**, not just on demand: a
collection's `schedule { every, run }` (or `dueRows { run }`) whose `run` names a
**function** (instead of a `hooks.scheduled.<run>` bytecode hook) runs that
function on the cadence as the **system principal**.

```json
{
  "constants": { "FOUNDER": "<founder-user-id>" },
  "rollups/$day": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "total": "UInt" },
    "schedule": { "every": "1d", "run": "rollupDaily" }
  },
  "admins/$adminId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && (get(/admins/@user.id).active == true || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true"
    },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "rollupDaily": {
      "auth": "@user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/rollupDaily.ts",
      "timeout": 120
    }
  }
}
```

*(Validates clean and **fires** — `schedule.run` can name either a scheduled hook
or a top-level function. The `admins` registry gates every privileged path on
`.active == true` (a real off-switch: `active: false` revokes a user-invoker, and
`update` itself requires `.active == true`, so no self-reactivation); seed
`admins/<FOUNDER>` `{ "active": true }` once as the founder. Add
`"actAs": "<address>"` to the function block to run it as that identity so its
`ctx.bounded` writes satisfy owner/controller rules; without `actAs` it runs as
the all-null system principal, which cannot bill `ctx.ai` or satisfy
`owner == @user.id`.)*

> **`dueRows.run` → function caveat.** A `dueRows { run }` pointing at a function
> also fires, but the due row's id is **not** yet passed to the function (it sees
> `args = {"__system":"schedule", ...}`, no row id / no `ctx.origin`), and
> `onComplete:"markDone"` does not apply to a function target. For per-row cadence
> use a scheduled **hook** (which gets the row); use `schedule.run` → function for a
> recurring sweep and do row fan-out inside it.

**Three principal contexts, one function.** The same function can run under three
different callers — see [principals-and-origins.md](principals-and-origins.md) for
the canonical explainer:

1. **User invocation** (`bounded functions invoke`) — gated by the function's
   `auth` rule. `@user` / `ctx.user` is the verified caller.
2. **System / scheduled run** (the schedule, below) — authorized by the
   owner-deployed `schedule` itself: it lives in your signed policy, so Bounded
   runs the function as the **system principal** (`@user` all-null), skipping the
   user-facing `auth` rule.
3. **Live game `call`** (a deterministic tick invokes the function) — gated by
   BOTH the game's `session.live.calls` whitelist AND the function's own `auth`
   rule (with `@user` = the live principal and `@origin` populated). Covered next.

Either way every write still goes **through** your rules + invariants via
`ctx.bounded`. `every` accepts `<n>s|m|h|d` (1s–366d); schedules are offchain-only.
Hook form + the full `run` unification:
[hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md).

## Invoked by a live game tick (the `call` path)

A deterministic live tick can reach the outside world by returning a **call** —
`return { state, call: { fn, args, as } }` — which the runtime drains and routes to
function invocation. The tick `call`ing a function is THE primitive behind AI
NPCs, in-game settlement, and a player action that needs external data
([live-runtime.md](live-runtime.md), [ai-npcs.md](ai-npcs.md)). Two gates apply,
and they are **orthogonal** — both must pass:

1. **The game's `session.live.calls` whitelist** — the owner-declared list of
   function names the tick is allowed to invoke at all. A function not on the list
   is unreachable from a tick.
2. **The function's own `auth` rule** — now **evaluated for live calls too**
   (with `@user` = the live principal and `@origin` populated). This is the change:
   the live path no longer skips per-function auth. Gate the function on
   `@origin` so it accepts *only* its own game's tick.

There is no human caller, so `@user` is the **live acting principal**: the
anonymous system principal (`{ id: null, address: null, email: null, system: true }`)
by default, or the identity declared via `session.live.runAs` / the function's
`actAs` (see [principals-and-origins.md](principals-and-origins.md)). The `as`
field on a `call` names which player the tick acts for.

**`@origin` tells the auth rule where the call came from.** For a live tick it is
platform-set and unforgeable — `@origin.kind == 'live'`, with `@origin.module` /
`@origin.room` / `@origin.tick` identifying the source. So a function gates live
callers by combining the whitelist with an `@origin` check in its `auth` rule:

```json
{
  "session": {
    "live": {
      "module": "live/arena.ts",
      "calls": ["npcBrain", "settleRound"]
    }
  },
  "functions": {
    "npcBrain": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/npcBrain.ts"
    }
  }
}
```

`@origin.kind` is always set; gate on `@origin.module` *and* `@origin.kind == 'live'`
(`module` is null for a non-live `kind:'user'` call). `@origin.*` is offchain-only —
forbidden in `onchain:true` rules, like `@user.id`. Inside the function body the
same data is available as `ctx.origin` (`{ kind, path, module, room, tick }` or
null).

The function's `auth` rule uses the same policy expression language as data
rules and is **enforced before the function body runs**. `bounded verify`
understands `@origin` as a first-class special variable and checks the supported
generated obligations that reference the gate; that does not make every auth
expression a blanket proof of product intent.

To ship a **funded** AI NPC, set `session.live.runAs` to a service wallet the owner
funds with AI/external-services credit — then `ctx.ai` in the called function Just Works (capped at
the app account). Per-function `actAs` is the per-call override and wins for that
one function. The anonymous system principal still **cannot** bill AI (`ctx.ai.run`
→ `402`, no account). Precedence: function `actAs` > session `runAs` > anonymous
system. See [service-keys.md](service-keys.md) and [ai-npcs.md](ai-npcs.md) for the
NPC recipe, and [principals-and-origins.md](principals-and-origins.md) for the full
principal matrix.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets` or with a bare,
repeatable `bounded functions deploy --secret NAME`; supply their
**values** with `bounded secret put NAME --value-stdin --app-id <id>` (the per-app secret
store — set once, read by every function/agent in the app). The function reads
them as `ctx.env.K` **or** `await ctx.secrets.get("K")`. Only declared names are
exposed — an undeclared key never reaches the function. Secret values are never written into
the policy and never returned by `functions list` / `secret list`.

On every standalone function redeploy, repeat each bare `--secret NAME` because
the command writes the complete entry. A legacy `--secret NAME=VALUE` deploy-time
override exists and takes precedence over the app-store value for that one
function version. Prefer bare `--secret NAME` plus `secret put --value-stdin` so
values do not appear in argv, process listings, or shell history.

Secret **values** are stored by Bounded and are never written into policy files.
At invocation, the function receives only the names it declared. Use
`ctx.env.STRIPE_KEY` or `ctx.secrets.get("STRIPE_KEY")`; never pass secret values
through client requests.

## Limits

- **Runtime:** hosted JavaScript/TypeScript backend code. Good for API calls,
  transforms, and SDK writes.
- **Timeout:** `1`–`300` s wall-clock per invocation (`timeout`, default `30`).
  **This 300s wall is Functions-only.** For long-running work, use backend
  runtime and split work into scheduled, resumable steps.
- **Not for:** multi-minute jobs or native-binding npm. For **long-running /
  batch / background** work, use a **backend-runtime project** and decompose it
  into scheduled, resumable steps —
  [backend-runtime.md](backend-runtime.md);
  for native-binding npm, use your own server as a `@bounded-sh/server` client.
- **Memory / subrequests:** bounded by the hosted function runtime.

## What's proven vs not

The proof boundary (recap of "Why functions are still safe", above): **proved** —
the declared invariant and generated safety obligations reported by
`bounded verify`; **enforced** — collection authorization rules on every
`ctx.bounded` write and the function's invocation `auth` gate before code runs;
**NOT proven** — the function's own logic (the fetch, the transform) or whether
an authorization rule matches unstated product intent. Keep anything that must
be a proved state guarantee in a declared invariant, not in function code.

Use a policy rule for authorization and a supported declared invariant for a
state guarantee. Treat function code as useful imperative logic, not as a proof
boundary, and call a property proved only when the verifier reports its concrete
obligation as proved.

## Related

- [functions-when-to-use.md](functions-when-to-use.md) — **when to use a function (and when NOT)** — read first
- [principals-and-origins.md](principals-and-origins.md) — **who `@user` is** across user / system / live-call invocation (the canonical principal explainer)
- [ai-npcs.md](ai-npcs.md) — a live tick `call`s a function = an NPC; the `actAs`-funded LLM pattern
- [agents-flue.md](agents-flue.md) — a **multi-step agent** (tool-use loop) when one `ctx.ai.run` isn't enough
- [backend-runtime.md](backend-runtime.md) — long-running / batch work
- [live-runtime.md](live-runtime.md) — the deterministic tick and the `call` primitive that reaches functions
- [../guides/capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — where functions fit (now supported)
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — in-boundary hooks vs notify-out webhooks
- [invariants.md](invariants.md) — the postconditions a function's writes still answer to
- [policy-reference.md](policy-reference.md) — the rule expression language used by `auth`
- [identity-and-logs.md](identity-and-logs.md) — `logsAuth` (who views logs) + the `__managers__` identity sets
- [service-keys.md](service-keys.md) — `actAs`: a function transacting as its own backend identity
- [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) — invoking a function from TypeScript today
