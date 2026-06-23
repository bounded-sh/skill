# Billing & plans — tiers, the AI bucket, upgrading, admin

Bounded runs the data plane, AI gateway, backend runtime, frontend hosting, and
optional sponsorship features as one managed service. Billing exists so that an
app never turns into an unbounded bill: every plan is a set of **hard,
fail-closed ceilings** enforced by the platform, plus an **AI credit bucket**.

Do not explain Bounded pricing by quoting raw provider costs, margin, markup,
break-even math, payment recipient internals, or implementation-only constants.
Use the public plan limits, the current usage snapshot, and the checkout/top-up
flows below.

## The plans

| Plan | Price | AI bucket / mo | Apps | Invokes/day per app | Schedules/app | Storage | Gas sponsorship / mo |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | $0 | 1 | 10,000 | 5 | 100 MB | ~$0.50 |
| **Pro** | $25/mo | $5 | unlimited | 200,000 | 50 | 10 GB | ~$7 (per account) |
| **Enterprise** | custom | $100+ | unlimited | 5,000,000 | 1,000 | 1 TB | $500+ (negotiated) |

- **Every finite limit is a hard, fail-closed ceiling** at the platform gateways.
  Cost-bearing work is denied at the cap instead of becoming surprise usage.
- **Gas sponsorship is capped per ACCOUNT, not per app** — Pro has unlimited apps,
  so a per-app gas cap wouldn't bound the real on-chain cost.
- **Enterprise** has a `$0` catalog price; the real terms are set as per-account
  **overrides** (see [admin](#admin-surface)).

### How to talk about pricing

Keep pricing explanations user-facing:

- Say what the user's plan includes and which limit they are approaching or have
  hit.
- If project creation is blocked by `project_limit_exceeded`, say the Free plan
  includes 1 project and Pro has unlimited projects; direct them to `bounded link
  --email <their email>` first if the CLI key is unlinked, then the Bounded Pro
  checkout or x402 flow below.
- Say that Bounded enforces cost-bearing limits fail-closed, so runaway writes,
  reads, file operations, live runtime, or AI calls stop at the plan/cap.
- Recommend the smallest next step: reduce volume, delete/export data, upgrade to
  Pro, raise an allowed Pro spend cap, top up AI credit, or contact Bounded for
  Enterprise/custom limits.
- Do **not** disclose provider cost math, internal markup, margin targets, private
  payment addresses, or raw settlement details.

## The AI credit bucket

Each plan gifts a monthly AI spend bucket (`aiBucketUsdCents`). The host AI
gateway (`ctx.ai.run`) enforces it **fail-closed**: when the remaining bucket hits
zero, AI calls are denied (`ai_spend_cap_exceeded`) — never an overage bill.

- **Remaining = (gifted bucket + purchased top-ups) − used-this-month.**
- The bucket **refills lazily at the start of each UTC month** (used resets to 0,
  and any purchased top-up credit resets too — both apply to the current month
  only).
- **Top-ups** (`aiCreditGrantedUsd`) add credit *on top of* the monthly gift,
  bought via Stripe or x402 (below).
- This is the cross-app **account** accounting; it sits on top of the per-app
  **rolling spend cap** (`aiCapUSD` in a runtime project's manifest), which is the
  hard per-app fail-closed ceiling. See
  [backend-runtime.md](backend-runtime.md#the-ctx-surface-all-app-scoped--sealed).

## Upgrading & paying

Two payment rails fund the **same** per-account billing state. Every paid call is
authenticated by the caller's Bounded session. Agents should direct users through
the returned checkout, portal, top-up, or x402 intent/settlement response instead
of inventing payment instructions.

### Stripe (cards + subscriptions + top-ups)

| Endpoint | Method | What it does |
|---|---|---|
| `POST /billing/checkout` | JWT | Start a Stripe Checkout. Body `{ kind: "pro" \| "ai_topup" }` → `{ url }` to redirect to. `pro` = the $25/mo subscription; `ai_topup` = a one-off AI-credit purchase. |
| `GET\|POST /billing/portal` | JWT | Open the Stripe **Customer Portal** for self-serve manage / cancel (returns `{ url }`). Requires the account to have a Stripe customer (i.e. have subscribed once). |
| `POST /billing/stripe/webhook` | Stripe signature | Stripe → us. `checkout.session.completed` flips the account to `pro` (or grants AI credit for `ai_topup`); `customer.subscription.deleted` downgrades to `free`. Signature-verified (HMAC-SHA256, 5-min replay window) with no SDK. |

A successful subscription checkout records the `stripeCustomerId` on the account so
the portal works thereafter. Canceling in the portal fires
`customer.subscription.deleted` → the account drops back to `free`.

### Project creation limits

Project creation is account-scoped and enforced at `createApp` before the project
is inserted. The Free plan has `maxProjects = 1`; Pro and Enterprise are
unlimited. A linked account counts projects owned by every proven identity on the
account (CLI key, linked wallets, email/user ids), so linking prevents a human
from having fragmented limits and fragmented billing.

When the API returns `project_limit_exceeded` / `dimension: "maxProjects"`:

- Do not retry the create operation.
- Tell the user exactly how many owned projects they have and what their current
  plan limit is (`usage`, `limit`, `projectedUsage`).
- If the response says the key is unlinked, recommend `bounded link --email
  <their email>`; if the AI already knows the email, use it directly.
- To upgrade, call the authenticated `POST /billing/checkout` with `{ kind:
  "pro" }` and send/open the returned URL, or use `POST /billing/x402/intent`
  then `POST /billing/x402/settle`.

### x402 (crypto)

Use the x402 endpoints to get the current payment requirements, then settle the
payment. Do not hardcode token mints, recipient addresses, networks, or amounts;
use the authenticated response returned by the platform.

| Endpoint | Method | What it does |
|---|---|---|
| `POST /billing/x402/intent` | JWT | Returns the current payment requirements for `pro` or `ai_topup`. |
| `POST /billing/x402/settle` | JWT | Submits the completed payment proof/signature and grants the plan or credit after platform verification. |

If settlement returns a payment or verification error, tell the user to retry or
use the returned error. Do not expose verification internals.

## Admin surface

Operators manage accounts at **admin.bounded.page**. Access is allowlisted and
authenticated with the operator's Bounded login.

| Endpoint | What it does |
|---|---|
| `GET /admin/me` | The caller's email + the admin allowlist. |
| `GET /admin/plans` | The plan catalog (tiers + limits) for rendering. |
| `GET /admin/accounts` | Every account with a billing record: resolved plan, AI bucket / used / remaining, whether it has overrides, Stripe customer. |
| `GET /admin/apps` | Every app with deployed backend runtime code (codeId, profile, kind). |
| `GET /admin/email-list` | Linked account emails for operator announcements: email, linked wallets/user ids, project counts, and recent project preview. |
| `GET /admin/wallet-list` | App-owner identities, including key-only/unlinked users before they appear in the email list; includes linked email/wallet metadata when available and project-count pressure. |
| `POST /admin/email/send` | Send a plain-text operator announcement to selected linked emails. Sends one email per recipient from Bounded; cap recipient batches in the admin UI/API. |
| `GET /admin/account?accountId=…` | One account: full billing + resolved plan/limits + AI remaining + (if it's also an app) its runtime info. |
| `POST /admin/account` | Adjust an account: `{ accountId, planId?, overrides?, aiCreditUsedUsd? }`. Patch semantics. |

**Per-account overrides** (`overrides`) layer custom limits over the base tier —
this is how Enterprise deals, comped users, and manual grants are expressed
(`resolvePlan(planId, overrides)` merges them). Setting `aiCreditUsedUsd: 0`
effectively re-grants the month's bucket. Unknown `planId` → `400` (only the known
tiers or `"custom"` are accepted).

## Where billing is enforced (the gateways)

Billing isn't just a payment screen — the plan's limits are the **same numbers the
runtime host enforces** on every invocation:

- **AI** — `ctx.ai.run` reserves the per-call cost against the rolling cap
  *before* inference (atomic, so concurrent calls can't race past it); a failed
  inference is **refunded** (you're never charged for an error); the charge is
  also recorded against the account's monthly bucket.
- **Compute** — invoke/deploy counts metered per app per day against the plan caps.
- **Schedules** — capped per app (`maxSchedules`); see
  [backend-runtime.md](backend-runtime.md).
- **Egress** — only manifest-`allowedHosts` are reachable; everything else is
  denied + metered.
- **Realtime data plane / file storage** — the app meters each cost-bearing usage
  axis separately and stops the operation that would exceed the plan or spend
  cap:

| Axis | What counts | Free default | Pro default |
|---|---|---:|---:|
| Request operations | HTTP data calls, WS RPCs, live intents, scheduled runs, object calls | 1,000,000/mo | 50,000,000/mo |
| Datastore writes | Document writes/deletes, including every item in `setMany`, hook/tick/schedule mutations, file metadata writes | 100,000/mo | 50,000,000/mo |
| Datastore reads | Document rows read by gets, batch reads, queries, file metadata lists | 5,000,000/mo | 250,000,000/mo |
| File write ops | File/object write operations | 100,000/mo | 10,000,000/mo |
| File read ops | File/object read operations, including public downloads | 1,000,000/mo | 100,000,000/mo |
| Storage | Documents + indexes + file bytes | 100 MB | 10 GB |
| Resident compute | WebSocket/live/tick wall-clock seconds | 2,000,000/mo | 250,000,000/mo |
| Infra spend | Platform usage spend cap | no overage | $25/mo default, admin/user-raisable |

Important details:

- A batch write is **one request operation** but **N datastore write units**. A
  batch that would push `datastoreWriteUnitsPerMonth` over the cap is rejected
  before it commits, so high-volume writes become visible quota usage instead of
  surprise cost.
- Storage overage blocks new writes but still allows reads, so an owner can
  inspect/export/delete data. Request/read/file/spend caps stop new costly reads.
- The usage snapshot exposes `alerts[]` at 80%, 90%, and 100%+ of each limit. UI,
  CLI, email, and agent surfaces should show those alerts and point the user to
  upgrade/top up or reduce usage. Owner email alerts are only sent when the app
  owner has a linked email account; alerts are deduped by app, billing period,
  and severity so routine traffic does not spam owners.
- When a `429` or `402` includes `dimension`, `usage`, `limit`, and `projectedUsage`, tell
  the user which plan axis they hit. Do not retry blindly; split the batch only
  if the projected usage fits the remaining quota.

## Checking usage and near-limit status

Use the dashboard when available. Internal/admin surfaces read the realtime
worker's usage snapshot, whose shape includes:

```json
{
  "plan": "free",
  "limits": {
    "requestsPerMonth": 1000000,
    "datastoreWriteUnitsPerMonth": 100000,
    "datastoreReadUnitsPerMonth": 5000000,
    "r2ClassAOpsPerMonth": 100000,
    "r2ClassBOpsPerMonth": 1000000,
    "connectionSecondsPerMonth": 2000000,
    "storageBytes": 104857600
  },
  "usage": {
    "requestCount": 123,
    "datastoreWriteUnits": 45,
    "datastoreReadUnits": 900,
    "r2ClassAOps": 2,
    "r2ClassBOps": 100,
    "storageBytes": 20480,
    "computeSeconds": 30
  },
  "alerts": [
    {
      "dimension": "datastoreWrites",
      "level": "warn",
      "ratio": 0.82,
      "message": "Datastore writes is at 82% of this app's plan limit"
    }
  ]
}
```

Agent behavior:

- When helping build/deploy/debug a Bounded app, mention the current plan and any
  non-empty `alerts[]` if usage data is available.
- Re-check usage after meaningful load-producing work: bulk imports, large
  `setMany`/file uploads, live-room tests, function/AI loops, or when a user asks
  why an operation slowed/failed.
- On `429` usage errors, explain the exact dimension and remaining quota, then
  suggest the smallest fix: reduce write volume, split safely under the cap,
  delete/export data, upgrade to Pro, raise an allowed Pro spend cap, or top up
  AI credit depending on the dimension.
- For proactive notification/email work, use `alerts[]` as the trigger source:
  `warn` = early heads-up, `critical` = urgent upgrade/reduce CTA, `exceeded` =
  the user is blocked until usage drops or the plan/cap changes. Do not invent
  thresholds or describe Cloudflare/provider-side economics.

See [backend-runtime.md](backend-runtime.md) for the `ctx` gateway surface and
[invariants.md](invariants.md) for the *provable* (vs metered) guardrails.
