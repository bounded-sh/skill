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
| `amountUsd` | none | exact fiat in (USD, $2–$25,000); the fee/output breakdown returns as `result.quote` |
| `minAmountOut` | none | a **floor** on crypto received (mutually exclusive with `amountUsd`) — see below |
| `slippagePad` | `0.01` | upward fiat padding for `minAmountOut` (0–0.1) |
| `newTab` | `false` | open a tab instead of a popup window |

## Exact amounts: `minAmountOut` is a floor

Coinbase's API only takes fiat-in, and fees differ by payment method (card ≈2.4%, bank ≈0.5%, Coinbase balance 0%). So "exact out" is implemented as a **guaranteed floor**: the platform quotes the *worst-fee* method (card), pads the fiat up by `slippagePad`, and re-quotes until the pinned quote delivers ≥ your floor. A user paying by a cheaper method simply receives **more** than the floor — never less. The residual risk is a >pad price move while the user sits on checkout (moot for USDC at 1:1), which is why completion is *verified*, not assumed:

```ts
const result = await onramp({ asset: 'USDC', minAmountOut: 10 });
// result.quote  — the pinned worst-case quote { amountUsd, quotedOut, fees… } shown before purchase
// result.status — 'completed' (Coinbase confirmed; actualOut + txHash set) | 'closed' | 'opened'
if (result.status === 'completed' && result.actualOut! < 10) {
  // rare short fill (price moved past the pad mid-checkout): offer a top-up
}
```

Preview costs without opening anything: `await onrampQuote({ asset: 'SOL', minAmountOut: 0.05 })` → `{ quote }`. Re-check fills later: `await onrampStatus(sinceMs?)` → the signed-in user's recent transactions.

## Semantics and requirements

- **Requires a signed-in user** (`login()` first). The destination defaults to the user's Turnkey wallet, which is eagerly provisioned by default. Set `auth.wallets: false` only when the app intentionally opts out, or pass `address` explicitly for a bring-your-own wallet login.
- **Works on your deployed app origin** (`<app>.bounded.page` or a custom domain). On a local dev server the session endpoint does not exist and the call fails with a clear error — test funding flows on the deployed app.
- After the window closes, the SDK polls Coinbase for the actual fill and resolves `{ status: 'completed', actualOut, txHash }` when the purchase is confirmed. `{ status: 'closed' }` means no completed purchase was observed in the verification window (abandoned, or still settling — call `onrampStatus()` later). `{ status: 'opened' }` means a new tab was opened (tab close is not observable; verify via `onrampStatus()`).
- The Coinbase session is single-use and short-lived, minted for exactly the address/asset requested and bound to the caller's verified login. Anonymous/guest sessions can mint too, but guests have no embedded wallet — pass `address` or upgrade the account first.
- Purchases run entirely inside Coinbase's checkout: Bounded never sees card details, and the crypto lands directly at the destination address (non-custodial).
- **Give users a wallet-management path wherever you offer onramp.** Users who fund a wallet need a place to manage it. `https://auth.bounded.sh/wallet` is the hosted, Bounded-secured page for the Turnkey wallet, including its address and email-code-gated export; a simple `<a href="https://auth.bounded.sh/wallet" target="_blank">Manage wallet</a>` works for hosted (OIDC) logins, which carry an issuer session. For the DEFAULT inline email login (which deliberately keeps no issuer cookie), open key export through the SDK instead: `openTurnkeyKeyExport()` from `@bounded-sh/client` opens the same export page carrying its own authorization.

## Fiat-funded crypto purchases

Bounded does not provide a shared card-to-USDC merchant checkout.
If an app wants a buyer to start with fiat and pay a `payments.acceptCrypto` intent, call `onramp({ asset: 'USDC' })` to fund the buyer's Turnkey wallet, wait for a completed fill, then construct and sign the normal direct USDC transfer.
The app owns that multi-step checkout UX, while Coinbase owns the fiat purchase and Bounded verifies only the final on-chain payment.
