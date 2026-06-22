# Billing & plans — tiers, the AI bucket, upgrading, admin

Bounded runs the whole stack **through us** (data plane, AI gateway, backend
runtime, frontend hosting, gas sponsorship). Billing exists so that compute never
runs us — or you — into an unbounded bill: every plan is a set of **hard,
fail-closed ceilings** enforced at the host gateways, plus a gifted **AI credit
bucket**.

> Source of truth in code: `bounded-host/src/plans.ts` (the tiers + limits),
> `billing-store.ts` (per-account state), `payments.ts` (Stripe + x402 rails),
> `admin.ts` (operator surface). Every number below is a tunable knob in `plans.ts`.

## The plans

| Plan | Price | AI bucket / mo | Apps | Invokes/day per app | Schedules/app | Storage | Gas sponsorship / mo |
|---|---|---|---|---|---|---|---|
| **Free** | $0 | ~$0.25 | 1 | 10,000 | 5 | 100 MB | ~$0.50 |
| **Pro** | $25/mo | $5 | unlimited | 200,000 | 50 | 10 GB | ~$7 (per account) |
| **Enterprise** | custom | $100+ | unlimited | 5,000,000 | 1,000 | 1 TB | $500+ (negotiated) |

- **Every limit is a hard, fail-closed ceiling** at the host gateways. A maxed-out
  account costs us at most ~the price (break-even); a typical account, far less.
- **Gas sponsorship is capped per ACCOUNT, not per app** — Pro has unlimited apps,
  so a per-app gas cap wouldn't bound the real on-chain cost.
- **Enterprise** has a `$0` catalog price; the real terms are set as per-account
  **overrides** (see [admin](#admin-surface)).

### The break-even model (why $25)

Of a $25/mo Pro subscription, **$5 is gifted into the AI credit bucket**. The
other $20 must cover, at *maxed-out* plan usage, all non-AI Cloudflare cost
(compute, gas sponsorship, storage). Because every limit is fail-closed, the worst
case is break-even and the common case is margin — **no user can ever run us into a
loss, and no user can ever be surprised by an unbounded bill.** Raising a limit is
a deliberate config change in `plans.ts`.

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

Two payment rails fund the **same** per-account billing state. Both are
config/secret-driven: with no keys set, the endpoints report `*_not_configured`
(a `503`, never a hard crash), so the platform ships safely and activates when the
keys are present. Every paid call is authenticated by the caller's Bounded JWT —
the `accountId` is the verified `custom:userId`, never client-supplied.

### Stripe (cards + subscriptions + top-ups)

| Endpoint | Method | What it does |
|---|---|---|
| `POST /billing/checkout` | JWT | Start a Stripe Checkout. Body `{ kind: "pro" \| "ai_topup" }` → `{ url }` to redirect to. `pro` = the $25/mo subscription; `ai_topup` = a one-off AI-credit purchase. |
| `GET\|POST /billing/portal` | JWT | Open the Stripe **Customer Portal** for self-serve manage / cancel (returns `{ url }`). Requires the account to have a Stripe customer (i.e. have subscribed once). |
| `POST /billing/stripe/webhook` | Stripe signature | Stripe → us. `checkout.session.completed` flips the account to `pro` (or grants AI credit for `ai_topup`); `customer.subscription.deleted` downgrades to `free`. Signature-verified (HMAC-SHA256, 5-min replay window) with no SDK. |

A successful subscription checkout records the `stripeCustomerId` on the account so
the portal works thereafter. Canceling in the portal fires
`customer.subscription.deleted` → the account drops back to `free`.

### x402 (crypto: USDC on Solana)

Pay with USDC on Solana into the platform's funnel address (the **E9** address),
then settle on-chain. Two-step, fail-closed at every point:

| Endpoint | Method | What it does |
|---|---|---|
| `POST /billing/x402/intent` | JWT | Returns the payment **requirements** — `{ scheme:"x402", network:"solana", asset:"USDC", payTo, amountUsd, kind }`. `pro` = $25, `ai_topup` = $5. The client pays USDC to `payTo`, then settles. |
| `POST /billing/x402/settle` | JWT | Body `{ kind, signature }` (or an `X-Payment` header carrying the tx signature). The host **verifies the transfer on-chain** (correct USDC mint + amount ≥ required + finalized), guards against replay (one R2 record per signature), then grants the plan/credit — funding the **same** state the Stripe webhook does. |

Fail-closed specifics: any RPC/verification uncertainty → **no grant** (502/402,
retry); insufficient amount → `402 insufficient_payment`; a signature already used
for a different account/kind → `409`; the same caller re-settling the same
signature is **idempotent** (returns the prior grant). x402 is armed behind a hard
`X402_ENABLED` gate + funnel-address confirmation, so no real funds route until the
founder confirms the address.

> On-chain detail: USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
> (6 decimals), mainnet; settlement reads `getTransaction` at `finalized` and sums
> the post−pre USDC delta received by `payTo`.

## Admin surface

Operators manage accounts at **admin.bounded.page** (API on `bounded-host` under
`/admin/*`). Access is gated to a small **email allowlist** verified from the
operator's Bounded email-login JWT (`ADMIN_EMAILS`, default = the founders;
non-allowlisted → `403`). CORS is a credentialed allowlist of `admin.bounded.page`, not a wildcard.

| Endpoint | What it does |
|---|---|
| `GET /admin/me` | The caller's email + the admin allowlist. |
| `GET /admin/plans` | The plan catalog (tiers + limits) for rendering. |
| `GET /admin/accounts` | Every account with a billing record: resolved plan, AI bucket / used / remaining, whether it has overrides, Stripe customer. |
| `GET /admin/apps` | Every app with deployed backend runtime code (codeId, profile, kind). |
| `GET /admin/account?accountId=…` | One account: full billing + resolved plan/limits + AI remaining + (if it's also an app) its runtime info. |
| `POST /admin/account` | Adjust an account: `{ accountId, planId?, overrides?, aiCreditUsedUsd? }`. Patch semantics. |

**Per-account overrides** (`overrides`) layer custom limits over the base tier —
this is how Enterprise deals, comped users, and manual grants are expressed
(`resolvePlan(planId, overrides)` merges them). Setting `aiCreditUsedUsd: 0`
effectively re-grants the month's bucket. Unknown `planId` → `400` (only the known
tiers or `"custom"` are accepted).

> There is also a control-plane `/billing/account` endpoint (same read/patch
> shape) gated by `X-Internal-Secret` — used by the payment webhooks and internal
> tooling, never tenant-reachable.

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

See [backend-runtime.md](backend-runtime.md) for the `ctx` gateway surface and
[invariants.md](invariants.md) for the *provable* (vs metered) guardrails.
