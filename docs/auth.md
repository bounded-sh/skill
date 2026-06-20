# Auth — dev identity vs end-user auth

**What's in here / when to read this:** the two identity systems — your dev
keypair vs your app's end-users — plus account **linking** and **sharing** an app
with teammates by email.

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **Dev identity** | you / your agent | an ed25519 keypair the CLI and `bounded-sh/server` sign with | owns apps; the actor `bounded deploy` / `data` run as |
| **End-user auth** | your app's users | Bounded Better Auth (email — the default) or a connected Solana wallet (Phantom) | `@user.id` / `@user.address` / `@user.email` in policy rules |

## Dev identity — the keypair IS your account

There is **no login step** for building. The first `bounded` command generates
an ed25519 keypair and stores it in `~/.bounded/credentials` — a JSON file
(mode `0600`) with a base58 `privateKey` field. That keypair is the identity — it
owns every app you create and signs every write.

```bash
bounded whoami        # prints address, environment, key source (creates the credentials if absent)
```

- Override the on-disk credentials with **`BOUNDED_PRIVATE_KEY`** (a **base58**
  secret string), or point `HOME` elsewhere so the CLI reads/creates a separate
  `~/.bounded/credentials` — this is how you run a **distinct identity per
  agent**. A temp `HOME` (`HOME=$(mktemp -d) bounded whoami`) auto-creates a fresh
  key cleanly. Never reuse a human's keypair for an autonomous agent.

### Linking & teams

The keypair never needs a human account to build, verify, deploy, or read/write.
But you can **link** it to a human (email) account, and **share** apps with
teammates — without anyone juggling raw wallet keys:

- **`bounded link`** runs an OAuth-style **device flow**: the CLI prints a verify
  URL + code, you approve in a browser with your email account, and the CLI
  records the linkage. After linking, your keypair address **and** your email's
  wallet become admin-collaborators on each other's apps. **Your keypair keeps
  signing for everything** — linking adds an account association, it never
  replaces or rolls your key.
- **`bounded share <wallet|email> --app-id <id>`** adds a collaborator. Pass a
  **wallet** to add it directly (default role `policy` — may update the policy
  only). Pass an **email** and Bounded resolves it to that person's canonical
  wallet — an **auto-provisioned embedded wallet**, so the invitee needs no
  wallet of their own — added as an **`admin`** collaborator (may also act/sign on
  the app's data the way the owner can). `--role policy|admin` overrides the
  default. Only the owner can add collaborators; the server enforces it against
  the wallet derived from your keypair. List with `bounded collaborators`.

Collaboration is **control-plane** authority (manage the app). It is **not** a
data-plane bypass — see [admin-and-ownership.md](admin-and-ownership.md). Command
detail: [cli-reference.md](cli-reference.md).

On the server, the same kind of keypair drives `bounded-sh/server`:

```ts
import { init, createWalletClient } from "bounded-sh/server";
await init({ appId: "<appId>", network: "bounded-staging" });   // no keypair needed here
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });  // base58 or JSON array
vault.address;   // the signer this app acts as
```

`init()` on the server takes only `{ appId, network }` — it does **not** require
a keypair. Each `createWalletClient({ keypair })` carries its own signer, so one
process can act as many keypairs. If instead you want a single process-wide
signer for the global `set`/`get` helpers (no explicit client), set
**`BOUNDED_PRIVATE_KEY`** (same env var the CLI uses; a base58 secret or JSON
array). The keypair is read lazily — only the first signed write needs it.

## End-user auth — the `user` object

Your app's users authenticate through `bounded-sh`. **Email login is the default
— `init({ appId })` needs no `authMethod`.**

```ts
import { init, login, getCurrentUser } from "bounded-sh";

await init({ appId: "<appId>" });    // defaults to email (Bounded Better Auth)
await login();                       // opens an INLINE email-code modal — no popup, no redirect
const user = getCurrentUser();       // { id, address, email } | null
```

The inline modal is **email-only** (a 6-digit code, no popup, no full-page redirect).
It's the quickest drop-in, but it can't do social login (Google needs a redirect) and
it asserts your `appId` from the app origin.

### Hosted login (email + Google) — the secure redirect flow ← use this for Google / production

For **Google** (or any social provider) and the strongest multi-tenant security, use the
hosted OAuth2 + PKCE redirect flow. The token's `appId` is bound to a `redirect_uri` you
**register** for your app, so it can only be minted-through and delivered-to your own
origin — never spoofed by another app.

```ts
import { init, loginWithRedirect, completeLoginFromRedirect, getCurrentUser } from "bounded-sh";

await init({ appId: "<appId>" });

// On your "Sign in" button:
await loginWithRedirect({ redirectUri: "https://yourapp.com/auth/callback" });
//  → redirects to the hosted Bounded login (email + Google), then back to redirectUri?code=

// On your callback page (e.g. /auth/callback), on load:
const user = await completeLoginFromRedirect();   // exchanges the code (PKCE) → signs in
```

There's also `loginWithPopup({ redirectUri })` + `completeLoginInPopup(openerOrigin)` for a
popup instead of a full-page redirect. **Register your redirect URIs** for the app first
(exact match, https) — an unregistered `redirect_uri` is rejected, by design.

The inline email modal (`login()` above) and this redirect flow can coexist; pick inline for
a fast email-only drop-in, the redirect flow for Google + production-grade app isolation.

**Headless / custom UI / React Native** — build your own email + code inputs
(this is the only path on React Native, which has no DOM modal):

```ts
import { init, sendEmailOtp, verifyEmailOtp, getCurrentUser } from "bounded-sh";

await init({ appId: "<appId>" });
await sendEmailOtp("user@example.com");          // step 1: emails a code
const user = await verifyEmailOtp("user@example.com", "123456");  // step 2: signs in
```

**Anonymous accounts coexist** — offer email login AND zero-friction guest
accounts side by side (see [anonymous-accounts.md](anonymous-accounts.md)):

```ts
import { signInAnonymously } from "bounded-sh";
const guest = await signInAnonymously();   // device-keypair identity, upgradeable later
```

> **Browser / React-Native only.** `signInAnonymously`, `sendEmailOtp`, and
> `verifyEmailOtp` persist their session through `localStorage`, so they only work
> where there's a `window`. Calling them in Node throws a clear error (the session
> would otherwise be silently dropped and every request would 403). For Node /
> server code use **`bounded-sh/server`** with a keypair
> (`createWalletClient({ keypair })` or `BOUNDED_PRIVATE_KEY`).

`authMethod` options: `'email'` (the default — Bounded Better Auth inline OTP),
`'phantom'` (connect a Solana wallet — the recommended wallet option), or
`'none'`. Anonymous is via `signInAnonymously()`, not an `authMethod`.
(`'wallet'` is not implemented — use `'phantom'` for Solana wallets.)

The authenticated `user` object — mirrored into policy as `@user.*` — has **three
fields**:

| Field | Type | Meaning |
|---|---|---|
| `user.id` | `string` | the **universal stable identity**, **always present** for an authenticated user. For wallet logins it equals the wallet address; for email/social (Bounded Better Auth) logins it is the account identity. **Use this for ownership / membership / identity / auth guards.** |
| `user.address` | `string \| null` | a **real onchain wallet address**. Present for wallet logins, **`null` for email-only logins**. **Use this only for onchain operations / wallet semantics.** |
| `user.email` | `string \| null` | the verified, lowercased email (email logins only; `null` for wallet). Use it for email-gating. |

- **Email (Bounded Better Auth)** supports email (inline modal) and, via the hosted
  redirect flow (`loginWithRedirect`), social login (Google). Social requires the redirect
  flow — the inline modal is email-only.
  Email/social users authenticate as an **account identity** — they have a stable
  `@user.id` but **no** `@user.address` (it is `null`) unless a wallet is
  connected.
- **Phantom (wallet)** connects an existing Solana wallet directly; here
  `@user.id` equals the wallet address and `@user.address` is that same address.
- Whatever the method, **`@user.id` is the stable thing every authenticated
  request carries** — reach for it for identity. Reach for `@user.address` only
  when you genuinely need a wallet.

### React

```tsx
import { useAuth } from "bounded-sh";

function AuthButton() {
  const { user, login, logout, loading } = useAuth();
  if (loading) return null;
  return user
    ? <button onClick={logout}>{user.id.slice(0, 6)}… ↩</button>   // user.id always present; user.address may be null
    : <button onClick={login}>Sign in</button>;
}
```

Imperative equivalents: `onAuthStateChanged(cb)`, `onAuthLoadingChanged(cb)`,
`logout()`.

## How `@user.*` reaches your rules

Every authenticated request carries a session token. The realtime worker resolves
it and exposes the identity to the policy as `@user.id` (always present when
authenticated), plus `@user.address` (the wallet, or `null` for email-only
logins) and `@user.email` (or `null`). `@user.id` is the hinge of every **auth /
ownership** rule:

```json
"create": "@user.id != null && @newData.owner == @user.id"
```

The leading `@user.id != null` is mandatory — without it an unauthenticated
caller writing `owner: null` satisfies `null == null`. The proof engine hands
you that exact counterexample if you forget it
([verify-and-counterexamples.md](verify-and-counterexamples.md)).

Use `@user.id` — **not** `@user.address` — for ownership, membership, allowlist
gates, and bare auth guards. `@user.id` is always present, so email/social users
(who have **no** wallet) are still first-class owners. `@user.address` is `null`
for those users, so an `owner == @user.address` rule would silently break them.

**Onchain-only rule for `@user.address`:** inside an **`onchain: true`**
collection, `@user.id` and `@user.email` are **forbidden** — only `@user.address`
(a real wallet) is allowed, because onchain operations are wallet semantics. So
the split is:

```json
// offchain collection — identity / ownership
"create": "@user.id != null && @newData.owner == @user.id"

// onchain: true collection — wallet semantics only
"create": "@user.address != null && @newData.owner == @user.address"
```

Server-signed writes from `bounded-sh/server` arrive with the **keypair's**
wallet address; for onchain operations that is `@user.address`. Server logic is
just another authenticated actor the rules judge — give the vault key the access
its rules require, no more.

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — wiring end-user auth into a web app
- [../guides/building-for-agents.md](../guides/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [admin-and-ownership.md](admin-and-ownership.md) — control-plane collaborators vs data-plane rules (no god-mode)
- [cli-reference.md](cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](policy-reference.md) — `@user.id` / `@user.address` / `@user.email` in the rule language
