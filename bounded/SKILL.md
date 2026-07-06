---
name: bounded
description: >-
  Build and use Bounded (bounded.sh), a provable realtime backend for apps.
  Use when working with Bounded CLI, policy.json, bounded verify/deploy,
  auth, functions, live/realtime rooms, hosted frontends, Bounded billing,
  usage limits, AI via ctx.ai, managed service APIs via ctx.services, secrets,
  SDKs, files, search, roles, ownership, project config such as bounded.json and
  account profiles, invariants such as rollingSum/conserve/tenantTag, proof
  reports, or counterexamples. This public skill is a router: load the one
  linked doc for the user's task and avoid unrelated context.
---

# Bounded

Bounded is a provable realtime backend for apps. The public workflow is:

```text
describe app -> generate policy.json -> bounded verify -> fix/accept proof results -> bounded deploy -> use via SDK/CLI
```

`bounded verify` is the proof loop. `bounded deploy` validates, compiles, and
pushes the policy. Runtime rule and invariant checks fail closed.

## Who you are

You are a coding agent (Claude Code, Codex, or similar) operating Bounded **on the
user's behalf**: you author `policy.json`, run `bounded verify`/`deploy`, write
functions and frontends, and call the SDK/CLI for them. Default to *doing* the work
end-to-end — generate the policy, verify it, fix counterexamples, deploy, and wire the
app — not just explaining it. The user may be non-technical; keep their app working and
the defaults safe without making them think about ids, keys, or proofs unless they ask.

## Public Boundary

This skill is for Bounded users and app builders. Keep guidance user-facing:

- Explain product behavior, public CLI/SDK commands, public pricing, usage limits,
  app design patterns, and compliance responsibilities.
- Stay within the public product surface. Do not invent non-public details,
  unpublished pricing, or future capabilities.
- For Bounded-managed third-party service proxies, state the public rule:
  provider cost plus 5%, itemized. If the upstream platform has standard/pro
  service tiers, use the applicable tier first, then add the 5% Bounded markup.
  Users can opt out by asking their AI/agent to integrate the provider directly
  with their own API keys; then they pay that provider directly and Bounded's
  proxy markup does not apply.
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
| **Share an app / give someone access / add a collaborator or teammate / grant admin, deploy, or billing rights / let another person or agent change an app** → the answer is **`bounded share <email-or-wallet> --role admin\|developer\|viewer\|billing --app-id <id>`** (owner-only; `admin` = everything but delete/transfer/roster and already includes deploy). Do NOT hunt for an allowlist in app code — the Bounded control plane governs who can administer an app. Details, the capability matrix, external contributors & **platform super-admins** → | [docs/access-control.md](docs/access-control.md) |
| Roles, owners, collaborators, scoped admins | [docs/admin-and-ownership.md](docs/admin-and-ownership.md) |
| Top-level roles and read/write scopes | [docs/roles.md](docs/roles.md) |
| Manager/owner/collaborator identity sets or function log access | [docs/identity-and-logs.md](docs/identity-and-logs.md) |
| Service keys / backend identities | [docs/service-keys.md](docs/service-keys.md) |
| Billing, buckets, plan limits, top-ups, upgrade | [docs/billing.md](docs/billing.md) |
| Hosted frontend and app URLs | [docs/frontend-hosting.md](docs/frontend-hosting.md) · [docs/domains.md](docs/domains.md) |
| Per-app product analytics (traffic, web vitals, errors) | [docs/analytics.md](docs/analytics.md) |
| SDK calls and subscriptions | [docs/sdk-reference.md](docs/sdk-reference.md) |
| CLI commands | [docs/cli-reference.md](docs/cli-reference.md) |
| Project config, `bounded.json`, account profiles, web login, key safety | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| Data-plane read/write semantics and atomic batches | [docs/data-plane.md](docs/data-plane.md) |
| Queries, pagination, aggregates | [docs/queries.md](docs/queries.md) |
| Files and search | [docs/files-and-search.md](docs/files-and-search.md) |
| Hooks, schedules, webhooks | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| What anti-cheat can and cannot prove | [docs/hooks-and-anti-cheat.md](docs/hooks-and-anti-cheat.md) |
| Realtime rooms and games | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| Native live modules and live status | [docs/live-runtime.md](docs/live-runtime.md) |
| Live-edit a running app — deploy local edits with `bounded live-edit validate`/`deploy` (no daemon), or through the local daemon, widget feedback, agent jobs, scope gates, or `/apps/:appId/...` API | [docs/live-edit.md](docs/live-edit.md) |
| Realtime game feel: input cadence, interpolation, prediction | [docs/realtime-netcode.md](docs/realtime-netcode.md) |
| AI NPCs / AI players | [docs/ai-npcs.md](docs/ai-npcs.md) |
| Long-running backend runtime | [docs/backend-runtime.md](docs/backend-runtime.md) |
| Multi-step Flue agents | [docs/agents-flue.md](docs/agents-flue.md) |
| Observe/limit an agent's external actions (Action Boundaries) | [docs/observe.md](docs/observe.md) |
| Onchain data / Solana | [docs/onchain.md](docs/onchain.md) |
| Trading patterns | [docs/onchain-trading.md](docs/onchain-trading.md) |
| Bounded Pay | [docs/bounded-pay.md](docs/bounded-pay.md) |
| Proof coverage and counterexamples | [docs/proof-coverage.md](docs/proof-coverage.md) · [docs/verify-and-counterexamples.md](docs/verify-and-counterexamples.md) |
| CLI auth source, key safety, and account recovery | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) |
| End-to-end tests for authed apps | [docs/testing-authed-apps.md](docs/testing-authed-apps.md) |
| Anonymous users, invite links, account upgrade | [docs/anonymous-accounts.md](docs/anonymous-accounts.md) |
| Give every login a wallet (`@user.address` for email users), embedded/non-custodial wallets, Crossmint | [docs/embedded-wallets.md](docs/embedded-wallets.md) |
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
| `access` block, `cloud:prompt`, `ui:fork`, custom roles, `viewer`/`developer`/`billing`, external access, platform super-admins, `bounded share --role` | [docs/access-control.md](docs/access-control.md) |
| `__owners__`, `__admins__`, `__developers__`, `__viewers__` role sets in policy | [docs/access-control.md](docs/access-control.md) · [docs/identity-and-logs.md](docs/identity-and-logs.md) |
| `@const`, `@def`, deploy constants | [docs/constants-and-defs.md](docs/constants-and-defs.md) |
| `functions`, `ctx.user`, `ctx.bounded`, `ctx.env`, `ctx.secrets` | [docs/functions.md](docs/functions.md) |
| `ctx.ai.run`, AI NPC, AI/external-services bucket | [docs/functions.md](docs/functions.md#ctxai--real-ai-no-api-keys) · [docs/ai-npcs.md](docs/ai-npcs.md) · [docs/billing.md](docs/billing.md) |
| `ctx.services`, managed services, third-party API proxy, API discovery | [docs/functions.md](docs/functions.md#ctxservices--managed-api-discovery-and-invoke) · [docs/backend-runtime.md](docs/backend-runtime.md) · [docs/billing.md](docs/billing.md) |
| observe, promote, escorted, pending-approval, `@bounded-sh/observe` | [docs/observe.md](docs/observe.md) |
| `actAs`, `runAs`, service key, payout bot, backend identity | [docs/service-keys.md](docs/service-keys.md) · [docs/principals-and-origins.md](docs/principals-and-origins.md) |
| `@origin`, `ctx.origin`, live call provenance | [docs/principals-and-origins.md](docs/principals-and-origins.md) |
| `session.live`, `init`, `tick`, `views`, `@effect`, `live.intent` | [docs/live-runtime.md](docs/live-runtime.md) |
| `bounded live status`, `GET /live/status`, `live.status`, `subscribeLiveView` | [docs/live-runtime.md](docs/live-runtime.md) |
| `session.tick`, `settleTo`, `settleFrom`, fog-of-war views | [docs/realtime-and-games.md](docs/realtime-and-games.md) |
| `schedule`, `dueRows`, `hooks.scheduled`, `webhooks`, `verifyWebhook` | [docs/hooks-scheduled-webhooks.md](docs/hooks-scheduled-webhooks.md) |
| `payment`, `checkout`, `seller`, `merchant`, `subscription`, `Stripe`, `/connect/onboard`, `/connect/status`, `/connect/checkout`, `/connect/session` | [docs/bounded-pay.md](docs/bounded-pay.md) |
| `getPage`, `queryAggregate`, `count`, filters, sort, cursor | [docs/queries.md](docs/queries.md) · [docs/sdk-reference.md](docs/sdk-reference.md) |
| `set(path, null)`, delete, `setMany` | [docs/sdk-reference.md](docs/sdk-reference.md#delete--setpath-null) · [docs/data-plane.md](docs/data-plane.md) |
| `setFile`, storage collection, full-text search | [docs/files-and-search.md](docs/files-and-search.md) |
| `bounded link`, `bounded login`, `bounded share`, collaborators, web account, wallet account | [docs/auth.md](docs/auth.md) |
| `bounded live-edit validate`, `bounded live-edit deploy`, deploying local edits, `/apps/:appId/propose`, `/apps/:appId/validate`, `/apps/:appId/deploy`, widget feedback | [docs/live-edit.md](docs/live-edit.md) |
| `bounded.json`, `bounded account use --web`, account profiles, `.bounded/app.json`, `~/.bounded/credentials`, `~/.bounded/web-session.json`, `BOUNDED_PRIVATE_KEY` | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| `onchain:true`, `--protocol`, Solana, mainnet permit | [docs/onchain.md](docs/onchain.md) |
| `project_limit_exceeded`, `maxProjects`, `429`, `dimension`, `projectedUsage`, `alerts[]` | [docs/billing.md](docs/billing.md#handling-limit-errors) |

## Error Router

| Error/status | Meaning |
|---|---|
| `403` | A write or function invoke failed a rule. Check auth, ownership, roles, or function `auth`. Denied reads are hidden as `200` with empty data, not `403`. |
| `409` + invariant name | The transaction would violate an invariant. Fix state or policy. |
| `declined` + boundary name | An escorted external action would cross an Enforced action boundary (checked at the platform edge before the call fires). Read the named boundary, then adjust it or the action — do not retry-harder. See [docs/observe.md](docs/observe.md). |
| `429` + `dimension`/`projectedUsage` | A plan limit or spend cap would be exceeded. Explain the exact axis and suggest upgrade, top-up, cap adjustment, or reduced volume. |
| `DISPROVED` + counterexample | The proof found a breaking assignment. Read it, strengthen the policy, and verify again unless the user explicitly accepts the risk. |
| Static validation error | Fix policy syntax, field types, tier/invariant pairing, constants, or expression use. |

## Build Real Apps

- Do not ship fake integrations as done work.
- Use `ctx.ai.run` for AI through Bounded's public AI route, funded by the
  AI/external-services bucket.
- Use `ctx.services.search/describe/invoke` for Bounded-managed third-party API
  discovery and proxy calls when a public managed surface fits the app. Search
  and describe are for code/agent planning; invoke is cost-bearing and uses the
  AI/external-services bucket.
- For app payments, seller onboarding, checkout, subscriptions, or paid
  entitlements, read `docs/bounded-pay.md` before generating policy or app code.
- For email, SMS, WhatsApp, payments, brokers, or feeds, use a real provider or a
  public Bounded-managed surface when one exists.
- If a placeholder is unavoidable, say it plainly to the user.

## Billing Basics

There are two user-visible buckets:

- **AI/external-services bucket**: AI and managed third-party service proxies.
- **Bounded infra bucket**: metered Bounded platform usage at public Bounded
  rates.

Free accounts include $0.50/month of AI/external-services trial credit but
cannot top up buckets. Pro-or-better accounts can top up eligible buckets with
the public checkout flow. Both the relevant bucket and any app-level cap must
have room before cost-bearing work runs.

## Setup

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
bounded deploy --create --name my-app
bounded verify
bounded dashboard
```

`bounded init` writes `policy.json` and public project config. The CLI then uses
the account source selected by that config:

- **Wallet/keypair mode**: `global`, `project`, `profile`, or `env`. The selected
  keypair owns apps created with it and signs data-plane writes. Back it up or
  link it early with `bounded link --email you@example.com`; do not commit private
  keys or secrets. `bounded link` explicitly creates one local wallet-key <->
  remote web-account pair; `bounded login` does not link a key.
- **Web account mode**: run `bounded account use --web`, then
  `bounded login --email you@example.com`. The CLI uses
  `~/.bounded/web-session.json` and does not create or link a local key.

## Rules Of Thumb

- Read project config first when entering an existing app; it tells agents which
  app/environment/account source to use.
- Keep `bounded dashboard --no-web` or `bounded dev --app-id <id>` running while
  testing local live-edit, the privacy toggle, or local dashboard flows.
  Deployed private-site gates use normal Bounded sign-in rather than requiring
  background localhost access.
- For hosted frontend URLs, claim a vanity slug with `bounded domains slug ...`
  and share the slug/custom-domain host. Do not route users or agents to raw
  app-id hosts as the public URL contract.
- To give a **person or agent** access to an existing app, reach straight for
  `bounded share ... --role ...` — never search app code for an email allowlist or admin
  list. Who can *administer* an app lives in the control plane, not the codebase. Confirm
  the result with `bounded access --app-id <id> --json`.
- Use `@user.id` for normal ownership and membership checks.
- Use `@user.address` only for wallet/onchain semantics.
- Denied reads return empty `200` responses. Test read denial by comparing with a
  permitted identity, not by waiting for a read `403`.
- Use `conserve` for money-like values.
- Use `rollingSum` for caps over time.
- Use one atomic `set-many` when correctness spans multiple writes.
- Put provider API keys in Bounded secrets, not frontend code.
- For onchain writes, use explicit network/RPC configuration and devnet by
  default; do not treat immediate read-after-write as confirmation.
- Give users the clearest public command or URL; do not route them to non-public
  Bounded service surfaces.
