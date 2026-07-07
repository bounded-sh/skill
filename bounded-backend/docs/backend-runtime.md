# Backend Runtime

What's in here: when to use Bounded's hosted backend runtime instead of a short
function, the public project shape, and the `ctx` capabilities app code can rely
on.

Use backend runtime when an app needs:

- long-running or multi-step work,
- persistent agent state,
- schedules that coordinate repeated work,
- custom npm dependencies,
- AI calls through `ctx.ai`,
- managed third-party API calls through `ctx.services`,
- access to app data through `ctx.bounded`,
- secrets through `ctx.secrets`, or
- controlled outbound HTTP through declared hosts.

Use a normal Bounded function for short request/response tasks.

## Project Shape

Create a directory with a manifest and a TypeScript entry:

```text
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
  "dependencies": { "ms": "^2.1.3" },
  "allowedHosts": ["api.example.com"],
  "aiCapUSD": 1,
  "secrets": ["EXAMPLE_API_KEY"]
}
```

- `kind`: `"agent"` for `onInvoke`/`onSchedule`, or `"backend"` for a `fetch`
  handler served at the app's backend URL.
- `dependencies`: npm packages bundled for the backend runtime.
- `allowedHosts`: outbound `ctx.fetch` allowlist. Other hosts are denied.
- `aiCapUSD`: app-level spend cap for `ctx.ai`.
- `secrets`: names declared in the manifest. Set values with
  `bounded secret put`.

Use `bounded runtime init` to scaffold the current manifest format.

## Public `ctx` Surface

| Capability | Use |
|---|---|
| `ctx.bounded` | read/write the app's Bounded data under policy checks |
| `ctx.store.get/put` | store small app-scoped runtime state |
| `ctx.ai.run` | call AI models against the app/account spend controls |
| `ctx.services.search/describe/invoke` | discover and call Bounded-managed third-party APIs through the AI/external-services bucket |
| `ctx.secrets.get` | read declared app secrets |
| `ctx.fetch` | call allowed outbound hosts |
| `ctx.schedule` | schedule follow-up work |
| `ctx.identity` | read the acting user/service context |
| `ctx.log` | write tagged runtime logs |

Use `bounded services search "<query>" --json` and
`bounded services describe <toolkit-or-tool-slug> --json` while building to find
the right managed API/tool shape. Runtime code can also use
`ctx.services.search` and `ctx.services.describe` for agent planning. Use
`ctx.services.invoke` at runtime when Bounded manages that provider. Invoke is
cost-bearing, billed at the applicable upstream service cost plus 5%, and fails
closed when the app owner's AI/external-services bucket is exhausted. If a
provider is not enabled in the managed proxy, integrate it directly with
`ctx.fetch` and store the provider key in Bounded secrets.

Provider keys belong in Bounded secrets, not frontend code.

## Agent Entry

```ts
export default {
  async onInvoke(input, ctx) {
    await ctx.store.put("last-input", JSON.stringify(input));

    const apiKey = await ctx.secrets.get("EXAMPLE_API_KEY");
    const ai = await ctx.ai.run("model-id", {
      messages: [{ role: "user", content: "Summarize the latest job state." }]
    });
    const summary = ai.response ?? ai.choices?.[0]?.message?.content ?? "";

    const events = await ctx.services.invoke("SEAT_GEEK_SEARCH_EVENTS", {
      q: input.query ?? "basketball"
    });

    const response = await ctx.fetch("https://api.example.com/jobs", {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });

    await ctx.bounded.set("jobs/last", {
      ok: response.ok,
      summary,
      events: events.result
    });
    await ctx.schedule.every("poll", 60);

    return { ok: true };
  },

  async onSchedule(name, ctx) {
    ctx.log("schedule fired", { name });
  }
};
```

For `kind: "backend"`, export a `fetch` handler:

```ts
export default {
  async fetch(req, ctx) {
    return Response.json({ ok: true });
  }
};
```

## Boundaries

- Backend runtime code is ordinary imperative code, not formally proven.
- Writes through `ctx.bounded` still pass the app's policy rules and invariants.
- `allowedHosts` and `ctx.secrets` keep provider credentials out of frontend
  code.
- `ctx.ai` spends against the AI/external-services bucket and app-level caps.
  When a cap or bucket is exhausted, calls fail closed.
- `ctx.services.invoke` spends against the same AI/external-services bucket and
  uses the applicable upstream service cost plus 5%. Search/describe are catalog
  reads.
- For AI NPCs or agents that act in realtime rooms, also read
  [ai-npcs.md](ai-npcs.md) and [service-keys.md](service-keys.md).

## Long-Running Work

Do not run multi-minute jobs in a short function. Split long work into resumable
steps and schedule the next step after each successful checkpoint. Make each step
idempotent so retries are safe.

Recommended pattern:

1. Store job state in a Bounded collection or `ctx.store`.
2. Process a bounded amount of work per step.
3. Write progress before scheduling the next step.
4. Stop when complete or when the user's cap/bucket is exhausted.

## Deploy

Deploy backend runtime code with the Bounded CLI for an app you own:

```bash
bounded runtime init my-agent
cd my-agent
bounded runtime deploy --app-id <id>
bounded runtime info --app-id <id>
bounded runtime invoke my-agent --app-id <id> --data '{"name":"Amit"}'
```

Use the current CLI help for exact flags:

```bash
bounded runtime --help
```

## Related

- [functions.md](functions.md) — short functions
- [secrets.md](secrets.md) — provider keys
- [billing.md](../../bounded/docs/billing.md) — buckets and caps
- [agents-flue.md](agents-flue.md) — multi-step agent loop
