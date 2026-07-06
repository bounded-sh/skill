# Observing agent actions — Watching, the shim, and the Feed

**What's in here / when to read this:** how to opt an app into Action
Boundaries and reach **Watching** — the hosted opt-in overview, self-hosted
shim wiring (`node --require @bounded-sh/observe/register`), what an event does
and does not contain, and the `app-<appId>.bounded.sh` dashboard (Feed /
Actors / Coverage).

Watching is **reported, not protected**. It changes nothing about how the app
behaves: every recognized external action — `ctx.ai` spend, `ctx.services`
tool calls, agent egress to hosts like Stripe or OpenAI — lands in your app's
Feed with per-actor attribution. Do not tell a user a watched action is safe;
tell them it is visible.

## Two ways in

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
