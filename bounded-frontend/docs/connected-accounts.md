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
By default the same X account can be linked by several accounts of your app.
To allow one account per X account, declare it in `policy.json`: `"auth": { "connections": { "x": { "unique": true } } }`.
`completeConnection()` then throws `ConnectionError` with code `x_account_linked_elsewhere` while another user of the app holds that X account; the same user can relink, and `disconnect('x')` frees it.
Links made before you turned it on are kept.
Offchain rules only: an onchain rule cannot read `__connections__`.
