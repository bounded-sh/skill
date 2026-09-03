# Public functions - HTTP routes without a Bounded session

What's in here: how to give an app an endpoint that anyone (or any machine) can
call, what the function receives and returns, how identity and CORS work on it,
the limits, and the two narrower public modes (`webhook`, `browser`) that predate it.

A normal function is reached through `/invoke` with a Bounded session token and
is gated by its `auth` rule. A **public function** is reached at the app's own
API host with plain HTTP - `GET`, `POST`, sub-paths, query strings, your own
headers - and the platform never requires a token. That is what a REST API, a
public JWKS document, a machine-to-machine token endpoint, or a callback URL
needs, and it is the only supported way to serve them: the whole-backend runtime
(`bounded runtime deploy`) is invoked through `/agents/<name>/<session>` only, not
by arbitrary HTTP paths.

## Declare one

```json
{
  "functions": {
    "broker": {
      "auth": "true",
      "entry": "functions/broker.ts",
      "public": true,
      "methods": ["GET", "POST"],
      "cors": "app",
      "secrets": ["SIGNING_KEY"]
    }
  }
}
```

| Key | Meaning |
|---|---|
| `public` | `true` opens the route. **`auth: "true"` alone never does** - on `/invoke` that rule means "any signed-in caller", and every existing function that uses it stays token-gated. A public function must still declare the literal `auth: "true"`, and cannot combine with `actAs`, `build`, `apps`, `email`, `queueCallable`, `webhook`, or `browser`. |
| `methods` | The verbs the route answers: any of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, uppercase, no duplicates. Omitted means `POST` only. `HEAD` is admitted whenever `GET` is. `OPTIONS` follows `cors`. Anything else is a `405` naming the allowed set. |
| `cors` | `"app"`: the platform answers preflight itself and reflects an `Origin` only when it is one of the app's configured origins - the slug host, active custom domains, and any extras you added with `bounded domains origins` (see [domains](../../bounded-deploy/docs/domains.md)). `"passthrough"`: `OPTIONS` reaches your function and your own `Access-Control-*` headers are honored. Omitted: no CORS headers cross at all, even if the function sets them. There is no wildcard mode; use `passthrough` and set the header yourself if a route is truly for any origin. |

Deploy it like any function - the keys ride the policy, or the CLI flags:

```sh
bounded functions deploy broker --entry functions/broker.ts --app-id <id> \
  --auth true --public --method GET --method POST --cors app
bounded functions list --app-id <id>     # prints the public URL beside each public function
```

A code pin that omits the flags preserves `public`, `methods`, and `cors`
together; an explicit `--public=false` (or `public: false` in policy) drops all
three. Withdrawing the route makes the function ordinary again, so give it a
caller-gated `auth` at the same time (for example `@user.id != null`) or delete
it: the deploy gate refuses an ordinary function whose rule is the literal
`"true"`, because Z3 proves that rule needs no authenticated caller. That same
refusal is what stops `auth: "true"` from ever opening a route on its own.
`bounded verify` refuses every invalid combination by name.

## Where it answers

```text
https://<slug>-api.bounded.page/<functionName>[/<anything>]        once the app has a slug
https://functions.bounded.sh/apps/<appId>/<functionName>[/<anything>]   always
```

`<slug>-api.bounded.page` keeps `/agents/*` for the whole-backend runtime; every
other path is a public function, or `404` when no `public: true` function of that
name exists. The sub-path after the function name and the query string are yours.

## Write one

The function receives a standard `Request` as its first argument and may return a
`Response`; anything else it returns is served as JSON with status `200`.

```ts
export default async function broker(req: Request, ctx) {
  const url = new URL(req.url);            // https://<slug>-api.bounded.page/v0/tokens?x=1
  if (url.pathname === "/.well-known/jwks.json" && req.method === "GET") {
    return new Response(JSON.stringify({ keys: await publicKeys(ctx) }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  }
  if (url.pathname === "/v0/tokens" && req.method === "POST") {
    // Authorization is YOURS. ctx.user.id is a real caller only when the request
    // carried a valid Bounded bearer; otherwise it is the anonymous public principal.
    const apiKey = req.headers.get("x-api-key");
    if (!(await apiKeyIsValid(ctx, apiKey))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
      });
    }
    const body = await req.json();
    await ctx.bounded.set(`tokens/${body.id}`, { issuedBy: ctx.user.id }); // rules + invariants still apply
    return Response.json({ ok: true });
  }
  return new Response("not found", { status: 404 });
}
```

What crosses in and out:

- `req.url` is the entry origin plus the sub-path and query: `https://<slug>-api.bounded.page/v0/tokens?x=1` on the app host, `https://functions.bounded.sh/v0/tokens?x=1` on the dispatcher host. Route on `pathname`.
- Your caller's headers reach you as sent, including `Authorization` (so your own tokens work), minus `cookie`, `x-bounded-*`, `x-internal-*`, `x-test-*`, and hop-by-hop fields.
- Request bodies are UTF-8 text up to 128 KiB, never compressed. `GET`/`HEAD` carry no body.
- Response headers cross only from this allowlist: `content-type`, `cache-control`, `etag`, `last-modified`, `expires`, `vary`, `content-language`, `content-disposition`, `allow`, `retry-after`, `www-authenticate`, `link`, plus the `Access-Control-*` set under `cors: "passthrough"`. `Set-Cookie` never does, and a `3xx` becomes a `502` - public functions cannot redirect.
- A thrown error is a `500 { "error": "<message>" }`. Every response carries `x-bounded-invocation-id`, which matches the durable log entry in `bounded functions logs`.
- Cost-bearing calls (`ctx.ai`, `ctx.services`) still need an idempotency key; a caller may supply an outer `Idempotency-Key` header exactly as on `/invoke`.

## Who is calling

Identity is **verify-if-present**:

- A valid Bounded bearer for this app runs the function as that user: `ctx.user` is the caller and `ctx.bounded` writes as them, exactly like `/invoke`.
- No token, a token for another app, an expired one, or a token of your own scheme in `Authorization` all run the function under the reserved public principal `__bounded_public_v1__:<hash of app + function>` with `ctx.user.claims.public === true`. The platform **never** rejects a public request because of its `Authorization` header.

So one handler can serve your signed-in web app and your headless SDKs, but
"public" means public: gate every action yourself. `ctx.user.id` is non-null on
both paths, so policy rules like `@user.id != null` pass for the public
principal - write rules against real identities (`get(/admins/@user.id) != null`,
an owner field) where it matters. Rules and invariants still run on every
`ctx.bounded` write; the public principal cannot spend `ctx.ai` or `ctx.build`.

## Limits and fences

- 120 requests per minute per app+function per Cloudflare location, before any config or body read; exhausted returns `429` with `Retry-After: 60`.
- 128 KiB body, UTF-8 only, no `Content-Encoding`. Function timeout as declared (`timeout`, default 30s).
- Single-surface: a public function is invisible to `/invoke` (`404`), cannot be a schedule, `dueRows`, live-call, queue, or Open Apps target, and the validator refuses those references.
- Removing `public: true` closes the route on the next request. Deploying `public: true` on a function whose code predates this contract answers `503 public_function_runtime_stale` until you redeploy it.

## The two narrower public modes

Both predate `public` and stay as they are:

| Mode | Declare | URL | Transport |
|---|---|---|---|
| Webhook receiver | `"webhook": true` | `POST https://functions.bounded.sh/webhooks/<appId>/<fn>` | Server-to-server only. `Content-Type: application/json`, `x-bind-event-id`, `x-bind-signature: sha256=<hex>`; the function receives `{ eventId, signature, body }` with `body` the exact raw JSON text and must verify the HMAC with its declared secret. No CORS, 128 KiB cap. |
| Browser-public | `"browser": { "origins": ["https://app.example.com"] }` | `POST https://functions.bounded.sh/public/<appId>/<fn>` | `Origin` must exactly match a declared origin; `POST` and its preflight only; JSON object body up to 16 KiB passed directly as `args`; exact-origin CORS. |

Each requires the literal `auth: "true"`, refuses `actAs`/`build`/`apps`/`email`,
runs under its own reserved principal (`__bounded_webhook_v1__:`,
`__bounded_browser_v1__:`), and is single-surface. Declare exactly one of
`webhook`, `browser`, or `public` per function. New work should use `public`.

## Related

- [functions.md](functions.md) - declaring, `ctx`, invoke, deploy
- [backend-runtime.md](backend-runtime.md) - the whole-backend runtime and its `/agents` invoke path
- [domains.md](../../bounded-deploy/docs/domains.md) - the slug that gives an app its `-api` host and configured origins
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) - `functions deploy --public --method --cors`
