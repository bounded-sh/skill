# Auth — dev identity vs end-user auth

Bounded has **two distinct identity systems**. Don't conflate them:

| | Who | What it is | Where it shows up |
|---|---|---|---|
| **Dev identity** | you / your agent | an ed25519 keypair the CLI and `@bounded/server` sign with | owns apps; the actor `bounded deploy` / `data` run as |
| **End-user auth** | your app's users | Privy (email / social / wallet) or a connected wallet | `@user.address` in policy rules |

## Dev identity — the keypair IS your account

There is **no login step** for building. The first `bounded` command generates
an ed25519 keypair at `~/.bounded/key` (mode `0600`) and that keypair is the
identity — it owns every app you create and signs every write.

```bash
bounded whoami        # prints address, environment, key source (creates the key if absent)
```

- Override the key location with `BOUNDED_PRIVATE_KEY` (a base58 or JSON-array
  secret) or by pointing `HOME` elsewhere — this is how you run a **distinct
  identity per agent**. Never reuse a human's keypair for an autonomous agent.
- `bounded link` later binds the keypair to a human account (magic email or
  passkey) for billing, the dashboard, or teams — never needed to build, verify,
  deploy, or read/write.
- Teams: the owner grants policy-update rights with
  `bounded share <wallet> --app-id <id>` (see [cli-reference.md](cli-reference.md)).

On the server, the same kind of keypair drives `@bounded/server`:

```ts
import { createWalletClient } from "@bounded/server";
const vault = await createWalletClient({ keypair: process.env.VAULT_KEY! });  // base58 or JSON array
vault.address;   // the signer this app acts as
```

## End-user auth — Privy & wallets → `@user.address`

Your app's users authenticate through `@bounded/client`. The auth method is set
once in `init`:

```ts
import { init, login, getCurrentUser } from "@bounded/client";

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
import { useAuth } from "@bounded/client";

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

Server-signed writes from `@bounded/server` arrive with the **keypair's**
address as `@user.address`, so server logic is just another authenticated actor
the rules judge — give the vault key the access its rules require, no more.

## Related

- [../guides/building-a-webapp.md](../guides/building-a-webapp.md) — wiring Privy auth into a web app
- [../guides/building-for-agents.md](../guides/building-for-agents.md) — the zero-ceremony keypair flow
- [sdk-reference.md](sdk-reference.md) — `login` / `useAuth` / `createWalletClient`
- [policy-reference.md](policy-reference.md) — `@user.address` in the rule language
