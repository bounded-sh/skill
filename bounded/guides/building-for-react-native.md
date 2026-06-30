# Building for React Native (iOS / Android)

**React Native is how you ship Bounded to phones.** There is no native iOS or
Android SDK — the same `@bounded-sh/client` package runs in RN via a dedicated
entry point, so your reads, writes, subscriptions, and policy enforcement are
identical to web. Only the auth wiring differs.

> Beta: Bounded is in beta; the API shape below is stable.

## What's the same as web

Everything in the data layer: `init`, `get`, `getPage`, `getMany`, `set`,
`setMany`, `subscribe`, `search`, `queryAggregate`, `count`, `setFile`. Use them
exactly as in [building-a-webapp.md](building-a-webapp.md) and
[../docs/sdk-reference.md](../docs/sdk-reference.md). Metro resolves the SDK's
`react-native` entry automatically; web-only providers (react-dom, the browser
auth modal, the Phantom browser SDK) are excluded from that build.

## What's different: auth

> ⛔ **The headless OTP primitives (`sendEmailOtp` / `verifyEmailOtp` /
> `sendTextOtp` / `verifyTextOtp`) are retired** — they return
> `403 hosted login must be started from the issuer origin` on every app origin.
> Do not use them on RN (or web).

The SDK `user` object is `{ id, address, email }` and means the same thing in RN
as on web: `@user.id` is the universal stable identity (always present — use it
for ownership/membership/identity), `@user.address` is the real onchain wallet
address (present for wallet logins, **`null` for Bounded Auth logins** unless a
wallet is linked — use it only for onchain/wallet operations), and `@user.email` is the verified, lowercased
email (email/OAuth accounts only; `null` for phone-only text users and wallets).
Full model:
[../docs/auth.md](../docs/auth.md).

Email/social human login uses the **hosted redirect** flow
(`loginWithRedirect` / `completeLoginFromRedirect`). **On RN this flow is not yet
wired in the SDK** — `loginWithRedirect` drives a full-page browser redirect
(`window.location` + `sessionStorage` PKCE) that needs a DOM. So for **RN today**,
the working end-user identities are **guest** (`signInAnonymously()`) and
**Privy** (`loginWithPrivy`), plus **Phantom** when you need an onchain wallet.
Hosted email/social on RN (open the system browser to `auth.bounded.sh`, return via
a deep-link `redirectUri`) is on the roadmap; don't ship an RN email-login screen
against the old headless primitives.

### Anonymous (zero-friction guest) — the RN default

`signInAnonymously()` is the frictionless path that "just works" on a phone — a
device keypair identity, no browser hand-off, durable across reloads:

```tsx
import { init, signInAnonymously, getCurrentUser, useAuth, logout } from "@bounded-sh/client";

await init({ appId: "<appId>" });        // points at bounded-production by default
const me = await signInAnonymously();     // me.isAnonymous === true; owns data by @user.id
getCurrentUser();                         // { id, address, email } | null
```

`useAuth()`, `logout()`, and every data operation behave exactly as on web once a
user is signed in. To convert a guest to a durable real account, see
[../docs/anonymous-accounts.md](../docs/anonymous-accounts.md) (there is no inline
id-preserving upgrade; carry data over via transferable ownership).

### Privy (email/social on RN, if you need a real account today)

`loginWithPrivy` is exported from the RN entry and is the supported way to get a
real (email/social) RN login while hosted-redirect-on-RN lands. Wire it per your
Privy RN setup, then the SDK adopts the resulting identity.

### Phantom wallet (opt-in, for onchain `@user.address`)

When your app needs a real Solana wallet, use Phantom with
`authMethod: "phantom"`. On mobile the connection hands off to the Phantom app
(deeplink) rather than a browser extension. Conceptually:

```ts
await init({ appId: "<appId>", authMethod: "phantom" });
// then login() / useAuth() as on web; @user.address is the connected wallet
```

The exact RN wiring for the Phantom mobile hand-off (deeplink redirect/return URL
setup, and whether extra Phantom mobile config is required) is **not yet pinned
down in these docs** — treat the snippet above as conceptual and verify the
mobile connect flow before relying on it. The web flow is the detailed reference:
[building-a-webapp.md](building-a-webapp.md).

## Reads, writes, subscriptions

Identical to web — see [building-a-webapp.md](building-a-webapp.md). A quick
live example:

```tsx
import { subscribe } from "@bounded-sh/client";

// myId is the user's universal identity (user.id) — use it to key per-user docs.
useEffect(() => {
  let stop: (() => Promise<void>) | undefined;
  subscribe("rooms/r1/view/" + myId, {
    onData: setView,
    onError: console.error,
  }).then((fn) => { stop = fn; });
  return () => { stop?.(); };
}, [myId]);
```

## Gotchas

- **Metro entry**: ensure your bundler honors the `react-native` condition so the
  RN-safe entry is picked. Don't import web provider modules directly.
- **No hosted-redirect login on RN yet** — `loginWithRedirect` needs a DOM
  (`window.location` + `sessionStorage`). On RN use guest (`signInAnonymously`) or
  Privy (`loginWithPrivy`) today; do not call the retired `sendEmailOtp`/`verifyEmailOtp`
  headless primitives (they 403).
- **Polyfills**: RN needs the same Buffer/crypto shims the Solana libs require;
  add them in your Metro/babel config.

## Related

- [building-a-webapp.md](building-a-webapp.md) — the shared client flow (reads/writes/subscribe)
- [../docs/auth.md](../docs/auth.md) — email/OAuth auth, optional text OTP, Phantom wallet auth, and the `@user.id` / `@user.address` / `@user.email` identity model
- [../docs/sdk-reference.md](../docs/sdk-reference.md) — the client method surface
- [capabilities-and-limits.md](capabilities-and-limits.md) — why RN, not a native SDK
