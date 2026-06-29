# Functions: start simple, graduate when needed

Bounded functions are the **zero-config default** for server logic — write a
`(args, ctx)` handler, declare an `auth` rule, deploy. No separate infrastructure
setup. You inherit Bounded's auth, secrets, metering, and **proof boundary** for
free: a function **provably cannot break an invariant** (every write is re-checked
→ 409 → throws).

They are deliberately a simple *imperative escape hatch*, not a general compute
platform. When you outgrow them, **graduate to the Bounded runtime** — the same code
with custom npm deps, persistent state, schedules, and Bounded-managed runtime
capabilities (metered, spend-capped, versioned; see [backend-runtime.md](backend-runtime.md)).
Running your own server is the final off-ramp, for when you want to
leave Bounded's managed runtime guarantees entirely. The point: your **data + invariants stay inside
Bounded's guarantees no matter where the compute runs**.

## The rule

> **Short + stateless + proven-write → Bounded function.**
> **Custom deps / stateful / scheduled / an agent → Bounded runtime** — [backend-runtime.md](backend-runtime.md).
> **Want your own server + full control → eject** (you leave the managed runtime guarantees).

### Tier 1 — Bounded function (the default; use when ALL hold)
- Work is **short** (≤300s; default 30s) and **stateless** (state goes through `ctx.bounded`).
- It's **request→response** or a **cron/scheduled** job (`schedule.run` / `dueRows`).
- You only need outbound **`fetch`** (Stripe, an LLM, any REST API).
- You want the caller's identity + auth rule enforced for you (`ctx.user`, `ctx.auth`) and every write proven against invariants.
- No npm deps you can't inline; the result is a single JSON body.

Canonical fit: charge Stripe then mark an order paid; enrich/summarize with an LLM;
authenticated server actions; `actAs` service writes (payout bot); scheduled rollups.

### Tier 2 — Bounded runtime (when ANY hold) — [backend-runtime.md](backend-runtime.md)
Deploy a backend project (`bounded.manifest` + TS) with capabilities handed in as
a sealed, metered, spend-capped `ctx`:
- You need **arbitrary npm deps** (cooldown-resolved + bundled for you), a real build, or **persistent state**.
- You need **scheduling** (`ctx.schedule`), **AI** (`ctx.ai`, spend-capped), or **outbound `fetch`** to an allowlist.
- You want an **agent** (`onInvoke`/`onSchedule`) or a backend HTTP handler at
  the app's mapped API host, for example `<slug>-api.bounded.page`.
- You want a **multi-step agentic loop** (LLM drives tool calls toward a goal) → the **Flue agent runtime** (`bounded-flue@2026.07`), [agents-flue.md](agents-flue.md).
- You need **long-running / batch / background** work — use resumable scheduled steps instead of one long function call.

You keep Bounded auth identity, the AI/external-services bucket, versioning, and billing
([billing.md](billing.md)). Deploy with `bounded runtime deploy`. This is the normal upgrade
from a Bounded function.

### Tier 3 — eject to your own server (the final off-ramp; only if you must)
Reach for this only when you want full control of hosting/billing or something
the runtime does not expose. You **leave Bounded's managed runtime guarantees** for the
compute (you now own auth, secrets, scheduling, logs, the invoke route) — but your
**data + invariants stay in Bounded**: your server calls Bounded over
`@bounded-sh/server` (`createWalletClient({ keypair })` — same `get/set/setMany/delete/
runQuery`, every write still through your proven policy). Hybrid is the norm.

## Graduating to the runtime is mechanical, not a rewrite

Your function logic carries over to the Bounded runtime almost verbatim — the runtime
wraps your code with the same kind of sealed `ctx`. `bounded runtime deploy` and you're
on Tier 2 with custom deps + state + schedules, still inside Bounded's managed guarantees.

### What you take on if you go all the way to Tier 3 (eject — the honest tradeoffs)
- **You act as one service identity, not per-caller.** A Bounded function/runtime acts
  *as the verified caller*; your own server acts as a single service key — clean for
  **`actAs`/service/cron**, but **per-caller** code must verify the caller's token and
  re-impose the gate itself.
- **Email/account-id callers can't be a server signer** (the server SDK is keypair-only)
  — eject targets **wallet/service identities**.
- **You now own** auth, secrets, scheduling, logs, and the invoke route.

> Rule of thumb: outgrow a function → **graduate to the Bounded runtime (Tier 2)**; it
> covers nearly everything (deps, state, schedules, agents) without leaving the
> guarantees. Eject to your own server (Tier 3) only for full self-ownership.
