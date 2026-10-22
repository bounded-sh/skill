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
     or request it - or keep the provider and its key in ctx.secrets
     (not for an app headed to an APO on openapps.xyz)                       [ctx.services, capability ladder]
Is it payments?
  -> Bounded rails (crypto, provider payments); never your own Stripe key
     in an app headed to an APO                                              [bounded-onchain]
Is it request-time SSR that must run a server?
  -> Next.js: run it here, built with vinext; anything else: make the
     frontend static, or host that server elsewhere                          [bounded-frontend server apps]
```

## The order that works

1. **Model the data as collections and rules first.** Most existing endpoints
   exist only to check a condition before a write; on Bounded that check IS the
   rule, and the client writes directly. Port the schema, then write the rules,
   then `bounded tests run` until every allow and deny case you expect passes.
   Do not port endpoints one-to-one.
2. **Keep only the functions that need a server.** Third-party calls, batch
   computation, and anything that must run with a secret become functions.
   Read [functions](../../bounded-backend/docs/functions.md); reach for
   [ctx.services](../../bounded-backend/docs/functions-ctx-services.md) before
   `fetch` with a key.
   `bounded deploy` (with or without `--create`) registers the functions the policy declares but does not upload their code; `bounded functions deploy --all --policy policy.json` does.
   Until then an invoke answers `Function "<name>" is not deployed with a pinned code version`.
3. **Move auth last.** Existing user ids do not carry over as identities;
   re-key ownership on `@user.id` and migrate data with a one-time function or
   `bounded data import` from the old export.
4. **Deploy with source**, verify the site serves, test the happy path and a
   denied boundary, and only then cut traffic over.

## Third-party dependencies: the ladder before any key

For every API the old app called with a key, run
`bounded services search "<what it did>"` and read the readiness:

- `live` - call it from a function: `ctx.services.invoke("<slug>", args, { idempotencyKey })`.
- `callable` - an x402-priced API; call it now through `ctx.services.invoke("X402_FETCH", { url, method, body, maxUsd })`. The relay pays per call; the app holds no key.
- `requestable` (or nothing matched) - file it once: `bounded services request "<what you need>"`, follow it with `bounded services status`, and build without it until the Hub says it is live.

An app may keep a provider it already uses, with the key the owner sets in `ctx.secrets`; an app
headed to an APO on openapps.xyz may not, and `bounded oapp preflight` will refuse on it.
Never put a key in frontend code or a repo.

## Recipes by dependency

| The old app had | On Bounded it becomes | Read |
|---|---|---|
| A container or long-running service (a worker loop, a poller, a bot process) | Functions for the work, schedules for the cadence; nothing runs between invocations. A whole-backend runtime (`bounded runtime deploy`) exists for code that cannot be split, but it is **not oApp-eligible**: an app headed to openapps.xyz keeps to policy, functions, and schedules | [functions](../../bounded-backend/docs/functions.md), [backend runtime](../../bounded-backend/docs/backend-runtime.md) |
| Redis (counters, rate limits, leaderboards, caches, queues) | Collections with rules; `rollingSum` and `windowSum` invariants for counters, rate limits, and ranked reads; `ctx.enqueue` from a function for the queue | [invariants](../../bounded-backend/docs/invariants.md), [trending feeds](../../bounded-backend/docs/trending-feeds.md) |
| Websockets, pub/sub, presence | Subscriptions on collections; nothing to run | [realtime](../../bounded-backend/docs/realtime-and-games.md) |
| SQL tables, Firestore, Supabase (rows, RLS, security rules) | Collections and rules; a row-level policy becomes the collection's `rules`, enforced here | [policy reference](../../bounded-backend/docs/policy-reference.md), [access patterns](../../bounded-backend/docs/access-patterns.md) |
| Auth vendors (Auth0, Clerk, Firebase Auth, Supabase Auth) | Bounded auth through the SDK; ownership re-keyed on `@user.id` | [auth](../../bounded-frontend/docs/auth.md) |
| Email vendors (SendGrid, Postmark, Resend) | `ctx.email` from a function; no vendor key | [functions](../../bounded-backend/docs/functions.md) |
| Vendor AI keys (OpenAI, Anthropic, Replicate) | `ctx.ai`; no key, billed to the app's credit pool | [ctx.ai](../../bounded-backend/docs/functions-ctx-ai.md) |
| Object storage (S3, GCS, Cloudinary) | Files, governed by the same rules | [functions](../../bounded-backend/docs/functions.md) |
| Stripe and card processing | Crypto acceptance and Bounded's provider payment rails; for an oApp a card processor billed to a person is a call-out, not a key | [accept crypto](../../bounded-onchain/docs/accept-crypto.md), [capability ladder](../../openapps/docs/capability-ladder.md) |
| Any other third-party API | The capability ladder: `live`, `callable` through `X402_FETCH`, or `bounded services request` | [ctx.services](../../bounded-backend/docs/functions-ctx-services.md) |

Export the old data and load what the new rules admit with `bounded data import <path template> --from <file.jsonl|file.csv>`.
The template names each record's document: `'agents/$slug'` writes the record whose `slug` is `a1` to `agents/a1`, and a bare `agents` means `agents/$id`.
Records go through the app's rules, field types and invariants like any write, and a rerun resumes where the last one stopped.
A value is written as it is, so an array or object in the export is refused until it is turned into a declared type (see the field facts below).
What the rules refuse was never admissible under the new policy.

## Keep your backend

Porting is optional for an Owned app.
An app may keep Supabase, Firebase or another backend it already uses and host only its frontend here.
Client config such as a Supabase URL and anon key or a Firebase web config is public, not a secret: the build inlines `VITE_*` and `NEXT_PUBLIC_*` values, and no build sees a value set with `bounded secret put`.
Server-side keys (a service-role key, a Stripe secret) are set by the owner with `bounded secret put` and read at run time by functions and by a [server app](../../bounded-frontend/docs/server-apps.md).
A database reached over HTTP works from both (Supabase JS, Neon serverless HTTP, PlanetScale, Turso).
A driver that opens a TCP socket, such as `pg` for Postgres, does not: functions refuse raw sockets in the bundle, and server apps do not support TCP database drivers.
An app headed to an APO is held to the key rules in the ladder section above.

## Recipes by source stack

### Facts that every data port runs into

- Collection names are letters and digits, starting with a letter: `copy_results` is refused, so name it `copyResults`.
  Field names may contain `_`.
- Every field the app writes is declared with a type: `String`, `Int`, `UInt`, `Bool`, `Float` or `Address`, with `?` for optional.
  A field without `?` is required, so a create that leaves it out is refused.
- There are no array, object, JSON or date types.
  Store a JSON, `jsonb` or array column as JSON text in a `String` field and encode and decode it in the client, or model it as a sub-collection when rules must see its items.
  Timestamps are `UInt` Unix seconds; the system fields `_createdAt` and `_updatedAt` are readable without declaring them.
- Document ids are chosen by the writer; a client-generated id such as `crypto.randomUUID()` replaces an auto id (`addDoc`, a serial or uuid default).
- A document is deleted with `set(path, null)` (or a null entry in `setMany`), checked by the collection's `delete` rule ([SDK](../../bounded-frontend/docs/sdk-reference.md)).
  Deleting a document does not delete documents that reference it; delete children in the same `setMany` when they must go together.
- A row can be authorized through the row it references, as a foreign key would be: `@user.id != null && get(/companies/@data.companyId).ownerId == @user.id`.
  Storing the owner or tenant id on each row and comparing it directly (`@data.ownerId == @user.id`) also works and skips the lookup.

### Supabase or Firebase

- Tables/documents become collections; row-level security or security rules
  become `rules` on each collection (same intent, enforced here).
  `auth.uid()` and `request.auth.uid` become `@user.id`.
- A new-user trigger (`handle_new_user` that inserts a profile) becomes a profile the client creates at first sign-in, at a path keyed by `@user.id`, with a `create` rule that pins every starting value (`@newData.credits == 20`).
- A guard trigger or column `REVOKE` that stops users changing a field becomes an `update` rule that requires it unchanged (`@newData.credits == @data.credits`), or a `!` field when it is set once at create.
- Realtime channels become subscriptions; there is nothing to deploy for them.
- Edge functions / cloud functions become Bounded functions only when they call
  out or batch; a "check then write" function becomes a rule.
  A function may import npm packages listed in a `package-lock.json` ([functions](../../bounded-backend/docs/functions.md)).
- Storage buckets become files under the same rules.
- Auth: replace the client SDK with Bounded's; re-key ownership on `@user.id`.
  There is no password sign-in: app users sign in with an email or phone code, a social account, a wallet or as a guest ([auth](../../bounded-frontend/docs/auth.md)).
  Password, reset-password and verify-email screens have no counterpart, and existing users sign in again and get a new `@user.id`.

### Express, Fastify, Next API routes, Rails, Django

- Route handlers that validate and write become rules; the client writes with
  the SDK. Handlers that call other services or run computation become
  functions.
  A client that calls `/api/...` can keep its pages if one adapter maps each route to an SDK read, write or `functions.invoke`.
- SQL tables become collections; a foreign key the rules authorize through is copied onto the row (see `ownerId` above).
- Middleware auth becomes the `auth` rule on a function or a read/create rule
  on a collection.
- Background workers and cron become schedules.
- The frontend stays where it is if it is static; deploy it with
  `bounded site deploy dist --with-source`. A Next.js app runs its server here
  ([server apps](../../bounded-frontend/docs/server-apps.md)); any other request-time
  server stays elsewhere and points at Bounded.

### A backend that exists mainly to hold API keys

- List every key. For each: ladder it (above). What is `live` or `callable`
  needs no key and no server. What is neither is requested, and the feature is
  built without it or called out.
- What is left over is usually small enough to be one function per key.

## Verify before you say it is ported

- `bounded deploy` accepted the policy and `bounded tests run` passes.
- `bounded site deploy` served the site; a denied write returns `403`, a
  denied read returns an empty `200`.
- For an oApp: `bounded oapp preflight` is READY on the deployed app, and the
  source is synced so its agent can work from it.
