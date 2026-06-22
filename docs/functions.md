# Functions — the imperative escape hatch

**What's in here / when to read this:** the full Functions reference — declare in
policy, write the `ctx` API, invoke (CLI + TS), deploy, secrets, scheduling, the
proof boundary. **First decide you even need one:**
[functions-when-to-use.md](functions-when-to-use.md).

Declarative policy can't express *"fetch third-party data, then update
accordingly"*: call Stripe / an LLM / any external API, transform the result,
then write. **Functions** close that gap — without breaking the proof thesis.

> **The honest line.** Functions are your imperative escape hatch. We **don't
> prove their logic** — but **they can't break your invariants**, and **only
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
transform). That's the deliberate trade — imperative power in exchange for "we
prove the boundary, not the body."

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
      "secrets": ["STRIPE_KEY"],
      "runtime": "worker"
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
| `runtime` | Optional. `"worker"` (the default and only v1 runtime). |

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
  // ctx.env    — only the secrets you declared in policy
  // fetch      — standard outbound HTTP
  return { ok: true };
}
```

| `ctx` member | What it is |
|---|---|
| `ctx.user` | `{ id, address, email, claims, system? }` — the verified caller. `ctx.user.id` is the **universal stable identity** (always present; equals `@user.id` in policy) — use it for ownership/membership. `ctx.user.address` is a **real onchain wallet** (equals `@user.address`; null for email-only logins) — use it only for onchain/wallet semantics. `ctx.user.email` is the verified, lowercased email (null for wallet logins). The dispatcher already verified the token **and** evaluated the `auth` rule, so this is trustworthy and the call is authorized. |
| `ctx.auth` | `{ enforced, rule, system }` — **authorization the platform ALREADY did for you.** `rule` is the exact policy `auth` expression that passed before your code ran (null for system/scheduled runs). Read this instead of re-implementing authz: if you declared an `auth` gate, it has already passed. |
| `ctx.bounded` | A pre-authed data client: `ctx.bounded.get(path)`, `.set(path, doc)`, `.delete(path)`, and `ctx.bounded.runQuery(path, queryName, args?)`. **Writes are re-checked by rules + invariants** — a `409` throws. `runQuery` runs one of your policy-declared `queries` (the proven query engine, caller's read authority) so you **reuse policy logic for authz/data instead of re-implementing it** (e.g. an `isTeamMember` query). |
| `ctx.env` | The dev-configured secrets, narrowed to the names in `functions.<name>.secrets`. Nothing undeclared leaks in. |
| `fetch` | The standard global — call any third-party API / LLM. |
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

You never write the Worker wrapper — the deploy pipeline generates it (it imports
the ctx shim and calls your default export). You only write the function body.

## Invoke a function

The supported invoke path today is the **CLI**, which attaches your session
token automatically — the **same token** `bounded data` uses — so the dispatcher
verifies your identity and evaluates the function's `auth` rule before running it:

```sh
bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'
```

It prints the function's JSON result, or fails with the dispatcher's error
(`401` not logged in, `403` the `auth` rule denied you, `404` unknown function,
`503` Functions not configured, or any error the function threw).

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

The dispatcher gates the call on the function's `auth` rule using the verified
caller — so the identity the function sees is exactly the one your data plane
would see. On failure it throws `FunctionInvokeError` (`.statusCode` = 401 not
logged in / 403 `auth` denied / 404 unknown function / 503 Functions not
configured). Validated e2e on staging (deploy → `functions.invoke` → JSON result
with the verified `ctx.user.id`).

## Deploy a function

```sh
bounded functions deploy syncStripe \
  --entry functions/syncStripe.ts \
  --app-id <id> \
  --auth 'get(/admins/@user.id) != null' \
  --secret STRIPE_KEY=sk_live_... \
  --timeout 30

bounded functions list   --app-id <id>
bounded functions logs   syncStripe --app-id <id>
```

The `--entry` may be **TypeScript or JavaScript** — the deploy pipeline strips
types before uploading, so annotations (`(args, ctx): Promise<...>`, `as`, `:
Type`) are fine. Keep it a single self-contained module (the wrapper inlines it).

A function's `console.*` output is **captured** and viewable; **who** may view it
is the per-function `logsAuth` policy rule (defaults to app managers; declared
secret values are redacted). Set a fixed backend identity for the function with
the `actAs` policy field. Both are `functions`-block fields, not CLI flags —
see [identity-and-logs.md](identity-and-logs.md) and [service-keys.md](service-keys.md).

Remove a function (source + policy entry) via the developer API:
`DELETE /bounded/functions/<appId>/<name>` (owner/admin).

Deploy uploads the function's **source** to the R2 code registry and merges the
`functions` entry into your policy (validated by the same validator as
`bounded deploy`). **No per-function worker is deployed** — the dispatcher loads
your source into an isolate on the Worker Loader at invoke time, exactly like the
native live runtime loads room modules ([live-runtime.md](live-runtime.md)). A new
upload just replaces the registered source; nothing is redeployed. Only the **app
owner or an admin collaborator** may deploy.

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

Flow: logged-in admin → invoke (attaches token) → **dispatcher** (verify token →
resolve `@user` → evaluate `get(/admins/@user.id) != null` → allow) → the
function (fetch Stripe → transform → `ctx.bounded.set`, re-checked by your rules +
invariants) → returns JSON.

## Scheduled functions (run a function on a cadence)

A function can be invoked **on a schedule**, not just on demand. A collection's
`schedule { every, run }` (or `dueRows { run }`) whose `run` names a **function**
(instead of a `hooks.scheduled.<run>` bytecode hook) registers that function to
run on the cadence — fired by the Bounded heartbeat as the **system principal**.

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

*(Validates clean: the validator resolves `schedule.run` to either a scheduled
hook **or** a top-level function.)*

**Three principal contexts, one function.** The same function can run under three
different callers — see [principals-and-origins.md](principals-and-origins.md) for
the canonical explainer:

1. **User invocation** (`bounded functions invoke`) — gated by the function's
   `auth` rule. `@user` / `ctx.user` is the verified caller.
2. **System / scheduled run** (the schedule, below) — authorized by the
   owner-deployed `schedule` itself: it lives in your signed policy, so the
   heartbeat fires the function as the **system principal** (`@user` all-null),
   skipping the user-facing `auth` rule.
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
the functions dispatcher. The tick `call`ing a function is THE primitive behind AI
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
host-set and unforgeable — `@origin.kind == 'live'`, with `@origin.module` /
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
funds with AI credit — then `ctx.ai` in the called function Just Works (capped at
the app account). Per-function `actAs` is the per-call override and wins for that
one function. The anonymous system principal still **cannot** bill AI (`ctx.ai.run`
→ `402`, no account). Precedence: function `actAs` > session `runAs` > anonymous
system. See [service-keys.md](service-keys.md) and [ai-npcs.md](ai-npcs.md) for the
NPC recipe, and [principals-and-origins.md](principals-and-origins.md) for the full
principal matrix.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets`; supply their
**values** at deploy (`--secret K=V`). The function reads them as `ctx.env.K`.
Only declared names are exposed — an undeclared key never reaches the function,
even if a value exists in the store. Secret values are never written into the
policy and never returned by `functions list`.

Under the hood, declared secret **values** are stored encrypted in Bounded's own
secret store (never written into the policy) and injected into the function's
isolate `env` at invoke time, narrowed to the declared names — so
`ctx.env.STRIPE_KEY` is a first-class runtime secret, not a value passed through
the request.

## Architecture (the Worker Loader)

Bounded Functions run on the Cloudflare **Worker Loader**, on Bounded-OWNED,
isolated resources: **deploy** uploads the function's
(transpiled) source to the R2 code registry — **no per-function worker is
deployed**, same as the native live runtime; **invoke** routes through the Bounded
Functions dispatcher, which verifies the caller (RS256/JWKS, same as the data
plane), evaluates the `auth` rule via the shared engine, then **loads your source
into a fresh isolate on the Worker Loader** with `ctx` (and declared secrets)
injected; **schedules** ride the Bounded heartbeat dispatcher firing functions as
the system principal. Because the loader pulls source from the registry per
invoke, a new upload takes effect immediately with nothing redeployed. If the
dispatcher isn't configured on the platform, deploy and invoke return a clean
`503` — never a crash.

## Limits

- **Runtime:** Cloudflare Workers (V8 isolate). Great for API calls, transforms,
  and SDK writes; ~5 ms cold start; global.
- **Timeout:** `1`–`300` s wall-clock per invocation (`timeout`, default `30`).
- **Not for:** multi-minute jobs or native-binding npm — use your own server as a
  `@bounded-sh/server` client for those.
- **Memory / subrequests:** standard Workers limits apply.

## What's proven vs not, and the roadmap

The proof boundary (recap of "Why functions are still safe", above): **proven** —
your `rules` + `invariants`, including every write a function makes through
`ctx.bounded` (it **cannot** break an invariant); **policy-gated** — invocation,
via the `auth` rule evaluated by the proven engine before the function runs; **NOT
proven** — the function's own logic (the fetch, the transform). Keep anything that
*must* be guaranteed in an invariant, not in function code.

**Roadmap (honest):** functions today are *un-proven logic, contained by proven
walls* (invariants bound their writes; the `auth` rule gates invocation). A future
**capability contract** — declared `writeScopes` + `allowedHosts` with proven
containment of the function's blast radius — is the planned next step toward
formally-bounded functions. Not shipped; don't claim it. Detail in
[functions-when-to-use.md](functions-when-to-use.md#roadmap--toward-formally-bounded-functions).

## Related

- [functions-when-to-use.md](functions-when-to-use.md) — **when to use a function (and when NOT)** — read first
- [principals-and-origins.md](principals-and-origins.md) — **who `@user` is** across user / system / live-call invocation (the canonical principal explainer)
- [ai-npcs.md](ai-npcs.md) — a live tick `call`s a function = an NPC; the `actAs`-funded LLM pattern
- [live-runtime.md](live-runtime.md) — the deterministic tick and the `call` primitive that reaches functions
- [../guides/capabilities-and-limits.md](../guides/capabilities-and-limits.md) — where functions fit (now supported)
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — in-boundary hooks vs notify-out webhooks
- [invariants.md](invariants.md) — the postconditions a function's writes still answer to
- [policy-reference.md](policy-reference.md) — the rule expression language used by `auth`
- [identity-and-logs.md](identity-and-logs.md) — `logsAuth` (who views logs) + the `__managers__` identity sets
- [service-keys.md](service-keys.md) — `actAs`: a function transacting as its own backend identity
- [sdk-reference.md](sdk-reference.md) — invoking a function from TypeScript today
