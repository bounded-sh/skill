# Principals & origins — who is acting, and where the call came from

**What's in here / when to read this:** the unified "who is the actor / where did
it come from" model. When a live tick `call`s a function (see
[live-runtime.md](live-runtime.md)), *who* is `ctx.user`? Can that caller bill
AI? What gates the call? This doc is the single source of truth for the three
principals, the (roadmap) `@origin` model, and the **act-vs-see-vs-state** triad
that governs all of it.

> **The honest line.** Today a live tick calls a function as the **SYSTEM
> principal** — no human, no wallet, no email — and the function's own `auth` rule
> is **not** evaluated for that call. The only gate is the game's
> `session.live.calls` whitelist. Acting-user and `@origin` are designed but
> **ROADMAP** — do not rely on them.

## The three principals

A function can run on behalf of exactly three kinds of actor. Only the first is
wired for live calls today.

| Caller | what `ctx.user` is | bill AI? | status |
|---|---|---|---|
| **SYSTEM** — a live `call` with no usable `as` | `{ id: null, address: null, email: null, system: true }` | **NO** (no account) | **LIVE** — the only wired live-call path. |
| **Acting user** — `as: playerId`, same-tick verified | that player | yes (player's credit) | **ROADMAP** — the facet verifies `as` same-tick and rejects forged ids, but the supervisor does not yet send an acting identity, so a valid `as` is currently ignored (treated as SYSTEM). |
| **Game SERVICE principal** — `actAs` on the FUNCTION | the service address (`id == address == actAs`) | yes (service's credit) | **LIVE, but indirect** — it's a property of the called function ([service-keys.md](service-keys.md)), not of the `call`. This is the way to get a *funded* identity today. |

### 1. SYSTEM — what `@user` is when a tick calls a function

When a deterministic tick returns a `call` (see the `call` primitive in
[live-runtime.md](live-runtime.md)), the function runs as **SYSTEM**:

```ts
ctx.user // { id: null, address: null, email: null, system: true }
```

No human, no wallet, no email. `@user.id` is `null`, so any policy rule guarded
with `@user.id != null` denies a SYSTEM write — which is correct: a SYSTEM call
has no account to attribute. To let a SYSTEM-triggered function write app data,
either (a) declare `actAs` on the function so it acts as a funded service
identity, or (b) write the rule to admit that service address.

**SYSTEM cannot bill AI.** `ctx.ai.run` bills the caller's `user.id`. For a
SYSTEM call `user.id` is `null` → no account → inference **fails (402)**. A SYSTEM
function can still `fetch` and write through `ctx.bounded`, but it cannot run a
metered LLM on its own credit.

### 2. Acting user (`as`) — ROADMAP

The tick may name a player to act for:

```ts
// inside live tick — `as` is the player id to act for (NOT onBehalfOf)
return { state, call: { fn: "buyItem", args: { sku: "sword" }, as: playerId } };
```

The intended semantics: the called function runs as *that player*, billing AI to
the player's credit. The facet **already** verifies that `as` names a player who
actually acted this tick and rejects a forged id (the same-tick check runs in the
facet, outside tenant control). But the supervisor does **not yet forward an
acting identity to the dispatcher**, so today a valid `as` is silently ignored and
the call runs as SYSTEM. Treat acting-user billing as ROADMAP (#99).

### 3. Game SERVICE principal (`actAs`) — the funded identity

This is the **real** way to ship a function that needs to write owned data or bill
AI from a live call today. Declare `actAs: "<serviceAddress>"` on the function;
it then runs as that fixed service identity (`id == address == actAs`), and the
owner funds that service account with AI credit.

```json
{
  "functions": {
    "npcBrain": {
      "auth": "true",
      "entry": "functions/npcBrain.ts",
      "actAs": "9aZ…serviceAddress"
    }
  },
  "rooms/$roomId": {
    "session": { "live": { "module": "arena", "calls": ["npcBrain"] } }
  }
}
```

`actAs` needs **no private key** for AI or data writes — a key is only required to
*cryptographically sign* an onchain Solana tx. So an LLM NPC funded via `actAs` is
the way to ship a real Claude/GPT NPC today. Full mechanics and the no-caller
table are in [service-keys.md](service-keys.md); the NPC pattern end-to-end is in
[ai-npcs.md](ai-npcs.md).

## `@origin` — where the call came from (ROADMAP — designed, NOT wired)

The intended model is a structured description of **where** a call originated:

```ts
// @origin — INTENDED shape (not in the schema/eval/proof engine today)
@origin = {
  kind: "live" | "scheduled" | "user", // who triggered it
  path,   // the rooms/$roomId or function path
  module, // the live module name
  room,   // the room id, for live calls
  tick    // the tick number, for live calls
}
```

**Why `appId` is deliberately NOT a discriminator.** It's the same app
end-to-end — the live room, the tick, and the called function all belong to one
appId. So "which app?" never distinguishes a live call from a user call; the
discriminator is **`kind`/`path`/`module`/`room`**, never `appId`.

### Shipped reality — be honest

- The supervisor sends an `X-Bounded-Origin` header, but the dispatcher **does not
  read it**.
- `@origin` / `ctx.origin` **do not exist** in the policy schema, the eval engine,
  the proof engine, or the function context.
- The called function's own `auth` rule is **NOT evaluated** for a live (SYSTEM)
  call — the live path skips per-function auth.

So **the only real authorization gate today is the `session.live.calls`
whitelist.** Per-origin function-auth (`@origin.kind == "live"` rules, etc.) is
ROADMAP (#99).

> **Security rule of thumb.** A whitelisted function runs for live calls
> **without** an additional per-function auth check. So **only whitelist functions
> you trust the game to invoke unconditionally.** Keep `session.live.calls` tight;
> do not whitelist a function whose `auth` rule is the thing protecting it.

### What forgery foreclosure DOES guarantee today (a strength)

Even without `@origin`, the identity plumbing is not forgeable:

- The `@effect` result address is **host-only** — an intent carrying `__effect`
  that is not on the `@effect` address is rejected as forged. A client cannot
  inject fake function results.
- A tick **cannot escalate `as`** to a player who didn't act this tick (the
  same-tick check runs in the facet; `@effect` is excluded from the principal
  set).
- The acting identity is **never** a caller-asserted header — the dispatcher
  refuses an `X-Bounded-Acting` impersonation header. Identity comes only from a
  verified token or the function's owner-declared `actAs`.

## The act-vs-see-vs-state triad

Authorization in a live app splits across three independent surfaces. Keep them
straight — each answers a different question:

| Surface | Question | Where it's declared |
|---|---|---|
| **`intentRule`** | Who may **ACT** (send an intent the tick consumes)? | the `session.live` block ([live-runtime.md](live-runtime.md)) |
| **read rules** | Who may **SEE** (read a collection / a per-client view)? | `rules.read` on the collection |
| **invariants** | What must hold of the authoritative **STATE**, no matter who wrote it? | the `invariants` block |

- **ACT** is the intent gate — it decides whose inputs the tick is even allowed to
  process. It does not decide what they can read or what the resulting state is.
- **SEE** is the read gate — a player may be permitted to act but see only their
  own projection (fog-of-war), or see a room they may not act in (a spectator).
- **STATE** is the invariant gate — the universal postcondition on the
  authoritative/checkpointed state (every durable write is re-checked). Declare
  invariants on the **authoritative collection**, never on an ephemeral view
  subcollection (a view is a read-rule-governed projection, not authoritative
  state).

These are orthogonal: a principal can be allowed to ACT but not SEE, or SEE but
not ACT, while invariants bind the STATE regardless of which principal produced
it.

## See also

- [live-runtime.md](live-runtime.md) — the `call` primitive, `@effect`, and
  `session.live.calls`.
- [ai-npcs.md](ai-npcs.md) — the tick-calls-a-function = NPC pattern, end to end.
- [functions.md](functions.md) — the function `ctx` API, `auth`, and invocation.
- [service-keys.md](service-keys.md) — `actAs`, the funded service identity, and
  the no-caller table.
