# bounded-skill

## What this codebase does

This is the public agent-facing documentation and examples for Bounded. Users install it from bounded-sh/skill, and agents follow its routers, policy examples, SDK guidance, deployment commands, onchain recipes, and editor drop-ins to build applications. GitHub main is the publication registry. Most active content is Markdown with embedded executable JSON, JavaScript, shell, and policy fragments; the repository also contains validation and policy E2E scripts.

## Auth shape

- `@user.id` is the normal ownership and membership identity; `@user.address` is only for wallet and onchain identity.
- `runAs`, `actAs`, `ctx.user`, and `@origin` define the principal and provenance for function and live calls.
- Collection rules and the reserved owner/admin/developer/viewer identity sets govern data access; denied reads may be empty successful responses.
- Service keys are backend principals and must remain app-scoped and secret; browser code must not receive provider keys, service keys, or private keys.
- Onchain safety also depends on signer/source confinement, account derivation, policy invariants, provider attestation where applicable, and validation of the exact transaction intent.

## Threat model

The primary risk is guidance that an agent reasonably copies into a deployed app and that the current platform accepts, allowing an unrelated or lower-privileged attacker to steal funds, take over an app/account/wallet/deployment, sign or execute unauthorized transactions, bypass authorization, cross users/apps/tenants, steal credentials, or escalate privilege. Documentation must be read as a complete page with its warnings, prerequisites, intended actor, trust model, and downstream platform defenses. Partial snippets, conceptual transcripts, intentionally public collections, and generated references are not vulnerabilities merely because production context is omitted.

## Project-specific patterns to flag

- Policy examples that let a writer choose or later mutate owner, tenant, role, membership, authority, signer, source, destination, amount, or cap scope without binding it to authenticated identity or immutable state.
- Functions or live hooks whose documented `runAs` or `actAs` changes `@user`, but whose authorization does not bind `@origin` or the original caller.
- Conserved ledgers, marketplaces, escrows, treasuries, delegated caps, or cross-document actions that are not atomic or do not enforce conservation, balance, ownership, and tenant constraints against attacker-selected values.
- Client/deploy guidance that exposes credentials, selects the wrong app/account, weakens verification, grants excessive roles, or signs transaction bytes whose program, accounts, amounts, destinations, slippage, or replay properties are not confined.
- Onchain examples where direct program invocation, remaining-account indices, PDA derivation, simulator/program divergence, empty payload attestation behavior, or provider-built instructions defeat an offchain-only defense.

## Known false-positives

Before validating any candidate, compare it against the complete register at `/Users/athar/Desktop/workspace/poof-new/bounded-monorepo/security-audit/KNOWN_FALSE_POSITIVES.md`, then check again before confirmation. If path, root cause, behavior, and trust model match, exclude it without adding it to findings or rejected/uncertain reports. Honor accepted provider and attestation trust assumptions. Do not dismiss a direct Solana instruction merely as internal, trust offchain account resolution when instruction arguments remain caller-controlled, assume policy rules help when all state is attacker-created, or assume every plugin call is attested.
