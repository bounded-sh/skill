# Flue Agents

What's in here: public guidance for building **Flue agents** on Bounded — durable,
multi-step AI agents that run through Bounded with sealed capabilities and stay
bounded by the app's usage limits.

Use a Flue agent when the backend needs an AI loop that can keep state, call tools,
read tool results, continue across turns, and use Bounded data / AI / secrets /
schedules / queues / managed third-party APIs — while every model call stays capped
by the app's spend limit.

## Authoring model (@flue/runtime 1.0)

A Flue agent is authored **declaratively**: your entry module default-exports an
`AgentDefinition` produced by `defineAgent(...)`. You no longer export a
`(ctx) => …` handler — the runtime drives the agent for you (an HTTP prompt or a
dispatch becomes a durable submission that runs a session).

```ts
import { defineAgent, defineTool } from "@flue/runtime";

export default defineAgent(({ id, env }) => ({
  // Model id is ALWAYS "provider/model-id" (the slash is required). The provider
  // prefix resolves to Bounded's gateway, so every call flows through env.ai
  // (AI_GW) and is bounded by the per-app spend cap. There is no raw provider key
  // in the isolate — the cap is inescapable.
  model: "anthropic/claude-haiku-4-5-20251001",
  instructions: "You are a helpful agent. Keep replies short.",
  tools: [greet],
}));
```

The initializer receives `{ id, env }`:

- `id` — this agent instance's id (the `:id` / session in the invoke URL).
- `env` — the **sealed Bounded capability env** (same names Bounded exposes to
  non-Flue backend code), each host-minted and sealed to your app:
  - `env.ai` — the one inference interface (spend-capped).
  - `env.store` — per-app key/value store.
  - `env.schedule` — durable scheduling.
  - `env.queue` — native background-job queue (`env.queue.send(...)` /
    `sendBatch`), the same primitive as `ctx.queue` for functions/backends.
  - `env.secrets` — app secrets (`env.secrets.get(name)`).
  - `env.services` — Bounded-managed third-party API proxy (billed like `env.ai`).
  - `env.bounded` — policy-enforced data writer (writes as your app's identity).
  - `env.identity` — the host-verified caller `{ user, address, email, service }`.

## Tools

Define tools with `defineTool({ name, description, input?, output?, run })` and list
them on the agent config. `input`/`output` are **valibot** schemas; `run(ctx)`
receives `{ input }` (the validated input) plus an optional abort `signal`. Define
tools **inside** the initializer so they close over the sealed `env`:

```ts
import { defineAgent, defineTool } from "@flue/runtime";
import * as v from "valibot";

export default defineAgent(({ id, env }) => {
  const greet = defineTool({
    name: "greet",
    description: "Greet a person by name.",
    input: v.object({ name: v.string() }),
    output: v.object({ text: v.string() }),
    async run({ input }) {
      // enqueue a durable background job (sealed to this app) via the captured env
      await env.queue.send({ kind: "greeted", name: input.name });
      return { text: `Hello, ${input.name}!` };
    },
  });

  return {
    model: "anthropic/claude-haiku-4-5-20251001",
    instructions: "Greet people using the greet tool.",
    tools: [greet],
  };
});
```

Wrap a managed third-party API as a narrow tool via `env.services.invoke`. Use
`bounded services search/describe --json` while building to discover tools;
`env.services.invoke` bills the app owner's AI/external-services bucket at the
upstream cost plus a small markup and fails closed when the bucket is exhausted.

## Deploy

Flue agents deploy through the Bounded backend runtime. Set the runtime profile to
`bounded-flue@2026.07` in `bounded.manifest`:

```json
{
  "name": "myagent",
  "kind": "agent",
  "entry": "index.ts",
  "runtime": "bounded-flue@2026.07",
  "aiCapUSD": 1,
  "allowedHosts": [],
  "dependencies": {}
}
```

```bash
bounded runtime deploy . --app-id <id>
```

Any npm `dependencies` you declare are pinned under Bounded's 7-day supply-chain
cooldown and bundled server-side into an immutable, SHA-pinned artifact.

## Invoke

The runtime drives an agent from a prompt shaped as `POST /agents/:name/:id` with a
JSON body `{ "message": "..." }`. `:id` pins the conversation/session. With
`?wait=result` the terminal result comes back inline
(`{ result: { text, model, usage }, submissionId, ... }`); without it you get
`202 { streamUrl, offset, submissionId }` and read events from the stream URL.

The simplest way to invoke — the CLI attaches the app-scoped session token and
targets the runtime host for you:

```bash
bounded runtime invoke myagent --app-id <id> --data '{"message":"ping"}'
# -> { "result": { "text": "pong", "model": { "id": "claude-haiku-4-5-...", ... } } }
```

Invoking over raw HTTP requires an app-scoped auth token (the same identity
`bounded data` uses); the CLI is the supported path for calling your own agent.

## Model calls and the spend cap

Model ids are `provider/model-id` (e.g. `anthropic/claude-haiku-4-5-20251001`,
`openai/gpt-4.1`). Every model call — `prompt`, tool loops, sub-agents — routes
through `env.ai` (the host AI gateway), which debits the per-app AI/external-
services bucket **before** inference and fails closed when the cap or free-trial
pool is exhausted. There is no model path that bypasses the cap.

## Related

- [backend-runtime.md](backend-runtime.md)
- [functions.md](functions.md)
- [billing.md](../../bounded/docs/billing.md)
- [secrets.md](secrets.md)
