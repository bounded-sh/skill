# Trending feeds & leaderboards — ranked reads as a first-class pattern

Any "what's hot right now" surface — trending lists, leaderboards, most-active, live dashboards —
reduces to one shape: **rank items by a frequently-updated, time-windowed aggregate of events, and
read the top-N cheaply and freshly.** Bounded makes each piece declarative; you never hand-roll a
cron sweep, a dirty-set, or a materialized score pipeline.

> **This pattern is offchain.** `windowSum` is **offchain-only in v1** - declaring it on an
> `onchain: true` collection is structurally rejected at deploy, and there is no onchain analog
> ([invariants.md](invariants.md#onchain--coverage-claims-are-verified-not-trusted)). An onchain
> app ranks a different way: see [Ranking an onchain feed](#ranking-an-onchain-feed).

## The three pieces

### 1. Count the activity at event time (a reactive hook, or `windowSum`)

**Simplest — a lifetime total with atomic `increment()`.** Do **not** hand-roll a
read-modify-write counter in a hook. A hook that reads `vol`, adds `@newData.amt`,
and writes it back **loses updates** under concurrency (two trades landing at once
both read the same starting total and one contribution is clobbered), and
`@time.now` does **not** resolve as a hook mutation value, so a `lastTradeAt`
stamped that way is written blank. Use the supported primitives instead:

- **Lifetime total:** write the volume with the atomic `increment()` field helper
  from the client/server SDK - `set('launches/<slug>', { vol: increment(amt) })` -
  which adds server-side and atomically, with no lost updates under concurrency
  (see [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md)).
- **Last-traded time:** stamp it from the client write with `serverTimestamp()`
  (resolves server-side at write time), never `@time.now` inside a hook.
- **Time-windowed volume:** use the `windowSum` invariant below, which the runtime
  maintains atomically.

**Time-windowed — declare a `windowSum` invariant** on the (append-only) event collection and the
runtime maintains an EXACT sliding-window sum as a plain readable field on the target doc — events
add on create, and expire out automatically when they leave the window (alarm-driven, no cron):

```json
"operations/$slug/trade/$tradeId": {
  "invariants": [{
    "type": "windowSum",
    "name": "vol10m",
    "field": "amt",
    "windowSeconds": 600,
    "target": "launches/$slug",
    "targetField": "vol10m"
  }]
}
```

`launches.vol10m` is then "trade volume in the last 10 minutes" — readable, subscribable, sortable,
always current. Declare `vol10m: "UInt?"` on the target's fields and pin it in the target's rules so
users can't seed it (`@newData.vol10m == null` on user-writable branches): it is runtime-owned.
Like `rollingSum`, a `windowSum` makes the event collection append-only (a mutated event would
falsify the sum).

windowSum constraints (validated at deploy): the event `field` is `UInt` and the `targetField`
is declared numeric (`UInt?`/`Int?`) on a target template whose path variables all come from the
event path; both collections are `durable` tier, non-session, and **offchain**. Events maintain the
aggregate on EVERY write path — client SDK / HTTP, room-native WebSocket writes, and events
created by policy HOOKS. The hook path is how you compose normalization with windowing: when the
raw event needs a per-branch transform first (e.g. buys in lamports vs sells in raw tokens), have
the hook write the NORMALIZED value into a hook-owned event collection and declare the windowSum
there — poof.fun's trade feed is the canonical example (swap hook → `flow/$slug/ev/$id {size}` →
windowSum → `launches.vol10m`).

### 2. Rank with a plain query — auto-indexed, O(k) on SQLite

```ts
const top = await bounded.get('launches', {
  filter: { status: 'live' },
  sort: { vol10m: -1 },
  limit: 24,
});
// or live: bounded.subscribe('launches', { sort: { vol10m: -1 }, limit: 24 }, cb)
```

No index declarations required: on the **default SQLite** document backend the engine pushes
`filter + sort + limit` into a single indexed SQL query and **auto-creates the composite index** the
first time it sees the ranked shape — top-N is O(k), not O(collection). The **Postgres-primary**
backend currently uses the in-memory working-set query path, so **do not rely on the O(k) promise
there** (mirroring [invariants.md](invariants.md)). Subscriptions get the same acceleration. The engine only pushes when the
result is provably identical to the reference path: numeric sort fields, exact filters, and an
exactly-compilable read rule (public, or per-user shapes like `@data.owner == @user.id`). Anything
else falls back transparently — correctness is never traded for speed.

### 3. (Optional) Pre-declare hot indexes to skip the first-query build

The first ranked query on a big cold collection pays a one-time index build. For known-hot feeds,
pre-declare so deploy warms them:

```json
"launches/$slug": {
  "indexes": ["vol10m", ["status", "vol10m"]]
}
```

## Composing a score

Feeds usually rank by a blend (votes + comments + volume + freshness). Two good patterns:

- **Sort by one maintained field** (e.g. `windowSum` volume) and blend the rest client-side over the
  subscribed top-N window — instant re-ranking, no server writes.
- **Denormalize a composite `score`** via a scheduled function when the blend must be authoritative
  server-side ordering — and keep any hook-owned/windowSum fields OUT of the scheduled writer's
  field set so a merge-write never clobbers a live increment.

Bound every activity term (cap + saturating curve, e.g. `min(48, 6*log2(1+vol/1000))`) so spam
can't dominate organic signals.

## Ranking an onchain feed

`windowSum` is offchain-only, so an onchain collection cannot carry a runtime-maintained window
score - the deploy rejects the invariant rather than degrading it. Rank from the vote documents
themselves instead:

- **One vote per voter is the path.** Key each vote by the caller in an `onchain: true`
  subcollection - `items/$itemId/votes/$voter`, with `$voter == @user.address` in the create and
  update rules - so a second vote is the same document rather than a new one and the rules decide
  whether it may change. Every id segment of a collection template must be a `$variable`;
  `@user.address` is legal inside a `get()` / `getAfter()` path but not as a collection key, and a
  template that spells it there is rejected at verify.
- **Count through the mirror.** Reads, lists, `subscribe`, and `aggregate` work on onchain
  collections
  ([onchain.md](../../bounded-onchain/docs/onchain.md#what-changes-when-a-collection-is-onchain)),
  so `count('items/<id>/votes')` is the tally - subject to the mirror's eventual consistency, so
  poll or subscribe rather than reading straight after a write.
- **Rank client-side** over the candidate set you already read, and keep the blend there. The
  cap + saturating curve above still applies; spam control is your rules, not an invariant.

If the ranking must be authoritative and server-maintained, keep the ranked collection and its
aggregate **offchain** and put only the value-bearing writes onchain - the two coexist in one app,
but never in one batch
([onchain.md](../../bounded-onchain/docs/onchain.md#onchain-and-offchain-collections-coexist-and-the-0xbc4-gotcha)).

## Correctness checklist

- Runtime-owned fields (`vol`, `vol10m`) pinned null in user-writable create/update rule branches.
- Event collection append-only when a `windowSum` is declared (enforced).
- Both collections `durable` tier, not session-scoped, and **offchain** - a `windowSum` on an
  `onchain: true` collection is rejected at deploy; rank an onchain feed the other way instead
  ([above](#ranking-an-onchain-feed)).
- Counting attempts vs fills: a create-hook fires whether or not a downstream (e.g. onchain sim)
  action succeeded — cap the term if that distinction matters, or count from an executed-only sweep.
