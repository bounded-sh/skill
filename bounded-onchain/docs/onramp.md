# Onramp - fund a user's wallet with Coinbase (fiat to SOL/USDC)

`onramp()` opens Coinbase Onramp (`pay.coinbase.com`) so the signed-in user can buy SOL or USDC straight into their wallet by card, bank, or Coinbase balance, subject to Coinbase's own KYC.
Bounded holds the Coinbase credential and mints a single-use session server-side.
Your app never receives a provider key and has nothing provider-specific to configure.

```ts
import { onramp } from '@bounded-sh/client';

// In a click handler (popup blockers require user activation):
const result = await onramp({ asset: 'USDC', amountUsd: 20 });
// result: { status: 'completed' | 'closed' | 'opened', address, asset, ... }
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `asset` | `'USDC'` | `'SOL'` or `'USDC'` - preselected in the widget; the user can change it |
| `amountUsd` | none | exact fiat in (USD, $2-$25,000); the fee/output breakdown returns as `result.quote` |
| `minAmountOut` | none | a **floor** on crypto received (mutually exclusive with `amountUsd`) - see below |
| `slippagePad` | `0.01` | upward fiat padding for `minAmountOut` (0-0.1) |
| `newTab` | `false` | open a tab instead of a popup window |

The `amountUsd` range is Bounded's request-validation range, not a promise that every Coinbase user or payment method is eligible for that amount.
Coinbase applies its current regional, account, payment-method, and transaction limits inside checkout.

`address` remains in the TypeScript options only as a deprecated compatibility field and is ignored.
The server always binds the destination to the authenticated identity's `@user.address`.
Never build UI that asks the buyer to enter or override the destination address.

## Exact amounts: `minAmountOut` is a floor

Coinbase's API only takes fiat-in, and fees differ by payment method (card approximately 2.4%, bank approximately 0.5%, Coinbase balance 0%).
"Exact out" is therefore implemented as a **guaranteed floor**: Bounded quotes the worst-fee method (card), pads the fiat up by `slippagePad`, and re-quotes until the pinned quote delivers at least your floor.
A user paying by a cheaper method receives more than the floor, not less.
The residual risk is a price move larger than the pad while the user sits on checkout, which is moot for USDC at 1:1 and is why completion is verified rather than assumed.

```ts
const result = await onramp({ asset: 'USDC', minAmountOut: 10 });
// result.quote  - the pinned worst-case quote shown before purchase
// result.status - 'completed' (Coinbase confirmed; actualOut + txHash set) | 'closed' | 'opened'
if (result.status === 'completed' && result.actualOut! < 10) {
  // rare short fill (price moved past the pad mid-checkout): offer a top-up
}
```

Preview costs without opening anything: `await onrampQuote({ asset: 'SOL', minAmountOut: 0.05 })` returns `{ quote }`.
Re-check fills later: `await onrampStatus(sinceMs?)` returns the signed-in user's recent transactions.

## Semantics and requirements

- **Requires a signed-in wallet-backed user** (`login()` first).
  The destination is the identity's eagerly provisioned Turnkey wallet for email/social login, or the verified external wallet for wallet login.
  An anonymous guest without `@user.address` cannot start onramp and must upgrade the account first.
- **Works on your deployed app origin** (`<app>.bounded.page` or a custom domain).
  On a local dev server the session endpoint does not exist and the call fails with a clear error, so test funding flows on the deployed app.
- After the window closes, the SDK polls Coinbase for the actual fill and resolves `{ status: 'completed', actualOut, txHash }` when the purchase is confirmed.
  `{ status: 'closed' }` means no completed purchase was observed in the verification window, either because it was abandoned or is still settling; call `onrampStatus()` later.
  `{ status: 'opened' }` means a new tab was opened; tab close is not observable, so verify later with `onrampStatus()`.
- The Coinbase session is single-use and short-lived, minted for the requested asset and the verified identity's wallet.
- Purchases run entirely inside Coinbase's checkout: Bounded never sees card details, and the crypto lands directly at the destination address (non-custodial).
- **Give users a wallet-management path wherever you offer onramp.** Users who fund a wallet need a place to manage it. `https://auth.bounded.sh/wallet` is the hosted, Bounded-secured page for the Turnkey wallet, including its address and email-code-gated export; a simple `<a href="https://auth.bounded.sh/wallet" target="_blank">Manage wallet</a>` works for hosted (OIDC) logins, which carry an issuer session. For the DEFAULT inline email login (which deliberately keeps no issuer cookie), open key export through the SDK instead: `openTurnkeyKeyExport()` from `@bounded-sh/client` opens the same export page carrying its own authorization.

## Fiat-funded crypto purchases

Bounded does not provide a shared card-to-USDC merchant checkout.
If an app wants a buyer to start with fiat and pay a `payments.acceptCrypto` intent, call `onramp({ asset: 'USDC' })` to fund the buyer's Turnkey wallet, wait for a completed fill, then construct and sign the normal direct USDC transfer.
The app owns that multi-step checkout UX, while Coinbase owns the fiat purchase and Bounded verifies only the final on-chain payment.

## Provider scope

The public API is intentionally named `onramp()` and the browser route is provider-neutral, but Coinbase is the only implemented provider today.
Do not pass a provider option or claim MoonPay support until Bounded ships a MoonPay backend adapter, normalized quote and transaction mapping, provider-specific credentials and limits, and updated legal disclosure.
