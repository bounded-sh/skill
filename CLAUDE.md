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

For plugin-reference, policy-example, or policy-routing changes, also run:

```sh
node scripts/extract-plugin-catalog.mjs --check
node scripts/generate-plugin-catalog.mjs --check
node scripts/policy-e2e/run.mjs
```

The E2E gate uses the sibling `bounded-monorepo` local stack. JSON parsing and
link checks alone do not qualify an example-policy change for publication.

## Generated plugin reference layer

`bounded-onchain/docs/plugins.md`, `bounded-onchain/docs/plugin-signatures.md`, and
`bounded-onchain/docs/plugins/*.md` are GENERATED from
`bounded-onchain/data/plugin-catalog.json`; never hand-edit them.
Curated prose lives in `bounded-onchain/docs/plugins/_fragments/`. When the
monorepo changes a plugin manifest (or the capability table changes):

```sh
node scripts/extract-plugin-catalog.mjs    # refresh the snapshot from bounded-monorepo
node scripts/generate-plugin-catalog.mjs   # re-render the pages
```

`node scripts/extract-plugin-catalog.mjs --check` fails when the snapshot is
stale versus the monorepo; the contract tests fail when the pages drift from
the snapshot or the capability table.

## Example-policy e2e suite (optional, maintainer-only)

Every page under `*/docs/examples/` embeds one deployable policy, exercised by
`node scripts/policy-e2e/run.mjs` against the bounded-monorepo local platform.
This is NOT part of the required gate: it depends on a sibling
`bounded-monorepo` checkout with its local stack booted
(`./dev fresh smoke --yes --profile full --detach`), which normal contributors
do not have - without it the suite prints SKIPPED and exits 0. `node
scripts/validate.mjs` stays fully self-contained and is the only required
pre-push gate. Maintainers changing an example page (or releasing example
changes) run the suite with `--require`, which turns a missing stack into a
failure; specs live in `scripts/policy-e2e/specs/`.

## Content rules

- Behavior documented here is owned by `bounded-monorepo` and `bounded-cli`; changes originate there, and those repos require updating this one in the same task.
  Do not "fix" documented behavior here first; verify against the owning repo.
- Document only what a public skill user can reach.
  Internal platform-operator material (release evidence tooling, deploy wrappers, secrets layout, the shared Solana runtime release process) must never be copied in here, even as background.
