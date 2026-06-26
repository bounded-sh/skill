# Billing & Usage

What's in here: public plan/bucket behavior, usage warnings, upgrade/top-up
guidance, and transparent pass-through fee language.

## Public Model

Bounded uses hard, fail-closed limits so an app cannot silently turn into an
unbounded bill. Cost-bearing work must fit both:

- the user's plan limits, and
- the relevant account bucket or app-level spend cap.

There are two user-visible buckets:

| Bucket | Covers |
|---|---|
| AI/external-services | `ctx.ai` and Bounded-managed third-party service proxies |
| Bounded infra | metered Bounded platform usage at public Bounded rates |

Pro is $25/month and includes monthly starter credit in both buckets:

- $5/month for the AI/external-services bucket.
- $30/month for the Bounded infra bucket.

Free accounts cannot top up buckets; upgrade first. Pro-or-better accounts can
top up eligible buckets from the public billing checkout flow.

## Transparent Fees

Use these exact public rules:

- Bounded-managed third-party service proxies are itemized at provider cost plus
  5%.
- Users can opt out of Bounded-managed third-party proxies by integrating the
  provider directly with their own API keys. In that path, they pay the provider
  directly and Bounded's proxy markup does not apply.
- Bounded Pay keeps a 1% platform fee in addition to Stripe's own processing
  fees.

Do not speculate beyond published pricing or present unpublished cost details.

## Checking Status

Use the public surfaces:

```bash
bounded billing status
bounded billing checkout --plan pro
bounded billing checkout --plan services_topup
bounded billing checkout --plan infra_topup
bounded billing portal
```

`services_topup` funds the AI/external-services bucket. `infra_topup` funds the
Bounded infra bucket. Top-ups require Pro-or-better.

When usage data is available, explain it in user terms:

- request operations,
- datastore reads/writes,
- file reads/writes,
- storage,
- resident compute,
- AI/external-services bucket,
- Bounded infra bucket,
- app-level spend cap.

## Handling Limit Errors

When an operation returns `429` or a usage error with `dimension`, `usage`,
`limit`, or `projectedUsage`:

1. Do not retry blindly.
2. Name the exact exhausted axis.
3. Explain whether the user should reduce volume, delete/export data, upgrade to
   Pro, top up the relevant bucket, or adjust an allowed Pro app cap.
4. If a batch write failed, suggest splitting only when the smaller batch would
   fit the remaining quota.

## App Payments

If an app built on Bounded needs to charge its own end-users, use either:

- Bounded Pay, if it fits the app's payment flow; see
  [bounded-pay.md](bounded-pay.md), or
- the app's own payment provider integrated through functions and secrets.

When using your own provider, verify payment server-side, write an idempotent
claim record, and grant goods or credits through the app's policy-protected data
model. Never trust a client-submitted purchase record without re-verifying it
against the provider.

## Related

- [bounded-pay.md](bounded-pay.md) — Bounded Pay fee and app payment pattern
- [functions.md](functions.md) — provider calls from backend code
- [secrets.md](secrets.md) — using your own provider API keys
- [cli-reference.md](cli-reference.md) — billing commands
