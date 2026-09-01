# Rehearse before you open

**What's in here:** `bounded oapp rehearse`: an ephemeral, budget-sealed copy that starts from zero data, and the idempotent bootstrap it runs. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

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

