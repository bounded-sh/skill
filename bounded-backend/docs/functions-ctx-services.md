# ctx.services - managed API discovery and invoke

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

Use `ctx.services` when a function or agent needs a third-party API that Bounded
can proxy for the app. This is the managed path for "find the right API, inspect
its schema, then call it" without putting provider credentials in app code.

```ts
export default async function weather(args, ctx) {
  const catalog = await ctx.services.search("current weather", { limit: 5 });
  const docs = await ctx.services.describe("CAP_WEATHER_NOW");

  const now = await ctx.services.invoke("CAP_WEATHER_NOW", {
    lat: args.lat,
    lng: args.lng
  }, { idempotencyKey: `weather:${args.id}:now:v1` });

  await ctx.bounded.set(`weatherSnapshots/${args.id}`, {
    at: Date.now(),
    conditions: now.result
  });
  return { ok: true, catalog, docs };
}
```

Slugs are what `bounded services search --json` returns; the ones above are
illustrative. Never invent a slug: search first, then describe the exact slug
you will call.

### Readiness: live, callable, requestable, disabled

Every catalog item carries a `readiness`, and it decides what you can do today:

| readiness | Meaning | What to write |
|---|---|---|
| `live` | A managed action on Bounded. | `ctx.services.invoke("<slug>", args, { idempotencyKey })` |
| `callable` | An API that prices itself with x402 on Solana. Bounded pays it per call from the platform relay wallet; no approval, no key. | `ctx.services.invoke("X402_FETCH", { url, method, body, maxUsd }, { idempotencyKey })` using the item's `invocation.endpointUrl` |
| `requestable` | Known to the catalog but not on Bounded yet. | File it once: `bounded services request "<what you need>"`, then build without it |
| `disabled` | Bounded RUNS it, but it is switched off here: a steward turned the action off, or the platform holds no credential for the provider. `unavailableReason` says which. | Do not design around it and do not file a request - it already exists. Tell the operator what `unavailableReason` names, and build the path that does not need it |

A `disabled` item is deliberately still LISTED. An unconfigured provider used to
advertise itself as `live` and then answer `provider_key_not_configured` at
invoke; now the catalog says so up front.

`describe` of an unknown target answers `capability_not_supported` with a Hub
link. That is a real answer, not an outage: request it, do not fake it with a
personal key.

`X402_FETCH` is not oApp-only. Any app whose function egress carries the
`service:x402` grant may call an x402-priced API through it; the relay wallet
pays, the app's AI/external-services bucket is debited (price, a 5% markup,
and the flat transaction-fee surcharge), and the app itself holds no key. The
relay is live on staging and production; only a local stack ships with it off
(fail-closed), and `ctx.services.describe("X402_FETCH")` tells you which you
are on.

### Requesting a capability Bounded does not have

```sh
bounded services request "current weather for a lat/lng pair, refreshed hourly" \
  --title "Current weather by coordinates" --desired-action "Read current weather"
bounded services status                 # every request filed under this account
bounded services status cap_<id>        # one request
```

A request is filed under the signed-in account with the Capability Hub; a
steward reviews it, the platform activates it, and the Hub emails the
requester when it is live. Then the app uses it the only way anything gets
used: by code that calls the new slug. Requests replay on
`--idempotency-key`, scoped to your account, so a retried script files
nothing new.

### Async actions: `ctx.services.getJob`

Some actions are asynchronous (a video generation, a long report). `invoke`
returns a job instead of a result; poll it:

```ts
const started = await ctx.services.invoke("CAP_VIDEO_GENERATE", { prompt }, { idempotencyKey: `video:${args.id}` });
const job = await ctx.services.getJob(started.jobId);
// job.status: "pending" | "succeeded" | "failed"; job.result on success
```

`getJob` is a read on the app's own job, billed as the action's contract says,
and never re-runs the provider: a lost poll re-reads the same job.

- **Contract:** `ctx.services.search(query, { limit? })`,
  `ctx.services.describe(toolkitOrToolSlug, { limit? })`, and
  `ctx.services.invoke(toolSlug, args, { idempotencyKey: string; entityId? })`.
  The required key is a 1–256-byte UTF-8 string. `args` must be an immutable
  plain finite JSON object when provided (the whole argument may be omitted): no
  `undefined` inside it, non-finite numbers, `BigInt`, sparse
  arrays, accessors, cycles, class instances, `Date`, `Map`, or `Set`.
- **Replay/conflict:** service operation keys are app-global AND PERMANENT. The
  operation id is derived from the app id and your `idempotencyKey` alone, so a
  hard-coded key names ONE charge for the life of the app. The same key,
  normalized tool, effective entity, account, and exact snapshotted args replay
  one stored response. Changed tool/args/entity returns `409
  service_invoke_operation_conflict`; an in-flight duplicate returns retryable
  `503 service_invoke_in_flight`. Provider/charge/result-persistence ambiguity
  becomes permanent `503 service_invoke_outcome_unknown` and never calls the
  provider again. `entityId` defaults to the account id, is part of the
  fingerprint, and is also the provider billing entity.
  Give each logical operation its own key - `weather:${args.id}:now:v1`, not
  `weather` - so one unit of work is one charge.
- **A funding refusal is RETRYABLE with the same key.** A refusal that moved no
  money (`services_credit_exhausted`, `free_services_exhausted`,
  `subscription_inactive`, `billing_attention_required`) is not stored as the
  answer for that key: once the payer is funded, the same operation charges for
  real. Every other terminal answer still replays. A replayed one says
  `replayed: true`, and the error carries `detail` - the ledger's own refusal
  code behind the folded `services_credit_exhausted`, which is how you tell "no
  credit" from "no allocation" - plus `remainingMicroUsd` and
  `attemptedMicroUsd`.
- **CLI discovery:** during build, agents can run
  `bounded services search "<query>" --json` and
  `bounded services describe <toolkit-or-tool-slug> --json` to inspect the same
  managed catalog before writing function or agent code; both print each
  item's readiness, and `bounded services request` files what is missing.
- **Two use cases:** search/describe are for build-time and agent planning;
  invoke is the runtime tool call. A Flue agent can expose a small wrapper around
  `ctx.services.invoke` as one of its tools.
- **Billing:** search/describe are catalog reads. Invoke is cost-bearing and
  bills the app owner's AI/external-services bucket at the underlying service
  call cost plus 5%; for an oApp workload the payer is the app's own project
  bucket. The same fail-closed bucket/cap rules as `ctx.ai` apply.
- **Refunds:** tool/auth/admission failures happen before charge. After charge,
  confirmed non-OK transport/provider failures refund through their own
  idempotent operation. A lost refund confirmation is queued for retry and the
  persisted terminal response is replayed; caller retries never invoke or
  refund twice. A successful provider result that cannot be durably persisted
  is outcome-unknown, not permission to replay paid work.
- **Provider key UX:** if Bounded has not configured an upstream provider key for
  a selected provider, discovery still works but `invoke` throws
  `provider_key_not_configured` with a hint. Choose an enabled managed provider,
  ask Bounded to enable that provider, or integrate the provider directly with
  `fetch` and your own key in `ctx.secrets`.
- **Opt-out:** if you integrate a provider directly, you pay that provider
  directly and Bounded's managed proxy markup does not apply.

### Chain data toolkits: helius, alchemy — read-only, metered like every managed service

Onchain data lives in the same catalog. Two Bounded-local toolkits — `helius`
(Solana: JSON-RPC reads, DAS asset lookups and search, parsed transaction
history) and `alchemy` (EVM: JSON-RPC reads, token balances/metadata, transfer
history) — resolve through the same `search`/`describe`/`invoke` calls:

```ts
const acct = await ctx.services.invoke("HELIUS_RPC_CALL", {
  method: "getAccountInfo",       // read-only allowlist — writes are rejected
  params: [address, { encoding: "base64" }]
});
const bal = await ctx.services.invoke("ALCHEMY_TOKEN_BALANCES", {
  network: "base-mainnet",        // validated against Bounded's EVM network registry
  address: wallet
});
```

- **Read-only, enforced:** the RPC passthrough tools accept only an explicit
  allowlist of read methods (`getAccountInfo`, `getProgramAccounts` with
  filters, `eth_call`, `eth_getLogs` with a bounded block range, …).
  `eth_sendRawTransaction`, `sendTransaction`, and every signing or
  state-changing method is rejected fail-closed — unknown methods too. Sending
  transactions is a different plane (onchain collections), never this proxy.
- **Metered like every managed service:** each tool has a published provider
  cost (Helius credits / Alchemy compute units) billed to the app owner's
  AI/external-services bucket at cost + 5%, charged before the call and
  refunded if the provider errors. Same fail-closed 402
  (`services_credit_exhausted`) as the rest of `ctx.services`.
- **Rate-isolated per app:** bursty apps get a 429 `chain_data_rate_limited`
  instead of exhausting the shared provider plan.
- `describe("helius")` / `describe("alchemy")` list every tool with its input
  schema and per-call cost. For when to use these versus onchain collections
  and chain views, see the bounded-onchain skill's `chain-data.md`.

For transactional email, SMS, or WhatsApp, use a real provider integration and
keep provider keys in secrets. Do not expose a shared provider key or treat
Bounded Auth OTP as recipient consent for app-originated messages.

