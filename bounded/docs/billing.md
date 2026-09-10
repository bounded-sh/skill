# Billing & Usage

Public plan limits, shared account credits, usage warnings, and payment recovery.

## Public Model

Bounded uses one shared credit balance for each payer.
Ordinary apps billed to an account share that account's credits for AI builds, runtime AI, infrastructure, and managed services.
An independently funded project uses its own payer balance.
Plan limits and optional app spending caps are separate restrictions; buying credits does not raise them.

| Plan | Included account credits | Simultaneous builds |
|---|---|---|
| Free | Up to 5 courtesy credits per calendar month, subject to availability | 1 |
| Pro ($25/month) | 500 credits per monthly billing period | 2 |
| Team ($99/month) | 1,980 credits per monthly billing period | 5 |

Free courtesy credits cover infrastructure and managed services, excluding AI, and expire at calendar month-end.
They depend on a shared monthly promotional budget; a refused courtesy grant does not remove purchased credits.
All plans, including Free, can purchase account credits; purchased credits can fund AI on Free.
Subscription credits expire at the end of the paid billing period and cannot be transferred.
Purchased credits do not expire; card processing fees reduce the amount added.
There is no daily AI Build entitlement.
Enterprise and comped credit arrangements must be checked in the account's actual billing view.

The public checkout flow sells the two monthly subscriptions (`kind: "pro" | "team"`) and account credit purchases (`kind: "credits_topup"`).
`pro_annual` and `team_annual` remain settlement vocabulary for subscriptions sold before annual acquisition retired.
Legacy annual invoices grant the paid year's credit amount once, expiring at that annual period's end.
The old AI/services and infrastructure top-up products are retired.

Custom domains are also a paid feature.
Creating a custom domain link requires the app owner's effective paid entitlement; existing links may be removed or disabled after a downgrade.

Billing snapshots report money and plan limits separately.
Do not interpret an included-credit policy as an available balance or a promise that an unpaid invoice has granted credit.
A positive balance does not override a quantity, concurrency, or spending limit.
Usage collection and enforcement differ by capability; do not promise that every credit debit is synchronous or that every runtime operation immediately stops when a balance is exhausted.

Do not explain pricing with unpublished provider costs, margin targets, private payment details, or non-public service details.
Use the public plan, usage snapshot, and checkout flow.

## Transparent Fees

Use these exact public rules:

- Bounded-managed third-party service proxies are itemized at provider cost plus
  5%. When the managed platform distinguishes standard and pro tool calls,
  Bounded uses the applicable upstream tier first, then applies the 5% markup.
- Users can opt out of Bounded-managed third-party proxies by integrating the
  provider directly with their own API keys. In that path, they pay the provider
  directly and Bounded's proxy markup does not apply.

Do not speculate beyond published pricing or present unpublished cost details.

## Checking Status

Use the public surfaces:

```bash
bounded billing status
bounded billing checkout --plan pro          # or --plan team
bounded billing topup --credits 100          # buy account credits; review checkout terms
bounded billing portal
```

Checkout and top-up wait for the payment to be APPLIED and say whether it
landed; a completed Stripe checkout is not yet an applied plan.

`bounded billing status` shows the authoritative account credit pool when available.
In JSON, use `.credits.pool.available` for available account credits and `.credits.pool.reserved` for held credits.
`billingModel: "pool"` responses omit the retired split-bucket fields.
`creditPolicy.grant` describes the included offer and its restrictions, not additional available funds.
A healthy new account can have zero credits even before a ledger row exists.
“Billing temporarily unavailable.” means the balance could not be read; it does not mean zero credit or that the user is signed out.
Retry the status read later, and do not initiate another payment to recover one that has already been paid.
Checkout refuses a known ledger outage, but a failure after the payment page opens can still delay settlement.
Use the original checkout's settlement check and wait for applied credit before retrying paid work.

`bounded billing status` reports the account's effective project cap.
In JSON, read `.limits.maxProjects`; `-1` means unlimited.
A platform-issued project-cap grant is reflected in that effective value, but
the raw operator override record and operator metadata are never returned.

The hosted dashboard's Billing tab shows, per app, the metered usage at posted prices and what it actually charged the pool, the app's closed months, and the account's spend grouped by app.
When an account's pool is empty, every app it pays for is paused (requests, realtime connections and scheduled jobs are refused; static pages stay up), the dashboard shows a banner on each such app, and the account's email receives a notice, then a weekly reminder while it stays empty.
An email also goes out once when the week's spend rate would empty the pool within three days.

When usage data is available, explain it in user terms:

- request operations,
- datastore reads/writes,
- file reads/writes,
- storage,
- resident compute,
- AI and managed-service usage,
- infrastructure usage,
- shared account credits,
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
| `critical` | urgent upgrade, reduce-volume, or cap-adjustment action |
| `exceeded` | blocked until usage drops or the plan/cap changes |

Do not invent thresholds. Use the values returned in the usage snapshot.

## Project Creation Limits

Project creation is account-scoped. Free accounts can create 10 projects; Pro,
Team, and Enterprise accounts can create unlimited projects.

When project creation returns `project_limit_exceeded` or a usage error with
`dimension: "maxProjects"`:

1. Do not retry the create operation.
2. Run `bounded billing status --json` and use `.limits.maxProjects` as the
   effective account cap.
   The value `-1` means unlimited.
3. Tell the user how many owned projects they have and what their current plan
   limit is, if `usage`, `limit`, or `projectedUsage` are present.
4. Run `bounded apps list --json` to inspect every app the active account owns
   or collaborates on.
   Its safe fields are `appId`, `name`, `environment`, `protocol`, and
   `sitePrivate`.
5. Before reusing an app, run `bounded access --app-id <id> --json` and confirm
   both ownership or deploy rights and protocol compatibility.
   Reuse only the exact app the user approves, and run `bounded deploy` without
   `--create`.
6. Never delete or repurpose a project automatically to work around the limit.
7. If the response says the key is unlinked, recommend `bounded link --email
   <their email>` first so the CLI key and web account share one account limit.
8. If no approved compatible project can be reused, help the user upgrade to
   Pro through the public billing checkout flow.
   Do not initiate billing changes without approval.

## Handling Limit Errors

When an operation returns `402` or a usage error with `dimension`, `usage`,
`limit`, or `projectedUsage`:

1. Do not retry blindly.
2. Name the exact exhausted axis.
3. Explain whether the user should reduce volume, delete/export data, upgrade to
   Pro, reduce the relevant usage, or adjust an allowed Pro app cap.
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
| account credits | add credits on any plan, upgrade for subscription credits, or reduce usage |
| AI-eligible credits | Free courtesy credits exclude AI; purchased or paid subscription credits can fund it |
| app spending cap | reduce usage or adjust the app cap; purchasing credits alone does not raise it |

A `429` is separate from funded usage. It can mean either a short operational
burst/shared-capacity guard or an app-authored daily, monthly, or participant
policy window. Preserve the idempotency key and saved input, name the exact
server reason, honor `Retry-After`, and retry after that delay. Do not describe
it as a plan Build allowance.

## App Payments

If an app built on Bounded needs to charge its own end-users, use direct USDC or
the app's own payment provider integrated through functions and secrets.

When using your own provider, verify payment server-side, write an idempotent
claim record, and grant goods or credits through the app's policy-protected data
model. Never trust a client-submitted purchase record without re-verifying it
against the provider.

## Related

- [accept-crypto.md](../../bounded-onchain/docs/accept-crypto.md) - direct USDC settlement
- [functions.md](../../bounded-backend/docs/functions.md) - provider calls from backend code
- [secrets.md](../../bounded-backend/docs/secrets.md) - using your own provider API keys
- [cli-reference.md](../../bounded-deploy/docs/cli-reference.md) - billing commands
