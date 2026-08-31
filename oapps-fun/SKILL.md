---
name: oapps-fun
description: >-
  Build an app destined for oapps.fun (an oApp): the zero-secrets discipline,
  why every capability must be steward-owned ("if Bounded can't do it, you
  can't do it"), how to call out unsupported capabilities honestly, the
  x402 relay fallback for services Bounded doesn't natively provide, and the
  lifecycle: private bounded.page development, completed Open publication at
  the exact workload app-id host, and explicit Commence for the oApps slug,
  listing, token, and Gauntlet. Use
  whenever a user says the app will launch on oapps.fun, become an oApp,
  be community-owned / token-governed, or "outlive its creator". Part of the
  Bounded skill family; the mechanics live in bounded-backend / bounded-onchain.
---

# Building for oapps.fun (oApps)

An **oApp** is an app that outlives its creator: it launches on
[oapps.fun](https://oapps.fun), gets a token, a build fund, and a community
that governs it. Bounded is the steward that operates it. The standard is at
[oapps.org](https://oapps.org); the operational story is at
[oapps.fun/under-the-hood](https://oapps.fun/under-the-hood).

Everything in this skill follows from one design goal:

> **The creator must not be able to rug the app.** Not "promises not to";
> structurally can't.

So for oApps:

- **Everything must be Bounded-owned.** Hosting, data, auth, payments,
  wallets, onchain access, AI: all provided by the runtime, billed to the
  app's own buckets, governed by its proven policy.
- **Zero secrets.** No API keys, no vendor accounts, no credentials in
  anyone's drawer. A key in the creator's name is exactly the lever the rule
  removes, so `secrets` is refused on an oApp function.
- **If Bounded can't do it, you can't do it.** A smaller app nobody can kill
  beats a bigger app with a kill switch.

## Reference router

Read only the page for the current step.

| Task or term | Read |
|---|---|
| Local -> Bounded -> Open -> Commence, `sitePrivate`, one launch per creator app, `oapp_creator_already_launched`, `/l/<rootAppId>`, what Open publishes, `sourcePush` | [lifecycle](docs/lifecycle.md) |
| `publish-oapp` refusals, required `boundaries` rows, `boundaries.egress`, `gov-frozen`, reproducible dist (`static` / `built`), no-frontend apps, `bounded propose` | [launch gate](docs/launch-gate.md) |
| A requested capability: native, x402 relay, or call it out; forbidden dependencies; `X402_FETCH` | [capability ladder](docs/capability-ladder.md) |
| `bounded oapp rehearse`, bootstrap from zero data | [rehearse](docs/rehearse.md) |
| Everything to confirm before Open and before Commence | [checklist](docs/checklist.md) |

Mechanics (policy, functions, wallets, payments) live in **bounded-backend**,
**bounded-frontend**, and **bounded-onchain**.

## The lifecycle in one screen

1. **Local.** A normal repo; nothing deployed.
2. **Bounded (development).** `bounded init`, `bounded verify`, `bounded deploy`,
   `bounded site deploy dist --with-source`. The app gets a development address
   such as `myapp-x7k2.bounded.page`; keep it **private** (`sitePrivate`) and do
   not flip it public yourself. Keep the creator app at the protocol it was
   created with: do NOT re-create it as `realtime_mainnet` and do not pass
   `--protocol`. Open does the mainnet part.
3. **Open (public, awaiting Commence).** Completed Open creates a venue-owned
   root and workload on Solana **mainnet** (the platform sets this; the on-chain
   owner is a Bounded-custodied key, not your wallet), publishes the workload
   site and source at `https://<workloadAppId>.bounded.page`, and the stable
   venue page at `/l/<rootAppId>`. Your creator app stays a disconnected
   sandbox; never `bounded deploy` at the opened root or workload.
4. **Commence.** An explicit action that claims `<slug>.oapps.fun`, writes the
   listing, creates the token sale, and starts the Gauntlet. **One creator app
   launches exactly once**: after Commence the slug is permanent and frozen, and
   a further opening is refused with `oapp_creator_already_launched` (409). Pick
   the slug before Commence; start a different app for a second oApp.

`onchain: true` collections are not Openable yet
(`oapp_opening_onchain_policy_unsupported`); embedded wallets, payments, and
plugin calls are fine. Say so plainly and stop rather than work around it.

## The capability ladder

For EVERY capability the user asks for, resolve in this order and never skip to
a workaround:

1. **Native first**: `ctx.ai`, `ctx.services`, payment rails, embedded wallets
   and DEX/token plugins, data/auth/realtime/files/functions.
2. **x402 relay second**: the counterparty prices itself with x402, so Bounded
   pays it per call from the steward relay wallet on the app's behalf
   (`ctx.services.invoke("X402_FETCH", ...)`).
3. **Call it out**: say what can't be done, which person-held dependency it
   would need, why the rule exists, and the nearest compliant alternative. Then
   build the compliant version. Never "temporarily" add a user-held secret.

Details, forbidden dependencies, and relay semantics: [docs/capability-ladder.md](docs/capability-ladder.md).

## Before you let go

- Boundaries are written early: `posture: "closed"`, `binding: "all"`, a declared
  `egress` (an empty `allow` IS a declaration), and a `"mode": "locked"` freeze
  over `openApps` only. Never freeze `boundaries` or set `amend` on the creator
  app; the platform derives those on the launched clone.
- `policy.json` has no rule, function, or egress that depends on a user-held
  credential; `bounded verify` passes; every external egress is declared.
- Source rides the deploy (`sourcePush: true` or `--with-source`), the synced
  tree is the real complete project, and a deployed dist is reproducible from it.
- The user knows Open publishes the site, the source, and the boundaries, and
  that a no-frontend app's home page is the public repo view.

Full list: [docs/checklist.md](docs/checklist.md).
