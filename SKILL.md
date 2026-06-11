---
name: bounded
description: >-
  Use when building backends or databases with provable constraints via the
  bounded CLI (bounded.sh): declaring collections and invariants (spending
  caps, conservation, tenant isolation) in policy.json, running `bounded
  verify` to get SMT proof reports with counterexamples, deploying through
  the fail-closed proof gate, and writing data through atomic
  `bounded data set`/`set-many`. Triggers: "bounded", "bounded.sh",
  "bounded CLI", "bounded verify", "bounded deploy", "policy.json",
  "invariant", "spending cap", "rollingSum", "conserve", "tenantTag",
  "tenantEdge", "proof report", "counterexample", "provable backend",
  "agent spend cap", "formally verified database", "hooks", "enforceRules",
  "anti-cheat", "fog-of-war", "server-authoritative", "tick", "cheating",
  "multiplayer game backend", "onchain authority permit", "mainnet policy
  update", "collaborator", "bounded share".
---

# Bounded CLI

Bounded (bounded.sh) is a policy-enforced realtime backend where constraints are
formally verified. One JSON policy file declares collections, auth rules, and
**invariants** — the non-negotiables. A Z3-based prover checks every declared
constraint at deploy time and returns concrete counterexamples on failure; a
single-writer cell per project enforces them atomically at runtime. Rejections
are fail-closed: a constraint-breaking write is a `409`, and nothing partial is
ever applied.

An agent reading this skill drives one loop:

```
define collections → declare non-negotiables as invariants → bounded verify
       → read counterexamples → fix policy → bounded deploy
       → write via bounded data set / set-many
```

The skill's job is to make you good at each arrow — especially "read
counterexamples", which is where Bounded differs from every backend you have
used: the prover tells you *exactly* which assignment breaks your policy
before any user or agent can.

## How It Works

```
Your Agent ──► policy.json ──► bounded verify (Z3/SMT proof gate)
                   ▲                  │
                   └── fix ◄── counterexamples / PROVED
                                      │
                              bounded deploy (same gate, fails closed)
                                      │
              bounded data set / set-many ──► atomic runtime enforcement
```

## Setup

```bash
curl -fsSL bounded.sh/install | sh     # or: npm install -g @bounded/cli
```

There is **no login step**. The first `bounded` command generates an ed25519
keypair at `~/.bounded/key` (mode `0600`) — the keypair *is* the identity.
Agents go from zero to deployed without a human auth step. `bounded link`
later opens a browser to bind the keypair to a human account (magic email or
passkey); that is only needed for billing, the dashboard, or teams — never to
build, verify, or deploy.

### Teams: sharing an app

The app owner can grant collaborators who may update the app's policy (and
**only** the policy — not rename, delete, or reconfigure the app):

```bash
bounded share <walletAddress> --app-id <appId>      # add a collaborator
bounded collaborators --app-id <appId>              # list collaborators
bounded unshare <walletAddress> --app-id <appId>    # remove one
```

Only the owner can add/remove collaborators; this is enforced server-side
against the wallet derived from the CLI's keypair.

> Generate per-agent identity by running the CLI under a distinct HOME or
> `BOUNDED_KEY_PATH`. Never reuse a human's keypair for an autonomous agent.

## Quick Workflow

```bash
# 1. Scaffold
bounded init                      # creates policy.json

# 2. Declare collections + invariants in policy.json
#    (see docs/policy-reference.md and docs/invariants.md)

# 3. Prove
bounded verify                    # obligations → PROVED / DISPROVED + counterexamples

# 4. Fix anything DISPROVED, re-verify until green
#    (see docs/verify-and-counterexamples.md for how to read failures)

# 5. Deploy — the same proof gate runs server-side and fails closed
bounded deploy

# 6. Write
bounded data set --path "agents/a1/spend/s1" --data '{"amount": 60}'
bounded data set-many --from-json bundle.json     # atomic batch
bounded data get --path "agents/a1/spend/s1"
```

### Agent Workflow Checklist

```
- [ ] Install: curl -fsSL bounded.sh/install | sh   (identity is automatic)
- [ ] Model the data: collections as path templates (users/$userId/...)
- [ ] Write rules for WHO may act (read/create/update/delete expressions)
- [ ] Declare invariants for WHAT must hold (caps, conservation, tenancy)
      — and check docs/invariants.md#when-not-to-use-invariants first
- [ ] bounded verify — read every DISPROVED counterexample, fix, repeat
- [ ] bounded deploy
- [ ] Write through bounded data set / set-many; treat 409 as state-forbids,
      403 as caller/payload-wrong (docs/data-plane.md#failure-semantics)
```

## The Core Mental Model

- **Rules** answer *who may act*. They gate each action with a boolean
  expression and fail with `403` plus a trace.
- **Invariants** answer *what must hold across every transaction* — spending
  caps, conserved totals, tenant isolation. They are proven at deploy and
  enforced atomically at runtime, failing with `409` plus the invariant's
  declared name.
- **Proofs are over all inputs.** `PROVED` is not "tests passed"; it is a
  statement about every document state, payload, and caller. `DISPROVED`
  hands you the breaking assignment (the canonical one:
  `@newData.amount = null` refuting `amount <= 100 || amount > 100`).
- **Everything fails closed.** Unprovable policies don't deploy; the
  previous-good policy stays active. Runtime checks reject rather than skip.
  Onchain coverage claims beyond the supported subset are rejected at verify
  time (see docs/proof-coverage.md).

## Failure Semantics (summary)

| What failed | Status | You get | Committed |
|---|---|---|---|
| Invariant violated | `409 invariant_violation` | declared invariant name (e.g. `spend_cap`) + failing arithmetic | nothing |
| Rule denied | `403` | trace of the predicate that evaluated false | nothing |
| Update/delete on a capped collection | `409 append_only` | rolling-cap collections are append-only event logs | nothing |
| Policy fails verification | deploy fails | proof report with counterexamples | previous-good policy stays active |

`409` = the **state** forbids it: back off; retrying the same capped write
fails until the window moves. `403` = the **caller or payload** is wrong: fix
the request, not the timing. Full table and worked transcripts in
[docs/data-plane.md](docs/data-plane.md).

## Documentation

| Doc | What it covers |
|---|---|
| [**Policy reference**](docs/policy-reference.md) | `policy.json` end to end: path templates, fields/types, the rule expression language, tiers (durable/checkpointed/ephemeral), hooks. |
| [**Invariants**](docs/invariants.md) | The four types — `conserve`, `rollingSum`, `tenantTag`, `tenantEdge` — every key, partitioned caps via `scopeVariable`, multi-window caps, and **when NOT to use an invariant**. |
| [**Verify & counterexamples**](docs/verify-and-counterexamples.md) | Running `bounded verify`, the full obligations list, reading DISPROVED counterexamples, the fix loop, staging-verified examples. |
| [**Data plane**](docs/data-plane.md) | `bounded data set`/`set-many`/`get`, atomic batches, in-batch composition with `getAfter()`, failure semantics, append-only caps, worked transcripts. |
| [**Proof coverage**](docs/proof-coverage.md) | The two-layer coverage model: rule properties enforced on both runtimes via shared bytecode; the invariant subset enforced onchain (incl. epoch-bucketed rollingSum) and what fails closed. |
| [**Hooks & anti-cheat**](docs/hooks-and-anti-cheat.md) | The hook policy model (invariants hold against everything incl. hooks/cron/ticks; rules gate external actors; hooks bypass rules unless `enforceRules:true`), games anti-cheat (server-authoritative ticks, fog-of-war views, per-player caps, tamper-proof input log — and the honest limit on human-speed scripting), and the mainnet onchain authority-permit signing note. |

## Best Practices

- **Name your invariants like error codes** (`spend_cap`, `no_minting`) —
  the name is what comes back in the `409`, and what your agent's error
  handling will branch on.
- **Verify before every deploy, locally.** `bounded deploy` runs the same
  gate, but reading counterexamples locally is the fast loop.
- **Treat a DISPROVED as information, not an obstacle.** The counterexample
  is the exact scenario your policy permits and shouldn't; widen the rule or
  add the missing guard (`@user.address != null`, null-checks on optional
  fields) rather than weakening the property.
- **Reach for `set-many` whenever correctness spans writes** — transfers
  under `conserve`, guard + gated write. A read-check-write sequence is a
  TOCTOU race; one batch is not.
- **Don't update capped documents.** `rollingSum` collections are
  append-only; write each event with a fresh id and let idempotency come
  from your ids.
- **Machine docs:** `https://bounded.sh/llms.txt` (entry point) and
  `https://bounded.sh/llms-full.txt` (condensed full reference) are kept in
  sync with this skill.
