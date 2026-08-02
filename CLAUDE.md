# bounded-skill

The public, agent-facing documentation of Bounded: the root router skill plus the per-area skills (backend, frontend, deploy, onchain, teams), with editor drop-ins under `agents/`.
Users install it with `npx skills add bounded-sh/skill`, and GitHub `main` IS the registry: a push to `main` publishes.

## Team conventions

- Never use the em dash "—"; use a plain dash "-".
- Never auto-add an agent name as commit co-author.

## Before every push

```sh
node scripts/validate.mjs
```

It must pass; there is no CI here, and `main` is what users pull.

## Content rules

- This repo documents surfaces owned by `bounded-monorepo` and `bounded-cli`; behavior changes originate there, and those repos' instructions require updating this one in the same task.
  Do not "fix" documented behavior here first; verify against the owning repo.
- Document only what a public skill user can reach.
  Internal platform-operator material - the shared Solana runtime release process, release evidence tooling, deploy wrappers, secrets layout - must never be copied in here, even as background.
- Keep support and verification claims separate and honest: the Solana capability table is generated from the Devnet lab and classifies devnet only; the program being live on mainnet-beta does not make a devnet row a mainnet guarantee.
- Mainnet facts that must stay accurate together (2026-08): mainnet apps are owned on-chain by the creator's wallet, immutably, and cannot be ownership-transferred or ejected; mainnet creation is granted by the account plan (`pro`/`enterprise`) with no API key or shared secret; `bounded deploy` mints, signs (locally), and submits the authority permit itself, bound to the exact policy.
