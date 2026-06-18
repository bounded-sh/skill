# Queries

**What's in here / when to read this:** reading many docs — runtime
filter/sort/cursor-pagination, aggregations, full-text search, policy `queries`,
and `links`/`relationships` joins.

Three ways to read more than one document by id: **runtime filters** on the data
plane (the workhorse), **policy `queries`** (computed scalar fields proven at
deploy), and **`links` / `relationships`** (point-lookup joins). Single-document
authorization joins use `get()` inside a rule.

## Runtime filters — the data-plane query API

`get(path, opts)` on a **collection** path takes a structured filter/sort. Read
access still obeys each collection's `read` rule — a filter never returns a
document the caller can't read (the read rule is compiled into the query).

### Operators

| Operator | Meaning |
|---|---|
| (bare value) | equality, e.g. `{ status: "open" }` |
| `$ne` | not equals |
| `$gt` `$gte` `$lt` `$lte` | numeric / time comparisons |
| `$in` `$nin` | value in / not in a list |
| `$regex` (+ `$options`) | string pattern match |
| `$exists` | field present / absent |
| `$not` | negate an operator expression, e.g. `{ score: { $not: { $gt: 90 } } }` |
| `$type` | match by type: `"string"`, `"number"`, `"bool"`, `"array"`, `"object"`, `"null"` |
| `$and` `$or` `$nor` | combine sub-filters |

**Array-valued fields** behave like MongoDB: a field that holds an array matches
when it *contains* the value. So with `tags: ["red","blue"]`, both `{ tags: "red" }`
(membership) and `{ tags: { $in: ["blue","green"] } }` (intersection) match. Array-only
operators:

| Operator | Meaning |
|---|---|
| `$all` | array contains **all** listed values, e.g. `{ tags: { $all: ["red","blue"] } }` |
| `$size` | array has exactly N elements, e.g. `{ tags: { $size: 2 } }` |
| `$elemMatch` | some element matches a sub-condition, e.g. `{ scores: { $elemMatch: { $gte: 90 } } }` |

```ts
// SDK — get(path, { filter, sort, limit, cursor }) on a collection path.
// Deterministic (no AI). Returns { data, nextCursor } when limited/paged.
import { get } from "bounded-sh";              // or "bounded-sh/server"
const open = await get("orders", {
  filter: {
    $and: [
      { status: { $in: ["open", "pending"] } },
      { total: { $gte: 100 } },
      { buyer: user.id }                       // bare value = equality (owner/identity key)
    ]
  },
  sort: { createdAt: -1 },     // 1 = asc, -1 = desc
  limit: 20,
  cursor: lastCursor           // omit for the first page
});
// open.data (rows), open.nextCursor (token for the next page, null when exhausted)
```

> `filter` is the deterministic structured query. `prompt` (a separate `GetOptions`
> field) is the AI/natural-language alternative — the runtime translates it to a
> filter. Use `filter` when you know the shape; `prompt` for free-form.

### Sort, limit, cursor pagination

- `sort: { field: 1 | -1 }` — order results (`1` asc, `-1` desc).
- `limit: N` — page size. When set, `get()` returns `{ data, nextCursor, status }`
  (not a bare array).
- `cursor` — opaque token from the previous page's `nextCursor`; pass it back to
  fetch the next page. Loop until `nextCursor` is null. Cursor paging is stable
  under concurrent writes; prefer it over offset for large sets.

```ts
let cursor, all = [];
do {
  const page = await get("orders", { sort: { createdAt: -1 }, limit: 50, cursor });
  all.push(...page.data);
  cursor = page.nextCursor || undefined;
} while (cursor);
```

### CLI form

```bash
bounded data get --app-id <id> --path orders \
  --filter '{"status":{"$in":["open","pending"]},"total":{"$gte":100}}' \
  --sort createdAt:desc --limit 20
```

### Aggregations

Two SDK shapes:

**Scalar** — `count` / `aggregate(path, operation, opts)` return a single
`{ value }` (`count` / `uniqueCount` / `sum` / `avg` / `min` / `max`), optionally
narrowed by a structured `filter` (same shape as `get`/`queryAggregate`):

```ts
import { count, aggregate } from "bounded-sh";
const open  = await count("orders", { filter: { status: "open" } });           // { value: 4 }
const spend = await aggregate("orders", "sum", { field: "total" });            // { value: 920 }
const big   = await aggregate("orders", "sum", { field: "total", filter: { total: { $gt: 100 } } });
```

On Bounded these run as the deterministic server aggregation (the same engine as
`queryAggregate`) — pass a structured `filter`, not a natural-language `prompt`
(`prompt` is a legacy-backend-only AI filter and does not aggregate on Bounded).

**Grouped** — `queryAggregate(path, spec, opts?)` runs a deterministic, structured
aggregation server-side and returns one row per group:

```ts
import { queryAggregate } from "bounded-sh";
const byStatus = await queryAggregate("orders", {
  groupBy: ["status"], count: true, sum: ["total"], avg: ["total"],
}, { filter: { total: { $gte: 100 } } });        // optional pre-aggregation filter
// [{ group: { status: "open" }, count: 4, sum: { total: 920 }, avg: { total: 230 } }, ...]
```

- `spec`: `groupBy?` (omit → one overall row), `count?`, `sum?`, `avg?`, `min?`,
  `max?` (the latter four are field-name arrays). Result row carries only the
  requested keys: `group?`, `count?`, `sum?`, `avg?`, `min?`, `max?` (each
  numeric-field map keyed by field name).
- Read rules are enforced: aggregation only sees documents the caller can read
  (an owner-scoped collection sums only the caller's own rows — no cross-tenant
  leak).

```bash
bounded data aggregate --app-id <id> --path orders --group status --sum total --count
```

> The filter / sort / aggregate API is a **runtime** feature of the data plane.
> It is not part of the policy file and is not what `bounded verify` proves — the
> proofs cover `rules` and `invariants`. Read access on every query result is
> still enforced by the collection's `read` rule.

## Policy `queries` — computed scalar fields

A `queries` block on a collection declares a named, typed expression computed from
the document. It is proven at deploy (same expression language as rules) and
exposed as a read.

```json
{
  "polls/$pollId": {
    "fields": { "question": "String", "yes": "UInt", "no": "UInt" },
    "tier": "durable",
    "rules": { "read": "true", "create": "@user.id != null", "update": "@user.id != null", "delete": "false" },
    "queries": {
      "total": { "returnType": "UInt", "query": "@data.yes + @data.no" }
    }
  }
}
```

- `returnType` is one of the field types (`UInt`, `Int`, `Bool`, `String`, …).
- `query` is a rule-language expression over `@data` (and `get()` for cross-doc).
- Use it for derived values you don't want to store or trust the client to compute
  (a tally, a ratio with `//`, a boolean status).

## Joins — `links` and `relationships`

Bounded is document-first; "joins" are point lookups, not SQL joins.

### `links` (recommended) — top-level foreign keys

A `links` array declares foreign-key edges. The source field must end in `Id`.

```json
{
  "projects/$projectId": {
    "fields": { "name": "String", "ownerId": "String" },
    "tier": "durable",
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "@user.id != null", "delete": "@user.id != null" }
  },
  "users/$userId": {
    "fields": { "name": "String" },
    "tier": "durable",
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "@user.id != null", "delete": "false" }
  },
  "links": [
    { "from": "projects.ownerId", "to": "users", "reverse": "ownedProjects" }
  ]
}
```

| Key | Meaning |
|---|---|
| `from` | `"collection.fieldId"` — the foreign-key field (must end in `Id`) |
| `to` | target collection name |
| `unique` | reverse side is one-to-one (e.g. a profile per user) |
| `reverse` | name of the reverse relationship (required if two links point at the same target) |

Expand the edge with the `shape` option on `get` — forward (the FK owner) and
reverse (the target) both, on single-doc or collection reads, nestable:

```ts
// forward: a project with its owner expanded
const p = await get("projects/p1", { shape: { owner: {} } });
// p.owner = the user doc (read-rule enforced — omitted if you can't read it)

// reverse: a user with all their projects (one-to-many -> array; `unique` -> single)
const u = await get("users/u1", { shape: { ownedProjects: {} } });
// u.ownedProjects = [ ...project docs ]

// nested: a project -> its owner -> that owner's projects
await get("projects/p1", { shape: { owner: { ownedProjects: {} } } });
```

- The forward name is the FK field minus `Id` (`ownerId` → `owner`); the reverse
  name is the link's `reverse`.
- Related docs are **read-rule enforced**: an expansion the caller can't read is
  omitted (forward) or filtered out (reverse) — never a leak.
- `shape` resolves both the top-level **`links`** array and per-collection
  **`relationships`** (below).

### `relationships` (per-collection) — explicit local/foreign fields

For finer control (including many-to-many through a join table) declare
`relationships` on a collection: `{ type, collection, localField, foreignField,
through?, throughLocalField?, throughForeignField? }`. The validator checks every
referenced field exists. These are expandable via `shape` just like `links`:

```json
"students/$id": {
  "fields": { "name": "String" },
  "tier": "durable",
  "relationships": {
    "courses": { "type": "many-to-many", "collection": "courses",
      "localField": "id", "foreignField": "id",
      "through": "enrollments", "throughLocalField": "studentId", "throughForeignField": "courseId" }
  },
  "rules": { "read": "true", "create": "@user.id != null", "update": "false", "delete": "false" }
}
```

```ts
const s = await get("students/s1", { shape: { courses: {} } });
// s.courses = [ ...course docs the student is enrolled in ] (read-rule enforced)
```

`localField`/`foreignField` default to the document id (`"id"`); set them to join
on an ordinary field instead. `type` is `one-to-one` (single doc) or
`one-to-many` / `many-to-many` (a list).

## Authorization joins — `get()` in a rule

When a *single* write's authorization depends on another document, don't query —
read it inline with `get()`:

```json
"update": "@user.id != null && get(/orgs/$orgId/members/@user.id).role == \"admin\""
```

`get()` reads pre-transaction state; `getAfter()` reads staged in-batch state (for
guard-then-write composition — see [data-plane.md](data-plane.md)). This is the
right tool for "only an admin may", "only if the parent is active", "capacity not
exceeded" — and it is proven at deploy.

## Picking the right tool

| Need | Use |
|---|---|
| List/filter/paginate many documents | `get(path, { filter, sort, limit, cursor })` |
| Count / sum a single scalar | `count` / `aggregate` → `{ value }` |
| Group + count/sum/avg/min/max | `queryAggregate(path, spec)` → rows |
| A derived value proven at deploy | policy `queries` |
| Expand a foreign key both ways | `links` |
| Many-to-many through a join table | `relationships` |
| Gate one write on another document | `get()` / `getAfter()` in a rule |
| Free-text search | `search` ([files-and-search.md](files-and-search.md)) |

## Related

- [sdk-reference.md](sdk-reference.md) — `get`/`count`/`aggregate`/`search` signatures
- [cli-reference.md](cli-reference.md) — `bounded data get/aggregate/search` flags
- [policy-reference.md](policy-reference.md) — `queries`, `relationships`, `links`, `get()`
- [data-plane.md](data-plane.md) — reads, writes, and in-batch composition
- [files-and-search.md](files-and-search.md) — full-text search queries
