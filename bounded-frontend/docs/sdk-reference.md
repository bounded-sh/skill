# SDK Reference - `@bounded-sh/client` + `@bounded-sh/server`

**What's in here / when to read this:** every SDK method -
`get`/`setMany`/`subscribe`/`search`/`count`/`aggregate`, auth,
`createWalletClient`, `verifyWebhook`, and invoking a function. (Collaborators
are managed by the CLI, not the SDK - see below.)

**Two packages, one operation surface.** The SDK ships as two npm packages:

- `@bounded-sh/client` runs in the browser and React Native: end-user auth via
  Bounded Auth (email OTP by default, OAuth/social through hosted redirect),
  optional guest accounts, or a Phantom wallet for crypto/onchain apps; live
  subscriptions, `subscribe`, `live`, and function invocation.
- `@bounded-sh/server` runs on a server, signs with a keypair (no browser auth),
  and adds `createWalletClient` + `verifyWebhook`.

(`@bounded-sh/core` is a shared dependency of both - you rarely install it directly.)

Both speak to Bounded's runtime, which enforces the deployed policy - the SDK can
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
import { init, loginWithRedirect, completeLoginFromRedirect, get, set, subscribe } from "@bounded-sh/client";
await init({ appId: "<appId>" });
// Human login uses the hosted issuer (web redirect shown here):
await loginWithRedirect({ methods: ["email", "google"] });   // redirectUri optional on web (defaults to current page)
// …once on app load, finish a redirect OR popup login:  const user = await completeLoginFromRedirect();

// server
import { createWalletClient } from "@bounded-sh/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
```

`init(config)` takes `{ appId, authMethod?, network?, authMode?, walletLogin?, requireEmail?, loginWidget? }`. **It points at Bounded
production by default** - `init({ appId })` just works, no endpoints to set (the
network is `'bounded-production'`). **Email + OAuth/social + text** work through
the hosted flow `loginWithRedirect` / `loginWithPopup`; the credential is entered
on `auth.bounded.sh`, never your origin. Pass `methods: ["email", "google"]` for
a chooser, or `provider: "google"` to jump straight to one from your own button.
App-origin OTP helpers are retired and are not exported by
`@bounded-sh/client@0.0.42`.
The wallet option is `'phantom'`, reserved for crypto/onchain apps that need a
real Solana wallet. There is no `authMethod: 'none'` provider in 0.0.42; for a
public-read app, initialize normally and simply do not start a login flow.
Browser anonymous accounts are via `signInAnonymously()` and coexist with
Bounded Auth.
Text OTP (hosted: `provider: "text"` or `methods: ["text"]`) is off by default
and works only when Bounded explicitly enables it for the app.
Full flow in [auth.md](auth.md).

`authMode?: 'bounded' | 'turnkey'` (default `'bounded'`) picks how human login
runs. `'bounded'` is the normal Better Auth email/social/OIDC login - no extra
setup. `'turnkey'` runs **Turnkey-native email OTP inline** in the unified
widget (see `openBoundedWidget` below): no second Bounded OTP and no OIDC
redirect for email, while the social and wallet lanes are unchanged. It
requires the app's Turnkey organization to have email OTP configured
(application brand + email OTP enabled) - an issuer/platform-side prerequisite,
not a client parameter. `walletLogin` (`true | false | { getProvider, network,
rpcUrl }`) turns on bring-your-own Solana wallet login (full detail:
[auth.md](auth.md#solana-wallet-login-bring-your-own)). `requireEmail: true` is
a site policy - every user must have an email on file - and suppresses the
widget's wallet lane. `loginWidget?: { title?, subtitle? }` sets the unified
widget's text app-wide: `title` replaces the default "Sign in" heading,
`subtitle` replaces the default subline (`""` renders no subline at all);
per-call `openBoundedWidget({ title, subtitle })` overrides both.

> Advanced/escape-hatch only: `apiUrl` / `wsApiUrl` / `authApiUrl` / `functionsUrl`
> can override individual endpoints, but you should normally use `network`, which
> selects the whole set.

`appId` is your project's **public** app id - it is **not a secret API key**.
Authentication is done with the user's wallet/session id-token bearer (see
[auth.md](auth.md)), so the `appId` is safe to ship in client code. New code
must use `appId`; do not teach `apiKey` as app identity or query auth.

## Read - `get` / `getMany`

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
  a `{ data, status }` envelope - `if (!doc) { …create… }` is always a safe
  existence check.
- **Collection `get` returns `{ data, nextCursor }`** - `data` is the row array,
  `nextCursor` is the next-page token (`null`/absent when exhausted).
- **Every returned row carries both `_id` and `id`.** `_id` (and `pathId`) is the
  **full document path** (`"rooms/r1/prompts/8rd49se3sg"`); `id` is the
  convenience **bare leaf doc key** (`"8rd49se3sg"`). Use `id` for React keys and
  when building a child path (`${path}/${row.id}/votes/...`) - building from `_id`
  doubles the path. The same `_id`/`id` pair is present on single-doc `get`,
  `getMany` rows, and `subscribe`/`useQuery` rows. (A user field literally named
  `id` is never overwritten.) `docId(path)` is exported as a standalone helper that
  returns the leaf key of any path.
- Cursor paging: a `limit`ed query returns `{ data, nextCursor }`; pass `nextCursor`
  back as `opts.cursor` for the next page, loop until it is null. (There is no
  separate `getPage` - paging is built into `get`.)
- `getMany(paths)` → batch-read several **paths** at once (not a filter). Each
  result is `{ path, data, error? }`; `data` is the doc-or-null carrying the bare
  `id`.

`GetOptions`: `filter` (structured MongoDB-style), `sort` (`{ field: 1 | -1 }`),
`limit`, `cursor`, `includeSubPaths`, `shape`, `prompt` (natural-language
alternative to `filter`), `bypassCache`. Read access always obeys the collection's
`read` rule - a filter never returns a doc the caller can't read. Filter operators:
`$ne $gt $gte $lt $lte $in $nin $exists $regex $options $and $or $nor` (bare value
= equality). See [queries.md](../../bounded-backend/docs/queries.md).

## Search & aggregate - `search` / `count` / `aggregate` / `queryAggregate`

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

Details and CLI equivalents: [queries.md](../../bounded-backend/docs/queries.md).

## Write - `set` / `setMany`

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
composition, and failure codes: [data-plane.md](../../bounded-backend/docs/data-plane.md).

For a Solana wallet UI that deliberately needs a failed transaction to land as denial evidence, pass `{ shouldSubmitTx: false }`:

```ts
const built = await setMany(
  [{ path: "caps/denied", document: { actor: walletAddress, weight: 1 } }],
  { shouldSubmitTx: false },
);

const raw =
  typeof built.signedTransaction === "string"
    ? Uint8Array.from(atob(built.signedTransaction), (byte) => byte.charCodeAt(0))
    : built.signedTransaction.serialize();
const signature = await connection.sendRawTransaction(raw, {
  skipPreflight: true,
  maxRetries: 3,
});
```

This option signs but does not submit.
It is supported by Solana wallet providers and is intentionally unsupported by wallet providers that can only sign and submit atomically.
It is not a pre-approval transaction builder: Phantom approval has already occurred when the signed transaction is returned.
For a review shown before approval, bind and freeze the exact logical SDK request intent.
Do not claim the review hashes final message bytes unless a separate builder API actually returned those unsigned bytes before approval.
Keep the signed transaction only in memory, discard it immediately after submission, and never print, log, commit, or persist it.
Poll the public signature to a finalized failed state before checking the unchanged Bounded mirror.
Start any stable mirror or denied-account absence observations only after that finalized slot.
For a headless keypair, prefer the CLI's `data set --skip-preflight` path so application code never reads the private key.

Inside Bounded Functions, the same batch shape is available as
`ctx.bounded.setMany([{ path, document }, ...])`; it targets the same data-plane
transaction path and is the right API for function-assembled settlements.

### Delete / `set(path, null)`

There is **no separate `del`/`remove`** - a write with a `null` document **is**
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

Deletes compose inside a `setMany` alongside upserts - one atomic transaction
where every affected row's rule + the batch's invariants must pass. To *allow*
deletes, set a real `delete` rule in your policy (the default scaffolds
`"delete": "false"`, which blocks them).

**From the CLI** it's a dedicated command, not `set` with null (the CLI rejects a
null body): `bounded data delete --app-id <id> --path <collection>/<id>` - same
`delete`-rule enforcement. See [cli-reference.md](../../bounded-deploy/docs/cli-reference.md#data-delete).

### Server-resolved field values - `increment` / `serverTimestamp`

A field in a `set`/`setMany` payload can be a plain value **or** a field-value
operation the server resolves atomically when the write commits. Two are
exported:

```ts
import { set, increment, serverTimestamp } from "@bounded-sh/client";

await set("counters/likes", { n: increment(1) });           // atomic server-side +1
await set("scores/p1",      { points: increment(-5) });     // negative = decrement
await set("posts/p1",       { createdAt: serverTimestamp() }); // server unix-seconds clock
```

- **`increment(n)`** adds `n` to a numeric field **server-side and atomically** -
  Bounded serializes writes, so concurrent increments never lose
  updates (verified: 20 concurrent `increment(1)` → exactly 20). The field starts
  from `0` if the doc/field doesn't exist yet. Use this for counters/scores
  instead of read-modify-write (which races and can drop updates).
- **`serverTimestamp()`** stamps the field with the server's clock (Unix
  seconds) - the trustworthy "when did this happen" a client clock can't give you
  (a hook can't stamp time, so do it here on the client write). **This is a MUST,
  not a preference, for any field a rule compares against `@time.now`** (TTLs,
  rate windows, anti-cheat, `requestedAt <= @time.now` shapes): the rule clock
  can trail wall time by ~1s, so a client-computed `Date.now()/1000` from an
  ACCURATE clock reads as "the future" and the write is DENIED - intermittent
  first-write declines that retries then mask (measured live 2026-07-29).
  `serverTimestamp()` resolves on the same clock the rule reads, so it can
  never disagree - and it's unforgeable.

#### Time helpers - `now` / `toSeconds` / `toMillis` (avoid the seconds/ms trap)

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
`{ operation: "time", value: "now" }`) - the helpers are just the discoverable
way to write them. Increments still answer to invariants: an `increment` that
would breach a `rollingSum`/`bound` cap is rejected (409) like any other write.

## Subscribe (live) - `subscribe`

`@bounded-sh/client` only. Every collection is live. **In React, prefer the
`useQuery` hook** (auto-updating value, no callback to misuse); use the imperative
`subscribe` outside React or for side-effects.

```tsx
// React - reactive value, always the full current set, re-renders on any change:
import { useQuery } from "@bounded-sh/client";
const { data: rows, loading, error } = useQuery("rooms/r1/messages", { filter: { open: true } });
//      ^ array for a collection, doc|null for a single-doc path; undefined until first delivery.
//      Pass path=null to skip. No onData → the "first call is final" trap can't happen.
```

`subscribe` streams a single document or a filtered collection and calls `onData`
**on every change** (the full current array each time - not per-row deltas). It
returns an unsubscribe function. **`onData` fires repeatedly; never treat the
first call as complete** - a doc another writer creates a beat later arrives in a
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
snapshot AND deltas (no `sort` - a live feed is event-ordered). Read rules are
enforced per delivered document.

`onData` payload follows the path, **not** `get`'s paged envelope: a single-doc
path delivers the document (or `null`); a collection path delivers a **plain
array** (`[]` when empty), re-delivering the whole matching set on each change.
Note the contrast - `get("c", { limit })` returns `{ data, nextCursor }` but
`subscribe("c", { limit })` hands `onData` the **bare array** (write
`onData: (rows) => …`, not `onData: ({ data }) => …`). Each delivered row carries
the same `_id` (full path) + `id` (bare leaf key) pair as `get` - use `row.id` for
React keys and child paths. More: [realtime-and-games.md](../../bounded-backend/docs/realtime-and-games.md).

## Files - `setFile` / `getFiles`

For `type: "storage"` collections (same path-scoped auth as data).

```ts
// blob + declared fields in one atomic create; system meta auto-filled
await setFile("users/u1/files/avatar", file, { metadata: { name: "avatar.png", owner: myId } });
const { data } = await getFiles("users/u1/files"); // [{ path, url, metadata }] - signed download links + metadata
```

`setFile(path, file, { metadata })` writes the blob, auto-fills system metadata
(`contentType`/`size`/`status`/`uploadedBy`/`createdAt`), and sets your declared
fields from `metadata` (validated against the collection's `fields`; lands in
`@newData` for the CREATE rule). `metadata` is create-only - change an existing
file's fields with `set()`. `file = null` deletes. Details:
[files-and-search.md](../../bounded-backend/docs/files-and-search.md).

## Policy queries & expressions - `runQuery` / `runExpression`

```ts
const total = await runQuery("orgs/o1/docs/d1", "wordCount", { /* args */ });
const ok    = await runExpression("@newData.amount <= 100", { amount: 60 });
```

The third `runQuery` argument is `queryArgs`.
The runtime stages those fields into `@newData` while evaluating the named query.
A query expression may therefore read `@newData.amount`, `@newData.symbol`, or another supplied argument field.
The arguments do not write or persist a document.

Current Solana named-query behavior has two important limits.
A chain-backed named query must be declared on an `onchain: true` path because the current executor does not activate standalone chain execution for an `onchain: false` path.
Actual chain-query execution requires an authenticated `userAddress` even when the path read rule is public.
Catalog browsing, typed-form validation, and local preflight can remain wallet-free, but a live chain query cannot.
Offchain-only plugin reads have no working chain-query placement until the runtime is fixed.
Check the [Solana devnet capability catalog](../../bounded-onchain/docs/solana-capability-status.md) before calling a plugin query.

`@PriceFeedPlugin.getPriceFeed` returns a decimal `String` from the deployed Solana runtime.
Declare its named query with `returnType: "String"` and parse the returned text explicitly only where application code needs numeric arithmetic.
Do not declare the result as `Float`.

### Batch your queries

**Never map `runQuery` / `runExpression` over a list - use `runQueryMany` /
`runExpressionMany`.**

```ts
// WRONG - one POST per slug
const totals = await Promise.all(
  slugs.map((slug) => runQuery(`orgs/o1/docs/${slug}`, "wordCount", {})),
);

// RIGHT - one POST for every slug
const totals = await runQueryMany(slugs.map((slug) => ({
  absolutePath: `orgs/o1/docs/${slug}`,
  queryName: "wordCount", queryArgs: {},
})));
```

Parallel per-item POSTs trip the platform rate limiter (`HTTP 429`); app-level
`catch(() => null)` often swallows the errors, so the app silently shows empty data.

Policy `queries` are validated at deploy and participate in a proof where a
supported obligation references them; see [queries.md](../../bounded-backend/docs/queries.md).

## Collaborators - managed via the CLI (not the SDK)

Collaborators (who may deploy/update an app's policy) are a **control-plane**
concern, managed with the **CLI**, not the data-plane `@bounded-sh` SDK. Use:

```bash
bounded share <walletAddress|email> --role developer|admin|viewer|billing --app-id <id> # add
bounded collaborators --app-id <id>                                                    # list and resolve wallet address
bounded unshare <walletAddress> --app-id <id>                                          # remove by wallet
```

Only the owner may modify the list (enforced server-side). Email shares resolve
to the invitee's Bounded wallet and send an invite email when outbound email is
configured. `unshare` accepts the resolved wallet address, not the email; obtain
it from `bounded collaborators` before removing an email-invited collaborator.

## Auth (client) - `login` / `logout` / `getCurrentUser` / `useAuth`

```ts
import { logout, getCurrentUser, useAuth, signInAnonymously,
         loginWithRedirect, loginWithPopup,
         completeLoginFromRedirect } from "@bounded-sh/client";

const user = getCurrentUser();       // { id, address, email, isAnonymous } | null

// React:
const { user, logout, loading } = useAuth();

// Human login - pick a UX. HOSTED (most secure; web AND React Native), app-owned
// button + callback page:
await loginWithRedirect({
  methods: ["email", "google"],      // or provider: "apple"/"github" to jump to one;
                                     // omit both to show the full hosted chooser.
});                                  // web: redirectUri optional (defaults to current page); RN: required (https universal link)
await completeLoginFromRedirect();   // once on app load → finishes a redirect OR popup login; no-op otherwise

// Or keep the host page open while the hosted issuer handles the credential:
const popupUser = await loginWithPopup({ methods: ["email", "google"] });

// Anonymous (coexists with either UX): device-keypair guest identity
await signInAnonymously();
```

> **Hosted credentials only.** Use `loginWithRedirect` or `loginWithPopup`, with
> `completeLoginFromRedirect()` on web app load. The published 0.0.42 client no
> longer exports app-origin email or text OTP helpers. See [auth.md](auth.md).

### The unified login widget - `openBoundedWidget`

`openBoundedWidget(opts?)` opens an **in-app login card** (a Shadow-DOM modal)
with email + social lanes plus an optional "Continue with wallet" lane. It
resolves with the signed-in `User`; dismissing it rejects with
`Error("cancelled")`.

```ts
import { openBoundedWidget } from "@bounded-sh/client";
const user = await openBoundedWidget({ methods: ["email", "google"], wallet: true });
```

Options: `methods` (default `["email", "google"]`), `wallet` (enable the native
Solana wallet lane - Wallet Standard enumeration: Phantom, Solflare, Backpack,
etc., detected at runtime, names not hardcoded), `redirectUri`, `title`,
`subtitle`, and a per-call `authMode` override (falls back to the init config).
`requireEmail: true` in the init config suppresses the wallet lane. For
headless flows, `startTurnkeyEmailLogin(email)` returns
`{ verify(code): Promise<User> }`; `signSolanaMessageViaTurnkey` and
`getOrCreateTurnkeyWallet` (the Turnkey signer bridge) handle passkey
(Face ID / Touch ID) signing and lazy wallet provisioning after login.

**Track the user with `onAuthStateChanged`, not a one-time `getCurrentUser()`.**
`getCurrentUser()` is a snapshot: it does not update when a session expires, so a
UI built on it keeps showing a signed-in user the server no longer accepts. The
listener fires on login, on logout, **and** when a session dies on its own:

```ts
import { onAuthStateChanged, isAuthExpiredError } from "@bounded-sh/client";

const unsubscribe = onAuthStateChanged((user) => setUser(user));  // returns an unsubscribe fn
```

An unrevivable session surfaces as a typed error (`isAuthExpiredError(e)`, with
`e.code` of `auth_expired` or `auth_changed`) rather than a silent downgrade to an
anonymous request. A `403` / `policy_denied` is never a session problem — see
[auth.md](auth.md#when-a-session-expires).

> **Await `logout()` and `clearSession()`.** Both are async. Session removal is
> serialized across browser tabs, so a call you do not await can return while the
> credential is still readable.

**Logout really logs out (0.0.51+).** For hosted sessions on the web, `logout()`
revokes the refresh-token family, clears local state, then does a top-level
bounce through the issuer's `/logout` so the hosted session cookie dies too -
the next `loginWithRedirect` shows a fresh account choice instead of silently
re-signing in the same user. Expect a page reload on sign-out. Pass
`logout({ keepIssuerSession: true })` for the old local-only behavior. The
bounce only runs on issuer-trusted origins (`*.bounded.sh` / `*.bounded.page` /
`*.oapps.fun` / https localhost); on custom domains logout stays local-only.

> **Warning - custom domains and iframes get local-only logout.** On a custom
> domain (or embedded in an iframe, where the top-level issuer bounce cannot
> run), `logout()` clears local state but the hosted session cookie survives:
> the next `loginWithRedirect` silently re-authenticates the same account with
> no account-choice screen. If your app serves shared devices, prefer a
> `*.bounded.sh` / `*.bounded.page` / `*.oapps.fun` hostname so the issuer
> bounce runs. If you must use a custom domain, tell users sign-out is
> device-local only, and show your own post-logout screen instead of implying
> the hosted session ended.

The `user` object has four fields:

- `user.id` - the **universal stable identity**, always present for an
  authenticated user. For wallet logins it equals the wallet address; for
  Bounded Auth logins (email, text, OAuth/social) it is the account identity. Use
  this for ownership / membership / identity (e.g. doc keys, owner fields,
  `view/<myId>`).
- `user.address` - a **real onchain wallet address**. Present for wallet logins
  and browser guests; `null` for Bounded Auth logins unless `auth.wallets`
  provisions or the user links a wallet. Guest auth itself remains offchain-only.
  Use this only for onchain operations / wallet semantics.
- `user.email` - the verified, lowercased email for email/OAuth accounts. It is
  `null` for wallet and phone-only text users. Use for email-gating.
- `user.isAnonymous` - `true` for a browser guest and `false` for a real login.
  It is mirrored as the offchain-only `@user.isAnonymous` policy value.

`onAuthStateChanged(cb)` / `onAuthLoadingChanged(cb)` are the imperative
equivalents. End-user identity surfaces in rules as `@user.id` (the universal
identity); `@user.address` is the wallet address (null for non-wallet logins, and
the **only** `@user.*` variable allowed inside `onchain:true` collections); and
`@user.email` is the verified email. Use `@user.id` for ownership/membership.
Full flow, providers, and embedded wallets: [auth.md](auth.md).

## `@bounded-sh/server` - `createWalletClient`

> **Use Node ≥ 18.** The server SDK
> pulls in ESM-only transitive deps (e.g. via `@solana/web3.js` →
> `rpc-websockets`/`uuid`); on Node 16 a `require()` of the package throws
> `ERR_REQUIRE_ESM`. Node 18+ loads both the CJS (`require`) and ESM (`import`)
> entrypoints cleanly. Use an LTS Node (18/20/22).

The server client wraps the **same operations**, signed by a keypair, with no
browser auth. Each client has its own session - no global state.

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

// Subscribe AS this wallet - no BOUNDED_PRIVATE_KEY env var needed. The live
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
keypair. `keypair` is a base58 string or JSON array secret key - the **base58**
form is the same value the CLI stores as the `privateKey` field in
`~/.bounded/credentials` (and accepts via `BOUNDED_PRIVATE_KEY`), so a server can
sign as the CLI identity by reading that key. Server tasks:
[../guides/building-a-backend.md](../../bounded-backend/docs/building-a-backend.md).

### Verifying webhooks - `verifyWebhook`

`@bounded-sh/server` also exports `verifyWebhook` for inbound mutation webhooks.
It fetches + caches Bounded's Ed25519 public key (from the hosted `/.well-known`
keys endpoint), checks the signature over the raw body, and enforces timestamp
skew - returning the typed payload or throwing `WebhookVerificationError`.

```ts
import { verifyWebhook, WebhookVerificationError } from "@bounded-sh/server";
import { webhookReplayStore } from "./shared-webhook-replay-store";

const expectedAppId = process.env.BOUNDED_APP_ID;
if (!expectedAppId) throw new Error("BOUNDED_APP_ID is required");

// rawBody is the unparsed request body string; headers is the request headers.
const event = await verifyWebhook(rawBody, headers, {
  expectedAppId,
  replayStore: webhookReplayStore,
});
// event: { id, appId, path, operation, document, previousDocument, timestamp }
```

Also exported: `clearWebhookKeyCache`, `WebhookVerificationError`,
`DEFAULT_WEBHOOK_KEYS_URL`. `verifyWebhook(rawBody, headers, opts?)` - `opts`
sets `expectedAppId` / `replayStore` and can override `keysUrl` /
`maxSkewSeconds` / cache TTL. The default keys URL follows
your `init({ network })` (the receiver verifies against that network's signing
keys), falling back to production when no network is set. Pass `keysUrl` only
when you intentionally verify against a custom key source.
`webhookReplayStore` must implement `WebhookReplayStore` using one atomic,
shared Redis/KV/DB namespace across all receiver instances. The SDK's default
in-memory replay protection is suitable only for a single process. Declaring webhooks:
[hooks-scheduled-webhooks.md](../../bounded-backend/docs/hooks-scheduled-webhooks.md).

### Invoking a function - `functions.invoke`

Use the first-class `functions.invoke(name, args)` helper - exported from both
`@bounded-sh/client` and `@bounded-sh/server`. It attaches the caller's session token
automatically (the same token the data plane sends), so Bounded verifies your
identity and evaluates the function's `auth` policy rule before it runs:

```ts
import { functions } from "@bounded-sh/client"; // or "@bounded-sh/server"

const res = await functions.invoke("syncStripe", { customerId, userId });
// → the function's JSON return value.
// `invokeFunction("syncStripe", { customerId, userId })` is the same call as a plain fn.
// Optional 3rd arg: { timeoutMs, headers }. Throws FunctionInvokeError on
// 401/403/404/503 (see .statusCode). Top-level uses the ambient session
// (BOUNDED_PRIVATE_KEY on server). To invoke as a specific keypair with no env
// var: `await vault.invoke("syncStripe", { customerId, userId })` on a createWalletClient.
```

Full guide (declare in policy, write the `ctx` API, deploy, secrets, limits, the
proof boundary): [functions.md](../../bounded-backend/docs/functions.md).

## Related

- [../guides/building-a-webapp.md](building-a-webapp.md) - client setup + auth + live reads
- [../guides/building-a-backend.md](../../bounded-backend/docs/building-a-backend.md) - server-signed writes
- [auth.md](auth.md) - CLI/admin auth sources and end-user email/wallet auth
- [queries.md](../../bounded-backend/docs/queries.md) - filters, sort, paging, aggregations, search
- [data-plane.md](../../bounded-backend/docs/data-plane.md) - atomic writes and failure semantics
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) - the same operations from the CLI
