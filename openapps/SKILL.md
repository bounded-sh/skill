---
name: openapps
description: Build or update apps for OpenApps (openapps.xyz, formerly oapps.fun), including work by an app's own agent. Covers the app's keys, capabilities, and preparing for an APO; excludes work on the OpenApps platform itself.
---

# OpenApps

An oApp is a Bounded app with its own agent that can open to its community, so it can outlive its creator.
Use this skill for the app's capability constraints and, when requested, its lifecycle: Owned, on sale, and Open.

## Choose the workflow

- **External coding agent working for the creator of an Owned app:** use [creator publishing](../bounded-deploy/docs/quickstart.md#publish-an-owned-openapps-frontend-from-local-source) for a tested local frontend change.
  Having an app agent does not require sending that change through an AI run.
  `bounded propose --submit --apply` still asks the app agent to apply it; it is not the no-AI publishing path.
- **Creator asking to open an app:** use the lifecycle, launch-gate, and preflight references for the current phase.
  A build or edit request does not by itself request opening; continue work already authorized by the user.
- **Agent running on an OpenApps app computer:** the app already exists and you are its agent.
  Apply the capability constraints below and use the installed runtime-specific instructions for previews, releases, proposals, and the app's mode (`openapps-internal` when provided).
  Do not repeat creator initialization or ask to open the app to update it.
  Repo notes such as `AGENTS.md` and `README.md` may predate OpenApps; correct any fact they state that the run context contradicts (the creator, whether it is an OpenApps app) in your next commit.
  If those runtime instructions are unavailable, continue inspection and local work that the environment supports, and identify the missing instructions before attempting a governed release.

The project config is `openapps.json`. An older project's `bounded.json` still works; `openapps.json` wins when a directory holds both.

The app's agent does not load `AGENTS.md`, `CLAUDE.md` or other repo agent files into its context.
What guides it is `OPENAPPS.md` at the repo root (its text is capped at 8192 bytes) and the files that file links with relative Markdown links.
Both are read at the latest published release, so an edit counts only once a release carrying it publishes.

## Capability constraints

- Use Bounded-managed hosting, data, auth, payments, wallets, onchain access, and AI, billed to the app's own credit pool and governed by its policy.
- To hold USDC for a deal, keep it in an escrow in the app's own policy that the app's agent settles: [App escrow](docs/app-escrow.md).
- An Owned app may keep services it already uses: its creator sets their keys with `bounded secret put` or Keys in the Fine print of the app's page, functions read them as `ctx.secrets`, and a [Next.js server](../bounded-frontend/docs/server-apps.md) reads them as `process.env`.
  A key never goes in source.
  `bounded secret put NAME --preview` (Previews only, on the app's page) sets the test key every preview of the app receives; the app's own value never reaches a preview.
  `bounded secret put NAME --agent --host <host>` gives the app's agent a key for its own work, sealed on its computer and sent only to those hosts.
  `bounded secret put NAME --app-id <sub-app>` sets a key on an app the app manages (`ctx.apps`) directly, without the agent donating one; the agent cannot replace it.
  Only the creator sees the Keys panel, and it lists names, never values.
- An APO requires that no person holds a key the app uses: the app holds no key a person set (its own values, preview values, or a key the creator put on its agent), and no function declares a key its agent did not donate.
  A key the app's own agent obtains and donates is fine: the platform adds it to the app's requests to that key's hosts, and a function that declares it reads only a stand-in.
- An app that runs a server cannot open yet.
  An app in an APO or Open cannot depend on a vendor account, external server, or admin backdoor that a person holds.
- Prefer native capabilities or live catalog actions, then the steward's x402 relay for supported paid APIs.
  For a capability whose availability is unknown, use `bounded services search "<need>"` and read the [capability ladder](docs/capability-ladder.md).
  Credential-free public endpoints still require declared egress.
- If a capability is unavailable, explain the constraint and the nearest compliant alternative, and continue the independent work within the user's scope.
  Do not silently replace a required feature or add a personal secret to bypass the constraint.

## References

Read the reference needed for the current task.

| Task | Read |
|---|---|
| The agent an app has from creation, live values and preview values, Owned / on sale / Open, asking to open, the token sale, mainnet, source sync, one sale per app | [Lifecycle](docs/lifecycle.md) |
| App capability availability, unsupported dependencies, catalog requests, x402 payment and recovery semantics | [Capability ladder](docs/capability-ladder.md) |
| What opening checks: oApp mode, required boundaries and egress grants, secrets, the served site, `bounded propose` | [Launch gate](docs/launch-gate.md) |
| `bounded oapp preflight` and its report | [Preflight](docs/preflight.md) |
| Hide the platform widget on an Owned app (an Open app always shows it) | [Hide the widget](../bounded-frontend/docs/frontend-hosting.md#hide-the-widget) |
| Preparing to ask to open | [Opening checklist](docs/checklist.md) |
| Sealed launch economics, treasury fees, pending claims, operating reserves, how credits stay funded, and the agent's daily limit | [Launch economics](docs/launch-economics.md) |

For implementation mechanics, use [bounded-backend](../bounded-backend/SKILL.md), [bounded-frontend](../bounded-frontend/SKILL.md), or [bounded-onchain](../bounded-onchain/SKILL.md) as needed.
