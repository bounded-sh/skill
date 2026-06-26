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

Email is the default auth everywhere, including RN — but RN has **no DOM**, so the
web's inline email-code modal isn't available. On RN you drive OTP flows yourself
with the SDK's **headless** email primitives (`sendEmailOtp` /
`verifyEmailOtp`). Text OTP (`sendTextOtp` / `verifyTextOtp`) is off by default
and works only when Bounded explicitly enables it for the app. Phantom
(a Solana wallet, opening via the Phantom mobile app) is the opt-in path when you
specifically need an onchain `@user.address`.

The SDK `user` object is `{ id, address, email }` and means the same thing in RN
as on web: `@user.id` is the universal stable identity (always present — use it
for ownership/membership/identity), `@user.address` is the real onchain wallet
address (present for wallet logins, **`null` for Bounded Auth logins** unless a
wallet is linked — use it only for onchain/wallet operations), and `@user.email` is the verified, lowercased
email (email/OAuth accounts only; `null` for phone-only text users and wallets).
Full model:
[../docs/auth.md](../docs/auth.md).

### Email OTP (default, headless — works on any device)

No wallet extension or app is needed; email OTP runs entirely headless, so it's
the path that "just works" on a phone. Build your own email + code inputs and
call the two-step flow:

```tsx
import { init, sendEmailOtp, verifyEmailOtp, sendTextOtp, verifyTextOtp, getCurrentUser } from "@bounded-sh/client";

await init({ appId: "<appId>", authMethod: "email" }); // 'email' is the default

// step 1 — collect the email from your own <TextInput>, then:
await sendEmailOtp("user@example.com");                  // emails a 6-digit code

// step 2 — collect the code from your own <TextInput>, then:
const user = await verifyEmailOtp("user@example.com", "123456"); // signs in

// Optional: only when text OTP is explicitly enabled for the app.
await sendTextOtp("+14155550132");                               // texts a 6-digit code
const byText = await verifyTextOtp("+14155550132", "123456");     // signs in
getCurrentUser();                                        // { id, address, email } | null
```

`useAuth()`, `logout()`, and every data operation behave exactly as on web once
a user is signed in.

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

### Anonymous (zero-friction guest)

`signInAnonymously()` works on RN too and can coexist with email — a device
keypair identity, upgradeable later (see
[../docs/anonymous-accounts.md](../docs/anonymous-accounts.md)).

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
- **No DOM auth modal in RN** — the web's inline email-code modal needs a DOM, so
  on RN drive email OTP yourself with the headless primitives above; add text
  only when Bounded explicitly enables text OTP.
- **Polyfills**: RN needs the same Buffer/crypto shims the Solana libs require;
  add them in your Metro/babel config.

## Related

- [building-a-webapp.md](building-a-webapp.md) — the shared client flow (reads/writes/subscribe)
- [../docs/auth.md](../docs/auth.md) — email/OAuth auth, optional text OTP, Phantom wallet auth, and the `@user.id` / `@user.address` / `@user.email` identity model
- [../docs/sdk-reference.md](../docs/sdk-reference.md) — the client method surface
- [capabilities-and-limits.md](capabilities-and-limits.md) — why RN, not a native SDK
