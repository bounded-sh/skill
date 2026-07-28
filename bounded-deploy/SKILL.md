---
name: bounded-deploy
description: >-
  Ship and configure a Bounded app: the bounded CLI (init, verify, deploy, share,
  data), hosted web deploy/preview/privacy, multi-environment policy files,
  cloud source sync (source rides the deploy; clone/pull), custom domains and
  vanity slugs, and account/project config (bounded.json, account profiles,
  credentials, key safety). Use when
  deploying, releasing, sharing access, publishing a frontend, or configuring
  the project and its accounts. Part of the Bounded skill family; policy
  authoring lives in bounded-backend, client work in bounded-frontend.
---

# Bounded deploy

How a Bounded app is built, shipped, configured, and shared. `bounded deploy`
validates, compiles, and pushes the policy (it re-runs the proof gate and fails
closed on a regression). This skill covers the CLI, environments, cloud source
sync, domains, and the account/config surface. Policy content lives in the
**bounded-backend** skill. To route across the family, see the root **bounded**
skill.

## Task Router

| User task | Read |
|---|---|
| CLI commands (init, verify, deploy, tests, share, data) | [docs/cli-reference.md](docs/cli-reference.md) |
| Publish or preview a web frontend; configure private/public site access | [frontend-hosting.md](../bounded-frontend/docs/frontend-hosting.md) · [docs/cli-reference.md](docs/cli-reference.md#backend-code--hosting-deployed-through-bounded) |
| Multi-environment policy files | [docs/environments.md](docs/environments.md) |
| Sync source to the cloud (`sourcePush`, `--with-source`), `bounded clone`/`pull`, the public source page | [docs/source-sync.md](docs/source-sync.md) |
| Custom domains and vanity slugs | [docs/domains.md](docs/domains.md) |
| Page blank in an iframe, `nosniff` refusing a script, or "who can embed my app" | [docs/domains.md](docs/domains.md#security-headers-on-every-served-page) - Bounded sets security headers on every served page; your app is framable by itself and a Bounded venue only, and you cannot override them from HTML. |
| Project config, `bounded.json`, account profiles, web login, key safety | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| Recover an app policy deploy that reports `deploy_in_progress`, inventory apps after a project-limit error, or prove the exact active policy/runtime publication after deploy | Run only the exact owner-visible `recoveryCommand` and let the CLI poll any `202` processing response, or use `bounded apps list --json` and `bounded apps inspect --app-id <id> --json`; see [docs/cli-reference.md](docs/cli-reference.md#recover-an-in-progress-policy-deploy) and [exact release provenance](docs/cli-reference.md#exact-release-provenance). |
| Retain release evidence for a policy plus hosted site, or overlay a capability catalog from acceptance | Prove the exact active publication and current site bytes, re-inspect after upload, and keep mutable acceptance evidence outside the immutable artifact it certifies by using the public-data deployment-epoch lifecycle in [docs/cli-reference.md](docs/cli-reference.md#exact-release-provenance). |
| Share an app / add a collaborator / grant admin, deploy, or billing rights | `bounded share <email-or-wallet> --role admin\|developer\|viewer\|billing --app-id <id>` (owner-only). Do NOT hunt for an allowlist in app code; the control plane governs access. Capability matrix in the **bounded-backend** skill's access-control doc. |
| Hit `requires a keypair` / `401` / `403` on deploy/site deploy, or about to conclude "blocked on the owner" / "no access" | [docs/access-playbook.md](docs/access-playbook.md) — DON'T give up. Run `bounded whoami` + `bounded access --app-id <id>`; switch identity (`account use --web`/`--global`); web-account deploys work (update the CLI if it refuses). |

## Term Router

| If you see | Read |
|---|---|
| `requires a keypair`, `401`/`403` on deploy, "blocked on the owner", "no access", `bounded access`, `bounded whoami`, wrong identity selected, cross-account collaborator | [docs/access-playbook.md](docs/access-playbook.md) |
| `boundary_violation`, "Blocked by this app's boundaries", site/policy deploy refused for EVERY identity, `amend: none` vs `amend: creator`, boundary lock | [docs/access-playbook.md](docs/access-playbook.md) §5 |
| `sourcePush`, `--with-source`/`--no-source`, `source synced:`, `widget editing base ready`, `site seed-build-base`, empty `/__bounded/source`, `bounded edit`/`bounded live-edit`/`bounded dashboard` (removed legacy) | [docs/source-sync.md](docs/source-sync.md) |
| `bounded.json`, `bounded account use --web`, account profiles, `.bounded/app.json`, `~/.bounded/credentials`, `~/.bounded/web-session.json`, `BOUNDED_PRIVATE_KEY` | [docs/key-and-account-safety.md](docs/key-and-account-safety.md) · [docs/cli-reference.md](docs/cli-reference.md#project-config--boundedjson) |
| `409`, `202`, `deploy_in_progress`, `processing`, `operationId`, `recoveryCommand`, `--recover-operation` | [docs/cli-reference.md](docs/cli-reference.md#recover-an-in-progress-policy-deploy) - the verified app owner reconciles only the exact retained operation with unchanged policy inputs and lets the CLI poll. |
| `402` on `deploy --create`, `project_limit_exceeded`, `dimension: "maxProjects"`, "3 free projects", `bounded apps list`, `bounded apps inspect` | [../bounded/docs/billing.md](../bounded/docs/billing.md) - inspect the account inventory, confirm access and protocol compatibility, and never delete or repurpose a project automatically. |
| `bounded domains slug`, mapped hosts, custom domain | [docs/domains.md](docs/domains.md) |
| `bounded tests run/push/list/pull`, policy tests | [docs/cli-reference.md](docs/cli-reference.md) · [policy-tests.md](../bounded-backend/docs/policy-tests.md) |

## Setup

```bash
curl -fsSL https://get.bounded.sh/install.sh | sh
bounded init
bounded verify
bounded deploy --create --name my-app
```

`bounded init` writes `policy.json` and public project config. The CLI then uses the account source that config selects: wallet/keypair mode (`global`, `project`, `profile`, or `env`) or web-account mode (`bounded account use --web` then `bounded login`). Do not commit private keys or secrets.

## Rules Of Thumb

- Read project config first when entering an existing app; it tells you which app/environment/account source to use.
- Claim a vanity slug with `bounded domains slug ...` and share the slug/custom-domain host, never a raw app-id host, as the public URL.
- Resolve the hosted URL in the intended environment with `bounded domains list --app-id <id> --env <environment> --json` and use its nonempty `slugUrl`, or retain the `url` from the exact successful `bounded site deploy ... --env <environment> --json` receipt.
- For staging provenance, require the JSON field itself instead of copying a human-rendered hostname.
- `bounded apps inspect` carries no hosted URL; use it only to prove the exact active policy/runtime publication.
- Production vanity hosts use `*.bounded.page`, while an isolated staging control plane may return `*.staging.bounded.page`; never synthesize a production hostname for a staging app.
- To give a person or agent access, reach straight for `bounded share ... --role ...`; confirm with `bounded access --app-id <id> --json`.
- After a release-critical policy deploy, use `bounded apps inspect --app-id <id> --json` to prove the exact active publication. Do not treat a toast, human success line, or immediate data read as deployment provenance.
- If policy deployment reports `deploy_in_progress` with an `operationId`, do not repeat a normal deploy.
  The verified app owner must run the exact emitted `recoveryCommand` with the unchanged policy file and inputs.
  The CLI does not submit another policy mutation, and it keeps polling when recovery returns `202` with `state: "processing"` while the server re-runs the proof, compiler, and exact-state reconciliation.
- For Solana Devnet recovery, an exact finalized target publishes the frozen app/runtime target without replaying an onchain mutation.
  An exact finalized source makes the retained operation terminal, after which the caller runs a fresh normal `bounded deploy`.
  Unavailable finalized state remains locked and pollable; partial or contradictory state remains locked for manual intervention.
- For a release-critical policy plus site deployment, use the receipt `url` or fresh environment-qualified `slugUrl` to independently hash the immutable current site files, then re-run `bounded apps inspect` after the site upload.
  Require the exact policy and runtime publication to remain unchanged.
- Never bake mutable acceptance evidence into the generated site artifact whose exact bytes that evidence certifies.
- Keep the generated catalog as an immutable inventory baseline, publish `deployed_unverified` release evidence into a public-read and authority-write Bounded collection after deployment, and overlay exact accepted scenario evidence at runtime.
- If local receipt retention succeeds but public evidence publication fails, retry an explicit retained-receipt publication path after rechecking current provenance instead of rerunning state-changing acceptance actions with the same run ID.
- Never conclude "no access / blocked on the owner" from a `requires a keypair`/`401`/`403`. Run `bounded whoami` + `bounded access --app-id <id>` and check under each identity first — see [docs/access-playbook.md](docs/access-playbook.md).
- `bounded deploy` re-runs the proof gate; a `DISPROVED` result blocks the deploy. See the bounded-backend skill for counterexamples.
