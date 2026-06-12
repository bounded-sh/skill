# Functions — the imperative escape hatch

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
native-binding npm is **not** Bounded — use your own server as a `@bounded/server`
client.

## Declare a function (policy)

Functions live in a top-level `functions` block — a sibling of your collection
paths and `links`, declared once at the root of the policy:

```json
{
  "subs/$userId": {
    "rules": { "read": "@user.address == $userId", "create": "false", "update": "false", "delete": "false" },
    "fields": { "active": "Bool", "renewsAt": "UInt" }
  },
  "admins/$adminId": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "syncStripe": {
      "auth": "get(/admins/@user.address) != null",
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
| `auth` | **Required.** The invocation rule — a policy expression (same language as `rules`). `@user` is the verified caller. `"true"` = any logged-in caller; `get(/admins/@user.address) != null` = only admins. Evaluated before the function runs; deny → `403`. |
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
  // ctx.user   — the VERIFIED caller; auth was already enforced
  // ctx.bounded — pre-authed @bounded client; writes go THROUGH invariants
  // ctx.env    — only the secrets you declared in policy
  // fetch      — standard outbound HTTP
  return { ok: true };
}
```

| `ctx` member | What it is |
|---|---|
| `ctx.user` | `{ address, claims }` — the verified caller. `ctx.user.address` equals `@user.address` in policy. The dispatcher already verified the token **and** evaluated the `auth` rule, so this is trustworthy and the call is authorized. |
| `ctx.bounded` | A pre-authed data client: `ctx.bounded.get(path)`, `.set(path, doc)`, `.delete(path)`. **Writes are re-checked by rules + invariants** — a `409` (invariant violation) throws. This is what keeps the proof intact. |
| `ctx.env` | The dev-configured secrets, narrowed to the names in `functions.<name>.secrets`. Nothing undeclared leaks in. |
| `fetch` | The standard global — call any third-party API / LLM. |
| `ctx.appId` | The app this function belongs to. |

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

### From TypeScript (today)

> A dedicated `functions.invoke` SDK helper is **not yet exported** from
> `@bounded/client` / `@bounded/server` — don't import it. Invoke the dispatcher
> directly with the SDK's id token (the same token the data plane sends):

```ts
import { getIdToken } from "@bounded/client"; // exported today

const token = await getIdToken();
const res = await fetch(`${FUNCTIONS_URL}/invoke`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-App-Id": appId,
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ appId, functionName: "syncStripe", args: { customerId } }),
});
// → the function's JSON, or the dispatcher's 401/403/404/503 error.
```

The dispatcher gates the call on the function's `auth` rule using the verified
caller — so the identity the function sees is exactly the one your data plane
would see. A first-class `functions.invoke(name, args)` SDK helper is planned (see
[functions-when-to-use.md](functions-when-to-use.md#roadmap--toward-formally-bounded-functions)).

## Deploy a function

```sh
bounded functions deploy syncStripe \
  --entry functions/syncStripe.ts \
  --app-id <id> \
  --auth 'get(/admins/@user.address) != null' \
  --secret STRIPE_KEY=sk_live_... \
  --timeout 30

bounded functions list   --app-id <id>
bounded functions logs   syncStripe --app-id <id>
```

Remove a function (script + policy entry) via the developer API:
`DELETE /bounded/functions/<appId>/<name>` (owner/admin).

Deploy uploads the code to the dispatch namespace and merges the `functions`
entry into your policy (validated by the same validator as `bounded deploy`).
Only the **app owner or an admin collaborator** may deploy.

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
  await ctx.bounded.set(`subs/${ctx.user.address}`, { active, renewsAt });

  return { ok: true, active, renewsAt };
}
```

Invoke it from your admin dashboard with
`bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'`
(or the TypeScript fetch shown above).

Flow: logged-in admin → invoke (attaches token) → **dispatcher** (verify token →
resolve `@user` → evaluate `get(/admins/@user.address) != null` → allow) → the
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
  "functions": {
    "rollupDaily": {
      "auth": "get(/admins/@user.address) != null",
      "entry": "functions/rollupDaily.ts",
      "timeout": 120
    }
  }
}
```

*(Validates clean: the validator resolves `schedule.run` to either a scheduled
hook **or** a top-level function.)*

Two principals, one function:

- **User invocation** (`bounded functions invoke`) is gated by the function's
  `auth` rule — exactly as for on-demand functions.
- **System runs** (the schedule) are authorized by the **owner-deployed
  `schedule`** itself: the schedule lives in your signed policy, so registering
  it *is* the authorization. The heartbeat invokes the function as the system
  principal (it does not impersonate a user), skipping the user-facing `auth`
  rule — but every write the run makes still goes **through** your rules +
  invariants via `ctx.bounded`.

`every` accepts `<n>s|m|h|d` (1s–366d); `dueRows` runs fire as rows come due.
Schedules are offchain-only. See
[hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) for the hook form.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets`; supply their
**values** at deploy (`--secret K=V`). The function reads them as `ctx.env.K`.
Only declared names are exposed — an undeclared key never reaches the function,
even if a value exists in the store. Secret values are never written into the
policy and never returned by `functions list`.

Under the hood, each declared secret is set as a **real Cloudflare Worker secret
binding** on your function's dispatch-namespace script (the same mechanism poof
uses for its per-app worker secrets), so `ctx.env.STRIPE_KEY` is a first-class
runtime secret — not a value passed through the request.

## Architecture (poof-infra lineage)

Bounded Functions reuse poof's proven Cloudflare pipeline on Bounded-OWNED,
isolated resources (never `poof_apps`):

- **Deploy** forks poof's dev-server-manager deploy + `secretsHelper`: the
  function uploads to the `bounded_apps_staging` **Workers-for-Platforms dispatch
  namespace**; each declared secret is set as a real per-script Worker secret
  binding via the CF secret API.
- **Invoke** routes through the **Bounded Functions dispatcher**
  (`bounded-functions-dispatcher-staging`): it verifies the caller (Cognito
  RS256/JWKS, same as the data plane), evaluates the `auth` rule via the shared
  rule engine, then dispatches into the namespace with `ctx` injected.
- **Schedules** ride the **Bounded heartbeat dispatcher** (forked from poof's
  heartbeat worker) — an isolated cron registry firing functions as the system
  principal.

If Workers-for-Platforms credentials aren't configured, deploy and invoke return
a clean `503` — never a crash.

## Limits

- **Runtime:** Cloudflare Workers (V8 isolate). Great for API calls, transforms,
  and SDK writes; ~5 ms cold start; global.
- **Timeout:** `1`–`300` s wall-clock per invocation (`timeout`, default `30`).
- **Not for:** multi-minute jobs or native-binding npm — use your own server as a
  `@bounded/server` client for those.
- **Memory / subrequests:** standard Workers limits apply.

## What's proven vs not — say it plainly

- **Proven:** your `rules` and `invariants` — including on every write a function
  makes through `ctx.bounded`. A function **cannot** break an invariant.
- **Policy-gated:** invocation — the `auth` rule is evaluated by the proven rule
  engine before the function runs.
- **NOT proven:** the function's own logic (the fetch, the transform). That's the
  escape hatch's deliberate trade. Keep anything that *must* be guaranteed in an
  invariant, not in function code.

**Roadmap (honest):** functions today are *un-proven logic, contained by proven
walls* (invariants bound their writes; the `auth` rule gates invocation). A future
**capability contract** — declared `writeScopes` + `allowedHosts` with proven
containment of the function's blast radius — is the planned next step toward
formally-bounded functions. Not shipped; don't claim it. Detail in
[functions-when-to-use.md](functions-when-to-use.md#roadmap--toward-formally-bounded-functions).

## Related

- [functions-when-to-use.md](functions-when-to-use.md) — **when to use a function (and when NOT)** — read first
- [../guides/capabilities-and-limits.md](../guides/capabilities-and-limits.md) — where functions fit (now supported)
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — in-boundary hooks vs notify-out webhooks
- [invariants.md](invariants.md) — the postconditions a function's writes still answer to
- [policy-reference.md](policy-reference.md) — the rule expression language used by `auth`
- [sdk-reference.md](sdk-reference.md) — invoking a function from TypeScript today
