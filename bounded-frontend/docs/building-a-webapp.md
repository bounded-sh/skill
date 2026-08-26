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

**Onchain apps (`realtime_devnet` / `realtime_mainnet`) must also pass `chain`
and a TOP-LEVEL `rpcUrl`** - the SDK refreshes the transaction's blockhash from
that endpoint just before the wallet approves and then submits the pre-built
onchain transaction itself, and without it the first onchain `set()` fails with
`Pre-built Solana transaction submission requires init({ rpcUrl })`:

```ts
await init({
  appId: "<appId>",
  chain: "solana_devnet",                        // the app's onchain network
  rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,   // e.g. "https://api.devnet.solana.com"
  walletLogin: true,                             // if the app offers wallet login
});
```

A nested `walletLogin.rpcUrl` configures wallet login only and does not enable
submission. Full detail:
[Browser/SDK submission needs an explicit RPC endpoint](../../bounded-onchain/docs/onchain-troubleshooting.md#browsersdk-submission-needs-an-explicit-rpc-endpoint).

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
- `user.address` — a real onchain wallet address. Present for wallet logins and,
  by default, for supported email/social logins too (an embedded Turnkey wallet is
  eagerly provisioned on first login); `null` for phone-only sessions, apps with
  `auth.wallets: false`, the legacy lazy `authMode: "bounded"` path, and on a
  wallet-config lookup failure. Use for onchain / wallet operations.
- `user.email` — the verified, lowercased email (email logins only; `null` for
  wallet). Use for email-gating.

Full auth model: [../docs/auth.md](../docs/auth.md).

Testing login from a local dev server (`npm run dev`)? Hosted login only opens
for registered origins, so register your localhost origin once first — see
[Develop on localhost](#develop-on-localhost). Data reads/writes need no
registration; only login checks the origin.

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

## Develop on localhost

Run your dev server as usual (`npm run dev` — Vite, Next, anything) against the
deployed backend. The data plane needs **no origin setup** from
`http://localhost`: reads, writes, subscriptions, and file uploads are governed
by policy, not by where the page is served.

**Hosted login is the one thing that checks your origin.** The issuer only
opens the login flow for origins the app's owner registered, so the first
`loginWithPopup` / `loginWithRedirect` from an unregistered dev server fails —
the popup shows an error like:

```json
{ "error": "invalid_request",
  "error_description": "redirect_uri origin is not a registered origin for this app" }
```

Fix it once per app + port (run as the app owner):

```bash
bounded domains origins add http://localhost:5173 --app-id <id>
```

- `http://` is accepted **only** for `localhost` / `127.0.0.1` / `[::1]`; every
  other origin must be `https`.
- Matching is port-exact: `:5173` and `:3000` are different origins — register
  each dev port you actually use.
- Takes effect within ~30 seconds (server-side config caches).
- The registration is permanent, like a localhost redirect URI in Google or
  GitHub OAuth. This is safe: only the owner can add origins, and plaintext
  `http` never authorizes a non-loopback host. Remove one any time with
  `bounded domains origins remove <origin> --app-id <id>`.
- If the app has been **launched as an oApp**, its origin list is frozen
  (`409 oapp_launched`) — register dev origins before launching.

## Shipping to mobile

There is **no native iOS/Android SDK**. To ship to phones, use React Native with
the same `@bounded-sh/client` package — see
[building-for-react-native.md](building-for-react-native.md).

## Related

- [../docs/sdk-reference.md](../docs/sdk-reference.md) — full client method surface
- [../docs/auth.md](../docs/auth.md) — email (default) / Phantom wallet → `@user.id` (universal identity), `@user.address` (an embedded Turnkey wallet is eagerly provisioned by default, so this is present for supported email/social logins too), `@user.email`
- [../docs/queries.md](../../bounded-backend/docs/queries.md) — filters, sort, paging, aggregations, search
- [building-for-react-native.md](building-for-react-native.md) — shipping to iOS/Android
- [capabilities-and-limits.md](../../bounded/guides/capabilities-and-limits.md) — what Bounded does and doesn't do
