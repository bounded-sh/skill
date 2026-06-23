# Building for Agents

The flow when **an agent owns a backend**: no human auth ceremony, one keypair
the agent controls, and a local dashboard running beside the CLI for visibility.
Generate a policy, prove it, deploy it, inspect it, then read and write.

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
# 1. Identity — created automatically at ~/.bounded/credentials; isolate it per agent
export HOME="$AGENT_HOME"                               # per-agent dir → its own ~/.bounded/credentials
# …or supply the key directly (base58 ed25519), no file needed:
# export BOUNDED_PRIVATE_KEY="<base58-secret>"
bounded whoami                                          # prints the agent's address

# 2. Generate a policy from the task description (see the generation guide)
bounded init                                            # or write policy.json directly

# 3. Prove it — read counterexamples, fix, repeat until clean
bounded deploy ./policy.json --create --name agent-ledger   # creates app, prints <appId>
bounded verify ./policy.json --app-id <appId>               # PROVED / DISPROVED

# 4. Keep the dashboard up while you build, then use it
bounded dashboard
bounded data set --app-id <appId> --path agents/<agent-id>/spend/s1 --data '{"amount":60}'
bounded data get --app-id <appId> --path agents/<agent-id>/spend
```

> Run each agent under a **distinct** `HOME` or `BOUNDED_PRIVATE_KEY` so
> identities don't collide. Never hand an autonomous agent a human's keypair.
> That per-agent key *owns every app the agent creates* — lose it and the apps
> are unrecoverable. Link or back it up: [../docs/key-and-account-safety.md](../docs/key-and-account-safety.md).

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
      "read": "@user.id != null",
      "create": "@user.id != null",
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

> **Which identity does an agent guard on?** The runtime `user` object is
> `{ id, address, email }`. `@user.id` is the universal stable identity and is
> **always** present for an authenticated caller (for a wallet/keypair agent it
> equals the wallet address; for an email/social login it is the account
> identity) — guard ownership, membership, and bare auth on `@user.id`, as the
> example above does. `@user.address` is a *real onchain wallet address*: present
> for wallet logins, `null` for email-only ones — reach for it only in
> `onchain: true` collections or genuine wallet/transfer semantics (and inside
> those, `@user.id`/`@user.email` are forbidden). `@user.email` is the verified,
> lowercased email (null for wallet callers), for email-gating.

## Reading and writing: CLI or SDK

- **CLI** (`bounded data ...`) is the simplest path for a shell-driven agent —
  every operation is one command, `--json` makes output machine-parseable, and
  errors come back as JSON too. See [../docs/cli-reference.md](../docs/cli-reference.md).
- **SDK** (`@bounded-sh/server`) suits an agent already running in Node: one
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
- [building-a-backend.md](building-a-backend.md) — the `@bounded-sh/server` path
- [capabilities-and-limits.md](capabilities-and-limits.md) — what Bounded does and doesn't do
- [../docs/auth.md](../docs/auth.md) — the keypair identity model
- [../docs/key-and-account-safety.md](../docs/key-and-account-safety.md) — per-agent key isolation; the key owns the agent's apps, so link or back it up
