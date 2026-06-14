# Building for React Native (iOS / Android)

**React Native is how you ship Bounded to phones.** There is no native iOS or
Android SDK — the same `@bounded-sh/client` package runs in RN via a dedicated
entry point, so your reads, writes, subscriptions, and policy enforcement are
identical to web. Only the auth wiring differs.

> Beta: `@bounded-sh/client` is not yet on npm. The API shape below is stable.

## What's the same as web

Everything in the data layer: `init`, `get`, `getPage`, `getMany`, `set`,
`setMany`, `subscribe`, `search`, `queryAggregate`, `count`, `setFile`. Use them
exactly as in [building-a-webapp.md](building-a-webapp.md) and
[../docs/sdk-reference.md](../docs/sdk-reference.md). Metro resolves the SDK's
`react-native` entry automatically; web-only providers (react-dom, Privy web,
Phantom browser SDK) are excluded from that build.

## What's different: auth uses Privy Expo

Web Privy can't run in RN. Instead you construct a **PrivyExpoProvider** with
Expo's Privy hooks and pass it to `init` with `authMethod: "privy-expo"`. Embedded
Solana wallets are created on login (`createOnLogin: "users-without-wallets"`),
so email/social users still resolve to an `@user.address`.

```tsx
import { PrivyProvider } from "@privy-io/expo";

// 1) Wrap your app in Expo's PrivyProvider (config per Privy Expo docs):
export default function Root() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{ embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } } }}
    >
      <App />
    </PrivyProvider>
  );
}
```

```tsx
// 2) Build the bridge provider from Privy's hooks and init Bounded with it.
import { init, PrivyExpoProvider } from "@bounded-sh/client";
import { usePrivy, useEmbeddedSolanaWallet } from "@privy-io/expo";

function useBoundedInit() {
  const privy = usePrivy();
  const wallet = useEmbeddedSolanaWallet();
  useEffect(() => {
    if (!privy.isReady) return;
    const provider = new PrivyExpoProvider({
      // wire Privy Expo methods the provider needs (login, getWalletProvider, tokens)
      // per the PrivyExpoProvider contract
    });
    init({ appId: "<appId>", authMethod: "privy-expo", privyExpoProvider: provider });
  }, [privy.isReady, wallet.wallets]);
}
```

The exact methods `PrivyExpoProvider` expects (e.g. `getWalletProvider`,
`getAccessToken`, `getIdentityToken`) come from Privy's Expo hooks; follow the
provider's JSDoc. Once `init` runs, `login()`, `useAuth()`, and all data
operations behave exactly as on web.

## Reads, writes, subscriptions

Identical to web — see [building-a-webapp.md](building-a-webapp.md). A quick
live example:

```tsx
import { subscribe } from "@bounded-sh/client";

useEffect(() => {
  let stop: (() => Promise<void>) | undefined;
  subscribe("rooms/r1/view/" + myAddress, {
    onData: setView,
    onError: console.error,
  }).then((fn) => { stop = fn; });
  return () => { stop?.(); };
}, [myAddress]);
```

## Gotchas

- **Metro entry**: ensure your bundler honors the `react-native` condition so the
  RN-safe entry is picked. Don't import web provider modules directly.
- **No `authMethod: "privy"` in RN** — that's the web flow. Use `"privy-expo"`
  with a constructed `PrivyExpoProvider`.
- **Polyfills**: RN needs the same Buffer/crypto shims the Solana libs require;
  add them in your Metro/babel config.

## Related

- [building-a-webapp.md](building-a-webapp.md) — the shared client flow (reads/writes/subscribe)
- [../docs/auth.md](../docs/auth.md) — Privy auth and `@user.address`
- [../docs/sdk-reference.md](../docs/sdk-reference.md) — the client method surface
- [capabilities-and-limits.md](capabilities-and-limits.md) — why RN, not a native SDK
