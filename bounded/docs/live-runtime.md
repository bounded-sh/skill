# Live runtime — native server-authoritative realtime rooms (three pure functions)

**What's in here / when to read this:** the **native LIVE** runtime — the
server-authoritative loop for **any** realtime app (multiplayer games,
Figma-style collaborative editors, whiteboards, live dashboards, trading
screens). Upload a module exporting three pure functions (`init`/`tick`/`views`),
declare a `session.live` block, run `bounded live deploy`, and drive it from the
SDK. Bounded runs your code in an isolated room runtime, runs the tick ~30Hz
server-authoritatively, snapshots + checkpoints state, and fans per-client views
out live. You write the room logic — nothing else.

The primitive is called **live** because it serves any server-authoritative
realtime room, not just games — a Figma clone, a collaborative whiteboard, a
multiplayer cursor layer, or a live ops dashboard are all the same shape: clients
send intents, a server-authoritative `tick` advances one true state, and each
client sees only its own projection. Games (Pong below) are one example of that
shape, not the whole of it.

> **Two tick runtimes — pick one.** A session can run **either** a bytecode
> `session.tick` (a `hooks.tick.<name>` reducer + `settleFrom`/`settleTo`
> settlement — see [realtime-and-games.md](realtime-and-games.md)) **or** a
> native `session.live` (this doc). They are **mutually exclusive** on one
> session; the validator rejects a session that declares both. Use bytecode
> `tick` for simple counters/timers expressible in policy; use native `live` when
> the loop is real logic (collisions, scoring, fog-of-war, CRDT-ish merges,
> cursor presence, layout state) you'd rather write in TypeScript.

This is the imperative sibling of [functions.md](functions.md): code you upload
with an honest proof boundary. The difference is *where* the code runs — a
function runs once per call; a live room runs continuously for the room.

## The four-artifact DX

A complete native live room is **four artifacts** and no infrastructure:

| Artifact | Where it lives | Who runs it |
|---|---|---|
| 1. The live module (3 pure fns) | `pong.live.ts` (your repo) | Bounded, inside the room runtime, ~30Hz |
| 2. The `session.live` policy block | `policy.json` on a `rooms/$roomId` template | verify/deploy + runtime enforcement |
| 3. `bounded live deploy <module>.live.ts` | deployed live module | you, once per code change |
| 4. The SDK client (subscribe + intents) | your web/RN/server app | each client's device |

**Artifact 1 — the module.** It exports **exactly three** pure functions and
nothing else (no timers, sockets, snapshot code, or deploy logic). Quoting the
contract from the top of `pong.live.ts`:

```ts
//   1. init(seed)               -> initial state           (optional)
//   2. tick(state, intents, dt, ctx) -> next state         (required; server-authoritative)
//      ctx = { presence: userId[], tick } — who's connected (4th arg, optional to read)
//   3. views(state)             -> { [userId]: view }      (optional; per-client visibility)
//
// `intents` is the list of client inputs received since the last tick:
//   [{ userId, intent }, ...]   — Bounded orders them; you decide what they mean.
```

- `init(seed): State` — **optional.** The initial state when the room starts.
  `seed.room` is the room's OWN creation document — whatever the room creator set
  when they created `rooms/<roomId>` (e.g. `set("rooms/r1", { createdBy, name, mode:
  "ranked", mapSeed: 42 })`). So `init` can read the room's match config
  deterministically at boot: `init(seed) { return { mode: seed?.room?.mode, ... } }`.
  This runs ONCE at cold start (replays use the snapshot, never re-run `init`), so
  it never affects tick determinism. The live module itself has no direct data
  access; Bounded provides the seed, keeping `tick`/`views` pure.
- `tick(state, intents, dtMs, ctx): State` — **required, server-authoritative.**
  `intents` is `[{ userId, intent }, ...]` ordered by Bounded; return the next
  state. This is the only thing that advances the room. (`userId` is the sender's
  universal `@user.id` — present for every authenticated client, wallet or
  email/social login alike.) The optional **4th arg** `ctx = { presence, tick }`
  gives the set of currently-connected `userId`s — use `ctx.presence` to evict
  players who disconnected (see [Reconnection & presence](#reconnection--presence-drops-rejoins-leaves)).
- `views(state): Record<userId, View>` — **optional.** Maps each client's
  universal `@user.id` to *what that client may see*. Bounded fans each entry out
  to that user's view collection.

> **TypeScript is fine — types are stripped at upload.** `bounded live deploy`
> transpiles the `.ts` source (strips annotations like `intents: any[]`, `x as Foo`,
> `: State`) before storing it, so the room runtime loads clean JS. Write the three
> functions in TS or JS; both work. (Keep it to type-stripping syntax — no path
> imports of other files; the module is a single self-contained file.)
>
> **Returning a rich/nested view?** Declare the view doc as a single
> `"stateJson": "String"` field and return `out[addr] = { stateJson: JSON.stringify(view) }`,
> then `JSON.parse` it on the client. Per-player views are typically nested
> (arrays of entities, etc.) and don't map onto flat typed fields; the `stateJson`
> envelope ships them unchanged.

For a game these are the game loop; for a Figma-style editor they are the
canonical document + each editor's cursor/selection projection; for a dashboard
they are the ingest reducer + each viewer's permitted slice. Same three
functions, any realtime app.

Bounded runs the module for each room, drives `tick` on the declared cadence,
keeps the room state alive across normal runtime churn, and checkpoints
authoritative state through your declared invariants. You write the room logic,
not the hosting plumbing.

**Artifact 2 — the policy block** (see the full field table below):

```json
"rooms/$roomId": {
  "tier": "checkpointed",
  "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800,
                         "snapshotEveryTicks": 30 } }
}
```

**Artifact 3 — deploy** uploads the module source and makes it available to
rooms that reference its module name:

```sh
bounded live deploy pong.live.ts --app-id <id>
```

**Artifact 4 — the SDK client** subscribes to its own per-client view and posts
intents (worked example at the end).

## The `session.live` policy block

`session.live` is a sibling of `session.tick` under a session block. Fields:

| Field | Type / rule | Meaning |
|---|---|---|
| `module` | **Required.** Bare identifier `/^[a-zA-Z][a-zA-Z0-9_]*$/` | Name that resolves to the live module you uploaded. Not the source itself — the policy only declares the binding. |
| `everyMs` | **Required.** Integer, `20`–`60000` | Native tick cadence (ms). ~33 ≈ 30Hz. |
| `maxLifetimeSec` | **Required.** Integer, `1`–`86400` | Hard lifetime cap; the room is torn down at this age regardless of state. |
| `snapshotEveryTicks` | Optional. Integer, `1`–`600` | Snapshot room state every N ticks. Default: derived from the checkpoint cadence. |
| `secrets` | Not supported for live modules. | Need an API key in live/game code? Call a [function](functions.md) or [backend-runtime](backend-runtime.md) component where secrets are supported. |

**Two hard placement rules:**

1. **`tick` and `live` are mutually exclusive** on a session — one drives the
   loop. Declaring both is a validation error.
2. **`session.live` is valid only on an `ephemeral` or `checkpointed` top-level
   template** — never `durable`, never onchain (same constraint as `session.tick`).

The validated declaration (room + per-client view + invariants):

```json
{
  "rooms/$roomId": {
    "tier": "checkpointed",
    "fields": { "status": "String", "tick": "UInt" },
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800, "snapshotEveryTicks": 30 } }
  },
  "rooms/$roomId/view/$userId": {
    "tier": "ephemeral",
    "fields": { "stateJson": "String" },
    "rules": { "read": "$userId == @user.id", "create": "false", "update": "false", "delete": "false" }
  },
  "invariants": ["score.values <= 11", "paddleY.values >= 0 && paddleY.values <= 90"]
}
```

`update: "false"` + `delete: "false"` on the room means there is no client write
path into room state — only the native `tick` advances it.

## Tiers: ephemeral (live) vs checkpointed (provable)

The room template's `tier` decides what survives:

| Layer | Tier | Durability | Who writes |
|---|---|---|---|
| Room state | `ephemeral` | live runtime state; not persisted as a provable data record | native `tick` only |
| Room state | `checkpointed` | folded **through invariants** into the provable store on the checkpoint cadence — survives + is provable/replayable | native `tick`, then the checkpoint |
| `view/$userId` | **always `ephemeral`** | a live projection, never source of truth | `views(state)` fan-out |

Two **distinct** persistence mechanisms, do not conflate them:

- **Snapshot** = the live runtime saves room state every `snapshotEveryTicks`
  ticks. Purpose: survive routine runtime churn and limit replay loss. Not a
  proof artifact and not a normal collection document.
- **Checkpoint** = on the checkpoint cadence, the **authoritative** state is
  folded **through your declared invariants** into the **provable data store**.
  Purpose: durability + replayability + proof. Only happens on `checkpointed`.

`ephemeral` = live fan-out only (snapshots bound replay loss, nothing is
provable). `checkpointed` = the authoritative state becomes provable on every
checkpoint. The per-client `view/$userId` is **always ephemeral** because it is a
projection — the source of truth is the room, not the view.

## Per-client view read-rules (structural fog-of-war)

`rooms/$roomId/view/$userId` is `ephemeral` with read rule `$userId ==
@user.id`. The keys of the map returned by `views(state)` are **universal user
ids** (`@user.id`, always present for an authenticated client — wallet or
email/social); Bounded fans each key out to that user's view collection. The read
rule then guarantees a client can only ever subscribe to **its own** view — there
is no delivery path for anyone else's.

```json
"rooms/$roomId/view/$userId": {
  "tier": "ephemeral",
  "rules": { "read": "$userId == @user.id", "create": "false", "update": "false", "delete": "false" }
}
```

This is the structural cure for maphacks/wallhacks (games) and for leaking
private layers/selections in a collaborative editor: **hidden information is never
written to a view it doesn't belong to**, so patching the client reveals nothing
— there is nothing to reveal. In `views(state)`, only put in `out[userId]` what
`userId` is allowed to see.

**The `*` spectator key.** Pong writes a wildcard `out["*"]` entry with the full
board. That is appropriate **only** for symmetric / no-hidden-information rooms
(everyone already sees everything — e.g. Pong, or a fully public dashboard). For
a **fog-of-war** game (hidden hands, fogged map, hidden units) or any room with
**private per-client state** (a Figma file with restricted layers, a dashboard
with per-tenant rows) **omit `*`** — a spectator key would leak exactly the
hidden state the per-client views exist to protect.

## Invariants as anti-cheat / integrity guards

Your declared `invariants` (e.g. `score.values <= 11`, `paddleY.values >= 0 &&
paddleY.values <= 90`) are enforced on the **authoritative checkpointed state**
every checkpoint. The native `tick` **cannot** produce a checkpoint that violates
them — a violating fold is rejected and fails closed, exactly like every other
write path in Bounded. So even your own room code can't checkpoint an impossible
score (game) or an out-of-bounds value (any app).

**Three control surfaces, three different rules — keep them straight:**

| Surface | Rule | Governs |
|---|---|---|
| Who may **ACT** | `session.intentRule` | which clients may send intents; absent means intents are denied |
| Who may **SEE** | the per-collection **read rule** | reading a doc + subscribing to the per-player view (`$userId == @user.id`) |
| What the **STATE** may be | **invariants** | postconditions on the **authoritative** state — enforced on every durable write **and at the checkpoint** |

Invariants are postconditions on the **authoritative / checkpointed** state, *not* on
the ephemeral view. The per-player view is the ~30Hz display **projection** of state
that is *already* invariant-gated at the checkpoint; it is governed by the **read
rule** (visibility), not by invariants. **So declare an invariant on the authoritative
collection (the room / durable state) — never on a `.../view/$x` subcollection** (a
bound on a view doc would not be enforced; the view is a projection, not a source of
truth). The intent rule decides who acts, the read rule decides who sees, invariants
decide what the persisted state may be.

The three runtime roles stay clean:

- **intents** are the only client write path, and they are **server-ordered** by
  Bounded.
- **`tick`** is **server-authoritative** — clients never write state, only intents.
- **`views`** are **read-only projections** — a client reads its view, never writes it.

What this structurally cures (same boundary as
[realtime-and-games.md](realtime-and-games.md#the-honest-anti-cheat-boundary)):

- **State manipulation** (teleport, set score; or in an editor, overwrite a doc
  field you don't own) — no client write path; `tick`-only.
- **Maphacks / wallhacks / private-layer leaks** — per-client views; hidden data never sent.
- **Forged ticks** — only the live runtime's native `tick` advances state.
- **Macro / turbo-fire / write floods** — pair the room with a `rollingSum`-capped
  intent collection (the rate-cap pattern in
  [realtime-and-games.md](realtime-and-games.md#intents--proven-rate-caps)).

What **no backend cures**: a script firing only *legal* intents at *human* timing
but with superhuman accuracy. Each intent is individually valid, so nothing
rejects it; the residual is a statistical/ML problem on legal inputs, best fed by
the tamper-proof, server-ordered intent log via `webhooks`. Be explicit with
users: Bounded solves the **structural** part and gives the best substrate for
the statistical part — it does **not** "solve cheating."

## Data in a game (the three paths)

A game reaches durable data **three** ways — know which is which:

- **(a) tick → `call` → a function using `ctx.bounded` (server-authoritative).** The
  only way the *tick* writes durable state. The tick returns `{ state, call: { fn, args } }`,
  the called function does the durable write / settlement / onchain submit with
  `ctx.bounded`, and the result re-enters a later tick as an `@effect` intent. Give it a
  funded identity with `session.live.runAs` and gate it with `@origin.kind == 'live'` (see
  [ai-npcs.md](ai-npcs.md), [principals-and-origins.md](principals-and-origins.md)). This is
  the value that *can't* be forged — it comes from server-authoritative room
  state, not a client.
- **(b) the player's client → normal SDK `get`/`set`/`subscribe`.** The ordinary data
  plane, rule-enforced per `@user`. Use it for everything the player owns/reads directly
  (profile, lobby, inventory).
- **(c) the tick CANNOT read durable state synchronously.** `tick` is pure and
  egress-disabled — no `get`, no `fetch`. To read durable data, round-trip via
  **`call` → a function → `@effect`** on a *later* tick. For data the room needs at boot,
  **seed it statically** through `init(seed)` (the room's `rooms/<id>` doc) instead.

## Calling out from a tick (the `call` primitive)

`tick` is **pure, synchronous, and egress-disabled** — it can't `fetch`, can't read
the data plane, can't sign a tx. To reach the outside world it returns a **call**
alongside the next state instead of a bare `return state`:

```ts
// inside tick(state, intents, dt):
return { state, call: { fn: "npcBrain", args: { board: state.board } } };
//                                ^ optional `as: state.currentPlayer` is a validation hint, not an identity override.
// or several at once:
return { state, calls: [ { fn: "npcBrain", args: {...} }, { fn: "settleMatch", args: {...} } ] };
```

A bare `return state` is unchanged — adding a `call` is the only opt-in. The
optional field is **`as`** (a player id), and it is a validation hint rather than
an identity override. The called function still runs under the identity configured
for the session or function. Omit `as` for a call with no player-specific check.

**What `call` runs.** `fn` must be a function name in the owner-declared whitelist
**`session.live.calls`**, and the called function's own `auth` rule **is** evaluated for
the call. The called function is an ordinary Bounded [function](functions.md): it has an
`entry`, can use `ctx.bounded`, `ctx.ai`, secrets, `actAs`, and now `ctx.origin`.

**Authorization (`@origin`) and identity (`runAs`/`actAs`) are separate:**

- **`@origin` — where the call came from.** Live calls carry a platform-set
  `@origin` that client code cannot spoof. A function gates "**only my game's
  live tick may call me**" with its own `auth` rule:

  ```json
  "functions": {
    "npcBrain": { "entry": "functions/npcBrain.ts", "auth": "@origin.kind == 'live' && @origin.module == 'arena'" }
  }
  ```

  `@origin` is offchain-only (forbidden in `onchain:true` rules, like `@user.id`) and is a
  first-class proof-engine special var, so `bounded verify` earns the obligation. Because
  `@origin.module`/`room`/`tick` are null for a non-live call, a rule gating on them should
  also require `@origin.kind == 'live'`. Inside the function body, `ctx.origin` is
  `{ kind, path, module, room, tick }` (or null). See
  [principals-and-origins.md](principals-and-origins.md).

- **`session.live.runAs` — who the call acts as (identity, now REAL).** Declare a service
  wallet **once** on the session's `live` block and **all** of this game's live calls run
  as it — it can bill AI (capped at the app account) and own offchain writes. Owner-declaring
  it IS the authorization to act as it. This is the simple, mature way to fund AI NPCs.
  Precedence: **function `actAs` > session `runAs` > anonymous system.** See
  [ai-npcs.md](ai-npcs.md) for the funded-NPC recipe.

```json
"rooms/$roomId": {
  "tier": "checkpointed",
  "session": {
    "live": {
      "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800,
      "calls": ["npcBrain", "settleMatch"]
    }
  }
}
```

**How the result comes back — the `@effect` address.** The call runs outside the
tick loop. Bounded records the requested call with the state advance, runs the
function, and feeds the result into a **later** tick as a recorded intent on the
reserved **`@effect`** address.
Your tick reads it by matching `address === "@effect"` and the `effectId` it emitted:

```ts
function tick(state, intents, dt) {
  // 1) read any effect results that came back
  for (const i of intents) {
    if (i.address === "@effect" && i.intent?.__effect) {
      const { effectId, ok, result, error } = i.intent;
      if (ok && state.pending[effectId]) {
        state.npcMove = result.move;            // consume the function's reply
        delete state.pending[effectId];         // dedup: don't act on it twice
      }
    }
  }
  // 2) maybe emit a new call (track its ref so you can match the reply)
  if (needsNpcMove(state) && !state.pending.npc1) {
    state.pending.npc1 = true;
    return { state, call: { fn: "npcBrain", args: { board: state.board } } };
  }
  return state;
}
```

**Security guarantee — effect results are platform-generated.** A client live
intent may **never** carry the reserved **`@effect`** address **or** the
**`__effect`** discriminator; either is rejected before it reaches the tick. So a
client cannot inject a fake result or impersonate the effect channel.

**Effect behavior to build around:**

- **The acting identity follows precedence: function `actAs` > session `runAs` > anonymous
  system.** With neither declared, the call runs as the anonymous SYSTEM principal — inside
  the called function `ctx.user` is `{ id: null, address: null, email: null, system: true }`,
  which **cannot** bill AI (no account → `402`). Declare `session.live.runAs` (or a
  per-function `actAs`) to give the call a funded identity. See
  [principals-and-origins.md](principals-and-origins.md).
- **To fund an AI NPC, declare `session.live.runAs`.** Point it at a service wallet the
  owner funds with AI/external-services credit, then `ctx.ai` in any whitelisted live-call function Just
  Works (capped at the app account). Gate that function with
  `auth: "@origin.kind == 'live' && @origin.module == '<yourGame>'"` so only your game's
  tick can call it. (A per-function `actAs` still works for a one-off and wins over
  `runAs`.) Neither needs a private key for AI/data — only onchain signing needs a key. See
  [ai-npcs.md](ai-npcs.md).
- **Effects run on the checkpoint cadence, not per-tick.** Replies land after a short
  delay (the next checkpoint window), not on the very next frame. Don't block the loop on
  an effect; keep ticking and consume the reply when it arrives.
- **Dedup in your app logic.** Treat effect replies as at-least-once and dedup on
  `effectId` in the tick and in any side-effecting function.

## Recording the result (per-room: authoritative today, read it through the view)

The native runtime is server-authoritative for everything *inside* a room. A
native tick cannot **directly** write a durable collection or trigger settlement
— but it **can `call` a function that does** (see
[the `call` primitive](#calling-out-from-a-tick-the-call-primitive) below): a tick
returns `{ state, call: { fn, args, as } }`, the called function does the durable
write / settlement / onchain submit, and the result re-enters a later tick as an
`@effect` intent. So the live room does not persist the outcome directly; it
persists by calling an authorized function. That shapes how you persist the
outcome, and there is one forgeable trap to avoid.

**The forgeable trap — do NOT record results with a client-written collection:**

```json
"matches/$matchId": {
  "tier": "durable",
  "rules": { "create": "@user.address != null && @newData.winner == @user.address" }
}
```

This is **forgeable**. The rule only checks that the caller *names themselves* the
winner — it has no link to the server-authoritative outcome. So
any authenticated user (the player who just lost, or someone who never joined) can
write a record claiming they won. (Verified by dogfooding: a fresh keypair that
joined no room wrote a winning `matches` record for a non-existent room — the rule
passed.) `winner == @user.address` is self-report, not authority.

**Per-room result — authoritative today, read it through the VIEW.** The winner the
`tick` writes into state is server-decided — no client wrote it (the room is
`update:"false"`), so it can't be forged. Clients learn the result the same way they
learn everything else live: from **their view** (`live.subscribeView`). Just include
the outcome in what `views(state)` projects (e.g. `winner`, `phase:"over"`), and the
view stream delivers it. (Validated by dogfooding: a server-decided winner — the first
joiner — arrived in both players' views as `winner=<P1> phase=over`; the player who
*wanted* to win saw the real winner, not themselves.)

> **Do not read live room state with plain `get()`/`subscribe()` on the room doc.**
> Live room state is exposed through `live.subscribeView`. A plain data
> subscription is for normal collection data and will not stream the live room's
> per-client view.

Use `checkpointed` (not `ephemeral`) when you want that authoritative state **fold-gated
by your invariants** every checkpoint (the anti-cheat proof boundary) and surviving
runtime churn — but note `checkpointed` changes *durability/provability of the
state*, **not** how you read it: still the view, never `get()`.

**Cross-room leaderboard — two paths.** Folding each room's result into a shared
durable leaderboard or `matches` collection is **settlement**. For native live
rooms, prefer a tick-called settle function; do not rely on client-provided
settlement data.

The path that **does** work today: have the tick **`call` a settle function** with the
server-decided result (`return { state, call: { fn: "settleMatch", args: { winner } } }`).
The function runs server-side and writes the shared durable collection — the
value comes from server-authoritative room state, not a client. Give that
function a funded, attributable identity with
`session.live.runAs` (or a per-function `actAs`), then write the settle collection's rules
to trust that service write, not a client `winner == @user.address`; gate the function's own
`auth` with `@origin.kind == 'live' && @origin.module == '<yourGame>'` so only your tick can
call it (see [principals-and-origins.md](principals-and-origins.md)). For onchain settlement
the same function holds the signing capability via `actAs` / a key ([onchain.md](onchain.md)).
The `call`-a-function path is the native-live settlement path to use.

So today: authoritative **per-room** result → project it in `views(state)` and read it
via `subscribeView` (`checkpointed` if you want it invariant-gated + eviction-durable).
Authoritative **cross-room** settlement → either the declarative `session.tick` runtime
(its `settleFrom` is server-computed from a tick-written sub-collection,
[realtime-and-games.md](realtime-and-games.md#sessions--rooms-with-a-server-loop)), or
**`call` a settle function** from the native tick (above).

## Listing rooms (the lobby / discovery)

Live session rooms are not a listable lobby by themselves. Do not build a lobby
by querying the live room collection; use a separate durable index collection for
discovery. Invite-link games can skip discovery and share the room id directly.

For a browsable lobby, use a **separate durable index collection** that clients can list
and subscribe normally:

```json
"lobby/$roomId": {
  "tier": "durable",
  "fields": { "host": "Address", "name": "String", "status": "String", "createdAt": "UInt" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && @newData.host == @user.address",
    "update": "@user.address != null && @data.host == @user.address && @newData.host == @data.host && @newData.createdAt == @data.createdAt",
    "delete": "@user.address != null && @data.host == @user.address"
  }
}
```

When the host creates a room, it also writes `lobby/<id>`. Clients browse with
`get("lobby", { sort: { createdAt: "desc" } })` and get **live** updates via
`subscribe("lobby", { onData })`. Both validated by dogfooding: a new `status:"open"`
room reached a subscriber in ~200ms, and an `open → playing` update streamed through.

> **Lobby status is a discovery hint.** The host client can mirror its own view's
> `phase` into the lobby `status`, but if the host drops, the entry can go stale.
> Mitigate with a scheduled hook or one-shot expiry that removes old entries.
> Treat the room's own live view as ground truth.

Two rule gotchas the verifier will (correctly) flag if you omit them: pin **both**
`host` and `createdAt` immutable on `update` (`@newData.x == @data.x`) — otherwise the
host can rewrite ownership or backdate the entry, and verify `[FAIL]`s
field-immutability. The public `read: "true"` is fine for an open lobby (verify reports
it as an intentional public-read advisory, not a failure).

## Reconnection & presence (drops, rejoins, leaves)

**Reconnect just works — players are keyed by their stable user id/principal.** A
client that drops (tab close, network blip) and comes back simply calls
`subscribeView` again with the same identity; the stream resumes mid-match.
Validated by dogfooding: a player
dropped its view for 6s and reconnected into the **same slot**, fighter + HP intact,
with the match having advanced server-side the entire time (the server is authoritative
— it never pauses for one client). No re-join is required to resume.

**Guard `join` by principal, or a reconnecting re-join duplicates the player.** If
your reconnect flow re-sends `join`, the tick must treat a join from a principal
already in the room as idempotent:

```js
if (intent.type === "join") {
  const playerId = address;                      // intent principal/user id
  if (!state.players[playerId]) {
    state.players[playerId] = freshPlayer(...);  // new player → assign a slot
  } else {
    state.players[playerId].name = intent.name;  // returning player → keep slot/HP
  }
}
```

Without the `if (!state.players[playerId])` guard, a re-join grabs a second slot
(or clobbers live state) — a self-inflicted bug, not a runtime one.

**The tick gets a live presence set — drop inactive players with it.** `tick` receives an
optional **4th argument** `ctx` carrying the principals currently connected to the
room:

```js
//   tick(state, intents, dtMs, ctx)
//   ctx = { presence: string[], tick: number }
//   ctx.presence = the @user.id (or wallet address) of every OPEN connection,
//                  keyed identically to an intent's `address`.

export function tick(state, intents, dtMs, ctx) {
  const present = new Set(ctx?.presence ?? []);
  for (const id of Object.keys(state.players)) {
    if (!present.has(id)) delete state.players[id];   // someone left → free the slot
  }
  // ... advance the sim ...
  return state;
}
```

This is event-driven: the runtime updates the set when a connection opens or
closes, so your tick does not need to poll for presence.
A player who closes their tab drops out of `ctx.presence` and your reducer evicts
them on the **next tick** (~instantly). The 4th arg is additive — existing 3-arg
reducers are unchanged.

> **`ctx.presence` is "has an open socket," not "is actively playing."** For a clean
> tab-close it's instant. A hard crash / network partition where no close frame is
> sent clears within Bounded's connection keepalive window (seconds). If you want a
> *tighter* idle/zombie timeout than that, layer your own `lastSeen` on top (stamp it
> on each intent or a `ping`) — but you no longer need it just to handle disconnects.

## Deploy + run lifecycle

```sh
bounded live deploy pong.live.ts --app-id <id>   # upload source; prints a version

# Drive (or cold-start) a room from the CLI — queues an intent for the next tick
# AND arms the loop if it isn't running. The CLI equivalent of bounded.live.intent.
bounded live intent rooms/r1 --app-id <id> --intent '{"type":"join","name":"alice"}'
bounded live status rooms/r1                     # uses bounded.json appId by default
```

Deploy uploads the module source and prints a version identifier. If a room
references a module that has not been uploaded yet, status reports that the room
has not started rather than silently running missing code.

Clients address a room **by path** through the SDK. Do not invent routing
headers or routing details.

| Route | Addressed by | Auth | Returns |
|---|---|---|---|
| `GET /live/status` | `?path=<sessionCollection>/<roomId>` | none | `{ available, started, running, tick, module, etag, stopReason, generation, connections, lastTickAt, nextAlarmAt }` |
| `POST /live/intent` | `body.path` | **required** | `{ ok: true }` |

Drive intents from anywhere: the browser SDK (`bounded.live.intent(roomPath, intent)`),
a server with `@bounded-sh/server`, or the **CLI** — `bounded live intent <roomPath>
--app-id <id> --intent '<json>'` (great for cold-starting a room, scripts, and tests).
Use `bounded live status <roomPath>` (or pass `--app-id <id>` to override
`bounded.json`) or `live.status(roomPath)` when
debugging liveness: parked rooms report `running:false` plus `stopReason`,
`generation`, loaded `etag`, open `connections`, and alarm/tick timestamps.
`live.intent` and `live.subscribeView` re-arm a parked room; a terminal stopped
room (`lifetime`/`manual`) cold-starts a fresh generation on the next intent.

### Cold starts and keep-warm

A dormant live room has to start the module and deliver the first view. That
first view can take a couple of seconds; show a real "starting arena" /
"joining room" state instead of treating it as a broken subscription. Once warm,
the view stream is paced at the live tick cadence.

If you need public arenas to stay warm, send an idempotent low-cost live intent
such as `{ "type": "ping" }` before the room goes idle. Do not rely on one
player's client as the only warmer for shared public rooms.

## SDK client — worked example

Two pieces: **subscribe** to your own per-client view for live state, and **send
an intent** to influence the room. Both are first-class helpers under the
`live` namespace now — use them; they handle auth, room routing, and the view
path for you.

```ts
import { live } from "@bounded-sh/client";

const roomPath = `rooms/r1`;                 // the session collection + room id

// 1. Live state — subscribe to YOUR view. `live.subscribeView` builds the
  //    `<roomPath>/view/<myUserId>` path and handles routing for you. The read
  //    rule `$userId == @user.id` means this only ever resolves to your
  //    projection (no hidden state).
const stop = await live.subscribeView(roomPath, {
  onData: (view) => buffer.push(view),       // buffer — do NOT render directly
  onError: (e) => console.error(e),
});

// 2. Send an intent. Address the room BY PATH; the SDK/session supplies your
//    universal user id (`@user.id`). Returns { ok: true }.
await live.intent(roomPath, { type: "join" });
await live.intent(roomPath, { type: "move", dir: -1 });

// later: await stop();
```

> **Game feel: never render straight from `onData`.** Views arrive at the tick
> cadence with network jitter; rendering each message as it lands looks jerky
> and rubber-bands the local player. Buffer views and render on your own
> `requestAnimationFrame` loop: interpolate REMOTE entities ~100-180ms in the
> past, and predict the LOCAL player from input with input-replay
> reconciliation (echo an `ackInputSeq` from your `views()`). The full playbook
> with code is [realtime-netcode.md](realtime-netcode.md); a complete reference
> client is the Bounded Arena demo (`arena.bounded.page`).

> **Agent players from Node:** `WalletClient.live.subscribeView(roomPath, { onData })`
> (in `@bounded-sh/server`) streams the wallet's own view under its keypair
> session — pair with `WalletClient.live.intent` for a fully headless player.

> **Routing is the SDK's job, not yours.** Always subscribe to live views through
> `live.subscribeView` (or `subscribeLiveView`). Do not manually construct
> routing details.
>
> **`init` with a network preset** — no endpoint URLs in app code:
> `await init({ appId })`.
> For a zero-friction guest identity (great for invite links), call
> `signInAnonymously()` — a device-local keypair signs in with no wallet and no
> signup (requires `"auth": { "anonymous": true }` in policy).

Status/liveness is first-class in the SDK and CLI:
`await live.status(roomPath)` or `bounded live status <roomPath>`
returns `{ available, started, running, tick, module, etag, stopReason,
generation, connections, lastTickAt, nextAlarmAt }`.

The per-client view read rule is what makes the subscribe line safe by
construction: it can only ever resolve to *your* view, so you cannot subscribe
your way into another client's hidden state. (The SDK surface for this primitive
ships today in `@bounded-sh/client`: `live.intent` for sending and
`live.subscribeView` as the typed per-view subscribe helper — use them, as in the
example above; no raw `subscribe` + `fetch` needed.)

## Related

- [realtime-and-games.md](realtime-and-games.md) — subscriptions + the **bytecode** `session.tick` model (the other tick runtime)
- [invariants.md](invariants.md) — the postconditions enforced on every checkpoint
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — the honest trust boundary in depth
- [policy-reference.md](policy-reference.md) — `tier` + read-rule expression language
- [sdk-reference.md](sdk-reference.md) — `subscribe`, `getIdToken`
- [functions.md](functions.md) — the sibling code-upload model (secrets + proof boundary)
- [principals-and-origins.md](principals-and-origins.md) — `@origin` (who may call) + the three principals & precedence (`actAs` > `runAs` > system)
- [ai-npcs.md](ai-npcs.md) — the tick `call`s a function = an NPC; funding an LLM NPC with `session.live.runAs`
- [onchain.md](onchain.md) — onchain settlement from a live room
