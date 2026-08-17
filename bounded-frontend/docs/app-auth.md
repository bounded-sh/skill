# App-user auth quickstart

This is authentication for people using the deployed app. It is separate from
the developer web account used by `bounded init` and the CLI.

## Keep the default

For most apps, do not set `authMode` during client initialization and do not add
`auth.wallets` to policy. Turnkey-native email/social auth with eager embedded
wallet provisioning is the default. A completed supported email/social login
has:

- `@user.id`: stable account identity for ownership and membership
- `@user.address`: embedded Turnkey wallet for wallet/onchain work
- `@user.email`: verified email when available

Use `@user.id` for ordinary authorization. Never key ordinary ownership on a
wallet address.

## Unified widget

```ts
import { init, openBoundedWidget, getCurrentUser } from '@bounded-sh/client'

await init({ appId: '<appId>' })
await openBoundedWidget({ methods: ['email', 'google'], wallet: true })
const user = getCurrentUser()
```

The widget is the normal in-app login UI. `wallet: true` adds bring-your-own
wallet as another lane; it does not enable embedded wallets, which are already
the email/social default.
That lane also needs `"auth": { "wallets": true }` deployed in `policy.json`:
the issuer refuses to mint a session for an external wallet without it. On a
capable Android browser the lane additionally lists the phone's own Solana
Mobile wallet, with no extra client work - see
[auth.md](auth.md#solana-mobile-seeker--saga).

For a fully hosted presentation, use `loginWithRedirect({ methods })` or
`loginWithPopup({ methods })`. On web, the redirect URI defaults to the current
page. React Native must provide its registered universal/deep link.

## Policy registration

The app's deployed public origins and OAuth redirect origins must be registered
for its exact `appId`. A custom domain must be added before auth launches there.
If the frontend bundle uses an old or different app ID, both email and wallet
login will fail even when the visible host is correct.

### Local development

A loopback origin is not trusted automatically.
To sign in from `http://localhost:<port>` while developing, register that exact
origin - including the port, e.g. `http://localhost:5173` - in the app's
`allowedOrigins`, the same list the deployed origins go in.
Only the app that registered the localhost origin accepts a login from it, so a
dev origin authorizes just the app you are building, never every app on the
platform.
This applies to both email/social and wallet (Solana) sign-in.

Keep default Turnkey auth unless the app explicitly opts out with
`auth.wallets: false`. An `auth_mode_not_turnkey` response usually means the
deployed app policy or client initialization still forces a legacy auth mode.

## Session UI

Use `useAuth()` or `onAuthStateChanged()` as the source of truth. Await
`logout()` or `clearSession()` before navigating. Do not treat a locally cached
user as a valid server session.

## Load detailed auth only when needed

- Redirect/popup callbacks, provider setup, OTP details, session expiry,
  custom domains, logout, and error handling: [full auth reference](auth.md)
- Browser guest and upgrade flows: [anonymous accounts](anonymous-accounts.md)
- Bring-your-own Solana wallet: [wallet login](auth.md#solana-wallet-login-bring-your-own)
- Embedded wallet/onchain behavior: [embedded wallets](../../bounded-onchain/docs/embedded-wallets.md)
- Developer CLI login: [developer accounts](../../bounded-deploy/docs/accounts.md)
