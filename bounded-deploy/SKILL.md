---
name: bounded-deploy
description: >-
  Ship and configure a Bounded app: CLI setup, browser-backed developer login,
  verify and deploy, hosted frontend publishing, environments, source sync,
  domains, bounded.json, collaborators, and release recovery. Part of the
  Bounded skill family.
---

# Bounded deploy

Use this skill to initialize, verify, ship, configure, and share a Bounded app.
Policy authoring belongs in **bounded-backend**; client code and app-user auth
belong in **bounded-frontend**.

## Default workflow

For a new project or a normal release, read
[docs/quickstart.md](docs/quickstart.md). The expected path is:

```bash
bounded init
bounded verify
bounded deploy --create --name my-app
```

`bounded init` reuses a saved web session or opens hosted browser login. It
writes public `bounded.json` and `policy.json`; credentials never belong in
either file.

## Task router

Read only the reference needed for the current task.

| Task | Read |
|---|---|
| First setup, normal verify/deploy, publish a site | [docs/quickstart.md](docs/quickstart.md) |
| Normal web account login, session refresh, headless OTP, account switching | [docs/accounts.md](docs/accounts.md) |
| Hosted web frontend, preview, private/public access | [frontend-hosting.md](../bounded-frontend/docs/frontend-hosting.md) |
| Multi-environment policies: per-env app id, constants, schedule cadence, function scoping | [docs/environments.md](docs/environments.md) |
| Build an app from a prompt, iterate with `edit`, watch/cancel/gate a run | [docs/cli-reference.md](docs/cli-reference.md) (Prompt-driven builds) |
| Source sync, `--with-source`, clone, pull | [docs/source-sync.md](docs/source-sync.md) |
| Custom domains and vanity slugs | [docs/domains.md](docs/domains.md) |
| Share, access, owner mismatch, `401`/`403` | [docs/access-playbook.md](docs/access-playbook.md) |
| Delete an app permanently (browser-confirmed, owner only) | [docs/cli-reference.md](docs/cli-reference.md) (`apps delete`) |
| Uncommon command or exact flag lookup | [docs/cli-reference.md](docs/cli-reference.md) |
| Local signing keys, profiles, CI key auth, legacy key-owned apps | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) |

Do not load the local-key reference during normal onboarding. It is an advanced
alternative for users who explicitly request local signing, CI key auth, an
account profile, or recovery of an existing key-owned app.

## Incident router

- `deploy_in_progress`, `operationId`, or `recoveryCommand`: use only the exact
  owner-visible recovery command with unchanged inputs, then let the CLI poll.
  See [deploy recovery](docs/cli-reference.md#recover-an-in-progress-policy-deploy).
- An error with `code`/`state` but NO `recoveryCommand` is terminal for that
  operation - `410 policy_operation_unrecoverable` and the abandoned, superseded,
  target-mismatch and manual-intervention states. Re-running the recovery can
  never commit it; run a fresh `bounded deploy` (or escalate, when the message
  says operator review). Never invent a recovery command for these.
- Unsure which applies, or unsure whether a fresh deploy is safe: run the
  read-only `bounded deploy status --json` first. It reports what holds the
  deploy slot and a `freshDeploySafe` verdict, and it never mutates anything.
- `site_control_denied`, wrong owner, or unexpected `401`/`403`: run
  `bounded whoami` and `bounded access --app-id <id>` before changing identity.
  See [access playbook](docs/access-playbook.md).
- `project_limit_exceeded`: inventory apps; never delete or repurpose one
  automatically. If the user decides an app should go, `bounded apps delete`
  exists but always requires the human to confirm in the browser. See
  [billing](../bounded/docs/billing.md).
- `boundary_violation`: changing accounts will not bypass an app boundary. Use
  the boundary-lock section of the access playbook.

## Release rules

- Read `bounded.json` first in an existing app.
- If it declares `instances`, select one with `--instance` or
  `defaultInstance`. The selected entry binds app ID, control plane, policy
  target, and frontend build target as one tuple.
- Ordinary policy, function, and site deployment does not sync source. Use
  `sourcePush: true` or `--with-source` only when a source-backed workflow is
  explicitly required.
- Regenerate a generated `policy.json` before both verify and deploy.
- `bounded verify` is the fast proof loop; `bounded deploy` still fails closed
  if the exact deployed policy does not pass its release gate.
- After a release-critical deploy, use
  `bounded --instance <name> apps inspect --json` to confirm the active policy and
  runtime publication before measuring behavior.
- Resolve the hosted URL from the exact site receipt or
  `bounded domains list --app-id <id> --env <environment> --json`. Do not invent
  a hostname.
- Share control-plane access with
  `bounded share <email-or-wallet> --role admin|developer|viewer|billing`.
- Do not commit credentials, web sessions, refresh tokens, or provider secrets.
