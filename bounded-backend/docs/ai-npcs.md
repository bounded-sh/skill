# AI NPCs / AI players — the tick calls a function, the reply lands as an effect

**The one idea:** an NPC is just a **function the tick calls**, and the model's
reply comes back as an `@effect` result on a *later* tick. There is no NPC
primitive, no bot runtime, no special "AI player" type — "NPC", "a player action
routed through a function", and "in-game settlement" are all the **same** one
primitive: a live `tick` returns a `call`, Bounded invokes the function after the
tick is recorded, and the result re-enters the loop as a recorded intent on the
reserved `@effect` address.

This is the live sibling of [functions.md](functions.md): the tick can't reach
the outside world itself (it's pure/sync/egress-disabled), so it delegates to a
function and reads the answer next time around. Read
[live-runtime.md](live-runtime.md) for the `call` primitive itself and
[principals-and-origins.md](principals-and-origins.md) for *who* the function
runs as and *where* the call came from (`@origin`).

## The funding recipe — `session.live.runAs` (the mature default)

A live tick has **no human** behind it. By default a call runs as the anonymous
**system principal** (`@user.*` all null) — which can't bill AI. To fund an NPC,
declare **`session.live.runAs`** once on the room's `live` block, pointing at a
**service wallet the owner funds with AI/external-services credit**. Every live call from that game
then acts as that wallet, and `ctx.ai` **Just Works** (capped at the app
account). That's the whole story:

1. **Fund it:** set `session.live.runAs: "<serviceAddress>"`; fund that account
   with AI/external-services credit.
2. **Gate it:** give the NPC function
   `auth: "@origin.kind == 'live' && @origin.module == '<yourGame>'"` so **only
   your game's tick** can reach it (`@origin` is platform-set and unforgeable).
3. **Call it:** the tick returns `{ state, call: { fn, args } }`; the reply lands
   as an `@effect` intent on a later tick.

> `runAs` is the session-wide live-call identity (declaring it IS the
> authorization to act as it — same posture as a function's `actAs`). A
> per-function **`actAs` still works** and overrides `runAs` for that one
> function; reach for it only when a single function needs a *different* identity.
> Precedence: `actAs` > `runAs` > anonymous system. See
> [service-keys.md](service-keys.md).

## The shape — three pieces

1. **Fund + whitelist + gate** in the policy: `session.live.runAs` (identity) +
   `session.live.calls` (whitelist) + the function's `@origin` `auth` rule (who
   may call).
2. **Emit the call from the tick:** `return { state, call: { fn, args } }`.
3. **Read the result on a later tick:** match the `@effect` intent by the `ref`
   you emitted.

```
tick N      -> return { state, call: { fn: "npcBrain", args: {...}, ref } }
   (Bounded invokes the function under the configured live-call identity; the function runs ctx.ai)
tick N+k    -> intents include { address: "@effect", intent: { effectId: ref, ok, result } }
```

The reply is **not** instant — it lands after a short delay, not necessarily on
the next tick (see Caveats).

## Worked example — a Claude/LLM NPC

### 1. Policy — fund with `runAs`, whitelist `npcBrain`, gate it with `@origin`

`session.live.runAs` declares the funded identity for *all* of this game's live
calls; `session.live.calls` is the whitelist of function names the tick may
invoke. The function's own `auth` rule — **now evaluated for live calls** —
pins it to your game's tick via `@origin`.

```json
{
  "constants": { "NPC_BOT": "9aZ…serviceAddress" },

  "rooms/$roomId": {
    "tier": "checkpointed",
    "fields": { "status": "String", "tick": "UInt" },
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "session": {
      "live": {
        "module": "arena",
        "everyMs": 33,
        "maxLifetimeSec": 1800,
        "runAs": "9aZ…serviceAddress",
        "calls": ["npcBrain"]
      }
    }
  },

  "rooms/$roomId/view/$userId": {
    "tier": "ephemeral",
    "fields": { "stateJson": "String" },
    "rules": { "read": "$userId == @user.id", "create": "false", "update": "false", "delete": "false" }
  },

  "functions": {
    "npcBrain": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/npcBrain.ts"
    }
  }
}
```

> The `auth` rule is the gate: `@origin.kind == 'live'` admits only a live tick
> (a direct end-user/SDK call has `@origin.kind == 'user'`), and
> `@origin.module == 'arena'` pins it to **this** game's module. `@origin` is
> platform-set and unforgeable, so no client and no other module can satisfy it. Always
> pair the `module` check with `@origin.kind == 'live'` — `module` is null for a
> `user` call. `bounded verify` understands `@origin`, so this rule both runs and
> proves.

### 2. The tick — emit a call, then read its `@effect` result later

```ts
// arena.live.ts — emit a call when the NPC needs to think, read the reply later.
export function tick(state, intents, dt) {
  state = { ...state, tick: (state.tick ?? 0) + 1 };

  // 2a. Land any NPC replies that came back as @effect intents.
  for (const i of intents) {
    if (i.address === "@effect" && i.intent.effectId === state.pendingRef) {
      if (i.intent.ok) state.npc.say = i.intent.result.text;   // the model's reply
      state.pendingRef = null;                                  // clear; allow the next think
    }
  }

  // 2b. Decide it's the NPC's turn to think. Emit ONE call; dedup on pendingRef.
  if (!state.pendingRef && npcShouldSpeak(state)) {
    const ref = `npc-${state.tick}`;
    state.pendingRef = ref;
    return {
      state,
      call: {
        fn: "npcBrain",                                         // must be in session.live.calls
        args: { prompt: buildPrompt(state), effectId: ref },
        ref,                                                    // YOUR idempotency key
      },
    };
  }

  return state;   // bare `return state` is unchanged / back-compatible
}
```

- `i.address === "@effect"` is **platform-only**: an intent carrying an effect result
  on any other address is rejected as forged, so a client cannot inject a fake
  NPC reply (see [live-runtime.md](live-runtime.md) and
  [principals-and-origins.md](principals-and-origins.md)).
- The optional `as` field on a `call` names a player as a validation hint, not
  an identity override. The call still acts as the session `runAs` / function
  `actAs` / anonymous system, never as that player. An NPC brain usually doesn't
  need `as`; it speaks as the `runAs` service identity. See
  [principals-and-origins.md](principals-and-origins.md).

### 3. The function — `ctx.ai.run`, funded by `runAs`

```ts
// functions/npcBrain.ts — runs as the service principal declared in session.live.runAs.
const seen = new Set<string>();

export default async function npcBrain(args, ctx) {
  // The policy `auth` rule is the REAL gate — it already proved this call came
  // from this game's live tick (@origin.kind == 'live' && @origin.module ==
  // 'arena') before your code ran; a direct client invoke was 403'd. The check
  // below is pure defense-in-depth, so write it to deny ONLY a positively-wrong
  // origin and PROCEED when origin is absent (never silently mute on a missing
  // origin): `ctx.origin && ctx.origin.kind !== 'live'`.
  if (ctx.origin && (ctx.origin.kind !== "live" || ctx.origin.module !== "arena")) {
    return { text: "" };
  }
  // Dedup on YOUR effectId.
  if (args.effectId && seen.has(args.effectId)) return { text: "" };
  if (args.effectId) seen.add(args.effectId);

  const out = await ctx.ai.run("claude-opus-4-8", {            // billed to runAs, capped at the app account
    messages: [
      { role: "system", content: "You are a terse arena NPC. One sentence." },
      { role: "user", content: args.prompt },
    ],
    max_tokens: 200,
  });

  return { text: out.response ?? out.text ?? "" };
}
```

`ctx.ai.run` bills the call's principal — here the `runAs` service account — and
spend is **capped at the app account** regardless of principal, so a depleted
account fails closed (no runaway bill).

**`ctx.origin` in the body.** For a live-tick call `ctx.origin` is the same
platform-set, unforgeable provenance the `auth` rule saw as `@origin` —
`{ kind: "live", path, module, room, tick }` — and it is `null` for any non-live
call. The policy `auth` rule is the **real gate** (it already proved the origin
before your code ran); the in-body check is only defense-in-depth, so guard
**narrowly**: deny only on a *positively-wrong* origin and proceed when it is
absent — `if (ctx.origin && ctx.origin.kind !== 'live') return { text: "" }`.
Do **not** write `if (ctx.origin?.kind !== 'live') return …` as a hard gate.
Let the proven `auth` rule do the gating; the in-body check is only extra
defense-in-depth.

## Caveats — state them to the user

- **Delayed, not instant.** An NPC reply lands a short delay after the tick that emitted
  the call. Design the loop to tolerate it (e.g. show "…thinking" until the
  `@effect` result arrives) — don't block the tick on it.
- **Dedup idempotently.** A call can in principle run more than once. **Dedup on `effectId`
  inside the function** (as the example does). Do **not** assume exactly-once.
- **Cap NPC spend / rate.** `ctx.ai` is capped per the app account's AI/external-services credit (a
  depleted account fails closed — no runaway bill), but also bound the *rate*:
  gate `npcShouldSpeak` (e.g. once every N ticks, or only on a player action) and
  keep `pendingRef` so at most one call is in flight. For a hard ceiling, fund the
  `runAs` service account with a small AI/external-services budget — see
  [billing.md](billing.md).
- **Gate by `@origin`, keep `calls` tight.** The `@origin` `auth` rule is what
  stops a direct client call from reaching the NPC brain; the `session.live.calls`
  whitelist is what the tick may invoke. Whitelist only functions the game should
  invoke, and gate each with `@origin.kind == 'live' && @origin.module == '<game>'`.

## Alternative — an external agent joins a room AS a player

If you'd rather run the AI **outside** the tick — a long-running agent with its
own logic, memory, and model loop — compose it as an ordinary player instead of
an in-tick `call`:

- A **backend-runtime agent** ([backend-runtime.md](backend-runtime.md)) or a
  plain **`@bounded-sh/server` keypair client**
  ([guides/building-for-agents.md](../guides/building-for-agents.md))
  `subscribeView`s the room and sends `live.intent` like any other client.
- **Its own keypair is its `@user.id`** — the agent is a first-class player, not
  a system principal, so it bills its own AI usage and its writes are governed by
  the same rules as a human. **Gate membership with `session.intentRule`** so
  only allowed identities can act.

```ts
// agent.ts — an external AI player. Its keypair = its @user.id.
import { live, createWalletClient } from "@bounded-sh/server";

const client = createWalletClient({ keypair });               // the agent's own identity
const roomPath = "rooms/r1";

const stop = await live.subscribeView(roomPath, {
  onData: async (view) => {
    const move = await decideMove(view);                      // the agent's own model/loop
    await live.intent(roomPath, move);                        // acts as itself, gated by intentRule
  },
});
```

Use the **in-tick `call`** when the NPC is part of the room's deterministic logic
(it must replay/checkpoint with the game). Use the **external agent** when the AI
is an independent participant with its own runtime, memory, and funding. Give
each agent its **own** keypair (`HOME` or `BOUNDED_PRIVATE_KEY`) — never share a
human's key (see [key-and-account-safety.md](key-and-account-safety.md)).

## Related

- [live-runtime.md](live-runtime.md) — the `call` primitive, `@effect`, the native tick
- [principals-and-origins.md](principals-and-origins.md) — system vs `runAs` vs acting-user; `@origin` (wired)
- [functions.md](functions.md) — the function the tick calls (the `@origin` auth gate, the live-call principal)
- [service-keys.md](service-keys.md) — `runAs` (session-wide) + `actAs` (per-function override) funded identities
- [backend-runtime.md](backend-runtime.md) — a long-running external agent through Bounded
- [agents-flue.md](agents-flue.md) — the Flue agent framework: a multi-step tool-use loop (vs an in-game NPC tick)
- [guides/building-for-agents.md](../guides/building-for-agents.md) — a `@bounded-sh/server` keypair agent, per-agent key isolation
- [billing.md](billing.md) — AI/external-services credit + per-account caps
