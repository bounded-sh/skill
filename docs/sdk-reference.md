# SDK Reference — `@bounded/client` & `@bounded/server`

Two packages, **one operation surface**. `@bounded/client` runs in the browser
and React Native (end-user auth via Privy/wallet, live subscriptions);
`@bounded/server` runs on a server, signs with a keypair (no browser auth), and
adds `createWalletClient`. Both speak to the realtime worker that enforces the
deployed policy — the SDK can never bypass a rule or invariant.

> Beta: the packages are not yet published to npm. APIs below are exported from
> source today and stable in shape.

## Setup

```ts
// client (browser / RN)
import { init, login, get, set, subscribe } from "@bounded/client";
await init({ appId: "<appId>", authMethod: "privy" });   // see auth.md

// server
import { createWalletClient } from "@bounded/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
```

`init(config)` takes `{ appId, authMethod, chain?, apiUrl?, wsApiUrl?,
authApiUrl? }`. `authMethod` is one of `'privy' | 'wallet' | 'phantom' |
'privy-expo' | 'none'` (full list and auth flow in [auth.md](auth.md)).

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

`@bounded/client` only. Every collection is live; `subscribe` streams a single
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
await setFile("users/u1/files/avatar", file);     // File | null (null deletes)
const files = await getFiles("users/u1/files");
```

Details and the storage collection shape: [files-and-search.md](files-and-search.md).

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
import { login, logout, getCurrentUser, useAuth } from "@bounded/client";

await login();                       // opens the configured auth modal (Privy / wallet)
const user = getCurrentUser();       // { address, ... } | null

// React:
const { user, login, logout, loading } = useAuth();
```

`onAuthStateChanged(cb)` / `onAuthLoadingChanged(cb)` are the imperative
equivalents. End-user identity surfaces in rules as `@user.address`. Full flow,
providers, and embedded wallets: [auth.md](auth.md).

## `@bounded/server` — `createWalletClient`

The server client wraps the **same operations**, signed by a keypair, with no
browser auth. Each client has its own session — no global state.

```ts
import { createWalletClient } from "@bounded/server";

const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });
vault.address;                                   // the signer's address
await vault.set("markets/123", { open: true });
await vault.setMany([ /* atomic batch */ ]);
const doc = await vault.get("markets/123");
```

`vault` exposes `get`, `getPage`, `getMany`, `set`, `setMany`, `setFile`,
`getFiles`, `search`, `queryAggregate`, `count`, `aggregate`, `runQuery`,
`runQueryMany`, `runExpression`, `runExpressionMany`, and the collaborator
methods. `keypair` is a base58 string or JSON array secret key. Server tasks:
[../guides/building-a-backend.md](../guides/building-a-backend.md).

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — client setup + auth + live reads
- [../guides/building-a-backend.md](../guides/building-a-backend.md) — server-signed writes
- [auth.md](auth.md) — dev keypair identity vs end-user Privy/wallet auth
- [queries.md](queries.md) — filters, sort, paging, aggregations, search
- [data-plane.md](data-plane.md) — atomic writes and failure semantics
- [cli-reference.md](cli-reference.md) — the same operations from the CLI
