# Games runtime — native server-authoritative games (three pure functions)

**What's in here / when to read this:** the **native game** runtime — upload a
module exporting three pure functions (`init`/`tick`/`views`), declare a
`session.game` block, run `bounded games deploy`, and drive it from the SDK.
Bounded loads your code into an isolated facet, runs the tick ~30Hz
server-authoritatively, snapshots + checkpoints state, and fans per-player views
out live. You write the game logic — nothing else.

> **Two tick runtimes — pick one.** A session can run **either** a bytecode
> `session.tick` (a `hooks.tick.<name>` reducer + `settleFrom`/`settleTo`
> settlement — see [realtime-and-games.md](realtime-and-games.md)) **or** a
> native `session.game` (this doc). They are **mutually exclusive** on one
> session; the validator rejects a session that declares both. Use bytecode
> `tick` for simple counters/timers expressible in policy; use native `game` when
> the loop is real game logic (collisions, scoring, fog-of-war) you'd rather
> write in TypeScript.

This is the imperative sibling of [functions.md](functions.md): code you upload
(not deploy), loaded into an isolate, with an honest proof boundary. The
difference is *where* the code runs — a function runs once per call; a game runs
continuously inside the room.

## The four-artifact DX

A complete native game is **four artifacts** and no infrastructure:

| Artifact | Where it lives | Who runs it |
|---|---|---|
| 1. The game module (3 pure fns) | `pong.game.ts` (your repo) | Bounded, inside the room's isolated facet, ~30Hz |
| 2. The `session.game` policy block | `policy.json` on a `rooms/$roomId` template | the prover (deploy) + the room DO (runtime) |
| 3. `bounded games deploy <module>.game.ts` | the R2 code registry | you, once per code change (no worker redeploy) |
| 4. The SDK client (subscribe + intents) | your web/RN/server app | each player's device |

**Artifact 1 — the module.** It exports **exactly three** pure functions and
nothing else (no DOs, no `setTimeout`, no WebSocket, no snapshot code, no
deploy). Quoting the contract from the top of `pong.game.ts`:

```ts
//   1. init(seed)               -> initial state           (optional)
//   2. tick(state, intents, dt) -> next state              (required; server-authoritative)
//   3. views(state)             -> { [address]: view }     (optional; per-player visibility)
//
// `intents` is the list of player inputs received since the last tick:
//   [{ address, intent }, ...]  — Bounded orders them; you decide what they mean.
```

- `init(seed): State` — **optional.** The initial state when the room starts.
- `tick(state, intents, dtMs): State` — **required, server-authoritative.**
  `intents` is `[{ address, intent }, ...]` ordered by Bounded; return the next
  state. This is the only thing that advances the game.
- `views(state): Record<address, View>` — **optional.** Maps each player's
  address to *what that player may see*. Bounded fans each entry out to that
  address's view collection.

Bounded loads this into a Cloudflare **Worker-Loader facet** inside the per-room
Durable Object, drives `tick` on a pinned timer, snapshots to the facet's SQLite
(eviction survival), and checkpoints the authoritative state through your
declared invariants. You never write any of that.

**Artifact 2 — the policy block** (see the full field table below):

```json
"rooms/$roomId": {
  "tier": "checkpointed",
  "session": { "game": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800,
                         "snapshotEveryTicks": 30 } }
}
```

**Artifact 3 — deploy** uploads the *source* to the code registry; the etag is
the version. No worker is redeployed:

```sh
bounded games deploy pong.game.ts --app-id <id>
```

**Artifact 4 — the SDK client** subscribes to its own per-player view and posts
intents (worked example at the end).

## The `session.game` policy block

`session.game` is a sibling of `session.tick` under a session block. Fields
(validated **exactly** as in the worker's `sessions.ts`):

| Field | Type / rule | Meaning |
|---|---|---|
| `module` | **Required.** Bare identifier `/^[a-zA-Z][a-zA-Z0-9_]*$/` | Name that resolves to your uploaded source in the code registry. Not the source itself — the policy only declares the binding. |
| `everyMs` | **Required.** Integer, `20`–`60000` | Native tick cadence (ms). ~33 ≈ 30Hz. |
| `maxLifetimeSec` | **Required.** Integer, `1`–`86400` | Hard lifetime cap; the room is torn down at this age regardless of state. |
| `snapshotEveryTicks` | Optional. Integer, `1`–`600` | Snapshot the facet's in-memory state to its own SQLite every N ticks. Bounds post-eviction reconcile loss. Default: derived from `checkpointSeconds / everyMs` (≈ one checkpoint window). |
| `secrets` | Optional. Array of identifiers (`/^[a-zA-Z][a-zA-Z0-9_]*$/`) | Secret **names** injected into the facet's `env`. (Identifier rule — **not** the UPPER_SNAKE_CASE rule that [functions.md](functions.md) secrets use.) |

**Two hard placement rules:**

1. **`tick` and `game` are mutually exclusive** on a session — one drives the
   loop. Declaring both is a validation error.
2. **`session.game` is valid only on an `ephemeral` or `checkpointed` top-level
   template** — never `durable`, never onchain (same constraint as `session.tick`).

The validated declaration (room + per-player view + invariants):

```json
{
  "rooms/$roomId": {
    "tier": "checkpointed",
    "fields": { "status": "String", "tick": "UInt" },
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
    "session": { "game": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800, "snapshotEveryTicks": 30 } }
  },
  "rooms/$roomId/view/$addr": {
    "tier": "ephemeral",
    "fields": { "stateJson": "String" },
    "rules": { "read": "$addr == @user.address", "create": "false", "update": "false", "delete": "false" }
  },
  "invariants": ["score.values <= 11", "paddleY.values >= 0 && paddleY.values <= 90"]
}
```

`update: "false"` + `delete: "false"` on the room means there is no client write
path into game state — only the native `tick` advances it.

## Tiers: ephemeral (live) vs checkpointed (provable)

The room template's `tier` decides what survives:

| Layer | Tier | Durability | Who writes |
|---|---|---|---|
| Room game state | `ephemeral` | in-memory; gone on eviction except for facet-SQLite snapshots | native `tick` only |
| Room game state | `checkpointed` | folded **through invariants** into the provable store on the checkpoint cadence — survives + is provable/replayable | native `tick`, then the checkpoint |
| `view/$addr` | **always `ephemeral`** | a live projection, never source of truth | `views(state)` fan-out |

Two **distinct** persistence mechanisms, do not conflate them:

- **Snapshot** = the facet writes its in-memory state to its own SQLite every
  `snapshotEveryTicks` ticks. Purpose: survive **eviction** and reconcile with
  bounded loss (a few seconds of play). Not provable, not in the data store.
- **Checkpoint** = on the checkpoint cadence, the **authoritative** state is
  folded **through your declared invariants** into the **provable data store**.
  Purpose: durability + replayability + proof. Only happens on `checkpointed`.

`ephemeral` = live fan-out only (snapshots bound replay loss, nothing is
provable). `checkpointed` = the authoritative state becomes provable on every
checkpoint. The per-player `view/$addr` is **always ephemeral** because it is a
projection — the source of truth is the room, not the view.

## Per-player view read-rules (structural fog-of-war)

`rooms/$roomId/view/$addr` is `ephemeral` with read rule `$addr ==
@user.address`. The keys of the map returned by `views(state)` are **addresses**;
Bounded fans each key out to that address's view collection. The read rule then
guarantees a client can only ever subscribe to **its own** view — there is no
delivery path for anyone else's.

```json
"rooms/$roomId/view/$addr": {
  "tier": "ephemeral",
  "rules": { "read": "$addr == @user.address", "create": "false", "update": "false", "delete": "false" }
}
```

This is the structural cure for maphacks/wallhacks: **hidden information is never
written to a view it doesn't belong to**, so patching the client reveals nothing
— there is nothing to reveal. In `views(state)`, only put in `out[addr]` what
`addr` is allowed to see.

**The `*` spectator key.** Pong writes a wildcard `out["*"]` entry with the full
board. That is appropriate **only** for symmetric / no-hidden-information games
(both players already see everything). For a **fog-of-war** game (hidden hands,
fogged map, hidden units) **omit `*`** — a spectator key would leak exactly the
hidden state the per-player views exist to protect.

## Invariants as anti-cheat

Your declared `invariants` (e.g. `score.values <= 11`, `paddleY.values >= 0 &&
paddleY.values <= 90`) are enforced on the **authoritative checkpointed state**
every checkpoint. The native `tick` **cannot** produce a checkpoint that violates
them — a violating fold is rejected and fails closed, exactly like every other
write path in Bounded. So even your own game code can't checkpoint an impossible
score.

The three roles stay clean:

- **intents** are the only client write path, and they are **server-ordered** by
  Bounded.
- **`tick`** is **server-authoritative** — clients never write state, only intents.
- **`views`** are **read-only projections** — a client reads its view, never writes it.

What this structurally cures (same boundary as
[realtime-and-games.md](realtime-and-games.md#the-honest-anti-cheat-boundary)):

- **State manipulation** (teleport, set score) — no client write path; `tick`-only.
- **Maphacks / wallhacks** — per-player views; hidden data never sent.
- **Forged ticks** — only the facet's native `tick` advances state.
- **Macro / turbo-fire** — pair the room with a `rollingSum`-capped intent
  collection (the rate-cap pattern in
  [realtime-and-games.md](realtime-and-games.md#intents--proven-rate-caps)).

What **no backend cures**: a script firing only *legal* intents at *human* timing
but with superhuman accuracy. Each intent is individually valid, so nothing
rejects it; the residual is a statistical/ML problem on legal inputs, best fed by
the tamper-proof, server-ordered intent log via `webhooks`. Be explicit with
users: Bounded solves the **structural** part and gives the best substrate for
the statistical part — it does **not** "solve cheating."

## Deploy + run lifecycle

```sh
bounded games deploy pong.game.ts --app-id <id>   # upload source; prints the version (etag)
```

Deploy uploads (transpiled) source to the R2 code registry `bounded-code-<env>`
(staging: `bounded-code-staging`) at key `<appId>/<module>.js`. The **R2 etag is
the version** — a new upload produces a new etag and a fresh facet on the next
room start. **No worker is redeployed.** If a room references a module that hasn't
been uploaded yet, the room stays live but dormant (`/game/status` reports
`started: false`) rather than failing.

The worker routes are **already live** on the room DO (do not modify them).
Clients address a room **by path** — the worker derives the room id internally and
sets `X-Room-Id` itself. **Clients never set `X-Room-Id`.**

| Route | Addressed by | Auth | Returns |
|---|---|---|---|
| `GET /game/status` | `?path=<sessionCollection>/<roomId>` | none | `{ available, started, running, tick, module }` |
| `POST /game/intent` | `body.path` | **required** | `{ ok: true }` |

## SDK client — worked example

Two pieces: **subscribe** to your own per-player view for live state, and **POST
an intent** to influence the game. There is no first-class games SDK helper yet
(same situation as [functions.md](functions.md) invoke), so send intents with the
id token + raw `fetch`.

```ts
import { subscribe, getIdToken } from "@bounded/client";

const roomId = "r1";
const myAddress = "0xabc…";                 // == @user.address
const path = `rooms/${roomId}`;             // the session collection + room id

// 1. Live state — subscribe to YOUR view only. The read rule `$addr ==
//    @user.address` means this is the only view collection you can ever receive,
//    so the subscription delivers exactly your projection (no hidden state).
const stop = await subscribe(`rooms/${roomId}/view/${myAddress}`, {
  onData: (view) => render(view),           // { ball, you, side, paddles, score, status, ... }
  onError: (e) => console.error(e),
});

// 2. Send an intent. Address the room BY PATH (body.path); never set X-Room-Id —
//    the worker derives the room id. Attach the id token (auth required).
const token = await getIdToken();
async function sendIntent(intent: unknown) {
  await fetch(`${GAME_URL}/game/intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, intent }),   // -> { ok: true }
  });
}
await sendIntent({ type: "join" });
await sendIntent({ type: "move", dir: -1 });

// 3. Lobby / liveness — GET /game/status?path=<collection>/<roomId>.
const status = await fetch(`${GAME_URL}/game/status?path=${encodeURIComponent(path)}`)
  .then((r) => r.json());                    // { available, started, running, tick, module }

// later: await stop();
```

The per-player view read rule is what makes the subscribe line safe by
construction: it can only ever resolve to *your* view, so you cannot subscribe
your way into another player's hidden state.

## Related

- [realtime-and-games.md](realtime-and-games.md) — subscriptions + the **bytecode** `session.tick` model (the other tick runtime)
- [invariants.md](invariants.md) — the postconditions enforced on every checkpoint
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — the honest trust boundary in depth
- [policy-reference.md](policy-reference.md) — `tier` + read-rule expression language
- [sdk-reference.md](sdk-reference.md) — `subscribe`, `getIdToken`
- [functions.md](functions.md) — the sibling code-upload model (secrets + proof boundary)
