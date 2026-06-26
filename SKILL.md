---
name: bounded
description: >-
  Build and use Bounded (bounded.sh), a provable realtime backend for apps.
  Use when working with Bounded CLI, policy.json, bounded verify/deploy,
  auth, functions, live/realtime rooms, hosted frontends, Bounded billing,
  usage limits, AI via ctx.ai, secrets, SDKs, files, search, roles, ownership,
  project config such as bounded.json and account profiles, invariants such as
  rollingSum/conserve/tenantTag, proof reports, or counterexamples. This public
  skill is a router: load the one linked doc for the user's task and avoid
  unrelated context.
---

# Bounded

Bounded is a provable realtime backend for apps. The public workflow is:

```text
describe app -> generate policy.json -> bounded verify -> fix/accept proof results -> bounded deploy -> use via SDK/CLI
```

`bounded verify` is the proof loop. `bounded deploy` validates, compiles, and
pushes the policy. Runtime rule and invariant checks fail closed.

## Public Boundary

This skill is for Bounded users and app builders. Keep guidance user-facing:

- Explain product behavior, public CLI/SDK commands, public pricing, usage limits,
  app design patterns, and compliance responsibilities.
- Stay within the public product surface. Do not invent non-public details,
  unpublished pricing, or future capabilities.
- For Bounded-managed third-party service proxies, state the public rule:
  provider cost plus 5%, itemized. Users can opt out by asking their AI/agent to
  integrate the provider directly with their own API keys; then they pay that
  provider directly and Bounded's proxy markup does not apply.
- For Bounded Pay, state that Bounded's 1% platform fee is in addition to
  Stripe's own processing fees.
- For SMS, WhatsApp, and email, remind users that Bounded Auth authenticates the
  user; it is not recipient consent. Use real provider integrations and comply
  with sender, opt-in, opt-out, and template rules for the channel.

## Use The Router

Open one doc for the current task. If a doc has a "Related" footer, follow it
only for the next question.

| User task | Read |
|---|---|
| Generate or repair a policy from an app description | [docs/policy-generation-guide.md](docs/policy-generation-guide.md) |
| See complete policy examples | [docs/policy-examples.md](docs/policy-examples.md) |
| Add spending/rate caps | [docs/invariants.md](docs/invariants.md#rollingsum--caps-over-time-windows) |
| Model balances, points, P&L, or supply | [docs/invariants.md](docs/invariants.md#conserve--sums-dont-change) |
| Tenant isolation | [docs/invariants.md](docs/invariants.md#tenanttag--documents-carry-their-tenant) |
| Hard field ceilings/floors, anti-cheat bounds | [docs/invariants.md](docs/invariants.md#bound--hard-ceilings--floors-on-a-field-anti-cheat) |
| Conditional ownership or holder transfer | [docs/policy-reference.md](docs/policy-reference.md#conditional-transfer-authority) |
| Rules, field types, expressions, `get()`, `getAfter()` | [docs/policy-reference.md](docs/policy-reference.md) |
| Constants, reusable rule fragments, `@const`, `@def` | [docs/constants-and-defs.md](docs/constants-and-defs.md) |
| Multi-environment policy files | [docs/environments.md](docs/environments.md) |
| Decide rule vs invariant vs hook vs function | [docs/functions-when-to-use.md](docs/functions-when-to-use.md) |
| Functions and external API calls | [docs/functions.md](docs/functions.md) |
| Scheduled functions or in-boundary scheduled hooks | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| Give backend code user-owned API keys | [docs/secrets.md](docs/secrets.md) |
| Bounded Auth, email OTP, OAuth, guest users, optional text OTP | [docs/auth.md](docs/auth.md) |
| Roles, owners, collaborators, scoped admins | [docs/admin-and-ownership.md](docs/admin-and-ownership.md) |
| Top-level roles and read/write scopes | [docs/roles.md](docs/roles.md) |
| Manager/owner/collaborator identity sets or function log access | [docs/identity-and-logs.md](docs/identity-and-logs.md) |
| Service keys / backend identities | [docs/service-keys.md](docs/service-keys.md) |
| Billing, buckets, plan limits, top-ups, upgrade | [docs/billing.md](docs/billing.md) |
| Hosted frontend and app URLs | [docs/frontend-hosting.md](docs/frontend-hosting.md) · [docs/domains.md](docs/domains.md) |
| SDK calls and subscriptions | [docs/sdk-reference.md](docs/sdk-reference.md) |
| CLI commands | [docs/cli-reference.md](docs/cli-reference.md) |
| Project config, `bounded.json`, account profiles, key safety | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| Data-plane read/write semantics and atomic batches | [docs/data-plane.md](docs/data-plane.md) |
| Queries, pagination, aggregates | [docs/queries.md](docs/queries.md) |
| Files and search | [docs/files-and-search.md](docs/files-and-search.md) |
| Hooks, schedules, webhooks | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| What anti-cheat can and cannot prove | [docs/hooks-and-anti-cheat.md](docs/hooks-and-anti-cheat.md) |
| Realtime rooms and games | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| Native live modules and live status | [docs/live-runtime.md](docs/live-runtime.md) |
| Realtime game feel: input cadence, interpolation, prediction | [docs/realtime-netcode.md](docs/realtime-netcode.md) |
| AI NPCs / AI players | [docs/ai-npcs.md](docs/ai-npcs.md) |
| Long-running backend runtime | [docs/backend-runtime.md](docs/backend-runtime.md) |
| Multi-step Flue agents | [docs/agents-flue.md](docs/agents-flue.md) |
| Onchain data / Solana | [docs/onchain.md](docs/onchain.md) |
| Trading patterns | [docs/onchain-trading.md](docs/onchain-trading.md) |
| Bounded Pay | [docs/bounded-pay.md](docs/bounded-pay.md) |
| Proof coverage and counterexamples | [docs/proof-coverage.md](docs/proof-coverage.md) · [docs/verify-and-counterexamples.md](docs/verify-and-counterexamples.md) |
| Key safety and account recovery | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) |
| End-to-end tests for authed apps | [docs/testing-authed-apps.md](docs/testing-authed-apps.md) |
| Anonymous users, invite links, account upgrade | [docs/anonymous-accounts.md](docs/anonymous-accounts.md) |
| Build for agents, web, mobile, or server | [guides/building-for-agents.md](guides/building-for-agents.md) · [guides/building-a-webapp.md](guides/building-a-webapp.md) · [guides/building-for-react-native.md](guides/building-for-react-native.md) · [guides/building-a-backend.md](guides/building-a-backend.md) |
| Quality checklist before calling the app done | [docs/quality-checklist.md](docs/quality-checklist.md) |
| Capability boundaries | [guides/capabilities-and-limits.md](guides/capabilities-and-limits.md) |

## Term Router

| If you see | Read |
|---|---|
| `rollingSum`, `windowSeconds`, `scopeVariable`, `conserve`, `bound`, `tenantTag`, `tenantEdge` | [docs/invariants.md](docs/invariants.md) |
| `@user`, `@data`, `@newData`, `@time`, `get()`, `getAfter()` | [docs/policy-reference.md](docs/policy-reference.md) |
| `transferAuthority`, one-click market trade, holder transfer | [docs/policy-reference.md](docs/policy-reference.md#conditional-transfer-authority) |
| `roles`, `members`, `read:"*"`, scoped admin | [docs/roles.md](docs/roles.md) |
| `admins/$userId`, founder bootstrap, no god-mode | [docs/admin-and-ownership.md](docs/admin-and-ownership.md) |
| `@const`, `@def`, deploy constants | [docs/constants-and-defs.md](docs/constants-and-defs.md) |
| `functions`, `ctx.user`, `ctx.bounded`, `ctx.env`, `ctx.secrets` | [docs/functions.md](docs/functions.md) |
| `ctx.ai.run`, AI NPC, AI/external-services bucket | [docs/functions.md](docs/functions.md#ctxai--real-ai-no-api-keys) · [docs/ai-npcs.md](docs/ai-npcs.md) · [docs/billing.md](docs/billing.md) |
| `actAs`, `runAs`, service key, payout bot, backend identity | [docs/service-keys.md](docs/service-keys.md) · [docs/principals-and-origins.md](docs/principals-and-origins.md) |
| `@origin`, `ctx.origin`, live call provenance | [docs/principals-and-origins.md](docs/principals-and-origins.md) |
| `session.live`, `init`, `tick`, `views`, `@effect`, `live.intent` | [docs/live-runtime.md](docs/live-runtime.md) |
| `bounded live status`, `GET /live/status`, `live.status`, `subscribeLiveView` | [docs/live-runtime.md](docs/live-runtime.md) |
| `session.tick`, `settleTo`, `settleFrom`, fog-of-war views | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| `schedule`, `dueRows`, `hooks.scheduled`, `webhooks`, `verifyWebhook` | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| `getPage`, `queryAggregate`, `count`, filters, sort, cursor | [docs/queries.md](docs/queries.md) · [docs/sdk-reference.md](docs/sdk-reference.md) |
| `set(path, null)`, delete, `setMany` | [docs/sdk-reference.md](docs/sdk-reference.md#delete--setpath-null) · [docs/data-plane.md](docs/data-plane.md) |
| `setFile`, storage collection, full-text search | [docs/files-and-search.md](docs/files-and-search.md) |
| `bounded link`, `bounded share`, collaborators | [docs/auth.md](docs/auth.md#linking--teams) |
| `bounded.json`, `bounded account use`, account profiles, `.bounded/app.json`, `~/.bounded/credentials`, `BOUNDED_PRIVATE_KEY` | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| `onchain:true`, `--protocol`, Solana, mainnet permit | [docs/onchain.md](docs/onchain.md) |
| `project_limit_exceeded`, `maxProjects`, `429`, `dimension`, `projectedUsage`, `alerts[]` | [docs/billing.md](docs/billing.md#handling-limit-errors) |

## Error Router

| Error/status | Meaning |
|---|---|
| `403` | The caller failed a rule. Check auth, ownership, roles, or function `auth`. |
| `409` + invariant name | The transaction would violate an invariant. Fix state or policy. |
| `429` + `dimension`/`projectedUsage` | A plan limit or spend cap would be exceeded. Explain the exact axis and suggest upgrade, top-up, cap adjustment, or reduced volume. |
| `DISPROVED` + counterexample | The proof found a breaking assignment. Read it, strengthen the policy, and verify again unless the user explicitly accepts the risk. |
| Static validation error | Fix policy syntax, field types, tier/invariant pairing, constants, or expression use. |

## Build Real Apps

- Do not ship fake integrations as done work.
- Use `ctx.ai.run` for AI through Bounded's public AI route, funded by the
  AI/external-services bucket.
- For email, SMS, WhatsApp, payments, brokers, or feeds, use a real provider or a
  public Bounded-managed surface when one exists.
- If a placeholder is unavoidable, say it plainly to the user.

## Billing Basics

There are two user-visible buckets:

- **AI/external-services bucket**: AI and managed third-party service proxies.
- **Bounded infra bucket**: metered Bounded platform usage at public Bounded
  rates.

Free accounts cannot top up buckets. Pro-or-better accounts can top up eligible
buckets with the public checkout flow. Both the relevant bucket and any app-level
cap must have room before cost-bearing work runs.

## Setup

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
bounded deploy --create --name my-app
bounded verify
bounded dashboard
```

`bounded init` writes `policy.json` and public project config. The first CLI
command that needs auth creates or loads the configured local keypair. That key
owns apps created with it. Link it early with `bounded link --email
you@example.com` and do not commit private keys or secrets.

## Rules Of Thumb

- Read project config first when entering an existing app; it tells agents which
  app/environment/account source to use.
- Use `@user.id` for normal ownership and membership checks.
- Use `@user.address` only for wallet/onchain semantics.
- Use `conserve` for money-like values.
- Use `rollingSum` for caps over time.
- Use one atomic `set-many` when correctness spans multiple writes.
- Put provider API keys in Bounded secrets, not frontend code.
- Give users the clearest public command or URL; do not route them to non-public
  Bounded service surfaces.
