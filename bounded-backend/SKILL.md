---
name: bounded-backend
description: >-
  Author a Bounded backend: policy.json rules and invariants
  (rollingSum/windowSum/flowBound/conserve/tenantTag/tenantEdge/bound), functions (ctx.user/ctx.bounded/ctx.ai/
  ctx.services/ctx.secrets), the actor and identity model (@user, runAs/actAs,
  @origin, service keys, reserved identity sets), data and queries, realtime/live
  rooms, and the proof loop (bounded verify, counterexamples, proof coverage). Use
  when writing or changing server-side Bounded logic, policies, or the rules that
  govern who can do what. Part of the Bounded skill family; see the bounded skill
  to route across frontend, deploy, onchain, teams, and cross-cutting Action
  Boundaries guidance.
---

# Bounded backend

The server side of a Bounded app: the policy that governs documented supported
mutation surfaces, the proof-backed and runtime-enforced invariants, the
functions that run trusted code, and the actor model that decides who is acting.
The proof loop is `bounded
verify`; treat `PROVED` differently from a non-blocking runtime advisory with
proof status `UNKNOWN`. `bounded deploy` compiles and pushes; runtime rule and
invariant checks reject violations before commit on their documented supported
mutation surfaces. Do not generalize that coverage to an unsupported plane,
undocumented storage path, or inherited corpus. For CLI/deploy see the
**bounded-deploy** skill; for the client SDK and auth UI see
**bounded-frontend**; to route across the family, see the root **bounded** skill.

Write the actor model in mind from the start: know who `@user` is, which principal
a function acts as (`runAs`/`actAs`), and where authorization comes from
(`@origin`) before you write a rule.

## Reference Router

Building one of the five most common app shapes? Take the
[quick path](docs/quick-path.md) - one target page per build - instead of
scanning this table. Otherwise read only the row matching the current task or
term.

| Task or term | Read |
|---|---|
| One-screen syntax: field types, tiers, variables, operators, where logic goes | [policy cheat sheet](docs/policy-cheat-sheet.md) |
| Generate or repair a policy from an app description | [policy generation](docs/policy-generation-guide.md) |
| Complete policy examples by intent (marketplace, escrow, vaults, staking, tokens, ...) | [examples index](docs/examples.md) |
| Worked multi-collection policies (team SaaS, marketplace, realtime game) | [examples](docs/policy-examples.md) |
| Rule recipes: owner-only, admin-or-owner, membership, time windows, validation, immutable fields, atomic batches | [access patterns](docs/access-patterns.md) |
| Rules, fields, expressions, `@user`, `@data`, `@newData`, `@time`, `get()`, `getAfter()`, `transferAuthority` | [policy reference](docs/policy-reference.md) |
| Caps, balances, supply, tenant isolation, hard bounds; `rollingSum`, `windowSum`, `flowBound`, `conserve`, `tenantTag`, `tenantEdge`, `bound` | [invariants](docs/invariants.md) |
| Trending feeds, leaderboards, ranked `windowSum` reads | [trending feeds](docs/trending-feeds.md) |
| Browser CSP / restrict what app pages may reach | [browser boundary](docs/browser-boundary.md) |
| Constants, reusable rules, `@const`, `@def` | [constants and defs](docs/constants-and-defs.md) |
| Choose rule vs invariant vs hook vs function | [when to use functions](docs/functions-when-to-use.md) |
| Functions; declare, `auth`, `entry`, `secrets`, `actAs`, `ctx.user`, `ctx.bounded`, `ctx.env`, `ctx.secrets`, invoke, deploy | [functions](docs/functions.md) |
| `ctx.ai.run`, `ctx.ai.generateImage`, `ctx.ai.generateVideo`, `getJob`, AI without API keys | [ctx.ai](docs/functions-ctx-ai.md) |
| `ctx.services`, managed third-party APIs, `bounded services` | [ctx.services](docs/functions-ctx-services.md) |
| `ctx.browser`, headless browser from a function, driving your own app signed in, `@const.AGENT`, agent identity | [ctx.browser](docs/functions-ctx-browser.md) |
| `ctx.enqueue`, background jobs, queues, replay identity | [ctx.enqueue](docs/functions-ctx-enqueue.md) |
| `ctx.build`, functions that originate governed app builds | [ctx.build](docs/functions-ctx-build.md) |
| Start simple and graduate to functions | [function graduation](docs/functions-graduation.md) |
| User-owned provider API keys | [secrets](docs/secrets.md) |
| Schedules, `dueRows`, hooks, webhooks, `verifyWebhook` | [scheduled hooks and webhooks](docs/hooks-scheduled-webhooks.md) |
| Recurring fleet sweeps without full scans | [scheduled sweeps](docs/scheduled-sweeps.md) |
| Anti-cheat proof limits | [hooks and anti-cheat](docs/hooks-and-anti-cheat.md) |
| Atomic writes, subset attacks, `requiresInBatch`, `incomplete_batch` | [data plane](docs/data-plane.md) |
| Queries, pagination, `queryAggregate`, `count`, filters, sort, cursor | [queries](docs/queries.md) |
| Files, `setFile`, storage, full-text search | [files and search](docs/files-and-search.md) |
| Realtime rooms; `session.tick`, `settleTo`, `settleFrom`, fog-of-war views | [realtime and games](docs/realtime-and-games.md) |
| Native live modules; `session.live`, `tick`, `views`, `@effect`, `live.intent` | [live runtime](docs/live-runtime.md) |
| Input cadence, interpolation, prediction | [realtime netcode](docs/realtime-netcode.md) |
| AI NPCs / AI players | [AI NPCs](docs/ai-npcs.md) |
| Long-running backend runtime or managed services | [backend runtime](docs/backend-runtime.md) |
| Multi-step Flue agents | [Flue agents](docs/agents-flue.md) |
| Owners, collaborators, scoped admins | [admin and ownership](docs/admin-and-ownership.md) |
| Top-level `roles`, `members`, `read:"*"`, read/write scopes | [roles](docs/roles.md) |
| `access`, custom/external roles, `__owners__`, `__admins__`, `__developers__`, `__viewers__` | [access control](docs/access-control.md) · [identity and logs](docs/identity-and-logs.md) |
| Service keys, payout bots, backend identities, `runAs`, `actAs`, `@origin`, `ctx.origin` | [service keys](docs/service-keys.md) · [principals and origins](docs/principals-and-origins.md) |
| Proof coverage, `PROVED` / `DISPROVED`, counterexamples | [proof coverage](docs/proof-coverage.md) · [verify and counterexamples](docs/verify-and-counterexamples.md) |
| Concrete allow/deny tests; `policy-tests/*.json`, `bounded tests run/push/list/pull` | [policy tests](docs/policy-tests.md) |
| End-to-end tests for authenticated apps | [testing authed apps](docs/testing-authed-apps.md) |
| Completion review | [quality checklist](docs/quality-checklist.md) |
| Agent-facing or backend-only app | [building for agents](docs/building-for-agents.md) · [building a backend](docs/building-a-backend.md) |

## Error Router

| Error/status | Meaning |
|---|---|
| `403` | A write or function invoke failed a rule. Check auth, ownership, roles, or function `auth`. Denied reads are hidden as `200` with empty data, not `403`. |
| `500 rule_evaluation_failed` | The rule was reached and could NOT be evaluated - no rule denied you, and nothing was read or written. Not a denial, not a retryable conflict. Read `bounded decisions` for the cause; the row is recorded with `decision: error`. |
| `409` + invariant name | The transaction would violate an invariant. Fix state or policy. |
| `403 incomplete_batch` | A collection's `requiresInBatch` declaration names companion paths missing from the atomic batch. Submit the complete `setMany`. |
| `DISPROVED` + counterexample | The proof found a breaking assignment. Fix every blocking result and verify again; only non-blocking advisories are reviewable. |
| Static validation error | Fix policy syntax, field types, tier/invariant pairing, constants, or expression use. |

## Rules Of Thumb

- Use `@user.id` for normal ownership and membership checks; `@user.address` only for wallet/onchain semantics.
- Denied reads return empty `200` responses. Test read denial with a different permitted identity, not by waiting for a read `403`.
- Use `conserve` for fixed totals, `rollingSum` for caps over time, and `flowBound` for cumulative per-partition outflow ≤ inflow; use one atomic `set-many` when correctness spans multiple writes.
- When one write is invalid without companion writes, declare `requiresInBatch` so a hostile client cannot submit only the individually valid subset.
- Put provider API keys in Bounded secrets, not frontend code.
- Know the acting principal before writing a rule: a function's `runAs`/`actAs` and `@origin` decide who `@user` is and whether the call is authorized.
