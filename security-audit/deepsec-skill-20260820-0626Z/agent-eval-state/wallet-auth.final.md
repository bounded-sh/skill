## `policy.json`

```json
{
  "auth": {
    "wallets": true
  },

  "records/$recordId": {
    "description": "Ordinary user-owned application data",
    "tier": "durable",
    "fields": {
      "ownerId": "String!",
      "body": "String"
    },
    "rules": {
      "read": "@user.id != null && @data.ownerId == @user.id",
      "create": "@user.id != null && @newData.ownerId == @user.id",
      "update": "@user.id != null && @data.ownerId == @user.id && @newData.ownerId == @data.ownerId",
      "delete": "@user.id != null && @data.ownerId == @user.id"
    }
  },

  "walletActions/$actionId": {
    "description": "Append-only wallet-addressed onchain actions",
    "tier": "durable",
    "onchain": true,
    "fields": {
      "signer": "Address!",
      "payloadHash": "String!"
    },
    "rules": {
      "read": "true",
      "create": "@user.address != null && @newData.signer == @user.address",
      "update": "false",
      "delete": "false"
    }
  }
}
```

`auth.wallets: true` is required specifically because the app accepts external Solana-wallet sessions. It does not disable or replace the default eager Turnkey wallet supplied to supported email/social users.

## Frontend auth and signing

```ts
import {
  getCurrentUser,
  init,
  openBoundedWidget,
  set,
  signAndSubmitTransaction,
} from "@bounded-sh/client";

const appId = import.meta.env.VITE_BOUNDED_APP_ID;
const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;

if (!appId) throw new Error("VITE_BOUNDED_APP_ID is missing");
if (!rpcUrl) throw new Error("VITE_SOLANA_RPC_URL is missing");

await init({
  appId,
  chain: "solana_devnet",
  rpcUrl,            // Must be top-level for transaction submission.
  walletLogin: true, // Enables and restores bring-your-own-wallet sessions.
});

// Email/social users receive an embedded Turnkey wallet.
// The wallet lane signs in with an existing Solana wallet.
export async function signIn() {
  return openBoundedWidget({
    methods: ["email", "google"],
    wallet: true,
  });
}

export async function saveRecord(recordId: string, body: string) {
  const user = getCurrentUser();
  if (!user) throw new Error("Authentication required");

  await set(`records/${recordId}`, {
    ownerId: user.id, // Stable identity-not the wallet address.
    body,
  });
}

export async function createWalletAction(
  actionId: string,
  payloadHash: string,
) {
  const user = getCurrentUser();
  if (!user?.address) throw new Error("A wallet-enabled session is required");

  // Because walletActions is onchain, Bounded builds the transaction and the
  // active embedded or bring-your-own wallet approves and signs it.
  await set(`walletActions/${actionId}`, {
    signer: user.address,
    payloadHash,
  });
}

type SignableTransaction =
  Parameters<typeof signAndSubmitTransaction>[0];

export async function submitCustomTransaction(tx: SignableTransaction) {
  const user = getCurrentUser();
  if (!user?.address) throw new Error("A wallet-enabled session is required");

  // The SDK checks that this exact transaction was returned and that the
  // address authenticated in the session actually signed it before broadcast.
  return signAndSubmitTransaction(tx);
}
```

```dotenv
VITE_BOUNDED_APP_ID=<APP_ID>
VITE_SOLANA_RPC_URL=<SOLANA_DEVNET_RPC_URL>
```

Register each exact frontend origin against the same app and environment before authentication is used there:

```sh
bounded domains origins add <FRONTEND_ORIGIN> \
  --app-id <APP_ID> \
  --env <ENVIRONMENT>
```

This command is provided as configuration guidance only; it was not run.

Security rationale: ordinary ownership uses stable `@user.id`, so embedded-wallet rotation does not silently transfer application data. Wallet-specific state uses `@user.address`. Bring-your-own login uses an origin-bound SIWS challenge, and the verified signing helpers ensure the authenticated address actually signed the requested transaction before submission. Do not substitute raw wallet `signAndSendTransaction`, which broadcasts before that verification. Also, policy `@origin` is platform call provenance-not the browser origin-and is forbidden in `onchain: true` rules.