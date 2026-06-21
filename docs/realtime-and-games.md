# Realtime & Games

Bounded runs every app on a realtime Durable Object, so subscriptions and live
queries come for free. For multiplayer and games it adds a **server-authoritative
loop**: rooms with a fixed `tick`, fog-of-war via per-player view collections,
proven per-player rate caps, and automatic settlement into durable storage. The
honest limit on what anti-cheat can prove is in
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md).

> **Two tick runtimes.** This doc covers the **bytecode** `session.tick` model — a
> `hooks.tick.<name>` reducer expressed in policy plus `settleFrom`/`settleTo`
> settlement. There is a second, native runtime — `session.live`, where you upload
> a TypeScript module of three pure functions (`init`/`tick`/`views`) that Bounded
> runs in an isolated facet (no deploy). The two are **mutually exclusive** on one
> session. For real server-authoritative loops (game collisions/scoring, a
> Figma-style editor's canonical doc + cursors, a live dashboard's reducer — any
> realtime room with logic in code), use the native runtime:
> **[live-runtime.md](live-runtime.md)**.

## Subscriptions & live queries

Every collection is live. `subscribe(path, { onData })` streams a single document
or a filtered collection, delivering sub-millisecond deltas, not polls, and
returns an unsubscribe function.

```ts
import { subscribe } from "bounded-sh";

const stop = await subscribe(`rooms/${roomId}/view/${user.id}`, {
  onData: (view) => render(view),   // called on every change
  onError: (e) => console.error(e),
});
// later: await stop();
```

`subscribe` takes the same structured `filter` and `shape` as `get` — the live
feed only delivers matching documents (initial snapshot AND deltas), with `shape`
relationships expanded:

```ts
const stop = await subscribe("orders", {
  filter: { status: "open", total: { $gt: 100 } },   // deterministic; same operators as get()
  shape: { buyer: {} },                               // expand links on each delivered doc
  onData: (rows) => render(rows),                     // rows is a plain array (see payload shape)
});
```

**`onData` payload shape.** The argument passed to `onData` mirrors the *path*,
not `get`'s paged envelope:

- **Single document** (`subscribe("users/u1", …)`) → the document object, or
  `null` when it doesn't exist / the read rule denies it.
- **Collection** (`subscribe("messages", …)`, with or without `filter`/`limit`)
  → a **plain array** of the matching documents (`[]` when none match). The whole
  current matching set is re-delivered on each change; `onData` is *not* a
  per-row delta callback.

> **Differs from `get()` on purpose.** A *paged* `get("messages", { limit })`
> returns `{ data, nextCursor, status }`. `subscribe("messages", { limit })`
> delivers the **bare array** to `onData` (there is no `nextCursor` on a live
> feed — `limit` caps how many docs the feed tracks). Destructure the array
> directly (`onData: (rows) => …`), **not** `onData: ({ data }) => …` — the
> latter yields `undefined`.

`SubscribeOptions`: `filter`, `shape`, `limit`, `cursor`, `prompt`, `onData`,
`onError`. (No `sort` — a live feed is event-ordered, not sorted; sort the array
client-side, or use `get` for a sorted snapshot.) Read access is enforced per
delivered document — a player's subscription to `view/$playerId` only ever
delivers their own view, and a `shape` expansion the caller can't read is omitted.

## Tiers for realtime

| Tier | Use in a game |
|---|---|
| `ephemeral` | room state, player views, cursors, transient scores — fast, in-memory, gone on restart |
| `checkpointed` | state you want mostly-durable but write-hot (presence, large boards) |
| `durable` | anything an invariant protects, and final results |

A **`rollingSum` per-player rate cap requires `durable`** even in an otherwise
ephemeral game — so the intent/input collection that carries the cap is durable
while the rest of the room is ephemeral. This is the one tier subtlety to get
right.

## Sessions — rooms with a server loop

A `session` block turns a top-level `collection/$var` template into a room with a
server-driven loop and automatic settlement. It is only valid on an `ephemeral`
or `checkpointed` top-level template (never `durable`, never onchain).

```json
"rooms/$roomId": {
  "tier": "ephemeral",
  "fields": { "status": "String", "tick": "UInt" },
  "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
  "hooks": { "tick": { "advance": "@DocumentPlugin.updateField(\"rooms/system\", \"tick\", \"1\")" } },
  "session": {
    "checkpointSeconds": 5,
    "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 },
    "settleTo": "results/$roomId",
    "settleFrom": { "collection": "rooms/$roomId/scores/$playerId", "field": "points", "op": "sum", "as": "total" }
  }
}
```

| `session` key | Meaning | Constraints |
|---|---|---|
| `tick.everyMs` | loop period | 20–60000 ms |
| `tick.run` | the `hooks.tick.<name>` to fire each tick | must be declared |
| `tick.maxLifetimeSec` | hard cap on room lifetime | 1–86400 s |
| `checkpointSeconds` | snapshot cadence for state | 1–3600 s |
| `settleTo` | durable template scores fold into when the room ends | must match exactly one **durable** template outside the room subtree; may only use the room's own `$var` |
| `settleFrom` | where the settled value comes from | `{ collection (sub-collection of the room), field, op: "sum"\|"last", as? }` |
| `settleRule` | optional expression gating settlement | non-empty string |

The flow: clients send **intents**; the `tick` hook reads intents and advances
state; on end, `settleFrom` aggregates a per-player field and `settleTo` writes the
durable result. State the players see is whatever the tick projects — never what a
client writes.

> **A live tick can call out to a function.** A native `session.live` tick is
> pure/egress-disabled, but it can `return { state, call: { fn, args, as } }` to
> invoke a whitelisted Bounded function — the result re-enters a later tick as an
> `@effect` intent. That is how a tick reaches AI NPCs, settlement, and external
> calls. The optional field is **`as`** (a player id), never `onBehalfOf` — but
> `as` only gates the facet's same-tick check today; it does **not** make the call
> act as that player (per-player acting is roadmap). The primitive lives in
> [live-runtime.md](live-runtime.md);
> NPC/settlement patterns are in [ai-npcs.md](ai-npcs.md).

## Server-authoritative state (no forged ticks)

Game state lives in collections **no external writer can update**:

```json
"rooms/$roomId": {
  "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" }
}
```

`update: "false"` and `delete: "false"` mean there is no write path for a forged
tick — only the privileged `hooks.tick` advances state, and a hook can't break any
invariant. Clients never write state directly; they write **intents** to a separate
collection.

## Intents + proven rate caps

Players write intents; a `rollingSum` with `scopeVariable` proves a per-player
ceiling per window. The cap forces the intent collection to `durable`.

```json
"rooms/$roomId/intents/$intentId": {
  "tier": "durable",
  "fields": { "player": "String", "kind": "String", "weight": "UInt" },
  "rules": {
    "read": "false",
    "create": "@user.id != null && @newData.player == @user.id",
    "update": "false",
    "delete": "false"
  },
  "invariants": [
    { "type": "rollingSum", "name": "input_rate_cap",
      "field": "weight", "windowSeconds": 1, "limit": 20, "scopeVariable": "$roomId" }
  ]
}
```

An intent collection is append-only (the cap makes it so): each intent is a fresh
document, `update`/`delete` rejected, so the input log can't be rewritten. Use
`scopeVariable: "$roomId"` for per-room ceilings, or scope to a player path
variable for per-player.

## Fog-of-war via per-player view collections

Hidden information never reaches a client it can't see. The tick projects into
`view/$playerId` only what that player may see; the read rule ties the view to its
owner.

```json
"rooms/$roomId/view/$playerId": {
  "tier": "ephemeral",
  "fields": { "visibleJson": "String" },
  "rules": { "read": "@user.id != null && $playerId == @user.id", "create": "false", "update": "false", "delete": "false" }
}
```

Because other players' hands, fogged tiles, and hidden units are never written into
your `view`, patching the client cannot reveal them — there is nothing to reveal.
This is the structural cure for maphacks and wallhacks.

## The agar.io example (full)

A blob-eating arena: players send movement intents, the tick resolves collisions
and growth, each player sees only their neighborhood, inputs are rate-capped, and
final masses settle to a leaderboard. This is **worked example C** in
[policy-examples.md](policy-examples.md)
— `rooms/$roomId` (ephemeral, tick + session), `intents` (durable, rate cap),
`view/$playerId` (fog-of-war), `scores/$playerId` (settleFrom source), and a
durable `results/$resultId`. Read it there in full; it validates with zero
issues, every proof obligation discharges, and the only findings are the
intentional `"false"` server-authoritative rules.

## The honest anti-cheat boundary

Server authority + proofs shut down a large class of cheats structurally:

- **State manipulation** (teleport, set score/health) — no write path; `update:
  "false"` + tick-only advancement.
- **Maphacks / wallhacks** — fog-of-war views; hidden data never sent.
- **Macro / turbo-fire** — proven per-player `rollingSum` rate caps.
- **Forging what a player did** — append-only, owner-attributed intent log.

What **no backend can cure**: a script firing only *legal* inputs at *human*
timing but with superhuman accuracy. Every input is individually valid, so nothing
rejects it; the residual is a statistical/ML detection problem on legal inputs,
best fed by the tamper-proof input log via `webhooks`. Be explicit with users:
Bounded solves the structural part and gives the best substrate for the
statistical part — it does not "solve cheating." Full treatment:
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md).

## Related

- [live-runtime.md](live-runtime.md) — the **native** `session.live` runtime (3 pure fns, no deploy) for any realtime room; the tick `call` primitive lives here
- [ai-npcs.md](ai-npcs.md) — a tick that `call`s a function = an AI NPC / in-game settlement
- [policy-examples.md](policy-examples.md) — worked example C, end to end
- [sdk-reference.md](sdk-reference.md) — `subscribe` and `SubscribeOptions`
- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — `hooks.tick`, `enforceRules`
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — the trust boundary in depth
- [invariants.md](invariants.md) — `rollingSum` + `scopeVariable` for per-player caps
