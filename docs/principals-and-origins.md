# Principals & origins — who is acting, and where the call came from

**What's in here / when to read this:** the unified "who is the actor / where did
it come from" model. When a live tick `call`s a function (see
[live-runtime.md](live-runtime.md)), *who* is `ctx.user`? Can that caller bill
AI? What gates the call? This doc is the single source of truth for the three
live-call principals, the **`@origin`** authorization model, and the
**act-vs-see-vs-state** triad that governs all of it.

> **The line.** A live tick calls a function as an actor chosen by precedence
> (function `actAs` > session `runAs` > anonymous system), and the function's own
> `auth` rule **IS** evaluated for that call — with `@user` = the system principal
> and **`@origin`** populated. `@origin` is host-set and unforgeable; `runAs`
> declares the acting identity. Authorization (`@origin`) and identity (`runAs`)
> are orthogonal and both BUILT.

## The three live-call principals

When a tick `call`s a function there is no human. The **acting identity** is
exactly one of these, picked by precedence:

> **Precedence: function `actAs` > session `runAs` > anonymous system.**

| Principal | what `ctx.user` is | bill AI? | how to get it |
|---|---|---|---|
| **Anonymous system** (default) | `{ id: null, address: null, email: null, system: true }` | **NO** (no account) | nothing declared — the no-identity fallback |
| **`session.live.runAs`** | the service identity (`id == address == runAs`) | yes (capped at the app account) | declare `runAs` ONCE on the session's `live` block — applies to **all** this game's live calls |
| **function `actAs`** | the service identity (`id == address == actAs`) | yes (capped at the app account) | declare `actAs` on the called FUNCTION — a **per-function override** that wins over `runAs` |

**AI spend is always capped at the app account**, regardless of which principal
acts. Identity here is *who the call acts as* — orthogonal to *who may call*
(`@origin` + the `session.live.calls` whitelist + the function's `auth` rule).

### 1. Anonymous system — the no-identity fallback

If neither `actAs` nor `runAs` is declared, a live `call` runs as **system**:

```ts
ctx.user // { id: null, address: null, email: null, system: true }
```

No human, no wallet, no email. `@user.id` is `null`, so any rule guarded with
`@user.id != null` denies a system write — correct: a system call has no account
to attribute. **System cannot bill AI** — `ctx.ai.run` bills `user.id`, which is
`null` → no account → inference **fails (402)**. It can still `fetch` and write
through `ctx.bounded` against rules that admit it. To get a funded, attributable
actor, declare `runAs` (session-wide) or `actAs` (per-function).

### 2. `session.live.runAs` — the session-wide acting identity

Declare a service identity **once** on the session's `live` block and **every**
live call from this game runs as it. This is the simple, mature way to fund AI
NPCs: the owner funds that service account's AI credit, and `ctx.ai` Just Works
(capped at the app account).

```json
{
  "rooms/$roomId": {
    "session": {
      "live": {
        "module": "arena",
        "runAs": "9aZ…serviceAddress",
        "calls": ["npcBrain"]
      }
    }
  }
}
```

Owner-declaring `runAs` **is** the authorization to act as that address — the
same posture as a function's `actAs`. No private key is needed for AI or
data-plane writes (a key is only required to *cryptographically sign* an onchain
Solana tx). See [service-keys.md](service-keys.md).

### 3. function `actAs` — the per-function override

`actAs` on the called function is a per-function identity that **wins over
`runAs`** for that one function. Use it for a one-off actor that differs from the
session-wide identity; otherwise `runAs` is the clean default.

```json
{
  "functions": {
    "npcBrain": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/npcBrain.ts",
      "actAs": "7nQ…serviceAddress"
    }
  }
}
```

Full mechanics and the no-caller table are in [service-keys.md](service-keys.md);
the NPC pattern end-to-end is in [ai-npcs.md](ai-npcs.md).

## `@origin` — where the call came from (WIRED)

`@origin` is a structured, **host-set and UNFORGEABLE** description of where a
call originated. It is derived from the internal-secret-gated dispatch — never
from a client — so it is the same trust class as `@user` from a verified token. A
client cannot assert or spoof it.

```ts
// @origin — host-populated for every call
@origin = {
  kind,   // ALWAYS set: 'live' | 'user' | 'scheduled' | 'function' | 'webhook'
  path,   // the rooms/$roomId or function path; null when N/A
  module, // the live module name; null when N/A
  room,   // the room id (live calls); null when N/A
  tick    // the tick number (live calls); null when N/A
}
```

- **`@origin.kind` is ALWAYS set** (never null). `'live'` = a live game tick;
  `'user'` = a direct end-user/SDK call (the **no-live-origin sentinel**);
  `'scheduled'`, `'function'`, `'webhook'` for those dispatch kinds.
- `path` / `module` / `room` / `tick` are **null when not applicable** (e.g. all
  null for `kind: 'user'`). So a rule gating on `@origin.module` should also
  require `@origin.kind == 'live'`.
- **Usable in function `auth` rules and read/create/update/delete rules, OFFCHAIN
  only.** `@origin.*` is **FORBIDDEN in `onchain: true` rules** (same restriction
  as `@user.id`).
- **It RUNS and VERIFIES.** `@origin` is a first-class proof-engine special var
  (modeled as free symbolic inputs, so the rule earns its obligation) — `bounded
  verify` understands it.
- **`ctx.origin`** is available inside the function body (`{kind,path,module,room,
  tick}`).

**Why `appId` is deliberately NOT a discriminator.** It's the same app
end-to-end — the live room, the tick, and the called function all belong to one
appId. So "which app?" never distinguishes a live call from a user call; the
discriminator is **`kind`/`path`/`module`/`room`**, never `appId`.

### The function `auth` rule IS evaluated for live calls

A live `call` **does** evaluate the called function's own `auth` rule — with
`@user` = the system principal and `@origin` populated. (The earlier claim that
"the function's auth rule is not evaluated for live calls" is **false**.) The
canonical gate that accepts **only** its own game's live tick:

```json
{
  "functions": {
    "npcBrain": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/npcBrain.ts"
    }
  }
}
```

This is **authorization** (who may call) and is orthogonal to **identity**
(`runAs` / `actAs`, who the call acts as). Compose both: `@origin` says *who may
call*, `runAs`/`actAs` says *who the call acts as*. Keep `session.live.calls`
tight too — it is the first gate before the `auth` rule runs.

### What forgery foreclosure guarantees (a strength)

The identity plumbing is not forgeable:

- `@origin` is **dispatcher-derived**, never a client-asserted header — a forged
  `X-Bounded-Origin` is ignored. `@origin.kind == 'live'` can only be true for a
  real tick dispatch.
- The `@effect` result address is **host-only** — an intent carrying `__effect`
  not on the `@effect` address is rejected as forged. A client cannot inject fake
  function results.
- A tick **cannot escalate `as`** to a player who didn't act this tick (the
  same-tick check runs in the facet; `@effect` is excluded from the principal
  set).
- The acting identity is **never** a caller-asserted header — the dispatcher
  refuses an `X-Bounded-Acting` impersonation header. Identity comes only from a
  verified token, `runAs`, or the function's owner-declared `actAs`.

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
- [service-keys.md](service-keys.md) — `actAs` / `session.live.runAs`, the funded
  service identity, and the no-caller table.
