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

### Tier 2 — Bounded runtime, THROUGH us (when ANY hold) — [backend-runtime.md](backend-runtime.md)
Deploy a backend project (`bounded.manifest` + TS) that we run on Cloudflare's edge
**for you**, with capabilities handed in as a sealed, metered, spend-capped `ctx`:
- You need **arbitrary npm deps** (cooldown-resolved + bundled for you), a real build, or **persistent state**.
- You need **scheduling** (`ctx.schedule` → host-owned alarm), **AI** (`ctx.ai`, spend-capped), or **outbound `fetch`** to an allowlist.
- You want an **agent** (`onInvoke`/`onSchedule`) or a backend HTTP handler at `<app>-api.bounded.page`.

You DON'T give up anything: no Cloudflare account, no `wrangler`, no raw bindings —
auth identity, the AI bucket, version pinning, and billing ([billing.md](billing.md))
are still ours. Deploy with `bounded runtime deploy`. This is the normal upgrade
from a Bounded function.

### Tier 3 — eject to your OWN Cloudflare account (the final off-ramp; only if you must)
Reach for this only when you want **full control of your own CF account/billing** or
something the runtime doesn't expose yet. You **leave Bounded's guarantees** for the
compute (you now own auth, secrets, scheduling, logs, the invoke route) — but your
**data + invariants stay in Bounded**: the ejected Worker calls Bounded over
`bounded-sh/server` (`createWalletClient({ keypair })` — same `get/set/setMany/delete/
runQuery`, every write still through your proven policy). Hybrid is the norm.

## Graduating to the runtime is mechanical, not a rewrite

Your function logic carries over to the Bounded runtime almost verbatim — the runtime
wraps your code with the same kind of sealed `ctx`. `bounded runtime deploy` and you're
on Tier 2 with custom deps + state + schedules, still inside our guarantees.

### What you take on if you go all the way to Tier 3 (eject — the honest tradeoffs)
- **You act as one service identity, not per-caller.** A Bounded function/runtime acts
  *as the verified caller*; an ejected Worker acts as a single service key — clean for
  **`actAs`/service/cron**, but **per-caller** code must verify the caller's token and
  re-impose the gate itself.
- **Email/account-id callers can't be a server signer** (the server SDK is keypair-only)
  — eject targets **wallet/service identities**.
- **You now own** auth, secrets, scheduling, logs, and the invoke route.

> Rule of thumb: outgrow a function → **graduate to the Bounded runtime (Tier 2)**; it
> covers nearly everything (deps, state, schedules, agents) without leaving the
> guarantees. Eject to your own CF account (Tier 3) only for full self-ownership.
