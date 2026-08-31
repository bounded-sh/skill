# ctx.services - managed API discovery and invoke

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

Use `ctx.services` when a function or agent needs a third-party API that Bounded
can proxy for the app. This is the managed path for "find the right API, inspect
its schema, then call it" without putting provider credentials in app code.

```ts
export default async function sports(args, ctx) {
  const catalog = await ctx.services.search("sports odds", { limit: 5 });
  const docs = await ctx.services.describe("the_odds_api");

  const games = await ctx.services.invoke("THE_ODDS_API_GET_ODDS", {
    sport: args.sport ?? "basketball_nba",
    regions: "us",
    markets: "h2h"
  }, { idempotencyKey: `sports:${args.id}:odds:v1` });

  await ctx.bounded.set(`sportsSnapshots/${args.id}`, {
    at: Date.now(),
    games: games.result
  });
  return { ok: true, catalog, docs };
}
```

- **Contract:** `ctx.services.search(query, { limit? })`,
  `ctx.services.describe(toolkitOrToolSlug, { limit? })`, and
  `ctx.services.invoke(toolSlug, args, { idempotencyKey: string; entityId? })`.
  The required key is a 1–256-byte UTF-8 string. `args` must be an immutable
  plain finite JSON object when provided (the whole argument may be omitted): no
  `undefined` inside it, non-finite numbers, `BigInt`, sparse
  arrays, accessors, cycles, class instances, `Date`, `Map`, or `Set`.
- **Replay/conflict:** service operation keys are app-global. The same key,
  normalized tool, effective entity, account, and exact snapshotted args replay
  one stored response. Changed tool/args/entity returns `409
  service_invoke_operation_conflict`; an in-flight duplicate returns retryable
  `503 service_invoke_in_flight`. Provider/charge/result-persistence ambiguity
  becomes permanent `503 service_invoke_outcome_unknown` and never calls the
  provider again. `entityId` defaults to the account id, is part of the
  fingerprint, and is also the provider billing entity.
- **CLI discovery:** during build, agents can run
  `bounded services search "<query>" --json` and
  `bounded services describe <toolkit-or-tool-slug> --json` to inspect the same
  managed catalog before writing function or agent code.
- **Two use cases:** search/describe are for build-time and agent planning;
  invoke is the runtime tool call. A Flue agent can expose a small wrapper around
  `ctx.services.invoke` as one of its tools.
- **Billing:** search/describe are catalog reads. Invoke is cost-bearing and
  bills the app owner's AI/external-services bucket at the underlying service
  call cost plus 5%. Composio standard and pro-tool calls are itemized
  separately; the 5% Bounded markup is applied to whichever tier the tool uses.
  The same fail-closed bucket/cap rules as `ctx.ai` apply.
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

