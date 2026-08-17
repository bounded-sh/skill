# App-user authentication

This page is about people signing in to a deployed app. The developer account
used by `bounded init` and the CLI is separate; see
[developer accounts](../../bounded-deploy/docs/accounts.md). Do not expose CLI
sessions or developer credentials to app users.

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **CLI/admin auth** | you / your agent | normally a Bounded web account session selected by `bounded init`; local signing is an advanced alternative | owns/administers apps and is documented in the deploy skill |
| **End-user auth** | your app's users | Bounded Auth (email OTP + OAuth/social + optional text OTP). **Turnkey-native auth with eager embedded-wallet provisioning is the default**, so supported email/social users carry both `@user.id` and `@user.address` without an `authMode` or `auth.wallets` override. Browser guests use a device keypair; a connected Solana wallet (`walletLogin`) is the bring-your-own companion. | `@user.id` / `@user.address` / `@user.email` / `@user.isAnonymous` in policy rules |

## CLI auth boundary

`bounded init` writes public `bounded.json`, reuses a web session, and opens
hosted browser login when needed. That is the normal onboarding flow. Full
developer-account guidance lives in
[accounts.md](../../bounded-deploy/docs/accounts.md).

The CLI also has advanced local signing sources:

- **Wallet/keypair mode** (advanced): `global` (`~/.bounded/credentials`),
  `project` (`<project>/.bounded/credentials`), `profile`
  (`~/.bounded/accounts/<profile>/credentials`), or `env`
  (`BOUNDED_PRIVATE_KEY`). The keypair is the signing identity; it owns apps
  created with it and signs data-plane writes. It needs no other credential:
  a key that signs in from a CLI or server, and never from a browser wallet,
  is cleared for server-side sessions automatically. Use a dedicated key for
  automation - if the same key also signs in to the app through a browser
  wallet, its server-side sessions stop working and every server call fails
  with `relying party not allowed for app`.
- **Web account mode** (default): `bounded init` opens the hosted email/social
  sign-in page and completes Authorization Code + PKCE through a temporary
  loopback callback. It stores refreshable Bounded Auth credentials in
  `~/.bounded/web-session.json`, uses the web account directly, and selects
  `account.keySource:"web"` for an existing current project. It does **not**
  create, link, or reuse a local wallet key. Use `bounded login --email
  you@example.com` for terminal OTP when a browser is unavailable.

```bash
bounded whoami                    # shows wallet address or web identity, environment, and source
bounded login                     # hosted email/social sign-in
# bounded login --email you@example.com  # headless terminal OTP fallback
```

> **Advanced wallet-mode warning.** A wallet credentials file is auto-generated, never
> shown, and never backed up. Lose it without having linked, shared, or backed it
> up first and its apps are unrecoverable (there is no key-recovery command;
> `bounded account transfer-to-web` requires the key to still exist). Treat it
> like an SSH private key and
> set up a recovery path if you deliberately choose wallet/keypair mode. Full
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

- **`bounded login`** is a plain **web login** — it opens the hosted sign-in page
  and signs you in to your web account (the same account you'd use at
  bounded.sh). No key is involved, and a `bounded login` web session does
  **not** link any local key. Headless agents can use `--email` for terminal OTP.
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
  role - so default to `--role developer` unless the owner is Team+. Pass a **wallet** to add it directly. Pass an **email** and
  Bounded stores the verified email as the canonical collaborator subject; it
  does not resolve the email through an embedded-wallet provider. When that
  person signs in, the account's default Turnkey flow separately provisions the
  wallet exposed as `@user.address`. Bounded sends an invite email when outbound
  email is configured. `policy` may update the
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
**Turnkey-native Bounded Auth**: email OTP and OAuth/social login with eager,
non-custodial wallet provisioning. Keep the defaults in the majority of apps:
omit both `authMode` in client initialization and `auth.wallets` in policy.
After a supported email/social login completes, the user has a stable account
identity (`@user.id`) and a real wallet (`@user.address`). Add explicit auth
configuration only to opt out (`auth.wallets: false`) or retain the legacy
hosted login mode. Browser guests and phone-only sessions are separate cases.
See [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md).

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
   - **In-app unified widget** - `openBoundedWidget({ methods })`. A Shadow-DOM
     login card rendered inside your app: email + social lanes, plus an optional
     "Continue with wallet" lane (`wallet: true`). The default email lane runs
     Turnkey-native OTP inline - no second Bounded OTP and no OIDC redirect for
     email. Do not pass `authMode: 'turnkey'` in normal app code because it is
     already the default. An explicit `authMode: 'bounded'` is the legacy hosted
     BetterAuth path. The app's Turnkey organization must have email OTP configured
     (application brand + email OTP enabled); that is an issuer-side prerequisite,
     not a client parameter. `requireEmail: true` in init config makes
     email mandatory and suppresses the wallet lane. The call resolves with the
     signed-in `User` and rejects with `Error("cancelled")` when dismissed.

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
| **email OTP** | `openBoundedWidget({methods:["email"]})` | account id | **Turnkey wallet by default** | canonical inline Turnkey OTP; address is available when login completes |
| **social** (Google/Apple/GitHub) | `openBoundedWidget({methods:["google"]})` or hosted redirect/popup | account id | **Turnkey wallet by default** for email-carrying accounts | canonical social login |
| **text OTP** | `loginWithRedirect({provider:"text"})` or hosted popup | account id | `null` for a phone-only session | opt-in, off by default |
| **unified widget** (email + social + optional wallet) | `openBoundedWidget({methods:["email","google"], wallet:true})` | account id (the wallet lane yields the user's real wallet) | Turnkey for email/social; connected wallet for wallet lane | in-app Shadow-DOM card; Turnkey email OTP is the default |
| **guest (browser)** | `signInAnonymously()` | durable device id | device keypair address (guest auth remains offchain-only) | zero-friction; `isAnonymous: true`; policy opt-in `auth.anonymous`; requires WebCrypto Ed25519 + IndexedDB |
| **WALLET (Solana), bring-your-own** | `init({authMethod:"phantom", walletLogin:true})` → `login()` | **real wallet** | **the wallet** | the companion login for users who already have a wallet — see below |
| **CLI/admin** | `bounded login` / keypair | web account or keypair | keypair addr | builder identity, not end-user |

### Solana wallet login (bring your own)

> **The companion to the canonical login.** The canonical email/social login
> gives those users a Turnkey wallet by default; wallet login is for
> users who **already have** a Solana wallet and want to sign in *with it*. Add it
> alongside the canonical login by turning it on at `init()` with
> **`walletLogin: true`** (it's off until you pass the knob — an app that doesn't
> pass it sees no wallet-login button, and calling wallet login without the knob
> throws a clear error naming `walletLogin`). The two coexist: a bring-your-own
> user keeps their real wallet as `@user.address`, and embedded provisioning never
> overwrites it.

When enabled, wallet login lets a user **connect their own Solana browser wallet**
(Phantom, or any Wallet-Standard `window.solana`) and sign in with it. Their **real
wallet address becomes `@user.address`** (and `@user.id`) everywhere — SIWS: the SDK
fetches a nonce, the wallet signs the canonical challenge locally, and the session is
minted by `wallet-auth.bounded.sh`. It rides the injected wallet provider — **no heavy
wallet SDK, no React dependency, no popup**.

**Two knobs, not one.** `walletLogin` is the CLIENT opt-in; the issuer additionally refuses to mint an external-wallet session unless the app's policy allows it, so a deployed `"auth": { "wallets": true }` is a prerequisite (without it login fails with "wallet login is not enabled for this app").
The browser origin matters too: SIWS binds to it, so a non-first-party host (a tunnel, a preview domain) must be registered with `bounded domains origins add https://<host> --app-id <id> --env <env>`.

```jsonc
// policy.json
{ "auth": { "wallets": true } }
```

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
await signAndSubmitTransaction(tx);               // wallet signs, SDK verifies + submits, returns the tx hash
```

Both transaction calls verify, before handing the transaction back or putting it on the network, that the message is the one you passed and that **the account your session was authenticated with actually signed it**.
That check exists because a wallet can move accounts inside the signing call - Solana Mobile re-authorizes there, and ignores the account the request names - so a transaction can come back signed by an identity your session never proved.
One consequence: a wallet that can ONLY sign-and-send cannot be used through `signAndSubmitTransaction`, because it broadcasts before anything can be checked; it refuses and tells you so.
If you want that wallet's own broadcast anyway, drive it yourself - outside the guarantee, knowingly.
Doing that means doing by hand everything the SDK was doing for you, in this order; skip a step and it fails on a phone rather than on your desk:

```ts
import { getAuthProvider } from "@bounded-sh/client";
const wallet = await (await getAuthProvider()).getNativeMethods();   // the signed-in provider

// 1. CONNECT. A restored session has an address but no live wallet connection,
//    so a signing call on a cold page fails with "Wallet not connected".
if (!wallet.isConnected) await wallet.connect();
// 2. PREPARE, before you enable the button. The adapter's transaction codec is
//    code-split; loading it inside the call spends the activation the wallet's
//    intent navigation needs.
await wallet.prepare?.("signAndSubmitTransaction");
// 3. Collect a FRESH tap, and do nothing else on it.
await tapToContinue();
// 4. Re-read the account: the wallet can move accounts during that tap, and
//    nothing after this point can refuse.
if (wallet.publicKey?.toString() !== user.address) throw new Error("wallet switched account");
// 5. Send. Nobody can check what it signed - that is the trade you are making.
const { signature } = await wallet.signAndSendTransaction(tx);
```

Advanced: pass an object instead of `true` to point at a specific wallet or bridge a
custom provider — `walletLogin: { getProvider: () => myWalletStandardProvider, network: "solana_mainnet" }`.
`authMethod: "wallet"` is an alias for `"phantom"`, and so is `"mobile-wallet-adapter"`.

### Solana Mobile (Seeker / Saga)

On a capable Android browser (https required) the wallet lane also registers Solana Mobile's Mobile Wallet Adapter as a Wallet-Standard wallet, so the phone's own wallet appears in the connect-wallet list alongside Phantom, with the same SIWS login and the same signing surface.
It stays inside the opt-in lane: an app that never passes `walletLogin` (or a per-call `openBoundedWidget({ wallet: true })`) shows no wallet button, on a phone or anywhere else.

**Building your own wallet button?** Await `ensureWalletLoginReady()` before you enable it (after `init()`).
It resolves config, loads the wallet-login chunk and registers the mobile wallet; doing that work after the tap puts a network fetch between the gesture and the wallet handoff, which is exactly what costs the activation.
The built-in widget does this for you.

It REJECTS only when there is no wallet login at all (config or the provider chunk failed) - leave your control disabled in that case.
A phone wallet that could not be prepared instead resolves as `{ mobileWallet: "failed" }`, because every injected wallet still works; `"not-applicable"` simply means this device has no mobile wallet to offer.
A failure there stays retryable, so calling again later can succeed.

Mind WHICH control you enable on `"failed"`.
A control that calls `loginWithWallet()` without pinning a wallet can still resolve to the phone wallet, so preparing it after the tap is exactly the failure to avoid: leave that one disabled and retry readiness.
A control that passes a specific injected wallet's `getProvider` is unaffected and may be enabled.

```ts
const { mobileWallet } = await ensureWalletLoginReady();
// Pinned to an injected wallet: safe either way.
phantomButton.disabled = false;
// Unpinned - its resolution can fall through to the phone wallet.
connectAnyWalletButton.disabled = mobileWallet === "failed";
```

**One thing you must wire yourself: a fresh tap per wallet action.**
The mobile wallet lives in a separate app, so every operation leaves the page through an Android intent, and Chrome only allows that navigation while the page holds a transient user activation.
The tap that started an action is already spent by the time the SDK has fetched a nonce or a blockhash, so the SDK awaits `confirmWalletAction` immediately before each wallet call and lets you collect a new one; reject it to abort with nothing signed.
The login widget supplies this for the login signature itself, so `openBoundedWidget` needs nothing extra - but anything your own UI drives (`signMessage`, `signTransaction`, `signAndSubmitTransaction`, and the `set()` writes that sign onchain) needs the hook.
It is called with the action it is about to take, and `"connect"` is one of them: a restored session holds the user's address but no live wallet authorization, so signing reconnects first - silently while the wallet still trusts the page.
When that cached authorization is gone (it expired, or the user cleared it) reconnecting means re-opening the wallet app, which is its own round trip and needs its own tap.
Your hook is then called twice for one signature, `"connect"` first; in the ordinary case it is called once.

```ts
await init({
  appId: "<appId>",
  authMethod: "phantom",
  chain: "solana_devnet",
  walletLogin: {
    // Only where the mobile wallet can be active; injected wallets sign
    // in-page and need no extra tap.
    confirmWalletAction: /android/i.test(navigator.userAgent) && window.isSecureContext
      ? (action) => showTapToContinue(action)   // resolve from a real click
      : undefined,
  },
});
```

Optional tuning goes through `init({ mobileWalletConfig })`: `appIdentity` (name/uri plus an `icon` path resolved relative to `uri`) is what the wallet app displays in its approval sheet, `remoteHostAuthority` (a reflector authority) additionally enables the desktop QR-code "connect your phone" lane, and `cluster` (`"mainnet-beta"` / `"devnet"`) lets a chainless, login-only app say which cluster to authorize on.
The mobile wallet authorizes per cluster and signs on the app's network, so a `cluster` - or a `walletLogin.network` - that contradicts `chain` throws at init rather than failing later as a wallet rejection.

Two limits worth knowing.
The wallet is reached over loopback (`http://localhost` and a `ws://localhost:<port>` socket to the wallet app), so an app that declares a `boundaries.browser` block cannot use it: that grammar compiles to https hosts only and has no loopback token.
And a page can register the mobile wallet for one cluster only - switching the app's Solana network afterwards throws and asks for a reload, because the registration cannot be withdrawn.

> **Wallet login vs the default embedded wallet - don't confuse them.**
>
> | | **Wallet login** (`walletLogin: true`) | **Default email/social login** (embedded) |
> |---|---|---|
> | Who has the key | the **user** (their Phantom/Wallet-Standard wallet) | the user through a non-custodial **Turnkey wallet** |
> | How they log in | connect wallet + SIWS | email/social OTP; the wallet is attached to the login |
> | `@user.address` | their **real** wallet | the embedded smart-wallet address |
> | Signing surface | full **local** `signMessage` / `signTransaction` / `signAndSubmitTransaction` (no popup) | Turnkey signing with user approval |
> | Use it when | your users already have wallets / want wallet-native UX | you want email users to get a wallet without ever leaving email login |
>
> The two are independent and can coexist. A wallet-login user's `@user.address` is
> their real wallet and embedded provisioning will **not** overwrite it (the embedded-wallet
> provisioner only runs for email/social logins that don't already carry a wallet).
> Turnkey is the sole embedded-wallet implementation and is eagerly provisioned
> by default.
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

A **social `provider` jump always forces a fresh hosted sign-in** (0.0.69+): it
defaults the standard OIDC `prompt` to `select_account`, so the jump never
silently reuses a live Bounded hosted session - after signing out, signing back
in really does start a new sign-in rather than dropping the user straight back
into the previous account.
With **Google** that also reaches Google's own account picker every time, because
Bounded asks Google for `select_account` too; other providers re-run their own
sign-in, which may still auto-approve if the user has a live session there.
The identifier-first flows (`email` / `text` / `phone`) and plain `methods`
lists keep deliberate silent SSO.
Pass an explicit `prompt` to override, or `prompt: ""` to opt a social jump
back into silent SSO.

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

Keep the default Turnkey auth and wallet behavior for normal apps. Do not add
`authMode` or `auth.wallets` merely to get an address: supported email/social
users receive a Turnkey wallet eagerly. Browser wallet login is the
bring-your-own-wallet companion for users who already have a Solana wallet; see
[Solana wallet login (bring your own)](#solana-wallet-login-bring-your-own).

The authenticated `user` object — mirrored into policy as `@user.*` — has **four
fields**:

| Field | Type | Meaning |
|---|---|---|
| `user.id` | `string` | the **universal stable identity**, **always present** for an authenticated user. For wallet logins it equals the wallet address; for Bounded Auth logins (email, text, OAuth/social) it is the account identity. **Use this for ownership / membership / identity / auth guards.** |
| `user.address` | `string \| null` | a **real onchain wallet address**. By default it is the email/social user's eagerly provisioned **Turnkey wallet**; a bring-your-own wallet login sets it to that real wallet. It can be `null` for guest/phone-only sessions or when wallets are explicitly disabled. **Use this for onchain operations / wallet semantics, not as the identity key.** |
| `user.email` | `string \| null` | the verified, lowercased email for email/OAuth accounts. It is `null` for wallet and phone-only text users. Use it only when email-gating is genuinely intended. |
| `user.isAnonymous` | `boolean` | `true` for a zero-friction **guest** (`signInAnonymously()`); `false` for any real (email/social/text/wallet) login. Drives the "create a real account" prompt. Mirrored in policy as `@user.isAnonymous` (offchain; write `== false` to gate guests out). |

- **Bounded Auth** (the canonical login) supports email OTP, optional text OTP (when
  enabled), and OAuth/social login (Google, Apple, GitHub today) through the
  hosted issuer or unified widget.
  Bounded Auth users authenticate as an **account identity** - a stable `@user.id` -
  and by default also carry a non-custodial **Turnkey `@user.address`**. Explicit
  `auth.wallets: false` disables embedded-wallet provisioning. Phone-only text users have
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

Use `@user.id` - **not** `@user.address` - for ownership, membership, allowlist
gates, and bare auth guards. `@user.id` is always present the instant a user is
authenticated. Even though default Turnkey provisioning eagerly makes the wallet
address available when a supported email/social login completes, identity rules
should not depend on wallet-provider behavior. Reach for `@user.id` for identity
and treat `@user.address` as the wallet.

> **`@user.address` for wallet semantics.** With the default Turnkey configuration,
> the issuer eagerly attaches a non-custodial wallet to supported email/social
> logins and populates `@user.address`, so it is
> safe to *use* for onchain operations and wallet lookups for email/social users, not
> just wallet-login users. Keep keying **ownership/identity** on `@user.id`; use
> `@user.address` for the wallet. See
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

## When a session expires

Access tokens are short-lived and the SDK refreshes them for you. What matters is
how a session that **cannot** be refreshed reaches your code, because it is not a
policy failure and must not be handled like one.

**An expired or otherwise rejected credential is a `401`, never a `403`.** The
runtime answers `401 { error: "invalid_or_expired_token", code:
"invalid_or_expired_session" }` before any rule runs, so a dead session can never
be mistaken for "this user is not allowed to do that". Sending no credential at
all is still anonymous, unchanged — public reads keep working for logged-out
visitors.

The SDK refreshes and replays the request for you, so you normally never see this.
When the session genuinely cannot be revived, the call rejects with a typed error
instead of quietly falling back to an anonymous request:

```ts
import { isAuthExpiredError } from "@bounded-sh/client";

try {
  await set(`runs/${runId}`, { owner: me.address });
} catch (e: any) {
  if (isAuthExpiredError(e)) {
    // e.code === 'auth_expired'  -> the session is gone; prompt a fresh login
    // e.code === 'auth_changed'  -> a different account signed in mid-request;
    //                               the request was NOT replayed as them
    return showSignIn();
  }
  throw e;   // a real policy denial (BoundedDeclineError) or anything else
}
```

**Never treat a `403` / `policy_denied` as "log in again".** It means an
authenticated caller was judged and refused. Retrying it with a fresh token
changes nothing.

**Drive connected-state UI from `onAuthStateChanged`, not from a snapshot.** A
wallet extension can stay connected long after the Bounded session behind it has
expired, and it is the Bounded session that authorizes writes. `onAuthStateChanged`
fires when a session dies on its own — not only on an explicit `logout()` — so a
header, a "connected" badge, or anything bound to `user.address` stays truthful:

```ts
onAuthStateChanged((user) => setWallet(user?.address ?? null));
```

Reading `getCurrentUser()` once at mount is the trap: it never updates, so the UI
keeps advertising a wallet the server no longer accepts.

> **`logout()` and `clearSession()` are async — await them.** Session removal is
> serialized across browser tabs, so a call you do not await can return while the
> credential is still readable, and the very next request authenticates as the
> user who just left.

> **Auth guards use `@user.id != null`.** `@user.isAnonymous == false` is *not* an
> authentication check — it distinguishes a guest from a real login, and it is also
> `false` for a caller with no session at all. Always lead with `@user.id != null`
> (or `@user.address != null` inside an `onchain: true` collection).

## Related

- [../guides/building-a-webapp.md](building-a-webapp.md) — wiring end-user auth into a web app
- [../guides/building-for-agents.md](../../bounded-backend/docs/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [embedded-wallets.md](../../bounded-onchain/docs/embedded-wallets.md) - default Turnkey wallet provisioning and `@user.address` for email/social login
- [admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md) — control-plane collaborators vs data-plane rules (no god-mode)
- [access-control.md](../../bounded-backend/docs/access-control.md) — control roles, sharing by email (registered or brand-new), external contributors & platform super-admins
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](../../bounded-backend/docs/policy-reference.md) — `@user.id` / `@user.address` / `@user.email` in the rule language
