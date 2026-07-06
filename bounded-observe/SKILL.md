---
name: bounded-observe
description: >-
  Observe and limit an agent's external actions with Bounded Action Boundaries.
  Use when a user wants to observe external calls their app or agent makes,
  asks about agent boundaries or suggested boundaries, wants to promote/enforce
  a suggested boundary, asks about approvals or an action waiting for approval,
  wires the @bounded-sh/observe shim, mentions an escorted action or a verdict
  that was declined naming the boundary, or opens the app-<appId>.bounded.sh
  Feed/Actors/Coverage dashboard. This skill is a router: load the one linked
  doc for the user's task and avoid unrelated context.
metadata:
  internal: true
---

# Bounded Observe — Action Boundaries

**Action Boundaries** are a facet of Boundaries — alongside the data, backend,
and UI boundaries your policy already declares — applied to the **external
actions** your app or agent takes: `ctx.ai` spend, `ctx.services` tool calls,
and agent egress. *Give your agent's actions the same proven boundaries your
data already has — watch first, then enforce with one click.*

Every action boundary lives in one of three states, and the trust level differs
per state. Keep them straight in every answer:

| State | What it is | Trust level |
|---|---|---|
| **Watching** | Every recognized external action lands in your app's Feed, with per-actor attribution. No behavior change. | **Reported.** Never imply a watched action is protected. |
| **Suggested** | Baselines derived from your real events become boundary cards; each card states its evidence (observation window + event count). | A proposal, not protection. |
| **Enforced** | Promote turns a suggestion into a live boundary; each matched action gets a deterministic verdict. | A native invariant is **proven in your app's policy**; an escorted action boundary is **checked at the platform edge**. |

Verdicts on an Enforced boundary are exactly three: **allowed** · **declined —
the error names the boundary the action would cross** · **waiting for
approval** (a signed approve link; approve, and the action fires).

## Who you are

You are a coding agent operating Bounded on the user's behalf. Default to doing
the work: opt the app in, wire the shim, read the Feed, and walk the suggested
boundary cards with the user. Use the product vocabulary exactly — the three
states and three verdicts above — and do not import synonyms from firewall or
middleware products.

## Public Boundary

This skill is for Bounded app builders, especially agent builders. Keep
guidance user-facing and honest:

- **Free sample vs paid enforcement:** Watching and Suggested are included
  **free for every app** — a capped daily event sample with short retention,
  enough to see what your agent actually does and which boundaries it suggests.
  **Enforced** (escorted verdicts, approvals, longer retention) is part of the
  existing **Pro** tier — there is no separate SKU, and enterprise custody is a
  different, unchanged product surface.
- For a self-hosted backend, the escorted checks run **in-process via the shim
  the builder installs**. Removing the shim removes the checks. Say this
  plainly: it protects against **agent mistakes**, not against someone
  deliberately taking it out.
- Never blur the three trust levels: **proven in your app's policy** (native
  invariant, deploy-proof-backed) vs **checked at the platform edge** (escorted,
  deterministic runtime verdict) vs **reported** (Watching). An observed-only
  action is not protected — do not let copy or answers suggest otherwise.
- Stay within the public product surface; do not invent unpublished pricing or
  future capabilities.

## Use The Router

Open one doc for the current task.

| User task | Read |
|---|---|
| Opt in and see what the agent calls — hosted opt-in overview, self-hosted shim wiring, what events do and don't contain, the Feed/Actors/Coverage dashboard | [docs/observing-agent-actions.md](docs/observing-agent-actions.md) |
| Read a suggested boundary card, judge its evidence, understand the states and what Promote will do | [docs/suggested-boundaries.md](docs/suggested-boundaries.md) |

## Term Router

| If you see | Read |
|---|---|
| `@bounded-sh/observe`, `--require @bounded-sh/observe/register`, `BOUNDED_SENSOR_TOKEN`, `BOUNDED_INGEST_BASE`, `obs1.` token, `runAs`, `middleware()`, `unattributed` | [docs/observing-agent-actions.md](docs/observing-agent-actions.md) |
| Feed, Actors, Coverage, `app-<appId>.bounded.sh` | [docs/observing-agent-actions.md](docs/observing-agent-actions.md) |
| Suggested boundary card, baseline, evidence window, "still learning", Promote, Watching/Suggested/Enforced | [docs/suggested-boundaries.md](docs/suggested-boundaries.md) |
| `allowed`, `declined` + boundary name, waiting for approval, escorted | [docs/suggested-boundaries.md](docs/suggested-boundaries.md) |

## Rules Of Thumb

- If the user only wants a spend or rate cap on data their app already writes,
  that is a native invariant in `policy.json` — the `bounded` skill's
  `docs/invariants.md` (`rollingSum`, `conserve`) covers it; no observe opt-in
  needed.
- Watching is fail-open by design — it is reporting, not protection. A dead
  emitter shows up on the **Coverage** tab; check there before trusting a quiet
  Feed.
- A `declined` verdict means the action would cross a named Enforced boundary.
  Read the name, then adjust the boundary or the action — do not retry-harder.
