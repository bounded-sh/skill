# Files & Search

**What's in here / when to read this:** `type: "storage"` file collections
(`setFile`/`getFiles`) and `search: { fields }` full-text indexing.

Two collection features for content-heavy apps: **storage** collections store files
with the same path-scoped auth as data, and **search** declares full-text
indexing on chosen fields.

## Files — `type: "storage"`

A collection declared `"type": "storage"` stores each document as a file
(blob) addressed by its path, with metadata fields you declare. Auth is exactly the
same `rules` model as any collection — so file access is scoped by path just like
data.

```json
{
  "users/$userId/files/$fileId": {
    "type": "storage",
    "fields": { "name": "String", "owner": "Address!" },
    "rules": {
      "read":   "@user.id != null && $userId == @user.id",
      "create": "@user.id != null && $userId == @user.id",
      "update": "false",
      "delete": "@user.id != null && $userId == @user.id"
    }
  }
}
```

- The path scopes the file. `users/$userId/files/$fileId` with
  `$userId == @user.id` means a user can only touch files under their own id —
  the path is the access boundary, proven by the rule. `@user.id` is the universal
  stable identity (always present for an authenticated user, wallet or email/social),
  so it's the right key for ownership here.
- Storage collections are offchain.

### System metadata vs your declared fields

A storage document carries **two** kinds of metadata:

- **System metadata** — populated automatically by `setFile`: `contentType`,
  `size` (bytes), `status` (`"ready"` once uploaded), `uploadedBy`, `createdAt`.
  You never set these (passing them is a 400).
- **Your declared `fields`** (`name`, `owner`, …) — set them **atomically with the
  upload** by passing `metadata` to `setFile`. They land in `@newData` for the
  CREATE rule and persist with the file — no second write, so `update: "false"` is
  fine. The server validates `metadata` against your declared `fields` (an unknown
  or reserved key is a 400, never a silent drop).

```ts
import { setFile, getFiles, get } from "@bounded-sh/client";

// Upload the bytes AND set declared fields in one call (atomic create).
await setFile("users/u1/files/avatar", file, {
  metadata: { name: "avatar.png", owner: user.id },
});
```

So a create rule can gate on the metadata you upload, e.g.
`"create": "@newData.owner == @user.id"` — the file is created only if the
`owner` you pass matches the caller. (`owner` here is an identity/ownership key, so
use `@user.id`, the universal identity — not the wallet `@user.address`.)

`setFile`'s `metadata` applies on **create** only. To change an existing file's
declared fields, `set(path, {...})` it like any doc (an update — your `update` rule
must allow it). To replace just the bytes, `setFile(path, file)` again.

### Reading files back

`getFiles(path)` lists readable files with their metadata and a signed download URL:
`{ data: [{ path, url, metadata }] }`, where `metadata` carries both system fields
and your declared fields, and `url` is a short-lived signed download link. For a single
file you can also `get(path)` / subscribe the storage document like any other doc.

```ts
const { data } = await getFiles("users/u1/files");
// data[0] = { path, url, metadata: { name, owner, contentType, size, status, … } }
const bytes = await (await fetch(data[0].url)).text();    // download via the signed url
```

## Search — `search: { fields: [...] }`

Declare which `String` fields are full-text indexed. The runtime maintains the
index; you query it through the data plane.

> **You don't strictly need a `search` block to call `search()`.** With no
> `search` declared, the runtime falls back to an in-memory scan over the whole
> document (every field), still honoring `read` rules — handy for small or
> bounded collections. Declaring `search: { fields }` upgrades that to a
> *maintained index* scoped to those fields: scalable, and `opts.fields` then
> narrows to a subset of the declared (indexed) fields. Declare it for anything
> that grows; rely on the fallback only for small working sets.

```json
{
  "orgs/$orgId/docs/$docId": {
    "fields": { "org": "String", "title": "String", "body": "String" },
    "tier": "durable",
    "search": { "fields": ["title", "body"] },
    "rules": {
      "read":   "@user.id != null",
      "create": "@user.id != null",
      "update": "@user.id != null",
      "delete": "@user.id != null"
    }
  }
}
```

- `fields` must be a non-empty array of valid field names (dotted names allowed).
- Index those fields you actually search; each adds write-time index cost.
- Search respects `read` rules — results a caller can't read are not returned.

### The search query

Search is a query mode on the collection, combinable with filters and paging (see
[queries.md](queries.md)):

```ts
// SDK — search(path, query, opts?). Returns the matching documents.
import { search } from "@bounded-sh/client";          // or "bounded-sh/server"
const hits = await search("orgs/o1/docs", "quarterly revenue");
// restrict to a subset of the indexed fields, and/or page:
const titleHits = await search("orgs/o1/docs", "revenue", { fields: ["title"], limit: 20 });
```

```bash
# CLI
bounded data search --app-id <id> --path orgs/o1/docs --query "quarterly revenue"
```

- `query` is a required non-empty string (positional); `opts` takes `fields`
  (restrict to a subset of the indexed fields), `limit`, and `cursor` (paging).
- Match is case-insensitive over the declared `search.fields`.
- **Read rules are enforced per document** — a caller only gets matches they are
  allowed to read (e.g. with `read: "@data.owner == @user.id"`, each user
  searches only their own rows).

## Choosing between them and ordinary data

| Need | Use |
|---|---|
| Store an uploaded image / pdf / blob | `type: "storage"` collection |
| Store structured metadata about a file | the storage collection's `fields` |
| Free-text find across titles/bodies | `search: { fields: [...] }` |
| Exact-match / range / membership lookups | ordinary filters ([queries.md](queries.md)) |

## Related

- [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) — `setFile`/`getFiles`/`search` signatures
- [policy-reference.md](policy-reference.md) — the `type` and `search` config keys
- [queries.md](queries.md) — filters, paging, and the search query in detail
- [policy-generation-guide.md](policy-generation-guide.md) — when a description calls for files/search
