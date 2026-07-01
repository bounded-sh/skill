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
**not** manage this — there is no routePath/transport knob; Bounded is the room
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

**Hibernation reconnects.** Bounded's realtime worker uses Cloudflare's WebSocket
Hibernation API. If the edge cannot deserialize a hibernated socket attachment
(for example after a runtime/storage-format transition), the worker treats that
socket as stale, closes it with a reconnect reason, and the SDK should reopen and
resubscribe. This is a transport reconnect condition, not a room-policy denial
and not an app-level live intent error.

## 2. Send input only when it CHANGES (event-driven, not every frame)

Your live module persists each player's input (e.g. `p.mvx = mv[0]`) and keeps
applying it every tick. So the client only needs to send when the input **changes** —
not every frame. A held key moving in a straight line sends nothing after the initial
press; standing still sends nothing.

```ts
let lastMv = [0, 0], lastAim = [0, 0], lastSent = 0, trailing = null;
function sendNow(roomId, mv, aim) {
  lastSent = performance.now(); lastMv = mv.slice(); lastAim = aim.slice();
  live.intent(roomId, { type: "input", mv, aim }, { fireAndForget: true });
}
function sendInput(roomId, mv, aim) {
  const moved = Math.abs(mv[0]-lastMv[0]) + Math.abs(mv[1]-lastMv[1]) > 0.02;
  const aimed = Math.abs(aim[0]-lastAim[0]) + Math.abs(aim[1]-lastAim[1]) > 0.03;
  if (!moved && !aimed) return;                 // server keeps applying last input
  const now = performance.now();
  if (now - lastSent < 50) {                    // throttle rapid aim to ~20Hz…
    // …but NEVER DROP the newest state. A change landing inside the throttle
    // window must be sent when the window closes (a trailing send), or a quick
    // key RELEASE / steer reversal stays stale on the server until your next
    // change — the server keeps applying the old input, felt as 100-250ms of
    // steering/brake latency. This trailing send is the most common missing
    // piece in "why does it feel mushy" bug reports.
    clearTimeout(trailing);
    trailing = setTimeout(() => sendNow(roomId, mv, aim), 50 - (now - lastSent));
    return;
  }
  clearTimeout(trailing);
  sendNow(roomId, mv, aim);
}
```

Discrete actions (attack, ability) are events — send them on the keypress, always.

> **Which send model?** Send-on-change (above) fits the simple model where the
> server free-runs your last held input — fine for cursors, presence, casual
> co-op. For prediction-grade games (anything where rubber-banding matters),
> use §4b's COMMAND-DRIVEN model instead, which sends one command per fixed
> tick. Do not mix the two: ack-seq replay on top of a free-running reducer is
> the rubber-band trap described in §4b.

> **The tick itself can reach the outside world.** Beyond reading client intents, a
> `session.live` tick can `return { state, call: { fn, args, as } }` to call a
> whitelisted function — an AI NPC's brain, a settlement step, an external check.
> The result arrives on a later tick as an `@effect` intent (checkpoint cadence, so
> a short delay — not instant). The optional field is **`as`** (a player id), never
> `onBehalfOf`; it is a validation hint rather than an identity override. See
> [live-runtime.md](live-runtime.md) for the primitive
> and [ai-npcs.md](ai-npcs.md) for NPC/settlement patterns.

## 3. Interpolate REMOTE players (hide jitter)

If you render the latest snapshot directly, a late snapshot freezes the entity then
rubber-bands when it arrives (a visible snap). Instead, buffer timestamped snapshots
and render roughly **100-180ms in the past**, lerping between the two surrounding
ones. Use ~100ms for same-region/light rooms; use ~150-180ms when you measure p95
delivery gaps near 100ms or users are far from the room runtime. The buffer
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

**Keep the client and server movement models IDENTICAL — including collision.**
Prediction quality is bounded by model divergence. If the server resolves walls
with a radial push and the client uses AABB boxes (or different margins), every
wall scrape diverges and triggers a visible correction. Share one constants
table, and implement collision once in a shared function both sides import (or
copy verbatim). Divergent collision code is the #1 source of "rubber-banding
near buildings."

### 4b. Input-replay reconciliation — REQUIRES command-driven movement

The soft-lerp above blends your predicted position toward the server position —
but the server position is *always* RTT/2 + a tick behind you. At high speed
that stale target constantly drags the predicted player backward ("mushy",
"rubber-band") even when your prediction was perfect. The real fix is the
classic client-side-prediction loop — **but it only works if you also change
how the server moves the player.**

**The trap (do not skip this).** If your `tick()` free-runs the player every
tick with the "last held input" (the natural way to write a reducer), ack-seq
replay is mathematically broken: during the round-trip window the server
integrates your *stale* input while the client replays its *fresh* inputs over
the same wall-clock window on top of the server state. That window gets
integrated twice — the predicted player overshoots, and every view yanks it
back. **Constant rubber-banding, worst while simply driving straight.** We
shipped this bug ourselves before deriving the correct model below; the fixed
reference (Bounded Arena) measures corrections of **0.00px** where the naive
model showed constant multi-pixel snapping.

**The correct model (Source-engine style): the player's OWN movement is
command-driven.** The server advances a player's physics exactly one fixed step
per *received input command* — never on the free-running tick. World logic
(pickups, timers, NPC/AI entities, scoring) stays per-tick.

Module side:

```ts
// per player: { lastSeq, budget } — budget accrues 1/tick, cap ~6.
// Anti-speed-hack: commands beyond budget are DROPPED, never acked.
for (const { address, intent } of intents) {
  if (intent.type !== "input") continue;
  const p = players[address];
  if (intent.seq <= p.lastSeq) continue;   // stale/duplicate
  if (p.budget < 1) continue;              // over real-time rate — drop
  p.budget -= 1;
  applyInputFields(p, intent);
  stepPlayer(p, STEP_MS);                  // EXACTLY one fixed step per command
  p.lastSeq = intent.seq;                  // ack only what was stepped
}
// views(): echo p.lastSeq as ackInputSeq; the player's OWN state at FULL
// precision (no rounding) — exact replay depends on it.
```

Client side — fixed-timestep command loop (send every tick, ~30Hz, even when
the input is unchanged; the command stream IS the simulation timeline):

```ts
// each 33ms tick (accumulator off requestAnimationFrame):
seq++; history.push({ seq, input });                    // ring, cap ~240
live.intent(room, { type: "input", seq, ...input }, { fireAndForget: true });
stepPlayer(me, STEP_MS, input);                         // predict

// on each view:
me.setState(view.you);                                  // rewind to server truth
while (history.length && history[0].seq <= view.ackInputSeq) history.shift();
for (const c of history) stepPlayer(me, STEP_MS, c.input);  // exact replay
```

Because both sides run the same `stepPlayer` over the same command stream with
the same fixed dt, the replayed state **equals** the prediction — corrections
are ~0 unless the server genuinely disagreed (a collision with another player,
a knockback). Keep a hard snap for teleports/respawn (and clear the history).
Determinism notes: fixed dt only; `Math.sqrt(x*x+y*y)` instead of `Math.hypot`
(hypot is not ULP-identical across engines); render the 30Hz sim smoothly by
lerping between the last two tick states at `accumulator/STEP_MS`.

**Measure it — the correction meter.** On every reconcile, record
`dist(predictedBefore, afterRewindAndReplay)` and show a rolling avg/max on
screen. This number IS the rubber-band: ~0px = smooth; multi-pixel average =
you have the trap above. Never judge game feel by eye alone when a 5-line
metric can prove it.

### 4c. Interpolate on the SERVER clock, not arrival time

Buffering remote snapshots by client receipt time couples your interpolation to
network jitter. The view already carries a monotonic tick (`serverTick` or the
`ctx.tick` you echo): timestamp buffer entries as `tick * everyMs` and render at
`latestTick*everyMs - interpDelay`. Delivery jitter then only affects how much
buffer you need, not the smoothness of the playback clock.

## 5. Authorize who may ACT — `session.intentRule`

Sending an intent is gated by `session.intentRule`. Declare it explicitly to gate
**acting** separately from **seeing**; a room read rule only controls visibility.
This is intentionally fail-closed because "can see the room" is not the same as
"can act in the room."

```json
"rooms/$roomId": {
  "tier": "ephemeral",
  "fields": { "createdBy": "Address!", "playerA": "String", "playerB": "String" },
  "session": {
    "live": { "module": "game", "everyMs": 33, "maxLifetimeSec": 1800 },
    "intentRule": "@user.id != null && (@user.id == @data.playerA || @user.id == @data.playerB)"
  },
  "rules": { "read": "@user.id != null", "create": "...", "update": "false", "delete": "false" }
}
```

- Evaluated room-side against the room doc (`@data`) + caller (`@user`), like any rule.
- Absent → live intents are denied. There is no read-rule fallback.
- The live `tick()` is still your fine-grained gate (it decides what each intent *does*);
  `intentRule` is the coarse "may this principal act here at all."
- **Gate on identity, not wallet.** The caller is `@user = { id, address, email }`:
  `@user.id` is the universal stable identity (always present for an authed user —
  the wallet address for wallet logins, the account identity for email/social logins),
  `@user.address` is a real onchain wallet (null for email-only logins), and
  `@user.email` is the verified email (null for wallet logins). A live room is an
  offchain (`ephemeral`) collection, so membership/auth gates use `@user.id` —
  store `@user.id` in membership fields and gate on those fields. Reserve
  `@user.address` for genuinely onchain/wallet semantics (it is forbidden in
  `onchain:true` collections' rules to use `@user.id`, `@user.email`, or
  `@user.isAnonymous`).

## Checklist for a smooth live game

- [ ] Inputs go through `live.intent` (rides the WS) — no per-action HTTP.
- [ ] Input sent only on change + a small throttle (not every frame).
- [ ] Remote entities interpolated from a snapshot buffer (~100-180ms delay).
- [ ] Local player predicted from input, reconciled to the server.
- [ ] Continuous fields interpolated; discrete fields stepped.
- [ ] `intentRule` set on every live room.

## Scaling to many players (the climb past 1v1)

A room has one authoritative sim. That's plenty for a few players; the ceiling
you hit *first* as you add players is **fan-out**, not input. At N players ×
tickrate the server must compute and send N views per tick. The climb, in order:

1. **Area-of-interest views (you already have this).** `views(state)` projects a
   *per-player* view — send each client only the entities near them, not the whole
   world. This is the single biggest scaling lever and it's the same mechanism as
   fog-of-war. Keep each view as small as the player can actually perceive.
2. **Delta encoding.** Past a handful of players, stop sending full per-tick
   snapshots — send only the fields that changed since that client's last view.
   Bandwidth, not CPU, is usually what caps player count.
3. **Relay-tier fan-out.** When one room runtime can't push to everyone, keep
   one authoritative sim and fan out through relays. This shards outbound load
   without splitting the sim.
4. **Transport (only at twitch scale).** At 1v1/30Hz, TCP head-of-line blocking is
   noise. At 64-player *twitch*, more entities = more packets = a dropped packet
   stalls more — this is the scale where a UDP-style transport (WebTransport
   datagrams / a WebRTC relay) finally earns its keep. Until you *measure* that,
   WebSocket is correct.
5. **Single-room budget.** One match has one authoritative room loop. Light sims
   (hitscan) at 64 are feasible; heavy physics or 128+ means sharding the world by
   region. Prove 8–16 players in one room first — that measures your real room
   budget empirically, and 16→64 becomes a fan-out-sharding problem, not a redesign.

## Reference implementation

**Bounded Arena** (`https://arena.bounded.page`) is the living reference for this
whole doc: a server-authoritative 30Hz `session.live` arena with COMMAND-DRIVEN
player movement (§4b), exact input-replay reconciliation, server-clock
interpolation of remotes (§3/§4c), and an on-screen HUD showing view-gap
percentiles, input→ack latency, and the correction meter. Spectators read the
`"_all"` view. Measured on production: p50 view gap 33ms at 64 concurrent
connections per room; correction avg 0.00px over 4,000 commands. Agent players
use `WalletClient.live.subscribeView` + `WalletClient.live.intent` from
`@bounded-sh/server` (>= 0.0.34).

## Related
- [realtime-and-games.md](realtime-and-games.md) — sessions, tick, fog-of-war, tiers
- [live-runtime.md](live-runtime.md) — the native `init/tick/views` module; the tick `call` primitive
- [ai-npcs.md](ai-npcs.md) — a tick that `call`s a function = an AI NPC / in-game settlement
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — what the proof gate can/can't enforce
