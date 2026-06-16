# SDK Reference — `bounded-sh` (one package, two subpath exports)

**What's in here / when to read this:** every SDK method —
`get`/`getPage`/`setMany`/`subscribe`/`search`/`queryAggregate`, auth,
collaborators, `createWalletClient`, `verifyWebhook`, and invoking a function.

**One package, two entrypoints.** `bounded-sh` is a single npm install with two
subpath exports — like `convex` or `@supabase/supabase-js`:

- `bounded-sh` (the default/browser export) runs in the browser and React Native:
  end-user auth via Privy/wallet, live subscriptions, `subscribe`, `live`, and
  function invocation.
- `bounded-sh/server` runs on a server, signs with a keypair (no browser auth),
  and adds `createWalletClient` + `verifyWebhook`.

Both speak to the realtime worker that enforces the deployed policy — the SDK can
never bypass a rule or invariant.

> Beta: the package is not yet published to npm. APIs below are exported from
> source today and stable in shape.

## Setup

```sh
npm i bounded-sh        # one install — both entrypoints come from this package
```

```ts
// client (browser / RN)
import { init, login, get, set, subscribe } from "bounded-sh";
await init({ appId: "<appId>", authMethod: "privy" });   // see auth.md

// server
import { createWalletClient } from "bounded-sh/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
```

`init(config)` takes `{ appId, authMethod, chain?, apiUrl?, wsApiUrl?,
authApiUrl? }`. `authMethod` is one of `'privy' | 'wallet' | 'phantom' |
'privy-expo' | 'none'` (full list and auth flow in [auth.md](auth.md)).

`appId` is your project's **public** app id — it is **not a secret API key**.
Authentication is done with the user's wallet/session id-token bearer (see
[auth.md](auth.md)), so the `appId` is safe to ship in client code. The legacy
`apiKey` field is a **deprecated alias** for `appId`: `init()` accepts either
one and normalizes them to the same value, so `init({ apiKey: "<appId>" })`
still works but new code should use `appId`.

## Read — `get` / `getPage` / `getMany`

`get(path, opts?)` reads a single document (even-segment path) or **lists a
collection** (odd-segment path). For collection reads, `opts` carries the query
shape (filters/sort/search/aggregate — see below).

```ts
const doc   = await get("spend/a");                       // one document
const page  = await get("spend", { limit: 20 });          // array of documents
const open  = await get("orders", {                       // filtered + sorted
  filter: { status: { $in: ["open", "pending"] }, total: { $gte: 100 } },
  sort: { createdAt: -1 },
  limit: 20,
});
```

- `getPage(path, opts)` → `{ data, nextCursor }` for explicit cursor paging.
  Pass the returned `nextCursor` back as `opts.cursor` for the next page.
- `getMany(paths)` → batch-read several paths at once.

`GetOptions`: `filter`, `sort` (`{ field: 1 | -1 }`), `limit`, `cursor`,
`search` (`{ query, fields? }`), `aggregate` (`AggregateSpec`), `includeSubPaths`,
`shape`, `prompt`, `bypassCache`. Read access always obeys the collection's
`read` rule — a filter never returns a doc the caller can't read.

## Search & aggregate — `search` / `queryAggregate` / `count`

```ts
const hits = await search("notes", { query: "shipping", fields: ["title", "body"] });

const rows = await queryAggregate("spend", {
  groupBy: ["category"], count: true, sum: ["amount"],
});                                                       // AggregateRow[]

const n = await count("orders", { prompt: "created in the last 7 days" });  // { value }
```

`AggregateSpec`: `groupBy?`, `count?`, `sum?`, `avg?`, `min?`, `max?` (each a
field list). Details and CLI equivalents: [queries.md](queries.md).

## Write — `set` / `setMany`

`set(path, document)` is sugar for a one-element `setMany`. `setMany([...])` is
**one atomic transaction**: every rule, hook, and invariant passes for the whole
batch or nothing commits. This is what makes transfers under `conserve` and
guard-then-write composition safe.

```ts
await set("spend/s1", { amount: 60 });

await setMany([                                            // atomic transfer
  { path: "accounts/alice", document: { balance: 50 } },
  { path: "accounts/bob",   document: { balance: 150 } },
]);
```

A violated invariant throws (409 with the invariant name); a denied rule throws
(403). Nothing partial is applied. Append-only semantics, in-batch `getAfter`
composition, and failure codes: [data-plane.md](data-plane.md).

## Subscribe (live) — `subscribe`

`bounded-sh` only. Every collection is live; `subscribe` streams a single
document or a filtered collection and calls `onData` on every change. It returns
an unsubscribe function.

```ts
const stop = await subscribe("rooms/r1/view/" + myAddress, {
  onData: (view) => render(view),
  onError: (e) => console.error(e),
});
// later:
await stop();
```

`SubscribeOptions`: `filter`, `prompt`, `shape`, `limit`, `cursor`, `onData`,
`onError`, `appId`. Filters/sort/paging match `get`. Read rules are enforced
per delivered document. More: [realtime-and-games.md](realtime-and-games.md).

## Files — `setFile` / `getFiles`

For `type: "storage"` collections (R2-backed, same path-scoped auth as data).

```ts
// blob + declared fields in one atomic create; system meta auto-filled
await setFile("users/u1/files/avatar", file, { metadata: { name: "avatar.png", owner: myAddress } });
const { data } = await getFiles("users/u1/files"); // [{ path, url, metadata }] — signed R2 links + metadata
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

## Collaborators — `addCollaborator` / `removeCollaborator` / `listCollaborators`

```ts
await addCollaborator(appId, walletAddress);
const list = await listCollaborators(appId);       // Collaborator[]
await removeCollaborator(appId, walletAddress);
```

Same model as `bounded share/unshare/collaborators` — only the owner may modify
the list, enforced server-side.

## Auth (client) — `login` / `logout` / `getCurrentUser` / `useAuth`

```ts
import { login, logout, getCurrentUser, useAuth } from "bounded-sh";

await login();                       // opens the configured auth modal (Privy / wallet)
const user = getCurrentUser();       // { address, ... } | null

// React:
const { user, login, logout, loading } = useAuth();
```

`onAuthStateChanged(cb)` / `onAuthLoadingChanged(cb)` are the imperative
equivalents. End-user identity surfaces in rules as `@user.address`. Full flow,
providers, and embedded wallets: [auth.md](auth.md).

## `bounded-sh/server` — `createWalletClient`

> **Requires Node ≥ 18** (declared in the package's `engines`). The server SDK
> pulls in ESM-only transitive deps (e.g. via `@solana/web3.js` →
> `rpc-websockets`/`uuid`); on Node 16 a `require()` of the package throws
> `ERR_REQUIRE_ESM`. Node 18+ loads both the CJS (`require`) and ESM (`import`)
> entrypoints cleanly. Use an LTS Node (18/20/22).

The server client wraps the **same operations**, signed by a keypair, with no
browser auth. Each client has its own session — no global state.

There are two server setup shapes; both work:

```ts
import { init, createWalletClient } from "bounded-sh/server";

// 1) init({appId}) once, then create keypair-signed clients against that app.
//    init pins the appId/endpoints; createWalletClient adds the signer.
await init({ appId: "<appId>" });
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });

vault.address;                                   // the signer's address
await vault.set("markets/123", { open: true });
await vault.setMany([ /* atomic batch */ ]);
const doc = await vault.get("markets/123");
```

```ts
// 2) ESM import works identically (engines >=18 guarantees both forms load):
const { init, createWalletClient } = await import("bounded-sh/server");
```

`vault` exposes `get`, `getPage`, `getMany`, `set`, `setMany`, `setFile`,
`getFiles`, `search`, `queryAggregate`, `count`, `aggregate`, `runQuery`,
`runQueryMany`, `runExpression`, `runExpressionMany`, and the collaborator
methods. `keypair` is a base58 string or JSON array secret key — the **base58**
form is the same value the CLI stores as the `privateKey` field in
`~/.bounded/credentials` (and accepts via `BOUNDED_PRIVATE_KEY`), so a server can
sign as the CLI identity by reading that key. Server tasks:
[../guides/building-a-backend.md](../guides/building-a-backend.md).

### Verifying webhooks — `verifyWebhook`

`bounded-sh/server` also exports `verifyWebhook` for inbound mutation webhooks.
It fetches + caches Bounded's Ed25519 public key (from the hosted `/.well-known`
keys endpoint), checks the signature over the raw body, and enforces timestamp
skew — returning the typed payload or throwing `WebhookVerificationError`.

```ts
import { verifyWebhook, WebhookVerificationError } from "bounded-sh/server";

// rawBody is the unparsed request body string; headers is the request headers.
const event = await verifyWebhook(rawBody, headers);
// event: { id, appId, path, operation, document, previousDocument, timestamp }
```

Also exported: `clearWebhookKeyCache`, `WebhookVerificationError`,
`DEFAULT_WEBHOOK_KEYS_URL`. `verifyWebhook(rawBody, headers, opts?)` — `opts`
overrides `keysUrl` / `maxSkewSeconds` / cache TTL. Declaring webhooks:
[hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md).

### Invoking a function — today (and the planned helper)

A first-class `functions.invoke(name, args)` SDK helper is **planned but not yet
exported** from `bounded-sh` / `bounded-sh/server` — don't import it. Today, invoke
the dispatcher directly with the SDK's id token (the same token the data plane
sends), so the dispatcher verifies your identity and evaluates the function's
`auth` policy rule before it runs:

```ts
import { getIdToken } from "bounded-sh"; // exported today

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

Full guide (declare in policy, write the `ctx` API, deploy, secrets, limits, the
proof boundary): [functions.md](functions.md).

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — client setup + auth + live reads
- [../guides/building-a-backend.md](../guides/building-a-backend.md) — server-signed writes
- [auth.md](auth.md) — dev keypair identity vs end-user Privy/wallet auth
- [queries.md](queries.md) — filters, sort, paging, aggregations, search
- [data-plane.md](data-plane.md) — atomic writes and failure semantics
- [cli-reference.md](cli-reference.md) — the same operations from the CLI
