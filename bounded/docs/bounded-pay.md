# Bounded Pay

What's in here: public guidance for apps that want to accept card payments
without putting Stripe keys in app code.

## Public Fee Rule

Bounded Pay keeps a 1% platform fee in addition to Stripe's own processing fees.
Say this plainly whenever describing the feature.

Users can opt out of Bounded-managed payment handling by integrating Stripe or
another provider directly with their own API keys. In that path, they pay that
provider directly and Bounded's managed-payment fee does not apply.

## When To Use It

Use Bounded Pay when:

- the app wants a managed payment flow,
- the app should avoid storing Stripe keys,
- the app still models purchases, balances, credits, or entitlements in a
  policy-protected ledger, and
- idempotent settlement matters.

Use a direct provider integration instead when the user wants full control of the
payment account, custom provider behavior, or to avoid the managed fee.

## App-Side Pattern

For Bounded Pay's managed Connect flow, generate a real app integration, not a
CLI-driven purchase flow. The CLI is for manual smoke tests and operator
debugging.

1. Add policy state for purchases/settlements/entitlements or balances. Use an
   idempotent document keyed by the Stripe Checkout `sessionId`.
2. Seller onboarding UI calls `POST /connect/onboard` with the seller's Bounded
   JWT, redirects them to the returned `onboardingUrl`, then calls
   `GET /connect/status` until `chargesEnabled` is true. This creates/reuses one
   Stripe Standard connected account for that Bounded identity; it is not scoped
   to one app.
3. Buyer checkout UI calls `POST /connect/checkout` with the buyer's Bounded JWT.
   This is the app's user-facing payment entrypoint. Use the returned `url` to
   redirect the buyer to Stripe Checkout, and store the returned `sessionId` as a
   pending purchase before redirecting when you need reconciliation.
4. After payment, the success URL receives `?session_id=cs_...`. Invoke an app
   function such as `claimPurchase({ sessionId })`.
5. The app function calls `GET /connect/session?id=cs_...` server-side, verifies
   `paid`, buyer, merchant, amount, and currency, then writes an idempotent claim
   or settlement through normal Bounded policy rules/invariants.
6. A trusted settlement function grants credits, ownership, entitlements, or
   conserved ledger entries. Use `conserve` for money-like balances and
   `rollingSum` for spend or grant caps.

In split mode, keep the Bounded seller id (`merchant`) separate from Stripe
connected account ids (`userAccount`, `platformAccount`).

For direct provider integrations, use the same claim-and-settle pattern with
provider verification in your own backend/function. Do not grant value from a
client-submitted amount, product id, or payment status without provider
verification.

## Runtime HTTP Flow

Use the public Bounded Pay host:

```text
https://host.bounded.sh
```

Seller setup:

```ts
const r = await fetch(`${HOST}/connect/onboard`, {
  method: "POST",
  headers: { Authorization: `Bearer ${sellerJwt}` },
});
const { onboardingUrl } = await r.json();
location.href = onboardingUrl;
```

Seller status:

```ts
const r = await fetch(`${HOST}/connect/status`, {
  headers: { Authorization: `Bearer ${sellerJwt}` },
});
const status = await r.json(); // { connected, stripeAccountId, chargesEnabled, ... }
```

Buyer checkout:

```ts
const r = await fetch(`${HOST}/connect/checkout`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${buyerJwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    merchant: sellerBoundedUserId,
    amount: 1000, // minor units, e.g. cents
    currency: "usd",
    productName: "Creator sale",
    successUrl: `${location.origin}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${location.origin}/checkout/canceled`,
  }),
});
const { url, sessionId } = await r.json();
// Optional but recommended: write a pending order keyed by sessionId before redirect.
location.href = url;
```

Settlement:

```ts
// In a Bounded function, not trusted frontend code:
const r = await fetch(`${HOST}/connect/session?id=${encodeURIComponent(sessionId)}`);
const session = await r.json();
if (!session.paid) throw new Error("not paid");
// Then write idempotent policy state keyed by session.sessionId.
```

## Webhooks

Bounded Pay currently does **not** fan out Stripe webhooks to each app. The host
has a Stripe Connect webhook for Bounded's own bookkeeping and split-transfer
execution, but app entitlements/credits are granted by app functions that verify
`/connect/session` and write policy state.

For one-off purchases, use the Checkout success redirect plus an idempotent
settlement function. For better recovery if the buyer pays but closes the tab,
store the returned `sessionId` as a pending purchase before redirecting and run a
scheduled reconciliation function that calls `/connect/session` for unsettled
sessions.

For subscriptions or provider-native lifecycle webhooks, integrate Stripe
Billing or another provider directly with the app's own provider keys/secrets and
handle webhooks in the app/backend. Bounded Pay's public Connect checkout is
one-off only.

## Multi-App Services

If a user is building a service that creates or manages many Bounded apps, keep
payment authority and budgets explicit:

- Give each customer app or project its own budget/cap.
- Explain any Bounded-managed payment fee before checkout.
- Read usage from the public billing/usage surfaces available to that project.
- Do not imply that a Stripe payment automatically changes Bounded policy state.
  Metering writes `charges`/`limits`; payments change policy only when the
  platform's own trusted function/webhook writes the desired document.
- Distinguish seller sales from platform-customer billing. Seller sales can use
  `/connect/checkout` and optional splits. A platform charging its own customers
  for plans, markup, or usage should use its own billing integration and then
  write credits, entitlements, or caps through policy.
- Use direct provider integration with the user's own API keys when the user
  wants to avoid managed-payment fees or needs provider-level control.

If the public checkout and usage surfaces do not fit the service model, direct
the user to Bounded support or account setup rather than guessing at private
platform APIs.

## Subscriptions

Bounded Pay's public Connect checkout is currently one-off checkout
(`mode=payment`) for app/seller payments. Do not tell users it supports seller
subscriptions through `/connect/checkout`.

Bounded's own account billing supports a Pro subscription and bucket top-ups via
`bounded billing ...`; that bills the Bounded developer account, not an app's end
users. For app subscriptions, use Stripe Billing or another provider directly,
verify webhooks server-side, and write entitlements/caps through policy.

## Related

- [billing.md](billing.md) — buckets, top-ups, and pass-through fee language
- [functions.md](functions.md) — provider verification code
- [secrets.md](secrets.md) — storing direct provider API keys
- [invariants.md](invariants.md) — `conserve` and `rollingSum`
