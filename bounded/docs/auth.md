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
- **`bounded share <wallet|email> --role developer|admin|viewer|billing --app-id <id>`** adds a
  collaborator (`policy` is a legacy alias for `developer`). Pass a **wallet** to add it directly. Pass an **email** and
  Bounded resolves it to that person's canonical wallet — an **auto-provisioned
  embedded wallet**, so the invitee needs no wallet of their own — then sends an
  invite email when outbound email is configured. `policy` may update the
  policy; `admin` may also act/sign on the app's data the way the owner can.
  Only the owner can add collaborators; the server enforces it against the
  wallet derived from your keypair. List with `bounded collaborators`.

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
anonymous guest accounts. There are **two issuers**: wallet/guest auth
(Phantom / Privy / anonymous, `wallet-auth.bounded.sh`) and **human auth**
(email / phone / social, `auth.bounded.sh`). For human auth **your app chooses its
UX** — a hosted page *and* your own inline UI both work, against the same issuer:

- **Hosted** (most secure): `loginWithRedirect({ methods })` or
  `loginWithPopup({ methods })`. The credential (email code, Google/Apple/GitHub,
  text) is entered on the Bounded issuer origin (`auth.bounded.sh`). On **web** no
  `redirectUri` is needed — it defaults to the current page; only **React Native**
  must pass one (an https universal link). Works web and React Native (deep links).
- **Inline** (your own UI): `sendEmailOtp(email)` then `verifyEmailOtp(email, code)`
  render your own email/code form (and `sendTextOtp` / `verifyTextOtp` when the
  issuer has text OTP enabled). There's also a built-in `login()` modal (web; behind
  a `hasDOM` guard) and `authMethod: 'email'`. These are **restored** in
  `@bounded-sh/client` 0.0.29. Inline works on web (from an origin the app owner
  registered) **and** React Native / CLI / server (no-Origin callers are allowed for
  real apps).
- **Guest upgrade**: `linkEmail(email, code)` (inline; send the code first with
  `sendEmailOtp`) preserves the guest's `@user.id` when the email is brand-new and
  refuses if the wallet is already linked; `linkWithRedirect()` is the hosted equivalent.

> Pick the methods (email / phone / social / wallet / guest) **and** the UX (inline
> vs hosted) that fit your app — see
> [Choosing your login methods & UX](#choosing-your-login-methods--ux) below.
> One guardrail: inline minting is for **real (ObjectId) app ids** only —
> non-ObjectId superuser/platform clients (e.g. `bounded-admin`) are OIDC/hosted-only,
> and inline browser callers must come from an origin the app owner registered.

> For a **live game**, the tick's calls have no human — `@user` is the **system
> principal** (all fields null unless you declare an acting identity). See
> [principals-and-origins.md](principals-and-origins.md).

### Choosing your login methods & UX

Picking end-user auth is **two independent builder decisions** — make both to fit
your app's vibe:

1. **Which methods** do users authenticate with? Mix and match: **email**, **phone**
   (text OTP, when enabled), **social** (Google / Apple / GitHub), **wallet**
   (Phantom / Privy, for crypto apps), and zero-friction **guest**
   (`signInAnonymously()`). Enable only what your app needs.
2. **Which UX** renders the human credential step? These all hit the same issuer:
   - **Inline custom UI** — your own email/code form via `sendEmailOtp` /
     `verifyEmailOtp` (and `sendTextOtp` / `verifyTextOtp` when text is on). Most
     control over look-and-feel; works web (registered origin) + RN / CLI / server.
   - **Hosted redirect** — `loginWithRedirect({ methods })`. Most
     secure; the credential never touches your origin. Works web + React Native
     (web needs no `redirectUri`; RN passes an https universal link).
   - **Hosted popup** — `loginWithPopup({ methods })`, when the host UI must stay open.
   - **Built-in modal** — the zero-config `login()` modal (web; behind a `hasDOM`
     guard) or `authMethod: 'email'`, when you want inline with no UI to build.

Wallet and guest are unaffected by this choice (they sign locally). For human auth,
inline and hosted are equally supported against `auth.bounded.sh` — pick the one that
fits. Two guardrails: inline minting is for **real (ObjectId) app ids** only
(non-ObjectId superuser/platform clients such as `bounded-admin` are OIDC/hosted-only),
and inline **browser** callers must come from an origin the app owner registered
(no-Origin callers — React Native, CLI, server — are allowed for real apps).

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
universal link) — see [building-for-react-native.md](../guides/building-for-react-native.md).

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
If you'd rather render your **own** email/code UI, use the inline OTP primitives
instead (`sendEmailOtp` / `verifyEmailOtp`) — see
[Custom UI (inline OTP) & React Native](#custom-ui-inline-otp--react-native) below.

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

### Custom UI (inline OTP) & React Native

Prefer to render your **own** email/code UI instead of bouncing to the hosted page?
Use the inline OTP primitives — restored in `@bounded-sh/client` 0.0.29:

```ts
import { init, sendEmailOtp, verifyEmailOtp, getCurrentUser } from "@bounded-sh/client";

await init({ appId: "<appId>" });
await sendEmailOtp("user@example.com");                       // issuer emails a code
const user = await verifyEmailOtp("user@example.com", code);  // your own form collects `code`
getCurrentUser();                                             // signed in
```

`sendTextOtp` / `verifyTextOtp` are the text-OTP equivalents (only when the issuer has
text OTP enabled for the app). There's also the built-in `login()` modal (web; behind a
`hasDOM` guard) and `authMethod: 'email'` if you want a zero-config inline modal rather
than building your own form.

> **Where inline works.** Inline minting is for **real (ObjectId) app ids** only.
> Browser callers must come from an **origin the app owner registered**; no-Origin
> callers (React Native, CLI, server) are allowed for real apps. Non-ObjectId
> superuser/platform clients (e.g. `bounded-admin`) are **OIDC-only** — they must use
> the hosted flow.

If you'd rather not build a code form — or want the most secure UX — use
`loginWithRedirect` instead; you own the button, but the credential is entered on
`auth.bounded.sh`:

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
[../guides/building-for-react-native.md](../guides/building-for-react-native.md)
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

> **Id-preserving guest upgrade.** To turn a guest into an email account **keeping
> the same `@user.id`**, send a code with `sendEmailOtp(email)` then call
> `linkEmail(email, code)` (inline) — the issuer preserves the guest's id when the
> email is brand-new, and refuses if the wallet is already linked to another account.
> `linkWithRedirect()` is the hosted equivalent (web needs no `redirectUri`; RN passes
> an https universal link). Alternatively, a guest
> who simply logs in via `loginWithRedirect` comes back as a **distinct** real account
> (a new `@user.id`); to carry their data across that boundary, model ownership as
> **transferable data** (see [anonymous-accounts.md](anonymous-accounts.md) §
> "transferable ownership") and hand the data to the real id.

`user.isAnonymous` (Firebase parity) tells you guest vs real, e.g. to show a
"create a real account" prompt; in policy, `@user.isAnonymous == false` gates guests
out of a rule (Supabase parity).

> **Browser / React-Native only.** `signInAnonymously` persists its session through
> `localStorage`, so it only works where there's a `window`. Calling it in Node
> throws a clear error (the session would otherwise be silently dropped and every
> request would 403). For Node / server code use **`@bounded-sh/server`** with a
> keypair (`createWalletClient({ keypair })` or `BOUNDED_PRIVATE_KEY`).

`authMethod` selects the **identity system**, not a login UI. **Bounded Auth is
the default** — email + OAuth/social + optional text, and each of those human logins
can run **either** through the hosted redirect flow (`loginWithRedirect` /
`loginWithPopup`) **or** inline against the same issuer (`sendEmailOtp` /
`verifyEmailOtp`, the `login()` modal, or `authMethod: 'email'`) — your choice of UX.
**Guest** via `signInAnonymously()` is the natural frictionless second choice (not
an `authMethod`; see below). **`'phantom'`** (connect a Solana wallet) is a
crypto/onchain opt-in — use it only when the app is crypto-enabled and needs a real
user wallet for signing, onchain ownership, or wallet-native UX. `'none'` disables
end-user auth. (`'wallet'` is not implemented — use `'phantom'` for Solana wallets.)

The authenticated `user` object — mirrored into policy as `@user.*` — has **three
fields**:

| Field | Type | Meaning |
|---|---|---|
| `user.id` | `string` | the **universal stable identity**, **always present** for an authenticated user. For wallet logins it equals the wallet address; for Bounded Auth logins (email, text, OAuth/social) it is the account identity. **Use this for ownership / membership / identity / auth guards.** |
| `user.address` | `string \| null` | a **real onchain wallet address**. Present for wallet logins, **`null` for Bounded Auth logins** unless a wallet is linked. **Use this only for onchain operations / wallet semantics.** |
| `user.email` | `string \| null` | the verified, lowercased email for email/OAuth accounts. It is `null` for wallet and phone-only text users. Use it only when email-gating is genuinely intended. |
| `user.isAnonymous` | `boolean` | `true` for a zero-friction **guest** (`signInAnonymously()`); `false` for any real (email/social/text/wallet) login. Drives the "create a real account" prompt. Mirrored in policy as `@user.isAnonymous` (offchain; write `== false` to gate guests out). |

- **Bounded Auth** supports email OTP, optional text OTP (when enabled), and
  OAuth/social login (Google, Apple, GitHub today) — through **either** the hosted
  redirect flow (`loginWithRedirect` / `loginWithPopup`) **or** inline OTP from your
  own UI (`sendEmailOtp` / `verifyEmailOtp`), whichever UX you choose.
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
  if (loading) return <Spinner />;                 // see "loading" below — drive your busy UI off this
  return user
    ? <button onClick={logout}>{user.id.slice(0, 6)}… ↩</button>   // user.id always present; user.address may be null
    : <button onClick={login}>Sign in</button>;
}
```

**`loading` reflects ANY auth in progress** — session restore on load AND every login method
(`loginWithRedirect`, `loginWithPopup`, `signInAnonymously`, inline `verifyEmailOtp`/
`verifyTextOtp`, `linkEmail`). Render your "signing in…" state off it (e.g. a spinner/overlay
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
- [access-control.md](access-control.md) — control roles, sharing by email (registered or brand-new), external contributors & platform super-admins
- [cli-reference.md](cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](policy-reference.md) — `@user.id` / `@user.address` / `@user.email` in the rule language
