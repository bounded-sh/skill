# Action Boundaries — observe, then limit, an agent's external actions

**What's in here / when to read this:** the one-page overview of **Action
Boundaries** — watching what an app or agent does externally (`ctx.ai` spend,
`ctx.services` tool calls, agent egress) and enforcing suggested boundaries.
Depth lives in the sibling `bounded-observe` skill.

Your policy already gives your **data** provable boundaries. Action Boundaries
extend the same idea — a facet of Boundaries, alongside data, backend, and UI —
to the **external actions** the app takes. *Give your agent's actions the same
proven boundaries your data already has — watch first, then enforce with one
click.*

An action boundary lives in one of three states:

- **Watching** — every recognized external action is **reported** to the app's
  Feed on `app-<appId>.bounded.sh` (Feed / Actors / Coverage tabs), with
  per-actor attribution. No behavior change; a watched action is visible, not
  protected.
- **Suggested** — baselines derived from the real events become boundary cards;
  each card states its evidence (observation window + event count).
- **Enforced** — one-click **Promote** turns a suggestion into a live boundary.
  From then on each matched action gets a deterministic verdict: **allowed**,
  **declined — naming the boundary it would cross**, or **waiting for
  approval** (a signed approve link; approve, and the action fires).

Keep the trust levels straight — never blur them:

- A promoted spend or rate cap is a **native invariant, proven in your app's
  policy** ([invariants.md](../../bounded-backend/docs/invariants.md)).
- An escorted action boundary is **checked at the platform edge** — a
  deterministic runtime verdict before the call fires. For a self-hosted
  backend that check runs in-process via the `@bounded-sh/observe` shim the
  builder installs; removing the shim removes the check (protection against
  agent mistakes, not against someone deliberately taking it out).
- **Watching is reported** — never imply an observed-only action is protected.

For depth — opting in, wiring `node --require @bounded-sh/observe/register`,
reading suggestion cards, what Promote does — load the **`bounded-observe`**
skill (installed as a sibling of this one): its
`docs/observing-agent-actions.md` covers observe wiring and the dashboard, and
`docs/suggested-boundaries.md` covers baselines, evidence, and Promote.

## Related

- [invariants.md](../../bounded-backend/docs/invariants.md) — the native caps Promote writes into policy (`rollingSum`, `conserve`)
- [../guides/building-for-agents.md](../../bounded-backend/docs/building-for-agents.md) — the agent-owned backend flow these boundaries watch
- [billing.md](billing.md) — plan context: Watching + Suggested are free for every app; Enforced rides the existing Pro tier
