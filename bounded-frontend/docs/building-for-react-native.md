# Building for React Native (iOS / Android)

**React Native is how you ship Bounded to phones.** There is no native iOS or
Android SDK — the same `@bounded-sh/client` package runs in RN via a dedicated
entry point, so your reads, writes, subscriptions, and policy enforcement are
identical to web. Only the auth wiring differs.

> Beta: Bounded is in beta; the API shape below is stable.

## What's the same as web

Everything in the data layer: `init`, `get`, `getMany`, `set`,
`setMany`, `subscribe`, `search`, `queryAggregate`, `count`, `setFile`. Use them
exactly as in [building-a-webapp.md](building-a-webapp.md) and
[../docs/sdk-reference.md](../docs/sdk-reference.md). Metro resolves the SDK's
`react-native` entry automatically; web-only providers (react-dom, the browser
auth modal, the Phantom browser SDK) are excluded from that build.

## What's different: auth

> **Human credentials use hosted auth.** The current client does not export
> app-origin email or text OTP helpers. Use `loginWithRedirect` on React Native;
> it opens the hosted issuer and returns through an https universal link. See
> [Choosing your login methods & UX](../docs/auth.md#choosing-your-login-methods--ux).

The SDK `user` object is `{ id, address, email, isAnonymous }` and means the same thing in RN
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
covers Google, Apple, email, and (when the issuer enables it) phone. **Privy**
(`loginWithPrivy`) is also available through an explicit Expo bridge. The current
published guest key store requires IndexedDB, so `signInAnonymously()` is not a
standard React Native path; see the boundary below.
Browser wallet providers such as Phantom are not loaded from the default RN
entry; use an explicit wallet-provider entry only once your app opts into one.

> ✅ **Hosted RN login is wired in the SDK.** It requires an **https universal
> link** as `redirectUri` (e.g. `https://yourapp.com/auth/callback`) whose origin
> the app owner has registered in the app's **allowedOrigins** — exactly like a web
> origin. The issuer rejects custom `myapp://` schemes, so a bare deep-link scheme
> will not work; you must use a verified universal/app link.

#### Hosted email / social login (Google, Apple, email, phone)

**1. Install the RN runtime dependencies** used by the setup below:

```sh
npx expo install expo-web-browser expo-crypto react-native-mmkv react-native-url-polyfill
npm install base-64
```

`react-native-mmkv` requires a native development/production build; it does not
run in Expo Go. If your app already supplies an equivalent synchronous storage
adapter, use that instead.

**2. Provide PKCE randomness + the RN session store at startup**, before `init()`.
`getRandomBytes` powers PKCE; `setPlatform`/`ReactNativeSessionManager.configure`
are the same one-time RN setup you already do for sessions:

```ts
import "react-native-url-polyfill/auto";
import { setPlatform, ReactNativeSessionManager } from "@bounded-sh/client";
import * as Crypto from "expo-crypto";
import { decode as atob, encode as btoa } from "base-64";
import { createMMKV } from "react-native-mmkv";

const store = createMMKV();
const storage = {
  getItem: (k: string) => store.getString(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.remove(k),
};

ReactNativeSessionManager.configure({ storage, atob });
setPlatform({
  storage, sessionStorage: storage, atob, btoa, hasDOM: false,
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
// `user` is the signed-in { id, address, email, isAnonymous }. On web this returns void and you
// finish via completeLoginFromRedirect() on the redirect page; on RN it's inline.
getCurrentUser();
```

### Guest auth boundary on React Native

Do not present `signInAnonymously()` as a standard RN route in the current
published client. Its secure guest credential requires non-extractable WebCrypto
Ed25519 plus IndexedDB; React Native does not provide IndexedDB, and the MMKV
session adapter above does not replace that key store. The call fails closed
rather than persisting an extractable private key. Use hosted Bounded Auth or the
explicit Privy Expo bridge. Only enable guest auth in a non-browser runtime if
you deliberately provide and validate compatible secure WebCrypto and IndexedDB
implementations.

### Privy (alternative real-account path)

Hosted redirect (above) is the recommended RN login. If you instead standardize on
Privy across your stack, `loginWithPrivy` is exported from the RN entry. Create
and bridge a `PrivyExpoProvider`, then select it explicitly. The adapter below
targets the current `@privy-io/expo` 0.70.1 API. Install Privy, its native peers,
and the UI peers used by `PrivyElements`:

```sh
npx expo install expo-apple-authentication expo-application expo-crypto expo-linking expo-secure-store expo-web-browser react-native-passkeys react-native-webview @privy-io/expo-native-extensions @privy-io/expo@0.70.1
npx expo install react-native-svg expo-clipboard react-native-qrcode-styled react-native-safe-area-context viem
npm install fast-text-encoding react-native-get-random-values @ethersproject/shims
```

Import the three polyfills at the very start of the app entry, before Privy,
Bounded, or Solana modules evaluate. This path needs a native development or
production build; it is not an Expo Go flow.

```tsx
import "fast-text-encoding";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { type ReactNode, useEffect } from "react";
import { decode as atob, encode as btoa } from "base-64";
import {
  PrivyProvider,
  useEmbeddedSolanaWallet,
  useIdentityToken,
  usePrivy,
} from "@privy-io/expo";
import { PrivyElements, useLogin } from "@privy-io/expo/ui";
import {
  PrivyExpoProvider,
  init,
  loginWithPrivy,
} from "@bounded-sh/client";

const PRIVY_APP_ID = "<privy-app-id>";
const PRIVY_CLIENT_ID = "<privy-client-id>";
const BOUNDED_APP_ID = "<bounded-app-id>";
const SOLANA_RPC_URL = "<solana-rpc-url>";
const privyExpoProvider = new PrivyExpoProvider(PRIVY_APP_ID, SOLANA_RPC_URL);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function PrivyBridge() {
  const privy = usePrivy();
  const walletState = useEmbeddedSolanaWallet();
  const { getIdentityToken } = useIdentityToken();
  const { login } = useLogin();

  useEffect(() => {
    privyExpoProvider.setPrivyMethods({
      isReady: privy.isReady,
      isAuthenticated: !!privy.user,
      user: privy.user,
      login: async () => (await login({ loginMethods: ["email", "google"] })).user,
      logout: privy.logout,
      getAccessToken: privy.getAccessToken,
      getIdentityToken,
      getWalletProvider: async () => {
        if (!("wallets" in walletState) || !walletState.wallets) return null;
        const solanaWallet = walletState.wallets[0];
        if (!solanaWallet) return null;
        const provider = await solanaWallet.getProvider();
        return {
          address: solanaWallet.address,
          signMessage: async (message) => {
            const { signature } = await provider.request({
              method: "signMessage",
              params: { message: bytesToBase64(message) },
            });
            return { signature: base64ToBytes(signature) };
          },
          signTransaction: async (transaction) => {
            const { signedTransaction } = await provider.request({
              method: "signTransaction",
              params: { transaction },
            });
            return { signedTransaction: new Uint8Array(signedTransaction.serialize()) };
          },
          signAndSendTransaction: (transaction, connection) =>
            provider.request({
              method: "signAndSendTransaction",
              params: { transaction, connection },
            }),
        };
      },
    });
  }, [privy.isReady, privy.user, privy.logout, privy.getAccessToken, walletState, getIdentityToken, login]);

  return null;
}

export function AuthRoot({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{ embedded: { solana: { createOnLogin: "all-users" } } }}
    >
      <PrivyBridge />
      {children}
      <PrivyElements />
    </PrivyProvider>
  );
}

export async function initBoundedPrivy() {
  await init({
    appId: BOUNDED_APP_ID,
    authMethod: "privy-expo",
    privyExpoProvider,
  });
}

// Call from a user gesture after AuthRoot has mounted and Privy is ready.
export async function signIn() {
  return loginWithPrivy();
}
```

`usePrivy()` supplies session state but not a login function in Privy 0.70.1;
`useLogin()` plus a mounted `PrivyElements` owns the current UI flow. Privy's
Solana provider exposes `request(...)`, so the bridge converts its base64 message
signature and serialized transaction results into the shapes Bounded expects.
The `createOnLogin` setting is required because Bounded mints its session from
the resulting embedded Solana wallet. The default web entry does not provide a
built-in Privy auth method, and the RN path does not work without this explicit
host-app bridge.

### Wallet providers

The default RN client entry intentionally avoids importing browser wallet
providers such as Phantom and web Privy. Hosted login and bridged Privy Expo are
the supported standard RN auth paths today. If an app needs a native wallet
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
  The current client does not export app-origin OTP primitives; keep the
  credential step on the hosted issuer.
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
