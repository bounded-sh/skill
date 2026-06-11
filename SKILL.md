---
name: bounded
description: >-
  Use when building a backend or database from a plain-English app description
  with the bounded CLI (bounded.sh): generating a policy.json (collections,
  field types, auth rules, and provable invariants — spending caps,
  conservation, tenant isolation), running `bounded verify` to get SMT proof
  reports with counterexamples, deploying through the fail-closed proof gate,
  and reading/writing data through the typed @bounded/client + @bounded/server
  SDKs or `bounded data`. Triggers: "bounded", "bounded.sh", "bounded CLI",
  "bounded verify", "bounded deploy", "policy.json", "provable backend",
  "formally verified database", "Convex alternative", "Supabase alternative",
  "realtime backend", "invariant", "spending cap", "rollingSum", "conserve",
  "tenantTag", "tenantEdge", "proof report", "counterexample", "agent spend
  cap", "multiplayer game backend", "fog-of-war", "server-authoritative",
  "tick", "anti-cheat", "hooks", "scheduled", "webhooks", "@bounded/client",
  "@bounded/server", "collaborator", "bounded share".
---

# Bounded

Bounded (bounded.sh) is a **provable Convex/Supabase-class backend that an agent
builds from a description**. You write one JSON policy file — collections, field
types, auth rules, and **invariants** (the non-negotiables: spending caps,
conserved totals, tenant isolation) — and a Z3-based prover checks every declared
constraint at deploy time, returning concrete counterexamples on failure. At
runtime a single-writer cell per project enforces the constraints atomically over
a realtime Durable Object. Rejections are fail-closed: a constraint-breaking
write is a `409`, and nothing partial is ever applied.

This skill exists to make you **good at generating a correct policy from a plain
description**. That is the product: every backend Bounded runs is generated from
a policy, and a good policy is the difference between a backend that is merely
deployed and one that is provably safe.

## The loop

```
describe the app  →  generate policy.json  →  bounded verify
        →  read counterexamples  →  fix policy  →  bounded verify (clean)
        →  bounded deploy (same gate, fails closed)
        →  use via @bounded/client / @bounded/server / bounded data
```

The arrows that matter most:

- **generate policy** — turn the description into collections, types, rules, and
  invariants. The method is in
  [docs/policy-generation-guide.md](docs/policy-generation-guide.md). Read it first.
- **read counterexamples** — `bounded verify` does not say "tests passed"; it
  proves a property over *all* inputs, and on failure hands you the exact
  assignment that breaks your policy. This is where Bounded differs from every
  backend you have used.

## How it works

```
Your description ─► policy.json ─► bounded verify (Z3/SMT proof gate)
                        ▲                  │
                        └── fix ◄── counterexamples / PROVED
                                           │
                                   bounded deploy (same gate, fails closed)
                                           │
        @bounded/client (browser) ─┐
        @bounded/server (vault)    ├─► realtime Durable Object
        bounded data (CLI)         ┘     atomic runtime enforcement
```

## Setup

```bash
curl -fsSL bounded.sh/install | sh     # or: npm install -g @bounded/cli
```

There is **no login step**. The first `bounded` command generates an ed25519
keypair at `~/.bounded/key` (mode `0600`) — the keypair *is* the identity. Agents
go from zero to deployed without a human auth step. `bounded link` later binds the
keypair to a human account (magic email or passkey); that is only needed for
billing, the dashboard, or teams — never to build, verify, or deploy.

> Generate a per-agent identity by running the CLI under a distinct `HOME` or
> `BOUNDED_KEY_PATH`. Never reuse a human's keypair for an autonomous agent.

### Teams: sharing an app

The owner can grant collaborators who may update the app's policy (and **only**
the policy — not rename, delete, or reconfigure the app):

```bash
bounded share <walletAddress> --app-id <appId>      # add a collaborator
bounded collaborators --app-id <appId>              # list collaborators
bounded unshare <walletAddress> --app-id <appId>    # remove one
```

Only the owner can add/remove collaborators; this is enforced server-side against
the wallet derived from the CLI's keypair.

## Quick workflow

```bash
bounded init                      # scaffold policy.json

# edit policy.json — see docs/policy-generation-guide.md

bounded verify                    # obligations → PROVED / DISPROVED + counterexamples
# fix anything DISPROVED, re-verify until clean

bounded deploy                    # same proof gate, server-side, fails closed

# use the backend
bounded data set --path "agents/a1/spend/s1" --data '{"amount": 60}'
bounded data set-many --from-json bundle.json     # atomic batch
bounded data get  --path "agents/a1/spend/s1"
```

### Generation checklist

```
- [ ] Collections as path templates (orgs/$orgId/docs/$docId)
- [ ] Field types with ! (readonly) / ? (optional) where they matter
- [ ] An auth rule on EVERY collection — read/create/update/delete, default deny
- [ ] Identify the NON-NEGOTIABLES (money, quotas, tenancy) and express them as invariants
- [ ] Tiers: durable for anything an invariant protects; ephemeral/checkpointed only when justified
- [ ] hooks / scheduled / webhooks / search / files only where the description needs them
- [ ] bounded verify — read every DISPROVED counterexample, strengthen the policy, repeat
- [ ] Run the self-check in docs/quality-checklist.md before deploy
- [ ] bounded deploy
```

## The core mental model

- **Rules answer *who may act*.** Each action (`read`/`create`/`update`/`delete`)
  is gated by a boolean expression; a denied action is a `403` with a trace.
  Omitted actions default to deny.
- **Invariants answer *what must hold across every transaction*** — spending caps,
  conserved totals, tenant isolation. They are proven at deploy and enforced
  atomically at runtime, failing with `409` plus the invariant's declared name.
  Invariants bind **every** write path, including hooks, ticks, schedules, and
  your own migrations.
- **Proofs are over all inputs.** `PROVED` is not "tests passed"; it is a
  statement about every document state, payload, and caller. `DISPROVED` hands you
  the breaking assignment (the canonical one: `@newData.amount = null` refuting
  `amount <= 100 || amount > 100`).
- **Everything fails closed.** Unprovable policies don't deploy; the previous-good
  policy stays active. Runtime checks reject rather than skip. Onchain coverage
  claims beyond the supported subset are rejected at verify time (see
  [docs/proof-coverage.md](docs/proof-coverage.md)).

## Failure semantics (summary)

| What failed | Status | You get | Committed |
|---|---|---|---|
| Invariant violated | `409 invariant_violation` | declared name (e.g. `spend_cap`) + failing arithmetic | nothing |
| Rule denied | `403` | trace of the predicate that evaluated false | nothing |
| Update/delete on a capped collection | `409 append_only` | rolling-cap collections are append-only event logs | nothing |
| Policy fails verification | deploy fails | proof report with counterexamples | previous-good policy stays active |

`409` = the **state** forbids it: back off; retrying the same capped write fails
until the window moves. `403` = the **caller or payload** is wrong: fix the
request, not the timing. Full table and transcripts in
[docs/data-plane.md](docs/data-plane.md).

## Documentation

| Doc | What it covers |
|---|---|
| [**Policy generation guide**](docs/policy-generation-guide.md) | **Start here.** The step-by-step method from a plain-English app description to a correct policy, with three full worked examples (team SaaS, marketplace, realtime game). |
| [**Policy reference**](docs/policy-reference.md) | Full `policy.json` syntax: path templates, field types, the rule expression language, tiers, every accepted config key. |
| [**Invariants**](docs/invariants.md) | `conserve`, `rollingSum`, `tenantTag`, `tenantEdge` — every key, partitioned/multi-window caps, onchain coverage, and a RULES-vs-INVARIANTS decision guide. |
| [**Realtime & games**](docs/realtime-and-games.md) | Subscriptions, tiers, sessions (rooms/tick/settlement), fog-of-war view collections, intents + rate caps, the agar.io example, the honest anti-cheat boundary. |
| [**Hooks, scheduled & webhooks**](docs/hooks-scheduled-webhooks.md) | `hooks.offchain`, `hooks.tick`, `hooks.scheduled`, `schedule`/`dueRows`, `webhooks`, `enforceRules`, and the "invariants bind everything" model. |
| [**Files & search**](docs/files-and-search.md) | `type: "storage"` scoped files and `search: { fields: [...] }` full-text search. |
| [**Queries**](docs/queries.md) | Filters, sort, limit, cursor pagination, aggregations, point-lookup joins via `get()`, and the search query — in both SDK and CLI forms. |
| [**Quality checklist**](docs/quality-checklist.md) | The self-check that yields GOOD policies before you deploy. |
| [**Verify & counterexamples**](docs/verify-and-counterexamples.md) | Running `bounded verify`, the full obligations list, reading DISPROVED counterexamples, the fix loop. |
| [**Data plane**](docs/data-plane.md) | `bounded data` and the SDK write path, atomic batches, in-batch composition, failure semantics. |
| [**Proof coverage**](docs/proof-coverage.md) | What the offchain runtime proves vs. the verified onchain subset, and what fails closed. |
| [**Hooks & anti-cheat (deep)**](docs/hooks-and-anti-cheat.md) | The trust-boundary deep dive for games and privileged server logic. |

## Best practices

- **Name your invariants like error codes** (`spend_cap`, `no_minting`) — the name
  is what comes back in the `409` and what your error handling branches on.
- **Verify locally before every deploy.** `bounded deploy` runs the same gate, but
  reading counterexamples locally is the fast loop.
- **Treat a DISPROVED as information, not an obstacle.** The counterexample is the
  exact scenario your policy permits and shouldn't; strengthen the rule (add
  `@user.address != null`, null-check optional fields) rather than weakening the
  property.
- **Reach for `set-many` whenever correctness spans writes** — transfers under
  `conserve`, guard + gated write. A read-check-write sequence is a TOCTOU race;
  one atomic batch is not.
- **Don't update capped documents.** `rollingSum` collections are append-only;
  write each event with a fresh id and let idempotency come from your ids.
- **Machine docs:** `https://bounded.sh/llms.txt` (entry point) and
  `https://bounded.sh/llms-full.txt` (condensed full reference) stay in sync with
  this skill.
</content>
</invoke>
