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
//   3. views(state)             -> { [address]: view }     (optional; per-client visibility)
//
// `intents` is the list of client inputs received since the last tick:
//   [{ address, intent }, ...]  — Bounded orders them; you decide what they mean.
```

- `init(seed): State` — **optional.** The initial state when the room starts.
- `tick(state, intents, dtMs): State` — **required, server-authoritative.**
  `intents` is `[{ address, intent }, ...]` ordered by Bounded; return the next
  state. This is the only thing that advances the room.
- `views(state): Record<address, View>` — **optional.** Maps each client's
  address to *what that client may see*. Bounded fans each entry out to that
  address's view collection.

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
| `secrets` | Optional. Array of identifiers (`/^[a-zA-Z][a-zA-Z0-9_]*$/`) | Secret **names** injected into the facet's `env`. (Identifier rule — **not** the UPPER_SNAKE_CASE rule that [functions.md](functions.md) secrets use.) |

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
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
    "session": { "live": { "module": "pong", "everyMs": 33, "maxLifetimeSec": 1800, "snapshotEveryTicks": 30 } }
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
path into room state — only the native `tick` advances it.

## Tiers: ephemeral (live) vs checkpointed (provable)

The room template's `tier` decides what survives:

| Layer | Tier | Durability | Who writes |
|---|---|---|---|
| Room state | `ephemeral` | in-memory; gone on eviction except for facet-SQLite snapshots | native `tick` only |
| Room state | `checkpointed` | folded **through invariants** into the provable store on the checkpoint cadence — survives + is provable/replayable | native `tick`, then the checkpoint |
| `view/$addr` | **always `ephemeral`** | a live projection, never source of truth | `views(state)` fan-out |

Two **distinct** persistence mechanisms, do not conflate them:

- **Snapshot** = the facet writes its in-memory state to its own SQLite every
  `snapshotEveryTicks` ticks. Purpose: survive **eviction** and reconcile with
  bounded loss (a few seconds of activity). Not provable, not in the data store.
- **Checkpoint** = on the checkpoint cadence, the **authoritative** state is
  folded **through your declared invariants** into the **provable data store**.
  Purpose: durability + replayability + proof. Only happens on `checkpointed`.

`ephemeral` = live fan-out only (snapshots bound replay loss, nothing is
provable). `checkpointed` = the authoritative state becomes provable on every
checkpoint. The per-client `view/$addr` is **always ephemeral** because it is a
projection — the source of truth is the room, not the view.

## Per-client view read-rules (structural fog-of-war)

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

This is the structural cure for maphacks/wallhacks (games) and for leaking
private layers/selections in a collaborative editor: **hidden information is never
written to a view it doesn't belong to**, so patching the client reveals nothing
— there is nothing to reveal. In `views(state)`, only put in `out[addr]` what
`addr` is allowed to see.

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

The three roles stay clean:

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

Two pieces: **subscribe** to your own per-client view for live state, and **POST
an intent** to influence the room. There is no first-class live SDK helper yet
(same situation as [functions.md](functions.md) invoke), so send intents with the
id token + raw `fetch`.

```ts
import { subscribe, getIdToken } from "@bounded-sh/client";

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
  await fetch(`${LIVE_URL}/live/intent`, {
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

// 3. Lobby / liveness — GET /live/status?path=<collection>/<roomId>.
const status = await fetch(`${LIVE_URL}/live/status?path=${encodeURIComponent(path)}`)
  .then((r) => r.json());                    // { available, started, running, tick, module }

// later: await stop();
```

The per-client view read rule is what makes the subscribe line safe by
construction: it can only ever resolve to *your* view, so you cannot subscribe
your way into another client's hidden state. (The SDK surface for this primitive
is `live.intent` for sending and `subscribeLiveView` as the typed subscribe
helper once first-class helpers land; today, use raw `subscribe` + `fetch` as
above.)

## Related

- [realtime-and-games.md](realtime-and-games.md) — subscriptions + the **bytecode** `session.tick` model (the other tick runtime)
- [invariants.md](invariants.md) — the postconditions enforced on every checkpoint
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — the honest trust boundary in depth
- [policy-reference.md](policy-reference.md) — `tier` + read-rule expression language
- [sdk-reference.md](sdk-reference.md) — `subscribe`, `getIdToken`
- [functions.md](functions.md) — the sibling code-upload model (secrets + proof boundary)
</content>
</invoke>
