---
name: openapps
description: Build or update apps for OpenApps (openapps.xyz, formerly oapps.fun), including work by an app's own agent. Covers zero-secret capabilities and publication; excludes work on the OpenApps platform itself.
---

# OpenApps

An oApp is a Bounded app governed by its community so it can outlive its creator.
Use this skill for the app's capability constraints and, when requested, its publication lifecycle.

## Choose the workflow

- **Creator building or publishing an app:** use the lifecycle, launch-gate, and preflight references for the current phase.
  A build or edit request does not by itself request Open or Commence; continue work already authorized by the user.
- **Agent running on an OpenApps app computer:** the app already exists.
  Apply the capability constraints below and use the installed runtime-specific instructions for previews, releases, and proposals (`openapps-internal` when provided).
  Do not repeat creator initialization, Open, or Commence to update it.
  If those runtime instructions are unavailable, continue inspection and local work that the environment supports, and identify the missing instructions before attempting a governed release.

## Capability constraints

- Use Bounded-managed hosting, data, auth, payments, wallets, onchain access, and AI, billed to the app's own credit pool and governed by its policy.
- An oApp cannot depend on a creator-held API key, vendor account, server, or admin backdoor.
  The runtime refuses `secrets` on oApp functions.
- Prefer native capabilities or live catalog actions, then the steward's x402 relay for supported paid APIs.
  For a capability whose availability is unknown, use `bounded services search "<need>"` and read the [capability ladder](docs/capability-ladder.md).
  Credential-free public endpoints still require declared egress.
- If a capability is unavailable, explain the constraint and the nearest compliant alternative, and continue the independent work within the user's scope.
  Do not silently replace a required feature or add a personal secret to bypass the constraint.

## References

Read the reference needed for the current task.

| Task | Read |
|---|---|
| Creator development, Open vs Commence, public URLs, source sync, one launch per creator app | [Lifecycle](docs/lifecycle.md) |
| App capability availability, unsupported dependencies, catalog requests, x402 payment and recovery semantics | [Capability ladder](docs/capability-ladder.md) |
| Publication refusals, required boundaries and egress, reproducible dist, `gov-frozen`, `bounded propose` | [Launch gate](docs/launch-gate.md) |
| `bounded oapp preflight`, rehearsal, bootstrap from zero data | [Preflight and rehearsal](docs/rehearse.md) |
| Preparing to Open or Commence | [Publication checklist](docs/checklist.md) |
| Sealed launch economics, treasury fees, pending claims and operating reserves | [Launch economics](docs/launch-economics.md) |

For implementation mechanics, use [bounded-backend](../bounded-backend/SKILL.md), [bounded-frontend](../bounded-frontend/SKILL.md), or [bounded-onchain](../bounded-onchain/SKILL.md) as needed.
