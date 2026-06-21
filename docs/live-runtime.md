# Live runtime — native server-authoritative realtime rooms (three pure functions)

**What's in here / when to read this:** the **native LIVE** runtime — the
server-authoritative loop for **any** realtime app (multiplayer games,
Figma-style collaborative editors, whiteboards, live dashboards, trading
screens). Upload a module exporting three pure functions (`init`/`tick`/`views`),
declare a `session.live` block, run `bounded live deploy`, and drive it from the
SDK. Bounded loads your code into an isolated facet, runs the tick ~30Hz
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
(not deploy), loaded into an isolate, with an honest proof boundary. The
difference is *where* the code runs — a function runs once per call; a live room
runs continuously inside the room.

> **Availability — STAGING-ONLY today.** The native live runtime (Worker-Loader
> facets) is bound on **staging only**; it is not yet enabled in production. The
> client SDK **data plane** (`get`/`set`/`subscribe`) works in prod — only the
> native `session.live` rooms are staging-gated for now.

## The four-artifact DX

A complete native live room is **four artifacts** and no infrastructure:

| Artifact | Where it lives | Who runs it |
|---|---|---|
| 1. The live module (3 pure fns) | `pong.live.ts` (your repo) | Bounded, inside the room's isolated facet, ~30Hz |
| 2. The `session.live` policy block | `policy.json` on a `rooms/$roomId` template | the prover (deploy) + the room DO (runtime) |
| 3. `bounded live deploy <module>.live.ts` | the R2 code registry | you, once per code change (no worker redeploy) |
| 4. The SDK client (subscribe + intents) | your web/RN/server app | each client's device |

**Artifact 1 — the module.** It exports **exactly three** pure functions and
nothing else (no DOs, no `setTimeout`, no WebSocket, no snapshot code, no
deploy). Quoting the contract from the top of `pong.live.ts`:

```ts
//   1. init(seed)               -> initial state           (optional)
//   2. tick(state, intents, dt) -> next state              (required; server-authoritative)
//   3. views(state)             -> { [userId]: view }      (optional; per-client visibility)
//
// `intents` is the list of client inputs received since the last tick:
//   [{ userId, intent }, ...]   — Bounded orders them; you decide what they mean.
```

- `init(seed): State` — **optional.** The initial state when the room starts.
  `seed.room` is the room's OWN creation document — whatever the host set when
  they created `rooms/<roomId>` (e.g. `set("rooms/r1", { createdBy, name, mode:
  "ranked", mapSeed: 42 })`). So `init` can read the host's match config
  deterministically at boot: `init(seed) { return { mode: seed?.room?.mode, ... } }`.
  This runs ONCE at cold start (replays use the snapshot, never re-run `init`), so
  it never affects tick determinism. The facet itself has no data-plane access —
  the supervisor injects this seed, keeping `tick`/`views` pure.
- `tick(state, intents, dtMs): State` — **required, server-authoritative.**
  `intents` is `[{ userId, intent }, ...]` ordered by Bounded; return the next
  state. This is the only thing that advances the room. (`userId` is the sender's
  universal `@user.id` — present for every authenticated client, wallet or
  email/social login alike.)
- `views(state): Record<userId, View>` — **optional.** Maps each client's
  universal `@user.id` to *what that client may see*. Bounded fans each entry out
  to that user's view collection.

> **TypeScript is fine — types are stripped at upload.** `bounded live deploy`
> transpiles the `.ts` source (strips annotations like `intents: any[]`, `x as Foo`,
> `: State`) before storing it, so the facet loads clean JS. Write the three
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

Bounded loads this into a Cloudflare **Worker-Loader facet** inside the per-room
Durable Object, drives `tick` on a pinned timer, snapshots to the facet's SQLite
(eviction survival), and checkpoints the authoritative state through your
declared invariants. You never write any of that.

**Artifact 2 — the policy block** (see the full field table below):

```json
"rooms/$roomId": {
  "tier": "checkpointed",
  "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800,
                         "snapshotEveryTicks": 30 } }
}
```

**Artifact 3 — deploy** uploads the *source* to the code registry; the etag is
the version. No worker is redeployed:

```sh
bounded live deploy pong.live.ts --app-id <id>
```

**Artifact 4 — the SDK client** subscribes to its own per-client view and posts
intents (worked example at the end).

## The `session.live` policy block

`session.live` is a sibling of `session.tick` under a session block. Fields
(validated **exactly** as in the worker's `sessions.ts`):

| Field | Type / rule | Meaning |
|---|---|---|
| `module` | **Required.** Bare identifier `/^[a-zA-Z][a-zA-Z0-9_]*$/` | Name that resolves to your uploaded source in the code registry. Not the source itself — the policy only declares the binding. |
| `everyMs` | **Required.** Integer, `20`–`60000` | Native tick cadence (ms). ~33 ≈ 30Hz. |
| `maxLifetimeSec` | **Required.** Integer, `1`–`86400` | Hard lifetime cap; the room is torn down at this age regardless of state. |
| `snapshotEveryTicks` | Optional. Integer, `1`–`600` | Snapshot the facet's in-memory state to its own SQLite every N ticks. Bounds post-eviction reconcile loss. Default: derived from `checkpointSeconds / everyMs` (≈ one checkpoint window). |
| `secrets` | **Not supported yet — do not use.** | Reserved for future Mode-B (live/game) secret injection; **not wired** (declaring it is rejected at deploy — it would otherwise be `undefined` at runtime). Need an API key in live/game code today? Call out via a [function](functions.md) or a backend-runtime [agent](secrets.md), where secrets work. |

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
| Room state | `ephemeral` | in-memory; gone on eviction except for facet-SQLite snapshots | native `tick` only |
| Room state | `checkpointed` | folded **through invariants** into the provable store on the checkpoint cadence — survives + is provable/replayable | native `tick`, then the checkpoint |
| `view/$userId` | **always `ephemeral`** | a live projection, never source of truth | `views(state)` fan-out |

Two **distinct** persistence mechanisms, do not conflate them:

- **Snapshot** = the facet writes its in-memory state to its own SQLite every
  `snapshotEveryTicks` ticks. Purpose: survive **eviction** and reconcile with
  bounded loss (a few seconds of activity). Not provable, not in the data store.
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
| Who may **ACT** | `session.intentRule` | which clients may send intents (falls back to the read rule if absent) |
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
- **Forged ticks** — only the facet's native `tick` advances state.
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
  the value that *can't* be forged — it comes from facet memory, not a client.
- **(b) the player's client → normal SDK `get`/`set`/`subscribe`.** The ordinary data
  plane, rule-enforced per `@user`. Use it for everything the player owns/reads directly
  (profile, lobby, inventory). **This works in prod.**
- **(c) the tick CANNOT read durable state synchronously.** `tick` is pure and
  egress-disabled — no `get`, no `fetch`. To read durable data, round-trip via
  **`call` → a function → `@effect`** on a *later* tick. For data the room needs at boot,
  **seed it statically** through `init(seed)` (the host's `rooms/<id>` doc) instead.

> **Availability.** The native **live runtime** (paths a + c, Worker-Loader facets) is
> **staging-only** today. The **client SDK data plane** (path b) works in **prod**.

## Calling out from a tick (the `call` primitive)

`tick` is **pure, synchronous, and egress-disabled** — it can't `fetch`, can't read
the data plane, can't sign a tx. To reach the outside world it returns a **call**
alongside the next state instead of a bare `return state`:

```ts
// inside tick(state, intents, dt):
return { state, call: { fn: "npcBrain", args: { board: state.board } } };
//                                ^ optional `as: state.currentPlayer` only gates the same-tick check — it does NOT make the call act as that player (no-op on identity today)
// or several at once:
return { state, calls: [ { fn: "npcBrain", args: {...} }, { fn: "settleMatch", args: {...} } ] };
```

A bare `return state` is unchanged and fully back-compatible — adding a `call` is the
only opt-in. The optional field is **`as`** (a player id) — never `onBehalfOf`. **Today
`as` is NOT wired to identity:** it only gates the facet's same-tick check (a tick can't
name a player who didn't act this tick). A permitted `as` is a **no-op on identity** —
the call still acts as the session `runAs` / function `actAs` / anonymous system, never
as that player. Per-player acting is roadmap (cheap, non-breaking to add later). Omit
`as` for a call with no acting user.

**What `call` runs.** `fn` must be a function name in the owner-declared whitelist
**`session.live.calls`**, and the called function's own `auth` rule **is** evaluated for
the call. The called function is an ordinary Bounded [function](functions.md): it has an
`entry`, can use `ctx.bounded`, `ctx.ai`, secrets, `actAs`, and now `ctx.origin`.

**Authorization (`@origin`) and identity (`runAs`/`actAs`) are orthogonal — both are now
wired:**

- **`@origin` — who may call (authorization, now REAL).** Every dispatch carries an
  unforgeable, host-set `@origin` in scope of the function's `auth` rule. It is the same
  trust class as `@user` from a verified token — derived from the internal-secret-gated
  dispatch, never from a client. Fields: `@origin.kind` (always set: `'live'` for a game
  tick, `'user'` for a direct end-user/SDK call, plus `'scheduled'`/`'function'`/`'webhook'`),
  and `@origin.path` / `@origin.module` / `@origin.room` / `@origin.tick` (null when not
  applicable — e.g. all null for `kind:'user'`). A function gates "**only my game's live
  tick may call me**" with its own `auth` rule:

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

**How the result comes back — the `@effect` address.** The call runs *off the tick loop*:
the facet writes it into a durable outbox atomically with the state advance, the room
supervisor drains it **after the checkpoint alarm**, POSTs the function, and the result
re-enters a **later** tick as a recorded intent on the reserved **`@effect`** address.
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

**Security guarantee — effect results are host-only, forgery is foreclosed (ENFORCED).** A
client live intent may **never** carry the reserved **`@effect`** address **or** the
**`__effect`** discriminator — either is rejected (`403`) before it reaches the tick. Only
the host feeds effect results back in (the supervisor drains the outbox and re-injects on
`@effect` after the checkpoint). So a client cannot inject a fake result or impersonate the
effect channel; the only `@effect`/`__effect` intents your tick ever sees came from the
host, never from a player.

**SHIPPED truth — read this before you build on it:**

- **The acting identity follows precedence: function `actAs` > session `runAs` > anonymous
  system.** With neither declared, the call runs as the anonymous SYSTEM principal — inside
  the called function `ctx.user` is `{ id: null, address: null, email: null, system: true }`,
  which **cannot** bill AI (no account → `402`). Declare `session.live.runAs` (or a
  per-function `actAs`) to give the call a funded identity. See
  [principals-and-origins.md](principals-and-origins.md).
- **To fund an AI NPC, declare `session.live.runAs`.** Point it at a service wallet the
  owner funds with AI credit, then `ctx.ai` in any whitelisted live-call function Just
  Works (capped at the app account). Gate that function with
  `auth: "@origin.kind == 'live' && @origin.module == '<yourGame>'"` so only your game's
  tick can call it. (A per-function `actAs` still works for a one-off and wins over
  `runAs`.) Neither needs a private key for AI/data — only onchain signing needs a key. See
  [ai-npcs.md](ai-npcs.md).
- **Effects run on the checkpoint cadence, not per-tick.** Replies land after a short
  delay (the next checkpoint window), not on the very next frame. Don't block the loop on
  an effect; keep ticking and consume the reply when it arrives.
- **No platform dedup yet.** The runtime does not dedup on the `effectId` / idempotency
  ref — this is **not** exactly-once. The function author (and the tick, as above) should
  dedup on `effectId`.

## Recording the result (per-room: authoritative today, read it through the view)

The native runtime is server-authoritative for everything *inside* a room. A
native facet (`init`/`tick`/`views` + snapshot) cannot **directly** write a durable
collection or trigger settlement — but it **can `call` a function that does** (see
[the `call` primitive](#calling-out-from-a-tick-the-call-primitive) below): a tick
returns `{ state, call: { fn, args, as } }`, the called function does the durable
write / settlement / onchain submit, and the result re-enters a later tick as an
`@effect` intent. So "the facet can't persist the outcome itself" is true; "the game
can't persist the outcome" is not. That shapes how you persist the outcome, and there
is one forgeable trap to avoid.

**The forgeable trap — do NOT record results with a client-written collection:**

```json
"matches/$matchId": {
  "tier": "durable",
  "rules": { "create": "@user.address != null && @newData.winner == @user.address" }
}
```

This is **forgeable**. The rule only checks that the caller *names themselves* the
winner — it has no link to the server-authoritative outcome the facet computed. So
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

> ⚠️ **Do NOT read live room state with `get()`/`subscribe()` on the room doc.** Those
> route to the **project DO**, while live session state lives in the **room DO** — so
> `get("rooms/<id>")` on a running/finished live room returns `{ data: null }` (no
> error, just empty), and a plain `subscribe("rooms/<id>")` delivers only an initial
> `null` snapshot and then **no live room state**. This is the same routing boundary as
> views (a plain subscribe lands on the project DO and never sees room writes). The
> **only** room-DO-routed client read is `subscribeView`. Read the result there.
> (Verified: across a whole match on a checkpointed live room, `get` stayed `null` and
> `subscribe` got one `null` snapshot + zero updates while the facet ticked and decided a
> winner — the same state was live in the view.)

Use `checkpointed` (not `ephemeral`) when you want that authoritative state **fold-gated
by your invariants** every checkpoint (the anti-cheat proof boundary) and surviving
eviction provably — but note `checkpointed` changes *durability/provability of the
state*, **not** how you read it: still the view, never `get()`.

**Cross-room leaderboard — two paths.** Folding each room's result into a *shared*
durable leaderboard/`matches` collection is **settlement**. Built-in `settleTo` +
`settleFrom` is **not facet-authoritative yet** for a native room:
- `settleFrom` aggregates a per-player field from a **room sub-collection**, but a
  native facet can't write that sub-collection *directly*, so it can't carry the
  facet's in-memory winner.
- `POST /settle` with client-provided data is gated by `settleRule`, but the value
  is **client-asserted** — `settleRule` can't verify it against facet memory.

The path that **does** work today: have the tick **`call` a settle function** with the
server-decided result (`return { state, call: { fn: "settleMatch", args: { winner } } }`).
The function runs server-side and writes the shared durable collection — the value comes
from facet memory, not a client. Give that function a funded, attributable identity with
`session.live.runAs` (or a per-function `actAs`), then write the settle collection's rules
to trust that service write, not a client `winner == @user.address`; gate the function's own
`auth` with `@origin.kind == 'live' && @origin.module == '<yourGame>'` so only your tick can
call it (see [principals-and-origins.md](principals-and-origins.md)). For onchain settlement
the same function holds the signing capability via `actAs` / a key ([onchain.md](onchain.md)).
(Built-in facet-triggered `settleFrom` under a dedicated system principal is still roadmap —
the `call`-a-function path supersedes the need to wait for it.)

So today: authoritative **per-room** result → project it in `views(state)` and read it
via `subscribeView` (`checkpointed` if you want it invariant-gated + eviction-durable).
Authoritative **cross-room** settlement → either the declarative `session.tick` runtime
(its `settleFrom` is server-computed from a tick-written sub-collection,
[realtime-and-games.md](realtime-and-games.md#sessions--rooms-with-a-server-loop)), or
**`call` a settle function** from the native tick (above).

## Listing rooms (the lobby / discovery)

Same routing boundary, read side: a session room (`rooms/$roomId` with `session.live`)
is **not listable**. `get`/`subscribe` on the session collection route to the project DO
and never see room-DO state, so you **cannot build a lobby by querying `rooms`** — it
comes back empty. (This is why invite-link games just share the room id directly and skip
discovery.)

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

> **Honest limitation — lobby status is client-maintained, not facet-authoritative.** A
> native facet can't write durable collections (same boundary as settlement), so it can't
> flip a room to `playing`/`full`/`ended`. The **host client** updates the entry
> best-effort — e.g. mirror its own view's `phase` into the lobby `status`. If the host
> drops, the entry can go stale (`open` forever). Mitigate with a **scheduled hook**
> (hooks *can* write durable) or a `dueRows` one-shot that expires entries older than N
> seconds. Treat lobby `status` as a discovery *hint*, not ground truth — the room's own
> view is ground truth.

Two rule gotchas the verifier will (correctly) flag if you omit them: pin **both**
`host` and `createdAt` immutable on `update` (`@newData.x == @data.x`) — otherwise the
host can rewrite ownership or backdate the entry, and verify `[FAIL]`s
field-immutability. The public `read: "true"` is fine for an open lobby (verify reports
it as an intentional public-read advisory, not a failure).

## Reconnection & presence (drops, rejoins, leaves)

**Reconnect just works — players are keyed by their stable address.** A client that
drops (tab close, network blip) and comes back simply calls `subscribeView` again with
the same identity; the stream resumes mid-match. Validated by dogfooding: a player
dropped its view for 6s and reconnected into the **same slot**, fighter + HP intact,
with the match having advanced server-side the entire time (the server is authoritative
— it never pauses for one client). No re-join is required to resume.

**Guard `join` by address, or a reconnecting re-join duplicates the player.** If your
reconnect flow re-sends `join`, the tick must treat a join from an address already in
the room as idempotent:

```js
if (intent.type === "join") {
  if (!state.players[address]) {                 // new player → assign a slot
    state.players[address] = freshPlayer(...);
  } else {
    state.players[address].name = intent.name;   // returning player → keep slot/HP
  }
}
```

Without the `if (!state.players[address])` guard, a re-join grabs a second slot (or
clobbers live state) — a self-inflicted bug, not a runtime one.

**There is NO disconnect/presence signal to the facet.** The tick sees **intents only**.
When a client's socket closes, the runtime records it for usage metering but does **not**
notify your module — so a dropped player keeps their slot until the room ends. For
"opponent left" / forfeit / free-the-slot behavior, detect it in the tick yourself: stamp
`player.lastSeen = state.now` on each intent and evict/forfeit players whose `lastSeen`
is older than a timeout.

> **Send-on-change + timeout gotcha.** If your input is send-on-change (the efficient
> model — a still player sends nothing, see [realtime-netcode.md](realtime-netcode.md)),
> an activity timeout will falsely flag an idle-but-connected player as gone. Add a
> lightweight **heartbeat intent** (client sends a `ping` every few seconds) and base the
> timeout on that, not on gameplay input. Runtime-level presence (the supervisor knows
> the socket is open) is not exposed to the facet today — it's a roadmap item, not a
> capability to assume.

## Deploy + run lifecycle

```sh
bounded live deploy pong.live.ts --app-id <id>   # upload source; prints the version (etag)
```

Deploy uploads (transpiled) source to the R2 code registry `bounded-code-<env>`
(staging: `bounded-code-staging`) at key `<appId>/<module>.js`. The **R2 etag is
the version** — a new upload produces a new etag and a fresh facet on the next
room start. **No worker is redeployed.** If a room references a module that hasn't
been uploaded yet, the room stays live but dormant (`/live/status` reports
`started: false`) rather than failing.

The worker routes are **already live** on the room DO (do not modify them).
Clients address a room **by path** — the worker derives the room id internally and
sets `X-Room-Id` itself. **Clients never set `X-Room-Id`.**

| Route | Addressed by | Auth | Returns |
|---|---|---|---|
| `GET /live/status` | `?path=<sessionCollection>/<roomId>` | none | `{ available, started, running, tick, module }` |
| `POST /live/intent` | `body.path` | **required** | `{ ok: true }` |

## SDK client — worked example

Two pieces: **subscribe** to your own per-client view for live state, and **send
an intent** to influence the room. Both are first-class helpers under the
`live` namespace now — use them; they handle auth, room routing, and the view
path for you.

```ts
import { live } from "bounded-sh";

const roomPath = `rooms/r1`;                 // the session collection + room id

// 1. Live state — subscribe to YOUR view. `live.subscribeView` builds the
//    `<roomPath>/view/<myUserId>` path AND routes the connection to the room's
//    Durable Object (where the live view fan-out runs), so you never pass any
//    routing yourself. The read rule `$userId == @user.id` means this only
//    ever resolves to your projection (no hidden state).
const stop = await live.subscribeView(roomPath, {
  onData: (view) => render(view),            // your per-player view object
  onError: (e) => console.error(e),
});

// 2. Send an intent. Address the room BY PATH; the worker derives the room id
//    and takes your universal user id (`@user.id`) from the session token (auth
//    required, handled by the SDK). Returns { ok: true }.
await live.intent(roomPath, { type: "join" });
await live.intent(roomPath, { type: "move", dir: -1 });

// later: await stop();
```

> **Routing is the SDK's job, not yours.** `live.subscribeView` opens a
> connection routed to the per-room DO; a plain `subscribe('rooms/r1/view/<userId>')`
> over the default app-level connection lands on the *project* DO and never sees
> the room's ephemeral view writes (it stays `null`). Always subscribe to live
> views through `live.subscribeView` (or `subscribeLiveView`). You never specify
> the destination DO — the worker is the authority on routing.
>
> **`init` with a network preset** — no endpoint URLs in app code:
> `await init({ appId, network: 'bounded-staging' })` (or `'bounded-production'`).
> For a zero-friction guest identity (great for invite links), pass
> `authMethod: 'guest'` and call `login()` — a device-local keypair signs in with
> no wallet and no signup.

Status/liveness is still a raw GET (no helper yet):
`GET {realtime}/live/status?path=<collection>/<roomId>` →
`{ available, started, running, tick, module }`.

The per-client view read rule is what makes the subscribe line safe by
construction: it can only ever resolve to *your* view, so you cannot subscribe
your way into another client's hidden state. (The SDK surface for this primitive
ships today in `bounded-sh`: `live.intent` for sending and
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
- [onchain.md](onchain.md) — server-signed (today) + client-signed (roadmap) settlement from a live room
