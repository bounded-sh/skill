---
name: oapps-fun
description: >-
  Build an app destined for oapps.fun (an oApp): the zero-secrets discipline,
  why every capability must be steward-owned ("if Bounded can't do it, you
  can't do it"), how to call out unsupported capabilities honestly, the
  x402 relay fallback for services Bounded doesn't natively provide, and the
  lifecycle: private bounded.page development, graduation (source and
  boundaries go public), and the <slug>.oapps.fun address at token launch. Use
  whenever a user says the app will launch on oapps.fun, become an oApp,
  be community-owned / token-governed, or "outlive its creator". Part of the
  Bounded skill family; the mechanics live in bounded-backend / bounded-onchain.
---

# Building for oapps.fun (oApps)

An **oApp** is an app that outlives its creator: it launches on
[oapps.fun](https://oapps.fun), gets a token, a build fund, and a community
that governs it. Bounded is the steward that operates it. The full standard is
at [oapps.org](https://oapps.org); the operational story is at
[oapps.fun/under-the-hood](https://oapps.fun/under-the-hood).

Everything in this skill follows from one design goal:

> **The creator must not be able to rug the app.** Not "promises not to" —
> structurally can't.

As steward, Bounded's job is to remove every dependency a person could hold
over the app. If any capability rides on a credential, account, or server that
a human controls, that human can kill or hostage the app no matter what the
token says. So for oApps:

- **Everything must be Bounded-owned.** Hosting, data, auth, payments,
  wallets, onchain access, AI — all provided by the runtime, billed to the
  app's own buckets, governed by its proven policy.
- **Zero secrets.** The app carries no API keys, no vendor accounts, no
  credentials in anyone's drawer. Most apps simply never need one.
- **If Bounded can't do it, you can't do it.** This is the rule, and it is a
  feature: a smaller app nobody can kill beats a bigger app with a kill switch.

## The lifecycle: local → bounded → oapps.fun

An oApp passes through three addresses. Know which one you are at.

**1. Local.** You build in a normal repo. Nothing is deployed, nothing is
public.

**2. Bounded (development).** Promote the app: `bounded init`,
`bounded verify`, `bounded deploy`, `bounded site deploy dist`. At creation
the app claims a slug derived from its name plus a random suffix, e.g.
`myapp-x7k2.bounded.page`. That is a development address, not an oapps.fun
address. There is no oapps.fun URL until the token launches.

While building, keep the site **private** (`sitePrivate`, set via the
dashboard or API). The platform serves a sign-in gate to everyone else, and
`bounded site preview` mints short-lived view links when you need to show
someone. Do not flip it public yourself: the graduation ritual seals the site
private, and its "let go" step is what makes it public.

**3. oapps.fun (launched).** At token launch the app's slug becomes its
canonical public address: `<slug>.oapps.fun`. One token, one URL. The
bounded.page slug stays live forever as the always-works fallback. The slug
is renameable BEFORE launch (slug API or dashboard), so pick the name you
want the token to live at while you still can. After launch the pointer is
governance-controlled, not yours.

**Boundaries come first, not last.** Write `policy.json` boundaries early,
while you build, not as a launch chore. They are the single most important
trust artifact reviewers and buyers will read alongside your source. An app
whose money and state rules are proven invariants graduates cleanly. An app
with ad-hoc checks in function code reads as a rug risk.

## What graduation publishes (read before you let go)

Graduation is the point of no return. Spell these implications out, in this
order, before starting the graduation ritual. This is what you are agreeing
to:

1. **Your source code becomes public.** Anyone can read it at
   `<your-host>/__bounded/source` and download the whole tree as
   `source.zip`. Forever.
2. **Your boundaries are published.** The `policy.json` rules, proven before
   every deploy, appear at `/__bounded/boundaries`. They are part of your
   public safety story, and the first thing a careful buyer reads.
3. **Your code freezes** from graduation until the first governed build. No
   changes of any kind in between.
4. **A public DYOR window precedes the token launch.** Anyone can inspect the
   source, ask questions, and REPORT the app. 5 distinct reports hold the
   launch at T-0 for steward review, with a public halt log.
5. **The fee split is fixed:** 50 treasury / 20 creator / 20 steward /
   10 platform. Nobody gets pre-launch tokens. Not you, not the steward, not
   the platform.
6. **Automated integrity scans run** at submission and over time. A failed
   scan halts the launch, publicly.

The DYOR window makes source sync load-bearing: the public source page serves
what the platform has synced, so deploys must push source artifacts. Cloud
source sync is opt-in. Fresh live-edit registrations default `artifacts` and
`artifactPush` off. An oApps-bound app must enable both:

```sh
bounded live-edit register --app-id <appId> --repo . \
  --origin https://<slug>.bounded.page \
  --artifacts on --source-provider artifacts --artifact-push on
```

Do not set `liveEdit.artifacts: false` or `liveEdit.artifactPush: false` on an
oApps-bound app. The public source page will stay empty until the platform has
synced source.

## The capability ladder

For EVERY capability the user asks for, resolve it in this order and never
skip to a workaround:

1. **Native first.** Does the runtime provide it? `ctx.ai` (LLMs, images,
   video — no keys), `ctx.services` (Bounded-managed third-party APIs; list
   them with `bounded services`), payments (Bounded Pay, crypto rails),
   onchain (Solana/EVM collections, embedded wallets, DEX/token plugins),
   data/auth/realtime/files/functions. Route to **bounded-backend**,
   **bounded-frontend**, **bounded-onchain** for the mechanics.
2. **x402 relay second.** No native integration, but the counterparty prices
   itself with [x402](https://www.x402.org) (HTTP 402 payment-required,
   machine-to-machine)? Bounded can pay that API per-call **on the app's
   behalf** — see the next section.
3. **Call it out.** Neither exists? Say so, plainly, BEFORE building around
   it. Do not quietly wire a dependency that a person controls.

### What "calling it out" looks like

When a requested capability fails the ladder, tell the user:

- **What** can't be done and **which** dependency it would require
  (e.g. "live shipping rates need a carrier API we don't provide natively and
  that doesn't support x402").
- **Why** the rule exists: as steward, Bounded must ensure no individual —
  including you, the creator — holds a lever that can rug the app once the
  community owns it. A key in your name is exactly such a lever.
- **The nearest compliant alternative** (a native service, an x402-priced
  competitor, a reduced feature, or a manual/off-app step).

Then build the compliant version. Never "temporarily" add a user-held secret
to an oApp — the whole point of launch is that the frozen rules and the
runtime are the only trust surface.

### What counts as a forbidden dependency

- API keys or tokens the creator obtained from a vendor (even via
  `bounded secret set` — secrets are fine for private apps, not for oApps
  whose pitch is that no person is a dependency).
- External databases, servers, cron boxes, webhooks, or oracles the creator
  (or any individual) operates.
- Vendor accounts billed to a person (Stripe keys, RPC providers, mail
  providers, etc.) — the Bounded-managed equivalents exist for a reason.
- "Deploy hooks" or admin backdoors reachable only by the creator.

Credential-free public endpoints are not a rug vector, but they still need to
be declared egress and they are an availability risk — prefer native services,
and mention the risk when you use one.

## The x402 relay (the escape hatch that keeps the rule honest)

"If Bounded can't do it, you can't do it" stings less as Bounded's surface
approaches "everything". The x402 relay is how gaps get covered without
reintroducing personal keys:

- Bounded operates **one admin-funded relay wallet on Solana** (primary rail).
  When a third-party API supports x402, the steward pays it per-call from that
  wallet on the app's behalf. The app itself still holds nothing.
- **Metering:** each relayed call debits the app's **service bucket** exactly
  like measured AI spend, **plus a small surcharge that covers the payment
  transaction fee** (the send-tx costs real lamports; the app's budget carries
  it, not the platform). Price relayed features accordingly.
- **Fail-closed:** app bucket empty → that app's relay calls stop. Relay
  wallet empty → all relay calls stop until admins top up (balance alerts +
  an admin-console panel watch it). Nothing overdrafts; apps freeze, they
  don't die.
- **Trust surface unchanged:** the relay is steward infrastructure — the same
  single trusted (and replaceable) party as the rest of the runtime. No third
  party gets a key to the app.

### Using the relay from a function

The relay is a standard services tool. From any hosted function:

```ts
const res = await ctx.services.invoke("X402_FETCH", {
  url: "https://api.vendor.com/v1/thing", // https only; auth headers are rejected — that's the point
  method: "GET",                           // or POST + body (≤64KB)
  maxUsd: 0.25,                            // refuse to pay more than this per call (platform hard-cap applies)
});
// res.paid === true → res.result.{status,body} is the paid response;
// res.chargedMicroUsd = price × 1.05 markup + the flat tx-fee surcharge.
// A 402 in a scheme we don't support returns error "no_supported_payment_scheme"
// with the provider's demand attached — surface that to the user, don't work around it.
```

Semantics to design around: the endpoint is probed unpaid first (non-402
responses pass through for a flat routing fee); a 402 quoting Solana USDC —
either the standard x402 `X-PAYMENT` dialect or Bounded's own intake dialect —
is paid from the relay wallet and retried with proof; anything else is a
call-out. Charges are refunded in full whenever the paid retry never delivered.
Discovery: `ctx.services.search("x402")` / `describe("X402_FETCH")`. The tool
is environment-gated (`x402_relay_disabled` means the relay isn't enabled
there yet) — when disabled, treat the feature as ladder-step-3 and flag it as
"unblocks when the x402 relay is enabled".

When designing: if a needed service advertises x402 support, note it as
"relay-eligible" in your plan and budget its per-call price + surcharge into
the app's running costs.

## Practical checklist before launch

- Boundaries were written early and cover the app's money and state rules as
  proven invariants, not ad-hoc checks. They are the trust artifact buyers
  read alongside your source.
- `policy.json` contains **no** rule, function, or egress that depends on a
  user-held credential; `bounded verify` passes.
- Functions use `ctx.ai` / `ctx.services` / `ctx.bounded` only — no fetches to
  key-authenticated endpoints.
- Every external egress is declared and either credential-free, native, or
  relay-eligible.
- The site is private (`sitePrivate`) and stays that way; graduation's
  "let go" step does the public flip, not you.
- Source sync is explicitly on (`artifacts` and `artifactPush` are true):
  `/__bounded/source` shows the current tree, not an empty page.
- The slug is the name the token should live at (`<slug>.oapps.fun`); rename
  it before launch if it isn't.
- Running costs (AI spend, service calls, relayed calls + surcharge) are
  sane against the app's expected build-fund inflow — out of budget means
  frozen, and you should be able to say at what usage level that happens.
- Anything you had to rule out is in your handoff to the user, with the
  reasoning, not silently dropped.
