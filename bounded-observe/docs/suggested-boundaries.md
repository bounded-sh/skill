# Suggested boundaries — from baseline to Promote

**What's in here / when to read this:** how observed events become **Suggested**
boundary cards, how to read a card's evidence before trusting it, and what
**Promote** will do.

## The three states

Every action boundary lives in one of three states — keep the trust level of
each state straight in every answer:

| State | What it is | Trust level |
|---|---|---|
| **Watching** | The app's external actions land in the Feed. No behavior change. | **Reported** — visible, not protected. |
| **Suggested** | A baseline derived from real events, rendered as a boundary card. | A proposal, not protection. |
| **Enforced** | A promoted, live boundary; every matched action gets a deterministic verdict. | Native: **proven in your app's policy**. Escorted: **checked at the platform edge**. |

## How a suggestion is derived

Suggestions are **deterministic — no model in the loop**. Baselines are
computed from the app's real observed events, per rail and per actor: spend
rates, per-action amounts, active hours, destinations. When a stable baseline
emerges, it becomes a card:

> *"This agent has spent ≤ $2/hr on llm-gateway across 9 days. Set that as a
> boundary?"*

Nothing is suggested that the app's own history does not support.

## Read the evidence before trusting a card

Every card states its evidence: the **observation window** and the **event
count** it is based on. Suggestions require a minimum number of events before
they appear at all — below the threshold the card reads "still learning —
N events" instead of proposing a limit. Free-tier daily event caps and short
retention mean a baseline can be **partial**; the card says exactly what it
saw, so judge it on that, and let more history accumulate when the evidence is
thin.

## What Promote will do

One click on **Promote** turns a suggestion into a live, **Enforced** boundary.
Two kinds of suggestion promote differently — and the difference is the trust
level, so never blur them:

- **Spend and rate suggestions** promote into the app's **own policy and
  billing config** as native limits (the same `rollingSum`-style caps the data
  plane already proves — see the `bounded` skill's `docs/invariants.md`). From
  then on the cap is **proven in your app's policy** and enforced atomically;
  an over-cap `ctx.ai` or `ctx.services` call fails naming the boundary.
- **Escorted external-action suggestions** (per-action limits on outbound
  calls) become boundaries **checked at the platform edge**: before a matched
  call fires, the emitter asks for a deterministic verdict, then fires the
  call from the app's own process — the payload never transits Bounded. For a
  self-hosted backend this check runs in-process via the shim the builder
  installed; removing the shim removes the check. It protects against agent
  mistakes, not against someone deliberately taking it out.

Once a boundary is Enforced, every matched action gets exactly one of three
verdicts:

| Verdict | What happens |
|---|---|
| **allowed** | the action fires |
| **declined** | the action does not fire; the error **names the boundary** it would cross |
| **waiting for approval** | the action holds; an approver receives a signed approve link — approve, and the action fires |

Enforcement fails closed: no verdict, no action. That is the opposite posture
from Watching, which is fail-open because it only reports.

## Related

- [observing-agent-actions.md](observing-agent-actions.md) — opting in, shim wiring, and the Feed/Actors/Coverage dashboard
