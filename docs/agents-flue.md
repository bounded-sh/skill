# Flue Agents

What's in here: public guidance for using Flue-style multi-step agents inside a
Bounded app.

Use a Flue agent when the backend needs an AI loop that can:

- keep state,
- call tools,
- read tool results,
- continue across turns,
- use Bounded data, AI, secrets, and schedules, and
- use Bounded-managed third-party APIs as tools, and
- stay bounded by the app's usage limits and buckets.

## Pattern

1. Model durable app state in Bounded collections.
2. Give the agent only the tools it needs.
3. Use `ctx.ai.run` for model calls so spend is capped.
4. Use `ctx.services.search/describe` while building to find managed API tools,
   then wrap `ctx.services.invoke` as a narrow runtime tool.
5. Store external provider keys in secrets when a provider is not available
   through Bounded's managed proxy.
6. Make each tool action idempotent where possible.
7. Re-check usage after loops that may spend meaningful AI or service credit.

Example runtime tool wrapper:

```ts
async function sportsSearch(input, ctx) {
  return ctx.services.invoke("SEAT_GEEK_SEARCH_EVENTS", { q: input.query });
}
```

`ctx.services.invoke` bills the app owner's AI/external-services bucket at the
applicable upstream service cost plus 5% and fails closed when the bucket or
free-trial pool is exhausted. If it throws `provider_key_not_configured`,
discovery still works but that provider is not enabled for managed invocation;
choose another managed API or integrate the provider directly with `ctx.fetch`
and `ctx.secrets`.

## Deploy

Deploy with the Bounded backend runtime for an app you own:

```bash
bounded runtime deploy . --app-id <id>
bounded runtime invoke <agent-name> --app-id <id> --data '{}'
```

Use the runtime help for current flags:

```bash
bounded runtime --help
```

## Related

- [backend-runtime.md](backend-runtime.md)
- [functions.md](functions.md)
- [billing.md](billing.md)
- [secrets.md](secrets.md)
