# bounded-skill

The public, agent-facing documentation of Bounded: the root router skill plus the per-area skills, with editor drop-ins under `agents/`.
Users install it with `npx skills add bounded-sh/skill`, and GitHub `main` IS the registry: a push to `main` publishes.

## Conventions

- Never use the em dash "—"; use a plain dash "-".
- Never auto-add an agent name as commit co-author.

## Before every push

```sh
node scripts/validate.mjs
```

It must pass; there is no CI here, and `main` is what users pull.
It also runs the contract tests under `scripts/tests/`, so that is the whole gate;
run them alone with `node --test "scripts/tests/*.test.mjs"` while iterating.

## Generated plugin reference layer

`bounded-onchain/docs/plugins.md` and `bounded-onchain/docs/plugins/*.md` are
GENERATED from `bounded-onchain/data/plugin-catalog.json`; never hand-edit them.
Curated prose lives in `bounded-onchain/docs/plugins/_fragments/`. When the
monorepo changes a plugin manifest (or the capability table changes):

```sh
node scripts/extract-plugin-catalog.mjs    # refresh the snapshot from bounded-monorepo
node scripts/generate-plugin-catalog.mjs   # re-render the pages
```

`node scripts/extract-plugin-catalog.mjs --check` fails when the snapshot is
stale versus the monorepo; the contract tests fail when the pages drift from
the snapshot or the capability table.

## Example-policy e2e gate

Every page under `*/docs/examples/` embeds one deployable policy, exercised by
`node scripts/policy-e2e/run.mjs` against the local platform
(`bounded-monorepo ./dev fresh smoke --yes --profile full --detach` first).
Run it after changing any example page or before releasing example changes;
specs live in `scripts/policy-e2e/specs/`.

## Content rules

- Behavior documented here is owned by `bounded-monorepo` and `bounded-cli`; changes originate there, and those repos require updating this one in the same task.
  Do not "fix" documented behavior here first; verify against the owning repo.
- Document only what a public skill user can reach.
  Internal platform-operator material (release evidence tooling, deploy wrappers, secrets layout, the shared Solana runtime release process) must never be copied in here, even as background.
