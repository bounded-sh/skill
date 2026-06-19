# Functions: start simple, graduate to Cloudflare as you grow

Bounded functions are the **zero-config default** for server logic — write a
`(args, ctx)` handler, declare an `auth` rule, deploy. No account, no wrangler, no
bindings. You inherit Bounded's auth, secrets, metering, and **proof boundary** for
free: a function **provably cannot break an invariant** (every write is re-checked
→ 409 → throws).

They are deliberately a simple *imperative escape hatch*, not a general compute
platform. When you outgrow them, **graduate to the Bounded runtime** — the same code
with custom npm deps, persistent state, schedules, and full Cloudflare power, still
running **THROUGH Bounded** (sealed capabilities, metered, spend-capped, version-
pinned — no Cloudflare account of your own; see [backend-runtime.md](backend-runtime.md)).
Ejecting to your *own* Cloudflare account is the final off-ramp, for when you want to
leave Bounded's guarantees entirely. The point: your **data + invariants stay inside
Bounded's guarantees no matter where the compute runs**.

## The rule

> **Short + stateless + proven-write → Bounded function.**
> **Custom deps / stateful / scheduled / an agent → Bounded runtime (through us)** — [backend-runtime.md](backend-runtime.md).
> **Want your own Cloudflare account + full control → eject** (you leave the guarantees).

### Tier 1 — Bounded function (the default; use when ALL hold)
- Work is **short** (≤300s; default 30s) and **stateless** (state goes through `ctx.bounded`).
- It's **request→response** or a **cron/scheduled** job (`schedule.run` / `dueRows`).
- You only need outbound **`fetch`** (Stripe, an LLM, any REST API) — no Cloudflare resource *bindings*.
- You want the caller's identity + auth rule enforced for you (`ctx.user`, `ctx.auth`) and every write proven against invariants.
- No npm deps you can't inline; the result is a single JSON body.

Canonical fit: charge Stripe then mark an order paid; enrich/summarize with an LLM;
authenticated server actions; `actAs` service writes (payout bot); scheduled rollups.

### Tier 2 — eject to a plain Cloudflare Worker (when ANY hold)
- You need **durable state / Durable Objects / alarms**, **WebSockets**, or **streaming/SSE** (token-by-token LLM output).
- You need **arbitrary npm/WASM deps**, a real build, or **>5 min** CPU.
- You need **direct CF bindings** (KV / R2 / D1 / Queues / Workers AI).
- You need a real **inbound webhook endpoint** you own.

### Tier 3 — Cloudflare Agents SDK (a remote AI agent)
- Must **remember across turns/reconnects** (durable per-user memory).
- **Streams** chat, **pushes proactive** messages, or **schedules follow-ups** that survive restart.
- Needs **human-in-the-loop** approval that pauses for hours/days, durable multi-step workflows, or is/consumes an **MCP server**.

## Graduating is mechanical, not a rewrite

Your function body **already runs inside a Cloudflare Worker** — the deploy pipeline
wraps your `(args, ctx)` handler in a Worker fetch handler. So ejecting carries the
**logic over verbatim**; only the *boundary* changes:

- **Data access:** `ctx.bounded` becomes `createWalletClient({ keypair })` from
  `bounded-sh/server` — same `get/set/setMany/delete/runQuery`, and **every write
  still goes through your deployed policy (rules + invariants)**. Same proof
  boundary, different signer.
- **Hybrid is the norm:** for Tier 2/3, keep your **data + invariants in Bounded**
  and run the Worker / agent as a separate Cloudflare service that calls Bounded
  over `bounded-sh/server`. You don't give up the guarantees to get the power.

### What you take on when you eject (the honest tradeoffs)
- **You act as one service identity, not per-caller.** In a Bounded function
  `ctx.bounded` acts *as the verified caller* (can never exceed what that user
  could do). An ejected Worker acts as a single service key — so eject is a clean
  ~1:1 mapping for **`actAs`/service-identity/cron** functions; **per-caller**
  functions must verify the caller's token and re-impose the gate themselves.
- **Email/account-id callers can't be a server signer** (the server SDK is
  keypair-only) — eject targets **wallet/service identities**.
- **You now own** auth (the `auth` rule is no longer enforced for you — paste the
  gate back), secrets (`wrangler secret put`), scheduling (`[triggers] crons`),
  logs (`wrangler tail`), and the invoke route.

> Rule of thumb: **`actAs` / cron functions eject cleanly. Per-caller functions are
> best kept as Bounded functions** until you genuinely need Tier-2/3 power, then
> re-impose caller auth yourself.

## When NOT to eject
If it fits Tier 1, **stay** — you'd be trading away free auth, invariant proofs,
secrets, and metering for infrastructure you now operate. Eject only when you cross
a hard line above.
