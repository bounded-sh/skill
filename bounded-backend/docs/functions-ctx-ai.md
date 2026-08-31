# ctx.ai - real AI, no API keys

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

**If your app needs an LLM, you do not need an OpenAI/Anthropic key or endpoint.**
Bounded is your AI router. Call `ctx.ai.run(model, input)` inside any function: it
routes through the Bounded AI Gateway, billed to the **app owner's**
AI/external-services bucket, and
**capped fail-closed** (over budget → the call is denied, never a surprise bill).
This is the difference between an app that *actually reasons* and one that fakes it
with templated strings — reach for `ctx.ai`, not `Math.random()`.

```ts
// functions/scout.ts — real inference, zero keys
export default async function (args, ctx) {
  const operationId = `scout:${args.deskId}:${args.id}:v1`;
  const out = await ctx.ai.run("claude-opus-4-8", {        // any model the gateway routes
    messages: [
      { role: "system", content: "You are a markets analyst. Return ONE JSON thesis." },
      { role: "user", content: args.headlines },
    ],
  }, { idempotencyKey: operationId });
  const text = out.response ?? out.choices?.[0]?.message?.content;
  await ctx.bounded.set(`desks/${args.deskId}/theses/${args.id}`, JSON.parse(text));
  return { ok: true };
}
```

- **Contract:** `ctx.ai.run(model: string, input: any, options: {
  idempotencyKey: string }): Promise<any>`. The key is required and must be a
  1–256-byte UTF-8 string. `model` is
  config (swap models with no code change); `input` is the provider request shape
  (`{ messages: [...] }` for chat).
- **Model ids — LOOK THEM UP, never guess.** The platform admits and prices
  models from **Cloudflare's AI Gateway catalog**; a model absent from it
  refuses with `ai_model_price_unavailable` (400) before any provider work or
  charge. The authoritative, always-current list is
  <https://developers.cloudflare.com/ai-gateway/supported-models/> — fetch it
  (the page has a "View as Markdown" export) whenever you are about to write a
  `ctx.ai.run` call and are not certain the id exists, and use the id exactly
  as listed. Do NOT trust model names from training memory: providers rename
  and retire ids faster than any documentation snapshot, and a plausible-
  looking id that is not in the catalog fails every call.
- **Id shapes.** Bare ids for well-known families normalize automatically
  (`claude-*` → `anthropic/`, `gpt-*` → `openai/`, `grok-*` → `xai/`,
  `deepseek-*` → `deepseek/`, `kimi-*` → `moonshotai/`); `@cf/...` ids are
  Cloudflare-hosted. Known-good, verified live 2026-08-08: `gpt-5.6-luna`
  (cheapest frontier), `gpt-5.6-sol`, `claude-opus-4-8`, `claude-sonnet-5`,
  `claude-haiku-4-5`, `xai/grok-4.5`, `deepseek/deepseek-v4-pro`,
  `moonshotai/kimi-k3`, `@cf/zai-org/glm-5.2` — treat this list as examples,
  not the catalog; the URL above is the catalog.
- **Make the key a business operation, not an invocation.** AI operation keys
  are **app-global** across function names, principals, manual/scheduled paths,
  and retries. Include the callsite/entity/revision when work may intentionally
  differ, for example `prospect:<id>:assessment:v2`. The same key and exact
  model/input/actor replay the stored terminal result without another provider
  call or charge. Reusing it with changed model/input/actor/kind returns `409
  ai_operation_idempotency_conflict`.
- **Direct invokes need outer replay provenance too.** A browser/server call to
  the function must supply an HTTP `Idempotency-Key` in the invoke options;
  scheduled/system calls already carry stable provenance. Without replay-safe
  provenance, a cost-bearing `ctx.ai`/`ctx.services` call fails `503` before
  billing or provider contact.
- **Billing is pinned at admission.** The operation stores its exact model price
  row and pricing-table timestamp before reserving an upper bound. Success
  settles exact reported usage plus the documented 5% and releases the rest;
  cache reads cost 0.1× input, five-minute cache writes 1.25×, and one-hour cache
  writes 2×. A pricing rollover during the call cannot change its settlement.
  Missing/unpriceable usage or an ambiguous provider-started outcome becomes a
  durable `503 ai_operation_attention_required`; it is never guessed, refunded,
  or rerun as fresh provider work. Confirmed pre-provider/provider failures are
  refunded and replay their terminal error.
- **Model ids:** both provider-prefixed ids (`anthropic/claude-sonnet-5`,
  `openai/...`) and Workers-AI ids (`@cf/zai-org/glm-5.2`) route through the
  gateway. If a provider-prefixed id returns *"provider models not enabled for
  this gateway"*, that deployment's provider allowlist is off — fall back to an
  `@cf/*` model and report it. Avoid dated `@cf` model ids from memory; Workers
  AI deprecates them (a 5028 "deprecated" error means pick a current one).
- **Cap it provably.** The per-account AI/external-services bucket is the platform ceiling. For a
  *per-user* / *per-app* AI budget you can prove, write an append-only spend event
  under a `rollingSum` in the same flow (the
  [spend-cap recipe](invariants.md#rollingsum--caps-over-time-windows)) — so "this
  desk spends ≤ $X/day on reasoning" is an invariant, not a hope.

### How your user pays for it — route through Bounded, don't hand-roll

AI/external-services credit is **per-account** (the app owner). Two things to wire and to tell the user:

1. **Use the owner's Bounded account.** Wallet/keypair owners should run
   `bounded link` to attach the owner key to a web account (also the day-one
   key-safety step). Web-account owners should run `bounded account use --web`
   and `bounded login --email ...`. Billing and buckets live on that account.
2. **Top up through Bounded** — never a custom checkout:
   - Stripe: `POST /billing/checkout { kind: "services_topup" }` -> redirect the user to the returned `url`.
   - Crypto (USDC on Solana): `POST /billing/x402/intent` -> pay -> `POST /billing/x402/settle`.
   - Free includes up to $3 of metered AI/external-services usage per rolling 30 days, shared by Build, `ctx.ai`, and `ctx.services`; it allows one Build at a time and cannot top up.
   - Pro ($25/mo) gifts $5/month of AI/external-services credit and $30/month of Bounded infra credit; Team ($99/mo) gifts $20/$100. AI Build consumes the same measured bucket. Top-ups require Pro-or-better.

   Full rails, amounts, and webhooks: [billing.md](../../bounded/docs/billing.md). **If your app
   charges *its own* users for anything, route that through Bounded billing too** —
   don't build a parallel payment page that bypasses the metered, fail-closed ledger.

> The same `ctx.ai` powers AI NPCs / AI players in live rooms (funded via
> `session.live.runAs`); that live-tick path is in [ai-npcs.md](ai-npcs.md). The
> function path above is the **general case for any app**.

### ctx.ai media generation — images (sync) and video (async jobs)

`ctx.ai` also generates **images and video natively** — same no-keys posture,
same fail-closed per-call billing (a per-image / per-second ceiling is reserved
before generation; the actual is settled and the difference refunded; every
failure refunds in full). **Never wire an image/video provider with `fetch` +
your own key — this is built in.**

```ts
// IMAGE — synchronous (seconds). Default model needs zero config.
export default async function makeAvatar(args, ctx) {
  const img = await ctx.ai.generateImage({
    prompt: args.prompt,                    // required
    // REQUIRED, and app-global FOREVER: include a per-request discriminator
    // (here args.requestId), or this user's SECOND avatar - a new prompt under
    // the same key - is refused 409 ai_operation_idempotency_conflict rather
    // than generated. Only a genuine RETRY of the same request should reuse it.
    idempotencyKey: `avatar:${ctx.user.id}:${args.requestId}`,
    destinationPath: "avatars",             // a policy-declared type:"storage" collection
    // model?: "@cf/black-forest-labs/flux-2-klein-4b" (the default, FLUX.2, ~1¢)
    // size?, steps?, seed?, negativePrompt?, metadata? (declared fields)
    // returnBase64: true  — skip storage, get raw bytes back (≤8MB)
  });
  // img: { filePath, url?, contentType, model, costCents }
  await ctx.bounded.set(`profiles/${ctx.user.id}`, { avatar: img.filePath });
  return { avatar: img.filePath };
}
```

```ts
// VIDEO — an async JOB (generation takes minutes). Start it, then let the
// frontend live-subscribe to the mirror doc; or poll ctx.ai.getJob(jobId).
export default async function makeClip(args, ctx) {
  const { jobId, jobPath } = await ctx.ai.generateVideo({
    model: "replicate/wan-video/wan-2.7-t2v",  // always explicit for video
    prompt: args.prompt,
    // REQUIRED, app-global forever, and capped at 256 UTF-8 BYTES - never
    // interpolate a raw user prompt (a long one fails
    // ai_idempotency_key_required). Key the business operation instead.
    idempotencyKey: `clip:${ctx.user.id}:${args.clipId}`,
    durationSeconds: 8,                        // clamped to the model's max
    destinationPath: "clips",                  // policy-declared storage collection
    // jobPath?: "aiJobs" — declare aiJobs/$jobId in policy and the job status
    // mirrors there as a normal live-subscribable document
  });
  return { jobId, jobPath };                   // jobPath null if not declared
}
```

The essentials:

- **Images land as normal Bounded files** in the storage collection you name —
  queryable, read-rule governed. `filePath` is the durable reference; **persist
  that, not `url`** (a file in an anonymous-readable collection has a tokenless
  permanent URL; a gated file's url is a ~60-second signed link). Resolve fresh
  URLs via `getFiles`.
- **Video completes through a job doc**: `status` walks pending → running →
  succeeded/failed; on success the mp4 is at `filePath`. Declare
  `aiJobs/$jobId` (any non-storage collection) in policy and the frontend gets
  completion via ordinary `subscribe` — no polling loop. Jobs that stall are
  failed + **fully refunded** after a 15-minute timeout; terminal job records
  prune after ~7 days (the FILE is app data and is never pruned).
- **Models are config, not code.** Current lineup: images —
  `@cf/black-forest-labs/flux-2-klein-4b` (default, ~1¢), `flux-2-klein-9b`,
  Leonardo `lucid-origin`/`phoenix-1.0` (all keyless `@cf`), and
  `openai/gpt-image-2` (provider-routed); video —
  `replicate/wan-video/wan-2.7-t2v` (audio, 1080p, 2–15s) and
  `replicate/minimax/hailuo-02`. Provider-prefixed media models need the
  deployment's allowlist + media route (like chat's provider models); `@cf/*`
  image models work everywhere with zero config. An unpriced model is rejected
  403 (`ai_media_model_unknown`) — fail-closed, never a surprise bill.
- **Branchable errors:** `ai_content_moderated` (422, provider content policy —
  refunded), `ai_credit_exhausted` (402), `ai_media_route_missing` (403, the
  deployment hasn't enabled that provider). Catch `e.code`, don't regex messages.
- **Note:** media-priced models are rejected on `ctx.ai.run` (400,
  `ai_media_model_requires_media_api`) — chat's flat per-call billing would
  massively under-charge a diffusion model. Use `generateImage`/`generateVideo`.

