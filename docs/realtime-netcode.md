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
  live.intent(roomId, { type: "input", mv, aim });
}
```

Discrete actions (attack, ability) are events — send them on the keypress, always.

## 3. Interpolate REMOTE players (hide jitter)

If you render the latest snapshot directly, a late snapshot freezes the entity then
rubber-bands when it arrives (a visible snap). Instead, buffer timestamped snapshots
and render ~100ms **in the past**, lerping between the two surrounding ones. The
buffer absorbs jitter and delivery gaps.

```ts
// on each view: f.buf.push({ t: performance.now()/1000, x: pv.x, z: pv.z }) (keep ~20)
// each frame:
const target = nowS - 0.10;                     // 100ms interpolation delay
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
    "live": { "module": "game", "everyMs": 33 },
    "intentRule": "@user.address != null && @user.address in @data.players"
  },
  "rules": { "read": "@user.address != null", "create": "...", "update": "false", "delete": "false" }
}
```

- Evaluated room-side against the room doc (`@data`) + caller (`@user`), like any rule.
- Absent → falls back to the read rule (back-compat). Both fail closed.
- The live `tick()` is still your fine-grained gate (it decides what each intent *does*);
  `intentRule` is the coarse "may this principal act here at all."

## Checklist for a smooth live game

- [ ] Inputs go through `live.intent` (rides the WS) — no per-action HTTP.
- [ ] Input sent only on change + a small throttle (not every frame).
- [ ] Remote entities interpolated from a snapshot buffer (~100ms delay).
- [ ] Local player predicted from input, reconciled to the server.
- [ ] Continuous fields interpolated; discrete fields stepped.
- [ ] `intentRule` set if "can see" ≠ "can act" for your room.

## Related
- [realtime-and-games.md](realtime-and-games.md) — sessions, tick, fog-of-war, tiers
- [live-runtime.md](live-runtime.md) — the native `init/tick/views` module
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — what the proof gate can/can't enforce
