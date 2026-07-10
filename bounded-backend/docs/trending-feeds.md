# Trending feeds & leaderboards — ranked reads as a first-class pattern

Any "what's hot right now" surface — trending lists, leaderboards, most-active, live dashboards —
reduces to one shape: **rank items by a frequently-updated, time-windowed aggregate of events, and
read the top-N cheaply and freshly.** Bounded makes each piece declarative; you never hand-roll a
cron sweep, a dirty-set, or a materialized score pipeline.

## The three pieces

### 1. Count the activity at event time (a reactive hook, or `windowSum`)

**Simplest — a lifetime counter via an offchain create-hook** on the event collection (see
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md)); null-safe self-initializing increment:

```json
"operations/$slug/trade/$tradeId": {
  "hooks": { "offchain": {
    "create": "(get(/launches/$slug).vol == null && @DocumentPlugin.updateField(/launches/$slug, 'vol', @newData.amt) || @DocumentPlugin.updateField(/launches/$slug, 'vol', get(/launches/$slug).vol + @newData.amt)) && @DocumentPlugin.updateField(/launches/$slug, 'lastTradeAt', @time.now)"
  }}
}
```

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
event path; both collections are `durable` tier, non-session, offchain. Events maintain the
aggregate on EVERY write path — client SDK / HTTP, room-native WebSocket writes, and events
created by policy HOOKS. The hook path is how you compose normalization with windowing: when the
raw event needs a per-branch transform first (e.g. buys in lamports vs sells in raw tokens), have
the hook write the NORMALIZED value into a hook-owned event collection and declare the windowSum
there — poof.fun's trade feed is the canonical example (swap hook → `flow/$slug/ev/$id {size}` →
windowSum → `launches.vol10m`).

### 2. Rank with a plain query — auto-indexed, O(k)

```ts
const top = await bounded.get('launches', {
  filter: { status: 'live' },
  sort: { vol10m: -1 },
  limit: 24,
});
// or live: bounded.subscribe('launches', { sort: { vol10m: -1 }, limit: 24 }, cb)
```

No index declarations required: the engine pushes `filter + sort + limit` into a single indexed SQL
query and **auto-creates the composite index** the first time it sees the ranked shape — top-N is
O(k), not O(collection). Subscriptions get the same acceleration. The engine only pushes when the
result is provably identical to the reference path (public read rule, numeric sort fields, exact
filters) and falls back transparently otherwise — correctness is never traded for speed.

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

## Correctness checklist

- Runtime-owned fields (`vol`, `vol10m`) pinned null in user-writable create/update rule branches.
- Event collection append-only when a `windowSum` is declared (enforced).
- Both collections `durable` tier, not session-scoped.
- Counting attempts vs fills: a create-hook fires whether or not a downstream (e.g. onchain sim)
  action succeeded — cap the term if that distinction matters, or count from an executed-only sweep.
