# The capability ladder and the x402 relay

**What's in here:** how to resolve every requested capability (native, x402 relay, or call it out), what counts as a forbidden dependency, and how to use the relay from a function. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## The capability ladder

For EVERY capability the user asks for, resolve it in this order and never
skip to a workaround. The catalog tells you which rung you are on: every
`bounded services search` item carries a readiness of `live`, `callable`, or
`requestable`.

1. **Native or live first.** Does the runtime provide it? `ctx.ai` (LLMs,
   images, video — no keys), `ctx.email`, files, auth, collections, direct
   crypto and provider payment rails, embedded wallets and DEX/token plugins,
   data/auth/realtime/files/functions. Or is it a **live** catalog action?
   `bounded services search "<need>"`, then `bounded services describe <slug>`,
   then author the code that calls `ctx.services.invoke("<slug>", args,
   { idempotencyKey })` under the app's `service:cap` grant. Route to
   **bounded-backend**, **bounded-frontend**, **bounded-onchain** for the
   mechanics. One exception for oApps: an `onchain: true` COLLECTION is not
   Openable yet (`oapp_opening_onchain_policy_unsupported`) — see "oApps are
   mainnet apps" in [lifecycle.md](lifecycle.md#oapps-are-mainnet-apps).
   Embedded wallets, payments, and plugin calls are unaffected.
2. **Callable through x402 second.** No native integration, but the
   counterparty prices itself with [x402](https://www.x402.org) (HTTP 402
   payment-required, machine-to-machine)? The catalog marks it `callable`, and
   Bounded pays that API per call **on the app's behalf** with no approval
   step, through `ctx.services.invoke("X402_FETCH", ...)` under the app's
   `service:x402` grant — see the next section.
3. **Request it, then call it out.** Neither exists? File it once,
   platform-wide: `bounded services request "<what you need>"`. A steward
   reviews it, and the Hub emails you when it is live; follow it with
   `bounded services status`. Then say so, plainly, BEFORE building around
   it, and build the compliant version without it. Do not quietly wire a
   dependency that a person controls. A brain running an opened app climbs
   the same ladder on its own (`search_capabilities`, `describe_capability`,
   `request_capability`, `capability_request_status`), and a request that
   later goes live reaches its next run through the observation lane.

Two grants make the ladder real for an opened app, and Open requires both in
the creator policy's `boundaries.egress` allow list: `service:cap` (live
catalog actions) and `service:x402` (the relay). `bounded oapp preflight`
reports them as missing before Open refuses on them; the constitution's tools
section says the same thing in prose.

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
// res.paid === "verification_pending" means the provider response arrived,
// but finalized settlement still belongs to the recovery lane;
// res.chargedMicroUsd = price × 1.05 markup + the flat tx-fee surcharge.
// Unsupported or unsafe payment terms return a stable public error without
// reflecting the provider's raw demand.
```

Semantics to design around: the endpoint is probed unpaid first (non-402
responses pass through for a flat routing fee); a 402 quoting Solana USDC —
either the standard x402 `X-PAYMENT` dialect or Bounded's own intake dialect —
is authorized from the relay wallet and retried with proof; anything else is a
call-out. A failure before signing, submission, or provider disclosure may
return the reserved app charge immediately. After a transaction is submitted
or a signed authorization is disclosed, Bounded never guesses that payment did
not happen and never automatically refunds from an HTTP result.
The exact operation remains held until independent finalized chain evidence
proves settlement, an exact failed transaction, or complete absence after the
signed blockhash is invalid on both recovery RPCs.
Provider receipts and transaction hints are accelerators only, never settlement
truth. Retry or reconcile the same operation after an ambiguous response; do
not create a replacement call or payment.
Discovery: `ctx.services.search("x402")` / `describe("X402_FETCH")`. The relay
is enabled on staging and production; it is environment-gated only in the
sense that a local stack without the relay describes the tool as disabled.
When `describe` reports it disabled where you run, treat the feature as
ladder-step-3 and flag it as "unblocks when the x402 relay is enabled".
`X402_FETCH` is not oApp-only: any app whose egress carries `service:x402`
may use it.

When designing: if a needed service advertises x402 support, note it as
"relay-eligible" in your plan and budget its per-call price + surcharge into
the app's running costs.

