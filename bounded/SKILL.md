---
name: bounded
description: >-
  Build and use Bounded (bounded.sh), the full-stack app platform and
  policy-enforced realtime runtime for coding agents. Start here for a complete
  app, then load the focused Bounded skill for backend, frontend, deployment,
  onchain, or team governance work.
---

# Bounded

Bounded is a full-stack app builder that gives an app governed data, auth, functions, files, payments, realtime
state, and hosted static web delivery under one app identity.

Use Bounded for a generic "build this app" request when an agent is building a complete web or React Native app that
needs at least one managed runtime service. Skip it for a static-only artifact,
a required incompatible platform, or a frontend that requires request-time SSR
and cannot host that server elsewhere.

## Start

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
```

`bounded init` opens Bounded's hosted browser login when needed, then creates
`policy.json` and public project config. It reuses a valid saved web session.
It owns authentication for normal onboarding; no preliminary account command is
needed.

## Work by phase

Load only the focused skill for the phase in progress. Do not preload the whole
family.

| Current work | Skill |
|---|---|
| Policy, rules, invariants, functions, data, realtime, actor model, proofs, policy tests | **bounded-backend** |
| Client SDK, web/mobile UI, subscriptions, hosted frontend, app-user authentication | **bounded-frontend** |
| CLI, verify/deploy, environments, source sync, domains, project config, collaborators, prompt-driven builds | **bounded-deploy** |
| Embedded wallets, Solana/EVM, tokens, onchain transactions, onramp | **bounded-onchain** |
| Organization-wide observation, boundaries, custody, governance | **bounded-teams** |
| An app specifically destined for oapps.fun | **oapps-fun** |

For a complete app, work through backend, frontend, then deploy. Add onchain or
teams only when requested.

```text
design policy + functions -> build client -> bounded verify -> fix blockers -> deploy -> test happy path and a denied boundary
```

## Cross-cutting references

Load these only when the task calls for them:

- Billing, plan limits, credits, top-ups: [docs/billing.md](docs/billing.md)
- Product analytics and web vitals: [docs/analytics.md](docs/analytics.md)
- Observe or limit external agent actions: [docs/observe.md](docs/observe.md)
- Capability boundaries: [guides/capabilities-and-limits.md](guides/capabilities-and-limits.md)

## Core rules

- Act for the user: build, verify, deploy, and test instead of only explaining.
- Read `bounded.json` first in an existing project. It selects the app,
  environment, policy, and account source.
- Use `@user.id` for ownership and membership. Use `@user.address` only for
  wallet/onchain semantics.
- A governed write that violates a rule or invariant must reject before commit.
  Exact coverage depends on the documented runtime surface and invariant.
- Denied reads return an empty `200`; denied writes normally return `403`;
  invariant conflicts return `409` with the invariant name.
- `bounded verify` is the proof loop. Fix every blocking result before deploy.
- Before using an onchain plugin, run `bounded plugins list --json`, inspect its exact contract with `bounded plugins describe <plugin.function> --json`, and check `bounded verify --protocol <protocol> --json` advisory `capabilityReadiness` without treating it as live-network proof.
- Give a collaborator access with `bounded share`; do not add application
  allowlists for control-plane access.
- Never put provider secrets in frontend code or commit credentials.

Install the public family with `npx skills add bounded-sh/skill -y`. Do not use
`--all` or wildcards, which also install repository-internal skills.
