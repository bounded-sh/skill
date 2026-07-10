# Auth — CLI/admin auth vs end-user auth

**What's in here / when to read this:** the two identity systems — CLI/admin auth
for builders vs your app's end-users — plus account **linking**, CLI web login,
and **sharing** an app with teammates by email.

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **CLI/admin auth** | you / your agent | either a wallet/keypair account source or a Bounded web account session | owns/administers apps; wallet mode signs data-plane writes, web mode authenticates control-plane commands |
| **End-user auth** | your app's users | Bounded Auth (email OTP + OAuth/social + optional text OTP); with `auth.wallets`, supported email/social logins also receive a non-custodial **Crossmint wallet**, so those users carry both `@user.id` and `@user.address`. Browser guests use a device keypair; a connected Solana wallet (`walletLogin`) is the bring-your-own companion. | `@user.id` / `@user.address` / `@user.email` / `@user.isAnonymous` in policy rules |

## CLI auth — wallet/keypair vs web account

`bounded init` writes public `bounded.json`; account selection lives there. The
CLI has two account-source families:

- **Wallet/keypair mode** (default): `global` (`~/.bounded/credentials`),
  `project` (`<project>/.bounded/credentials`), `profile`
  (`~/.bounded/accounts/<profile>/credentials`), or `env`
  (`BOUNDED_PRIVATE_KEY`). The keypair is the signing identity; it owns apps
  created with it and signs data-plane writes.
- **Web account mode**: `bounded account use --web`, then
  `bounded login --email you@example.com`. This stores refreshable Bounded Auth
  credentials in `~/.bounded/web-session.json` and uses the web account directly.
  It does **not** create, link, or reuse a local wallet key. Email OTP is the
  current CLI web-login method; hosted/social web login uses the same account
  model when available.

```bash
bounded whoami                    # shows wallet address or web identity, environment, and source
bounded account use --web
bounded login --email you@example.com
```

> **Wallet mode key warning.** A wallet credentials file is auto-generated, never
> shown, and never backed up. Lose it without having linked, shared, or backed it
> up first and its apps are unrecoverable (there is no key-recovery command;
> `bounded account transfer-to-web` requires the key to still exist). Treat it
> like an SSH private key and
> run **`bounded link`** on day one if you choose wallet/keypair mode. Full
> guidance: [key-and-account-safety.md](../../bounded-deploy/docs/key-and-account-safety.md).

- Use `bounded account use <profile>` to run one project under another named
  wallet account without committing secrets. Use `bounded account use --project`
  for an isolated repo-local wallet key, `bounded account use --env` plus
  **`BOUNDED_PRIVATE_KEY`** for CI/automation, or `bounded account use --web` for
  a human web account. Never reuse a human's wallet keypair for an autonomous
  agent unless that is explicitly intended.

### Linking & teams

Wallet/keypair mode does not need a web account to build, verify, deploy, or
read/write. But the **canonical identity is your web account's user id** —
wallet keys are detachable signing credentials, and email is a verified
contact/login method for the web account. You can **link** a wallet key to a web
account, and **share** apps with teammates — without anyone juggling raw wallet
keys:

- **`bounded login`** is a plain **web login** — it signs you in to your web
  account (the same account you'd use at bounded.sh). No key is involved, and a
  `bounded login` web session does **not** link any local key.
- **`bounded link`** is wallet-only: it **explicitly attaches THIS device's
  local wallet key** to a **remote Bounded web account**; the current headless
  approval method is email OTP. It runs an OAuth-style **device flow**: the CLI
  prints a device code, you approve the fingerprint at **bounded.sh/link** in a
  browser with the remote web account (agents should print that URL for their
  user), and the CLI records the linkage. For headless/agent workflows, use
  `bounded link --email you@example.com`: the CLI sends the OTP, reads the code
  from stdin, approves the same fingerprint-checked device flow, and records the
  linkage without opening a browser. After linking, your keypair address and the
  web account become admin-collaborators on each other's apps. **Your keypair
  keeps signing for everything** — linking adds an account association, it never
  replaces or rolls your key. In web account mode, use `bounded login`; there is
  no local key to link.
  The link is one explicit wallet-key <-> web-account pair. One local key can be
  linked to one remote account, and that email/wallet combo is the durable
  association. Linking is **refused** if it would merge two unlinked accounts
  that both already own projects. When the current web login method is email,
  that email is also the owner notification surface for plan/usage alerts. You can
  run **`bounded account transfer-to-web`** (after `bounded login`; no link
  required, `--app <appId>` for a subset) to make the web account the
  owner-of-record, so the key is fully detachable. This is also the way to
  consolidate apps built on several machines onto one web account when linking
  is refused.
- **`bounded share <wallet|email> --role developer|admin|viewer|billing --app-id <id>`** adds a
  collaborator (`policy` is a legacy alias for `developer`). **Roles are plan-gated by the
  app OWNER's plan** — Free: none; Pro: 3 seats, `developer` only; Team+: 25 seats, every
  role — so default to `--role developer` unless the owner is Team+. Pass a **wallet** to add it directly. Pass an **email** and
  Bounded resolves it to that person's canonical wallet — an **auto-provisioned
  embedded wallet**, so the invitee needs no wallet of their own — then sends an
  invite email when outbound email is configured. `policy` may update the
  policy; `admin` may also act/sign on the app's data the way the owner can.
  Only the owner can add collaborators; the server enforces it against the active
  CLI identity. List with `bounded collaborators`.

Collaboration is **control-plane** authority (manage the app). It is **not** a
data-plane bypass — see [admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md). Command
detail: [cli-reference.md](../../bounded-deploy/docs/cli-reference.md).

On the server, `@bounded-sh/server` still uses explicit keypairs for
server-signed writes:

```ts
import { init, createWalletClient } from "@bounded-sh/server";
await init({ appId: "<appId>" });   // no keypair needed here
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

Your app's users authenticate through `@bounded-sh/client`. The canonical human login is
**Bounded Auth** — email OTP and OAuth/social login — with
**`auth.wallets` turned on** so supported email/social logins also get a non-custodial
**Crossmint wallet** (`@user.address`) without leaving the email flow. That gives
you the best of both: a stable account identity (`@user.id`) *and* a real wallet on
those accounts. Browser guests are a separate, offchain-only path. See [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md).
A purely offchain app may omit `auth.wallets` and its users simply have
`@user.address == null`; everything else should keep it on.

There are **two issuers**: wallet/guest auth (Phantom / anonymous,
`wallet-auth.bounded.sh`) and **human auth** (email / phone / social,
`auth.bounded.sh`). Human credentials are entered on the hosted issuer:

- **Hosted** (most secure): `loginWithRedirect({ methods })` or
  `loginWithPopup({ methods })`. The credential (email code, Google/Apple/GitHub,
  text) is entered on the Bounded issuer origin (`auth.bounded.sh`). On **web** no
  `redirectUri` is needed — it defaults to the current page; only **React Native**
  must pass one (an https universal link). Works web and React Native (deep links).

App-origin email/text OTP and guest-link helpers are retired and are not exported
by `@bounded-sh/client@0.0.42`. A guest who signs in through hosted auth gets a
distinct real `@user.id`; transfer guest-owned data explicitly when needed.

> Pick the methods (email / phone / social / wallet / guest) and hosted presentation
> that fit your app — see
> [Choosing your login methods & UX](#choosing-your-login-methods--ux) below.

> For a **live game**, the tick's calls have no human — `@user` is the **system
> principal** (all fields null unless you declare an acting identity). See
> [principals-and-origins.md](../../bounded-backend/docs/principals-and-origins.md).

### Choosing your login methods & UX

Picking end-user auth is **two independent builder decisions** — make both to fit
your app's vibe:

1. **Which methods** do users authenticate with? Mix and match: **email**, **phone**
   (text OTP, when enabled), **social** (Google / Apple / GitHub), browser
   **wallet** (Phantom / Wallet-Standard), React Native **Privy Expo** with an
   explicit provider, and zero-friction **guest** (`signInAnonymously()`). Enable
   only what your app needs.
2. **Which hosted UX** renders the human credential step?
   - **Hosted redirect** — `loginWithRedirect({ methods })`. Most
     secure; the credential never touches your origin. Works web + React Native
     (web needs no `redirectUri`; RN passes an https universal link).
   - **Hosted popup** — `loginWithPopup({ methods })`, when the host UI must stay open.

Wallet and guest are unaffected by this choice (they sign locally). Human auth
always runs through `auth.bounded.sh`; the app owns the button and method selection,
but not the credential form.

**Hitting an origin error?** Hosted auth rejects an unregistered redirect with
`redirect_uri origin is not a registered origin for this app`. Fix it by registering
the app's web origin — claim a vanity slug (`bounded domains slug <name> --app-id <id>`
→ `<slug>.bounded.page`) or add a custom domain (`bounded domains add <host> --app-id
<id>`); both wire `allowedOrigins` automatically. `localhost` (for dev) and Bounded's own
first-party `*.bounded.sh` origins are always allowed without registration.

### Login-method matrix — the whole menu

| Method | How you start it | Identity result | `@user.address` | Notes |
|---|---|---|---|---|
| **email OTP** | `loginWithRedirect({methods:["email"]})` or `loginWithPopup({methods:["email"]})` | account id | **Crossmint wallet** with `auth.wallets` (else `null`) | **the canonical login** |
| **social** (Google/Apple/GitHub) | `loginWithRedirect({provider:"google"})` | account id | **Crossmint wallet** with `auth.wallets` (else `null`) | hosted; the canonical login |
| **text OTP** | `loginWithRedirect({provider:"text"})` or hosted popup | account id | **Crossmint wallet** with `auth.wallets` (else `null`) | opt-in, off by default |
| **guest (browser)** | `signInAnonymously()` | durable device id | device keypair address (guest auth remains offchain-only) | zero-friction; `isAnonymous: true`; policy opt-in `auth.anonymous`; requires WebCrypto Ed25519 + IndexedDB |
| **WALLET (Solana), bring-your-own** | `init({authMethod:"phantom", walletLogin:true})` → `login()` | **real wallet** | **the wallet** | the companion login for users who already have a wallet — see below |
| **CLI/admin** | `bounded login` / keypair | web account or keypair | keypair addr | builder identity, not end-user |

### Solana wallet login (bring your own)

> **The companion to the canonical login.** The canonical login (email/social +
> `auth.wallets`) gives those users a Crossmint wallet; wallet login is for
> users who **already have** a Solana wallet and want to sign in *with it*. Add it
> alongside the canonical login by turning it on at `init()` with
> **`walletLogin: true`** (it's off until you pass the knob — an app that doesn't
> pass it sees no wallet-login button, and calling wallet login without the knob
> throws a clear error naming `walletLogin`). The two coexist: a bring-your-own
> user keeps their real wallet as `@user.address`, and `auth.wallets` never
> overwrites it.

When enabled, wallet login lets a user **connect their own Solana browser wallet**
(Phantom, or any Wallet-Standard `window.solana`) and sign in with it. Their **real
wallet address becomes `@user.address`** (and `@user.id`) everywhere — SIWS: the SDK
fetches a nonce, the wallet signs the canonical challenge locally, and the session is
minted by `wallet-auth.bounded.sh`. It rides the injected wallet provider — **no heavy
wallet SDK, no React dependency, no popup**.

```ts
import { init, login, signMessage, signTransaction, signAndSubmitTransaction } from "@bounded-sh/client";

// Add bring-your-own wallet login alongside the canonical email/social login.
await init({ appId: "<appId>", authMethod: "phantom", walletLogin: true });

// Right next to the login call — connects the injected wallet, signs the SIWS
// challenge, and mints the session. user.address === the user's real wallet.
const user = await login();          // throws an actionable error if walletLogin wasn't passed
console.log(user.address);           // e.g. "H9CAN…jdNCUE" — the REAL wallet, and @user.address in policy

// Full LOCAL signing surface — the wallet's OWN keypair (not a popup):
await signMessage("hello");                       // base58 ed25519 signature
await signTransaction(tx);                        // returns the signed tx
await signAndSubmitTransaction(tx);               // signs + submits, returns the tx hash
```

Advanced: pass an object instead of `true` to point at a specific wallet or bridge a
custom provider — `walletLogin: { getProvider: () => myWalletStandardProvider, network: "solana_mainnet" }`.
`authMethod: "wallet"` is an alias for `"phantom"`.

> **Wallet login vs `auth.wallets` (embedded wallets) — don't confuse them.**
>
> | | **Wallet login** (`walletLogin: true`) | **Email login + `auth.wallets`** (embedded) |
> |---|---|---|
> | Who has the key | the **user** (their Phantom/Wallet-Standard wallet) | a non-custodial **Crossmint embedded smart wallet** |
> | How they log in | connect wallet + SIWS | email/social OTP; the wallet is attached to the login |
> | `@user.address` | their **real** wallet | the embedded smart-wallet address |
> | Signing surface | full **local** `signMessage` / `signTransaction` / `signAndSubmitTransaction` (no popup) | `signAndSubmitTransaction` **only**, via a popup with email-OTP approval; `signMessage`/`signTransaction` throw |
> | Use it when | your users already have wallets / want wallet-native UX | you want email users to get a wallet without ever leaving email login |
>
> The two are independent and can coexist. A wallet-login user's `@user.address` is
> their real wallet and `auth.wallets` will **not** overwrite it (the embedded-wallet
> provisioner only runs for email/social logins that don't already carry a wallet).
> See [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md).

### Hosted login — email, social, and text in one flow

The hosted OAuth2 + PKCE redirect flow covers **email OTP, Google/Apple/GitHub,
and text** through a single chooser. The token's `appId` is bound to a
`redirect_uri` registered for your app, so it can only be minted through and
delivered to your own origin.

> **What users see:** the hosted page and the OTP email say **"Continue to
> `<your-domain>`"** using the *validated* `redirect_uri` host (e.g.
> `myapp.bounded.page`), not your app's display name. This is deliberate — a
> self-chosen name is spoofable (an app could call itself "Google"), the
> registered domain is not. So make your app reachable on a clear domain.

**Minimal web login (copy this).** As of `@bounded-sh/client` 0.0.30 web needs no
`redirectUri`, and one `completeLoginFromRedirect()` finishes **both** redirect and
popup:

```ts
import { init, loginWithRedirect, loginWithPopup, completeLoginFromRedirect, onAuthStateChanged } from "@bounded-sh/client";

await init({ appId: "<appId>" });
await completeLoginFromRedirect();          // finishes a redirect OR popup login; no-op otherwise
onAuthStateChanged((user) => { /* render signed-in UI */ });

// a button → hosted chooser (shows the methods enabled for the app):
loginWithRedirect({ methods: ["email", "google"] });   // or loginWithPopup({ methods: ["email", "google"] })
```

On **web** `redirectUri` is **optional** — it defaults to the current page
(`window.location.origin + pathname`), so the minimal flow needs no dedicated
callback route. Pass `redirectUri` only when you intentionally want the issuer to
return to a *different* URL than the one the user logged in from (it must be a
registered origin). On **React Native** `redirectUri` is **required** (an https
universal link) — see [building-for-react-native.md](building-for-react-native.md).

```ts
// Jump straight to one provider from your own button:
loginWithRedirect({ provider: "google" });   // "apple" / "github" when configured; "text" only when text OTP is enabled

// Or expose only the choices you want for this service:
loginWithRedirect({ methods: ["email", "google", "apple"] }); // add "text" only when text OTP is explicitly enabled
```

**One completion call covers both UXes.** Call `completeLoginFromRedirect()` once on
app load (or page mount): it finishes a full-page redirect *or* a popup login (it
auto-detects the popup internally) and is a no-op when there's nothing to finish.
There is **no** separate popup callback to wire. `loginWithPopup({ methods })` is the
popup variant for when the host UI must stay open; prefer full-page redirect for
production reliability, since browsers can block or close popups. **Register the
app's origins** first (https; localhost for dev) — an unregistered origin/redirect
is rejected by design.

The hosted redirect flow is the **most secure** human-login UX: the bare chooser, a
`provider`-specific button, and a `methods` subset are all the same
`loginWithRedirect` call, with the credential entered only on `auth.bounded.sh`. When
both email and text are enabled, the hosted page shows one OTP form with an Email/Text
switcher. If `methods` is ordered, the first enabled OTP method in that list is
selected by default; use `provider: "text"` to jump straight to text only when enabled.
The current SDK deliberately keeps the credential form on the hosted issuer;
app-origin OTP helpers are not exported.

### OAuth provider availability

Use the provider ids Bounded exposes for the app (`google`, `apple`, `github`,
and optional `text` when enabled). Your app's origins (and any custom `redirectUri`
you pass) must be registered; unregistered redirect URIs are rejected. If a provider you need is not available
for the app, use a direct provider integration outside Bounded Auth or wait until
Bounded exposes that provider publicly.

### SMS / text OTP

Text-message OTP is opt-in and off by default. It is not exposed by hosted login,
SDK config, or headless routes unless Bounded explicitly enables it for the
app and SMS delivery is configured. When enabled, it uses the same
authentication posture as email OTP: expiring codes, attempt limits, and rate
limits.

For app builders:

- Phone numbers must be E.164, e.g. `+14155550132`.
- Do not assume phone auth is available because SMS provider credentials exist;
  public availability is controlled by the app's Bounded Auth configuration.
- Text OTP is for authentication only. Do not treat it as consent for arbitrary
  app-originated SMS or WhatsApp messages.
- For non-auth messaging, integrate a real provider with your own API keys or use
  a public Bounded-managed messaging surface if one is available. Follow sender
  registration, opt-in, opt-out, and template rules for the channel.

Do not route OTP codes to tenant app webhooks.

Phone-only users get a normal `@user.id`, but `@user.email` is `null`. Do not
email-gate phone-only users. Extend the policy/user model separately only if
phone-number claims should become rule-visible.

### Hosted auth on web and React Native

Use `loginWithRedirect` or `loginWithPopup`; you own the button and method
selection, but the credential is entered on `auth.bounded.sh`:

```ts
import { init, loginWithRedirect, completeLoginFromRedirect } from "@bounded-sh/client";

await init({ appId: "<appId>" });
// Your own button → hosted chooser (or pass provider / methods to scope it):
await loginWithRedirect({ methods: ["email", "google"] });   // web: no redirectUri (defaults to current page)
// On app load: finishes the redirect (or a popup) and signs in; no-op otherwise.
const user = await completeLoginFromRedirect();   // exchanges the code (PKCE) → signs in
```

On **React Native** `loginWithRedirect` opens the system/in-app browser to the
issuer and returns through your registered deep-link `redirectUri`; see
[../guides/building-for-react-native.md](building-for-react-native.md)
for the deep-link callback wiring.

**Anonymous accounts coexist** — offer hosted login AND zero-friction guest
accounts side by side (opt-in: set `"auth": { "anonymous": true }` in policy; see
[anonymous-accounts.md](anonymous-accounts.md)):

```ts
import { signInAnonymously, loginWithRedirect, getCurrentUser } from "@bounded-sh/client";

const guest = await signInAnonymously();    // guest.isAnonymous === true
// ...later, when the guest wants a durable real account, send them through the
// SAME hosted redirect flow as any login — they come back as their real account:
await loginWithRedirect({ methods: ["email", "google"] });   // web: no redirectUri needed
// (on app load) const user = await completeLoginFromRedirect();
```

> A guest who logs in via `loginWithRedirect` comes back as a **distinct** real
> account (a new `@user.id`). The current client does not export an id-preserving
> link helper. Because only the old guest identity can transfer guest-owned data,
> do not attempt that transfer after replacing the session. Use the explicit
> two-login handoff in [anonymous-accounts.md](anonymous-accounts.md#3-migrate-browser-guest-data-to-a-real-account),
> or a separately designed one-time claim Function.

`user.isAnonymous` (Firebase parity) tells you guest vs real, e.g. to show a
"create a real account" prompt; in policy, `@user.isAnonymous == false` gates guests
out of a rule (Supabase parity).

> **Browser only in the current published client.** `signInAnonymously` requires
> non-extractable WebCrypto Ed25519 keys persisted in IndexedDB. Standard React
> Native does not provide IndexedDB, and configuring the RN session adapter does
> not add it, so guest auth fails closed there. Use hosted RN login or the explicit
> Privy Expo bridge. For Node/server code use **`@bounded-sh/server`** with a
> keypair (`createWalletClient({ keypair })` or `BOUNDED_PRIVATE_KEY`).

`authMethod` selects the **identity system**, not a login UI. The supported
documented choices are:

| Path | Configuration |
|---|---|
| Hosted Bounded Auth (email, OAuth/social, optional text) | omit `authMethod` or use `authMethod: "email"`, then call `loginWithRedirect` / `loginWithPopup` |
| Browser bring-your-own wallet | `authMethod: "phantom"` or its `"wallet"` alias, plus `walletLogin: true` |
| React Native Privy | `authMethod: "privy-expo"` plus an explicit bridged `privyExpoProvider` |
| Guest | call `signInAnonymously()`; guest is not selected through `authMethod` |

Pair hosted Bounded Auth with `auth.wallets` (policy) when email/social users
also need a Crossmint wallet. Browser wallet login is the bring-your-own-wallet
companion for users who already have a Solana wallet and need local signing; see
[Solana wallet login (bring your own)](#solana-wallet-login-bring-your-own).

The authenticated `user` object — mirrored into policy as `@user.*` — has **four
fields**:

| Field | Type | Meaning |
|---|---|---|
| `user.id` | `string` | the **universal stable identity**, **always present** for an authenticated user. For wallet logins it equals the wallet address; for Bounded Auth logins (email, text, OAuth/social) it is the account identity. **Use this for ownership / membership / identity / auth guards.** |
| `user.address` | `string \| null` | a **real onchain wallet address**. With the canonical `auth.wallets` config it is the user's **Crossmint wallet**, populated for email/social logins too (a bring-your-own wallet login sets it to that real wallet). `null` only when the app runs without `auth.wallets` and the user has no connected wallet. **Use this for onchain operations / wallet semantics — not as the identity key.** |
| `user.email` | `string \| null` | the verified, lowercased email for email/OAuth accounts. It is `null` for wallet and phone-only text users. Use it only when email-gating is genuinely intended. |
| `user.isAnonymous` | `boolean` | `true` for a zero-friction **guest** (`signInAnonymously()`); `false` for any real (email/social/text/wallet) login. Drives the "create a real account" prompt. Mirrored in policy as `@user.isAnonymous` (offchain; write `== false` to gate guests out). |

- **Bounded Auth** (the canonical login) supports email OTP, optional text OTP (when
  enabled), and OAuth/social login (Google, Apple, GitHub today) through the
  hosted issuer (`loginWithRedirect` / `loginWithPopup`).
  Bounded Auth users authenticate as an **account identity** — a stable `@user.id` —
  and with **`auth.wallets`** on (the canonical config) they also carry a
  non-custodial **Crossmint `@user.address`**. Without `auth.wallets`, `@user.address`
  is `null` unless a wallet is connected. Phone-only text users have
  `@user.email == null`.
- **Phantom (wallet login)** is the **bring-your-own-wallet companion** — it connects
  an existing Solana wallet directly (the "connect wallet" choice), turned on at
  `init()` with **`walletLogin: true`**. Add it when some users already have a wallet.
  Here `@user.id` equals the real wallet address and `@user.address` is that same
  address, and the user gets the full LOCAL signing surface
  (`signMessage`/`signTransaction`/`signAndSubmitTransaction`). See
  [Solana wallet login (bring your own)](#solana-wallet-login-bring-your-own).
- Whatever the method, **`@user.id` is the stable thing every authenticated
  request carries** — reach for it for identity. Reach for `@user.address` only
  when you genuinely need a wallet.

### React

```tsx
import { useAuth, loginWithRedirect } from "@bounded-sh/client";

function AuthButton() {
  const { user, logout, loading } = useAuth();
  if (loading) return <Spinner />;                 // see "loading" below — drive your busy UI off this
  return user
    ? <button onClick={logout}>{user.id.slice(0, 6)}… ↩</button>   // user.id always present; user.address may be null
    : <button onClick={() => loginWithRedirect({ methods: ["email", "google"] })}>Sign in</button>;
}
```

**`loading` reflects ANY auth in progress** — session restore on load and the
published login methods (`loginWithRedirect`, `loginWithPopup`,
`signInAnonymously`). Render your "signing in…" state off it (e.g. a spinner/overlay
+ disabled buttons) so a popup or guest login isn't a dead-looking page. It flips back to
`false` when the user resolves or the attempt fails — you don't manage it yourself.

Imperative (non-React) equivalents: `onAuthStateChanged(cb)` and `onAuthLoadingChanged(cb)`
(both fire immediately with the current value and return an unsubscribe fn), `getAuthLoading()`,
`logout()`. Minimal busy UI without the hook:

```ts
import { onAuthLoadingChanged } from "@bounded-sh/client";
onAuthLoadingChanged((busy) => { overlay.style.display = busy ? "block" : "none"; });
loginWithPopup({ methods: ["google"] });   // overlay shows while the popup is open, hides on resolve
```

## How `@user.*` reaches your rules

Every authenticated request carries a session token. Bounded resolves it and
exposes the identity to the policy as `@user.id` (always present when
authenticated), plus `@user.address` (the wallet, or `null` for non-wallet
logins) and `@user.email` (or `null`). `@user.id` is the hinge of every **auth /
ownership** rule:

```json
"create": "@user.id != null && @newData.owner == @user.id"
```

The leading `@user.id != null` is mandatory — without it an unauthenticated
caller writing `owner: null` satisfies `null == null`. The proof engine hands
you that exact counterexample if you forget it
([verify-and-counterexamples.md](../../bounded-backend/docs/verify-and-counterexamples.md)).

Use `@user.id` — **not** `@user.address` — for ownership, membership, allowlist
gates, and bare auth guards. `@user.id` is always present the instant a user is
authenticated, so it never breaks a login. This holds **even with the canonical
`auth.wallets` config**: a brand-new email's Crossmint `@user.address` is provisioned
in the background and lands on the user's *next* login, so keying ownership on
`@user.address` would intermittently break first-time users. `@user.id` has no such
lag — reach for it for identity, and treat `@user.address` as the wallet.

> **`@user.address` for wallet semantics.** With the canonical `auth.wallets` config
> (`{ "auth": { "wallets": true } }`), the issuer attaches a non-custodial Crossmint
> wallet to **every email-carrying login** and populates `@user.address` — so it is
> safe to *use* for onchain operations and wallet lookups for email/social users, not
> just wallet-login users. Keep keying **ownership/identity** on `@user.id` (no
> first-login lag); use `@user.address` for the wallet. See
> [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md).

**Onchain-only rule for `@user.address`:** inside an **`onchain: true`**
collection, `@user.id`, `@user.email`, and `@user.isAnonymous` are all
**forbidden** — only `@user.address` (a real wallet) is allowed, because onchain
operations are wallet semantics. So the split is:

```json
// offchain collection — identity / ownership
"create": "@user.id != null && @newData.owner == @user.id"

// onchain: true collection — wallet semantics only
"create": "@user.address != null && @newData.owner == @user.address"
```

Server-signed writes from `@bounded-sh/server` arrive with the **keypair's**
wallet address; for onchain operations that is `@user.address`. Server logic is
just another authenticated actor the rules judge — give the vault key the access
its rules require, no more.

## Related

- [../guides/building-a-webapp.md](building-a-webapp.md) — wiring end-user auth into a web app
- [../guides/building-for-agents.md](../../bounded-backend/docs/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md) — `auth.wallets`: a non-custodial wallet + `@user.address` on every email login
- [admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md) — control-plane collaborators vs data-plane rules (no god-mode)
- [access-control.md](../../bounded-backend/docs/access-control.md) — control roles, sharing by email (registered or brand-new), external contributors & platform super-admins
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](../../bounded-backend/docs/policy-reference.md) — `@user.id` / `@user.address` / `@user.email` in the rule language
