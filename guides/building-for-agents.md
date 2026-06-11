# Building for Agents

The flow when **an agent owns a backend**: no human in the loop, no auth
ceremony, no dashboard. Generate a policy, prove it, deploy it, read and write —
all from one keypair the agent controls.

This is what Bounded is built for: an autonomous agent that needs a real,
provably-safe backend (a spend ledger, a task store, a multi-tenant data plane)
without a person clicking through a console.

## Why agents fit Bounded

- **Zero-ceremony identity.** The keypair *is* the account — no signup, no email
  verification. First command generates it.
- **Provable guardrails.** An agent's spend cap, conservation, or tenant
  isolation is a proven invariant, not a prompt instruction it can talk itself
  out of. A constraint-breaking write is a `409`, full stop.
- **One actor, one key.** The agent deploys and writes as the same identity; the
  policy decides what that identity may do.

## The end-to-end flow

```bash
# 1. Identity — created automatically; isolate it per agent
export BOUNDED_KEY_PATH="$AGENT_HOME/.bounded/key"     # or set HOME / BOUNDED_PRIVATE_KEY
bounded whoami                                          # prints the agent's address

# 2. Generate a policy from the task description (see the generation guide)
bounded init                                            # or write policy.json directly

# 3. Prove it — read counterexamples, fix, repeat until clean
bounded deploy ./policy.json --create --name agent-ledger   # creates app, prints <appId>
bounded verify ./policy.json --app-id <appId>               # PROVED / DISPROVED

# 4. Use it
bounded data set --app-id <appId> --path spend/s1 --data '{"amount":60}'
bounded data get --app-id <appId> --path spend
```

> Run each agent under a **distinct** `HOME` or `BOUNDED_PRIVATE_KEY` so
> identities don't collide. Never hand an autonomous agent a human's keypair.

## Designing the policy for an agent

The one step agents (and the humans prompting them) skip is **the
non-negotiables**. If the agent spends, model the cap as a `rollingSum`; if it
moves value, model `conserve`; if it serves multiple tenants, model `tenantTag`.
A policy that compiles but declares no invariant is *green but unprotected* —
the agent can then do anything its rules allow. Full method:
[../docs/policy-generation-guide.md](../docs/policy-generation-guide.md).

```json
{
  "spend/$entryId": {
    "fields": { "amount": "UInt" },
    "tier": "durable",
    "rules": {
      "read": "@user.address != null",
      "create": "@user.address != null",
      "update": "false",
      "delete": "false"
    },
    "invariants": [
      { "type": "rollingSum", "name": "spend_cap", "field": "amount",
        "windowSeconds": 3600, "limit": 100 }
    ]
  }
}
```

With this deployed, the agent can write spend entries freely — until the rolling
hour's sum would exceed 100, at which point the write rejects with
`409 spend_cap` and nothing commits. The cap is enforced atomically; there is no
read-check-write race for the agent to lose.

## Reading and writing: CLI or SDK

- **CLI** (`bounded data ...`) is the simplest path for a shell-driven agent —
  every operation is one command, `--json` makes output machine-parseable, and
  errors come back as JSON too. See [../docs/cli-reference.md](../docs/cli-reference.md).
- **SDK** (`@bounded/server`) suits an agent already running in Node: one
  `createWalletClient({ keypair })` gives typed `get` / `set` / `setMany` /
  `subscribe`-free reads, all signed by the agent's key. See
  [building-a-backend.md](building-a-backend.md).

Use `set-many` whenever correctness spans writes (a transfer, a guard + gated
write). One atomic batch is not a TOCTOU race; a sequence of `set`s is.

## Agent loop tips

- **`409` means back off, not retry-harder.** The state forbids the write; the
  same capped write will keep failing until the window ages out. Read the
  collection and sum the window before retrying. `403` means fix the
  caller/payload. ([../docs/data-plane.md](../docs/data-plane.md))
- **Capped collections are append-only.** Write each event with a fresh id;
  don't update or delete a `rollingSum` doc.
- **Propose invariants from schema shape.** Money-like fields → cap/conserve
  candidates; tenant-ish path vars → tenantTag. `bounded verify` renders these
  as questions; let a human arbitrate when one is available.

## Related

- [../docs/policy-generation-guide.md](../docs/policy-generation-guide.md) — turning the task into a provable policy
- [../docs/cli-reference.md](../docs/cli-reference.md) — every `bounded data` command
- [building-a-backend.md](building-a-backend.md) — the `@bounded/server` path
- [capabilities-and-limits.md](capabilities-and-limits.md) — what Bounded does and doesn't do
- [../docs/auth.md](../docs/auth.md) — the keypair identity model
