# Onramp — fund a user's wallet with Coinbase (fiat → SOL/USDC)

`bounded.onramp()` opens Coinbase Onramp (pay.coinbase.com) so the signed-in user can buy SOL or USDC straight into their wallet — card, bank, or Coinbase balance, subject to Coinbase's own KYC. The platform holds the Coinbase credential and mints a single-use session server-side; your app never touches a key and there is nothing to configure.

```ts
import { onramp } from '@bounded-sh/client';

// In a click handler (popup blockers require user activation):
const result = await onramp({ asset: 'USDC', amountUsd: 20 });
// result: { status: 'closed' | 'opened', address, asset }
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `asset` | `'USDC'` | `'SOL'` or `'USDC'` — preselected in the widget; the user can change it |
| `address` | signed-in user's `@user.address` | destination Solana address |
| `amountUsd` | none | preset fiat amount (USD, $2–$25,000); user-editable |
| `newTab` | `false` | open a tab instead of a popup window |

## Semantics and requirements

- **Requires a signed-in user** (`login()` first). The destination defaults to the user's embedded wallet, so turn on `auth.wallets` ([embedded-wallets.md](embedded-wallets.md)) — or pass `address` explicitly (e.g. a bring-your-own wallet login's address).
- **Works on your deployed app origin** (`<app>.bounded.page` or a custom domain). On a local dev server the session endpoint does not exist and the call fails with a clear error — test funding flows on the deployed app.
- The promise resolves `{ status: 'closed' }` when the user closes the Coinbase window. Closing does not tell you whether they completed the purchase — observe arrival of funds via your app's own data or a balance read. `{ status: 'opened' }` means a new tab was opened (tab close is not observable).
- The Coinbase session is single-use and short-lived, minted for exactly the address/asset requested and bound to the caller's verified login. Anonymous/guest sessions can mint too, but guests have no embedded wallet — pass `address` or upgrade the account first.
- Purchases run entirely inside Coinbase's checkout: Bounded never sees card details, and the crypto lands directly at the destination address (non-custodial).
