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

Regardless of payment provider:

1. Start checkout through the chosen payment flow.
2. After payment, verify the provider session server-side.
3. Write an idempotent claim keyed by the provider session id.
4. Settle credits, ownership, or entitlement changes through normal Bounded
   policy rules and invariants.
5. Use `conserve` for money-like balances and `rollingSum` for spend or grant
   caps.

Do not grant value from a client-submitted amount, product id, or payment status
without provider verification.

## Multi-App Services

If a user is building a service that creates or manages many Bounded apps, keep
payment authority and budgets explicit:

- Give each customer app or project its own budget/cap.
- Explain any Bounded-managed payment fee before checkout.
- Read usage from the public billing/usage surfaces available to that project.
- Use direct provider integration with the user's own API keys when the user
  wants to avoid managed-payment fees or needs provider-level control.

If the public checkout and usage surfaces do not fit the service model, direct
the user to Bounded support or account setup rather than guessing at private
platform APIs.

## Related

- [billing.md](billing.md) — buckets, top-ups, and pass-through fee language
- [functions.md](functions.md) — provider verification code
- [secrets.md](secrets.md) — storing direct provider API keys
- [invariants.md](invariants.md) — `conserve` and `rollingSum`
