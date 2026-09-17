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

`bounded billing status` reports the account's daily project-create limit.
In JSON, read `.limits.maxProjectCreatesPerDay`; `-1` means no daily limit.
A platform-issued limit grant is reflected in that effective value, but
the raw operator override record and operator metadata are never returned.

The hosted dashboard's Billing tab shows, per app, the metered usage at posted prices and what it actually charged the pool, the app's closed months, and the account's spend grouped by app.

## Function runs are funded before they start

Every Bounded Function run (public HTTP, `/invoke`, scheduled, queued, webhook, browser, live) takes a reservation on the payer's credit pool before any code loads, and settles it at the run's measured cost when the run ends.
A payer with no available credits gets no run: the caller receives `402 insufficient_funds` (or an `allocation_*` code when an app spending allocation is the limit) with a `retry` block, nothing executes, nothing is charged, and the very next call after credits arrive runs with no reset or redeploy.
A Free account's monthly courtesy credit is minted on the first run of the month before that check, so an idle Free app wakes up on its own.
When billing itself cannot answer, the caller receives `503` with `services_billing_unavailable`, `courtesy_renewal_unavailable`, `ledger_capacity_exhausted` or `admission_protocol_unavailable` and a `Retry-After`; that is an outage, not a balance, and the run is safe to retry.
Per-app usage caps still refuse with `429 usage_cap_exceeded` before any money moves.
A refused run is not a failed run: it is reported separately in analytics (`function_refused`) and never appears in `bounded functions logs` as an execution.
A run's own datastore reads and writes are covered by that run's reservation, so a running function is never cut off mid-flight by a balance that reached zero while it was executing.
The exact caller-facing codes are listed in [public functions](../../bounded-backend/docs/public-functions.md#refusals---nothing-ran-nothing-was-charged).

## Credit alerts

The account's email receives three kinds of notice, each derived from the pool's real readings:

- **Credits run out in N days** - sent once when the past week's spend rate would empty the pool within three days. The message states the available credits and the derived daily burn as whole credits per day (a fractional rate is rounded UP to whole credits per day, so any positive spend shows at least one credit a day and never a raw fraction or zero); when there is no positive spend rate to forecast from, no forecast is sent.
- **Your credit pool is empty** - sent when the pool reaches zero, listing the apps linked to this account.
- **Reminder: your credit pool is still empty** - weekly while it stays empty, up to a fixed number of reminders.

Each says exactly what stops: functions that need those credits cannot start new runs; runs already in progress and live data connections may continue; static pages stay online; new credits may also cover earlier usage.
The dashboard shows a banner on each app whose payer is empty.

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

Project creation is account-scoped and rate-limited, not capped in total.
A Free account can hold any number of projects but can create at most 20 per
rolling 24 hours; Pro, Team, and Enterprise accounts have no creation limit.
Only user-owned project creations count: managed OpenApps child apps and
preview apps are exempt, and bringing an existing app into OpenApps is not a
creation.
Deleting apps never frees the window; a creation counts from its birth time
until it leaves the 24-hour window.

When project creation returns `429 project_daily_limit_exceeded` (every
creation lane, including `bounded create`, `bounded deploy --create`, and
`ctx.apps.create`, refuses with this same code):

1. Do not retry the create operation before the window reopens.
2. Read the response: `limit` is the account's creations per window, `usage`
   is how many it created inside the current window, `windowMs` is the window
   length, and `resetsAtMs` is the millisecond timestamp at which the oldest
   counted creation leaves the window and one more create fits.
   The same fields are mirrored under `details`.
   The `Retry-After` header carries the same wait in seconds.
   A `resetsAtMs` of `null` (and no `Retry-After`) means nothing counted will
   free capacity: the account's limit is `0`, so waiting will not help and only
   an upgrade or an operator change can.
3. Tell the user when the next create fits, using `resetsAtMs`.
   The server's `message` already says this in plain words.
4. If the user does not want to wait, run `bounded apps list --json` to
   inspect every app the active account owns or collaborates on.
   Its safe fields are `appId`, `name`, `environment`, `protocol`, and
   `sitePrivate`.
   Before reusing an app, run `bounded access --app-id <id> --json` and
   confirm both ownership or deploy rights and protocol compatibility.
   Reuse only the exact app the user approves, and run `bounded deploy`
   without `--create`.
5. Never delete or repurpose a project to work around the limit: deleting
   does not free the window, and a repurposed app is a lost app.
6. If the response says the key is unlinked, recommend `bounded link --email
   <their email>` first so the CLI key and web account share one account
   window.
7. If the user wants the limit gone, help them upgrade to Pro through the
   public billing checkout flow; paid plans have no creation limit.
   Do not initiate billing changes without approval.

A function that creates user-owned apps can ask `ctx.apps.canCreate({
ownership: "invoking-user" })` before provisioning anything; see
[ctx.build](../../bounded-backend/docs/functions-ctx-build.md).

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

A `429` is separate from funded usage. It can mean a short operational
burst/shared-capacity guard, an app-authored daily, monthly, or participant
policy window, or the Free tier's daily project-create limit
(`project_daily_limit_exceeded`, a plan limit an upgrade removes; see
[Project Creation Limits](#project-creation-limits)). Preserve the idempotency
key and saved input, name the exact server reason, honor `resetsAtMs` and
`Retry-After`, and retry after that delay. Do not describe it as a plan Build
allowance.

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
