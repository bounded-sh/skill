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
| `@DocumentPlugin.updateField(path, field, value)` | **overwrite** a single field with `value` | use to **patch one field** (a status, a propagated value) |

```json
{
  "messages/$messageId": {
    "fields": { "room": "String", "author": "Address", "body": "String" },
    "tier": "durable",
    "rules": {
      "read": "@user.id != null",
      "create": "@user.id != null && @newData.author == @user.id",
      "update": "false",
      "delete": "false"
    },
    "hooks": {
      "offchain": {
        "create": "@DocumentPlugin.updateField(\"rooms/lobby\", \"lastAuthor\", @newData.author)"
      }
    }
  }
}
```

Chain effects with `&&`; a falsy result short-circuits later calls.

> 🛑 **KNOWN BUG (verified 2026-06-16): a hook mutation silently drops NUMERIC
> values — only String and Bool values are written.** Both `updateField` and
> `putDocument` are affected. The triggering write still succeeds, so the loss is
> silent. Verified on staging:
>
> | Value | `updateField` / `putDocument` |
> |---|---|
> | String (`"open"`, `@newData.<String field>`) | ✅ written |
> | Bool (`true`) | ✅ written |
> | **Number** (`5`, `0`, `@newData.<UInt/Int field>`, a numeric field inside a `putDocument` object) | ❌ **dropped — no write** |
>
> So `updateField("c", "v", 5)` writes nothing, and
> `putDocument("receipts/x", { total: 99 })` writes **nothing** (a numeric
> required field → the whole doc is missing). Root cause: numeric values are
> `BigInt` in the hook VM and aren't converted before the mutation is staged.
> **Until fixed: do not maintain numeric state from a hook** (counters, totals,
> scores). A *constant* numeric reset can be written as a quoted string
> (`updateField("q", "used", "0")` stores `"0"`) but that stores a STRING — do
> NOT do this for a field under a `conserve`/`rollingSum` invariant, whose sums
> need real numbers. Propagate String/Bool fields freely; keep numeric
> aggregation on the client or the native live-runtime.
>
> **`updateField` is also a SET, not an increment** — `updateField("c","n","1")`
> stores `"1"` every time, not `n+1`; there is no read-modify-write counter
> primitive in a hook (use the native live-runtime `tick` module for an advancing
> clock). And `@time.now` does **not** resolve as a hook mutation value (it is a
> *rule* builtin) and the literal `"now"` just stores the string `"now"` — **so
> you cannot stamp a server timestamp from a hook today** either. For a write
> time, pass it from the client and propagate via `@newData.<field>`, or read the
> `tarobase_created_at` / `tarobase_updated_at` system fields on read.
>
> What DOES work as `value`: String/Bool literals (`"open"`, `true`) and
> String/Bool field refs from the triggering write (`@newData.author`,
> `@data.status`) — `@newData.author` → `rooms/lobby.lastAuthor` is verified.

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
"hooks": { "tick": { "advance": "@DocumentPlugin.updateField(\"rooms/sys\", \"phase\", \"running\")" } },
"session": { "tick": { "everyMs": 100, "run": "advance", "maxLifetimeSec": 3600 } }
```

(`updateField` SETS a literal — it can't increment a `tick` counter; a bytecode
tick hook is for flipping flags/status. For a real advancing game loop with
per-frame integration use the native live-runtime `init`/`tick` module in
[realtime-and-games.md](realtime-and-games.md).)

## hooks.scheduled + schedule — recurring jobs

`hooks.scheduled.<name>` declares the job body; `schedule` fires it on a cadence. A
schedule's `run` must name a declared `hooks.scheduled.<name>`.

```json
{
  "quotas/$quotaId": {
    "fields": { "used": "UInt", "owner": "Address!" },
    "tier": "durable",
    "rules": { "read": "@user.id != null", "create": "@user.id != null && @newData.owner == @user.id", "update": "@user.id != null && @newData.owner == @data.owner", "delete": "false" },
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

> ⚠️ **Staging status (verified 2026-06-16):** scheduled **hooks** fire reliably
> (they ride the room DO's `alarm()`), but scheduled **functions DO NOT fire yet**
> — confirmed by dogfooding: a `schedule:{every:"1m",run:"<function>"}` on a fresh
> app never invoked the function, while the same shape with a hook did. Root cause:
> a function-schedule is fired by the separate **heartbeat-dispatcher**, which reads
> a KV registry (`bounded-heartbeat-staging`: `cron:<expr> → [{appId, tasks:[{name,
> kind:"function", functionName}]}]` + `app:<appId>` reverse index). The dispatcher
> + KV exist, but the feature is non-operational at TWO layers (dogfood-verified):
> (1) **deploy doesn't register** schedules — nothing scans the policy for
> function-schedules, converts `every`→cron, and writes the `cron:`/`app:` KV
> entries; AND (2) **the dispatch chain doesn't fire even when the registry IS
> populated** — a manually-planted, correctly-formatted entry never invoked the
> function (and a pre-existing app's entry hadn't either), so the cron→queue→
> invoke-as-system path is broken/unprovisioned on staging (the queue
> `bounded-heartbeat-dispatch`, the `HEARTBEAT_SYSTEM_KEY` secret, and a
> `--env staging` deploy of the dispatcher all need verifying). **Workaround until fixed:** use a scheduled
> **hook** (`hooks.scheduled`) for the cadence; if you need to leave the boundary,
> have the hook flip a row that a `hooks.offchain`/function path reacts to, or invoke
> the function from your own cron. **To fix:** add the registry write (policy scan +
> duration→cron + KV `put`) to dev-api's policy-deploy path.

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
      "read": "@user.id != null",
      "create": "@user.id != null && @newData.owner == @user.id",
      "update": "false",
      "delete": "@user.id != null && @data.owner == @user.id"
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

> ✅ **Staging status (verified 2026-06-16):** `dueRows` fires reliably and **on
> time**. Dogfood: a reminder created with `scheduledAt = now + 15s` ran its
> `hooks.scheduled` hook at the due second (0s late) and `onComplete: "markDone"`
> flipped `done = true` — even though the collection's `update` rule is `"false"`,
> because the hook write is privileged. Note the hook's *sink* must be a real,
> declared collection+field it can write to (the example writes to a separate
> `firelog/global` doc, not back into the timer's own required-field schema).

> Unlike scheduled **functions** (see the schedule note above, broken on staging),
> `dueRows` running a **hook** is fully operational — it rides the row DO's
> `alarm()`, the same mechanism scheduled hooks use.

## webhooks — outbound notifications

`webhooks` posts to an external `https://` URL on the chosen ops. Use it to drive
email, analytics, anomaly detection, or any downstream system.

```json
{
  "orders/$orderId": {
    "fields": { "buyer": "Address", "total": "UInt" },
    "tier": "durable",
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "webhooks": [ { "url": "https://example.com/hooks/orders", "on": ["create"] } ]
  }
}
```

- `webhooks` is a non-empty array; multiple targets allowed.
- Each `url` must be a valid `https://` URL.
- `on` is a non-empty subset of `["create","update","delete"]` (no duplicates).

### The delivery (verified 2026-06-16)

Bounded `POST`s a JSON body (`Content-Type: application/json`) within a few
seconds of the commit. The body is the typed event:

```json
{
  "id": "orders/o123",
  "appId": "<appId>",
  "path": "orders/o123",
  "relativePath": "orders/$id",
  "operation": "create",
  "document": { "buyer": "<addr>", "total": 4200 },
  "previousDocument": null,
  "timestamp": 1781612200
}
```

Each delivery is **signed with Bounded's Ed25519 key** (asymmetric — there is no
shared secret to leak). Three headers carry the proof:

- `X-Bounded-Signature` — base64 Ed25519 signature over the **raw body bytes**.
- `X-Bounded-Key-Id` — which published key signed it (supports rotation).
- `X-Bounded-Timestamp` — unix seconds (also inside the body, so it is signed);
  reject deliveries outside your skew window to bound replay.

The public keys are served at
`GET <your realtime host>/.well-known/bounded-webhook-keys.json` →
`{ "keys": [ { "id", "alg": "ed25519", "publicKey": "<base64 raw 32-byte key>" } ] }`.

### Verifying a webhook on your server

Anyone can POST to a public URL, so verify the signature before acting on the
body. Use the shipped helper — `bounded-sh/server` exports **`verifyWebhook`**,
which fetches + caches Bounded's public key (from the well-known endpoint above),
checks the Ed25519 signature over the raw body, and enforces timestamp skew —
returning the typed payload or throwing `WebhookVerificationError`:

```ts
import { verifyWebhook, WebhookVerificationError } from "bounded-sh/server";

app.post("/hooks/orders", express.text({ type: "*/*" }), async (req, res) => {
  let event;
  try {
    event = await verifyWebhook(req.body, req.headers); // RAW body string + headers
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(401).end();
    throw err;
  }
  // event is trusted: { id, appId, path, operation, document, previousDocument, timestamp }
  res.status(200).end();
});
```

> **The keys URL follows your `init({ network })`.** A receiver that did
> `init({ network: 'bounded-staging' })` verifies against the **staging** signing
> keys automatically; with no `init` (a pure receiver) it falls back to the
> production endpoint (fail-closed). Pass `verifyWebhook(body, headers, { keysUrl })`
> only for a custom worker. (This network-awareness was a dogfood fix — the helper
> previously always hit the production keys URL, so staging deliveries failed
> verification unless you passed `keysUrl` by hand.)

Webhooks are **read-only fan-out** — never act on an unauthenticated body, and
treat the event as a *signal*: if you need to mutate Bounded state in response, do
it through a `bounded-sh/server` client so every rule + invariant is re-checked.
Full receiver walkthrough:
[../guides/building-a-backend.md](../guides/building-a-backend.md#receiving-webhooks).

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
