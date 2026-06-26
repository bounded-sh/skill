# SDK Reference — `@bounded-sh/client` + `@bounded-sh/server`

**What's in here / when to read this:** every SDK method —
`get`/`setMany`/`subscribe`/`search`/`count`/`aggregate`, auth,
`createWalletClient`, `verifyWebhook`, and invoking a function. (Collaborators
are managed by the CLI, not the SDK — see below.)

**Two packages, one operation surface.** The SDK ships as two npm packages:

- `@bounded-sh/client` runs in the browser and React Native: end-user auth via
  Bounded Auth (email OTP by default, OAuth/social through hosted redirect),
  optional guest accounts, or a Phantom wallet for crypto/onchain apps; live
  subscriptions, `subscribe`, `live`, and function invocation.
- `@bounded-sh/server` runs on a server, signs with a keypair (no browser auth),
  and adds `createWalletClient` + `verifyWebhook`.

(`@bounded-sh/core` is a shared dependency of both — you rarely install it directly.)

Both speak to Bounded's runtime, which enforces the deployed policy — the SDK can
never bypass a rule or invariant.

> Beta: Bounded is in beta. The packages are published on npm; the APIs below are
> stable in shape.

## Setup

```sh
npm i @bounded-sh/client      # browser / React Native
npm i @bounded-sh/server      # Node / server (keypair client)
```

```ts
// client (browser / RN)
import { init, login, get, set, subscribe } from "@bounded-sh/client";
await init({ appId: "<appId>" });    // defaults to email login; see auth.md
await login();                       // inline email-code modal (no popup, no redirect)

// server
import { createWalletClient } from "@bounded-sh/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
```

`init(config)` takes `{ appId, authMethod?, network? }`. **It points at Bounded
production by default** — `init({ appId })` just works, no endpoints to set (the
network is `'bounded-production'`). `authMethod` defaults to
`'email'` (Bounded Auth inline OTP). OAuth/social uses
`loginWithRedirect` / `loginWithPopup` rather than `authMethod`; pass
`provider: "google" | "apple" | "github"` to jump directly from your own button,
or `methods: ["email", "google", "apple"]` to control the
hosted chooser. The wallet option is `'phantom'`, reserved for crypto/onchain
apps that need a real Solana wallet; use `'none'` to disable auth. Anonymous
accounts are via `signInAnonymously()` and coexist with Bounded Auth. For a
custom/RN OTP UI use the headless `sendEmailOtp` / `verifyEmailOtp` helpers.
Text OTP (`provider: "text"`, `methods: ["text"]`, or `sendTextOtp` /
`verifyTextOtp`) is off by default and works only when Bounded explicitly enables
it for the app. Full flow in [auth.md](auth.md).

> Advanced/escape-hatch only: `apiUrl` / `wsApiUrl` / `authApiUrl` / `functionsUrl`
> can override individual endpoints, but you should normally use `network`, which
> selects the whole set.

`appId` is your project's **public** app id — it is **not a secret API key**.
Authentication is done with the user's wallet/session id-token bearer (see
[auth.md](auth.md)), so the `appId` is safe to ship in client code. The legacy
`apiKey` field is a **deprecated alias** for `appId`: `init()` accepts either
one and normalizes them to the same value, so `init({ apiKey: "<appId>" })`
still works but new code should use `appId`.

## Read — `get` / `getMany`

`get(path, opts?)` reads a single document (even-segment path) or **lists a
collection** (odd-segment path). For collection reads, `opts` carries the query
shape (filter / sort / paging).

```ts
const doc   = await get("spend/a");                       // the document, or null if it doesn't exist
const all   = await get("spend");                         // { data: [...], nextCursor }
const open  = await get("orders", {                       // filtered + sorted + paged
  filter: { status: { $in: ["open", "pending"] }, total: { $gte: 100 } },
  sort: { createdAt: -1 },
  limit: 20,
});
// open.data = rows; open.nextCursor = token for the next page (null when exhausted)
const next = await get("orders", { /* same filter/sort */ limit: 20, cursor: open.nextCursor });
```

- **Single-document `get` returns exactly one shape: the resolved document, or
  `null` if it doesn't exist** (Firebase/Mongo convention). It is never wrapped in
  a `{ data, status }` envelope — `if (!doc) { …create… }` is always a safe
  existence check.
- **Collection `get` returns `{ data, nextCursor }`** — `data` is the row array,
  `nextCursor` is the next-page token (`null`/absent when exhausted).
- **Every returned row carries both `_id` and `id`.** `_id` (and `pathId`) is the
  **full document path** (`"rooms/r1/prompts/8rd49se3sg"`); `id` is the
  convenience **bare leaf doc key** (`"8rd49se3sg"`). Use `id` for React keys and
  when building a child path (`${path}/${row.id}/votes/...`) — building from `_id`
  doubles the path. The same `_id`/`id` pair is present on single-doc `get`,
  `getMany` rows, and `subscribe`/`useQuery` rows. (A user field literally named
  `id` is never overwritten.) `docId(path)` is exported as a standalone helper that
  returns the leaf key of any path.
- Cursor paging: a `limit`ed query returns `{ data, nextCursor }`; pass `nextCursor`
  back as `opts.cursor` for the next page, loop until it is null. (There is no
  separate `getPage` — paging is built into `get`.)
- `getMany(paths)` → batch-read several **paths** at once (not a filter). Each
  result is `{ path, data, error? }`; `data` is the doc-or-null carrying the bare
  `id`.

`GetOptions`: `filter` (structured MongoDB-style), `sort` (`{ field: 1 | -1 }`),
`limit`, `cursor`, `includeSubPaths`, `shape`, `prompt` (natural-language
alternative to `filter`), `bypassCache`. Read access always obeys the collection's
`read` rule — a filter never returns a doc the caller can't read. Filter operators:
`$ne $gt $gte $lt $lte $in $nin $exists $regex $options $and $or $nor` (bare value
= equality). See [queries.md](queries.md).

## Search & aggregate — `search` / `count` / `aggregate` / `queryAggregate`

```ts
const hits = await search("notes", "shipping");                  // search(path, query, opts?)
const titleHits = await search("notes", "shipping", { fields: ["title"], limit: 20 });

const n     = await count("orders", { filter: { status: "open" } });             // { value }
const total = await aggregate("orders", "sum", { field: "total" });              // { value }
// count / aggregate run the deterministic server aggregation on Bounded; narrow
// with a structured `filter` (a natural-language `prompt` is legacy-backend only).

// grouped/structured aggregation -> one row per group
const rows  = await queryAggregate("orders", { groupBy: ["status"], count: true, sum: ["total"] });
// [{ group: { status: "open" }, count: 4, sum: { total: 920 } }, ...]
```

- `count(path, { prompt? })` and `aggregate(path, operation, { field?, prompt? })`
  each return a single `{ value }`. `operation` ∈ `count | uniqueCount | sum | avg |
  min | max` (all but `count`/`uniqueCount` need `field`); `prompt` is a
  natural-language filter.
- `queryAggregate(path, spec, { filter? })` → `AggregateRow[]`. `spec` =
  `{ groupBy?, count?, sum?, avg?, min?, max? }` (the last four are field-name
  arrays); each row carries only the requested keys. Deterministic and
  read-rule-enforced (aggregates only rows the caller can read).

Details and CLI equivalents: [queries.md](queries.md).

## Write — `set` / `setMany`

`set(path, document)` is sugar for a one-element `setMany`. `setMany([...])` is
**one atomic transaction**: every rule, hook, and invariant passes for the whole
batch or nothing commits. This is what makes transfers under `conserve` and
guard-then-write composition safe.

```ts
await set("agents/a1/spend/s1", { amount: 60 });

await setMany([                                            // atomic transfer
  { path: "accounts/alice", document: { balance: 50 } },
  { path: "accounts/bob",   document: { balance: 150 } },
]);
```

A violated invariant throws (409 with the invariant name); a denied rule throws
(403). Nothing partial is applied. Append-only semantics, in-batch `getAfter`
composition, and failure codes: [data-plane.md](data-plane.md).

Inside Bounded Functions, the same batch shape is available as
`ctx.bounded.setMany([{ path, document }, ...])`; it targets the same data-plane
transaction path and is the right API for function-assembled settlements.

### Delete — `set(path, null)`

There is **no separate `del`/`remove`** — a write with a `null` document **is**
the delete. `set(path, null)` hard-deletes the document at `path`, routed through
that collection's policy **`delete` rule** (so a delete is denied unless `delete`
allows it). Subscribers receive a delete event for that path.

```ts
await set("presence/p1", null);                 // delete one doc (checks the `delete` rule)

await setMany([                                  // atomic multi-delete (all-or-nothing)
  { path: "rooms/r1/players/alice", document: null },
  { path: "rooms/r1/players/bob",   document: null },
]);
```

Deletes compose inside a `setMany` alongside upserts — one atomic transaction
where every affected row's rule + the batch's invariants must pass. To *allow*
deletes, set a real `delete` rule in your policy (the default scaffolds
`"delete": "false"`, which blocks them).

**From the CLI** it's a dedicated command, not `set` with null (the CLI rejects a
null body): `bounded data delete --app-id <id> --path <collection>/<id>` — same
`delete`-rule enforcement. See [cli-reference.md](cli-reference.md#data-delete).

### Server-resolved field values — `increment` / `serverTimestamp`

A field in a `set`/`setMany` payload can be a plain value **or** a field-value
operation the server resolves atomically when the write commits. Two are
exported:

```ts
import { set, increment, serverTimestamp } from "@bounded-sh/client";

await set("counters/likes", { n: increment(1) });           // atomic server-side +1
await set("scores/p1",      { points: increment(-5) });     // negative = decrement
await set("posts/p1",       { createdAt: serverTimestamp() }); // server unix-seconds clock
```

- **`increment(n)`** adds `n` to a numeric field **server-side and atomically** —
  Bounded serializes writes, so concurrent increments never lose
  updates (verified: 20 concurrent `increment(1)` → exactly 20). The field starts
  from `0` if the doc/field doesn't exist yet. Use this for counters/scores
  instead of read-modify-write (which races and can drop updates).
- **`serverTimestamp()`** stamps the field with the server's clock (Unix
  seconds) — the trustworthy "when did this happen" a client clock can't give you
  (a hook can't stamp time, so do it here on the client write). **Prefer this for
  any timestamp a policy reads** (TTLs, rate windows, anti-cheat): it's seconds
  (matches `@time.now`) and unforgeable.

#### Time helpers — `now` / `toSeconds` / `toMillis` (avoid the seconds/ms trap)

Bounded's policy layer is **Unix seconds** (`@time.now`, `windowSeconds`,
`scheduledAt`); JavaScript and the system fields `_createdAt`/`_updatedAt` are
**milliseconds**. Comparing across them is 1000× off and silently breaks
freshness/TTL checks. These keep you in seconds:

```ts
import { now, toSeconds, toMillis } from "@bounded-sh/client";

now();                       // current time in Unix SECONDS (use, not Date.now())
toSeconds(doc._updatedAt);   // ms → seconds (also accepts Date.now() or a Date)
toMillis(doc.createdAtSec);  // seconds → ms, e.g. new Date(toMillis(s))

if (now() - toSeconds(doc._updatedAt) > 15) markStale();   // seconds vs seconds ✓
```

Rule of thumb: **write** a policy-read timestamp with `serverTimestamp()`,
**compare** in client code with `now()` / `toSeconds()`.

Both compose inside a `set` alongside plain fields and inside an atomic
`setMany`. They are plain objects (`{ operation: "increment", value: n }` /
`{ operation: "time", value: "now" }`) — the helpers are just the discoverable
way to write them. Increments still answer to invariants: an `increment` that
would breach a `rollingSum`/`bound` cap is rejected (409) like any other write.

## Subscribe (live) — `subscribe`

`@bounded-sh/client` only. Every collection is live. **In React, prefer the
`useQuery` hook** (auto-updating value, no callback to misuse); use the imperative
`subscribe` outside React or for side-effects.

```tsx
// React — reactive value, always the full current set, re-renders on any change:
import { useQuery } from "@bounded-sh/client";
const { data: rows, loading, error } = useQuery("rooms/r1/messages", { filter: { open: true } });
//      ^ array for a collection, doc|null for a single-doc path; undefined until first delivery.
//      Pass path=null to skip. No onData → the "first call is final" trap can't happen.
```

`subscribe` streams a single document or a filtered collection and calls `onData`
**on every change** (the full current array each time — not per-row deltas). It
returns an unsubscribe function. **`onData` fires repeatedly; never treat the
first call as complete** — a doc another writer creates a beat later arrives in a
*later* call, so render/merge on every call, not once.

```ts
const stop = await subscribe("rooms/r1/view/" + myId, {
  onData: (view) => render(view),   // called again on every change
  onError: (e) => console.error(e),
});
// later:
await stop();
```

`SubscribeOptions`: `filter`, `prompt`, `shape`, `limit`, `cursor`, `onData`,
`onError`, `appId`. `filter`/`shape`/paging match `get` and apply to the initial
snapshot AND deltas (no `sort` — a live feed is event-ordered). Read rules are
enforced per delivered document.

`onData` payload follows the path, **not** `get`'s paged envelope: a single-doc
path delivers the document (or `null`); a collection path delivers a **plain
array** (`[]` when empty), re-delivering the whole matching set on each change.
Note the contrast — `get("c", { limit })` returns `{ data, nextCursor }` but
`subscribe("c", { limit })` hands `onData` the **bare array** (write
`onData: (rows) => …`, not `onData: ({ data }) => …`). Each delivered row carries
the same `_id` (full path) + `id` (bare leaf key) pair as `get` — use `row.id` for
React keys and child paths. More: [realtime-and-games.md](realtime-and-games.md).

## Files — `setFile` / `getFiles`

For `type: "storage"` collections (same path-scoped auth as data).

```ts
// blob + declared fields in one atomic create; system meta auto-filled
await setFile("users/u1/files/avatar", file, { metadata: { name: "avatar.png", owner: myId } });
const { data } = await getFiles("users/u1/files"); // [{ path, url, metadata }] — signed download links + metadata
```

`setFile(path, file, { metadata })` writes the blob, auto-fills system metadata
(`contentType`/`size`/`status`/`uploadedBy`/`createdAt`), and sets your declared
fields from `metadata` (validated against the collection's `fields`; lands in
`@newData` for the CREATE rule). `metadata` is create-only — change an existing
file's fields with `set()`. `file = null` deletes. Details:
[files-and-search.md](files-and-search.md).

## Policy queries & expressions — `runQuery` / `runExpression`

```ts
const total = await runQuery("orgs/o1/docs/d1", "wordCount", { /* args */ });
const ok    = await runExpression("@newData.amount <= 100", { amount: 60 });
```

`runQueryMany` / `runExpressionMany` batch these. Policy `queries` are declared
and proven at deploy — see [queries.md](queries.md).

## Collaborators — managed via the CLI (not the SDK)

Collaborators (who may deploy/update an app's policy) are a **control-plane**
concern, managed with the **CLI**, not the data-plane `@bounded-sh` SDK. Use:

```bash
bounded share <walletAddress|email> --app-id <id>   # add (role: --role policy|admin)
bounded collaborators --app-id <id>                 # list
bounded unshare <walletAddress|email> --app-id <id> # remove
```

Only the owner may modify the list (enforced server-side). Email shares default
to `admin`, wallet shares to `policy`. The full `share → list → unshare`
round-trip is supported.

## Auth (client) — `login` / `logout` / `getCurrentUser` / `useAuth`

```ts
import { login, logout, getCurrentUser, useAuth,
         sendEmailOtp, verifyEmailOtp, sendTextOtp, verifyTextOtp, signInAnonymously,
         loginWithRedirect, completeLoginFromRedirect } from "@bounded-sh/client";

await login();                       // default: inline email-code modal (no popup/redirect)
const user = getCurrentUser();       // { id, address: string | null, email: string | null } | null

// React:
const { user, login, logout, loading } = useAuth();

// Headless email (custom UI / React Native) — no modal:
await sendEmailOtp("user@example.com");
await verifyEmailOtp("user@example.com", "123456");

// Headless text OTP, only when explicitly enabled for the app:
await sendTextOtp("+14155550132");
await verifyTextOtp("+14155550132", "123456");

// OAuth/social (web): app-owned button + callback page:
await loginWithRedirect({
  redirectUri: "https://yourapp.com/auth/callback",
  provider: "apple",                 // also "google" / "github" when configured
});
await completeLoginFromRedirect();   // on /auth/callback

// Anonymous (coexists with email): device-keypair identity, upgradeable later
await signInAnonymously();
```

The `user` object has three fields:

- `user.id` — the **universal stable identity**, always present for an
  authenticated user. For wallet logins it equals the wallet address; for
  Bounded Auth logins (email, text, OAuth/social) it is the account identity. Use
  this for ownership / membership / identity (e.g. doc keys, owner fields,
  `view/<myId>`).
- `user.address` — a **real onchain wallet address**. Present for wallet logins,
  `null` for Bounded Auth logins unless a wallet is linked. Use this only for onchain operations / wallet
  semantics.
- `user.email` — the verified, lowercased email for email/OAuth accounts. It is
  `null` for wallet and phone-only text users. Use for email-gating.

`onAuthStateChanged(cb)` / `onAuthLoadingChanged(cb)` are the imperative
equivalents. End-user identity surfaces in rules as `@user.id` (the universal
identity); `@user.address` is the wallet address (null for non-wallet logins, and
the **only** `@user.*` variable allowed inside `onchain:true` collections); and
`@user.email` is the verified email. Use `@user.id` for ownership/membership.
Full flow, providers, and embedded wallets: [auth.md](auth.md).

## `@bounded-sh/server` — `createWalletClient`

> **Requires Node ≥ 18** (declared in the package's `engines`). The server SDK
> pulls in ESM-only transitive deps (e.g. via `@solana/web3.js` →
> `rpc-websockets`/`uuid`); on Node 16 a `require()` of the package throws
> `ERR_REQUIRE_ESM`. Node 18+ loads both the CJS (`require`) and ESM (`import`)
> entrypoints cleanly. Use an LTS Node (18/20/22).

The server client wraps the **same operations**, signed by a keypair, with no
browser auth. Each client has its own session — no global state.

There are two server setup shapes; both work:

```ts
import { init, createWalletClient } from "@bounded-sh/server";

// 1) init({appId}) once, then create keypair-signed clients against that app.
//    init pins the appId/endpoints; createWalletClient adds the signer.
await init({ appId: "<appId>" });
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });

vault.address;                                   // the signer's address
await vault.set("markets/123", { open: true });
await vault.setMany([ /* atomic batch */ ]);
const doc = await vault.get("markets/123");

// Subscribe AS this wallet — no BOUNDED_PRIVATE_KEY env var needed. The live
// connection authenticates with the client's own session, so read rules see the
// right principal. Accepts a bare callback or { onData, onError, filter, ... }.
const stop = await vault.subscribe("markets", (rows) => console.log(rows));
// ... later
await stop();
```

```ts
// 2) ESM import works identically (engines >=18 guarantees both forms load):
const { init, createWalletClient } = await import("@bounded-sh/server");
```

The wallet client (`vault` above) exposes `get`, `getMany`, `set`, `setMany`, `setFile`,
`getFiles`, `search`, `count`, `aggregate`, `queryAggregate`, `runQuery`,
`runQueryMany`, `runExpression`, `runExpressionMany`, `subscribe`, and `invoke`.
Prefer these client methods over the top-level `get` /
`subscribe` exports when you hold a `createWalletClient` instance: the top-level
ones use the ambient `BOUNDED_PRIVATE_KEY` session and throw `No server keypair`
if it isn't set, whereas the client methods authenticate as the client's own
keypair. `keypair` is a base58 string or JSON array secret key — the **base58**
form is the same value the CLI stores as the `privateKey` field in
`~/.bounded/credentials` (and accepts via `BOUNDED_PRIVATE_KEY`), so a server can
sign as the CLI identity by reading that key. Server tasks:
[../guides/building-a-backend.md](../guides/building-a-backend.md).

### Verifying webhooks — `verifyWebhook`

`@bounded-sh/server` also exports `verifyWebhook` for inbound mutation webhooks.
It fetches + caches Bounded's Ed25519 public key (from the hosted `/.well-known`
keys endpoint), checks the signature over the raw body, and enforces timestamp
skew — returning the typed payload or throwing `WebhookVerificationError`.

```ts
import { verifyWebhook, WebhookVerificationError } from "@bounded-sh/server";

// rawBody is the unparsed request body string; headers is the request headers.
const event = await verifyWebhook(rawBody, headers);
// event: { id, appId, path, operation, document, previousDocument, timestamp }
```

Also exported: `clearWebhookKeyCache`, `WebhookVerificationError`,
`DEFAULT_WEBHOOK_KEYS_URL`. `verifyWebhook(rawBody, headers, opts?)` — `opts`
overrides `keysUrl` / `maxSkewSeconds` / cache TTL. The default keys URL follows
your `init({ network })` (the receiver verifies against that network's signing
keys), falling back to production when no network is set. Pass `keysUrl` only
when you intentionally verify against a custom key source. Declaring webhooks:
[hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md).

### Invoking a function — `functions.invoke`

Use the first-class `functions.invoke(name, args)` helper — exported from both
`bounded-sh` and `@bounded-sh/server`. It attaches the caller's session token
automatically (the same token the data plane sends), so Bounded verifies your
identity and evaluates the function's `auth` policy rule before it runs:

```ts
import { functions } from "@bounded-sh/client"; // or "bounded-sh/server"

const res = await functions.invoke("syncStripe", { customerId });
// → the function's JSON return value.
// `invokeFunction("syncStripe", { customerId })` is the same call as a plain fn.
// Optional 3rd arg: { timeoutMs, headers }. Throws FunctionInvokeError on
// 401/403/404/503 (see .statusCode). Top-level uses the ambient session
// (BOUNDED_PRIVATE_KEY on server). To invoke as a specific keypair with no env
// var: `await vault.invoke("syncStripe", { customerId })` on a createWalletClient.
```

Full guide (declare in policy, write the `ctx` API, deploy, secrets, limits, the
proof boundary): [functions.md](functions.md).

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — client setup + auth + live reads
- [../guides/building-a-backend.md](../guides/building-a-backend.md) — server-signed writes
- [auth.md](auth.md) — dev keypair identity vs end-user email/wallet auth
- [queries.md](queries.md) — filters, sort, paging, aggregations, search
- [data-plane.md](data-plane.md) — atomic writes and failure semantics
- [cli-reference.md](cli-reference.md) — the same operations from the CLI
