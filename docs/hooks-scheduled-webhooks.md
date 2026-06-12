# Hooks, Scheduled Jobs & Webhooks

**What's in here / when to read this:** in-boundary side-effects (`hooks`),
recurring/one-shot jobs (`schedule`/`dueRows` — which can run a hook OR a
function), and outbound notifications (`webhooks`).

Side effects, recurring work, and outbound notifications. The unifying idea:
**invariants bind everything.** A hook, a tick, a scheduled job, and a webhook
fan-out are all *server logic inside the trust boundary* — none of them can break
a proven invariant, and none of them gate (only `rules` and `invariants` reject
writes). For the games/anti-cheat deep dive see
[hooks-and-anti-cheat.md](hooks-and-anti-cheat.md).

## hooks.offchain — side effects on write

Attach an effect to `create`/`update`/`delete`. Offchain hooks call **offchain**
plugins; in practice that is `@DocumentPlugin`:

| Call | Effect | "put vs updateField" |
|---|---|---|
| `@DocumentPlugin.putDocument(path, data)` | create or fully replace a document | use to **write a whole derived document** |
| `@DocumentPlugin.updateField(path, field, value)` | set a single field | use to **bump/patch one field** (a counter, a status) |

```json
{
  "messages/$messageId": {
    "fields": { "room": "String", "author": "Address", "body": "String" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && @newData.author == @user.address",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "offchain": {
        "create": "@DocumentPlugin.updateField(\"rooms/lobby\", \"lastMessageAt\", \"now\")"
      }
    }
  }
}
```

Chain effects with `&&`; a falsy result short-circuits later calls.

> **An onchain plugin (`@TokenPlugin.transfer`, …) in an offchain hook is
> rejected by the validator.** Onchain plugins belong in `hooks.onchain` on a
> `"onchain": true` collection.

**Hooks never gate.** There is no throw-from-a-hook. If you want a write to fail,
that is a `rules` predicate (`403`) or an `invariants` postcondition (`409`).

## enforceRules — privileged vs. caller-bound hooks

By default a hook is **privileged**: it bypasses the per-actor `rules`. That is the
point of server logic — a tick advances state no user may write directly. Two
escape hatches hold a hook to the same rules an external caller faces:

- `hooks.enforceRules: true` — applies to the hook group on that collection.
- `enforceRules: true` — collection-level.

```json
"hooks": {
  "offchain": { "create": "@DocumentPlugin.updateField(\"audit/log\", \"last\", \"x\")" },
  "enforceRules": true
}
```

**`enforceRules` relaxes rules, never invariants.** Even with `enforceRules: false`,
every hook write is still checked against every proven invariant. A privileged hook
can do things no user can — but it still cannot mint money, break conservation, or
exceed a rolling cap. Proofs are the floor; rules are an extra gate on external
actors only.

## hooks.tick — the realtime game loop

`hooks.tick.<name>` declares a named server-loop step, fired by a `session`
block's `tick`. The hook body is a string; the named hook must exist under
`hooks.tick` for the session to validate. Full realtime treatment in
[realtime-and-games.md](realtime-and-games.md).

```json
"hooks": { "tick": { "advance": "@DocumentPlugin.updateField(\"rooms/sys\", \"tick\", \"1\")" } },
"session": { "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 } }
```

## hooks.scheduled + schedule — recurring jobs

`hooks.scheduled.<name>` declares the job body; `schedule` fires it on a cadence. A
schedule's `run` must name a declared `hooks.scheduled.<name>`.

```json
{
  "quotas/$quotaId": {
    "fields": { "used": "UInt", "owner": "Address!" },
    "tier": "durable",
    "rules": { "read": "@user.address != null", "create": "@user.address != null && @newData.owner == @user.address", "update": "@user.address != null && @newData.owner == @data.owner", "delete": "false" },
    "hooks": { "scheduled": { "resetQuota": "@DocumentPlugin.updateField(\"quotas/global\", \"used\", \"0\")" } },
    "schedule": { "every": "1d", "run": "resetQuota" }
  }
}
```

- `every` is a duration string: `<n>s|m|h|d`, between `1s` and `366d`.
- `schedule` may be one object or an array of them (several cadences, one
  collection).
- **Schedules are offchain-only** — a scheduled mutation needs a server signer,
  which an onchain collection lacks. Declaring `schedule` on `"onchain": true` is
  rejected.

> **`run` is unified: it may name a hook OR a Function.** The validator resolves
> `schedule.run` (and `dueRows.run`) to **either** a declared
> `hooks.scheduled.<run>` bytecode hook **or** a top-level `functions.<run>`
> [Bounded Function](functions.md). Naming a function runs it on the cadence,
> fired by the heartbeat as the **system principal** (the owner-deployed schedule
> *is* the authorization; the user-facing `auth` rule is skipped). Use a **hook**
> for an in-boundary cadence (reset a quota); use a **function** when the
> scheduled work must leave the boundary (pull FX rates, call an LLM). Either
> way, every write still goes through your rules + invariants.

## dueRows — one-shot timers

Where `schedule` is "every N", `dueRows` is "once, when this row is due." A
document carrying a numeric `scheduledAt` (Unix seconds) fires the named
`hooks.scheduled.<run>` once when due, then is deleted or marked done.

```json
{
  "reminders/$reminderId": {
    "fields": { "owner": "Address!", "message": "String", "scheduledAt": "UInt", "done": "Bool?" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null && @newData.owner == @user.address",
      "update": "false",
      "delete": "@user.address != null && @data.owner == @user.address"
    },
    "hooks": { "scheduled": { "fire": "@DocumentPlugin.updateField(\"reminders/log\", \"last\", \"fired\")" } },
    "dueRows": { "run": "fire", "onComplete": "markDone", "doneField": "done" }
  }
}
```

| Key | Required | Meaning |
|---|---|---|
| `run` | yes | a declared `hooks.scheduled.<run>` **or** a top-level `functions.<run>` (same unification as `schedule.run`) |
| `onComplete` | no | `"delete"` (default-ish) or `"markDone"` |
| `doneField` | no | the `Bool` field flipped when `onComplete: "markDone"` |

Also offchain-only.

## webhooks — outbound notifications

`webhooks` posts to an external `https://` URL on the chosen ops. Use it to drive
email, analytics, anomaly detection, or any downstream system.

```json
{
  "orders/$orderId": {
    "fields": { "buyer": "Address", "total": "UInt" },
    "tier": "durable",
    "rules": { "read": "@user.address != null", "create": "@user.address != null", "update": "false", "delete": "false" },
    "webhooks": [ { "url": "https://example.com/hooks/orders", "on": ["create"] } ]
  }
}
```

- `webhooks` is a non-empty array; multiple targets allowed.
- Each `url` must be a valid `https://` URL.
- `on` is a non-empty subset of `["create","update","delete"]` (no duplicates).

### Verifying a webhook on your server

Anyone can POST to a public URL, so authenticate every delivery with a shared
secret you control before acting on the body. The full receiver pattern (a
constant-time `Authorization` compare, then mutate state via `@bounded/server`
if needed) is in
[../guides/building-a-backend.md](../guides/building-a-backend.md#receiving-webhooks).
Webhooks are read-only fan-out — never act on an unauthenticated body.

## The model in one line

`rules` gate external writers (403). `invariants` are postconditions nothing can
break (409). `hooks` / `tick` / `scheduled` / `dueRows` are privileged server
logic that still answer to every invariant. `webhooks` are read-only fan-out to the
outside. Authorization, correctness, side effects, and notification are four
separate concerns — keep them in their own keys.

## Related

- [policy-reference.md](policy-reference.md) — the `hooks` key and expression language
- [functions.md](functions.md) — naming a function in `schedule.run` / `dueRows.run`
- [realtime-and-games.md](realtime-and-games.md) — `hooks.tick` + `session`
- [hooks-and-anti-cheat.md](hooks-and-anti-cheat.md) — the trust-boundary deep dive
- [invariants.md](invariants.md) — the postconditions hooks can't break
