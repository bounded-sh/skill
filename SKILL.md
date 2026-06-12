---
name: bounded
description: >-
  Use to BUILD AND USE Bounded (bounded.sh) — a provable Convex/Supabase-class
  realtime backend an agent builds from a description. Covers: generating a
  policy.json (collections, field types, auth rules, and provable invariants —
  spending caps, conservation, tenant isolation), running `bounded verify` for
  SMT proof reports with counterexamples, deploying through the fail-closed proof
  gate, and reading/writing data via `bounded data` or the @bounded/client +
  @bounded/server SDKs (web, React Native, server). This SKILL.md is a ROUTER:
  it maps your intent to the one doc that answers it. Triggers: "bounded",
  "bounded.sh", "bounded CLI", "bounded verify", "bounded deploy", "policy.json",
  "provable backend", "formally verified database", "Convex alternative",
  "Supabase alternative", "realtime backend", "invariant", "spending cap",
  "rollingSum", "conserve", "tenantTag", "tenantEdge", "proof report",
  "counterexample", "agent spend cap", "multiplayer game backend", "fog-of-war",
  "server-authoritative", "tick", "anti-cheat", "hooks", "scheduled", "webhooks",
  "@bounded/client", "@bounded/server", "collaborator", "bounded share",
  "functions", "bounded functions", "function", "invoke", "escape hatch",
  "call Stripe", "call an API", "third-party API", "ctx.bounded", "syncStripe".
---

# Bounded

Bounded (bounded.sh) is a **provable realtime backend an agent builds from a
description**. You write one JSON policy — collections, field types, auth rules,
and **invariants** (the non-negotiables: spending caps, conserved totals, tenant
isolation) — and a Z3-based prover checks every declared constraint at deploy
time, returning concrete counterexamples on failure. At runtime a single-writer
cell per app enforces those constraints atomically over a realtime Durable
Object. Everything is fail-closed: a constraint-breaking write is a `409`, an
unprovable policy never deploys, nothing partial is ever applied.

## The loop

```
describe app → generate policy.json → bounded verify → read counterexamples →
fix → bounded verify (clean) → bounded deploy (same gate) → use via SDK / CLI
```

`bounded verify` does not say "tests passed" — it proves a property over *all*
inputs and, on failure, hands you the exact assignment that breaks your policy.
That is the heart of Bounded.

## Where to go — intent → file

**This SKILL.md routes; the linked doc explains.** Find your intent, open the one
file. Each doc has a "Related" footer for the next hop.

### Build something

| I want to… | Go to |
|---|---|
| Understand the method for writing a correct policy | [docs/policy-generation-guide.md](docs/policy-generation-guide.md) **(start here for any backend)** |
| See full, validated example policies | [docs/policy-examples.md](docs/policy-examples.md) |
| Build a backend an **agent** owns (no human in the loop) | [guides/building-for-agents.md](guides/building-for-agents.md) |
| Build a **web app** (React + auth + live data) | [guides/building-a-webapp.md](guides/building-a-webapp.md) |
| Ship to **iOS / Android** | [guides/building-for-react-native.md](guides/building-for-react-native.md) |
| Build a **server / backend** (server-signed writes, webhooks) | [guides/building-a-backend.md](guides/building-a-backend.md) |
| Build a **multiplayer game** (tick, fog-of-war, anti-cheat) | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| Add an **imperative function** (fetch a third-party API / LLM, then write) | [docs/functions.md](docs/functions.md) |
| Know what Bounded is — and is **NOT** — good for | [guides/capabilities-and-limits.md](guides/capabilities-and-limits.md) |

### Write the policy

| I want to… | Go to |
|---|---|
| Look up `policy.json` syntax (paths, field types, rule language, tiers) | [docs/policy-reference.md](docs/policy-reference.md) |
| Write an **invariant** (cap, conservation, tenant isolation) | [docs/invariants.md](docs/invariants.md) |
| Decide rule vs invariant; null-guard correctly | [docs/invariants.md](docs/invariants.md) · [docs/policy-generation-guide.md](docs/policy-generation-guide.md) |
| Add **hooks / scheduled jobs / webhooks** | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| Call a **third-party API then write** (the imperative escape hatch — **Functions**) | [docs/functions.md](docs/functions.md) |
| Add **files** or **full-text search** | [docs/files-and-search.md](docs/files-and-search.md) |
| Self-check the policy before deploy | [docs/quality-checklist.md](docs/quality-checklist.md) |

### Prove & deploy

| I want to… | Go to |
|---|---|
| Run `bounded verify`, read proof reports & counterexamples | [docs/verify-and-counterexamples.md](docs/verify-and-counterexamples.md) |
| Know what is proven on which runtime (offchain vs onchain) | [docs/proof-coverage.md](docs/proof-coverage.md) |

### Use the deployed backend

| I want to… | Go to |
|---|---|
| Every CLI command + flag | [docs/cli-reference.md](docs/cli-reference.md) |
| Every SDK method (`@bounded/client` / `@bounded/server`) | [docs/sdk-reference.md](docs/sdk-reference.md) |
| Read/write data, atomic batches, failure codes (`409`/`403`) | [docs/data-plane.md](docs/data-plane.md) |
| Filter / sort / paginate / aggregate / search | [docs/queries.md](docs/queries.md) |
| Auth: dev keypair identity vs end-user Privy/wallet | [docs/auth.md](docs/auth.md) |
| The anti-cheat trust boundary (games, deep) | [docs/hooks-and-anti-cheat.md](docs/hooks-and-anti-cheat.md) |

## Setup (60 seconds)

```bash
curl -fsSL bounded.sh/install | sh      # or: npm install -g @bounded/cli
```

**No login step.** The first `bounded` command generates an ed25519 keypair at
`~/.bounded/key` — the keypair *is* the identity, so agents go from zero to
deployed without a human auth step. Details: [docs/auth.md](docs/auth.md).

```bash
bounded init                            # scaffold policy.json (a capped spend ledger)
# edit policy.json — see docs/policy-generation-guide.md
bounded deploy ./policy.json --create --name my-app   # creates app, prints <appId>
bounded verify ./policy.json --app-id <appId>         # PROVED / DISPROVED + counterexamples
bounded data set --app-id <appId> --path spend/s1 --data '{"amount":60}'
bounded data get --app-id <appId> --path spend
```

## Core mental model

- **Rules answer *who may act*.** Each action (`read`/`create`/`update`/`delete`)
  is a boolean expression; a denied action is a `403`. Omitted actions default to
  deny.
- **Invariants answer *what must hold across every transaction*** — caps,
  conservation, tenancy. Proven at deploy, enforced atomically at runtime
  (`409` + the invariant's declared name). They bind **every** write path:
  hooks, ticks, schedules, batches, your own migrations.
- **Proofs are over all inputs.** `PROVED` ≠ "tests passed"; `DISPROVED` hands
  you the breaking assignment.
- **Everything fails closed.** Unprovable policies don't deploy; runtime checks
  reject rather than skip.

## Failure semantics (summary — full table in [docs/data-plane.md](docs/data-plane.md))

| What failed | Status | Meaning |
|---|---|---|
| Invariant violated | `409` | the **state** forbids it — back off; retrying fails until the window moves |
| Rule denied | `403` | the **caller/payload** is wrong — fix the request, not the timing |
| Update/delete on a capped collection | `409 append_only` | rolling-cap collections are append-only logs |
| Policy fails verification | deploy fails | proof report with counterexamples; previous-good policy stays active |

## Best practices

- **Name invariants like error codes** (`spend_cap`, `no_minting`) — the name is
  the `409` your error handling branches on.
- **Verify locally before every deploy** — reading counterexamples is the fast loop.
- **Treat a DISPROVED as information**, not an obstacle: strengthen the rule
  (add `@user.address != null`, null-check optionals), never weaken the property.
- **Use `set-many` whenever correctness spans writes** (transfers, guard + gated
  write) — one atomic batch is not a TOCTOU race; a sequence of `set`s is.
- **Don't update capped documents** — `rollingSum` collections are append-only;
  write each event with a fresh id.
- **Machine docs:** `https://bounded.sh/llms.txt` and
  `https://bounded.sh/llms-full.txt` stay in sync with this skill.
