# Hooks, Anti-Cheat & Onchain Signing

This doc is the honest map of what Bounded's server-authoritative model
guarantees and what it cannot. Three parts: the hook policy model (who can
break what), games anti-cheat (provably secure vs. not), and the one place a
mainnet deploy needs a signature. For the *generation* side — exact `hooks`,
`session`, and `rollingSum` syntax — see
[hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) and
[realtime-and-games.md](realtime-and-games.md).

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

The escape hatch is `enforceRules`. Set it at the collection level
(`enforceRules: true`) or on the hook group (`hooks.enforceRules: true`) and
those hooks are held to the same per-actor `rules` an external writer would
face. Use it when a hook fans out writes you want bound by the same
authorization logic an external caller has.

> **Identity in rules.** The SDK `user` object is `{ id, address, email }`.
> `@user.id` is the **universal stable identity** — always present for any
> authenticated player (for wallet logins it equals the wallet address; for
> email/social logins it is the account identity). `@user.address` is a **real
> onchain wallet address** — present for wallet logins, `null` for email-only
> logins. `@user.email` is the verified, lowercased email (email logins only;
> null for wallet). Use **`@user.id` for ownership / membership / player-identity
> gates** — the offchain game collections below all key on `@user.id`. Reserve
> `@user.address` for genuinely onchain / wallet operations; inside an
> `onchain:true` collection only `@user.address` is allowed (`@user.id`,
> `@user.email`, and `@user.isAnonymous` are forbidden there).

```json
{
  "matches/$matchId": {
    "tier": "ephemeral",
    "fields": { "tick": "UInt", "winner": "String?", "host": "String!" },
    "rules": {
      "read":   "@user.id != null",
      "create": "@user.id != null && @newData.host == @user.id",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "tick": { "advance": "@DocumentPlugin.updateField(\"matches/sys\", \"tick\", \"1\")" }
    },
    "session": { "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 } }
  },
  "matches/$matchId/pot/$entryId": {
    "tier": "durable",
    "fields": { "amount": "Int", "owner": "String!" },
    "rules": {
      "read":   "@user.id != null",
      "create": "@user.id != null && @newData.owner == @user.id",
      "update": "@user.id != null && @data.owner == @user.id && @newData.owner == @data.owner",
      "delete": "false"
    },
    "invariants": [
      { "type": "conserve", "name": "pot_conserved", "field": "amount", "materialization": "direct" }
    ]
  }
}
```

(`invariants` are declared per collection on the field they protect; `tier`
must be `durable` for a `conserve`. The `tick` hook is a named entry under
`hooks.tick`, wired by the `session.tick.run`.)

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
  "matches/$matchId": {
    "tier": "ephemeral",
    "fields": { "tick": "UInt" },
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "hooks": { "tick": { "advance": "@DocumentPlugin.updateField(\"matches/sys\", \"tick\", \"1\")" } },
    "session": { "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 } }
  },
  "matches/$matchId/state/$stateId": {
    "tier": "ephemeral",
    "fields": { "blob": "String" },
    "rules": { "read": "false", "create": "false", "update": "false", "delete": "false" }
  },
  "matches/$matchId/view/$playerId": {
    "tier": "ephemeral",
    "fields": { "visibleJson": "String" },
    "rules": {
      "read":   "@user.id != null && $playerId == @user.id",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  },
  "matches/$matchId/inputs/$inputId": {
    "tier": "durable",
    "fields": { "player": "String", "action": "String", "weight": "UInt", "at": "UInt!" },
    "rules": {
      "read":   "false",
      "create": "@user.id != null && @newData.player == @user.id && @newData.weight == 1",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      { "type": "rollingSum", "name": "input_rate_cap",
        "field": "weight", "windowSeconds": 1, "limit": 20, "scopeVariable": "$matchId" }
    ]
  }
}
```

(A `rollingSum` field is `UInt`, lives on the collection it caps, and forces
`tier: "durable"`. `scopeVariable` is a `$path` variable; per-player scoping
uses a player path segment. The view/state collections stay `ephemeral`.)

> **Pin the cap weight in the create rule** (`@newData.weight == 1`). Without it
> a client can append `weight: 0` and the rate cap never increments — the limit is
> silently bypassed. The rule, not the client, must fix each event's cost. (Use a
> fixed set like `@newData.weight == 1 || @newData.weight == 5` when different
> inputs cost different amounts.) Full recipe — including writing the input and
> any paired action in one atomic `setMany` — in
> [invariants.md](invariants.md#recipe--rate-limit-an-action-with-a-separate-event-log).

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

**Client-reported results / leaderboards.** The same trap, one step later: the
game is server-authoritative, but the *outcome* is recorded by a client write into
a durable `matches`/leaderboard collection gated by `create: "@newData.winner ==
@user.address"`. That rule only checks the caller *names themselves* the winner —
it has **no link to the server-authoritative result the tick computed** — so the
loser (or anyone who never joined) can forge a win. (Verified by dogfooding a
native game: a fresh keypair wrote a winning record for a non-existent room.) The
fix is the same — keep the result on the **server-authoritative side**: have the tick
decide the winner and project it in `views(state)`, then read it from the player's
**view** (`subscribeView`). Do *not* `get()`/`subscribe()` the live room doc for
live state; use `subscribeView`. For a durably queryable leaderboard, fold
results through `session.tick` settlement or call a settle function from native
live; do not let the client self-report the result — see
[live-runtime.md](live-runtime.md#recording-the-result-per-room-authoritative-today-read-it-through-the-view).

## Onchain-update signing note

Updating a **mainnet** app's policy requires an onchain **authority-permit
signature** — the on-chain program must see a signed permit from the app
authority before accepting a new policy. That is real friction for an
agent-first workflow.

- **Deferred.** Frictionless agent signing of the authority permit is on the
  not currently available. For now a mainnet policy update is a deliberately
  human-gated step.
- **The default path never hits it.** Realtime / offchain apps — the default
  protocol, and what nearly every app starts as — update their policy with no
  onchain signature at all. You only encounter the permit when you
  deliberately put a policy on a mainnet onchain program.

When advising an agent: assume the default realtime/offchain path and do not
introduce onchain signing unless the user explicitly targets a mainnet onchain
program.

## Related

- [hooks-scheduled-webhooks.md](hooks-scheduled-webhooks.md) — exact `hooks` / `enforceRules` syntax
- [realtime-and-games.md](realtime-and-games.md) — sessions, ticks, fog-of-war, settlement
- [policy-reference.md](policy-reference.md) — `hooks` and the rule expression language
- [invariants.md](invariants.md) — `rollingSum` + `scopeVariable` for per-player caps
- [proof-coverage.md](proof-coverage.md) — what invariants are proven on which runtime
