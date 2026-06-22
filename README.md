# Bounded — agent skill

The agent skill for **[Bounded](https://bounded.sh)**: a provable, realtime
backend an agent builds from a description. This repo's [`SKILL.md`](SKILL.md) is
a router that teaches a coding agent how to author a `policy.json` (collections,
rules, and provable **invariants**), run `bounded verify` for SMT proof reports,
deploy through the fail-closed proof gate, and read/write data via the
`@bounded-sh` SDK or the `bounded` CLI.

## Install

```sh
npx skills add bounded-sh/skill
```

Works with Claude Code, Cursor, Codex, Gemini CLI, and others. Update later with
`npx skills update bounded`. The Bounded CLI installer adds it for you too:

```sh
curl -fsSL https://get.bounded.sh/install.sh | sh
```

## What's inside

- `SKILL.md` — the router (intent → the one doc that answers it).
- `docs/` — reference docs (policy language, invariants, auth, SDK, functions, hosting, …).
- `guides/` — end-to-end build guides (web app, backend, agents, React Native).
- `examples/` — sample policies.

## Maintainers

Edit the docs here, then publish by pushing to `main` (this repo is the `npx
skills` source). Full release process for the skill and every other Bounded
component is in the master runbook →
[bounded-cli `release/PUBLISHING.md`](https://github.com/poofdotnew/bounded-cli/blob/main/release/PUBLISHING.md).
