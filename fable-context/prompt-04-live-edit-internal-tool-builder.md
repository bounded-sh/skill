================================================================================
TASK 4 — LIVE-EDIT / "INTERNAL TOOL BUILDER" (product or Bounded feature?)
================================================================================

Using the technical pack + shared business context above, develop this concept
(raw, in our words — then make it real):

> There's something cool that's partly built in Bounded but wasn't finished:
> **editing an app live, on the site it's already running on.** I think it could
> either be its **own product** or a **feature of Bounded** I'd like to integrate.
> Sell it as the **"internal tool" builder** for websites. And on top of our
> data-logic **invariants**, we make a **workflow of "invariants" for UI stuff or
> anything** — not really invariants, but **workflows that keep a website still
> working while giving it governance, open forking, or whatever** (governed live
> editing, forkable variants, guardrails so changes can't break the site).

The relevant machinery already exists partially in the pack: the local live-edit
daemon + widget, `propose → validate → deploy`, scope gates (`app` vs `app+policy`),
frontend variants/rollback, and Bounded's runtime rules/invariants. Treat that as the
starting substrate; note what's unfinished.

## Do this

1. **Define the product/feature crisply.** What it is, the core "edit-live-with-
   guardrails" loop, and the "workflow/governance layer for UI & site changes" (the
   non-data "invariants": approvals, open forking, keep-it-working checks, roll-forward
   / rollback, who-can-change-what). Give the concrete model.
2. **Decide: standalone product vs Bounded feature** — with reasoning. If standalone,
   how it relates to/depends on Bounded. If a feature, how it lifts Bounded's story.
3. **ICP & positioning** for "internal tool builder for websites" (ops teams,
   agencies, non-technical site owners, support/CS teams editing live sites, agent-
   driven edits). The wedge vs Retool / Webflow / Builder.io / feature-flag tools.
4. **MVP scope from what's already built.** Exactly what to finish first (reference the
   unfinished live-edit widget/daemon in the pack), in what order, with build cost and
   the smallest demo that wows.
5. **Pricing & GTM.**

## End in action, with conviction

- **The standalone-vs-feature call, decided**, and the one-line positioning.
- **An MVP build plan**: the ordered list of what to finish, cost/effort each, and the
  demo that proves it — tagged by owner `[one of our 4]` / `[autonomous Fable loop]` /
  `[manual]`.
- **First 30/60/90-day actions** and the metric that proves demand. Decide; don't hedge.
