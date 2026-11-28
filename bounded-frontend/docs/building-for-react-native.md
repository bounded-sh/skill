# Building for React Native (iOS / Android)

**React Native is how you ship Bounded to phones.** There is no native iOS or
Android SDK — the same `@bounded-sh/client` package runs in RN via a dedicated
entry point, so your reads, writes, subscriptions, and policy enforcement are
identical to web. Only the auth wiring differs, and the Expo starter below
already carries it.

> Beta: Bounded is in beta; the API shape below is stable.

## The Expo starter: one codebase, hosted with the site

`@bounded-sh/openapps-expo-template` is an Expo template on npm.
`npx create-expo-app <folder> --template @bounded-sh/openapps-expo-template`
writes an Expo app that runs on the web, in Expo Go on iPhone and Android, and
as a store build, from one codebase. Its `README.md` lists every file and its API.
It is the OpenApps starter, so its `policy.json` declares `"oapp": true`.

What the starter carries:

- `npm run build` writes everything into `dist/`: the web site (`index.html`),
  the iPhone and Android bundles, and `_expo/native/ios.json` and
  `_expo/native/android.json`.
- The app id comes from `VITE_APP_ID`, else from the project's `bounded.json`,
  beside the Expo app or in a folder above it. A build for a preview is
  `VITE_APP_ID=<previewAppId> npm run build`.
- `src/lib/bounded.ts` is the client, set up for the web, Expo Go and store
  builds: `boot()`, `signIn()`, `signInAsGuest()`, `signOut()`, `deleteAccount()`.
  `src/lib/platform.native.ts` configures the SDK for phones and keeps sessions
  in the OS keychain through `expo-secure-store`, which Expo Go provides. An app
  made from the starter needs none of the hand wiring under
  [Without the starter](#without-the-starter-hosted-login-by-hand).
- `scripts/native.mjs <export dir> --into <site dir>` adds the phone files to
  another build's site, for a phone app that lives beside a separate web app in
  one repo.

What the platform does with the output:

- It reads only the published build output, so any repo layout works.
  `index.html` at the root is the site. `_expo/native/<platform>.json`, with the
  bundles it names, makes the same site open as a native app in Expo Go at
  `exps://<site host>`. Publishing is the ordinary static deploy
  ([frontend-hosting.md](frontend-hosting.md)).
- On a preview app whose site is not private, the hosted widget shows "On your
  phone": a QR code on a computer, an "Open in Expo Go" button on a phone. The
  widget of the live site never shows it. A preview is one the app's agent makes,
  or one `bounded previews create` makes.
- `https://<site host>/__bounded/phone` is the site's smart link, on a preview
  and on the live site: a computer gets a QR code, and a phone gets a page that
  opens the app in Expo Go, or its store's page once the app is live in that
  store. A site with no phone build answers 404.
- `/__bounded/phone-app.json` says which phones a site serves: `phone` is `null`
  without a phone build, otherwise it names `ios` and `android` and carries the
  Expo Go QR code and the smart link.
- A private site does not open in Expo Go, has no smart link and answers
  `phone: null`.

Sign-in with the starter:

- In Expo Go, hosted sign-in returns through
  `exps://<preview host>/--/auth/callback`. The issuer accepts that only for a
  preview that has not expired, at the host that serves it. The live site opens
  in Expo Go but cannot finish hosted sign-in there; its people sign in on the
  website or in a store build.
- A store build returns through `https://<site host>/auth/callback`.
  `scripts/native.mjs` writes the site's `.well-known/apple-app-site-association`
  and `.well-known/assetlinks.json` from `native-apps.json`, which lists the
  store builds the site lets sign in.
- `signInAsGuest()` works on the web and on phones; see the
  [guest boundary](#guest-auth-boundary-on-react-native).

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
> it opens the hosted issuer and returns through an https universal link, or
> through an `exps://` link for a preview opened in Expo Go. See
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
(`loginWithPrivy`) is also available through an explicit Expo bridge. Guest
accounts (`signInAnonymously()`) need `expo-secure-store` on a phone; see the
boundary below.
Browser wallet providers such as Phantom are not loaded from the default RN
entry; use an explicit wallet-provider entry only once your app opts into one.

> ✅ **Hosted RN login is wired in the SDK.** It requires an **https universal
> link** as `redirectUri` (e.g. `https://yourapp.com/auth/callback`) whose origin
> the app owner has registered in the app's **allowedOrigins** — exactly like a web
> origin. The issuer rejects custom `myapp://` schemes, so a bare deep-link scheme
> will not work; you must use a verified universal/app link. The one exception is
> a preview opened in Expo Go, which returns through
> `exps://<preview host>/--/<path>`.

#### Without the starter: hosted login by hand

These five steps apply only to a React Native app that does not use the Expo
starter. The starter replaces them: `src/lib/platform.native.ts` does the setup
of steps 1 and 2 with sessions in the OS keychain instead of MMKV, and `signIn()`
returns on the site's own host, so it registers no extra origin. MMKV does not
run in Expo Go, so an app wired this way does not open from the hosted phone
preview.

**1. Install the RN runtime dependencies** used by the setup below:

```sh
npx expo install expo-web-browser expo-crypto react-native-url-polyfill \
  react-native-mmkv react-native-nitro-modules
npm install base-64
```

`react-native-mmkv` v4 is a Nitro module, hence the `react-native-nitro-modules`
peer, and it requires a native development/production build; it does not
run in Expo Go.
Add `expo-secure-store` as well if you encrypt the store (next section), which you
should. If your app already supplies an equivalent synchronous storage
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

> **Encrypt the session store; hold its key in the OS keychain.** The store above
> persists Bounded's bearer session; on a lost, rooted, or jailbroken device an
> **unencrypted** MMKV file is readable at rest. Encrypt it, and keep the
> encryption key in the platform secure enclave - iOS **Keychain** / Android
> **Keystore** via `expo-secure-store` (or `react-native-keychain`) - never in the
> MMKV file, `AsyncStorage`, or source. Replace the plain `createMMKV()` above with
> an encrypted instance whose key comes from the keychain:
>
> ```ts
> import * as SecureStore from "expo-secure-store";
> import * as Crypto from "expo-crypto";
> import { createMMKV } from "react-native-mmkv";
>
> // MMKV measures `encryptionKey` in BYTES of the string and refuses anything longer
> // than its algorithm allows: 16 bytes for the default AES-128, 32 for AES-256
> // ("`encryptionKey` cannot be longer than ..."). A 32-byte key rendered as 64 hex
> // characters is 64 bytes and throws - the store never opens. Below: 24 random bytes
> // in a 64-character alphabet, so exactly 32 single-byte characters, 192 bits.
> const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
>
> // Generate the key once, then keep it only in the Keychain/Keystore.
> // SecureStore.getItem/setItem are the SYNCHRONOUS variants, so this whole opener is
> // synchronous and drops in at module scope where the plain createMMKV() call was -
> // the storage adapter has to exist before setPlatform, hence before init().
> function openEncryptedStore() {
>   let key = SecureStore.getItem("bounded.session.key");
>   if (!key) {
>     // 256 / 64 = 4, so the modulo is unbiased.
>     key = Array.from(Crypto.getRandomBytes(24), (b) => KEY_ALPHABET[b % 64]).join("");
>     SecureStore.setItem("bounded.session.key", key, {
>       keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
>     });
>   }
>   return createMMKV({ id: "bounded", encryptionKey: key, encryptionType: "AES-256" });
> }
> const store = openEncryptedStore();  // use in place of createMMKV()
> ```
>
> Two details that bite in practice. The key is per install and never leaves the
> device, so losing it (keychain cleared, app reinstalled) is a logged-out user,
> not a corrupted app - the session simply cannot be read and the user signs in
> again. And an app that already shipped with a plain `createMMKV()` keeps its
> existing PLAINTEXT file: opening the same `id` with an `encryptionKey` does not
> encrypt what is already on disk, so migrate deliberately - either
> `store.encrypt(key, "AES-256")` once on the existing instance (`recrypt` is
> deprecated and AES-128-only), or clear it and let the user re-auth.
>
> On web, `@bounded-sh/client` already persists the session through the browser's
> own storage; encrypting MMKV with a keychain-held key is the React Native
> equivalent of that at-rest protection.

**3. Register the https callback origin** in your app's `allowedOrigins` (owner
setting, same place web origins go) — e.g. `https://yourapp.com`.
For local development against a localhost dev server (Expo web or a locally
served build), also register that exact loopback origin - `http://localhost:<port>`,
including the port - in `allowedOrigins`, or sign-in from it is refused.
A loopback origin authorizes only the app that registered it; the hosted native
redirect still needs an https universal link, not a localhost origin.

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
// finish by awaiting init() on the redirect page; on RN it's inline.
getCurrentUser();
```

### Guest auth boundary on React Native

`signInAnonymously()` works on a phone with `@bounded-sh/client` 0.0.123 or newer
and `expo-secure-store` installed, an optional peer the Expo starter already has.
On the web the guest key is a non-extractable WebCrypto Ed25519 key in IndexedDB.
A phone has no IndexedDB, so there the key is a seed in the iOS Keychain or
Android Keystore through `expo-secure-store`: one per app id, readable only while
the device is unlocked, and never moved to another device. The app's JavaScript
holds the seed to sign, so the OS protects it at rest, not from the app. Without
`expo-secure-store`, or when the store cannot be read, the call fails closed and
creates no key. The MMKV session adapter above does not hold this key. This is
the path the Expo starter uses; its platform setup also passes `textEncode` and
`sha256`, which the hand-wired `setPlatform` call above does not.

### Privy (alternative real-account path)

Hosted redirect (above) is the recommended RN login, and the Expo starter does
not include Privy. If you instead standardize on
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
providers such as Phantom and web Privy. Hosted login, guest accounts and bridged
Privy Expo are the RN auth paths today. If an app needs a native wallet
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
- **Don't poll; and if you must, respect `AppState`.** Collections are live, so
  use `useQuery`/`subscribe` rather than a refresh timer. For the non-live
  surfaces, clear the timer on `AppState` `background`/`inactive` and refresh
  once on return to `active` - a backgrounded phone must not keep firing
  requests. Rules in [sdk-reference.md](../docs/sdk-reference.md#never-poll-a-collection).
- **Hosted-redirect login on RN** works via `expo-web-browser` + an **https
  universal-link** `redirectUri` registered in `allowedOrigins` (see above). It
  resolves inline with the user — do **not** call `completeLoginFromRedirect()` on
  RN (that's the web redirect-page step; it's a harmless no-op on native). Custom
  `myapp://` schemes are rejected by the issuer, so use a verified universal link;
  only a preview opened in Expo Go returns through `exps://`.
  The current client does not export app-origin OTP primitives; keep the
  credential step on the hosted issuer.
- **Optional peer deps for hosted login**: `expo-web-browser` (system auth session)
  and `expo-crypto` *or* `react-native-get-random-values` (PKCE randomness). They're
  imported lazily, so apps that don't use hosted login never need them.
- **Optional peer dep for the Solana Mobile wallet** (0.0.72+):
  `@solana-mobile/wallet-standard-mobile`. Also lazy, and also not installed for
  you - without it the phone-wallet registration throws `WalletConfigError`
  naming the package. See
  [../docs/auth.md](../docs/auth.md#solana-mobile-seeker--saga).
- **Polyfills**: RN needs the same Buffer/crypto shims the Solana libs require;
  without the starter, add them in your Metro/babel config.

## Related

- [building-a-webapp.md](building-a-webapp.md) — the shared client flow (reads/writes/subscribe)
- [../docs/auth.md](../docs/auth.md) — email/OAuth auth, optional text OTP, Phantom wallet auth, and the `@user.id` / `@user.address` / `@user.email` identity model
- [../docs/sdk-reference.md](../docs/sdk-reference.md) — the client method surface
- [capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — why RN, not a native SDK
