# Secrets — give your backend code API keys (Stripe, OpenAI, …)

What's in here: how a deployed backend/agent gets secret values (its own Stripe key, OpenAI
key, etc.), the two ways a secret can be used, and the CLI. For the runtime itself see
[backend-runtime.md](backend-runtime.md).

## The one mental model

A secret has **two halves, kept apart on purpose**:

1. **DECLARE the name** in your `bounded.manifest` (`secrets` block). This is part
   of your deployed backend configuration. **Never put the value here.**
2. **SET the value** with the CLI without putting the value in argv:
   `printf '%s' "$VALUE" | bounded secret put NAME --value-stdin --app-id <id>`.
   Values are stored per app and are **never returned by any API** (`list` shows names only).

Then your code reads it. That's it.

**Never import a credential file into a function instead.** A key file bundled
into a function is hardcoded into a stored artifact; the CLI refuses to package
one (a PEM key, a `service_account` JSON, a Bounded credentials file, or a raw
keypair array) and points you back here. Put the value with `bounded secret put`
and read it from `ctx.env` - the value stays in the app secret store and is
resolved at invoke time. See [functions.md](functions.md).

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
printf '%s' "$OPENAI_KEY" | bounded secret put OPENAI_KEY --value-stdin --app-id <id>
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

## Which surface accepts which form

The forms below (egress-bound objects, `uses`) belong to the runtime lane's
`bounded.manifest` (`bounded runtime deploy`). A policy `functions.<name>.secrets`
entry is different: it accepts bare `UPPER_SNAKE_CASE` names ONLY, and the function
reads each one with `ctx.secrets.get("NAME")`. Putting an object there fails deploy
with `secret "[object Object]" must be an UPPER_SNAKE_CASE name (e.g. "STRIPE_KEY")`;
scope that function's outbound reach with its own `egress` key instead (see
[functions.md](functions.md#declare-a-function-policy)).

## Stronger form: egress-bound, runtime manifest only (the value never enters your code)

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
// no key in your code — Bounded injected it
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
| A secret in a policy `functions.<name>` entry (`bounded functions deploy`) | `"NAME"` bare, names only; objects are refused | Yes, `ctx.secrets.get("NAME")`; scope reach with the function's `egress` key |
| An API key for an HTTP service (Stripe, OpenAI over HTTP, GitHub) | `{ name, egress: "<host>" }` | No — Bounded injects it on matching outbound requests (safest) |
| To use the value yourself (sign a JWT, a non-HTTP SDK, custom logic) | `"NAME"` (bare) or `{ name, in: true }` | Yes — `ctx.secrets.get("NAME")` |
| Both | `{ name, uses: [ {egress:"<host>"}, "in" ] }` | Yes, and injected on egress |

In a runtime manifest, default to **egress-bound** for HTTP keys and use **in-process** only when
your code truly needs the raw value. In a policy function there is only the bare-name form.

## CLI

```bash
printf '%s' "$STRIPE_KEY" | bounded secret put STRIPE_KEY --value-stdin --app-id <id>
bounded secret put STRIPE_KEY --value-env STRIPE_KEY --app-id <id>
bounded secret put STRIPE_KEY --app-id <id>       # interactive hidden prompt
bounded secret list --app-id <id>                 # names only — never values
bounded secret rm STRIPE_KEY --app-id <id>        # remove
```
Values are write-only over the API: there is no command that prints a secret value back.
The older `bounded secret put NAME VALUE` form still works for compatibility, but it warns because
argv values can appear in shell history and process listings.

## Rules & limits (so nothing surprises you)

- Names: `[A-Za-z_][A-Za-z0-9_]{0,63}` (env-var style). Value ≤ 8 KB. ≤ 100 secrets per app.
- Secrets are **per-app and isolated** — one app can only ever read/inject its own.
- **A value is set ONCE per app**, not per handler. `bounded secret put STRIPE_KEY --value-stdin --app-id X`
  is read by every declared backend component and every Function in app X — no
  copying. The manifest (or a function's `secrets` block) declares the *name* once.
  A Function resolves the value from the SAME per-app store at invoke time, so
  `ctx.secrets.get("STRIPE_KEY")` returns what you `secret put`. There is exactly
  **one** store: values live per app, never per function version, so a redeploy
  cannot lose them. (A second, deploy-time store keyed by the function's code
  version used to exist and shadowed this one — because its key changed on every
  deploy, re-deploying a function silently left it running with NO secrets. It has
  been removed. `--secret NAME=VALUE` now puts the value in the app store for you
  and declares the name; prefer `secret put` with `--value-stdin` regardless, since
  a value in argv leaks through process listings and shell history.)
- Declaring a `secrets` block is the allow-list: only **declared** in-process
  names are readable. For new manifests and functions, always declare the names
  explicitly. If code asks for a name that is not declared for that backend
  component, `ctx.secrets.get("NAME")` returns `null` and the value is not placed
  in `ctx.env`.
- The declaration is part of the deployed backend configuration; changing it is a
  new deploy. The **values** are set separately and can be rotated anytime with
  `secret put` (no redeploy).
- A standalone `bounded functions deploy` **preserves** a declaration you do not
  restate: omitting `--secret` leaves the function's existing `secrets` block
  intact, exactly like `actAs`, `webhook` and every other declared capability. (It
  did not always: `secrets` was once the one key excluded from that carry-forward,
  so a plain code deploy silently stripped a function's access to its own secrets.)
  `secret put` supplies or rotates the value but never declares exposure by itself;
  the `secrets` block is what grants a function the right to read a name.

## Related
- [backend-runtime.md](backend-runtime.md) — the `ctx` your code runs with (store/ai/schedule/fetch/secrets)
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) — all CLI commands
