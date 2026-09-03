# Functions — the imperative escape hatch

**What's in here / when to read this:** the full Functions reference — declare in
policy, write the `ctx` API, invoke (CLI + TS), deploy, secrets, scheduling, the
proof boundary. The larger `ctx` capabilities (`ctx.ai`, `ctx.services`, `ctx.browser`,
`ctx.enqueue`, `ctx.build`) each have their own page, linked from the capabilities table. **First decide you even need one:**
[functions-when-to-use.md](functions-when-to-use.md).

Declarative policy can't express *"fetch third-party data, then update
accordingly"*: call Stripe / an LLM / any external API, transform the result,
then write. **Functions** close that gap — without breaking the proof thesis.

> **The honest line.** Functions are your imperative escape hatch. Bounded **does
> not prove their logic** — but **they can't break your declared invariants**, and **only
> authorized callers can invoke them**.

## Why functions are still safe (the proof boundary)

Two guarantees hold no matter what a function's code does:

1. **Every write goes back through the policy boundary.** A function writes via
   `ctx.bounded` (the data plane), so authorization rules are enforced and
   declared invariants are re-checked. A function **cannot break a declared
   invariant** — a violating write comes back as a `409` and throws inside the
   function.
2. **Invocation is policy-gated.** *Who* may call a function is the `auth`
   expression — a policy rule, evaluated by the **same engine** as your
   read/create rules, **before** the function runs. Authorization stays
   declarative and analyzable; it does not live in the function body.

What is **not** proven: the function's own logic (the third-party call, the
transform). That's the deliberate trade — imperative power in exchange for
"Bounded proves declared invariant obligations, enforces authorization rules,
and does not prove the function body."

**Caller-scoped vs service identity.** A normal function writes as the verified
caller, so `auth: "true"` means any logged-in caller may invoke it and
`ctx.bounded` still cannot exceed that caller's data-plane authority. A function
that declares `actAs` writes as a backend/service identity and is therefore
privileged: deploy requires its `auth` rule to imply the app's admin predicate
using a runtime-valid expression such as `get(/admins/@user.id).active == true`
(`.active == true` implies the row exists, so it satisfies the deploy gate while
giving you a real off-switch - see [admin-and-ownership.md](admin-and-ownership.md)).
Declare and bootstrap that `admins/$userId` scope before deploying an `actAs` function.

## When to reach for a function — read this first

A Function's **imperative body is not itself proved by `bounded verify`**.
Default to enforced rules and declared invariant obligations, then hooks; reach
for a function **only when the logic must leave the boundary** (external API,
secrets, complex imperative work). The full
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
  "constants": {
    "FOUNDER": "<founder-user-id>",
    "SUBS_SYNC_ACTOR": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm"
  },
  "subs/$userId": {
    "rules": {
      "read": "@user.id != null && @user.id == $userId",
      "create": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "update": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "delete": "false"
    },
    "fields": { "active": "Bool", "renewsAt": "UInt" }
  },
  "stripeCustomer/$customerId": {
    "rules": {
      "read": "@user.id != null && get(/admins/@user.id) != null",
      "create": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "update": "@user.id != null && @user.id == @const.SUBS_SYNC_ACTOR",
      "delete": "false"
    },
    "fields": { "user": "String" }
  },
  "admins/$adminId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && (get(/admins/@user.id).active == true || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true"
    },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "syncStripe": {
      "auth": "@user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/syncStripe.ts",
      "actAs": "AK5RcyBCHnMmiS9KN1RMPktVKpjeEZKMhV6oe6r7m9Hm",
      "timeout": 30,
      "secrets": ["STRIPE_KEY"]
    }
  }
}
```

Seed `admins/<FOUNDER>` once as the founder after deploy, with `{ "active": true }`.
`bounded data set` does not bypass rules; the founder disjunct is what makes the
first write possible. After that, active admins may create later admin rows. See
[admin-and-ownership.md](admin-and-ownership.md#bootstrapping-the-first-admin--the-genesis-flow).
The gate is a **real off-switch**: every privileged rule and the `syncStripe`
`auth` read `get(/admins/@user.id).active == true`, so setting a compromised
admin's row to `{ "active": false }` immediately blocks them from invoking this
`STRIPE_KEY`-signing Function. An active admin performs that deactivating write;
`update` also requires `.active == true`, so a deactivated admin cannot reactivate
themselves. Because this `admins` registry declares `active`, do not gate on
`get(/admins/@user.id) != null` alone - existence never consults `active`, leaving
this money-adjacent Function with no working revocation. (A registry that declares
**no** `active` field may gate on bare existence and revoke by deleting the row;
this example ships `active`, so its gate must read it.)
Replace the sample sync address with one dedicated to your app, using the same
public address for both `SUBS_SYNC_ACTOR` and `syncStripe.actAs`. Admins may
invoke the Function, but only that service identity may create or update
subscription rows; an admin cannot bypass the Function with a direct client
write. That same identity owns the `stripeCustomer/$customerId -> user` mapping,
which a verified Stripe webhook writes on Checkout completion; `syncStripe` reads
the credited account from that mapping instead of trusting a caller-supplied id.
For offchain data writes, the owner-declared `actAs` identity does not
need a private key; cryptographic/onchain signing does.

*(This exact snippet validates clean against the real policy validator.)*

| Key | Meaning |
|---|---|
| `auth` | **Required.** The invocation rule — a policy expression (same language as `rules`). `@user` is the verified caller — `{ id, address, email }` where `@user.id` is the universal stable identity (always present), `@user.address` is a real onchain wallet (present by default for supported email/social logins too, and null for phone-only sessions, `auth.wallets: false` apps, and the legacy lazy `authMode: "bounded"` path), and `@user.email` is the verified email (null for wallet logins). `"true"` = any logged-in caller; `get(/admins/@user.id).active == true` = only active admins (a real off-switch). Gate identity/membership on `@user.id`. Evaluated before the function runs; deny → `403`. |
| `entry` | **Required.** Relative path to the function's source file (e.g. `functions/syncStripe.ts`). No absolute paths, no `..`. |
| `timeout` | Optional. Per-invocation wall-clock seconds, `1`–`300` (default `30`). |
| `secrets` | Optional. UPPER_SNAKE_CASE names exposed to the function as `ctx.env.*`. Only declared names are surfaced. Rejected under top-level `oapp: true`; an oApp function must omit this key. `actAs` is not a secret and remains allowed. |
| `sandbox` | Optional. `true` or `{ "enabled": true }` opts this function into app-scoped `ctx.sandbox` container operations. Omitted/`false` keeps `ctx.sandbox` unavailable. Use only for trusted backend jobs that need isolated command/file execution. **Concurrency-bounded:** a sandbox container is a real shared resource, so an app (and an account, across its apps) may only hold a limited number of live containers at once - each distinct `scope` you pass is a distinct container that counts toward the limit, and a container stays counted for a short idle window after your call returns (it is kept warm, not destroyed). Exceeding the limit is a fail-closed `429` `sandbox_concurrency_limit` (with `retryAfterMs`); reuse the **same** `scope` for sequential steps that share a workspace so they share one container instead of each consuming a slot. Sandbox is a paid capability - a plan (or account) with no sandbox allowance is refused with `403` `sandbox_capability_plan_gated`. |
| `build` | Optional. Grants app-build origination via `ctx.build` (the unified Build system — successor to `ctx.oapps`). `{ profile, create?, edit?, fork?, view?, cancel? }` — the capability *is* the authority (invariant 4). **Cannot** be combined with `webhook`, `browser`, or `public`: a build capability on an unauthenticated Internet surface would let anonymous callers spend the owner's build funds, so the validator rejects both combinations. Promotion and gate-decision authority are never grantable. See [§ctx.build](functions-ctx-build.md). |
| `public` | Optional. `true` serves the function on the app's public HTTP surface (`https://<slug>-api.bounded.page/<name>/...` and `https://functions.bounded.sh/apps/<appId>/<name>/...`) with **no Bounded session required**: the function receives a standard `Request` and may return a `Response`. Requires the literal `auth: "true"` - which on its own never makes a function public - and cannot be combined with `actAs`, `build`, `apps`, `email`, `queueCallable`, `webhook`, or `browser`. A valid Bounded bearer runs it as that user; every other caller runs it as the function-scoped public principal, so it must authorize its own actions. See [public functions](public-functions.md). |
| `methods` | Optional, `public` only. The verbs the route answers, from `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. Omitted means `POST`; `HEAD` follows `GET`; `OPTIONS` follows `cors`. |
| `cors` | Optional, `public` only. `"app"`: the platform answers preflight and reflects only the app's configured origins (slug host, custom domains, added extras). `"passthrough"`: `OPTIONS` and your own `Access-Control-*` headers reach the caller. Omitted: no CORS. |
| `environments` | Optional, **CLI-only**. A non-empty array of names from the policy's top-level `environments` block: this function deploys to those environments and to no others, and the key is stripped before the policy is sent. Every other environment drops the function entirely, so a test-venue function cannot reach a real app — and once any function carries this key, `deploy`/`verify`/`functions deploy --all` refuse to run without `--environment`. See [environments.md](../../bounded-deploy/docs/environments.md#environment-scoped-functions). |

**Auth-by-policy is the point.** Because the invocation rule is evaluated by the
same engine as your data rules, "who can call this when" is declarative,
consistent, and analyzable — not buried in imperative code.

## Write a function (the `ctx` API)

A function is a default-exported async function. It receives the caller-supplied
`args` and an injected `ctx`:

```ts
export default async function (args, ctx) {
  // ctx.user   — the verified caller, or the service identity when actAs is set
  //              (the invocation auth gate still evaluated the original caller first)
  // ctx.bounded — pre-authed @bounded-sh/client client; writes go THROUGH invariants
  // ctx.env    — the resolved secrets (declared names): app-store + deploy-time
  // ctx.secrets — await ctx.secrets.get("NAME"); the documented secret accessor
  // ctx.ai     — built-in AI router, no provider key in app code
  // ctx.services — managed third-party API discovery/invoke
  // fetch      — standard outbound HTTP
  return { ok: true };
}
```

| `ctx` member | What it is |
|---|---|
| `ctx.user` | `{ id, address, email, claims, system? }` — the verified caller for a normal function. `ctx.user.id` is the **universal stable identity** (always present; equals `@user.id` in policy) — use it for ownership/membership. `ctx.user.address` is a **real onchain wallet** (equals `@user.address`; present by default for supported email/social logins, null for phone-only sessions, `auth.wallets: false` apps, and the legacy lazy `authMode: "bounded"` path) — use it only for onchain/wallet semantics. For an `actAs` function, Bounded first evaluates `auth` against the original caller and then sets `ctx.user.id == ctx.user.address == actAs`; `ctx.bounded` uses that same service identity. The function body does not receive the original caller as `ctx.user`. |
| `ctx.auth` | `{ enforced, rule, system }` — **authorization the platform ALREADY did for you.** `rule` is the exact policy `auth` expression that passed before your code ran (null for system/scheduled runs). Read this instead of re-implementing authz: if you declared an `auth` gate, it has already passed. |
| `ctx.bounded` | A pre-authed data client: `ctx.bounded.get(path)`, `.set(path, doc)`, `.setMany([{ path, document }, ...])`, `.delete(path)`, and `ctx.bounded.runQuery(path, queryName, args?)`. **Writes are re-checked by enforced rules and proved invariant obligations** — a `409` throws. `setMany` is one atomic batch, so use it for transfers/settlement. `runQuery` runs one of your policy-declared, deploy-validated queries under the acting identity's read authority, so you **reuse policy logic for authz/data instead of re-implementing it** (e.g. an `isTeamMember` query). A query participates in a proof only when a supported proof obligation references it. |
| `ctx.env` | The resolved secrets, narrowed to the names in `functions.<name>.secrets`. Values come from the app secret store (`bounded secret put`); bare `--secret NAME` declares exposure on a standalone deploy, while legacy `--secret NAME=VALUE` overrides the store for that function version. Nothing undeclared leaks in. |
| `ctx.secrets` | The documented secret accessor: `await ctx.secrets.get("NAME")` returns the value (or null). Reads the **same** resolved map as `ctx.env`, so `bounded secret put OPENAI_KEY …` → `ctx.secrets.get("OPENAI_KEY")` works. See [secrets.md](secrets.md). |
| `ctx.ai` | **The built-in AI router — chat (`run`), images (`generateImage`), video (`generateVideo`/`getJob`). No API key.** Routes any model through the Bounded AI Gateway, billed to the app owner's AI/external-services bucket, capped fail-closed. This is how you add an LLM — or native image/video generation — to your app; see [§ctx.ai](functions-ctx-ai.md) and [§media](functions-ctx-ai.md#ctxai-media-generation--images-sync-and-video-async-jobs) below. |
| `ctx.services` | **Managed third-party API discovery and proxy invoke — `search`, `describe`, `invoke`.** Search/describe help agents find the right API shape. Invoke runs through Bounded's managed provider proxy, billed to the app owner's AI/external-services bucket at the applicable upstream service cost plus 5%, capped fail-closed. See [§ctx.services](functions-ctx-services.md). |
| `ctx.enqueue` | **Background jobs — `ctx.enqueue(functionName, payload?, opts?)` → `{ jobId }`.** Schedule another deployed function (or this one) to run *later*, server-side, without blocking. The queued run executes as the **null system principal** (`ctx.user.id == null`, `ctx.user.system == true`), never as the enqueuer, so the target must opt in with `queueCallable: true` in policy; it receives `payload` as its `args` and meters compute usage exactly like an HTTP invocation. See [§ctx.enqueue](functions-ctx-enqueue.md). |
| `ctx.build` | **Governed app builds — `create` / `edit` / `fork` / `get` / `cancel`.** Present only when the function's policy declares a `build` capability; otherwise every method returns `{ ok: false, reason: "build_capability_missing" }` with no network call. Originates AI app builds through the unified Build control plane, funded and governed by the named build profile. See [§ctx.build](functions-ctx-build.md). |
| `fetch` | The standard global — call any third-party API (a broker, a data feed, Stripe…). **For LLM/AI inference use `ctx.ai`, not `fetch` + your own key.** For Bounded-managed service proxies use `ctx.services`; for providers you integrate directly, keep keys in `ctx.secrets`. |
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

```ts
// one atomic settlement batch; nothing partial commits
export default async function settleTrade(args, ctx) {
  const buyer = ctx.user.id;
  const good = await ctx.bounded.get(`goods/${args.goodId}`);
  const sellerWallet = await ctx.bounded.get(`wallets/${good.holder}`);
  const buyerWallet = await ctx.bounded.get(`wallets/${buyer}`);

  await ctx.bounded.setMany([
    { path: `goods/${args.goodId}`, document: { ...good, holder: buyer } },
    { path: `wallets/${good.holder}`, document: { ...sellerWallet, ink: sellerWallet.ink + good.price } },
    { path: `wallets/${buyer}`, document: { ...buyerWallet, ink: buyerWallet.ink - good.price } },
  ]);
  return { ok: true };
}
```

You only write the function body; Bounded handles the wrapper around it.

## Capabilities of `ctx` (one page each)

Everything below is a facet of the same `ctx` object; each has its own page so a
function that does not use it never loads it.

| You need | Read |
|---|---|
| `ctx.ai.run`, `ctx.ai.generateImage`, `ctx.ai.generateVideo`, `getJob`, AI budgets | [functions-ctx-ai.md](functions-ctx-ai.md) |
| `ctx.services`, managed third-party APIs, `bounded services` | [functions-ctx-services.md](functions-ctx-services.md) |
| `ctx.browser`, headless browser, smoke tests, egress-fenced browsing | [functions-ctx-browser.md](functions-ctx-browser.md) |
| `ctx.enqueue`, background jobs, queues, `queueCallable`, replay identity | [functions-ctx-enqueue.md](functions-ctx-enqueue.md) |
| `ctx.build`, functions that originate app builds, promotion profiles | [functions-ctx-build.md](functions-ctx-build.md) |

A queued or scheduled run executes as the null system principal: `ctx.user` is
`{ id: null, address: null, email: null, system: true }`, so gate on
`ctx.user.id == null`, never on `ctx.user` itself (which is always an object).
See [functions-ctx-enqueue.md](functions-ctx-enqueue.md).

## Invoke a function

A function declared `public: true` is not invoked this way at all: it answers plain HTTP at the app's API host with no session, see [public functions](public-functions.md). For every other function, the supported invoke path today is the **CLI**, which attaches your session
token automatically — the **same token** `bounded data` uses — so Bounded
verifies your identity and evaluates the function's `auth` rule before running it:

```sh
bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'
```

It prints the function's JSON result, or fails with a public error such as
`401` not logged in, `403` the `auth` rule denied you, `404` unknown function,
or the error the function threw.

### From TypeScript

Use the first-class `functions.invoke(name, args)` helper (exported from both
`@bounded-sh/client` and `@bounded-sh/server`). It attaches the caller's session token
automatically — the **same** token the data plane sends — so you never hand-roll
auth headers:

```ts
import { functions } from "@bounded-sh/client"; // or "@bounded-sh/server"

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

The platform gates the call on the function's `auth` rule using the verified
caller, so the identity the function sees is exactly the one your data rules
would see. On failure it throws `FunctionInvokeError` with the public status
code and message.

## Deploy a function

```sh
bounded functions deploy syncStripe \
  --entry functions/syncStripe.ts \
  --app-id <id> \
  --auth 'get(/admins/@user.id).active == true' \
  --secret STRIPE_KEY \
  --timeout 30

printf '%s' "$STRIPE_KEY" | bounded secret put STRIPE_KEY --value-stdin --app-id <id>
bounded functions list   --app-id <id>
bounded functions logs   syncStripe --app-id <id>
```

The `--entry` may be **TypeScript or JavaScript**. Type annotations are fine.
Bare `--secret STRIPE_KEY` declares the name without putting its value in argv;
`secret put` supplies the app-stored value separately.

**A function may be split across files.** Import siblings with ordinary relative
specifiers and deploy the entry as usual - the CLI uploads the entry plus the
source files in its directory, and the platform bundles them:

```
functions/
  syncStripe.ts        ← --entry, imports "./stripe/charges"
  stripe/
    charges.ts
```

Keep a function's modules inside the entry's own directory: that directory is
what gets uploaded, so an import reaching outside it will not resolve. Only
source extensions travel (`.ts`, `.tsx`, `.js`, `.mjs`, `.json`, …) - a README or
a fixture in that folder is ignored - and `node_modules` is never uploaded, so
npm dependencies still cannot be imported. Limits are 100 files, 512 KB per file
and 2 MB total; an oversize tree is refused locally with those same numbers.
Older CLI versions upload only the entry and refuse a relative import at deploy
time with `Relative import ... cannot be resolved`, so if you see that, update.

**Never import a credential file into a function.** A bundle is a stored
artifact, so importing a key file hardcodes a secret into it. The CLI refuses to
package a file in the closure whose bytes look like credential material - a PEM
private key, a GCP/Firebase `service_account` JSON, a Bounded credentials file,
or a raw Solana keypair array - and redirects you to the supported path:

```
refusing to package infra/service-account.json (imported by function entry syncStripe.ts):
it looks like a service-account key. A function must not bundle a credential file -
store the value with `bounded secret put <NAME>` and read it from ctx.env at invoke time.
```

The supported path is [secrets](secrets.md): `bounded secret put NAME` stores the
value per app, you declare `NAME` under `functions.<name>.secrets`, and the
function reads it from `ctx.env.NAME` / `ctx.secrets.get("NAME")` - resolved at
invoke time, never baked into the artifact. If a file genuinely is not a secret
and trips the check (e.g. a 32/64-integer hash-vector fixture the function
imports), clear it locally with `BOUNDED_PACKAGING_ALLOW=<relative/path>` - an
environment override, deliberately not a committed file a repository contributor
could edit in the same change that plants the key.

Two deploy-ordering notes worth knowing:
- **A policy deploy preserves deployed functions.** When your `policy.json` omits
  the `functions` block, the server carries the already-deployed functions (and
  their pinned code versions) forward, so a plain `bounded deploy` no longer drops
  them — no need to re-run `bounded functions deploy` afterward. To remove a
  function, use `bounded functions delete <name>` (a policy that explicitly
  declares `functions` is still honored verbatim). *(Older behavior wiped the
  functions on any policy deploy; fixed in the dev-api 2026-07-09.)*
- **Pins take ~20–30s to propagate.** A 404 right after a successful
  `functions deploy` usually just needs a short wait, not a redeploy.

A function's `console.*` output is **captured** and viewable; **who** may view it
is the per-function `logsAuth` policy rule (defaults to app managers; declared
secret values are redacted). Set a fixed backend identity with `actAs`. In a
policy file these are `logsAuth` and `actAs`; on standalone function deploys,
explicit flags replace those fields and omitted optional metadata is preserved
by the deploy service. See [identity-and-logs.md](identity-and-logs.md) and
[service-keys.md](service-keys.md).

Remove or replace a function with the Bounded CLI when you no longer want it
exposed. Deploy validates the function declaration and updates the app's
registered backend code. Only the app owner or an authorized collaborator may
deploy.

## Worked example — sync a Stripe subscription, then write

`functions/syncStripe.ts`:

```ts
export default async function (args, ctx) {
  // Only admins reach here — `auth` gated the original caller before actAs.
  const { customerId } = args;
  if (!customerId) throw new Error("customerId is required");

  // Derive the credited account from a SERVER-HELD mapping, never from a caller
  // argument. `stripeCustomer/$customerId` is written only by the sync service
  // identity from a verified Stripe webhook / Checkout completion, so it is the
  // trusted link between a paying customer and an app account. Any userId in
  // `args` is untrusted and is deliberately ignored — trusting it would let an
  // admin credit their own account using a stranger's customerId.
  const mapping = await ctx.bounded.get(`stripeCustomer/${customerId}`);
  const userId = mapping?.user;
  if (!userId) throw new Error("no verified mapping for this Stripe customer");

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
  //    ctx.user and the data client act as SUBS_SYNC_ACTOR, the only identity the
  //    collection allows to create/update rows. The original admin is not ctx.user.
  await ctx.bounded.set(`subs/${userId}`, { active, renewsAt });

  return { ok: true, active, renewsAt };
}
```

Invoke it from your admin dashboard with
`bounded functions invoke syncStripe --app-id <id> --data '{"customerId":"cus_123"}'`
(or the TypeScript fetch shown above).

Flow: logged-in admin → invoke (attaches token) → Bounded auth gate (verify token →
resolve `@user` → evaluate `get(/admins/@user.id).active == true` → allow) → the
function (fetch Stripe → transform → `ctx.bounded.set`, re-checked by your rules +
invariants as the declared sync service identity) → returns JSON.

> **Caller-supplied ids are untrusted.** The `auth` boundary proves *who may
> invoke* the Function - not *that the Stripe customer belongs to the account being
> credited*. If the Function trusted a caller-supplied `userId`, an admin (or any
> admin-reachable path: a support tool, an automation, a compromised session) could
> pass a stranger's paying `customerId` with their own `userId` and grant
> themselves a subscription paid for by someone else - or point at an unpaid
> customer to mark a real subscriber unpaid. Derive the credited account from the
> server-held `stripeCustomer/$customerId -> user` mapping that only a verified
> Stripe webhook / Checkout completion (running as the sync service identity) may
> write, and ignore any `userId` in the invocation args.

## Scheduled functions (run a function on a cadence)

> **Available now.** A collection's `schedule { every, run }` whose `run` names a
> top-level `functions.<name>` **fires on the cadence**. It can do
> everything a function can — `ctx.fetch` egress, `ctx.ai.run`, and `ctx.bounded`
> writes through your rules + invariants. Use `actAs` on the function to run it as
> a real identity (so its writes satisfy owner/controller rules) — see below.
>
> **One deploy-ordering rule:** deploy the function before, or together with, the
> policy that schedules it. If you deploy the schedule first, deploy or re-deploy
> the function afterwards so Bounded can attach the schedule to the target.

A function is *meant* to be invokable **on a schedule**, not just on demand: a
collection's `schedule { every, run }` (or `dueRows { run }`) whose `run` names a
**function** (instead of a `hooks.scheduled.<run>` bytecode hook) runs that
function on the cadence as the **system principal**.

```json
{
  "constants": { "FOUNDER": "<founder-user-id>" },
  "rollups/$day": {
    "rules": { "read": "true", "create": "false", "update": "false", "delete": "false" },
    "fields": { "total": "UInt" },
    "schedule": { "every": "1d", "run": "rollupDaily" }
  },
  "admins/$adminId": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && (get(/admins/@user.id).active == true || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id).active == true",
      "delete": "@user.id != null && get(/admins/@user.id).active == true"
    },
    "fields": { "active": "Bool" }
  },
  "functions": {
    "rollupDaily": {
      "auth": "@user.id != null && get(/admins/@user.id).active == true",
      "entry": "functions/rollupDaily.ts",
      "timeout": 120
    }
  }
}
```

*(Validates clean and **fires** — `schedule.run` can name either a scheduled hook
or a top-level function. The `admins` registry gates every privileged path on
`.active == true` (a real off-switch: `active: false` revokes a user-invoker, and
`update` itself requires `.active == true`, so no self-reactivation); seed
`admins/<FOUNDER>` `{ "active": true }` once as the founder. Add
`"actAs": "<address>"` to the function block to run it as that identity so its
`ctx.bounded` writes satisfy owner/controller rules; without `actAs` it runs as
the all-null system principal, which cannot bill `ctx.ai` or satisfy
`owner == @user.id`.)*

> **`dueRows.run` → function caveat.** A `dueRows { run }` pointing at a function
> also fires, but the due row's id is **not** yet passed to the function (it sees
> `args = {"__system":"schedule", ...}`, no row id / no `ctx.origin`), and
> `onComplete:"markDone"` does not apply to a function target. For per-row cadence
> use a scheduled **hook** (which gets the row); use `schedule.run` → function for a
> recurring sweep and do row fan-out inside it.

**Three principal contexts, one function.** The same function can run under three
different callers — see [principals-and-origins.md](principals-and-origins.md) for
the canonical explainer:

1. **User invocation** (`bounded functions invoke`) — gated by the function's
   `auth` rule. `@user` / `ctx.user` is the verified caller.
2. **System / scheduled run** (the schedule, below) — authorized by the
   owner-deployed `schedule` itself: it lives in your signed policy, so Bounded
   runs the function as the **system principal** (`@user` all-null), skipping the
   user-facing `auth` rule.
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
function invocation. The tick `call`ing a function is THE primitive behind AI
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
platform-set and unforgeable — `@origin.kind == 'live'`, with `@origin.module` /
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

The function's `auth` rule uses the same policy expression language as data
rules and is **enforced before the function body runs**. `bounded verify`
understands `@origin` as a first-class special variable and checks the supported
generated obligations that reference the gate; that does not make every auth
expression a blanket proof of product intent.

To ship a **funded** AI NPC, set `session.live.runAs` to a service wallet the owner
funds with AI/external-services credit — then `ctx.ai` in the called function Just Works (capped at
the app account). Per-function `actAs` is the per-call override and wins for that
one function. The anonymous system principal still **cannot** bill AI (`ctx.ai.run`
→ `402`, no account). Precedence: function `actAs` > session `runAs` > anonymous
system. See [service-keys.md](service-keys.md) and [ai-npcs.md](ai-npcs.md) for the
NPC recipe, and [principals-and-origins.md](principals-and-origins.md) for the full
principal matrix.

## Secrets

Declare secret **names** in the policy `functions.<name>.secrets` or with a bare,
repeatable `bounded functions deploy --secret NAME`; supply their
**values** with `bounded secret put NAME --value-stdin --app-id <id>` (the per-app secret
store — set once, read by every function/agent in the app). The function reads
them as `ctx.env.K` **or** `await ctx.secrets.get("K")`. Only declared names are
exposed — an undeclared key never reaches the function. Secret values are never written into
the policy and never returned by `functions list` / `secret list`.

Standalone function redeploy preserves omitted secret grants, while an explicit
bare `--secret NAME` updates the declared names. A legacy `--secret NAME=VALUE` deploy-time
override exists and takes precedence over the app-store value for that one
function version. Prefer bare `--secret NAME` plus `secret put --value-stdin` so
values do not appear in argv, process listings, or shell history.

Secret **values** are stored by Bounded and are never written into policy files.
At invocation, the function receives only the names it declared. Use
`ctx.env.STRIPE_KEY` or `ctx.secrets.get("STRIPE_KEY")`; never pass secret values
through client requests.

## Limits

- **Runtime:** hosted JavaScript/TypeScript backend code. Good for API calls,
  transforms, and SDK writes.
- **Timeout:** `1`–`300` s wall-clock per invocation (`timeout`, default `30`).
  **This 300s wall is Functions-only.** For long-running work, use backend
  runtime and split work into scheduled, resumable steps.
- **Not for:** multi-minute jobs or native-binding npm. For **long-running /
  batch / background** work, use a **backend-runtime project** and decompose it
  into scheduled, resumable steps —
  [backend-runtime.md](backend-runtime.md);
  for native-binding npm, use your own server as a `@bounded-sh/server` client.
- **Memory / subrequests:** bounded by the hosted function runtime.

## What's proven vs not

The proof boundary (recap of "Why functions are still safe", above): **proved** —
the declared invariant and generated safety obligations reported by
`bounded verify`; **enforced** — collection authorization rules on every
`ctx.bounded` write and the function's invocation `auth` gate before code runs;
**NOT proven** — the function's own logic (the fetch, the transform) or whether
an authorization rule matches unstated product intent. Keep anything that must
be a proved state guarantee in a declared invariant, not in function code.

Use a policy rule for authorization and a supported declared invariant for a
state guarantee. Treat function code as useful imperative logic, not as a proof
boundary, and call a property proved only when the verifier reports its concrete
obligation as proved.

## Related

- [functions-when-to-use.md](functions-when-to-use.md) — **when to use a function (and when NOT)** — read first
- [principals-and-origins.md](principals-and-origins.md) — **who `@user` is** across user / system / live-call invocation (the canonical principal explainer)
- [ai-npcs.md](ai-npcs.md) — a live tick `call`s a function = an NPC; the `actAs`-funded LLM pattern
- [agents-flue.md](agents-flue.md) — a **multi-step agent** (tool-use loop) when one `ctx.ai.run` isn't enough
- [backend-runtime.md](backend-runtime.md) — long-running / batch work
- [public-functions.md](public-functions.md) — HTTP routes without a Bounded session: `public`, `methods`, `cors`, public JWKS, machine callers
- [live-runtime.md](live-runtime.md) — the deterministic tick and the `call` primitive that reaches functions
- [../guides/capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — where functions fit (now supported)
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — in-boundary hooks vs notify-out webhooks
- [invariants.md](invariants.md) — the postconditions a function's writes still answer to
- [policy-reference.md](policy-reference.md) — the rule expression language used by `auth`
- [identity-and-logs.md](identity-and-logs.md) — `logsAuth` (who views logs) + the `__managers__` identity sets
- [service-keys.md](service-keys.md) — `actAs`: a function transacting as its own backend identity
- [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) — invoking a function from TypeScript today
