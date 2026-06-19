# Backend code runtime — deploy functions & agents THROUGH Bounded

When a Bounded **function** (short, stateless, `fetch`-only) isn't enough — you
need **custom npm packages**, **persistent state between calls**, **an agent that
runs on a schedule**, or general backend HTTP — deploy a **backend project** to the
Bounded runtime. Your code runs on Cloudflare's edge **through us**: loaded into an
isolated Durable Object facet, with every capability handed to it as a **sealed,
metered, app-scoped** object. Your code never holds a raw credential or binding.

You still get what Bounded adds over raw Cloudflare: **one auth identity, a
fail-closed AI spend cap, an egress allowlist, version pinning, and billing** —
without a Cloudflare account, `wrangler`, or bindings of your own.

> This is the tier ABOVE `bounded functions`. See
> [functions-graduation.md](functions-graduation.md) for when to use which.

## The shape of a backend project

A directory with a `bounded.manifest` and a TypeScript entry:

```
my-agent/
  bounded.manifest
  index.ts
```

`bounded.manifest`:
```json
{
  "name": "my-agent",
  "kind": "agent",
  "entry": "index.ts",
  "runtime": "bounded-runtime@2026.06",
  "dependencies": { "ms": "^2.1.3" },
  "allowedHosts": ["api.example.com"],
  "aiCapUSD": 1.0
}
```
- `kind`: `"agent"` (has `onInvoke`/`onSchedule`) or `"backend"` (serves HTTP via `fetch`).
- `dependencies`: any npm packages. **Bundled server-side under a 7-day cooldown** —
  a version is only used if it was published ≥7 days ago (supply-chain protection;
  fail-closed). Pin loosely (`^`/`~`); we resolve + freeze the exact, transitive set.
- `allowedHosts`: the ONLY hosts your code may `fetch` (egress allowlist; everything
  else is denied 403, fail-closed). Subdomains of a listed host are allowed.
- `aiCapUSD`: the rolling spend cap (per day) for `ctx.ai`. Over it → calls are
  denied, never an unbounded bill.
- `runtime`: the immutable **profile** you're pinned to. Old projects stay on their
  profile when new ones ship; upgrades are opt-in.

`index.ts` — your code sees ONLY `ctx` (no raw bindings):
```ts
export default {
  // agent: a request -> response turn
  async onInvoke(input, ctx) {
    await ctx.store.put("last", JSON.stringify(input));          // per-app KV (namespaced)
    const who = ctx.identity;                                    // { user, address, email } (host-verified JWT)
    const ai = await ctx.ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { prompt: "hi" }); // spend-capped
    const res = await ctx.fetch("https://api.example.com/x");    // egress: allowlist + metered
    await ctx.schedule.every("poll", 60);                        // host-owned alarm -> onSchedule
    return { ok: true, last: (await ctx.store.get("last")).value };
  },
  // fires when a schedule you set comes due (the host owns the timer)
  async onSchedule(name, ctx) { /* ... */ },
};
```
For `kind: "backend"`, export `{ async fetch(req, ctx) { return new Response(...) } }`
to serve arbitrary HTTP at `https://<app>-api.bounded.page/...`.

### The `ctx` surface (all app-scoped + sealed)
| `ctx.x` | what it is |
|---|---|
| `ctx.appId` | your app id (sealed; you can't address another app) |
| `ctx.store.get/put` | per-app namespaced key/value |
| `ctx.ai.run(model, input)` | Workers AI, **fail-closed** spend cap (`aiCapUSD`) |
| `ctx.schedule.every(name, sec)` / `.at(name, epochMs)` / `.cancel(name)` | host-owned scheduling → `onSchedule` (facets can't `setAlarm`) |
| `ctx.fetch(url, init)` | outbound HTTP, **allowlist-gated + metered** |
| `ctx.identity` | `{ user, address, email }` — the verified caller |
| `ctx.log(...)` | tagged logging |

## Deploy + run (CLI)

```bash
bounded runtime init my-agent           # scaffold bounded.manifest + index.ts
cd my-agent
bounded runtime deploy --app-id <id>    # bundle (server-side, cooldown) + upload an immutable artifact
bounded runtime info   --app-id <id>    # show codeId, profile, manifest, resolved lockset
bounded runtime invoke my-agent --app-id <id> --data '{"name":"Amit"}'
```

Every deploy produces a new **immutable, content-addressed artifact** (`codeId` =
hash of the bundled content). A new upload = a fresh isolate; re-uploading identical
code is a no-op. You can't deploy under an app you don't own (owner/admin only).

## What's guaranteed (and what isn't)
- **Isolation**: your code can't reach another tenant's data, the host, or a raw
  binding — only the sealed `ctx`. Egress is allowlisted; AI is capped; a runaway
  can't run an unbounded bill or wedge the host.
- **Supply chain**: deps are pinned to versions ≥7 days old (cooldown) and frozen
  into the artifact; the edge re-verifies the cooldown before accepting an upload.
- **NOT proven**: unlike policy rules/invariants, your imperative code is **not
  formally proven**. Its *writes* to Bounded data still go through the proven
  boundary (invariants hold), but its own logic is ordinary code. Keep money-safety
  in **invariants**, not in backend code.
