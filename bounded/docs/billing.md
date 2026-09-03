# Billing & Usage

What's in here: public plan/bucket behavior, usage warnings, upgrade
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

- Free includes **up to $3 of metered AI/external-services usage per rolling 30
  days**, shared by AI Build, `ctx.ai`, and `ctx.services`. It allows one Build
  at a time and has no daily Build entitlement;
  when the allowance is exhausted, upgrade.
- Pro includes $5/month for the AI/external-services bucket and $30/month for
  the Bounded infra bucket. AI Build and runtime calls consume the same metered
  AI/external-services credit. Pro accounts can run up to two Builds concurrently.
- Team includes everything in Pro plus roles (builders, reviewers, admins),
  $20/month AI/external-services credit, and $100/month Bounded infra credit.
  Team accounts can run up to five Builds concurrently and can top up.

The public checkout flow sells the two monthly subscription kinds
(`kind: "pro" | "team"`) and one fungible credit top-up
(`kind: "credits_topup"`, bought in credits at $0.05 each).
`pro_annual` and `team_annual` are settlement vocabulary, not products: the host
reads them so that subscriptions issued before annual checkout was retired keep
renewing, and answers `400 invalid_billing_kind` to any attempt to start one.
The per-bucket top-ups are retired and are not sold: a credits purchase is
spendable on anything metered - managed services, AI, and infrastructure.

Custom domains are also a Pro feature. Creating a custom domain link is blocked
unless the app owner has Pro-or-better billing, and existing custom domain links
may be removed or disabled if that account loses Pro.

Free AI/external-services usage also has a platform-wide rolling abuse cap. If
that global free pool is paused or exhausted, free accounts see a clear
"free usage paused" / "upgrade to Pro" error. Paid accounts continue through the
normal bucket ledger.

Paid included credit is granted once per UTC calendar month while the purchased
monthly term remains paid through. Build reserves only a bounded AI
amount before starting, settles the measured AI cost, and releases the unused
reservation. Confirmed platform failures release the full reservation.
Infrastructure is not charged as an estimate when no authoritative cost receipt
exists.

Do not explain pricing with unpublished provider costs, margin targets, private
payment details, or non-public service details. Use the public plan, usage
snapshot and checkout flow.

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
bounded billing topup --credits 100          # $5 of fungible Bounded credits
bounded billing portal
```

Checkout and top-up wait for the payment to be APPLIED and say whether it
landed; a completed Stripe checkout is not yet an applied plan.

`bounded billing status` reports the account's effective project cap.
In JSON, read `.limits.maxProjects`; `-1` means unlimited.
A platform-issued project-cap grant is reflected in that effective value, but
the raw operator override record and operator metadata are never returned.

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
| `critical` | urgent upgrade, reduce-volume, or cap-adjustment action |
| `exceeded` | blocked until usage drops or the plan/cap changes |

Do not invent thresholds. Use the values returned in the usage snapshot.

## Project Creation Limits

Project creation is account-scoped. Free accounts can create 3 projects; Pro,
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
| AI/external-services bucket | reduce calls, lower app caps, or upgrade if the current plan is Free |
| free AI/external-services pool | free trial usage is paused or exhausted; upgrade to Pro to continue |
| Bounded infra bucket | reduce usage or adjust allowed caps |

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
