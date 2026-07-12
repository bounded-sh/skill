---
name: oapps-fun
description: >-
  Build an app destined for oapps.fun (an oApp): the zero-secrets discipline,
  why every capability must be steward-owned ("if Bounded can't do it, you
  can't do it"), how to call out unsupported capabilities honestly, and the
  x402 relay fallback for services Bounded doesn't natively provide. Use
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

When designing: if a needed service advertises x402 support, note it as
"relay-eligible" in your plan and budget its per-call price + surcharge into
the app's running costs. If the relay capability hasn't reached your runtime
surface yet, treat the feature as ladder-step-3 (call it out) and flag it as
"unblocks when the x402 relay covers this counterparty".

## Practical checklist before launch

- `policy.json` contains **no** rule, function, or egress that depends on a
  user-held credential; `bounded verify` passes.
- Functions use `ctx.ai` / `ctx.services` / `ctx.bounded` only — no fetches to
  key-authenticated endpoints.
- Every external egress is declared and either credential-free, native, or
  relay-eligible.
- Running costs (AI spend, service calls, relayed calls + surcharge) are
  sane against the app's expected build-fund inflow — out of budget means
  frozen, and you should be able to say at what usage level that happens.
- Anything you had to rule out is in your handoff to the user, with the
  reasoning, not silently dropped.
