# Preflight and rehearse before you open

**What's in here:** `bounded oapp preflight` (the Open gate as a dry run, with the capability ladder for every dependency), and `bounded oapp rehearse`: an ephemeral, budget-sealed copy that starts from zero data, and the idempotent bootstrap it runs. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## Preflight: what Open would refuse (`bounded oapp preflight`)

Open runs one safety pass first, and refuses on anything it finds. The same
pass is available as a dry run, on the DEPLOYED app, mutating nothing:

```
bounded oapp preflight            # READY, or every finding Open would refuse on
bounded oapp preflight --json     # the report as one document (exit 1 when refused)
```

The report covers the synced source and its head revision, whether the dist is
reproducible (`static` / `built`), the two grants Open requires in the creator
policy's `boundaries.egress` allow list (`service:cap`, `service:x402`), and
every finding: a declared secret, a credential-shaped string, a closed-creator
boundary, an unsafe egress host. For each dependency a finding names, it
answers the ladder:

- `native` - the runtime already provides it (`ctx.ai`, `ctx.email`, files, auth, ...)
- `live` - a catalog action: `ctx.services.invoke("<slug>", args, { idempotencyKey })`
- `callable` - an x402-priced API, callable now through `X402_FETCH`
- `request` - not on Bounded yet: `bounded services request "<what you need>"`

Blocking findings fail the command; advisory ones only name a better route.
Fix, redeploy with source, run it again, then open. `bounded oapp rehearse`
runs the same preflight before it seals a rehearsal, and never blocks on it.

## Rehearse before you open (`bounded oapp rehearse`)

An Open App's data starts from ZERO — none of your test data survives the
opening. `bounded oapp rehearse` lets you (and the user) experience exactly
that before committing: it creates an **ephemeral, budget-sealed rehearsal**
of the app — a fresh platform-managed copy whose data starts empty, with the
app's deployed policy mirrored on — deploys your local functions and site onto
it, runs the bootstrap you declared, and prints its address.

```
bounded oapp rehearse              # create (or converge on the live one)
bounded oapp rehearse --status     # address, expiry, spend vs sealed budget
bounded oapp rehearse --fresh      # tear down, rebirth from zero
bounded oapp rehearse --down       # tear down now
```

Declare the bootstrap in bounded.json — it MUST be idempotent, because a
rehearsal (like a real opening) starts from nothing and reruns converge:

```json
{ "rehearsal": { "bootstrap": "node scripts/bootstrap.mjs" } }
```

The script runs on your machine with `BOUNDED_APP_ID` pointing at the
rehearsal app (`BOUNDED_REHEARSAL=1` is set). Facts to rely on: the budget is
a sealed slice of the owner's credits (default $0.25, max $5 — caps cannot be
widened after birth); the rehearsal expires on its own (default 2h, max 24h)
and the platform deletes it; it can never launch as an oApp; rerunning is
cheap and expected. Backend-only apps rehearse fine — with no built dist
there is simply no site deploy.

