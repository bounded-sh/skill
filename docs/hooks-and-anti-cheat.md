# Hooks, Anti-Cheat & Onchain Signing

This doc is the honest map of what Bounded's server-authoritative model
guarantees and what it cannot. Three parts: the hook policy model (who can
break what), games anti-cheat (provably secure vs. not), and the one place a
mainnet deploy needs a signature.

## The hook policy model

Two layers protect data, and they protect against different things. Keep them
straight or you will mis-describe a guarantee to a user.

- **Invariants hold against EVERYTHING.** A proven invariant is a
  postcondition on committed state. Nothing breaks it — not users, not agents,
  not hooks, not cron, not settlement, not ticks. Any write from any source
  that would violate it is rejected and nothing partial is applied. There is
  no actor with an exemption from a proven invariant.
- **Rules gate EXTERNAL actors.** The per-collection `rules`
  (`read`/`create`/`update`/`delete`) decide which *external* writers — users
  and agents — may attempt a write. This is the per-caller authorization
  layer, and it fails with `403`.
- **Hooks are PRIVILEGED server logic.** A hook is your own code running
  inside the trust boundary (on a tick, on a write, on cron, on settlement).
  By default a hook **bypasses the per-actor rules** — that is the entire
  point of server logic: the tick advances state that no user is allowed to
  advance directly.

The escape hatch is `enforceRules`. Set it on a collection or an individual
hook and that hook is held to the same per-actor `rules` an external writer
would face. Use it when a hook fans out writes you want bound by the same
authorization logic an external caller has.

```json
{
  "collections": {
    "matches/$matchId": {
      "schema": { "tick": "number", "winner": "string?" },

      "rules": {
        "read":   "true",
        "create": "@user.address == @newData.host",
        "update": "false"
      },

      "hooks": {
        "onTick":       { "trigger": "cron",  "enforceRules": false },
        "onPlayerMove": { "trigger": "write", "enforceRules": true  }
      }
    }
  },

  "invariants": [
    { "type": "conserve", "scope": "matches/$matchId/pot/$id.amount" }
  ]
}
```

**`enforceRules` relaxes rules, never invariants.** Even with
`enforceRules: false`, a hook's writes are still checked against every proven
invariant. A privileged hook can do things no user can — but it still cannot
mint money, break conservation, or exceed a rolling cap. The proofs are the
floor; rules are an additional gate on top, applied only to external actors.

## Games anti-cheat: provably secure vs. not

A cheat is an actor doing something the game should not allow. For each cheat
the question is: *can the client do it at all?* Bounded answers that with
server authority + proofs for a large class of cheats — and is explicit about
the one class no backend fully cures.

### SECURE — provably shut down through Bounded

| Cheat | How Bounded shuts it down |
|---|---|
| State manipulation (teleport, set health/score) | **Server-authoritative tick state.** Game state lives in a collection no external writer can update (`update: "false"`); only the tick hook advances it. Clients send *intents*, never state. There is no write path for a forged tick. |
| Maphacks / wallhacks / seeing hidden info | **Fog-of-war via per-player view collections.** The tick projects into `view/$playerId` only what that player may see. Hidden data (other hands, fogged tiles) never reaches the client, so patching the client cannot reveal it. |
| Macro / turbo-fire / inhuman action rate | **Provable per-player rate & timing caps.** A `rollingSum` with `scopeVariable` proves a per-player ceiling on inputs per window; reaction-time rules reject inputs arriving faster than humanly possible after the stimulus. Proven bounds, enforced per partition. |
| Forging / disputing what a player did | **Tamper-proof server-side input log.** Inputs are append-only, owner-attributed, immutable (`update/delete: "false"`). The authoritative record lives on the server, not editable by clients. |
| Detection needing heavy/external analysis | **Webhooks to external detection.** The immutable input log streams to your own anomaly/ML scoring. Bounded gives the trustworthy substrate to analyze. |

```json
{
  "collections": {
    "matches/$matchId/state": {
      "rules": { "read": "false", "create": "false", "update": "false" },
      "hooks": { "tick": { "trigger": "cron", "enforceRules": false } }
    },

    "matches/$matchId/view/$playerId": {
      "rules": {
        "read":   "@user.address == $playerId",
        "create": "false",
        "update": "false"
      }
    },

    "matches/$matchId/inputs/$id": {
      "schema": { "player": "string", "action": "string", "at": "number!" },
      "rules": {
        "read":   "false",
        "create": "@user.address == @newData.player",
        "update": "false",
        "delete": "false"
      }
    }
  },

  "invariants": [
    {
      "type": "rollingSum",
      "scope": "matches/$matchId/inputs/$id.weight",
      "scopeVariable": "player",
      "limit": 20
    }
  ]
}
```

### NOT FULLY SOLVABLE — by anyone

**Human-speed scripting.** An aimbot (or bot) that fires only *legal* inputs,
at *human-plausible* timing, but with superhuman accuracy or decision quality,
sends nothing the rules can reject — every input is individually valid. No
backend, Bounded included, can prove an input was produced by a human rather
than a script. Be explicit with users about this: Bounded gives the strongest
available tools — proven per-player timing caps, the tamper-proof input log,
and webhooks to behavioral detection — but the residual is a statistical/ML
detection problem on legal inputs, and **no one fully cures it**. Do not let a
user believe Bounded "solves" cheating; it solves the part that is structural
and gives the best substrate for the part that is statistical.

### NEVER SECURE — don't build it this way

**Client-authoritative writes.** If the client writes score/health/position
directly into a collection (no tick, no server projection), nothing above
applies — the client is the source of truth and the client is the attacker.
This is the one design Bounded cannot rescue. The fix is structural: move
state behind a tick and accept intents.

## Onchain-update signing note

Updating a **mainnet** app's policy requires an onchain **authority-permit
signature** — the on-chain program must see a signed permit from the app
authority before accepting a new policy. That is real friction for an
agent-first workflow.

- **Deferred.** Frictionless agent signing of the authority permit is on the
  roadmap, not shipped. For now a mainnet policy update is a deliberately
  human-gated step.
- **The default path never hits it.** Realtime / offchain apps — the default
  protocol, and what nearly every app starts as — update their policy with no
  onchain signature at all. You only encounter the permit when you
  deliberately put a policy on a mainnet onchain program.

When advising an agent: assume the default realtime/offchain path and do not
introduce onchain signing unless the user explicitly targets a mainnet onchain
program.

## Related

- [policy-reference.md](policy-reference.md) — `hooks` and the rule expression language
- [invariants.md](invariants.md) — `rollingSum` + `scopeVariable` for per-player caps
- [proof-coverage.md](proof-coverage.md) — what invariants are proven on which runtime
