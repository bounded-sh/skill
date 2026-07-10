# Building a Web App

A React frontend on a Bounded backend with `@bounded-sh/client`: install, sign
users in with hosted email OTP (the default; Phantom is the
opt-in Solana wallet), and read / write / subscribe with the deployed policy
enforcing every operation. The backend is your `policy.json` — deploy it first
([../docs/policy-generation-guide.md](../../bounded-backend/docs/policy-generation-guide.md)).

> Beta: Bounded is in beta; the API shape below is stable.

## Install

```bash
npm i @bounded-sh/client buffer
```

`buffer` is a required browser polyfill for the Solana libraries the SDK pulls
in. **Use a real bundler (Vite, Next.js, Remix)** — CDN/`esm.sh` imports will
appear to load and then break at runtime, because the Buffer polyfill must be
assigned before any SDK module evaluates and the wallet adapters need Node
globals shimmed.

```ts
// must run before any @bounded-sh/client import evaluates
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;
```

In Vite, alias `buffer` and set `define: { global: "globalThis" }` so the CJS
interop resolves.

## Initialize (once, at startup)

```ts
import { init } from "@bounded-sh/client";

await init({
  appId: "<appId>",          // from `bounded deploy --create`; points at bounded-production
  // Email + OAuth/social + text use hosted loginWithRedirect/loginWithPopup.
  // 'phantom' (or its 'wallet' alias) selects browser wallet auth when
  // walletLogin is explicitly enabled.
});
```

Mount your UI first and `init()` asynchronously — don't block first paint on it.

## Authenticate users

Email + OAuth/social login uses the hosted issuer via `loginWithRedirect` or
`loginWithPopup`, where the credential is entered on `auth.bounded.sh` and never
touches your origin. App-origin OTP helpers are not exported by the current
client. Phantom is the opt-in path when you want a bring-your-own Solana wallet
(`@user.address`). Pick the hosted methods that fit your app — see
[Choosing your login methods & UX](../docs/auth.md#choosing-your-login-methods--ux).
Whatever the method, an authenticated `user` is `{ id, address, email }`:

- `user.id` — the universal stable identity, **always present**. For wallet
  logins it equals the wallet address; for email/social logins it is the account
  identity. Use this for ownership / membership / identity.
- `user.address` — a real onchain wallet address. Present for wallet logins,
  `null` for email-only logins. Use only for onchain / wallet operations.
- `user.email` — the verified, lowercased email (email logins only; `null` for
  wallet). Use for email-gating.

Full auth model: [../docs/auth.md](../docs/auth.md).

```tsx
import { useAuth, loginWithRedirect, loginWithPopup, completeLoginFromRedirect } from "@bounded-sh/client";
import { useEffect } from "react";

// Once, on app load — finishes a redirect OR popup login; no-op otherwise.
// No separate callback route needed: on web redirectUri defaults to the current page.
function App() {
  useEffect(() => { completeLoginFromRedirect(); }, []);
  // ...your routes...
}

function SignIn() {
  const { user, logout, loading } = useAuth();
  if (loading) return null;
  // Your own button → hosted login; pass methods/provider to scope it.
  const signIn = () => loginWithRedirect({ methods: ["email", "google"] }); // or loginWithPopup({ methods: ["email", "google"] })
  return user
    ? <button onClick={logout}>Sign out ({user.id.slice(0, 6)}…)</button>
    : <button onClick={signIn}>Sign in</button>;
}
```

## Read & write

The operations are the generic SDK surface ([../docs/sdk-reference.md](../docs/sdk-reference.md)).
Reads obey each collection's `read` rule; writes are checked against rules and
invariants atomically.

```ts
import { get, set, setMany } from "@bounded-sh/client";

// one document, or a filtered collection
const note   = await get("notes/n1");
const recent = await get("notes", { sort: { createdAt: -1 }, limit: 20 });
const mine   = await get("orders", {
  filter: { buyer: { $eq: user.id } }, limit: 50,
});

// write (signed by the logged-in user → @newData/@user in rules)
await set("notes/n1", { title: "Hello", body: "…", owner: user.id });

// atomic multi-write (e.g. a transfer under conserve)
await setMany([
  { path: "accounts/alice", document: { balance: 50 } },
  { path: "accounts/bob",   document: { balance: 150 } },
]);
```

A denied rule throws (403); a violated invariant throws (409 with the
invariant's name). Branch your UI on those — see
[../docs/data-plane.md](../../bounded-backend/docs/data-plane.md).

## Subscribe (live UI)

Every collection is live. `subscribe` calls `onData` on every change and returns
an unsubscribe function — wire it to a React effect.

```tsx
import { subscribe } from "@bounded-sh/client";
import { useEffect, useState } from "react";

function Notes() {
  const [notes, setNotes] = useState<any[]>([]);
  useEffect(() => {
    let stop: (() => Promise<void>) | undefined;
    subscribe("notes", {
      sort: { createdAt: -1 }, limit: 50,
      onData: (rows) => setNotes(rows),
      onError: (e) => console.error(e),
    }).then((fn) => { stop = fn; });
    return () => { stop?.(); };
  }, []);
  return <ul>{notes.map((n) => <li key={n.id}>{n.title}</li>)}</ul>;
}
```

A subscription only ever delivers documents the user is allowed to read — the
read rule is enforced per delivered row, so live UIs can't leak.

## Shipping to mobile

There is **no native iOS/Android SDK**. To ship to phones, use React Native with
the same `@bounded-sh/client` package — see
[building-for-react-native.md](building-for-react-native.md).

## Related

- [../docs/sdk-reference.md](../docs/sdk-reference.md) — full client method surface
- [../docs/auth.md](../docs/auth.md) — email (default) / Phantom wallet → `@user.id` (universal identity), `@user.address` (wallet-or-null), `@user.email`
- [../docs/queries.md](../../bounded-backend/docs/queries.md) — filters, sort, paging, aggregations, search
- [building-for-react-native.md](building-for-react-native.md) — shipping to iOS/Android
- [capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — what Bounded does and doesn't do
