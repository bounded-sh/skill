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

> **RN is a no-Origin caller, so inline OTP works.** The headless primitives
> (`sendEmailOtp` / `verifyEmailOtp`, plus `sendTextOtp` / `verifyTextOtp` when the
> issuer has text enabled) let you render your **own** email/code UI on RN — restored
> in `@bounded-sh/client` 0.0.29. `loginWithRedirect` (below) is the recommended
> default; inline is the option when you want full control over the login screen. See
> [Choosing your login methods & UX](../docs/auth.md#choosing-your-login-methods--ux).

The SDK `user` object is `{ id, address, email }` and means the same thing in RN
as on web: `@user.id` is the universal stable identity (always present — use it
for ownership/membership/identity), `@user.address` is the real onchain wallet
address (present for wallet logins, **`null` for Bounded Auth logins** unless a
wallet is linked — use it only for onchain/wallet operations), and `@user.email` is the verified, lowercased
email (email/OAuth accounts only; `null` for phone-only text users and wallets).
Full model:
[../docs/auth.md](../docs/auth.md).

Email/social human login uses the **hosted redirect** flow
(`loginWithRedirect`). **This now works natively on RN** — `loginWithRedirect`
opens the hosted Bounded login (`auth.bounded.sh`) in the system browser via
`expo-web-browser`, returns through an **https universal-link** `redirectUri`, and
resolves **inline with the signed-in `user`** (no `completeLoginFromRedirect()`
call needed on native — that's a web-only redirect-page step). One hosted page
covers Google, Apple, email, and (when the issuer enables it) phone. Guest
(`signInAnonymously()`) and **Privy** (`loginWithPrivy`) are also available.
Browser wallet providers such as Phantom are not loaded from the default RN
entry; use an explicit wallet-provider entry only once your app opts into one.

> ✅ **Hosted RN login is wired in the SDK.** It requires an **https universal
> link** as `redirectUri` (e.g. `https://yourapp.com/auth/callback`) whose origin
> the app owner has registered in the app's **allowedOrigins** — exactly like a web
> origin. The issuer rejects custom `myapp://` schemes, so a bare deep-link scheme
> will not work; you must use a verified universal/app link.

#### Hosted email / social login (Google, Apple, email, phone)

**1. Install the optional peer deps** (only RN apps that use hosted login need them):

```sh
npx expo install expo-web-browser expo-crypto
```

**2. Provide PKCE randomness + the RN session store at startup**, before `init()`.
`getRandomBytes` powers PKCE; `setPlatform`/`ReactNativeSessionManager.configure`
are the same one-time RN setup you already do for sessions:

```ts
import { setPlatform, ReactNativeSessionManager } from "@bounded-sh/client";
import * as Crypto from "expo-crypto";
import { decode as atob } from "base-64";
import { createMMKV } from "react-native-mmkv";

const store = createMMKV();
const storage = {
  getItem: (k: string) => store.getString(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.remove(k),
};

ReactNativeSessionManager.configure({ storage, atob });
setPlatform({
  storage, sessionStorage: storage, atob, hasDOM: false,
  getRandomBytes: (n) => Crypto.getRandomBytes(n),
});
// Alternatively, `import 'react-native-get-random-values'` once at app entry and
// you can omit getRandomBytes (it polyfills the global crypto.getRandomValues).
```

**3. Register the https callback origin** in your app's `allowedOrigins` (owner
setting, same place web origins go) — e.g. `https://yourapp.com`.

**4. Configure the universal / associated link** in `app.json` so the OS routes the
callback URL back into your app:

```jsonc
{
  "expo": {
    "scheme": "yourapp",
    "ios":     { "associatedDomains": ["applinks:yourapp.com"] },
    "android": { "intentFilters": [{
      "action": "VIEW",
      "autoVerify": true,
      "data": [{ "scheme": "https", "host": "yourapp.com", "pathPrefix": "/auth/callback" }],
      "category": ["BROWSABLE", "DEFAULT"]
    }]}
  }
}
```

You must also publish the standard `apple-app-site-association` and
`assetlinks.json` files on `https://yourapp.com` so iOS/Android verify the link.

**5. Call `loginWithRedirect`** — it resolves with the user on native:

```tsx
import { init, loginWithRedirect, getCurrentUser } from "@bounded-sh/client";

await init({ appId: "<appId>" });

const user = await loginWithRedirect({
  redirectUri: "https://yourapp.com/auth/callback", // https universal link, in allowedOrigins
  // optional: choose which hosted buttons show, or jump straight into one provider
  // methods: ["email", "google", "apple"],
  // provider: "google",
});
// `user` is the signed-in { id, address, email }. On web this returns void and you
// finish via completeLoginFromRedirect() on the redirect page; on RN it's inline.
getCurrentUser();
```

To **upgrade a guest** to a real account, `linkWithRedirect({ redirectUri })` works
the same way on RN (call `signInAnonymously()` first); it carries the guest hint
through the same native browser flow and resolves with the upgraded user.

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
[../docs/anonymous-accounts.md](../docs/anonymous-accounts.md) — `linkEmail` (inline)
or `linkWithRedirect` (hosted) keeps the guest's id; a plain `loginWithRedirect` gives
a distinct id, so carry data over via transferable ownership.

### Privy (alternative real-account path)

Hosted redirect (above) is the recommended RN login. If you instead standardize on
Privy across your stack, `loginWithPrivy` is exported from the RN entry: wire it per
your Privy RN setup (a bridged `PrivyExpoProvider` passed to `init`), and the SDK
adopts the resulting identity.

### Wallet providers

The default RN client entry intentionally avoids importing browser wallet
providers such as Phantom and web Privy. Hosted login, guest login, and bridged
Privy Expo are the supported RN auth paths today. If an app needs a native wallet
provider, add the provider-specific package and entry explicitly; do not expect
`authMethod: "phantom"` from the default client entry to bundle on RN.

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
- **Hosted-redirect login on RN** works via `expo-web-browser` + an **https
  universal-link** `redirectUri` registered in `allowedOrigins` (see above). It
  resolves inline with the user — do **not** call `completeLoginFromRedirect()` on
  RN (that's the web redirect-page step; it's a harmless no-op on native). Custom
  `myapp://` schemes are rejected by the issuer — use a verified universal link.
  Prefer hosted as the default; the inline `sendEmailOtp` / `verifyEmailOtp` primitives
  also work on RN (a no-Origin caller) when you want to render your own login UI.
- **Optional peer deps for hosted login**: `expo-web-browser` (system auth session)
  and `expo-crypto` *or* `react-native-get-random-values` (PKCE randomness). They're
  imported lazily, so apps that don't use hosted login never need them.
- **Polyfills**: RN needs the same Buffer/crypto shims the Solana libs require;
  add them in your Metro/babel config.

## Related

- [building-a-webapp.md](building-a-webapp.md) — the shared client flow (reads/writes/subscribe)
- [../docs/auth.md](../docs/auth.md) — email/OAuth auth, optional text OTP, Phantom wallet auth, and the `@user.id` / `@user.address` / `@user.email` identity model
- [../docs/sdk-reference.md](../docs/sdk-reference.md) — the client method surface
- [capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — why RN, not a native SDK
