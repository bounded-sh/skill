# Functions — the imperative escape hatch

**What's in here / when to read this:** the full Functions reference — declare in
policy, write the `ctx` API, invoke (CLI + TS), deploy, secrets, scheduling, the
proof boundary. **First decide you even need one:**
[functions-when-to-use.md](functions-when-to-use.md).

Declarative policy can't express *"fetch third-party data, then update
accordingly"*: call Stripe / an LLM / any external API, transform the result,
then write. **Functions** close that gap — without breaking the proof thesis.

> **The honest line.** Functions are your imperative escape hatch. Bounded **does
> not prove their logic** — but **they can't break your invariants**, and **only
> authorized callers can invoke them**.

## Why functions are still safe (the proof boundary)

Two guarantees hold no matter what a function's code does:

1. **Every write goes back THROUGH the proven boundary.** A function writes via
   `ctx.bounded` (the data plane), so its writes are re-checked by your `rules`
   and `invariants`. A function **cannot break an invariant** — a violating
   write comes back as a `409` and throws inside the function.
2. **Invocation is policy-gated.** *Who* may call a function is the `auth`
   expression — a policy rule, evaluated by the **same engine** as your
   read/create rules, **before** the function runs. Authorization stays
   declarative and analyzable; it does not live in the function body.

What is **not** proven: the function's own logic (the third-party call, the
transform). That's the deliberate trade — imperative power in exchange for
"Bounded proves the boundary, not the body."

**Caller-scoped vs service identity.** A normal function writes as the verified
caller, so `auth: "true"` means any logged-in caller may invoke it and
`ctx.bounded` still cannot exceed that caller's data-plane authority. A function
that declares `actAs` writes as a backend/service identity and is therefore
privileged: deploy requires its `auth` rule to imply the app's admin predicate
(`get(/admins/@user.id) != null` when an admins scope exists, otherwise
`hasRole("admin")`).

## When to reach for a function — read this first

A function is the **only un-proven tier** in Bounded. Default to the proven tiers
(rules + invariants), then hooks; reach for a function **only when the logic must
leave the boundary** (external API, secrets, complex imperative work). The full
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
  "subs/$userId": {
    "rules": { "read": "@user.id != null && @user.id == $userId", "create": "false", "update": "false", "delete": "false" },
    "fields": { "active": "Bool", "renewsAt": "UInt" }
  },
  "admins/$adminId": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "syncStripe": {
      "auth": "@user.id != null && get(/admins/@user.id) != null",
      "entry": "functions/syncStripe.ts",
      "timeout": 30,
      "secrets": ["STRIPE_KEY"]
    }
  }
}
```

*(This exact snippet validates clean against the real policy validator.)*

| Key | Meaning |
|---|---|
| `auth` | **Required.** The invocation rule — a policy expression (same language as `rules`). `@user` is the verified caller — `{ id, address, email }` where `@user.id` is the universal stable identity (always present), `@user.address` is a real onchain wallet (null for email-only logins), and `@user.email` is the verified email (null for wallet logins). `"true"` = any logged-in caller; `get(/admins/@user.id) != null` = only admins. Gate identity/membership on `@user.id`. Evaluated before the function runs; deny → `403`. |
| `entry` | **Required.** Relative path to the function's source file (e.g. `functions/syncStripe.ts`). No absolute paths, no `..`. |
| `timeout` | Optional. Per-invocation wall-clock seconds, `1`–`300` (default `30`). |
| `secrets` | Optional. UPPER_SNAKE_CASE names exposed to the function as `ctx.env.*`. Only declared names are surfaced. |
| `sandbox` | Optional. `true` or `{ "enabled": true }` opts this function into app-scoped `ctx.sandbox` container operations. Omitted/`false` keeps `ctx.sandbox` unavailable. Use only for trusted backend jobs that need isolated command/file execution. |

**Auth-by-policy is the point.** Because the invocation rule is evaluated by the
same engine as your data rules, "who can call this when" is declarative,
consistent, and analyzable — not buried in imperative code.

## Write a function (the `ctx` API)

A function is a default-exported async function. It receives the caller-supplied
`args` and an injected `ctx`:

```ts
export default async function (args, ctx) {
  // ctx.user   — the VERIFIED caller { id, address, email }; auth was already enforced
  //              ctx.user.id = universal identity (use for ownership); address = wallet-or-null
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
| `ctx.user` | `{ id, address, email, claims, system? }` — the verified caller. `ctx.user.id` is the **universal stable identity** (always present; equals `@user.id` in policy) — use it for ownership/membership. `ctx.user.address` is a **real onchain wallet** (equals `@user.address`; null for email-only logins) — use it only for onchain/wallet semantics. `ctx.user.email` is the verified, lowercased email (null for wallet logins). Bounded already verified the token **and** evaluated the `auth` rule, so this is trustworthy and the call is authorized. |
| `ctx.auth` | `{ enforced, rule, system }` — **authorization the platform ALREADY did for you.** `rule` is the exact policy `auth` expression that passed before your code ran (null for system/scheduled runs). Read this instead of re-implementing authz: if you declared an `auth` gate, it has already passed. |
| `ctx.bounded` | A pre-authed data client: `ctx.bounded.get(path)`, `.set(path, doc)`, `.setMany([{ path, document }, ...])`, `.delete(path)`, and `ctx.bounded.runQuery(path, queryName, args?)`. **Writes are re-checked by rules + invariants** — a `409` throws. `setMany` is one atomic batch, so use it for transfers/settlement. `runQuery` runs one of your policy-declared `queries` (the proven query engine, caller's read authority) so you **reuse policy logic for authz/data instead of re-implementing it** (e.g. an `isTeamMember` query). |
| `ctx.env` | The resolved secrets, narrowed to the names in `functions.<name>.secrets`. Values come from the app secret store (`bounded secret put`) **and** any deploy-time `--secret` (which overrides). Nothing undeclared leaks in. |
| `ctx.secrets` | The documented secret accessor: `await ctx.secrets.get("NAME")` returns the value (or null). Reads the **same** resolved map as `ctx.env`, so `bounded secret put OPENAI_KEY …` → `ctx.secrets.get("OPENAI_KEY")` works. See [secrets.md](secrets.md). |
| `ctx.ai` | **The built-in AI router — `ctx.ai.run(model, input)`. No API key.** Routes any model through the Bounded AI Gateway, billed to the app owner's AI/external-services bucket, capped fail-closed. This is how you add an LLM to your app — see [§ctx.ai](#ctxai--real-ai-no-api-keys) below. |
| `ctx.services` | **Managed third-party API discovery and proxy invoke — `search`, `describe`, `invoke`.** Search/describe help agents find the right API shape. Invoke runs through Bounded's managed provider proxy, billed to the app owner's AI/external-services bucket at the applicable upstream service cost plus 5%, capped fail-closed. See [§ctx.services](#ctxservices--managed-api-discovery-and-invoke). |
| `ctx.enqueue` | **Background jobs — `ctx.enqueue(functionName, payload?, opts?)` → `{ jobId }`.** Schedule another deployed function (or this one) to run *later*, server-side, without blocking. Returns immediately; the queued run executes as the **system** principal with `payload` as its `args`, and meters compute usage to billing exactly like an HTTP invocation. See [§ctx.enqueue](#ctxenqueue--background-jobs). |
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
  const out = await ctx.ai.run("claude-opus-4-8", {        // any model the gateway routes
    messages: [
      { role: "system", content: "You are a markets analyst. Return ONE JSON thesis." },
      { role: "user", content: args.headlines },
    ],
  });
  const text = out.response ?? out.choices?.[0]?.message?.content;
  await ctx.bounded.set(`desks/${args.deskId}/theses/${args.id}`, JSON.parse(text));
  return { ok: true };
}
```

- **Contract:** `ctx.ai.run(model: string, input: any): Promise<any>`. `model` is
  config (swap models with no code change); `input` is the provider request shape
  (`{ messages: [...] }` for chat). A failed inference is **refunded** — you are
  never charged for an error.
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
   - Free includes 3 AI builds/day (fast model) plus a small runtime-services trial allowance, and cannot top up.
   - Pro ($25/mo) gifts $5/mo of AI/external-services credit and $30/mo of Bounded infra credit; Team ($99/mo) gifts $20/$100. Top-ups require Pro-or-better.

   Full rails, amounts, and webhooks: [billing.md](../../bounded/docs/billing.md). **If your app
   charges *its own* users for anything, route that through Bounded billing too** —
   don't build a parallel payment page that bypasses the metered, fail-closed ledger.

> The same `ctx.ai` powers AI NPCs / AI players in live rooms (funded via
> `session.live.runAs`); that live-tick path is in [ai-npcs.md](ai-npcs.md). The
> function path above is the **general case for any app**.

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
  });

  await ctx.bounded.set(`sportsSnapshots/${args.id}`, {
    at: Date.now(),
    games: games.result
  });
  return { ok: true, catalog, docs };
}
```

- **Contract:** `ctx.services.search(query, { limit? })`,
  `ctx.services.describe(toolkitOrToolSlug, { limit? })`, and
  `ctx.services.invoke(toolSlug, args, { entityId? })`.
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
- **Provider key UX:** if Bounded has not configured an upstream provider key for
  a selected provider, discovery still works but `invoke` throws
  `provider_key_not_configured` with a hint. Choose an enabled managed provider,
  ask Bounded to enable that provider, or integrate the provider directly with
  `fetch` and your own key in `ctx.secrets`.
- **Opt-out:** if you integrate a provider directly, you pay that provider
  directly and Bounded's managed proxy markup does not apply.

For transactional email, SMS, or WhatsApp, use a real provider integration and
keep provider keys in secrets. Do not expose a shared provider key or treat
Bounded Auth OTP as recipient consent for app-originated messages.

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

// Runs LATER as the system principal; `payload` arrives as `args`.
export default async function fulfillOrder(args, ctx) {
  // ctx.auth -> { enforced: true, rule: null, system: true }
  const order = await ctx.bounded.get(`orders/${args.orderId}`);
  // ... do the slow work, write results through ctx.bounded ...
  await ctx.bounded.set(`orders/${args.orderId}`, { ...order, status: "fulfilled" });
}
```

- **Contract:** `ctx.enqueue(functionName: string, payload?: unknown, opts?: { delaySeconds?: number }): Promise<{ jobId }>`.
- **What it runs:** `functionName` must be a **deployed function in this app** (a
  function may enqueue another function or itself; validated at enqueue time).
- **How it runs:** the queued job executes **server-authoritatively as the system
  principal** (`ctx.user` is null, `ctx.auth.system === true`) — exactly like a
  scheduled run. The function's user-facing `auth` rule is the gate for *direct*
  invocation; the enqueue itself is the authorization for the background run.
  Writes still pass your `rules` + invariants through `ctx.bounded`.
- **Delivery:** at-least-once, with Cloudflare-managed retries and a dead-letter
  queue. **Make enqueued functions idempotent** so a retry is safe.
- **Limits:** `payload` must be JSON-serializable and ≤ 128 KB; `delaySeconds`
  is 0..86400 (24h).
- **Billing:** each queued run is driven back through the normal `/invoke` path,
  so it **meters compute usage to the app's request ledger identically to an HTTP
  invocation** — background work is billed like foreground work.

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
`bounded-sh` and `@bounded-sh/server`). It attaches the caller's session token
automatically — the **same** token the data plane sends — so you never hand-roll
auth headers:

```ts
import { functions } from "@bounded-sh/client"; // or "bounded-sh/server"

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
  --auth 'get(/admins/@user.id) != null' \
  --timeout 30

printf '%s' "$STRIPE_KEY" | bounded secret put STRIPE_KEY --value-stdin --app-id <id>
bounded functions list   --app-id <id>
bounded functions logs   syncStripe --app-id <id>
```

The `--entry` may be **TypeScript or JavaScript**. Type annotations are fine.
Keep it a single self-contained module.

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
secret values are redacted). Set a fixed backend identity for the function with
the `actAs` policy field. Both are `functions`-block fields, not CLI flags —
see [identity-and-logs.md](identity-and-logs.md) and [service-keys.md](service-keys.md).

Remove or replace a function with the Bounded CLI when you no longer want it
exposed. Deploy validates the function declaration and updates the app's
registered backend code. Only the app owner or an authorized collaborator may
deploy.

## Worked example — sync a Stripe subscription, then write

`functions/syncStripe.ts`:

```ts
export default async function (args, ctx) {
  // Only admins reach here — the `auth` rule already gated invocation.
  const { customerId } = args;
  if (!customerId) throw new Error("customerId is required");

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
  //    Key the doc by the caller's universal identity (ctx.user.id), matching
  //    the `subs/$userId` ownership rule (`@user.id == $userId`).
  await ctx.bounded.set(`subs/${ctx.user.id}`, { active, renewsAt });

  return { ok: true, active, renewsAt };
}
```

Invoke it from your admin dashboard with
`bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'`
(or the TypeScript fetch shown above).

Flow: logged-in admin → invoke (attaches token) → Bounded auth gate (verify token →
resolve `@user` → evaluate `get(/admins/@user.id) != null` → allow) → the
function (fetch Stripe → transform → `ctx.bounded.set`, re-checked by your rules +
invariants) → returns JSON.

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
  "rollups/$day": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "total": "UInt" },
    "schedule": { "every": "1d", "run": "rollupDaily" }
  },
  "admins/$adminId": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "rollupDaily": {
      "auth": "@user.id != null && get(/admins/@user.id) != null",
      "entry": "functions/rollupDaily.ts",
      "timeout": 120
    }
  }
}
```

*(Validates clean and **fires** — `schedule.run` can name either a scheduled hook
or a top-level function. Add `"actAs": "<address>"` to the function block to run
it as that identity so its `ctx.bounded` writes satisfy owner/controller rules;
without `actAs` it runs as the all-null system principal, which cannot bill
`ctx.ai` or satisfy `owner == @user.id`.)*

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

The function's `auth` rule is evaluated by the **same proof engine** as your data
rules — `bounded verify` understands `@origin` (it's a first-class special
variable), so the `@origin` gate is a proven obligation, not a runtime-only check.

To ship a **funded** AI NPC, set `session.live.runAs` to a service wallet the owner
funds with AI/external-services credit — then `ctx.ai` in the called function Just Works (capped at
the app account). Per-function `actAs` is the per-call override and wins for that
one function. The anonymous system principal still **cannot** bill AI (`ctx.ai.run`
→ `402`, no account). Precedence: function `actAs` > session `runAs` > anonymous
system. See [service-keys.md](service-keys.md) and [ai-npcs.md](ai-npcs.md) for the
NPC recipe, and [principals-and-origins.md](principals-and-origins.md) for the full
principal matrix.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets`; supply their
**values** with `bounded secret put NAME --value-stdin --app-id <id>` (the per-app secret
store — set once, read by every function/agent in the app). The function reads
them as `ctx.env.K` **or** `await ctx.secrets.get("K")`. Only declared names are
exposed — an undeclared key never reaches the function. Secret values are never written into
the policy and never returned by `functions list` / `secret list`.

A legacy deploy-time secret override exists for per-function overrides and takes
precedence over the app-store value for that one function. Prefer `secret put`
with `--value-stdin` so values do not appear in argv, process listings, or shell
history.

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

The proof boundary (recap of "Why functions are still safe", above): **proven** —
your `rules` + `invariants`, including every write a function makes through
`ctx.bounded` (it **cannot** break an invariant); **policy-gated** — invocation,
via the `auth` rule evaluated by the proven engine before the function runs; **NOT
proven** — the function's own logic (the fetch, the transform). Keep anything that
*must* be guaranteed in an invariant, not in function code.

If a property must be guaranteed, model it as a rule or invariant. Treat
function code as useful imperative logic, not as a proof boundary.

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
