# Observing agent actions — Watching, the shim, and the Feed

**What's in here / when to read this:** how to opt an app into Action
Boundaries and reach **Watching** — the hosted opt-in overview, self-hosted
shim wiring (`node --require @bounded-sh/observe/register`), the Worker/edge
emitter (`@bounded-sh/observe/edge`), the AI base-URL gateway (including its
observe-first `OBSERVE_ONLY` mode), what an event does and does not contain,
and the `app-<appId>.bounded.sh` dashboard (Feed / Actors / Coverage).

Watching is **reported, not protected**. It changes nothing about how the app
behaves: every recognized external action — `ctx.ai` spend, `ctx.services`
tool calls, agent egress to hosts like Stripe or OpenAI — lands in your app's
Feed with per-actor attribution. Do not tell a user a watched action is safe;
tell them it is visible.

## Ways in — pick by what you control

| Your situation | Mechanism |
|---|---|
| Backend runs ON Bounded (functions, live rooms) | Hosted opt-in — platform emits, nothing to install |
| Your own **Node process** | The **shim** (preload or `init()`) — intercepts fetch + http/https |
| Your own **Worker / edge chokepoint** (a proxy or gateway you wrote) | The **edge emitter** — `@bounded-sh/observe/edge`, one event per call |
| A tool you **can't put code inside** (Claude Code, Cursor, any SDK honoring `*_BASE_URL`) | The **AI base-URL gateway** — point the tool at it |

**Hosted runtime (overview).** If the app's backend runs on Bounded (functions,
live rooms), opt in from the app's Boundaries surface as the owner. The
platform emits the events itself from its own chokepoints — `ctx.ai` runs,
`ctx.services` invokes, and agent egress — so there is nothing to install and
no token to hold; the sensor token stays server-side. Emission is strictly
additive: if it is ever off, the app behaves exactly as it does today.

**Self-hosted Node backend (the shim).** If the backend is the builder's own
Node process, opt in as the app owner to get a **sensor token**
(`obs1.<keyId>.<sig>`) scoped to this app only, then preload the
`@bounded-sh/observe` shim. The shim intercepts the process's egress
(`fetch` plus `http`/`https`) and reports metadata-only event batches. It is
dependency-free at runtime and never breaks the app: every shim code path is
wrapped, original behavior is always preserved, and Watching is fail-open —
Bounded being unreachable changes nothing for the app.

**One process-boundary caveat:** the shim sees only the process it runs in. If
your app spawns child processes that make their own calls (e.g. the Claude
Agent SDK spawns a `cli.js` child for inference), those calls are invisible to
an in-parent shim — route them through the AI base-URL gateway instead (the
child honors `ANTHROPIC_BASE_URL`), and keep the shim for the parent's own
egress.

## Wiring the shim (self-hosted)

```bash
npm install @bounded-sh/observe
```

Then preload it — zero code changes to the app:

```bash
BOUNDED_SENSOR_TOKEN="obs1.…" \
BOUNDED_INGEST_BASE="https://…" \
node --require @bounded-sh/observe/register app.js   # CJS
# or: node --import @bounded-sh/observe/register app.js   # ESM
```

Both values come from opt-in; `BOUNDED_INGEST_BASE` defaults to the production
ingest when unset, so usually only the token is required.

**Capture scope (`BOUNDED_CAPTURE_SCOPE`).** For an app you are BUILDING, set
`BOUNDED_CAPTURE_SCOPE=bounded` — the shim then sends only the calls Bounded
already recognizes (its builtin fixtures: your Bounded data plane, Stripe, the AI
gateways, and other known rails) plus explicit counter routes. Nothing about an
unknown route ever leaves the process — no shape sample, no counter. This is the
quiet, private, low-volume default for app development, and it keeps you well
under the metered observe cap. When you WANT to discover and classify new routes
(the enterprise/action-boundaries flow), set `BOUNDED_CAPTURE_SCOPE=all` (or leave
it unset) for full capture including unknown-route shape sampling.

| Env | Meaning |
|---|---|
| `BOUNDED_SENSOR_TOKEN` | the `obs1.…` token minted at opt-in; authenticates reports for this app only |
| `BOUNDED_INGEST_BASE` | where events are reported; defaults to the production ingest |
| `BOUNDED_OBSERVE_DISABLED=1` | kill switch — at process start nothing is patched; at runtime observation stops within one flush tick |
| `BOUNDED_DEBUG=1` | shim debug logging to stderr |

For actor attribution — *who* did it — call `init()` early instead of (or in
addition to) the preload and map requests to actors:

```js
const { init, middleware, runAs } = require("@bounded-sh/observe");

init({ token: process.env.BOUNDED_SENSOR_TOKEN });

// Per-request (Express/Hono): map your session to an actor for the request's async chain
app.use(middleware((req) => ({ actor: req.session.user.id, kind: "human" })));

// Explicit scope for bots, jobs, agents:
await runAs({ actor: "agent:support-1", kind: "agent" }, async () => {
  await stripe.refunds.create({ charge, amount }); // reported as agent:support-1
});
```

Actor ids should be **opaque internal ids, never emails** (email-shaped values
are redacted as suspected PII). Unattributed calls are still captured — they
roll up under the `unattributed` pseudo-actor, which the Actors tab makes
visible so you can improve attribution over time.

## Worker & edge chokepoints — `@bounded-sh/observe/edge`

The shim's root entry cannot load in edge runtimes (Cloudflare Workers, Vercel
Edge, Deno Deploy) — it needs Node builtins. When YOUR code is already the
chokepoint (a proxy Worker that meters tenant AI calls, an API gateway), use
the **edge emitter** subpath instead: no interception, no queue, no timers —
you build one envelope event per action and fire it:

```ts
import { emitEvent } from "@bounded-sh/observe/edge";

emitEvent(
  { ingestUrl: env.BOUNDED_INGEST_URL, sensorToken: env.BOUNDED_SENSOR_TOKEN },
  {
    class: "action",
    actor: { id: tenantAppId, kind: "service", grade: "attested" },
    dest: { host: "api.anthropic.com", pathTemplate: "/v1/messages", method: "POST" },
    status: 200, dur_ms: 0, bytes: { i: 0, o: 0 },
    rec: { rail: "llm-gateway", action: "acme.tenant.aiRun", registryVersion: "acme-proxy",
           fields: { actualCents, "usage.input_tokens": inTok, "usage.output_tokens": outTok } },
  },
  ctx, // optional Workers ExecutionContext — the POST rides ctx.waitUntil
);
```

Same posture as everything else in Watching: **no-op unless both `ingestUrl`
and `sensorToken` are present** (deleting the secret is the kill switch),
`postEvent` never rejects, the POST is bounded by `timeoutMs` (default 2 s),
and `org`/`sensor` are never sent — the ingest stamps both from the sensor
key. Metadata only, same denylist rules; per-tenant attribution comes from
whatever identity your chokepoint already verified (`grade: "attested"`).

## The AI base-URL gateway — for tools you can't wrap

`bounded-ai-gateway` is a self-hostable Worker you deploy in YOUR cloud
account: point any Anthropic/OpenAI-compatible tool at it via
`ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` and every call is attributed, priced,
and reported — prompts never touch Bounded, only model/tokens/cost/actor/
verdict metadata. It can chain to a gateway you already bill through
(`UPSTREAM_CONFIG` — Vercel AI Gateway, LiteLLM, Azure) so provider billing is
undisturbed.

**Observe-first adoption (`OBSERVE_ONLY=true`).** By default the gateway is an
*enforcing* proxy — it requests a verdict before forwarding and declines over
a promoted boundary. For watch-first rollouts set `OBSERVE_ONLY=true`: the
gateway never requests a verdict, never reserves, never declines, never
settles — **every call forwards** (even past a `MODEL_ALLOWLIST`), and the
observe event still lands, including on provider failures. Flip the flag off
later to move that traffic from Watching to Enforced — same worker, same
events, one deliberate step.

Do not confuse `OBSERVE_ONLY` with `FAIL_OPEN`: `FAIL_OPEN=true` only bypasses
*transport errors* reaching the verdict endpoint — explicit policy declines
still block the caller. `FAIL_OPEN` is an availability posture for an
enforcing gateway; `OBSERVE_ONLY` is the watching plane.

## Say it plainly — what the shim does and does not protect

The shim runs **in-process because the builder installed it**. Removing the
shim removes the reporting (and, once boundaries are Enforced, the escorted
checks). It protects against **agent mistakes** — a loop that overspends, a
tool call to the wrong host — not against someone deliberately taking it out.
Watching is fail-open by design (it is reporting, not protection); the
**Coverage** tab shows per-sensor liveness so a dead emitter is visible instead
of silently reassuring.

## What an event looks like — and never contains

Events are **metadata only**: destination host, **templated** path (UUIDs,
numeric ids, and hashes become `{id}` before anything leaves the process),
method, status, duration, byte counts, and the actor context. Recognized
routes (Stripe refunds/charges/payment intents; OpenAI and Anthropic spend)
additionally carry **safe fields only** — amounts in cents, opaque ids like
`ch_…`, model names, token counts — which drive the deterministic action
stories in the Feed.

Never captured, ever:

- request/response **bodies** — for unrecognized routes only top-level field
  names/types, once, on the first sighting of a shape;
- query-string **values** (names only, on shape samples);
- header values (headers are only scanned to strip `X-Bounded-*`);
- **prompts, completions, or messages** of LLM calls;
- PII-named fields (`email`, `card*`, `password`, `address`, auth-shaped
  `*token`, …) — a hard denylist compiled into the shim and re-checked
  server-side, so even a buggy capture policy cannot pick them up.

If the shim ever drops events (bounded memory, backpressure), the drop count is
reported on the next successful send and surfaces as a completeness flag —
counts are honest.

## The dashboard — `app-<appId>.bounded.sh`

Sign in as the app's owner identity (email or wallet — the same account that
owns the app). Only members of the app's observe space can see it; another
app's owner sees none of your data.

- **Feed** — every recognized action, newest first, with its action story
  ("agent:support-1 refunded $12.00 on Stripe"), status, and duration.
- **Actors** — per-actor rollups: which humans, agents, and jobs took which
  actions, including the `unattributed` bucket.
- **Coverage** — per-sensor liveness: which emitters are reporting and when
  they last did. Check here before trusting a quiet Feed.

Once enough events accumulate, **Suggested** boundary cards appear on the
Boundaries view — each stating the evidence it is based on.

## Related

- [suggested-boundaries.md](suggested-boundaries.md) — how baselines become Suggested boundary cards, and what Promote will do
