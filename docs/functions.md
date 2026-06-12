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

## When to reach for a function vs a hook vs a webhook

| You want to… | Use |
|---|---|
| Enforce a rule/postcondition on writes (in-boundary, server-authoritative) | **invariant / hook** ([hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md)) |
| Notify an outside system *after* a write (fire-and-forget, read-only) | **webhook** ([hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md)) |
| Call an external API, transform the result, then write — **on demand**, from a logged-in client | **function** (this doc) |
| Run heavy/long compute or native-binding npm | not Bounded — use your own server as a `@bounded/server` client |

Rule of thumb: if the logic must *pull* from the outside world and *then* write,
it's a function. If it only *reacts* to a write, it's a hook (in-boundary) or a
webhook (notify-out).

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

## Invoke a function (client AND server)

The SDK attaches your session token automatically — the **same token** it uses
for data reads/writes. Works identically in a logged-in browser app and in a
backend `@bounded/server` client.

```ts
// Frontend (logged-in user) OR backend (@bounded/server)
import { functions } from "@bounded/client"; // or "@bounded/server"

const res = await functions.invoke("syncStripe", { customerId });
// → the function's JSON, or throws FunctionInvokeError on:
//   401 (not logged in), 403 (auth rule denied you), 404 (unknown function),
//   503 (Functions not configured), or any error the function throws.
```

No manual token handling — `invoke` reuses the SDK's standard auth-send, so the
caller identity the function sees is exactly the one your data plane would see.

From the CLI:

```sh
bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'
```

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

Invoke it from your admin dashboard:

```ts
const { active } = await functions.invoke("syncStripe", { customerId });
```

Flow: logged-in admin → SDK `invoke` (attaches token) → **dispatcher** (verify
token → resolve `@user` → evaluate `get(/admins/@user.address) != null` → allow)
→ the function (fetch Stripe → transform → `ctx.bounded.set`, re-checked by your
rules + invariants) → returns JSON.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets`; supply their
**values** at deploy (`--secret K=V`). The function reads them as `ctx.env.K`.
Only declared names are exposed — an undeclared key never reaches the function,
even if a value exists in the store. Secret values are never written into the
policy and never returned by `functions list`.

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

## Related

- [../guides/capabilities-and-limits.md](../guides/capabilities-and-limits.md) — where functions fit (now supported)
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — in-boundary hooks vs notify-out webhooks
- [invariants.md](invariants.md) — the postconditions a function's writes still answer to
- [policy-reference.md](policy-reference.md) — the rule expression language used by `auth`
- [sdk-reference.md](sdk-reference.md) — `functions.invoke` alongside the data SDK
