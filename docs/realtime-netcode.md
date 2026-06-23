# Realtime Netcode (live games that feel good)

**What's in here / when to read this:** making a `session.live` game feel smooth —
input cadence, hiding network jitter (interpolation + prediction), and authorizing
who may act. Read after [realtime-and-games.md](realtime-and-games.md) and
[live-runtime.md](live-runtime.md).

Bounded gives you a server-authoritative loop: your `tick(state, intents, dt)` runs
~30Hz in the room, and each client subscribes to its per-player view. That's correct
and cheat-resistant, but "correct" is not automatically "smooth." The patterns below
are the standard authoritative-server netcode playbook (Valve Source / Gaffer-on-Games),
adapted to Bounded.

## 1. Transport: intents already ride the WebSocket

`live.intent(roomPath, intent)` sends over the **same WebSocket** your
`subscribeView` already opened (the per-room socket), not a fresh HTTP request per
call. So high-frequency input is cheap — one persistent connection. (Before a room
socket exists, e.g. the very first `join`, it falls back to one HTTP POST.) You do
**not** manage this — there is no routePath/transport knob; the worker is the room
authority and the client names no destination.

> Do **not** hand-roll per-action HTTP for inputs. Sending an HTTP request per input
> floods the browser's connection pool and head-of-line-blocks your view stream.

**Reliable by default; fire-and-forget for input.** `live.intent` awaits the server
ack, so a policy/auth **denial throws** — important for `join`/`ready`/`leave`,
whose failure the player must know about. For high-frequency, idempotent input
(movement/aim), opt into the fast path so it doesn't await:

```ts
live.intent(roomPath, { type: "ready" });                      // reliable — a deny throws
live.intent(roomPath, { type: "input", mv, aim }, { fireAndForget: true }); // fast, no ack
```

(Both ride the same WebSocket; `fireAndForget` just skips waiting for the ack. Don't
use it for intents whose rejection matters — the denial is silently dropped.)

## 2. Send input only when it CHANGES (event-driven, not every frame)

Your live module persists each player's input (e.g. `p.mvx = mv[0]`) and keeps
applying it every tick. So the client only needs to send when the input **changes** —
not every frame. A held key moving in a straight line sends nothing after the initial
press; standing still sends nothing.

```ts
let lastMv = [0, 0], lastAim = [0, 0], lastSent = 0;
function sendInput(roomId, mv, aim) {
  const moved = Math.abs(mv[0]-lastMv[0]) + Math.abs(mv[1]-lastMv[1]) > 0.02;
  const aimed = Math.abs(aim[0]-lastAim[0]) + Math.abs(aim[1]-lastAim[1]) > 0.03;
  if (!moved && !aimed) return;                 // server keeps applying last input
  const now = performance.now();
  if (now - lastSent < 50) return;              // throttle rapid aim to ~20Hz
  lastSent = now; lastMv = mv.slice(); lastAim = aim.slice();
  live.intent(roomId, { type: "input", mv, aim }, { fireAndForget: true });
}
```

Discrete actions (attack, ability) are events — send them on the keypress, always.

> **The tick itself can reach the outside world.** Beyond reading client intents, a
> `session.live` tick can `return { state, call: { fn, args, as } }` to call a
> whitelisted function — an AI NPC's brain, a settlement step, an external check.
> The result arrives on a later tick as an `@effect` intent (checkpoint cadence, so
> a short delay — not instant). The optional field is **`as`** (a player id), never
> `onBehalfOf` — but `as` only gates the same-tick check today; it does **not** make
> the call act as that player (per-player acting is roadmap). See
> [live-runtime.md](live-runtime.md) for the primitive
> and [ai-npcs.md](ai-npcs.md) for NPC/settlement patterns.

## 3. Interpolate REMOTE players (hide jitter)

If you render the latest snapshot directly, a late snapshot freezes the entity then
rubber-bands when it arrives (a visible snap). Instead, buffer timestamped snapshots
and render roughly **100-180ms in the past**, lerping between the two surrounding
ones. Use ~100ms for same-region/light rooms; use ~150-180ms when you measure p95
delivery gaps near 100ms or users are far from the room's Durable Object. The buffer
absorbs jitter and delivery gaps.

```ts
// on each view: f.buf.push({ t: performance.now()/1000, x: pv.x, z: pv.z }) (keep ~20)
// each frame:
const target = nowS - 0.16;                     // 100-180ms interpolation delay
let i = f.buf.findIndex((b, k) => f.buf[k+1] && b.t <= target && f.buf[k+1].t >= target);
if (i >= 0) {
  const a = f.buf[i], b = f.buf[i+1], u = (target - a.t) / ((b.t - a.t) || 1);
  f.rx = a.x + (b.x - a.x) * u;  f.rz = a.z + (b.z - a.z) * u;
}
```

Only interpolate **continuous** fields (positions). Never lerp `hp`, enums, or
booleans — step those to the latest value.

## 4. Predict the LOCAL player (instant response)

Interpolation adds delay, which feels awful on your *own* character. So predict the
local player: apply your own input to a local position every frame using the **same
movement model as the server**, then reconcile to the authoritative position when it
arrives — softly for small drift, snap for large deltas (knockback / dash / respawn).

```ts
if (canMove) { px = clamp(px + mv[0]*SPEED*dt); pz = clamp(pz + mv[1]*SPEED*dt); }
const err = Math.hypot(serverX - px, serverZ - pz);
if (err > BIG) { px = serverX; pz = serverZ; }            // teleport/knockback → snap
else { px += (serverX - px) * dt*3; pz += (serverZ - pz) * dt*3; }  // soft correction
render(px, pz);
```

Because of fog-of-war you only get *your own* authoritative state — which is exactly
the one you need to predict. (You can't, and shouldn't, predict a hidden opponent.)

> **Roadmap:** since your `tick()` is a pure function, the same module can run
> client-side for prediction + reconciliation — write the sim once, get prediction for
> free. Not automatic today; replicate the movement subset as above.

## 5. Authorize who may ACT — `session.intentRule`

By default, sending an intent is gated by the room collection's **read** rule (if you
can see the room, you can act). That's a proxy — fine when read == participant, loose
for a public-read room (anyone logged in could inject intents). Declare
`session.intentRule` to gate **acting** separately from **seeing**:

```json
"rooms/$roomId": {
  "tier": "ephemeral",
  "fields": { "createdBy": "Address!", "players": "Json" },
  "session": {
    "live": { "module": "game", "everyMs": 33, "maxLifetimeSec": 1800 },
    "intentRule": "@user.id != null && @user.id in @data.players"
  },
  "rules": { "read": "@user.id != null", "create": "...", "update": "false", "delete": "false" }
}
```

- Evaluated room-side against the room doc (`@data`) + caller (`@user`), like any rule.
- Absent → falls back to the read rule (back-compat). Both fail closed.
- The live `tick()` is still your fine-grained gate (it decides what each intent *does*);
  `intentRule` is the coarse "may this principal act here at all."
- **Gate on identity, not wallet.** The caller is `@user = { id, address, email }`:
  `@user.id` is the universal stable identity (always present for an authed user —
  the wallet address for wallet logins, the account identity for email/social logins),
  `@user.address` is a real onchain wallet (null for email-only logins), and
  `@user.email` is the verified email (null for wallet logins). A live room is an
  offchain (`ephemeral`) collection, so membership/auth gates use `@user.id` —
  store `@user.id` in `players` and gate with `@user.id in @data.players`. Reserve
  `@user.address` for genuinely onchain/wallet semantics (it is forbidden in
  `onchain:true` collections' rules to use `@user.id`, `@user.email`, or
  `@user.isAnonymous`).

## Checklist for a smooth live game

- [ ] Inputs go through `live.intent` (rides the WS) — no per-action HTTP.
- [ ] Input sent only on change + a small throttle (not every frame).
- [ ] Remote entities interpolated from a snapshot buffer (~100-180ms delay).
- [ ] Local player predicted from input, reconciled to the server.
- [ ] Continuous fields interpolated; discrete fields stepped.
- [ ] `intentRule` set if "can see" ≠ "can act" for your room.

## Scaling to many players (the climb past 1v1)

A room is one Durable Object (single thread, single location) with its sim in one
facet. That's plenty for a few players; the ceiling you hit *first* as you add
players is **fan-out**, not input. At N players × tickrate the server must compute
and send N views per tick — output, from one object. The climb, in order:

1. **Area-of-interest views (you already have this).** `views(state)` projects a
   *per-player* view — send each client only the entities near them, not the whole
   world. This is the single biggest scaling lever and it's the same mechanism as
   fog-of-war. Keep each view as small as the player can actually perceive.
2. **Delta encoding.** Past a handful of players, stop sending full per-tick
   snapshots — send only the fields that changed since that client's last view.
   Bandwidth, not CPU, is usually what caps player count.
3. **Relay-tier fan-out.** When one DO can't push to everyone, keep the
   authoritative sim on the room DO but have it push state to a few *relay* DOs
   that each fan out to a subset of players. Shards the *outbound* load across
   objects (the "authoritative server + edge relays" shape) without splitting the
   sim.
4. **Transport (only at twitch scale).** At 1v1/30Hz, TCP head-of-line blocking is
   noise. At 64-player *twitch*, more entities = more packets = a dropped packet
   stalls more — this is the scale where a UDP-style transport (WebTransport
   datagrams / a WebRTC relay) finally earns its keep. Until you *measure* that,
   WebSocket is correct.
5. **Single-DO budget.** One match = one DO = one thread. Light sims (hitscan) at
   64 are feasible; heavy physics or 128+ means sharding the world by region. Prove
   8–16 players on the single-DO path first — that measures your real per-DO budget
   empirically, and 16→64 becomes a fan-out-sharding problem, not a redesign.

## Related
- [realtime-and-games.md](realtime-and-games.md) — sessions, tick, fog-of-war, tiers
- [live-runtime.md](live-runtime.md) — the native `init/tick/views` module; the tick `call` primitive
- [ai-npcs.md](ai-npcs.md) — a tick that `call`s a function = an AI NPC / in-game settlement
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — what the proof gate can/can't enforce
