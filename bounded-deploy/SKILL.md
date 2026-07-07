---
name: bounded-deploy
description: >-
  Ship and configure a Bounded app: the bounded CLI (init, verify, deploy, share,
  dashboard), multi-environment policy files, local live-edit deploys, custom
  domains and vanity slugs, and account/project config (bounded.json, account
  profiles, credentials, key safety). Use when deploying, releasing, sharing
  access, or configuring the project and its accounts. Part of the Bounded skill
  family; policy authoring lives in bounded-backend, client work in
  bounded-frontend.
---

# Bounded deploy

How a Bounded app is built, shipped, configured, and shared. `bounded deploy`
validates, compiles, and pushes the policy (it re-runs the proof gate and fails
closed on a regression). This skill covers the CLI, environments, live-edit,
domains, and the account/config surface. Policy content lives in the
**bounded-backend** skill. To route across the family, see the root **bounded**
skill.

## Task Router

| User task | Read |
|---|---|
| CLI commands (init, verify, deploy, share, dashboard, data) | [docs/cli-reference.md](docs/cli-reference.md) |
| Multi-environment policy files | [docs/environments.md](docs/environments.md) |
| Live-edit a running app (`bounded live-edit validate`/`deploy`, daemon, widget feedback, agent jobs, `/apps/:appId/...`) | [docs/live-edit.md](docs/live-edit.md) |
| Custom domains and vanity slugs | [docs/domains.md](docs/domains.md) |
| Project config, `bounded.json`, account profiles, web login, key safety | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| Share an app / add a collaborator / grant admin, deploy, or billing rights | `bounded share <email-or-wallet> --role admin\|developer\|viewer\|billing --app-id <id>` (owner-only). Do NOT hunt for an allowlist in app code; the control plane governs access. Capability matrix in the **bounded-backend** skill's access-control doc. |

## Term Router

| If you see | Read |
|---|---|
| `bounded live-edit validate`, `bounded live-edit deploy`, `/apps/:appId/propose`, `/apps/:appId/validate`, `/apps/:appId/deploy`, widget feedback | [docs/live-edit.md](docs/live-edit.md) |
| `bounded.json`, `bounded account use --web`, account profiles, `.bounded/app.json`, `~/.bounded/credentials`, `~/.bounded/web-session.json`, `BOUNDED_PRIVATE_KEY` | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| `bounded domains slug`, mapped hosts, custom domain | [docs/domains.md](docs/domains.md) |

## Setup

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
bounded deploy --create --name my-app
bounded verify
bounded dashboard
```

`bounded init` writes `policy.json` and public project config. The CLI then uses the account source that config selects: wallet/keypair mode (`global`, `project`, `profile`, or `env`) or web-account mode (`bounded account use --web` then `bounded login`). Do not commit private keys or secrets.

## Rules Of Thumb

- Read project config first when entering an existing app; it tells you which app/environment/account source to use.
- Claim a vanity slug with `bounded domains slug ...` and share the slug/custom-domain host, never a raw app-id host, as the public URL.
- To give a person or agent access, reach straight for `bounded share ... --role ...`; confirm with `bounded access --app-id <id> --json`.
- `bounded deploy` re-runs the proof gate; a `DISPROVED` result blocks the deploy. See the bounded-backend skill for counterexamples.
