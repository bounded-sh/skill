# Porting an existing app onto Bounded

**What's in here / when to read this:** the user has a working app somewhere
else (Supabase, Firebase, an Express or Next API, a Rails or Django backend, a
cron box) and wants it on Bounded. This page decides what each piece becomes,
in what order to move it, and where a third-party dependency lands on the
capability ladder. Mechanics live in the linked pages; this one only routes.
Part of the **bounded-deploy** skill.

## The decision tree

Walk every piece of the existing app through this tree, top to bottom. Stop at
the first match.

```text
Is it data the app reads and writes?
  -> a COLLECTION with rules (and invariants for anything money-like)        [bounded-backend policy]
Is it a server endpoint that just reads/writes that data with checks?
  -> usually NO function: express the check as a rule; the client writes     [bounded-backend rules]
Is it a server endpoint that calls a third-party API, computes, or batches?
  -> a FUNCTION (fetch + governed writes; secrets in ctx.secrets)            [bounded-backend functions]
Is it a scheduled job (cron, queue worker, nightly rollup)?
  -> a scheduled collection or a function schedule                           [bounded-backend functions]
Is it auth (email, social, wallets)?
  -> Bounded auth; app users sign in through the SDK; @user.id for ownership [bounded-frontend auth]
Is it file/blob storage?
  -> files, governed by the same rules                                       [bounded-backend]
Is it realtime (websockets, presence, live lists)?
  -> subscriptions on collections; nothing to run                            [bounded-frontend]
Is it LLM/AI inference?
  -> ctx.ai, no provider key                                                 [bounded-backend ctx.ai]
Is it a third-party API the app depends on?
  -> the capability ladder: live catalog action, callable through x402,
     or request it - a key in ctx.secrets is the last resort for a PRIVATE
     app and never allowed for an oApp                                       [ctx.services, capability ladder]
Is it payments?
  -> Bounded rails (crypto, provider payments); never your own Stripe key
     in an oApp                                                              [bounded-onchain]
Is it request-time SSR that must run a server?
  -> host that server elsewhere and talk to Bounded from it, or make the
     frontend static; Bounded serves static sites                            [bounded-frontend hosting]
```

## The order that works

1. **Model the data as collections and rules first.** Most existing endpoints
   exist only to check a condition before a write; on Bounded that check IS the
   rule, and the client writes directly. Port the schema, then write the rules,
   then `bounded verify` until every blocking obligation passes. Do not port
   endpoints one-to-one.
2. **Keep only the functions that need a server.** Third-party calls, batch
   computation, and anything that must run with a secret become functions.
   Read [functions](../../bounded-backend/docs/functions.md); reach for
   [ctx.services](../../bounded-backend/docs/functions-ctx-services.md) before
   `fetch` with a key.
3. **Move auth last.** Existing user ids do not carry over as identities;
   re-key ownership on `@user.id` and migrate data with a one-time function or
   `bounded data set-many` from the old export.
4. **Deploy with source**, verify the site serves, test the happy path and a
   denied boundary, and only then cut traffic over.

## Third-party dependencies: the ladder before any key

For every API the old app called with a key, run
`bounded services search "<what it did>"` and read the readiness:

- `live` - call it from a function: `ctx.services.invoke("<slug>", args, { idempotencyKey })`.
- `callable` - an x402-priced API; call it now through `ctx.services.invoke("X402_FETCH", { url, method, body, maxUsd })`. The relay pays per call; the app holds no key.
- `requestable` (or nothing matched) - file it once: `bounded services request "<what you need>"`, follow it with `bounded services status`, and build without it until the Hub says it is live.

A private app may keep a provider key in `ctx.secrets` as a stopgap; an app
headed to openapps.xyz may not, and `bounded oapp preflight` will refuse on it.
Never put a key in frontend code or a repo.

## Recipes by dependency

| The old app had | On Bounded it becomes | Read |
|---|---|---|
| A container or long-running service (a worker loop, a poller, a bot process) | Functions for the work, schedules for the cadence; nothing runs between invocations. A whole-backend runtime (`bounded runtime deploy`) exists for code that cannot be split, but it is **not oApp-eligible**: an app headed to openapps.xyz keeps to policy, functions, and schedules | [functions](../../bounded-backend/docs/functions.md), [backend runtime](../../bounded-backend/docs/backend-runtime.md) |
| Redis (counters, rate limits, leaderboards, caches, queues) | Collections with rules; `rollingSum` and `windowSum` invariants for counters, rate limits, and ranked reads; `ctx.enqueue` from a function for the queue | [invariants](../../bounded-backend/docs/invariants.md), [trending feeds](../../bounded-backend/docs/trending-feeds.md) |
| Websockets, pub/sub, presence | Subscriptions on collections; nothing to run | [realtime](../../bounded-backend/docs/realtime-and-games.md) |
| SQL tables, Firestore, Supabase (rows, RLS, security rules) | Collections and rules; a row-level policy becomes the collection's `rules`, provable here | [policy reference](../../bounded-backend/docs/policy-reference.md), [access patterns](../../bounded-backend/docs/access-patterns.md) |
| Auth vendors (Auth0, Clerk, Firebase Auth, Supabase Auth) | Bounded auth through the SDK; ownership re-keyed on `@user.id` | [auth](../../bounded-frontend/docs/auth.md) |
| Email vendors (SendGrid, Postmark, Resend) | `ctx.email` from a function; no vendor key | [functions](../../bounded-backend/docs/functions.md) |
| Vendor AI keys (OpenAI, Anthropic, Replicate) | `ctx.ai`; no key, billed to the app's bucket | [ctx.ai](../../bounded-backend/docs/functions-ctx-ai.md) |
| Object storage (S3, GCS, Cloudinary) | Files, governed by the same rules | [functions](../../bounded-backend/docs/functions.md) |
| Stripe and card processing | Crypto acceptance and Bounded's provider payment rails; for an oApp a card processor billed to a person is a call-out, not a key | [accept crypto](../../bounded-onchain/docs/accept-crypto.md), [capability ladder](../../oapps-fun/docs/capability-ladder.md) |
| Any other third-party API | The capability ladder: `live`, `callable` through `X402_FETCH`, or `bounded services request` | [ctx.services](../../bounded-backend/docs/functions-ctx-services.md) |

Data migrations are out of scope for this guide: Bounded moves the app's
shape and rules, not its history. Export the old data and load what the new
rules admit with `bounded data set-many` or a one-time function; what the
rules refuse was never admissible under the new policy.

## Recipes by source stack

### Supabase or Firebase

- Tables/documents become collections; row-level security or security rules
  become `rules` on each collection (same intent, provable here).
- Realtime channels become subscriptions; there is nothing to deploy for them.
- Edge functions / cloud functions become Bounded functions only when they call
  out or batch; a "check then write" function becomes a rule.
- Storage buckets become files under the same rules.
- Auth: replace the client SDK with Bounded's; re-key ownership on `@user.id`.

### Express, Fastify, Next API routes, Rails, Django

- Route handlers that validate and write become rules; the client writes with
  the SDK. Handlers that call other services or run computation become
  functions.
- Middleware auth becomes the `auth` rule on a function or a read/create rule
  on a collection.
- Background workers and cron become schedules.
- The frontend stays where it is if it is static; deploy it with
  `bounded site deploy dist --with-source`. If it needs request-time SSR, host
  that server elsewhere and point it at Bounded.

### A backend that exists mainly to hold API keys

- List every key. For each: ladder it (above). What is `live` or `callable`
  needs no key and no server. What is neither is requested, and the feature is
  built without it or called out.
- What is left over is usually small enough to be one function per key.

## Verify before you say it is ported

- `bounded verify` passes with no blocking results.
- `bounded site deploy` served the site; a denied write returns `403`, a
  denied read returns an empty `200`.
- For an oApp: `bounded oapp preflight` is READY and `bounded oapp rehearse`
  runs the app from zero data.
