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

1. Add policy state for a **server-authored order** plus
   purchases/settlements/entitlements or balances. The order
   (`orders/<sessionId>`) fixes item, amount, and currency **server-side**; the
   client never sends a price. Key idempotent settlement by the Stripe Checkout
   `sessionId`.
2. Seller onboarding UI calls `POST /connect/onboard` with the seller's Bounded
   JWT, redirects them to the returned `onboardingUrl`, then calls
   `GET /connect/status` until `chargesEnabled` is true. This creates/reuses one
   Stripe Standard connected account for that Bounded identity; it is not scoped
   to one app.
3. Buyer checkout runs through **your backend**, never from client-chosen
   amounts. The client names the item; a Bounded function looks up the fixed
   price/currency from a server-side catalog, calls `POST /connect/checkout` with
   those server-fixed terms, and writes the pending `orders/<sessionId>` record.
   Send one stable `Idempotency-Key` per logical checkout and reuse it across
   retries, double clicks, and lost responses. Never let the client choose
   `amount` or `currency`, then redirect the buyer to the returned `url`.
4. After payment, the success URL receives `?sessionId=cs_...`. On callback
   entry, synchronously capture the id and remove it from the browser URL before
   importing or initializing analytics; then invoke an app function such as
   `claimPurchase({ sessionId })` with the captured value.
5. The app function calls `GET /connect/session?id=cs_...` server-side, verifies
   `paid`, then **compares** the paid session's `gross`, `currency`, `merchant`
   and `buyer` against the server order in `orders/<sessionId>` before writing any
   claim. A session that does not match the order grants nothing. Only then write
   an idempotent claim/settlement through normal Bounded policy rules/invariants.
   The paid amount comes back as `gross` (minor units); there is no `amount` field
   on that response, so comparing `session.amount` compares `undefined` and
   refuses every real payment.
6. A trusted settlement function grants credits, ownership, entitlements, or
   conserved ledger entries. Use `conserve` for money-like balances and
   `rollingSum` for spend or grant caps.
7. For a monthly or yearly destination subscription, pass
   `recurring: { interval: "month" | "year" }`. Split checkout remains one-off.
   After the first invoice is paid, the trusted function gets `subscriptionId`
   from `/connect/session`, stores it in read-restricted policy state, and polls
   `/connect/subscription` for lifecycle changes. Polling does not update the app
   or book later renewal invoices automatically.

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

Buyer checkout - the backend fixes the terms, opens Checkout, and records the order:

```ts
// In a Bounded function (server-side). The client sends only the item key; the
// price and currency come from a server-side catalog, never from the caller.
const CATALOG = {
  "creator-sale": { amount: 1000, currency: "usd", productName: "Creator sale" },
};
const item = CATALOG[args.item];
if (!item) throw new Error("unknown item");

const r = await fetch(`${HOST}/connect/checkout`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${buyerJwt}`,
    "Content-Type": "application/json",
    // Persist this with the pending order and reuse it for this purchase only.
    "Idempotency-Key": logicalCheckoutId,
  },
  body: JSON.stringify({
    merchant: sellerBoundedUserId,
    amount: item.amount, // server-fixed, minor units - not a client value
    currency: item.currency, // server-fixed
    productName: item.productName,
    successUrl: `${appOrigin}/paid?sessionId={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appOrigin}/checkout/canceled`,
  }),
});
const { url, sessionId } = await r.json();

// Persist the SERVER order keyed by sessionId with the exact server-fixed terms.
// Settlement compares the paid session against this record before releasing value.
await ctx.bounded.set(`orders/${sessionId}`, {
  item: args.item,
  amount: item.amount,
  currency: item.currency,
  merchant: sellerBoundedUserId,
  buyer: ctx.user.id,
  status: "pending",
});

return { url }; // the client then redirects to `url`
```

The order record only exists after the checkout call returns, so let a failed order
write fail the whole function rather than returning `url` anyway: settlement refuses
a session with no order, and the buyer would have paid for something unclaimable.
Because the same `Idempotency-Key` returns the same session, the client's retry
re-runs the order write against the identical `sessionId`.

The durable checkout contract applies only when `Idempotency-Key` is present.
Bounded namespaces the key by authenticated buyer and merchant and rejects reuse
with different normalized terms. Omitting it uses the legacy non-durable path and
can create a second Checkout Session or subscription after a retry or double
click.

Settlement:

```ts
// In a Bounded function, not trusted frontend code:
const r = await fetch(`${HOST}/connect/session?id=${encodeURIComponent(sessionId)}`);
const session = await r.json();
if (!session.paid) throw new Error("not paid");

// Compare the PAID session to the SERVER-CREATED order for this checkout.
// amount/currency/item were fixed server-side in `orders/${sessionId}`; the client
// never chose them, so never grant value from a session the order does not match.
const order = await ctx.bounded.get(`orders/${sessionId}`);
if (!order || order.status !== "pending") {
  throw new Error("unknown or already-settled order");
}
// `gross` is the paid amount in minor units - the response has no `amount` field.
// `buyer` is the Bounded identity the session was created for, so a caller holding
// someone else's `cs_...` id cannot settle it into their own account.
if (
  session.gross !== order.amount ||
  session.currency !== order.currency ||
  session.merchant !== order.merchant ||
  session.buyer !== order.buyer
) {
  throw new Error("paid session does not match the server order");
}

// Only now write the idempotent claim, keyed by session.sessionId, and mark the
// order settled in the same atomic batch.
```

`/connect/session` is not JWT-gated. The high-entropy `cs_...` id is a bearer
capability, and a completed subscription session can return the longer-lived
`sub_...` capability. Keep the read server-side, redact both ids from logs and
telemetry, and store subscription ids only in read-restricted policy state. Do
not treat CORS as authorization.

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

For managed seller subscriptions, lifecycle is poll-based: Bounded Pay does not
fan out renewal, failure, cancellation, refund, or dispute webhooks to the app.
Poll `/connect/subscription` from a scheduled function and write entitlement
changes through policy. Each poll performs a Stripe read, so use a bounded
schedule, cache for app-facing requests, and back off on errors rather than
polling per browser render. Use a direct Stripe Billing or other provider
integration when the app needs provider-native webhooks, refunds/disputes,
split subscriptions, per-renewal ledger entries, or custom lifecycle behavior.

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

`POST /connect/checkout` supports simple destination subscriptions with
`recurring: { interval: "month" | "year" }`. The amount is the per-period price;
the merchant destination and Bounded application-fee percentage apply on each
invoice. Checkout with `appId`/`platformId` is registry split mode and remains
one-off; combining it with `recurring` returns
`recurring_split_not_supported`.

Always send a stable `Idempotency-Key`. Checkout creation returns
`{ url, sessionId, recurring }`; it cannot return a `subscriptionId` because
Stripe creates the subscription only after Checkout completes. A trusted
function retrieves the completed session, verifies the first invoice is paid,
and stores its returned `subscriptionId` in private policy state. The ordinary
session settlement is idempotent for that first Checkout Session only; it does
not book later invoices.

The app then polls `GET /connect/subscription?id=sub_...`, which returns status,
active state, period end, cancel-at-period-end, party ids, amount, interval, and
currency. Each poll performs a Stripe read; use a bounded schedule, cache the
result for app requests, and back off on errors. This GET and `/connect/session`
are unauthenticated bearer-capability reads: possession of the high-entropy id is
the authorization. A session id can reveal the longer-lived subscription id.
Keep them server-side, remove Checkout ids from callback URLs before analytics
starts, redact both from telemetry, and store subscription ids only behind a
narrow read rule.

`POST /connect/subscription/cancel` requires the caller's Bounded JWT and one
stable, URL-safe `Idempotency-Key` of 1-256 bytes for the logical cancellation.
Persist that key before the first POST and reuse it across double clicks,
sibling tabs, reloads, timeouts, and lost responses. Bounded namespaces it by
the authenticated caller and exact subscription before it reaches Stripe, so
the same logical retry keeps one provider key without sharing a Stripe key with
another tenant. Missing, malformed, whitespace-bearing, Unicode, or oversized
keys fail before any Stripe read or mutation.

```ts
const cancellationKey = loadOrCreatePendingCancellationKey(subscriptionId);
const cancel = await fetch(`${HOST}/connect/subscription/cancel`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${buyerOrMerchantJwt}`,
    "Content-Type": "application/json",
    "Idempotency-Key": cancellationKey,
  },
  body: JSON.stringify({ id: subscriptionId }),
});

// The POST response alone is not cancellation proof. Re-read exact provider
// truth with the same subscription capability after every success or error.
const current = await fetch(
  `${HOST}/connect/subscription?id=${encodeURIComponent(subscriptionId)}`,
).then((response) => response.json());
if (current.cancelAtPeriodEnd === true) {
  clearPendingCancellationKey(subscriptionId, cancellationKey);
}
```

The route allows the recorded buyer or merchant and sets cancellation at period
end. A retry whose fresh subscription read already shows cancellation returns
that applied truth without a second provider mutation. Keep the pending key
when the exact GET is unavailable or still says `cancelAtPeriodEnd: false`.

Bounded Pay does not currently expose a public refund endpoint. Destination
charges are created on the platform account, so do not promise that every
connected merchant can refund one in their own Stripe dashboard. Use an
explicit platform workflow or a direct provider integration for refunds,
disputes, per-renewal accounting, provider webhooks, and matching idempotent
policy updates.

Bounded's own account billing supports a Pro subscription and bucket top-ups via
`bounded billing ...`; that bills the Bounded developer account, not an app's end
users. Do not confuse those account plans with the app/seller subscriptions
described above.

## Related

- [billing.md](../../bounded/docs/billing.md) — buckets, top-ups, and pass-through fee language
- [functions.md](../../bounded-backend/docs/functions.md) — provider verification code
- [secrets.md](../../bounded-backend/docs/secrets.md) — storing direct provider API keys
- [invariants.md](../../bounded-backend/docs/invariants.md) — `conserve` and `rollingSum`
