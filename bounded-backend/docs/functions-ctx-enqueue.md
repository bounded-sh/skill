# ctx.enqueue - background jobs

**What's in here:** one capability of the function `ctx` API, split out of
[functions.md](functions.md) so a function that does not use it never loads it.
Declaring, writing, invoking and deploying a function are in [functions.md](functions.md).

When a function should kick off work that shouldn't block the caller — fan-out,
a slow follow-up step, a ret-on-failure pipeline — use `ctx.enqueue`. It schedules
a **separate, later** invocation of a deployed function and returns immediately:

```ts
export default async function placeOrder(args, ctx) {
  await ctx.bounded.set(`orders/${args.id}`, { status: "pending", buyer: ctx.user.id });

  // Hand the slow work off to a background job — returns right away.
  const { jobId } = await ctx.enqueue("fulfillOrder", { orderId: args.id });

  // Optionally schedule a delayed retry/reminder (up to 24h out).
  await ctx.enqueue("checkOrderStuck", { orderId: args.id }, { delaySeconds: 3600 });

  return { ok: true, jobId };
}

// Runs LATER as the null SYSTEM principal (ctx.user.id == null, ctx.auth.system == true) -
// a queued replay is NEVER deputized as the enqueuer. The target must opt in with
// `queueCallable: true` in policy (below); pass any identity the job needs through the
// payload (it arrives as `args`), not via ctx.user.
export default async function fulfillOrder(args, ctx) {
  // ctx.user is the null system principal here - the OBJECT is still there, with
  // `id: null`, so gate on `ctx.user.id`, never on `ctx.user` itself. args.orderId +
  // args.buyer came from the enqueuer's payload; do NOT read the caller from ctx.user.
  const order = await ctx.bounded.get(`orders/${args.orderId}`);
  // ... do the slow work, write results through ctx.bounded (as system) ...
  await ctx.bounded.set(`orders/${args.orderId}`, { ...order, status: "fulfilled" });
}
```

The queued target must declare `queueCallable: true` in its policy `functions` entry.
This is the explicit opt-in that authorizes a system-principal background run; a target
that has not opted in has its queued replay dropped (fail-closed):

```jsonc
{
  "functions": {
    "placeOrder":  { "auth": "@user.id != null", "entry": "functions/placeOrder.ts" },
    "fulfillOrder": {
      "auth": "false",              // no human may call it directly
      "entry": "functions/fulfillOrder.ts",
      "queueCallable": true          // ...but it MAY run as a queued background job
    }
  }
}
```

- **Contract:** `ctx.enqueue(functionName: string, payload?: unknown, opts?: { delaySeconds?: number }): Promise<{ jobId }>`.
- **What it runs:** `functionName` must be a **deployed function in this app** (a
  function may enqueue another function or itself; validated at enqueue time).
- **How it runs:** a queued replay is **never deputized as the enqueuer** — it runs as the **null system principal** (`ctx.user` is `{ id: null, address: null, email: null, system: true }`, `ctx.auth.system == true`, and every `@user.*` resolves to null), regardless of who enqueued it.
  Because the human `auth` rule is written against a real caller, it cannot authorize a null-user run, so the queued lane instead requires the **target** to opt in with `queueCallable: true` in its policy `functions` entry.
  A target that has not opted in is **rejected fail-closed**: the queued message is dropped (a `function_failed` analytics event is emitted for operators) and the human `auth` rule is never evaluated under a null user.
  Pass any caller identity or context the job needs through the `payload` (it arrives as `args`); do **not** expect the enqueuer in `ctx.user`.
  `ctx.bounded` writes from the queued run still pass your `rules` + invariants as the system principal.
- **Public-origin restriction:** `queueCallable` authorizes **trusted** callers (a cron/heartbeat schedule, an internal run, or a user-authenticated function) to drive a system-principal background run - it does **not** authorize the anonymous internet.
  A queued job that **descends from public ingress** (it was enqueued by a `browser`- or `webhook`-public function, or by any descendant of one) is **refused fail-closed** at replay even when the target declares `queueCallable: true`: the message is dropped and a `function_failed` analytics event is emitted, mirroring the build ban on public-origin runs.
  This prevents an anonymous caller from laundering public ingress into a full system-principal run through your enqueue code.
  If a public-facing function needs to trigger background work, do that work inline in the function (still under its own `auth` rule), not by enqueuing a system-principal job.
- **Delivery:** at-least-once, with Cloudflare-managed retries and a dead-letter
  queue. **Make enqueued functions idempotent** so a retry is safe.
- **Limits:** `payload` must be JSON-serializable and ≤ 96,000 UTF-8 bytes;
  `delaySeconds`
  is 0..86400 (24h). One invocation may emit at most 50 enqueue intents.
- **Breadth budget:** each run also carries a bounded **fan-out breadth budget**
  that its descendant background jobs share, so one app cannot multiply itself
  into an unbounded queue backlog. A **single-successor chain** (enqueue one next
  step, e.g. a paginator/cursor loop) is free and runs unbounded; **fanning out to
  many children** spends the budget, and it shrinks for each further generation, so
  deep *recursive fan-out trees* are cut off. If a run tries to fan out beyond its
  remaining budget the whole enqueue drain is refused (the parent invocation
  surfaces a `429` with `enqueue_descendant_budget_exceeded`); the cross-host
  producer refuses with `enqueue_descendant_budget_unavailable`. The ceiling is
  generous - ordinary fan-out and chains are unaffected - so prefer chains over
  wide recursion for large workloads.
- **Billing:** each queued run is driven back through the normal `/invoke` path,
  so it **meters compute usage to the app's request ledger identically to an HTTP
  invocation** — background work is billed like foreground work.

