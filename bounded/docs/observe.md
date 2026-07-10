# Action Boundaries — observe, then limit, an agent's external actions

**What's in here / when to read this:** the one-page overview of **Action
Boundaries** — watching what an app or agent does externally (`ctx.ai` spend,
`ctx.services` tool calls, agent egress) and enforcing suggested boundaries.
Use the public **bounded-teams** skill for organization-level governance.

Your policy gives your **data** enforced authorization rules and proved
invariants. Action Boundaries apply a related observe-then-enforce workflow to
the **external actions** the app takes. Do not describe an action boundary or a
UI state as a policy proof: the trust levels below are intentionally distinct.

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

Four ways in, by what you control: hosted runtime (platform emits), your Node
process (the shim), your Worker/edge chokepoint (`@bounded-sh/observe/edge` —
one fire-and-forget event per action), or a tool you can't put code inside
(the `bounded-ai-gateway` base-URL proxy; its `OBSERVE_ONLY=true` mode is the
watch-first posture — every call forwards, events still land).

For organization-wide action oversight, custody, and shared invariant evidence,
load the public **bounded-teams** skill. For one app, use this overview and the
current dashboard/docs surface; the internal observe implementation guide is not
part of the public `npx skills add bounded-sh/skill -y` family. Avoid `--all` and
wildcard installs, which include repository-internal skills.

## Related

- [invariants.md](../../bounded-backend/docs/invariants.md) — the native caps Promote writes into policy (`rollingSum`, `conserve`)
- [../guides/building-for-agents.md](../../bounded-backend/docs/building-for-agents.md) — the agent-owned backend flow these boundaries watch
- [billing.md](billing.md) — plan context: Watching + Suggested are free for every app; Enforced rides the existing Pro tier
