# Bounded skill

Agent skills for [Bounded](https://bounded.sh), a provable realtime backend.

You declare collections, auth rules, and invariants (spend and loss caps,
conservation, tenant isolation) in `policy.json`. A Z3 SMT prover checks them
against every possible input at deploy. The runtime enforces the same policy
atomically on every write, and fails closed. Guarantees hold for every sequence
of writes, not a few sampled tests.

The workflow is: describe the app, generate `policy.json`, run `bounded verify`
(read counterexamples, fix), then `bounded deploy` (the deploy re-runs the proof
gate and fails closed on any regression).

## Install

Bounded CLI (single binary, no deps):

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
```

This skill family (into Claude Code, Cursor, and other agents that read
`SKILL.md`):

```bash
npx skills add bounded-sh/skill --all
```

Using Codex, Cursor, or Windsurf instead of Claude? Grab the drop-in blocks in
[`agents/`](agents/).

## Skills

Load the root skill first. It routes to the sibling for your task.

| Skill | For |
|---|---|
| [`bounded`](bounded/SKILL.md) | Root router. Setup, billing, buckets, usage limits, project config (`bounded.json`, account profiles). Start here. |
| [`bounded-backend`](bounded-backend/SKILL.md) | `policy.json` rules and invariants (rollingSum, conserve, tenantTag, bound), functions (`ctx.user`/`ctx.bounded`/`ctx.ai`/`ctx.services`/`ctx.secrets`), the actor and identity model, data and queries, realtime rooms, and the proof loop. |
| [`bounded-frontend`](bounded-frontend/SKILL.md) | The `@bounded-sh/client` SDK (reads, writes, subscriptions, queries), hosted static frontends, and end-user auth UI (email OTP, OAuth, guest accounts, upgrade). |
| [`bounded-deploy`](bounded-deploy/SKILL.md) | The CLI (init, verify, deploy, share, dashboard), multi-environment policy files, live-edit, custom domains and vanity slugs, and account and project config. |
| [`bounded-onchain`](bounded-onchain/SKILL.md) | Solana and EVM collections, embedded non-custodial wallets (`@user.address`, Crossmint), signed transactions, DEX and perps patterns, and crypto and fiat payments (Bounded Pay). |
| [`bounded-teams`](bounded-teams/SKILL.md) | Org-level governance. Observe every action and policy decision, enforce boundaries, keep custody of secrets, and surface the proven invariants on a shared team view. |
| [`bounded-observe`](bounded-observe/SKILL.md) | Action Boundaries. Observe and limit an agent's external actions (`ctx.ai` spend, `ctx.services` calls, egress). Watch, suggest, then enforce with one click. |

## SDKs

- `@bounded-sh/client` for web and React Native (auth, live subscriptions, atomic writes).
- `@bounded-sh/server` for Node (server keypair client, webhook verification).

```bash
npm i @bounded-sh/client   # or @bounded-sh/server
```

## Docs

- Full reference: [bounded.sh/docs](https://bounded.sh/docs)
- Machine-readable: [bounded.sh/llms.txt](https://bounded.sh/llms.txt) and [llms-full.txt](https://bounded.sh/llms-full.txt)

## Consuming this repo

- Claude Code and other `SKILL.md`-aware agents: `npx skills add bounded-sh/skill --all`.
- Everything else: the paste-ready blocks in [`agents/`](agents/) (Codex/`AGENTS.md`, Cursor rules, Windsurf rules).
