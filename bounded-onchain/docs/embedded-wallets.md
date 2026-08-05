# Embedded wallets - Turnkey by default

Bounded gives supported email/social users a non-custodial Solana wallet by
default. The normal behavior is:

- `authMode` defaults to **Turnkey**.
- Wallet provisioning defaults to **enabled** and **eager**.
- Turnkey is the sole embedded-wallet implementation. There is no provider
  selector.
- A completed email/social login returns a user with a real `address`, exposed
  to policy as `@user.address`.
- The stable account identity remains `@user.id`. Use it for ownership,
  membership, and ordinary auth rules.

For the majority of apps, **keep those defaults**. Do not add `authMode:
'turnkey'` to client code and do not add `auth.wallets` to policy merely to get
a wallet. Explicit configuration is for exceptions.

Browser guests and phone-only sessions are exceptions. A bring-your-own wallet
login also behaves differently: its `@user.address` is the wallet the user
connected.

## The recommended login for an onchain app

Use the shared widget with no auth-mode override:

```ts
import { init, openBoundedWidget } from "@bounded-sh/client";

await init({ appId: "<APP_ID>" });

const user = await openBoundedWidget({
  methods: ["email", "google"],
  wallet: true,
});

console.log(user.id);      // stable account identity
console.log(user.address); // Turnkey address for email/social,
                           // connected address for the wallet lane
```

`wallet: true` adds the optional bring-your-own wallet button. It is not needed
for Turnkey wallet provisioning. Use it when users who already hold a Solana
wallet should be able to sign in with that wallet.

No auth block is required in `policy.json`:

```json
{
  "notes/$id": {
    "rules": {
      "read": "true",
      "create": "@user.id != null && @newData.owner == @user.id"
    },
    "fields": {
      "owner": "String",
      "text": "String"
    }
  }
}
```

This omission is intentional. The platform fills in the Turnkey, eager-wallet
defaults. Do not generate a redundant `auth.wallets: true` block for a normal
app.

## What the user gets

After a supported email OTP or email-carrying social login completes:

```ts
const user = await openBoundedWidget({ methods: ["email", "google"] });

user.id;      // account identity, mirrored as @user.id
user.email;   // verified email, mirrored as @user.email
user.address; // eagerly provisioned Turnkey wallet, mirrored as @user.address
```

Keep the two identifiers separate:

- Use `@user.id` for offchain ownership, membership, allowlists, and auth gates.
- Use `@user.address` for wallet and onchain semantics.
- Guard onchain actions with `@user.address != null` because guest, phone-only,
  explicitly wallet-disabled, or otherwise unsupported sessions may not have an
  embedded address.

For example:

```json
{
  "profiles/$id": {
    "rules": {
      "create": "@user.id != null && @newData.ownerId == @user.id"
    },
    "fields": {
      "ownerId": "String"
    }
  },
  "orders/$id": {
    "onchain": true,
    "rules": {
      "create": "@user.address != null && @newData.owner == @user.address"
    },
    "fields": {
      "owner": "String"
    }
  }
}
```

Onchain collections require wallet identity. Offchain collections should keep
using the stable account identity unless the data itself is wallet-addressed.

## When to configure auth explicitly

Only leave the default path when the product intentionally requires it.

### Disable embedded wallets

For an app that explicitly must not provision wallets:

```json
{
  "auth": {
    "wallets": false
  }
}
```

Email/social users in that app should be treated as having
`@user.address == null` unless they connect their own wallet.

### Legacy hosted Bounded auth

`authMode: 'bounded'` selects the legacy hosted BetterAuth email path while
keeping Turnkey as the wallet implementation. Do not use it in new apps just
because older examples contain it. If an existing app depends on this mode,
configure only its login and provisioning behavior:

```json
{
  "auth": {
    "wallets": {
      "authMode": "bounded",
      "provisioning": "eager"
    }
  }
}
```

`provider` and `environment` are not valid `auth.wallets` settings. Do not emit
them in new or migrated policy.

## Turnkey login and signing

The unified widget's email lane runs Turnkey-native OTP by default. The app's
Turnkey organization must have its application brand and email OTP activity
configured by the platform. That is an issuer prerequisite, not a client-side
setting.

For a headless email flow, the client also exposes the Turnkey bridge:

```ts
const attempt = await startTurnkeyEmailLogin(email);
const user = await attempt.verify(code);
```

Turnkey provisioning and signing helpers include `getOrCreateTurnkeyWallet`,
`signSolanaMessageViaTurnkey`, and the normal auth-provider methods
`signMessage`, `signTransaction`, and `signAndSubmitTransaction`. Signing
requires user approval. Never place a server-side credential or signer secret
in frontend code.

## Bring-your-own wallet is a companion path

Users who already have a Solana wallet can connect it through wallet login:

```ts
import { init, login } from "@bounded-sh/client";

await init({
  appId: "<APP_ID>",
  authMethod: "phantom",
  walletLogin: true,
});

const user = await login();
console.log(user.address); // the connected wallet
```

This gives the user the local wallet's signing surface. It can coexist with the
default Turnkey email/social path. The embedded provisioner does not overwrite a
connected wallet address.

## Origins and custom domains

Hosted auth binds sessions to the app and its registered origins. Claiming a
Bounded slug or adding a custom domain registers that origin for the app. If the
frontend moves to another domain, add that domain before testing login. Do not
work around `origin is not registered for this appId` or `relying party not
allowed for app` by hardcoding a different app ID into the bundle.

Build each environment with its own app ID and service URLs. The auth defaults
stay the same across staging and production; only environment-specific values
change.

## Checklist

- Keep default Turnkey auth for most apps.
- Omit redundant `authMode: 'turnkey'` and `auth.wallets: true` configuration.
- Expect an address after supported email/social login completes.
- Use `@user.id` for identity and `@user.address` for wallet semantics.
- Add `walletLogin` only when users should connect an existing wallet.
- Use explicit policy only to disable wallets or retain the legacy hosted login
  mode.
- Register every deployed or custom frontend origin against the correct app ID.
