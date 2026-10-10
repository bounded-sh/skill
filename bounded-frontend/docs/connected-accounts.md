# Connected accounts (link X)

A signed-in user can prove they own an X account.
Bounded records it for your app at `__connections__/<userId>`, which policy rules can read.
Only the platform writes that record, after X's own consent screen; the X token is never kept or shown to the app.

## In the app

Use `@bounded-sh/client` 0.0.117 or later.

```ts
import { connect, completeConnection, getConnections, disconnect } from '@bounded-sh/client';

await connect('x');                        // leaves for X's consent screen, returns to this page
const done = await completeConnection();   // on page load: finishes a return, else null
const { x } = await getConnections();      // { id, handle, imageUrl, linkedAt } | null
await disconnect('x');
```

- Call `completeConnection()` once the user is signed in; it throws `ConnectionError` (`.code`, e.g. `cancelled`) when the user backed out.
- The return page must be on an origin that serves the app: its bounded.page or custom domain work as is; for localhost or a host outside Bounded, register it with `bounded domains origins add <origin> --app-id <id>`.
- Web only for now (`connect` redirects the page); React Native is not supported yet.
- Guests cannot link; the link belongs to this app's account only.

## In policy

The record is flat: `xId`, `xHandle`, `xImageUrl`, `xLinkedAt` (rules read one field after `get()`).

```json
"profiles/$userId": {
  "fields": { "xHandle": "String?" },
  "rules": {
    "create": "@user.id == $userId && @newData.xHandle == get(/__connections__/@user.id).xHandle",
    "update": "@user.id == $userId && @newData.xHandle == get(/__connections__/@user.id).xHandle"
  }
},
"posts/$postId": {
  "rules": { "create": "@newData.author == @user.id && get(/__connections__/@user.id).xId != null" }
}
```

Copy the handle into your own collections with a rule like the first one, so readers and agents see a verified handle without a lookup per user.
The same X account can be linked by several accounts; add your own uniqueness rule if you need one per person.
Offchain rules only: an onchain rule cannot read `__connections__`.

## Testing linked-X rules

`bounded tests run` has no linked accounts today: for every actor, `get(/__connections__/@user.id).xId` is `null`.
A test cannot add one either, because only the platform writes `__connections__`.
So a policy test can show the deny side of a linked-X rule, but no actor can pass it.
To test the rest of such a rule, put the X check behind a constant that is on in `policy.json`:

```json
"constants": { "REQUIRE_LINKED_X": true },
"posts/$postId": {
  "rules": {
    "create": "@newData.author == @user.id && (@const.REQUIRE_LINKED_X == false || get(/__connections__/@user.id).xId != null)"
  }
}
```

Set `"constants": { "REQUIRE_LINKED_X": false }` only in the test files that need a passing actor, and keep at least one test without the override that expects the write to fail.
A test with the switch off proves everything except the X check, so try the linked path once by hand with a real linked account.
Never set the constant to `false` in an `environments` block or a deployed policy.

## Handles typed before linking

Handles your users typed before linking existed are claims, not proof.

- Give the verified handle its own field, written only through the copy rule above, and keep the typed one in a separate field that the UI shows as unverified.
  Adding the copy rule does not change rows already stored, so reusing the typed field would keep old typed handles looking verified; and since an update rule sees the merged document, every later update of such a row would be denied until it carries the linked handle or `null`.
- Never let a typed handle satisfy a linked-X rule: gate on `get(/__connections__/@user.id)`, never on a field the user wrote.
- Never upgrade a typed handle to verified because it matches something, such as an X profile lookup or another account's link; only the user's own completed link proves ownership.
- Migrate by asking: show the unverified handle with a prompt to link (`connect('x')`), then write the verified field after the link and drop or ignore the typed one.

## Onchain apps

An onchain rule cannot `get()` `__connections__`, and a policy whose onchain rule reads it fails validation.
Put the X requirement where an offchain rule can read it:

- Keep the gated path offchain.
  If the X requirement guards money, keep that money path in offchain collections, where the rule reads the link directly and invariants still apply.
- Gate an offchain intent and execute it from a server function.
  The user writes an offchain record (for example `intents/$id`) whose create rule requires the link; a function holding the app's service keypair reads the intent, submits the onchain write, and marks the intent used; the onchain rule admits only that service wallet (for example `@user.address == @const.SERVICE_WALLET`).
  See [service keys](../../bounded-backend/docs/service-keys.md) and [server-signed settlement](../../bounded-onchain/docs/onchain.md#1-server-signed---composable-today).
  The link is checked when the intent is written, so a later `disconnect('x')` does not undo an intent already written.

A transaction the user signs from their own wallet cannot be gated on a linked X account today.
