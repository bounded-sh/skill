# Files & Search

**What's in here / when to read this:** `type: "storage"` file collections
(`setFile`/`getFiles`) and `search: { fields }` full-text indexing.

Two collection features for content-heavy apps: **storage** collections back files
in R2 with the same path-scoped auth as data, and **search** declares full-text
indexing on chosen fields.

## Files — `type: "storage"`

A collection declared `"type": "storage"` is R2-backed: each document is a file
(blob) addressed by its path, with metadata fields you declare. Auth is exactly the
same `rules` model as any collection — so file access is scoped by path just like
data.

```json
{
  "users/$userId/files/$fileId": {
    "type": "storage",
    "fields": { "name": "String", "owner": "Address!", "size": "UInt" },
    "rules": {
      "read":   "@user.address != null && $userId == @user.address",
      "create": "@user.address != null && $userId == @user.address && @newData.owner == @user.address",
      "update": "false",
      "delete": "@user.address != null && $userId == @user.address"
    }
  }
}
```

- The path scopes the file. `users/$userId/files/$fileId` with
  `$userId == @user.address` means a user can only touch files under their own id —
  the path is the access boundary, proven by the rule.
- Declared `fields` are the file's metadata (name, size, content-type, whatever you
  need); the bytes are stored separately in R2 and streamed.
- Mark `owner` (and any set-once metadata) `!` so it can't be reassigned.
- Storage collections are offchain.

Upload and download go through the SDK. `setFile(path, file)` uploads a `File`
(or `null` to delete); `getFiles(path)` lists the files under a path. The same
path-scoped `read`/`create`/`delete` rules apply.

```ts
import { setFile, getFiles } from "@bounded-sh/client";
await setFile("users/u1/files/avatar", file);   // File | null
const files = await getFiles("users/u1/files");
```

## Search — `search: { fields: [...] }`

Declare which `String` fields are full-text indexed. The runtime maintains the
index; you query it through the data plane.

```json
{
  "orgs/$orgId/docs/$docId": {
    "fields": { "org": "String", "title": "String", "body": "String" },
    "tier": "durable",
    "search": { "fields": ["title", "body"] },
    "rules": {
      "read":   "@user.address != null",
      "create": "@user.address != null",
      "update": "@user.address != null",
      "delete": "@user.address != null"
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
// SDK — search() over the collection path
import { search } from "@bounded-sh/client";
const hits = await search("orgs/o1/docs", { query: "quarterly revenue", fields: ["title", "body"] });
```

```bash
# CLI
bounded data search --app-id <id> --path orgs/o1/docs --query "quarterly revenue"
```

The match runs over the declared `search.fields` (or pass `fields` to restrict
further). Combine with `filter` to scope (e.g. search within
`status == "published"`).

## Choosing between them and ordinary data

| Need | Use |
|---|---|
| Store an uploaded image / pdf / blob | `type: "storage"` collection |
| Store structured metadata about a file | the storage collection's `fields` |
| Free-text find across titles/bodies | `search: { fields: [...] }` |
| Exact-match / range / membership lookups | ordinary filters ([queries.md](queries.md)) |

## Related

- [sdk-reference.md](sdk-reference.md) — `setFile`/`getFiles`/`search` signatures
- [policy-reference.md](policy-reference.md) — the `type` and `search` config keys
- [queries.md](queries.md) — filters, paging, and the search query in detail
- [policy-generation-guide.md](policy-generation-guide.md) — when a description calls for files/search
