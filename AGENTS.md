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

## Content rules

- Behavior documented here is owned by `bounded-monorepo` and `bounded-cli`; changes originate there, and those repos require updating this one in the same task.
  Do not "fix" documented behavior here first; verify against the owning repo.
- Document only what a public skill user can reach.
  Internal platform-operator material (release evidence tooling, deploy wrappers, secrets layout, the shared Solana runtime release process) must never be copied in here, even as background.
