# CLI Reference — every `bounded` command

**What's in here / when to read this:** every `bounded` command + flag, grouped
by purpose. Every flag below exists in the CLI; `bounded <cmd> --help` prints the
same with an Example block.

**Global flags** (any command): `--json` (structured output for agents —
errors are emitted as JSON too), `--quiet` (minimal output), `--env`
(`production`; also `BOUNDED_ENV`).

## Identity & teams

The normal CLI identity is your **web account's user id**. `bounded init` reuses
or refreshes the saved session and opens browser login when needed. A separate
`bounded login` is useful for explicit reauthentication, account switching, or
headless OTP, but is not required before init.

The CLI also supports advanced local-signing sources:

- **Wallet/keypair sources** (advanced): `global`, `project`, `profile`, and `env`. These use
  a local ed25519 keypair (`~/.bounded/credentials`, a profile/project credentials
  file, or `BOUNDED_PRIVATE_KEY`). The keypair owns apps created with it and signs
  data-plane writes. See [auth.md](../../bounded-frontend/docs/auth.md).
- **Web account source** (default): `web`. Init opens the hosted Bounded
  sign-in page for email or social login. The CLI uses Authorization Code + PKCE,
  stores the refreshable session in `~/.bounded/web-session.json`, and selects
  `web` for the current project when one exists. It does not create or link a
  local key. Use `bounded login --email you@example.com` for a terminal OTP flow
  when a browser is unavailable.

Outside a project, control-plane commands with an explicit `--app-id` also use
the saved web session by default. They do not silently select or create
`~/.bounded/credentials`. `BOUNDED_PRIVATE_KEY` or an explicit project account
source remains an intentional wallet-mode selection.

> **Advanced wallet warning.** If you deliberately choose a wallet source and lose its credentials file
> without having linked, shared, or backed it up, every app it created can be
> orphaned forever. Treat wallet keys like SSH private keys: back them up, then run
> `bounded link` so the apps survive local key loss. Full safety model:
> [key-and-account-safety.md](key-and-account-safety.md).

> **Never commit a key.** `BOUNDED_PRIVATE_KEY` and the raw `privateKey` are
> secrets — never commit or log them. `deploy --create` writes a managed
> `.gitignore` secrets block for you (see below), but you are still responsible
> for keys you drop in a repo by hand. `~/.bounded/web-session.json` is also a
> local secret and should not be copied into a repo.

> **Running another identity:** use `bounded account use <profile>`,
> `bounded account use --project`, `bounded account use --env`, or
> `bounded account use --web` in the project, then `bounded whoami`. Profile keys
> live at `~/.bounded/accounts/<profile>/credentials`, so one project can use your
> default account and another can use a client/team account without committing
> secrets. Use `bounded login --email ...` for web mode and `BOUNDED_PRIVATE_KEY`
> for wallet-mode CI.

| Command | Does | Example |
|---|---|---|
| `version` | Print which CLI build you're on (version/commit/date). Same info via `bounded --version` / `-v`. Use after rebuilding the bundle to confirm you picked up the latest. No network/key. `--json` for fields. | `bounded version` |
| `update` | Update this release build to the latest CLI from its configured HTTPS release host. Downloads the immutable binary for this OS/architecture, verifies its SHA-256 checksum and Go build metadata, then atomically replaces the running executable. Reads no project config, account, or credentials. | `bounded update` |
| `whoami` | Show the active CLI identity: wallet address or web user id, environment, account source, login/link hint if any, and this folder's app marker if present. Wallet mode may create the selected key on first run. | `bounded whoami` |
| `login` | Log the CLI into your Bounded **web account** (the canonical identity; no key involved). By default it opens the hosted sign-in page, completes Authorization Code + PKCE through a temporary loopback callback, stores refreshable credentials in `~/.bounded/web-session.json`, and selects `account.keySource:"web"` for the current project. Use `--email <addr>` or `--no-browser` for terminal OTP when a browser is unavailable. **Headless agents:** run `bounded login --email <email>` with stdin held open, relay the 6-digit code from the user, then feed it to stdin. Never ask for or embed a reusable credential. | `bounded login` |
| `link` | **Wallet-mode anti-loss.** Explicitly attach THIS device's local wallet keypair to your web account via an **OAuth device flow** (device code + fingerprint approval at `bounded.sh/link` — agents should print that URL for their user), or use `--email` for headless OTP approval. The link is one explicit wallet-key <-> web-account pair; `bounded login` does not create it. The keypair keeps signing — linking only adds an account association, it never rolls or replaces the key. Linking is **refused** if it would merge two unlinked accounts that both already own projects. Not used for `account.keySource:"web"`. | `bounded link --email you@example.com` |
| `account` / `account use` | Show or set this project's account source in `bounded.json`: global, project, profile, env, or web. | `bounded account use --web` |
| `account transfer-to-web` | Move ownership of this key's apps to your web account (run after `bounded login`; linking is NOT required, the CLI proves key possession automatically; `--yes` to confirm, `--app <appId>` repeatable for a subset). Makes the web account the owner-of-record so the key becomes a fully detachable signing credential. Works even when `bounded link` is refused because both sides already own projects. | `bounded account transfer-to-web --yes` |
| `apps list` | Read-only inventory of every app the active account owns or collaborates on. The `projects` alias is equivalent. JSON output contains `appId`, `name`, `environment`, `protocol`, and optional `sitePrivate`. Confirm the target with `bounded access` before reuse. | `bounded apps list --json` |
| `apps inspect` | Read-only exact active-publication proof for one owned or shared app. Returns policy and runtime digests, committed operation and revision numbers, availability, protocol, and site privacy without returning policy bytes, a runtime bundle, or a hosted URL. `--app-id` defaults to `bounded.json`. | `bounded apps inspect --app-id <id> --json` |
| `dashboard [page]` | Open the hosted dashboard. In a linked project it opens that app directly; optional pages include `data/<path>`, `policy/tests`, `boundaries/change`, and `activity/logs`. `--app-id` overrides the project, `--no-open` prints guidance without launching, and `--print` emits only the URL. Staging opens the staging dashboard. The app-ID handoff is replaced by the dashboard's readable app-name URL after load. | `bounded dashboard data/orders` |
| `share <wallet\|email> --role developer\|admin\|viewer\|billing --app-id <id>` | Grant a control role. **Wallet** → direct. **Email** → tracked **by the email** and bound when that person verifies it at signup, so it works for a registered OR brand-new address (invite email sent when outbound email is configured). `policy` is accepted as a legacy alias for `developer`. Owner only. **Plan-gated by the OWNER's plan**: Free = no collaborators; Pro = up to 3, **`developer` only** (admin/viewer/billing 402 with an upgrade hint); Team+ = 25 seats and every role — default to `--role developer` unless the owner is Team+. Share BEFORE loss — there is no key-recovery command (the only ownership move is `account transfer-to-web` to your own web account). See [access-control.md](../../bounded-backend/docs/access-control.md) for what each role can do. | `bounded share teammate@example.com --role developer --app-id <id>` |
| `unshare <wallet\|email> --app-id <id>` | Remove a wallet or canonical email collaborator (owner only) | `bounded unshare teammate@example.com --app-id <id>` |
| `collaborators --app-id <id>` | List collaborators (alias: `shares`) | `bounded collaborators --app-id <id>` |
| `access --app-id <id>` | Show the access roster: your effective role, the app's external-widget setting, and every member grouped by role with per-role counts (the member list is shown only to the owner or an `access:manage` role). | `bounded access --app-id <id>` |

### `update` — native CLI upgrades

After the first installer-based setup, update the CLI without piping another
installer into a shell:

```bash
bounded update                 # install a newer published release
bounded update --force         # reinstall latest if current; upgrade if behind
bounded update --json          # one structured result for agents
```

`--force` never downgrades a build that is ahead of the published version; it
reports that no change was made.
Native replacement supports release builds on macOS and Linux, on amd64 and
arm64. It refuses development builds, unsupported platforms, unsafe executable
permissions, and symlinked launch paths (including common package-manager
installations). If a package manager owns the binary, use that package manager;
the CLI cannot identify every manager-owned regular file. If an older CLI does
not recognize `update`, run
`curl -fsSL https://get.bounded.sh/install.sh | sh` once.

`BOUNDED_BASE_URL` is a security-sensitive release-host override shared with the
installer. Leave it unset for canonical `https://get.bounded.sh`, or point it
only at a trusted HTTPS mirror with the same release layout. The checksum
manifest and binary come from that same host, so this is integrity checking
inside one distribution trust boundary, not independent signing. `--env` and
`BOUNDED_ENV` do not select a CLI update channel.

`bounded update` updates only the CLI component and its normal update-check
cache. Re-run the installer when the Bounded agent skill should be refreshed
too.

`link` flags: `--no-browser` (just print the URL), `--email <addr>` (headless
approval: email an OTP, read it from stdin, approve this wallet key), `--timeout
<dur>` (default `10m`). `login` flags: `--email <addr>` (terminal OTP),
`--no-browser` (prompt for terminal OTP). Collaboration grants
**control-plane** authority (manage the app), not a data-plane bypass — give data
powers explicitly via policy rules ([admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md)).

### Project config — `bounded.json`

`bounded init` writes public `bounded.json`; `deploy --create` fills in `appId`.
Agents should read this file first. It is safe to commit and contains no private
key material. This example explicitly opts into cloud source sync:

```json
{
  "$schema": "https://bounded.sh/schemas/bounded.schema.json",
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "environment": "production",
  "protocol": "realtime_offchain",
  "policy": "policy.json",
  "liveEdit": {
    "artifacts": true,
    "sourceProvider": "auto",
    "artifactPush": true,
    "defaultEditMode": "canonical",
    "frontendDir": "web",
    "distDir": "web/dist",
    "buildCommand": "npm run build"
  },
  "account": {
    "keySource": "web",
    "loginHint": "you@example.com"
  }
}
```

Resolution rules:

| Config | Auth material |
|---|---|
| `{"keySource":"web"}` | Bounded Auth session at `~/.bounded/web-session.json`; no local private key |
| `{"keySource":"global"}` | `~/.bounded/credentials` |
| `{"keySource":"project","keyPath":".bounded/credentials"}` | `<project>/.bounded/credentials` |
| `{"keySource":"profile","profile":"client-a"}` | `~/.bounded/accounts/client-a/credentials` |
| `{"keySource":"env"}` | `BOUNDED_PRIVATE_KEY` |

Useful commands:

```bash
bounded account                 # show this project's account source
bounded account use personal    # use ~/.bounded/accounts/personal/credentials
bounded account use --project   # use <project>/.bounded/credentials
bounded account use --global    # use ~/.bounded/credentials
bounded account use --env       # require BOUNDED_PRIVATE_KEY
bounded account use --web       # use ~/.bounded/web-session.json
bounded login --email you@example.com
```

Explicit flags still win for app/environment routing: `--app-id` and `--env`
override project defaults.
For wallet/keypair projects, a non-empty `BOUNDED_PRIVATE_KEY` overrides `account.keySource:"global"`, `"project"`, and `"profile"`.
Check `bounded whoami --json` before an identity-sensitive deploy instead of assuming the public project config selected the active key.
An explicit project `account.keySource:"web"`, and projectless control-plane commands, use the web session. Exact app-bound data-plane operations such as `data`, `subscribe`, `functions invoke`, and `runtime invoke` still require a selected local signer until the platform exposes a browser-session token exchange for those services.
Older projects with only `.bounded/app.json` still work; the CLI falls back to that marker when `bounded.json` is absent.

`bounded whoami --json` separates the stable machine value from the descriptive location:

```json
{
  "authSource": "wallet",
  "keySource": "global",
  "keyLocation": "global (~/.bounded/credentials)",
  "environment": "staging",
  "address": "<public-wallet-address>"
}
```

`keySource` is one of `global`, `project`, `env`, `web`, `profile`, or `unknown`.
Use `keySource` for release checks and `keyLocation` only as a human-readable diagnostic.
The human `bounded whoami` output continues to print the descriptive location.
Identity-sensitive automation should also require the expected environment, `authSource`, public identity, and absence of an unexpected `connection` object.

Cloud source sync is opt-in and rides the deploy: set `"sourcePush": true` in
`bounded.json` (or pass `--with-source`) and every deploy also pushes the
project source tree to the app's cloud source repository. See
[source-sync.md](source-sync.md). A legacy `liveEdit` block in `bounded.json`
is ignored with a deprecation notice (`liveEdit.artifactPush: true` is honored
as `sourcePush: true`).

### The per-app marker — `.bounded/app.json`

On `deploy --create`, the CLI writes a per-app marker at
`<project>/.bounded/app.json`. It records only **PUBLIC** information (never a
private key, web token, or refresh token) and is **safe to commit** — it tells
anyone with the repo which app, owner identity, env, and account source this
folder maps to:

```json
{
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "env": "production",
  "protocol": "realtime_offchain",
  "sitePrivate": true,
  "owner": "GFdiGThC8DJ5oMdDYj1xgyQJjWkje6EbzH2jdUMcuWBt",
  "ownerKeySource": "global (~/.bounded/credentials)",
  "linkedAccount": "you@example.com",
  "createdAt": "2026-06-21T18:00:00Z"
}
```

- `owner` — the public owner identity recorded at create time: a wallet address
  in wallet/keypair mode, or a Bounded Auth user id in web mode.
- `ownerKeySource` — the account source (never a key or token): one of
  `global (~/.bounded/credentials)`, `project (.bounded/credentials)`,
  `profile "<name>" (~/.bounded/accounts/<name>/credentials)`,
  `env (BOUNDED_PRIVATE_KEY)`, or `web (Bounded Auth)`. Answers "which account
  source does this app use?"
- `sitePrivate` — true when the hosted static site was created behind the
  private site gate. Older/public apps may omit it.
- `linkedAccount` — the linked or logged-in web account hint when known, blank if
  none.

`deploy --create` also maintains a managed `.gitignore` block that ignores every
secret-bearing path (`.bounded/credentials`, `*.key`, `*.keypair.json`, `.env`,
`.env.*`) while keeping the public `.bounded/app.json` marker committable. Full
treatment: [key-and-account-safety.md](key-and-account-safety.md).

## Policy lifecycle

| Command | Does | Key flags |
|---|---|---|
| `init` | Write starter `policy.json` plus public `bounded.json` | `--force` overwrite |
| `verify [policy.json]` | Run the proof engine, print the report + counterexamples | `--app-id` (defaults to `bounded.json`), `--operation`, `--constants`, `--environment` |
| `tests run [dir\|file]` | Run policy test files against a sandboxed app, print per-file PASS/FAIL | `--app-id`, `--deployed-policy`, `--file` (repeatable), `--json` |
| `tests push [dir]` | Attach local test files to the app (merge by fileName) | `--app-id`, `--replace` |
| `tests list` | List test files attached to the app | `--app-id` |
| `tests pull [--dir]` | Fetch attached test files to disk | `--app-id`, `--dir`, `--force` |
| `deploy [policy.json]` | Validate, compile, and push the policy (same fail-closed gate), or reconcile one exact retained operation without submitting another policy mutation | `--app-id` (defaults to `bounded.json`) or `--create --name`, `--protocol`, `--public`, `--constants`, `--environment`, `--recover-operation` |
| `clone <appId> [dir]` | Clone the app's cloud source repository with the active control-plane identity (browser session by default), then preserve that identity in the checkout. `--link` is only for an explicitly selected wallet key whose source access is denied. | `--branch`, `--link` |
| `pull` | Fast-forward a bounded clone to its current cloud source | `--dry-run`, `--reset` |

```bash
bounded init                                            # scaffold policy.json + bounded.json
bounded deploy --create --name my-app                   # create app + record appId; hosted site gate defaults private
bounded deploy --create --name my-app --public          # opt out; hosted site is public from the start
bounded verify                                          # re-prove after edits
bounded tests run                                       # policy-tests/*.json against LOCAL policy.json
bounded deploy                                          # redeploy using bounded.json
```

On Free, `deploy --create` stops with HTTP `402` after 3 owned projects.
Do not retry with another identity.
Run `bounded apps list --json`, then use `bounded access --app-id <id> --json`
to confirm an exact user-approved project and its deploy rights before reuse.
The listed `protocol` must already match the intended runtime because
`--protocol` applies only during creation.
Configure the approved `appId` and run `bounded deploy` without `--create`.
Never delete or repurpose an app automatically to bypass the limit.
If no compatible project is approved, follow the account upgrade flow in
[billing.md](../../bounded/docs/billing.md).

In JSON mode, a successful direct policy deploy emits exactly one committed receipt instead of mixing human status text into stdout:

```json
{
  "ok": true,
  "action": "deployPolicy",
  "state": "committed",
  "appId": "6a37ecc89def2f10f13aa922",
  "created": false,
  "app": {
    "policyRevisionCount": 7,
    "runtimePublicationRevision": 9,
    "status": {
      "state": "available"
    }
  },
  "policyDeployReceipt": {
    "ok": true,
    "appId": "6a37ecc89def2f10f13aa922",
    "state": "committed",
    "operationId": "<uuid>",
    "policyRevisionCount": 7,
    "runtimePublicationRevision": 9,
    "status": "available"
  }
}
```

`created` is true when the same command used `--create`.
Recovery uses action `recoverPolicyDeploy` and includes the recovered operation ID plus the same validated `policyDeployReceipt`.
The top-level `state` and `policyDeployReceipt.state` describe the policy mutation outcome, and `committed` means that durable mutation was confirmed.
`policyDeployReceipt.status` is a separate app publication status, not another commit marker.
A direct response reports a publication state such as `pending`, `deploying`, `available`, or `failed`; an operation-bound readback or recovery receipt may report `null` when no publication status is present.
Never require receipt `status` to equal `committed` or `deployed`.
Require `state == "committed"`, retain the operation ID and revision fields as the mutation receipt, and record publication `status` verbatim.
If a release requires the runtime or hosted app to be available, confirm that condition independently after the committed policy receipt.
Do not infer success from a human line or omit the receipt when recording provenance.

### Recover an in-progress policy deploy

HTTP `409` with stable code `deploy_in_progress` means an earlier policy operation still owns the app's deploy slot.
When the caller is the verified app owner and the app's active policy status identifies one exact recoverable operation and policy target, the response also contains its validated lowercase RFC 4122 UUIDv4 `operationId`.
The server does not expose a recovery ID to collaborators, admins, unrelated identities, or malformed states.
An older ambiguous Solana Devnet operation that predates the raw request hash can qualify only when it has no upload journal and the submitted policy reproduces its exact normalized target.
The server freezes the submitted request hash before that recovery continues.
Its generic message remains deliberately opaque.

The current CLI turns the owner-visible response into one structured error:

```json
{
  "error": "<human error plus recovery guidance>",
  "code": "deploy_in_progress",
  "operationId": "<uuid>",
  "recoveryCommand": "bounded deploy ./policy.json --app-id <id> --recover-operation <uuid> --env staging"
}
```

Run the exact emitted `recoveryCommand` under the same verified owner identity.
It preserves the original policy path, app ID, constants, selected policy environment, source-sync choice, and control-plane environment.
Keep the policy file and every input byte unchanged.
The CLI binds the exact operation and exact policy and never submits a second policy mutation.
The server may re-run the policy proof and compiler for that unchanged target before it can reconcile the retained operation safely.
While recovery is processing, a retained candidate must not replace or hide the active publication.
The last committed policy remains the serving policy until the candidate activates.
HTTP `202` with `state: "processing"` means the exact recovery is still in progress.
The CLI returns to operation-bound readback and continues bounded polling; let it finish instead of starting a parallel or normal deploy.
A normal deploy whose first policy mutation has an ambiguous outcome uses this same readback/recovery loop automatically.
It returns to polling after `202` instead of submitting the policy mutation again.
Every retained runtime publication has a finite per-publication autonomous recovery owner in the control plane.
If the initiating request or its recovery polling disappears, that owner sleeps until the publication deadline without a cron or background sweeper.
At the deadline it finishes a publication only when both runtime destinations already acknowledged the exact candidate; otherwise it abandons the candidate, leaves the last committed policy serving, and frees the app for a later normal deploy.
This fallback does not replace the exact `recoveryCommand` while the operation remains visible as in progress, and callers must not race it with a guessed or fresh operation.
If polling times out while the operation remains processing, run the same exact `recoveryCommand` again later.
Do not treat that timeout as permission to create a fresh operation.
Successful recovery returns action `recoverPolicyDeploy` with the normal committed `policyDeployReceipt`.
Do not rerun a normal deploy, guess an operation ID, copy one from another app, or scrape internal storage.
Do not edit release pointers or publication revisions by hand.
The control plane reconciles a retained candidate with destination revision high-water marks without weakening those monotonic fences.
If the response has no operation ID, confirm the active identity with `bounded whoami` and let the verified owner obtain and run the recovery command.
After recovery commits, poll `bounded apps inspect --app-id <id> --json` for the expected active publication instead of treating the recovery line as final provenance.

For a Solana Devnet policy recovery, the server reads the finalized onchain policy inventory before deciding what the retained operation may publish:

- If finalized state exactly matches the retained target, recovery publishes the frozen app/runtime target without replaying an onchain mutation.
- If finalized state exactly matches the source, the earlier chain mutation did not apply.
  The retained operation becomes terminal and a fresh normal `bounded deploy` creates the next operation.
- If finalized state is temporarily unavailable, the operation remains locked and pollable.
  Keep using the exact recovery command after a polling timeout.
- If finalized state is partial or contradictory, the operation remains locked for manual intervention.
  Do not run a normal deploy or attempt a guessed repair.

### Exact release provenance

`bounded apps inspect --app-id <id> --json` reads the immutable publication
that currently authorizes runtime requests.
It is the recovery seam to use after a committed deploy, and it is also useful
when a release starts from an app selected through `bounded apps list`.
The caller must own or collaborate on the app.
Unknown and unauthorized app IDs both return not found.
Legacy apps, an in-flight publication, a non-policy runtime head, or malformed
revision state fail closed instead of returning approximate evidence.

The successful JSON shape is:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "appId": "6a37ecc89def2f10f13aa922",
  "environment": "development",
  "protocol": "realtime_devnet",
  "sitePrivate": false,
  "submittedPolicySha256": "<64 lowercase hex>",
  "resolvedPolicySha256": "<64 lowercase hex>",
  "runtimeArtifactSha256": "<64 lowercase hex>",
  "receipt": {
    "state": "committed",
    "operationId": "<publication id>",
    "status": "available",
    "policyRevisionCount": 7,
    "runtimePublicationRevision": 9
  }
}
```

The normalized app `environment` can be `development` while the CLI control
plane selection is `--env staging`; the `protocol` is the network-specific
runtime contract.
`submittedPolicySha256` hashes the exact JSON policy body the CLI sends after
constant substitution, policy-environment selection and overlay, removal of the
client-only `environments` block, and JSON reserialization.
It is not the SHA-256 of the raw `policy.json` file, whose whitespace, key order,
and escaped characters can produce different bytes.
`resolvedPolicySha256` hashes the separate server-resolved effective policy and
may legitimately differ from the submitted-policy digest.
Retain these active-publication fields as provenance instead of substituting a
raw local-file digest.
This inspection carries no site host or URL.
Use the environment-qualified `slugUrl` from `bounded domains list --app-id <id> --env <environment> --json`, or the `url` retained from the exact successful `bounded site deploy ... --env <environment> --json` receipt, for hosted-site provenance.
For staging provenance, require the JSON field itself instead of copying a human-rendered hostname.
For release automation, require an exact app ID, protocol, site privacy,
submitted policy digest, `state == "committed"`, `status == "available"`,
positive revisions, and the operation/revisions from the deploy receipt.
Poll this read-only command for a bounded window after deploy because the
active read can lag the mutation receipt.
Fifteen attempts at two-second intervals is the canonical staging release
window; fail closed if no exact match appears.
Run `bounded tests run --deployed-policy --app-id <id> --json` only after that
exact active read when the release must prove the deployed revision rather
than the local policy override.
Inspect again after the tests and require the operation, digests, and revisions
to be unchanged.
When the same release also uploads a hosted site, treat that inspection as
provisional until the site upload and independent byte proof finish.
Inspect the app again after the upload and require the exact operation,
submitted and resolved policy digests, runtime artifact digest, revisions,
availability, protocol, and site privacy to remain unchanged.
Fail the release if the active publication changes at any point.

For a release whose acceptance evidence overlays a capability or support catalog, do not put mutable acceptance evidence into the generated site artifact whose exact bytes that evidence certifies.
That creates a fixed point: acceptance certifies artifact D1, adding the receipt produces different bytes D2, and the embedded receipt no longer certifies the deployed artifact.
Generate only the immutable inventory baseline before deployment.
After every successful deployment, publish a public-read and authority-write Bounded release record with `state: "deployed_unverified"`, the deployed commit, app ID, exact site deployment and hashes, and exact active policy/runtime publication.
Publish the root and all ordered scenario-contract records in one atomic `bounded data set-many` request, then independently read and compare every public document.
Keep the full atomic request below the realtime request-size limit as well as the 100-document bundle limit.
That new epoch invalidates every earlier acceptance receipt, even when its program or policy happens to match.

After acceptance independently re-observes the exact current site bytes, active publications, and any network-specific provenance, first persist a sanitized local receipt for recovery.
Then atomically publish every scenario result plus an `acceptance_verified` root bound to the exact release fingerprint, full receipt hash, ordered scenario contract, and child index.
Independently poll every public document instead of trusting the mutation response or an immediate read.
Treat `acceptance_verified` as proof that the receipt integrity and release provenance were verified, not as an all-pass claim.
Promote a scenario only when its own status is `pass`, and promote a capability only when every scenario mapped to it passes.
Any missing, malformed, stale, unreadable, extra, or hash-mismatched root, index, or child must fail closed to the static classification.

Preserve declared function, action, and postcondition order inside a scenario-contract hash.
Sort only the outer scenario list when a stable aggregate needs ID ordering.
If policy expressions cannot parse a JSON child index, publish separate deployment-time contract records and require each accepted child hash to equal its contract record.
Allow those contract records to change only while the same atomic root transition is `deployed_unverified`, so an accepted release cannot expose a mixed contract epoch.

If local retention succeeds but the atomic public write or readback fails, do not rerun state-changing acceptance work under the retained run ID.
Provide an explicit republish command that loads that exact retained receipt, rechecks the current source, app, authority, site bytes, active publications, and network provenance before and after publication, retries the same atomic bundle, and independently polls its public projection.
When retention is version-controlled, require exactly the unstaged index change, unstaged current-deployment change, and untracked receipt for the requested run, validate their canonical projections, reject every other dirty or untracked path, and keep `HEAD` equal to the receipt commit.
Do not retain credentials, secret RPC URLs, policy bytes, runtime bundles, signed transactions, or full command environments with any receipt.

### `tests` — policy tests

Concrete allow/deny examples against a fresh sandbox app, complementary to
`verify`'s exhaustive proof. Full format and semantics:
[policy-tests.md](../../bounded-backend/docs/policy-tests.md).

`bounded tests run` defaults to reading `policy-tests/*.json` and sends them
inline with the **local** `policy.json` as the policy under test — no push
needed, the pre-deploy loop. `--deployed-policy` tests against the app's
already-deployed policy instead. `--file` (repeatable) narrows to specific
files. Exit code is 1 on any failing file; `--json` gives the full
machine-readable run including per-step traces and denial text.
The command still requires an existing app ID for authenticated control-plane and plan context, even when it tests the local policy override in a fresh throwaway sandbox.
Point `--app-id` at an app you administer, or create and record the new app before its first policy-test run.
The local-policy test does not replace that app's deployed policy.

`tests push`/`list`/`pull` manage the test files attached to the app (used by
the dashboard's Policy tests tab and CI). `push` merges by fileName unless
`--replace`; `pull` won't overwrite local files without `--force`.

## Cloud source sync

Source rides the deploy: with `"sourcePush": true` in `bounded.json` (or
`--with-source` on the command), `bounded deploy` and `bounded site deploy`
also push the project tree to the app's cloud source repository and print
`source synced: <sha>`. A source-push failure after a successful deploy warns
but does not fail the deploy. `bounded clone` / `bounded pull` read the same
repository. Full model: [source-sync.md](source-sync.md).

For a canonical `bounded site deploy [dir]`, enabling source with
`--with-source` or `"sourcePush": true` also preflights and uploads a
deterministic widget editing base containing the filtered source and exact
deployed frontend bytes. It accepts only a receipt bound to the authoritative
canonical deploy id and frontend digest. If the site lands but that receipt
fails, the command exits nonzero and prints either a deployment-pinned `site
seed-build-base` retry or an exact `site deploy --with-source` recovery when
retrying is safe; terminal target errors provide guidance without an unsafe
command. This is separate from the cloud source push, whose failure remains a
warning. Frontend variants never change the canonical editing base. See
[source-sync.md](source-sync.md#canonical-sites-also-establish-the-widget-editing-base)
for limits and recovery semantics.

The remote-edit era surface (`bounded edit`, `bounded dev`, `bounded live-edit
...`, and the loopback daemon on 8085/8008) is REMOVED - do not suggest it.
`bounded dashboard` is now only a hosted-dashboard browser launcher; it never
starts a local daemon or restores the removed remote-edit APIs.

The widget
uses the animated Bounded mark as the launcher, saves its corner placement and
one-hour hide window in localStorage, uses a four-quadrant mark picker, isolates
widget keyboard/input events from the host app, shows localhost connection
state, and sends the selected local runner (`codex`, `claude`, `opencode`,
`pi`, or `other`) with each prompt. Browser widget actions use a short-lived
`X-Bounded-Live-Edit-Token`; no-Origin local agent/curl calls do not.

> **`verify` / `verify-formal` is rate-limited** — about **5 requests per minute
> per app owner** (`429: Too many formal verification requests`). The
> "declare → verify → fix" fast loop is real, but pace it: batch edits before
> re-running, and don't spin `verify` in a tight retry. A `429` is throttling, not
> a policy error — back off ~60s and retry.

### `propose` / `proposals` - launched oApp contributions

`bounded propose` is currently an inspection command, not a submission command.
Exact code-patch execution is not wired end to end, so live submission fails before Git inspection, identity setup, venue access, or any write.
Use the explicit dry-run mode to inspect a local draft:

```bash
bounded propose --title "Show the streak counter" --dry-run
bounded propose --title "Show the streak counter" --slug streaks --dry-run --json
```

The dry-run reads only the local project configuration and Git checkout.
It never opens a venue session, signs in, creates a keypair, or writes a proposal.
The patch is measured against the published remote-tracking head by default, or against `--base <revision>` when supplied.
If the checkout has no `origin/<current-branch>` tracking ref, the command warns and falls back to the exact local `HEAD`; run `bounded pull` or pass `--base` when that is not the intended baseline.
The reported and fingerprinted base is always the resolved exact commit object ID, never a moving symbolic ref such as `HEAD`.
Top-level `bounded.json` and `.gitignore` clone plumbing are excluded.
Untracked files are refused instead of silently omitted, and one draft is capped at 512 KiB.
The canonical patch includes reconstructable binary deltas, ignores ambient global and system Git configuration, and fixes the diff algorithm, context, prefixes, rename behavior, and presentation.

Human output prints the exact diff and its `draft hash`.
JSON output returns the exact `diff`, `draftHash`, target labels, title, description, intent, base, changed file names, file count, and byte count.
The versioned fingerprint binds those local draft fields with unambiguous JSON field boundaries.
It is not an onchain content commitment, does not reserve a proposal id, and does not create something holders can vote on.

Until the exact-patch lane is available, submit the intended outcome as a normal idea in the oApp's Ideas tab.
`bounded proposals [slug]` remains a read-only venue command for listing existing proposals newest-first.
It accepts `--app-id`, `--venue-app-id`, `--slug`, and `--limit`; unlike local `propose --dry-run`, it opens a venue data-plane session to read the backlog.

## Billing and Bounded Pay

These are two different payment surfaces:

- `bounded billing ...` manages the caller's own Bounded account: Pro
  subscription, bucket top-ups, and Stripe Customer Portal.
- `bounded connect ...` manages Bounded Pay seller onboarding and one-off app
  checkout links through Stripe Connect. Use it for manual smoke tests and
  operator debugging; real apps should call `/connect/*` programmatically with
  the seller or buyer Bounded JWT.

| Command | Does | Example |
|---|---|---|
| `billing status` | Show the current Bounded plan, effective project cap, and bucket status | `bounded billing status` |
| `billing checkout` | Start Bounded Pro or top up a Bounded bucket | `bounded billing checkout --plan pro` |
| `billing portal` | Open Stripe Customer Portal for the Bounded account | `bounded billing portal` |
| `upgrade` | Alias for `billing checkout --plan pro` | `bounded upgrade` |
| `connect onboard` | Create/resume Stripe Connect onboarding for this Bounded identity | `bounded connect onboard` |
| `connect status` | Show `stripeAccountId`, `chargesEnabled`, payouts, and details state | `bounded connect status` |
| `connect checkout` | Create a one-off Bounded Pay Checkout link for a manual test | `bounded connect checkout --merchant <seller-user-id> --amount 1000 --product "Creator sale"` |

`billing checkout --plan pro` creates Bounded's own subscription. It does not
create subscriptions for an app's end users.

`connect onboard/status` is per Bounded identity, not per app.

`connect checkout` is one-off checkout (`mode=payment`). For split checkout, keep
the Bounded seller id separate from Stripe account ids:

```bash
bounded connect checkout \
  --merchant <seller-bounded-user-id> \
  --amount 10000 \
  --product "Creator sale" \
  --user-account acct_seller --user-bps 8000 \
  --platform-account acct_platform --platform-bps 1900 \
  --bounded-bps 100 \
  --project-id <bounded-app-id> \
  --platform-id <platform-id>
```

`--merchant` is the Bounded seller/user id recorded by app policy. `--user-account`
and `--platform-account` are Stripe connected account ids. A successful checkout
does not automatically mutate app policy and Bounded Pay does not fan out app
webhooks. The app should store/receive the `sessionId`, verify it with
`/connect/session`, and write entitlements, credits, or ledgers through trusted
functions.

### `verify --operation`

Default is `verifyForDeploy` (prove the whole policy). The others probe one
expression:

| `--operation` | Needs | Proves |
|---|---|---|
| `verifyForDeploy` | — | every obligation for the whole policy |
| `checkTautology` | `--expression` | the expression is always true |
| `checkContradiction` | `--expression` | the expression is always false |
| `checkSatisfiability` | `--expression` | the expression can be true |
| `checkImplication` | `--rule` + `--property` | the rule implies the property |

```bash
bounded verify ./policy.json --app-id <id> \
  --operation checkImplication \
  --rule '@user.id != null && @newData.amount <= 100' \
  --property '@newData.amount <= 100'
```

### `--constants`

CLI-side substitution for the **legacy** `@constants.NAME` token: supply values
at deploy/verify with `--constants NAME=value` (repeatable or comma-separated).
Digit-only values ≤15 chars inline as numbers; everything else is wrapped as a
string literal.

```bash
bounded deploy ./policy.json --app-id <id> --constants CAP=5000,ADMIN=8xY...
```

> Prefer an in-policy `constants` block + `@const.NAME` (resolved server-side) for
> values that live with the policy — see [constants-and-defs.md](../../bounded-backend/docs/constants-and-defs.md).
> Use `--constants` for one-off CI overrides.

### `--environment`

Select an entry from the policy's `environments` block: the CLI overlays that
env's constants, targets its `appId`, and strips the block before shipping a
normal policy. One file → many apps.

```bash
bounded deploy ./policy.json --environment preview      # preview appId + preview constants
bounded deploy ./policy.json --environment production   # production appId + production constants
```

Full treatment: [environments.md](environments.md).

## Backend code & hosting (deployed THROUGH Bounded)

| Command | Does | Example |
|---|---|---|
| `runtime init [dir]` | Scaffold a backend project (`bounded.manifest` + `index.ts` agent) | `bounded runtime init my-agent` |
| `runtime deploy [dir]` | Bundle source + custom npm deps and deploy backend code through Bounded | `bounded runtime deploy --app-id <id>` |
| `runtime info` | Show deployed backend runtime details | `bounded runtime info --app-id <id>` |
| `runtime invoke <agent>` | Invoke a deployed agent/backend through Bounded (attaches your session token) | `bounded runtime invoke my-agent --app-id <id> --data '{}'` |
| `live deploy <file>` | Upload a native `session.live` module (`init`/`tick`/`views`) to the code registry; the policy still declares the room binding | `bounded live deploy pong.live.ts --app-id <id>` |
| `live intent <room-path>` | Send one authenticated live intent to a room and arm/cold-start the live loop | `bounded live intent rooms/r1 --app-id <id> --intent '{"type":"join"}'` |
| `live status <room-path>` | Show live room diagnostics (`available`, `running`, `stopReason`, `etag`, `generation`, tick/alarm times). Passive (never starts the room); the detailed shape requires read access to the room, otherwise a slim `{ available, started, module }` is returned. `--app-id` defaults to `bounded.json`. | `bounded live status rooms/r1` |
| `secret put <NAME> [VALUE]` | Set/update a backend secret for an app. Prefer `--value-stdin`, `--value-env`, or the hidden prompt so the value is not placed in argv; legacy `VALUE` still works with a warning. | `printf '%s' "$STRIPE_KEY" \| bounded secret put STRIPE_KEY --value-stdin --app-id <id>` |
| `secret list` | List secret NAMES for an app (never values) | `bounded secret list --app-id <id>` |
| `secret rm <NAME>` | Remove a secret | `bounded secret rm STRIPE_KEY --app-id <id>` |
| `site deploy [dir]` | Publish a built static frontend (default `./dist`, needs `index.html`) to the app's mapped slug/custom host; if no app is linked, creates a private app unless `--public` is passed; deploys are versioned for static-host rollback. Canonical `--with-source` deploys also preflight and establish the exact hosted-widget editing base before reporting success. Add `--variant <var_id>` to upload a preview frontend branch without replacing that canonical site or editing base. | `bounded site deploy ./dist --with-source --app-id <id>` |
| `site seed-build-base [dir]` | Prepare the current canonical CLI deployment for hosted-widget editing from the filtered local source and exact local frontend bytes (default `./dist`). `--deploy-id` pins the expected current deployment; any deployment, file-digest, or receipt mismatch exits nonzero. | `bounded site seed-build-base --app-id <id> --deploy-id <deploy-id> -- ./dist` |
| `site variants` | List current frontend variants for owner/admin review: status, deploy id, preview/switch paths, and affected files. | `bounded site variants --app-id <id>` |
| `site rollback [deployId]` | Roll back the canonical hosted frontend, or pass `--variant <var_id>` to roll back a frontend variant to its previous accepted deploy. | `bounded site rollback --variant var_amit_refunds --app-id <id>` |
| `site promote <variantId>` | Promote a frontend variant into the canonical hosted site after owner/admin authorization. Backend rules, data, functions, and policies stay unchanged. | `bounded site promote var_amit_refunds --app-id <id>` |
| `site privacy [status\|private\|public]` | Show or change the hosted static site's gate; applies to vanity slug and active custom-domain hosts for the app, not API hosts | `bounded site privacy public --app-id <id>` |
| `site preview` | **Preview a PRIVATE (owner-gated) site in a browser WITHOUT making it public.** As owner/admin you already pass the gate; this mints a short-lived, shareable one-click link (`/__bounded/gate/land?token=…`) that sets the gate cookie and lands on the real site, then expires back to the sign-in page. `--ttl <minutes>` (default 60, max 1440), `--host <host>` (defaults to the app's mapped slug/custom domain), `--open` to launch a browser. The router currently requires an exact app-bound wallet token for preview minting; the platform-scoped browser session is not accepted. The link is a bearer secret until it expires - don't post it publicly. | `bounded site preview --app-id <id> --open` |
| `site proof [status\|on\|off]` | Opt-in public proof surface: the /__bounded/boundaries page (proof stamp, plain-English invariants, decline count) + the site's Boundaries corner badge. OFF by default | `bounded site proof on --app-id <id>` |

For release-critical public sites, retain the exact successful `site deploy
--json` receipt and independently verify every uploaded byte through the
canonical public host.
Use the receipt's nonempty `url` as the canonical host.
When recovering without that receipt, run `bounded domains list --app-id <id> --env <environment> --json` and use its nonempty `slugUrl`.
For staging provenance, require the JSON field itself instead of copying a human-rendered hostname.
`bounded apps inspect` proves the active policy/runtime publication and does not return a host.
Production normally returns `https://<slug>.bounded.page`, while an isolated staging control plane may return `https://<slug>.staging.bounded.page`.
Do not rewrite an environment-qualified URL to match the production examples below.
The current deployment exposes:

```text
GET https://<canonical-host>/__bounded/site-provenance.json?deployId=<deploy-id>
GET https://<canonical-host>/__bounded/site-provenance/file?deployId=<deploy-id>&path=<encoded-path>
```

The manifest returns only `schemaVersion`, `appId`, `deployId`, and sorted file
records with `path`, `size`, `sha256`, and `contentType`.
The file endpoint returns the immutable current-deployment bytes with
`X-Bounded-Content-Sha256`.
Fetch the manifest, hash every file independently, then fetch the manifest
again and require it to be unchanged.
A release marker inside the site must be parsed from those independently
fetched bytes, and its artifact digest must be recomputed from the same
immutable file set.
Do not use a separately fetched mutable marker as proof of the deployed bytes.
A stale deployment ID returns a conflict instead of silently proving the new
deployment.
Private sites keep these routes behind the normal site gate.
Never treat a deploy toast, a root-page fetch, or the mutable canonical file
key alone as proof that every requested file landed.

The backend runs with a sealed `ctx` (store / ai / schedule / fetch / identity) — see
[backend-runtime.md](../../bounded-backend/docs/backend-runtime.md). Frontend hosting: [frontend-hosting.md](../../bounded-frontend/docs/frontend-hosting.md).
`<slug>-api.bounded.page` routes to your backend; `<slug>.bounded.page` serves the site.

## Domains

| Command | Does | Example |
|---|---|---|
| `domains slug [slug]` | Claim one canonical vanity `<slug>.bounded.page` for an app; `--release` frees it | `bounded domains slug myapp --app-id <id>` |
| | A freshly claimed slug can take up to ~1 minute to serve at `/` (edge-map propagation); the CLI probes the root and says "propagating" until it actually serves | |
| `domains list` | List custom domains and refresh pending SSL/ownership status; also includes the app's vanity slug (`slug` + environment-qualified `slugUrl` fields in `--json`) | `bounded domains list --app-id <id> --env <environment> --json` |
| `domains add <domain>` | Add a custom frontend domain you own (Pro); prints the DNS records to create | `bounded domains add app.yourdomain.com --app-id <id>` |
| `domains remove <domain>` | Remove a **custom domain** and its routing/origin entry. Does NOT free a vanity slug — that is `domains slug --release`; using it on a slug 404s `domain_not_found` | `bounded domains remove app.yourdomain.com --app-id <id>` |

Vanity slugs are free. Custom domains are Pro-gated on the app owner's account.
If the owner later loses Pro, Bounded may remove or disable custom domain links;
keep a vanity `<slug>.bounded.page` fallback available. Custom domains serve the static frontend only; API calls should use
the app's Bounded API hostname. Custom domains inherit the app's hosted-site
privacy gate; use `bounded site privacy private|public --app-id <id>` to change
the vanity and custom static hosts together. For root/apex domains, the
DNS record may be a CNAME at `@`; if your DNS host rejects that, use a subdomain
like `www` or move the zone's nameservers to Cloudflare for CNAME flattening.

## Data plane

All `data` subcommands take `--app-id <id>` (required) and optional
`--chain realtime` (default; `mainnet` arrives later). Writes go through
Bounded, which enforces the deployed policy atomically. Full semantics:
[data-plane.md](../../bounded-backend/docs/data-plane.md); reads: [queries.md](../../bounded-backend/docs/queries.md).

| Command | Does | Example |
|---|---|---|
| `data set` | Write one document | `bounded data set --app-id <id> --path agents/a1/spend/a --data '{"amount":60}'` |
| `data set-many` | Atomic all-or-nothing batch (**max 100 docs/bundle**) | `bounded data set-many --app-id <id> --from-json bundle.json` |
| `data delete` | Delete one document (runs the path's `delete` rule) | `bounded data delete --app-id <id> --path agents/a1/spend/a` |
| `data get` | Read a doc, or list/filter a collection | `bounded data get --app-id <id> --path agents/a1/spend --limit 20` |
| `data get-many` | Batch-read paths from a JSON array | `echo '["agents/a1/spend/a","agents/a1/spend/b"]' \| bounded data get-many --app-id <id> --from-json /dev/stdin` |
| `data query` | Run a named policy query | `bounded data query --app-id <id> --name myQuery --args '{"k":"v"}'` |
| `data aggregate` | Grouped count/sum/avg/min/max | `bounded data aggregate --app-id <id> --path agents/a1/spend --group category --sum amount` |
| `data search` | Full-text search a collection | `bounded data search --app-id <id> --path notes --query "shipping"` |
| `subscribe` | **Stream realtime changes** for a path (one JSON line per server message) | `bounded subscribe "tasks/$taskId" --app-id <id>` |

For onchain mutations, `data set`, `data set-many`, and `data delete` have the
same sanitized `--json` receipt:

```json
{"transactionId":"<public-signature>","chain":"solana_devnet"}
```

The JSON receipt never includes the raw server response, serialized
transaction, signed transaction bytes, credentials, or an RPC URL.

For a successful direct realtime write, the same commands return the exact
sanitized receipt below:

```json
{"transactionId":"realtime-direct","chain":"realtime_offchain"}
```

That receipt proves the CLI command completed without exposing the raw
transport response.
It does not report or prove the number of committed documents.
For release or acceptance evidence, independently read and compare every
expected public document after the atomic write.
Confirm `transactionId` independently at the required commitment, then poll the
exact expected Bounded mirror, query, reveal, account, deletion, or denied
state.

### `subscribe` — realtime watch from the CLI

`bounded subscribe <path> --app-id <id>` opens a realtime subscription (same
`ws/v2` protocol and auth as the SDK — your `~/.bounded/credentials` identity)
and prints each update as one JSON line. The first line is
`{"type":"subscribed","data":[...]}` (the initial snapshot); every later change
is `{"type":"data","data":[...]}` carrying the full current view (control frames:
`error`/`unsubscribed`/`ping`/`pong`). Built for agents/scripts that react to
data changes:

```bash
# a COLLECTION (all docs) or a CONCRETE doc — NOT a "$var" template path
bounded subscribe "rooms/r1/scores" --app-id <id> | while read -r line; do
  echo "$line" | jq '.data'   # react to each change
done
bounded subscribe "rooms/r1/scores/alice" --app-id <id> --once   # one doc
```

**Path semantics (important):** subscribe to a **collection** (`rooms`,
`rooms/r1/scores`) to watch all its docs, or a **concrete document**
(`rooms/r1`). Do NOT pass a `$variable` template path like `rooms/$roomId` —
the `$roomId` is matched literally, finds no document, and returns empty.

The path can be a positional arg (`bounded subscribe <path>`) **or** a `--path`
flag (`bounded subscribe --path <path>`) — the flag mirrors `bounded data
get/set` so the same muscle memory works.

Flags: `--once` (exit after the first snapshot — good for a one-shot read),
`--timeout 30s` (exit if idle), `--include-subpaths`, `--filter '<json>'`,
`--limit N`. Streams until Ctrl-C, auto-reconnecting on drops. Reads obey the
same policy as everything else — a subscriber only sees what its identity is
allowed to read.

### `data get` flags (collection reads)

| Flag | Meaning |
|---|---|
| `--filter '{...}'` | MongoDB-style filter, e.g. `'{"amount":{"$gt":10}}'` |
| `--sort field:asc\|desc` | repeatable sort spec, e.g. `--sort createdAt:desc` |
| `--limit N` | page size |
| `--cursor <tok>` | pagination cursor from a prior page's `nextCursor` |
| `--prompt "..."` | natural-language filter evaluated server-side |
| `--include-subpaths` | also walk nested sub-collections |
| `--shape '{...}'` | resolve related docs inline |

```bash
bounded data get --app-id <id> --path agents/a1/spend \
  --filter '{"amount":{"$gt":10}}' --sort amount:desc --limit 20
```

### `data aggregate` flags

`--group` (repeatable) + at least one of `--count`, `--sum F`, `--avg F`,
`--min F`, `--max F`; optional `--filter` narrows before aggregating.

### `data search` flags

`--query` (required) and optional `--fields a,b` (default: all fields),
`--limit`, `--cursor`.

### `data set-many` — per-bundle limit

A single `set-many` bundle may carry **at most 100 documents** (the realtime
data plane's per-write limit; counts upserts + deletes combined). The CLI
preflights this client-side and errors before the round trip:

```text
too many documents: 150 exceeds the per-write limit of 100 (split the bundle into batches of 100 or fewer)
```

Split larger writes into sequential batches of 100 or fewer. Each batch is
still atomic on its own, but the batches are independent (a later batch failing
does not roll back an earlier one).

### `data delete`

`bounded data delete --app-id <id> --path <collection>/<id>` removes a single
document through the same policy-enforced data plane as writes. The path's
`delete` rule and any invariants are evaluated server-side first; if the rule
denies the operation nothing is removed. On the wire a delete is just a write
whose document body is `null`, so it is atomic and identity-scoped exactly like
`data set`.

### `--skip-preflight`

On `set` / `set-many`, an **onchain-only** flag: skip RPC preflight simulation
so failing txs still land on-chain. No effect on the realtime data plane.

## Debugging denied writes — `bounded decisions`

When a write returns `403`, `bounded decisions` shows the realtime backend's
recent **WRITE policy decisions** for the app (most-recent-first) so you can see
*why* — each deny carries the failing rule/clause reason.

```sh
bounded decisions --app-id <id>                  # recent allows + denies (human table)
bounded decisions --app-id <id> --denied-only    # only the denials
bounded decisions --app-id <id> --limit 20       # cap the rows
bounded decisions --app-id <id> --json           # one JSON object per line (agent-friendly)
```

| Flag | Meaning |
|------|---------|
| `--app-id <id>` | Target app (required) |
| `--denied-only` | Only show denied writes |
| `--limit N` | Max rows, most-recent-first (0 = server default) |
| `--json` | Emit one compact JSON object per decision line |

Each entry: `ts`, `collection`, `path`, `action` (create/update/delete),
`actor` (wallet address or `(anon)`), `decision` (allow/deny), `reason`, and
`roomId` (for session/partition writes). Owner/collaborator gated (same auth as
`bounded share`/collaborators). The buffer is **in-memory and bounded** (~200
entries per app, denies retained over allows) — make a write, then re-run.

Typical loop: a `data set` returns `403 Policy failed: ...` → run
`bounded decisions --app-id <id> --denied-only` → read the failing-rule reason →
fix the policy or the calling identity.

## Functions (the imperative escape hatch)

```sh
bounded functions deploy <name> --entry <file> --app-id <id> \
  --auth '<rule>' [--timeout <sec>] [--secret NAME] \
  [--act-as <address>] [--logs-auth '<rule>'] [--sandbox]
bounded functions deploy --all --policy policy.json --environment <env>
printf '%s' "$VALUE" | bounded secret put NAME --value-stdin --app-id <id>
bounded functions list   --app-id <id>
bounded functions invoke <name> --app-id <id> [--data '<json>']
bounded functions logs   [name] --app-id <id> [--since 2h] [--limit N] [--errors-only]
```

`deploy` uploads the function's code and writes its **complete** entry —
owner/admin only. `--auth` is required. Repeat every optional field the function
needs on every deploy: bare `--secret NAME` declares a name without exposing its
value in argv, while `--act-as`, `--logs-auth`, `--sandbox`, and `--timeout`
preserve those fields. Omitted optional fields are removed.
`deploy --all` (CLI 0.0.88+) is the batch form and the right default after a
policy deploy: it reads every function from the policy file (metadata included,
`@const.*` actAs resolved from the environment's constants), sends ONE request,
and the service skips unchanged pins and publishes the changed set in one
atomic publication — a no-op pass is a single round-trip, never one
publication per function. `invoke`
attaches your session token automatically (same token as `data`) so the
Bounded gates the call on the `auth` rule, then prints the function's JSON (or
the platform error — `403` if the rule denies you). Caller-scoped functions may
be invoked by any caller their `auth` rule admits; functions that declare
`actAs` in policy are service-identity functions and must be admin-gated at
verify/deploy. `logs` (CLI 0.0.89+) reads the durable per-invocation log store:
every invoke — end-user and scheduled runs included — is persisted with status,
latency, error, and console output for 30 days, and the readable window/entry
count is plan-tiered (free reads the recent days; Pro the full history). Name a
function to filter to it, or omit the name for all of them; owner/admin gated,
with per-function `logsAuth` delegation for other viewers. Debug loop: a flow
fails in the browser → `bounded functions logs <fn> --since 1h --errors-only` →
read the invocation's error and console lines. Full guide:
[functions.md](../../bounded-backend/docs/functions.md).

## Related

- [data-plane.md](../../bounded-backend/docs/data-plane.md) — write semantics, atomic batches, failure codes
- [queries.md](../../bounded-backend/docs/queries.md) — filters, sort, paging, aggregations, search in depth
- [sdk-reference.md](../../bounded-frontend/docs/sdk-reference.md) — the same operations from TypeScript
- [auth.md](../../bounded-frontend/docs/auth.md) — CLI/admin auth sources: wallet/keypair vs web account
- [access-control.md](../../bounded-backend/docs/access-control.md) — what each control role can do, the `access` block, external contributors & platform super-admins
- [verify-and-counterexamples.md](../../bounded-backend/docs/verify-and-counterexamples.md) — reading `verify` output
- [policy-tests.md](../../bounded-backend/docs/policy-tests.md) — `bounded tests` file format and semantics
