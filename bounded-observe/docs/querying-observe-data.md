# Querying the observe + decisions log

Once an app has observe turned on, every policy decision it makes (every write
your rules allow or block, with the actor, collection, op, and the invariant that
fired) and every recognized external action land in a **durable, filterable log**
on the app's own observe surface. This is the retained successor of
`bounded decisions`: the CLI's `bounded decisions` reads an in-memory ring buffer
that is lost when the backend cycles, while this log is kept and queryable.

## The endpoint

```
GET https://app-<appId>.bounded.sh/dash-api/query?<filters>
Authorization: Bearer <bounded user token for an org member>
```

Membership-gated: the caller must be a member of the app's observe org (the app
owner or a shared collaborator), the same gate as the rest of `/dash-api`. The
response is **metadata only** — never your documents' field values.

## Filters (all optional, AND-combined)

| Param | Matches |
|---|---|
| `decisions=1` | Shorthand for `rail=bounded-data` — the app's OWN writes and declines (the decisions view) |
| `declined=1` | Shorthand for `verdict=declined` — blocked writes/actions only |
| `collection` | The collection written, e.g. `payments` |
| `op` | `create` \| `update` \| `delete` |
| `verdict` | `allowed` \| `declined` |
| `invariant` | The declining invariant name, e.g. `payment_max` |
| `actor` | Actor id (substring match) |
| `kind` | `human` \| `agent` \| `service` \| `unknown` (exact) |
| `onBehalfOf` | The attribution channel value |
| `rail` | `bounded-data` (own data) or an external rail like `stripe`, `llm-gateway` |
| `action` | Recognized action, substring, e.g. `payments.create` |
| `class` | `action` \| `error` \| `counter` \| `shape` |
| `status` | HTTP-ish status, e.g. `409` |
| `since` / `until` | Epoch ms bounds on the event time |
| `days` | Lookback window (default the dashboard default; max 30) |
| `limit` | Page size, newest first (default 100, max 1000) |

## Examples

```bash
# Every write your invariants BLOCKED this week, newest first:
GET /dash-api/query?decisions=1&declined=1

# Just the payments a specific cap blocked:
GET /dash-api/query?collection=payments&invariant=payment_max

# Everything one actor did to your data:
GET /dash-api/query?decisions=1&actor=wallet_abc

# The external calls your agents made (non-data rails):
GET /dash-api/query?class=action&rail=stripe
```

## Response shape

```json
{
  "org": "app-<appId>",
  "count": 12,
  "matched": 47,
  "truncated": false,
  "window": { "days": 7 },
  "events": [
    { "ts": 1730000000000, "class": "error", "actor": "wallet_abc", "kind": "unknown",
      "onBehalfOf": null, "rail": "bounded-data", "action": "payments.create",
      "collection": "payments", "op": "create", "verdict": "declined",
      "invariant": "payment_max", "path": "payments/p2",
      "reason": "invariant \"payment_max\": requires payments/$id.amountCents <= 5000",
      "status": 409, "host": "data.bounded.sh", "method": "PUT" }
  ]
}
```

`count` is this page; `matched` is the full number of events that matched the
filter in the window. `reason` and `invariant` explain a decline; a committed
write reports `verdict: "allowed"` with no reason. Values from the written
document never appear — only the collection, op, path (opaque ids), actor, and
the policy the decision was made against.
