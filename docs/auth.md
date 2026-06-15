# Auth — dev identity vs end-user auth

**What's in here / when to read this:** the two identity systems — your dev
keypair vs your app's end-users — plus account **linking** and **sharing** an app
with teammates by email.

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **Dev identity** | you / your agent | an ed25519 keypair the CLI and `bounded-sh/server` sign with | owns apps; the actor `bounded deploy` / `data` run as |
| **End-user auth** | your app's users | Privy (email / social / wallet) or a connected wallet | `@user.address` in policy rules |

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
  wallet — a **Privy pre-generated embedded wallet**, so the invitee needs no
  wallet of their own — added as an **`admin`** collaborator (may also act/sign on
  the app's data the way the owner can). `--role policy|admin` overrides the
  default. Only the owner can add collaborators; the server enforces it against
  the wallet derived from your keypair. List with `bounded collaborators`.

Collaboration is **control-plane** authority (manage the app). It is **not** a
data-plane bypass — see [admin-and-ownership.md](admin-and-ownership.md). Command
detail: [cli-reference.md](cli-reference.md).

On the server, the same kind of keypair drives `bounded-sh/server`:

```ts
import { createWalletClient } from "bounded-sh/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });  // base58 or JSON array
vault.address;   // the signer this app acts as
```

## End-user auth — Privy & wallets → `@user.address`

Your app's users authenticate through `bounded-sh`. The auth method is set
once in `init`:

```ts
import { init, login, getCurrentUser } from "bounded-sh";

await init({ appId: "<appId>", authMethod: "privy" });
await login();                       // opens the Privy modal (email / Google / Apple / wallet)
const user = getCurrentUser();       // { address, ... } | null
```

`authMethod` options (from the SDK): `'privy'`, `'wallet'`, `'phantom'`,
`'privy-expo'` (React Native), or `'none'`.

- **Privy** supports email, social (Google/Apple), and external wallets, and
  creates an **embedded Solana wallet** for users without one
  (`createOnLogin: "users-without-wallets"`). Email/social users still get an
  address — so they always have a stable `@user.address`.
- **Wallet / Phantom** connects an existing Solana wallet directly.
- Whatever the method, the authenticated user resolves to a Solana **address**,
  and that is the only thing policy rules see.

### React

```tsx
import { useAuth } from "bounded-sh";

function AuthButton() {
  const { user, login, logout, loading } = useAuth();
  if (loading) return null;
  return user
    ? <button onClick={logout}>{user.address.slice(0, 6)}… ↩</button>
    : <button onClick={login}>Sign in</button>;
}
```

Imperative equivalents: `onAuthStateChanged(cb)`, `onAuthLoadingChanged(cb)`,
`logout()`.

## How `@user.address` reaches your rules

Every authenticated request carries a session token derived from the user's
address. The realtime worker resolves it and exposes it to the policy as
`@user.address` (or `null` when unauthenticated). That is the hinge of every
auth rule:

```json
"create": "@user.address != null && @newData.owner == @user.address"
```

The leading `@user.address != null` is mandatory — without it an unauthenticated
caller writing `owner: null` satisfies `null == null`. The proof engine hands
you that exact counterexample if you forget it
([verify-and-counterexamples.md](verify-and-counterexamples.md)).

Server-signed writes from `bounded-sh/server` arrive with the **keypair's**
address as `@user.address`, so server logic is just another authenticated actor
the rules judge — give the vault key the access its rules require, no more.

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — wiring Privy auth into a web app
- [../guides/building-for-agents.md](../guides/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [admin-and-ownership.md](admin-and-ownership.md) — control-plane collaborators vs data-plane rules (no god-mode)
- [cli-reference.md](cli-reference.md) — `link`, `share`/`unshare`/`collaborators` flags
- [policy-reference.md](policy-reference.md) — `@user.address` in the rule language
