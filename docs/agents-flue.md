# Flue Agents

What's in here: public guidance for using Flue-style multi-step agents inside a
Bounded app.

Use a Flue agent when the backend needs an AI loop that can:

- keep state,
- call tools,
- read tool results,
- continue across turns,
- use Bounded data, AI, secrets, and schedules, and
- stay bounded by the app's usage limits and buckets.

## Pattern

1. Model durable app state in Bounded collections.
2. Give the agent only the tools it needs.
3. Use `ctx.ai.run` for model calls so spend is capped.
4. Store external provider keys in secrets.
5. Make each tool action idempotent where possible.
6. Re-check usage after loops that may spend meaningful AI or service credit.

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
