# Secrets — give your backend code API keys (Stripe, OpenAI, …)

What's in here: how a deployed backend/agent gets secret values (its own Stripe key, OpenAI
key, etc.), the two ways a secret can be used, and the CLI. For the runtime itself see
[backend-runtime.md](backend-runtime.md).

## The one mental model

A secret has **two halves, kept apart on purpose**:

1. **DECLARE the name** in your `bounded.manifest` (`secrets` block). This is policy — it ships
   in your code artifact. **Never put the value here.**
2. **SET the value** with the CLI: `bounded secret put NAME VALUE --app-id <id>`. Values live
   encrypted per-app in the runtime and are **never returned by any API** (`list` shows names only).

Then your code reads it. That's it.

## Simplest form (do this unless you need more)

`bounded.manifest`:
```json
{
  "name": "myapp",
  "entry": "index.ts",
  "secrets": ["OPENAI_KEY"]
}
```
Set the value, deploy:
```bash
bounded runtime deploy ./ --app-id <id>
bounded secret put OPENAI_KEY sk-... --app-id <id>
```
Read it in your code via `ctx.secrets.get`:
```ts
export default {
  async onInvoke(input, ctx) {
    const key = await ctx.secrets.get("OPENAI_KEY");   // the value, in your code
    // ... call OpenAI with `key`
  }
};
```
A bare name = **in-process**: your code can read the value. This is the default and is all most
apps need.

## Stronger form: egress-bound (the value never enters your code)

For an HTTP API key, bind the secret to the host it's for. The runtime attaches it as a header
on your outbound request — **your code never sees the value**, so it can't leak it (even if the
agent is prompt-injected). Best practice for third-party API keys.

```json
"secrets": [
  { "name": "STRIPE_KEY", "egress": "api.stripe.com" }
]
```
Your code just calls the API normally — the `Authorization: Bearer <STRIPE_KEY>` header is added
by the runtime on the way out:
```ts
const res = await ctx.fetch("https://api.stripe.com/v1/charges", { method: "POST", body });
// no key in your code — the host injected it
```
- Default injection is `Authorization: Bearer <value>`. Override with `header` / `scheme`
  (use `"scheme": ""` for a raw value), or send it as a query param with `"in": "query", "param": "api_key"`.
- The host you bind to is **auto-allowed** for egress (you don't also need it in `allowedHosts`).
- **Egress-bound = NOT readable in your code.** `ctx.secrets.get("STRIPE_KEY")` returns `null`
  for an egress-only secret (that's the point — the value can't leak through your code).

```json
{ "name": "STRIPE_KEY", "egress": { "host": "api.stripe.com", "header": "Authorization", "scheme": "Bearer" } }
```

**The bare `egress: "host"` is shorthand for `Authorization: Bearer <value>`** — the most common
API-key format. It's not magic: if your API wants a different header, set it. Cheat-sheet for
common APIs:

| API | Declaration |
|---|---|
| OpenAI, Stripe, most OAuth2 | `{ "name": "K", "egress": "api.openai.com" }` (default `Authorization: Bearer` works) |
| GitHub | `{ "name": "GH", "egress": { "host": "api.github.com", "scheme": "token" } }` |
| Anthropic | `{ "name": "ANTHROPIC_KEY", "egress": { "host": "api.anthropic.com", "header": "x-api-key", "scheme": "" } }` |
| Custom header | `{ "name": "K", "egress": { "host": "…", "header": "X-Api-Key", "scheme": "" } }` |
| Query param | `{ "name": "K", "egress": { "host": "…", "in": "query", "param": "api_key" } }` |

If the default `Authorization: Bearer` is wrong for your API, the call just gets a 401 from
upstream — so match the header to the API (the cheat-sheet above covers the common ones).

## One secret, multiple uses

A secret can be used more than one way — list them in `uses`:
```json
{ "name": "GH_TOKEN", "uses": [
  { "egress": { "host": "api.github.com", "scheme": "token" } },
  "in"
] }
```
Here `GH_TOKEN` is injected on calls to api.github.com **and** readable via `ctx.secrets.get`.
(`"in"` is the in-process usage; an egress object is an egress usage.)

> **Footgun:** adding `"in"` to an egress secret makes it readable by your code again — so the
> "value never enters your code" guarantee no longer holds for that secret. `bounded runtime
> deploy` prints a `warnings` line when a secret is both. If you want the egress-only guarantee,
> declare it egress-**only** (no `"in"`).

## Which form should I use?

| You need… | Declare | Read in code? |
|---|---|---|
| An API key for an HTTP service (Stripe, OpenAI over HTTP, GitHub) | `{ name, egress: "<host>" }` | No — host injects it (safest) |
| To use the value yourself (sign a JWT, a non-HTTP SDK, custom logic) | `"NAME"` (bare) or `{ name, in: true }` | Yes — `ctx.secrets.get("NAME")` |
| Both | `{ name, uses: [ {egress:"<host>"}, "in" ] }` | Yes, and injected on egress |

Default to **egress-bound** for HTTP keys; use **in-process** only when your code truly needs the
raw value.

## CLI

```bash
bounded secret put STRIPE_KEY sk_live_xxx --app-id <id>   # set / update a value
bounded secret list --app-id <id>                          # names only — never values
bounded secret rm STRIPE_KEY --app-id <id>                 # remove
```
Values are write-only over the API: there is no command that prints a secret value back.

## Rules & limits (so nothing surprises you)

- Names: `[A-Za-z_][A-Za-z0-9_]{0,63}` (env-var style). Value ≤ 8 KB. ≤ 100 secrets per app.
- Secrets are **per-app and isolated** — one app can only ever read/inject its own.
- **A value is set ONCE per app**, not per handler. `bounded secret put STRIPE_KEY … --app-id X`
  is read by every agent / `onInvoke` / `onSchedule` / queue handler in app X — no copying. The
  manifest declares the *name* once. (Today the backend runtime and Functions use separate value
  stores; a single central per-app store + central declaration referenced by name is in progress —
  ask if you hit the seam.)
- Declaring a `secrets` block makes it the allow-list: with a block present, only **declared**
  in-process names are readable. With **no** block, any value you `secret put` is readable
  in-process (the simplest path "just works").
- The declaration is part of your immutable code artifact (it's in the `codeId`); changing it is
  a new deploy. The **values** are set separately and can be rotated anytime with `secret put`
  (no redeploy).

## Related
- [backend-runtime.md](backend-runtime.md) — the `ctx` your code runs with (store/ai/schedule/fetch/secrets)
- [cli-reference.md](cli-reference.md) — all CLI commands
