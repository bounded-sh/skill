---
name: openapps
description: Build or update apps for OpenApps (openapps.xyz, formerly oapps.fun), including work by an app's own agent. Covers zero-secret capabilities and publication; excludes work on the OpenApps platform itself.
---

# OpenApps

An oApp is a Bounded app with its own agent that can open to its community, so it can outlive its creator.
Use this skill for the app's capability constraints and, when requested, its lifecycle: Owned, on sale, and Open.

## Choose the workflow

- **Owner building an app or asking to open it:** use the lifecycle, launch-gate, and preflight references for the current phase.
  A build or edit request does not by itself request opening; continue work already authorized by the user.
- **Agent running on an OpenApps app computer:** the app already exists and you are its agent.
  Apply the capability constraints below and use the installed runtime-specific instructions for previews, releases, proposals, and the app's mode (`openapps-internal` when provided).
  Do not repeat creator initialization or ask to open the app to update it.
  Repo notes such as `AGENTS.md` and `README.md` may predate OpenApps; correct any fact they state that the run context contradicts (the owner, whether it is an OpenApps app) in your next commit.
  If those runtime instructions are unavailable, continue inspection and local work that the environment supports, and identify the missing instructions before attempting a governed release.

## Capability constraints

- Use Bounded-managed hosting, data, auth, payments, wallets, onchain access, and AI, billed to the app's own credit pool and governed by its policy.
- To hold USDC between two people for a deal, use the venue escrow in the SDK (`fundVenueEscrow`, `disputeVenueEscrow`, `getVenueEscrow`), called from the app's own client: [SDK reference](../bounded-frontend/docs/sdk-reference.md#venue-escrows---fundvenueescrow--disputevenueescrow--getvenueescrow).
  Do not build an escrow, a backend, or a wallet to hold or move that money.
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
| The agent an app has from creation, Owned / on sale / Open, asking to open, the token sale, mainnet, source sync, one sale per app | [Lifecycle](docs/lifecycle.md) |
| App capability availability, unsupported dependencies, catalog requests, x402 payment and recovery semantics | [Capability ladder](docs/capability-ladder.md) |
| What opening checks: oApp mode, required boundaries and egress grants, secrets, the served site and reproducible dist, `bounded propose` | [Launch gate](docs/launch-gate.md) |
| `bounded oapp preflight` and its report | [Preflight](docs/preflight.md) |
| Preparing to ask to open | [Opening checklist](docs/checklist.md) |
| Sealed launch economics, treasury fees, pending claims, operating reserves, and how credits are topped up (including automatic SOL conversion) | [Launch economics](docs/launch-economics.md) |

For implementation mechanics, use [bounded-backend](../bounded-backend/SKILL.md), [bounded-frontend](../bounded-frontend/SKILL.md), or [bounded-onchain](../bounded-onchain/SKILL.md) as needed.
