# Access-pattern cookbook

Copy-adjust recipes for `rules`. Expression semantics: [policy reference](policy-reference.md#rules--the-expression-language); one-screen syntax: [cheat sheet](policy-cheat-sheet.md). Offchain rules key ownership on `@user.id`; inside `"onchain": true` collections `@user.address` is the only principal.

## Owner-only

```json
"docs/$docId": {
  "fields": { "ownerId": "String!", "body": "String" },
  "rules": {
    "read":   "@data.ownerId == @user.id",
    "create": "@user.id != null && @newData.ownerId == @user.id",
    "update": "@data.ownerId == @user.id && @newData.ownerId == @data.ownerId",
    "delete": "@data.ownerId == @user.id"
  }
}
```

Denied reads surface as empty results, not `403`. The `!` on `ownerId` needs exactly that preservation clause in `update`.

## Public read, authenticated write

```json
"rules": { "read": "true", "create": "@user.id != null && @newData.authorId == @user.id", "update": "false", "delete": "false" }
```

`update`/`delete` set to `"false"` makes the collection append-only - the strongest shape for feeds, bids, and audit trails.

## No guests

```json
"create": "@user.id != null && @user.isAnonymous == false && ..."
```

`@user.isAnonymous` is a strict boolean; gate with `== false` (no unary `!` on special variables).

## Admin

Declare the admin as data or a constant; never hardcode addresses inline in several rules.

```json
"constants": { "ADMIN_ID": "usr_9f2..." },
"rules": { "update": "@user.id == @const.ADMIN_ID" }
```

Data-driven admin set (grows without redeploy):

```json
"update": "get(/admins/@user.id) != null"
```

Scoped role systems (owners, collaborators, viewers) are first-class: see [roles](roles.md) and [access control](access-control.md).

## Admin or owner

```json
"update": "(@data.ownerId == @user.id) || (get(/admins/@user.id) != null)"
```

## Membership / relationship

Authorize through a document that encodes the relationship, bound by path variables:

```json
"teams/$teamId/docs/$docId": {
  "rules": {
    "read":   "get(/teams/$teamId/members/@user.id) != null",
    "create": "get(/teams/$teamId/members/@user.id).role == 'editor'"
  }
}
```

Path nesting binds `$teamId` for every rule on the template, so a write to team A structurally cannot pass team B's membership check.

## Time-windowed

```json
"create": "@newData.at <= @time.now && @newData.at + 60 >= @time.now && get(/auctions/$auctionId).endsAt > @time.now"
```

`@time.now` is the server rule clock in seconds. Never compare it against a client-computed timestamp - stamp fields with `serverTimestamp()` (see the [rule-clock warning](policy-reference.md#variables)).

## Validation

```json
"create": "@newData.price >= 1 && @newData.price <= 1000000 && @StringUtils.length(@newData.title) <= 80"
```

Read-only plugin calls are legal in rules; `@StringUtils.length` is offchain-only. Amount fields that invariants protect should be `UInt` so negatives are unrepresentable.

## Immutable fields

Mark set-once fields `!` and preserve them in `update` (`@newData.x == @data.x`), or make the collection append-only. Typical: `owner`, `creator`, `createdAt`, foreign keys. Onchain, also omit `!` fields from update payloads entirely - updates are patches and resending the key is rejected with `FieldReadOnly`.

## Existence-gated (cross-document prerequisites)

```json
"create": "get(/markets/$marketId) != null && get(/markets/$marketId).resolved == false && get(/positions/$marketId/user/@user.id) != null"
```

`get()` reads pre-transaction state; `getAfter()` reads the staged post-batch state (not in read rules). Same-batch prerequisites are a batching contract - declare them with `requiresInBatch` so a partial batch is rejected as `incomplete_batch` ([data plane](data-plane.md)).

## Atomic multi-document authorization

When an action must move two documents together (order + escrow row, listing + hold), submit one atomic batch (`setMany`) and encode the pairing:

- gate each side on the other with `getAfter()` (the staged sibling), and
- declare `requiresInBatch` on the collection so the sibling cannot be omitted.

See [data plane](data-plane.md) for the subset-attack this prevents.

## Server-only writes

```json
"rules": { "create": "false", "update": "false" },
"hooks": { "offchain": { "...": "@DocumentPlugin.updateField(...)" } }
```

`updateField` from a hook is privileged (bypasses destination rules); `putDocument` re-enters the destination's rules. Live-tick provenance gates use `@origin.kind == 'live' && @origin.module == '<room>'` ([principals and origins](principals-and-origins.md)).

## Onchain money movement

Rules gate; hooks move; invariants cap. The custody patterns (shared escrow vs per-entity named PDA, balance-gated payouts) are in [custody and PDAs](../../bounded-onchain/docs/custody-and-pdas.md), and worked policies in the [examples index](examples.md).
