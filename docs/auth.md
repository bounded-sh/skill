# Auth — dev identity vs end-user auth

**What's in here / when to read this:** the two identity systems — your dev
keypair vs your app's end-users — plus account **linking** and **sharing** an app
with teammates by email.

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **Dev identity** | you / your agent | an ed25519 keypair the CLI and `@bounded-sh/server` sign with | owns apps; the actor `bounded deploy` / `data` run as |
| **End-user auth** | your app's users | Bounded Auth for normal apps (email OTP + OAuth/social + optional text OTP), or a connected Solana wallet (Phantom) for crypto apps | `@user.id` / `@user.address` / `@user.email` in policy rules |

## Dev identity — the keypair IS your account

There is **no login step** for building. `bounded init` writes public
`bounded.json`; the first command that needs auth generates or loads the account
source selected there. By default that is `~/.bounded/credentials` — a JSON file
(mode `0600`) with a base58 `privateKey` field. A project can instead select a
profile (`~/.bounded/accounts/<profile>/credentials`), a project key
(`<project>/.bounded/credentials`), or `BOUNDED_PRIVATE_KEY`. That keypair is the
identity — it owns every app you create and signs every write.

```bash
bounded whoami        # prints address, environment, key source (creates the credentials if absent)
```

> **Don't lose this key.** `~/.bounded/credentials` is auto-generated, never shown,
> and never backed up — and it **owns every app you create**. Lose it without having
> linked or shared first and those apps are **unrecoverable** (there is no
> transfer-ownership or key-recovery command). Treat it like an SSH private key: back
> it up, and run **`bounded link`** on day one as your anti-loss mechanism. Full
> guidance: [key-and-account-safety.md](key-and-account-safety.md).

- Use `bounded account use <profile>` to run one project under another named
  account without committing secrets. Override everything with
  **`BOUNDED_PRIVATE_KEY`** (a **base58** secret string) for CI/automation.
  Never reuse a human's keypair for an autonomous agent unless that is explicitly
  intended.

### Linking & teams

The keypair never needs a human account to build, verify, deploy, or read/write.
But you can **link** it to a human (email) account, and **share** apps with
teammates — without anyone juggling raw wallet keys:

- **`bounded link`** runs an OAuth-style **device flow**: the CLI prints a verify
  URL + code, you approve in a browser with your email account, and the CLI
  records the linkage. For headless/agent workflows, use
  `bounded link --email you@example.com`: the CLI sends the OTP, reads the code
  from stdin, approves the same fingerprint-checked device flow, and records the
  linkage without opening a browser. After linking, your keypair address **and**
  your email's wallet become admin-collaborators on each other's apps. **Your
  keypair keeps signing for everything** — linking adds an account association,
  it never replaces or rolls your key.
  A linked email account is unique: Bounded will not intentionally attach the
  same wallet/user identity to two different email accounts. Once linked, that
  email is also the owner notification surface for plan/usage alerts.
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

On the server, the same kind of keypair drives `@bounded-sh/server`:

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

Your app's users authenticate through `@bounded-sh/client`. For a normal,
non-crypto app, use **Bounded Auth**: email OTP, OAuth/social login, and optional
anonymous guest accounts. `init({ appId })` with **no** `authMethod` selects the
email OTP provider, so the zero-config `login()` path still works. A returning
user's stored method still wins; an explicit `authMethod` still wins.

```ts
import { init, login, getCurrentUser } from "@bounded-sh/client";

await init({ appId: "<appId>" });    // email is the default — no authMethod needed
await login();                       // opens an INLINE email-code modal — no popup, no redirect
const user = getCurrentUser();       // { id, address, email } | null
```

> For a **live game**, the tick's calls have no human — `@user` is the **system
> principal** (all fields null unless you declare an acting identity). See
> [principals-and-origins.md](principals-and-origins.md).

The inline modal is **email-only** (a 6-digit code, no popup, no full-page
redirect). It's the quickest drop-in, but it cannot do OAuth/social login because
Google/Apple/GitHub require a browser redirect. Text OTP is off by default and
is available through the headless SDK helpers and hosted login only when Bounded
explicitly enables it for the app.

### Hosted login — OAuth/social is first-class

For **Google, Apple, GitHub, or any social provider**, use the hosted OAuth2 +
PKCE redirect flow. The token's `appId` is bound to a `redirect_uri` registered
for your app, so it can only be minted through and delivered to your own origin.

```ts
import { init, loginWithRedirect, completeLoginFromRedirect, getCurrentUser } from "@bounded-sh/client";

await init({ appId: "<appId>" });

// Hosted chooser: shows the methods enabled for the app.
await loginWithRedirect({ redirectUri: "https://yourapp.com/auth/callback" });

// App-owned buttons: jump directly to one provider.
await loginWithRedirect({
  redirectUri: "https://yourapp.com/auth/callback",
  provider: "google",      // "apple" and "github" also work when configured; "text" only when text OTP is enabled
});

// App-owned hosted chooser: expose only the choices you want for this service.
await loginWithRedirect({
  redirectUri: "https://yourapp.com/auth/callback",
  methods: ["email", "google", "apple"], // add "text" only when text OTP is explicitly enabled
});

// On your callback page (e.g. /auth/callback), on load:
const user = await completeLoginFromRedirect();   // exchanges the code (PKCE) → signs in
```

There's also `loginWithPopup({ redirectUri, provider })` +
`completeLoginInPopup(openerOrigin)` for a popup instead of a full-page redirect.
Prefer full-page redirect for production reliability; popup is acceptable when
the host UI really needs to stay open, but browsers can block or close popups.
**Register redirect URIs** for the app first (exact match, https; localhost for
dev) — an unregistered `redirect_uri` is rejected by design.

The inline email modal (`login()` above) and the hosted redirect flow can coexist.
Use inline only for a fast email-only drop-in. Use hosted redirect for OAuth,
provider selection, and production-grade app isolation. Text OTP belongs in the
hosted/headless path only when it is explicitly enabled. When both email and text
are enabled, the hosted page shows one OTP form with an Email/Text switcher. If
`methods` is ordered, the first enabled OTP method in that list is selected by
default; use `provider: "text"` to jump straight to text only when enabled.

### OAuth provider availability

Use the provider ids Bounded exposes for the app (`google`, `apple`, `github`,
and optional `text` when enabled). Your app still owns its OIDC `redirectUri`, and
unregistered redirect URIs are rejected. If a provider you need is not available
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

**Headless / custom UI / React Native** — build your own email + code inputs;
add text + code only when text OTP is explicitly enabled. This is the only path
on React Native, which has no DOM modal:

```ts
import { init, sendEmailOtp, verifyEmailOtp, sendTextOtp, verifyTextOtp } from "@bounded-sh/client";

await init({ appId: "<appId>" });
await sendEmailOtp("user@example.com");          // step 1: emails a code
const user = await verifyEmailOtp("user@example.com", "123456");  // step 2: signs in

// Only when text OTP is explicitly enabled for the app:
await sendTextOtp("+14155550132");               // step 1: texts a code
const byText = await verifyTextOtp("+14155550132", "123456");     // step 2: signs in
```

**Anonymous accounts coexist** — offer email login AND zero-friction guest
accounts side by side (opt-in: set `"auth": { "anonymous": true }` in policy; see
[anonymous-accounts.md](anonymous-accounts.md)):

```ts
import { signInAnonymously, sendEmailOtp, linkEmail, getCurrentUser } from "@bounded-sh/client";

const guest = await signInAnonymously();    // guest.isAnonymous === true
// ...later, upgrade WITHOUT losing the identity or data (Firebase linkWithCredential parity):
await sendEmailOtp("user@example.com");
const upgraded = await linkEmail("user@example.com", "123456");
upgraded.isAnonymous;  // false — same @user.id as the guest (its data carries over)
```

`user.isAnonymous` (Firebase parity) tells you guest vs real for the upgrade prompt;
in policy, `@user.isAnonymous == false` gates guests out of a rule (Supabase parity).

> **Browser / React-Native only.** `signInAnonymously`, `sendEmailOtp`,
> `verifyEmailOtp`, `sendTextOtp`, and `verifyTextOtp` persist their session through `localStorage`, so they only work
> where there's a `window`. Calling them in Node throws a clear error (the session
> would otherwise be silently dropped and every request would 403). For Node /
> server code use **`@bounded-sh/server`** with a keypair
> (`createWalletClient({ keypair })` or `BOUNDED_PRIVATE_KEY`).

`authMethod` options: **`'email'` is THE default** (Bounded Auth inline OTP) —
`init({ appId })` with no `authMethod` selects it. **OAuth/social hosted login**
uses `loginWithRedirect` / `loginWithPopup`, not `authMethod`; text OTP uses
hosted login or `sendTextOtp` / `verifyTextOtp` only when explicitly enabled.
**Guest** via
`signInAnonymously()` is the natural frictionless second choice (not an
`authMethod`; see below). **`'phantom'`** (connect a Solana wallet) is a
crypto/onchain opt-in — use it only when the app is crypto-enabled and needs a
real user wallet for signing, onchain ownership, or wallet-native UX.
`'none'` disables end-user auth.
(`'wallet'` is not implemented — use `'phantom'` for Solana wallets.)

The authenticated `user` object — mirrored into policy as `@user.*` — has **three
fields**:

| Field | Type | Meaning |
|---|---|---|
| `user.id` | `string` | the **universal stable identity**, **always present** for an authenticated user. For wallet logins it equals the wallet address; for Bounded Auth logins (email, text, OAuth/social) it is the account identity. **Use this for ownership / membership / identity / auth guards.** |
| `user.address` | `string \| null` | a **real onchain wallet address**. Present for wallet logins, **`null` for Bounded Auth logins** unless a wallet is linked. **Use this only for onchain operations / wallet semantics.** |
| `user.email` | `string \| null` | the verified, lowercased email for email/OAuth accounts. It is `null` for wallet and phone-only text users. Use it only when email-gating is genuinely intended. |
| `user.isAnonymous` | `boolean` | `true` for a zero-friction **guest** (`signInAnonymously()`); `false` after upgrade (`linkEmail`) or for any real login. Drives the "save your account" prompt. Mirrored in policy as `@user.isAnonymous` (offchain; write `== false` to gate guests out). |

- **Bounded Auth** supports email OTP (inline modal or headless), optional text
  OTP (headless or hosted only when enabled), and, via the hosted redirect flow
  (`loginWithRedirect`), OAuth/social login (Google, Apple, GitHub today).
  Social and hosted text require the redirect flow — the inline modal is
  email-only.
  Bounded Auth users authenticate as an **account identity** — they have a stable
  `@user.id` but **no** `@user.address` (it is `null`) unless a wallet is
  connected. Phone-only text users also have `@user.email == null`.
- **Phantom (wallet)** connects an existing Solana wallet directly. This is for
  crypto-enabled apps. Here `@user.id` equals the wallet address and
  `@user.address` is that same address.
- Whatever the method, **`@user.id` is the stable thing every authenticated
  request carries** — reach for it for identity. Reach for `@user.address` only
  when you genuinely need a wallet.

### React

```tsx
import { useAuth } from "@bounded-sh/client";

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
([verify-and-counterexamples.md](verify-and-counterexamples.md)).

Use `@user.id` — **not** `@user.address` — for ownership, membership, allowlist
gates, and bare auth guards. `@user.id` is always present, so email/social users
(who have **no** wallet) are still first-class owners. `@user.address` is `null`
for those users, so an `owner == @user.address` rule would silently break them.

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

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — wiring end-user auth into a web app
- [../guides/building-for-agents.md](../guides/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [admin-and-ownership.md](admin-and-ownership.md) — control-plane collaborators vs data-plane rules (no god-mode)
- [cli-reference.md](cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](policy-reference.md) — `@user.id` / `@user.address` / `@user.email` in the rule language
