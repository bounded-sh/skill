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

> **Values that work as `value`:** String/Number/Bool literals, and field refs
> from the triggering write (`@newData.<field>`, `@data.<field>`). Numbers,
> strings, and bools all persist — `updateField("c", "v", 5)` stores `5`,
> `putDocument("receipts/x", { total: 99 })` writes the doc, and
> `@newData.author` → `rooms/lobby.lastAuthor` propagates.
>
> Two real limitations remain (both have a client-side answer):
> - **`updateField` is a SET, not an increment** — `updateField("c","n",1)` stores
>   `1` every time, not `n+1`; there is no read-modify-write counter primitive in a
>   hook. For an atomic counter, increment from the **client write** with the
>   `increment(n)` field-value helper ([sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md)); for an
>   advancing game clock use the native live-runtime `tick` module
>   ([realtime-and-games.md](realtime-and-games.md)).
> - **`@time.now` does not resolve as a hook mutation value** (it is a *rule*
>   builtin) and the literal `"now"` just stores the string `"now"` — so you can't
>   stamp a server timestamp from a hook. Stamp it from the **client write** with
>   `serverTimestamp()` ([sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md)), propagate via
>   `@newData.<field>`, or read the `_createdAt` / `_updatedAt`
>   system fields on read.
>
> For `putDocument`, pass the data as an **object literal**
> (`putDocument("p", { total: 99 })`) — a JSON-**string** data arg
> (`putDocument("p", "{ total: 99 }")`) is not supported and may not write.

> **An onchain plugin (`@TokenPlugin.transfer`, …) in an offchain hook is
> rejected by the validator.** Onchain plugins belong in `hooks.onchain` on a
> `"onchain": true` collection.

**Hooks never gate.** There is no throw-from-a-hook. If you want a write to fail,
that is a `rules` predicate (`403`) or an `invariants` postcondition (`409`).

## enforceRules — privileged vs. caller-bound hooks

**Only `updateField` is privileged (verified 2026-06-16).** A hook
`@DocumentPlugin.updateField` write bypasses the destination collection's `rules`
by design — that is the point of server logic (a tick advances state no user may
write directly). A hook `@DocumentPlugin.putDocument` write is **always checked
against the destination collection's `create`/`update` rule** (it re-enters the
normal rule path at its destination), so it is *not* a privileged escape hatch —
if the destination denies the write, it is silently skipped. Use `updateField`
when you need the privileged bypass; use `putDocument` for derived docs whose
destination rules the hook should still satisfy.

To hold an `updateField` hook to the same rules an external caller faces, declare
`enforceRules: true`. It may live in **either** place (both work):

- on the **source** hook group (`hooks.enforceRules: true`) — "hold THIS hook's
  writes to a caller's rules" (this is the example below), or
- on the **destination** collection (`enforceRules: true` at the collection level)
  — "this collection enforces its rules against every writer, including hooks."

```json
"hooks": {
  "offchain": { "create": "@DocumentPlugin.updateField(\"audit/log\", \"last\", \"x\")" },
  "enforceRules": true
}
```

With `enforceRules`, the `updateField` write evaluates the destination's
`create`/`update` rule and a denied write is skipped — exactly like `putDocument`
already behaves.

**`enforceRules` relaxes rules, never invariants.** Even with `enforceRules: false`,
every hook write (`updateField` *and* `putDocument`) is still checked against every
proven invariant. A privileged hook can do things no user can — but it still cannot
mint money, break conservation, or exceed a rolling cap. Proofs are the floor; rules
are an extra gate on external actors only.

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

> **A schedule runs a HOOK.** `schedule.run` (and `dueRows.run`) names a declared
> `hooks.scheduled.<run>` bytecode hook, fired on the cadence as a privileged
> in-boundary write (still checked by your invariants). This is the recurring-job
> primitive — use it to reset a quota, roll a counter, advance a clock.
>
> **Running a Bounded *function* on a schedule is available now.** A `schedule.run`
> (or `dueRows.run`) that names a `functions.<name>` **fires on the cadence** — and unlike an in-boundary hook,
> a function can leave the boundary (pull FX rates, call an LLM via `ctx.ai.run`) and
> write through your rules + invariants with `ctx.bounded`. Add `"actAs": "<addr>"`
> to the function so it runs as a real identity. **Deploy-ordering:** the function
> must be deployed for its schedule to register — deploy the function before (or with)
> the policy that schedules it; a later `functions deploy` re-registers, so the order
> self-heals. Use a scheduled **hook** when the work is a pure in-boundary write (reset
> a quota, roll a counter) or when you need the due row's id (functions don't yet
> receive it — see [functions.md](functions.md)).

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
| `run` | yes | a declared `hooks.scheduled.<run>` hook (naming a `functions.<run>` is accepted by the validator but does not fire yet — see the schedule note above) |
| `onComplete` | no | `"delete"` (default-ish) or `"markDone"` |
| `doneField` | no | the `Bool` field flipped when `onComplete: "markDone"` |

Also offchain-only.

> **`dueRows` fires on time.** A reminder created with `scheduledAt = now + 15s`
> runs its `hooks.scheduled` hook at the due second and `onComplete: "markDone"`
> flips `done = true` — even though the collection's `update` rule is `"false"`,
> because the hook write is privileged. Note the hook's *sink* must be a real,
> declared collection+field it can write to (the example writes to a separate
> `firelog/global` doc, not back into the timer's own required-field schema).
> `dueRows` running a **hook** uses Bounded scheduling, the same public scheduling
> behavior as scheduled hooks.

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
`GET <app base URL>/.well-known/bounded-webhook-keys.json` →
`{ "keys": [ { "id", "alg": "ed25519", "publicKey": "<base64 raw 32-byte key>" } ] }`.

### Verifying a webhook on your server

Anyone can POST to a public URL, so verify the signature before acting on the
body. Use the shipped helper — `@bounded-sh/server` exports **`verifyWebhook`**,
which fetches + caches Bounded's public key (from the well-known endpoint above),
checks the Ed25519 signature over the raw body, and enforces timestamp skew —
returning the typed payload or throwing `WebhookVerificationError`:

```ts
import { verifyWebhook, WebhookVerificationError } from "@bounded-sh/server";
import { webhookReplayStore } from "./shared-webhook-replay-store";

const expectedAppId = process.env.BOUNDED_APP_ID;
if (!expectedAppId) throw new Error("BOUNDED_APP_ID is required");

app.post("/hooks/orders", express.text({ type: "*/*" }), async (req, res) => {
  let event;
  try {
    // Pass the RAW body string + the request headers.
    event = await verifyWebhook(req.body, req.headers, {
      expectedAppId,
      replayStore: webhookReplayStore,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.status(401).end();
    throw err;
  }
  // event is trusted: { id, appId, path, operation, document, previousDocument, timestamp }
  res.status(200).end();
});
```

> **The keys URL follows your `init({ network })`.** The receiver verifies against
> the network's signing keys automatically; with no `init` (a pure receiver) it
> uses the production key set. Add `keysUrl` to the same options object only when
> you intentionally verify against a custom key source; keep `expectedAppId` and
> `replayStore` in that object.

`webhookReplayStore` must implement `WebhookReplayStore` with an atomic shared
Redis/KV/DB record and be reused by every receiver replica. The SDK rejects
replays in a process-local cache by default, but separate instances do not share
that cache. `expectedAppId` prevents a validly signed event for another Bounded
app from being accepted by this endpoint.

Webhooks are **read-only fan-out** — never act on an unauthenticated body, and
treat the event as a *signal*: if you need to mutate Bounded state in response, do
it through a `@bounded-sh/server` client so every rule + invariant is re-checked.
Full receiver walkthrough:
[../guides/building-a-backend.md](building-a-backend.md#receiving-webhooks).

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
