# AI NPCs / AI players — the tick calls a function, the reply lands as an effect

**The one idea:** an NPC is just a **function the tick calls**, and the model's
reply comes back as an `@effect` result on a *later* tick. There is no NPC
primitive, no bot runtime, no special "AI player" type — "NPC", "a player action
routed through a function", and "in-game settlement" are all the **same** one
primitive: a live `tick` returns a `call`, the host runs the function after the
checkpoint alarm, and the result re-enters the loop as a recorded intent on the
reserved `@effect` address.

This is the live sibling of [functions.md](functions.md): the tick can't reach
the outside world itself (it's pure/sync/egress-disabled), so it delegates to a
function and reads the answer next time around. Read
[live-runtime.md](live-runtime.md) for the `call` primitive itself and
[principals-and-origins.md](principals-and-origins.md) for *who* the function
runs as.

## The shape — three pieces

1. **Whitelist the function** in the session policy: `session.live.calls`.
2. **Emit the call from the tick:** `return { state, call: { fn, args } }`.
3. **Read the result on a later tick:** match the `@effect` intent by the `ref`
   you emitted.

```
tick N      → return { state, call: { fn: "npcBrain", args: {...}, ref } }
   (host drains the call after the checkpoint alarm → POSTs the function → runs ctx.ai)
tick N+k    → intents include { address: "@effect", intent: { effectId: ref, ok, result } }
```

The reply is **not** instant — effects run on the **checkpoint-alarm cadence**,
not per tick, so an NPC turn lands after a short delay (see Caveats).

## Worked example — a Claude/LLM NPC

### 1. Policy — whitelist `npcBrain`, declare it as a funded function

`session.live.calls` is the owner-declared list of function names the tick may
invoke. It is the **primary (today, the only) authorization gate** on a live
call — a whitelisted function runs for live calls **without** an additional
per-function `auth` check (see [functions.md](functions.md) and
[principals-and-origins.md](principals-and-origins.md)). Only whitelist
functions you trust the game to invoke unconditionally.

The function declares `actAs: <serviceAddress>` — this is what makes the NPC
**funded** (see step 3 for why a bare call's `ctx.ai` fails).

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
      "auth": "false",
      "entry": "functions/npcBrain.ts",
      "actAs": "9aZ…serviceAddress"
    }
  }
}
```

> The `auth: "false"` is deliberate: a live (system) call does **not** evaluate
> the function's own `auth` rule, so this function can't be invoked directly by a
> client (its `auth` denies everyone) — only the game's `calls` whitelist lets
> the tick reach it. That's the secure default for an NPC brain.

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
        args: { prompt: buildPrompt(state) },
        ref,                                                    // YOUR idempotency key
      },
    };
  }

  return state;   // bare `return state` is unchanged / back-compatible
}
```

- `i.address === "@effect"` is **host-only**: an intent carrying an effect result
  on any other address is rejected as forged, so a client cannot inject a fake
  NPC reply (see [live-runtime.md](live-runtime.md) and
  [principals-and-origins.md](principals-and-origins.md)).
- The field a developer writes to act for a player is **`as`** (not
  `onBehalfOf`) — but acting **as the triggering player** is **ROADMAP**, not
  wired today (a valid `as` is currently treated as the system principal). An NPC
  brain doesn't need `as`; it speaks as itself.

### 3. The function — `ctx.ai.run`, funded via `actAs`

```ts
// functions/npcBrain.ts — runs as the service principal (actAs: NPC_BOT).
const seen = new Set<string>();

export default async function npcBrain(args, ctx) {
  // Dedup on YOUR effectId — the platform does NOT dedup the ref yet.
  if (args.effectId && seen.has(args.effectId)) return { text: "" };
  if (args.effectId) seen.add(args.effectId);

  const out = await ctx.ai.run("claude-opus-4-8", {            // billed to ctx.user.id
    messages: [
      { role: "system", content: "You are a terse arena NPC. One sentence." },
      { role: "user", content: args.prompt },
    ],
    max_tokens: 200,
  });

  return { text: out.response ?? out.text ?? "" };
}
```

## The billing truth (read this before shipping)

`ctx.ai.run` bills the **caller's `user.id`**. A bare live `call` runs as the
**SYSTEM principal** — `ctx.user` is `{ id: null, address: null, email: null,
system: true }`. With `user.id == null` there is **no account to bill**, so
`ctx.ai` **fails with `402`**. A system-principal NPC literally cannot run
inference.

**To get a funded Claude/LLM NPC, the called function MUST declare
`actAs: <serviceAddress>`** and the **owner funds that service account with AI
credit**. With `actAs`, `ctx.user.id == ctx.user.address == <serviceAddress>`,
inference bills that funded service account, and the NPC works. This is the
**only** way to ship a real LLM NPC today.

`actAs` needs **no private key** for AI or data-plane writes — it's an
owner-declared policy field (`functions` block), and identity is asserted by the
platform, never by a caller header. A key is only needed if the function also
*signs* an onchain transaction. See [service-keys.md](service-keys.md) for the
full `actAs` model (the live-call row is in its no-caller table).

| Caller of the function | `ctx.user` | `ctx.ai` works? |
|---|---|---|
| Bare live `call` (no `actAs`) | system, all-null | **No** — `402`, no account to bill |
| Live `call` to a function with `actAs` | the funded service address | **Yes** — bills the service account |

## Caveats — state them to the user

- **Delayed, not instant.** Effects drain on the **checkpoint-alarm cadence**
  (not per tick), so an NPC reply lands a short delay after the tick that emitted
  the call. Design the loop to tolerate it (e.g. show "…thinking" until the
  `@effect` result arrives) — don't block the tick on it.
- **No platform dedup yet.** The platform does **not** dedup on the idempotency
  `ref`, so a call can in principle run more than once. **Dedup on `effectId`
  inside the function** (as the example does). Do **not** assume exactly-once.
- **Whitelist = the gate.** A function in `session.live.calls` runs for live
  calls with no per-function `auth` check, so only whitelist functions you trust
  the game to invoke unconditionally.
- **Cap NPC spend / rate.** `ctx.ai` is capped per the service account's AI
  credit (a depleted account fails closed — no runaway bill), but also bound the
  *rate*: gate `npcShouldSpeak` (e.g. once every N ticks, or only on a player
  action) and keep `pendingRef` so at most one call is in flight. For a hard
  ceiling, fund the service account with a small AI-credit budget — see
  [billing.md](billing.md).
- **Acting as the triggering player is ROADMAP.** Today an NPC speaks as the
  funded service identity. Routing a model's action back as the *human player who
  triggered it* (`as: playerId`) is not wired — see
  [principals-and-origins.md](principals-and-origins.md).

## Alternative — an external agent joins a room AS a player

If you'd rather run the AI **outside** the tick — a long-running agent with its
own logic, memory, and model loop — compose it as an ordinary player instead of
an in-tick `call`:

- A **backend-runtime agent** ([backend-runtime.md](backend-runtime.md)) or a
  plain **`bounded-sh/server` keypair client**
  ([guides/building-for-agents.md](../guides/building-for-agents.md))
  `subscribeView`s the room and sends `live.intent` like any other client.
- **Its own keypair is its `@user.id`** — the agent is a first-class player, not
  a system principal, so it bills its own AI usage and its writes are governed by
  the same rules as a human. **Gate membership with `session.intentRule`** so
  only allowed identities can act.

```ts
// agent.ts — an external AI player. Its keypair = its @user.id.
import { live, createWalletClient } from "bounded-sh/server";

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
- [principals-and-origins.md](principals-and-origins.md) — system vs `actAs` vs acting-user; `@origin` (ROADMAP)
- [functions.md](functions.md) — the function the tick calls (the live-call principal context)
- [service-keys.md](service-keys.md) — `actAs`: fund an AI NPC / live call with a service account
- [backend-runtime.md](backend-runtime.md) — a long-running external agent through Bounded
- [guides/building-for-agents.md](../guides/building-for-agents.md) — a `bounded-sh/server` keypair agent, per-agent key isolation
- [billing.md](billing.md) — AI credit + per-account caps
