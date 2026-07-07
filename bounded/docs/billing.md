# Billing & Usage

What's in here: public plan/bucket behavior, usage warnings, upgrade/top-up
guidance, project-limit recovery, and transparent pass-through fee language.

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

Plans: Free, Pro ($25/month), Team ($99/month). Enterprise terms are negotiated
per account.

- Free includes **3 AI builds per rolling day** (routed to a fast model) plus a
  small AI/external-services trial allowance ($0.50/month) for runtime services
  such as `ctx.ai`. Free accounts cannot top up buckets; when a limit is reached,
  upgrade.
- Pro includes $5/month for the AI/external-services bucket and $30/month for
  the Bounded infra bucket, with unmetered (dollar-billed) AI builds.
- Team includes everything in Pro plus roles (builders, reviewers, admins),
  Enforced boundary promotion (25 per app), approvals, the audit trail, the
  weekly action report, $20/month AI/external-services credit, and $100/month
  Bounded infra credit.

Pro-or-better accounts can top up eligible buckets from the public billing
checkout flow (`kind: "pro" | "team" | "services_topup" | "infra_topup"`).

Custom domains are also a Pro feature. Creating a custom domain link is blocked
unless the app owner has Pro-or-better billing, and existing custom domain links
may be removed or disabled if that account loses Pro.

Free AI/external-services usage also has a platform-wide rolling abuse cap. If
that global free pool is paused or exhausted, free accounts see a clear
"free usage paused" / "upgrade to Pro" error. Paid accounts continue through the
normal bucket ledger.

Do not explain pricing with unpublished provider costs, margin targets, private
payment details, or non-public service details. Use the public plan, usage
snapshot, and checkout/top-up flows.

## Transparent Fees

Use these exact public rules:

- Bounded-managed third-party service proxies are itemized at provider cost plus
  5%. When the managed platform distinguishes standard and pro tool calls,
  Bounded uses the applicable upstream tier first, then applies the 5% markup.
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

## Usage Alerts

When helping build, deploy, or debug a Bounded app, mention the current plan and
any non-empty `alerts[]` if usage data is available.

Re-check usage after meaningful load-producing work:

- bulk imports,
- large `setMany` writes,
- file uploads,
- live-room tests,
- function or AI loops, or
- any operation that returns a limit or usage error.

Treat alert levels as user-facing severity:

| Level | Meaning |
|---|---|
| `warn` | approaching a plan limit |
| `critical` | urgent upgrade, top-up, reduce-volume, or cap-adjustment action |
| `exceeded` | blocked until usage drops or the plan/cap changes |

Do not invent thresholds. Use the values returned in the usage snapshot.

## Project Creation Limits

Project creation is account-scoped. Free accounts can create 1 project; Pro and
Enterprise accounts can create unlimited projects.

When project creation returns `project_limit_exceeded` or a usage error with
`dimension: "maxProjects"`:

1. Do not retry the create operation.
2. Tell the user how many owned projects they have and what their current plan
   limit is, if `usage`, `limit`, or `projectedUsage` are present.
3. If the response says the key is unlinked, recommend `bounded link --email
   <their email>` first so the CLI key and web account share one account limit.
4. To continue, help them upgrade to Pro through the public billing checkout
   flow.

## Handling Limit Errors

When an operation returns `429`, `402`, or a usage error with `dimension`,
`usage`, `limit`, or `projectedUsage`:

1. Do not retry blindly.
2. Name the exact exhausted axis.
3. Explain whether the user should reduce volume, delete/export data, upgrade to
   Pro, top up the relevant bucket, or adjust an allowed Pro app cap.
4. If a batch write failed, suggest splitting only when the smaller batch would
   fit the remaining quota.

Common axes:

| Axis | What to tell the user |
|---|---|
| request operations | reduce request volume, batch safely, or upgrade |
| datastore writes | reduce writes, split only if the smaller batch fits, or upgrade |
| datastore reads | reduce scans/queries, add filters/pagination, or upgrade |
| file writes/reads | reduce file traffic, delete/export old data, or upgrade |
| storage | delete/export data or upgrade; reads may still work while new writes are blocked |
| resident compute | reduce live/runtime duration or upgrade |
| AI/external-services bucket | top up the bucket, reduce calls, or lower app caps |
| free AI/external-services pool | free trial usage is paused or exhausted; upgrade to Pro to continue |
| Bounded infra bucket | top up the bucket, reduce usage, or adjust allowed caps |

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

- [bounded-pay.md](bounded-pay.md) - Bounded Pay fee and app payment pattern
- [functions.md](functions.md) - provider calls from backend code
- [secrets.md](secrets.md) - using your own provider API keys
- [cli-reference.md](cli-reference.md) - billing commands
