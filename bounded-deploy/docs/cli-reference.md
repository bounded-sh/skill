# CLI Reference — every `bounded` command

**What's in here / when to read this:** every `bounded` command + flag, grouped
by purpose. Every flag below exists in the CLI; `bounded <cmd> --help` prints the
same with an Example block.

**Global flags** (any command): `--json` (structured output for agents,
errors are emitted as JSON too), `--quiet` (minimal output), `--instance`
(select a named `bounded.json` instance), `--env`
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
| `update` | Update this release build to the latest CLI from its configured HTTPS release host. Downloads the immutable binary for this OS/architecture, verifies the version-bound release signature against the public key compiled into the CLI, then checks the SHA-256 checksum and Go build metadata, and atomically replaces the running executable. Reads no project config, account, or credentials. Builds before `0.0.99` have no trust anchor and must reinstall with the curl installer. | `bounded update` |
| `whoami` | Show the active CLI identity: wallet address or web user id, environment, account source, login/link hint if any, and this folder's app marker if present. Wallet mode may create the selected key on first run. | `bounded whoami` |
| `login` | Log the CLI into your Bounded **web account** (the canonical identity; no key involved). By default it opens the hosted sign-in page, completes Authorization Code + PKCE through a temporary loopback callback, stores refreshable credentials in `~/.bounded/web-session.json`, and selects `account.keySource:"web"` for the current project. Use `--email <addr>` or `--no-browser` for terminal OTP when a browser is unavailable. **Headless agents:** run `bounded login --email <email>` with stdin held open, relay the 6-digit code from the user, then feed it to stdin. Never ask for or embed a reusable credential. | `bounded login` |
| `link` | **Wallet-mode anti-loss.** Explicitly attach THIS device's local wallet keypair to your web account via an **OAuth device flow** (device code + fingerprint approval at `bounded.sh/link` — agents should print that URL for their user), or use `--email` for headless OTP approval. The link is one explicit wallet-key <-> web-account pair; `bounded login` does not create it. The keypair keeps signing — linking only adds an account association, it never rolls or replaces the key. Linking is **refused** if it would merge two unlinked accounts that both already own projects. Not used for `account.keySource:"web"`. | `bounded link --email you@example.com` |
| `account` / `account use` | Show or set this project's account source in `bounded.json`: global, project, profile, env, or web. | `bounded account use --web` |
| `account transfer-to-web` | Move ownership of this key's apps to your web account (run after `bounded login`; linking is NOT required, the CLI proves key possession automatically; `--yes` to confirm, `--app <appId>` repeatable for a subset). Makes the web account the owner-of-record so the key becomes a fully detachable signing credential. Works even when `bounded link` is refused because both sides already own projects. | `bounded account transfer-to-web --yes` |
| `apps list` | Read-only inventory of every app the active account owns or collaborates on. The `projects` alias is equivalent. JSON output contains `appId`, `name`, `runtimeTarget`, the compatibility alias `environment`, `protocol`, and optional `sitePrivate`. Confirm the target with `bounded access` before reuse. | `bounded apps list --json` |
| `apps inspect` | Read-only exact active-publication proof for one owned or shared app. Returns policy and runtime digests, committed operation and revision numbers, runtime target, selected instance context, availability, protocol, and site privacy without returning policy bytes, a runtime bundle, or a hosted URL. `--app-id` defaults to `bounded.json`. | `bounded apps inspect --app-id <id> --json` |
| `apps delete` | Permanently delete an owned app: its data, realtime state, hosted site, addresses, functions, secrets, and schedules. Owner only (non-delegable; no collaborator role or grant can reach it) and NEVER one-shot: the command creates a short-lived delete request, opens a hosted confirmation page in the browser where the human types the app name, and polls until the deletion completes. There is no `--yes`. See the `apps delete` section below for the exact flow, refusal codes, and JSON mode. | `bounded apps delete --app-id <id>` |
| `dashboard [page]` | Open the hosted dashboard. In a linked project it opens that app directly; optional pages include `data/<path>`, `policy/tests`, `boundaries/change`, and `activity/logs`. `--app-id` overrides the project, `--no-open` prints guidance without launching, and `--print` emits only the URL. Staging opens the staging dashboard. The app-ID handoff is replaced by the dashboard's readable app-name URL after load. | `bounded dashboard data/orders` |
| `share <wallet\|email> --role developer\|admin\|viewer\|billing --app-id <id>` | Grant a control role. **Wallet** → direct. **Email** → tracked **by the email** and bound when that person verifies it at signup, so it works for a registered OR brand-new address (invite email sent when outbound email is configured). `policy` is accepted as a legacy alias for `developer`. Owner only. **Plan-gated by the OWNER's plan**: Free = no collaborators; Pro = up to 3, **`developer` only** (admin/viewer/billing 402 with an upgrade hint); Team+ = 25 seats and every role — default to `--role developer` unless the owner is Team+. Share BEFORE loss — there is no key-recovery command (the only ownership move is `account transfer-to-web` to your own web account). See [access-control.md](../../bounded-backend/docs/access-control.md) for what each role can do. | `bounded share teammate@example.com --role developer --app-id <id>` |
| `unshare <wallet\|email> --app-id <id>` | Remove a wallet or canonical email collaborator (owner only) | `bounded unshare teammate@example.com --app-id <id>` |
| `collaborators --app-id <id>` | List collaborators (alias: `shares`) | `bounded collaborators --app-id <id>` |
| `access --app-id <id>` | Show the access roster: your effective role, the app's external-widget setting, and every member grouped by role with per-role counts (the member list is shown only to the owner or an `access:manage` role). | `bounded access --app-id <id>` |

### `apps delete` - permanent, browser-confirmed app deletion

Deleting an app destroys everything it owns: documents and files, realtime
state, the hosted site and its history, vanity slug and custom domains,
functions and their schedules, runtime secrets, cloud-edit source, build
state, and the app record itself.
Its sign-in records go too: the app's OAuth client, every session and refresh
token issued for it, and the app-scoped identity links.
There is no undo and no recovery command.

Some records deliberately survive, and none of them can serve the app or be
read through it: your ACCOUNT's billing and ledger history (an account
outlives its apps), the PEOPLE who signed in (their Bounded user account and
wallet, which are theirs and span every app), and short-lived operational logs
that expire on their own (function invocation logs age out within 30 days).

If the app was deployed onchain (devnet), its **onchain accounts remain onchain**.
Deletion removes everything Bounded runs and bills you for, but the deployed
program has no instruction that closes an app account, so nothing offchain can
retract it. Its rent stays where it is, and the address keeps resolving.

The flow is deliberately two-step so a single mistyped command can never
delete an app:

```bash
bounded apps delete --app-id <id>
```

1. The CLI creates a delete request (10-minute lifetime) and prints a
   security fingerprint plus a one-time confirmation URL.
2. It opens that hosted page in the browser (`--no-browser` to print only).
   The page shows the SAME fingerprint - the human should confirm it matches
   the terminal before proceeding - then requires typing the exact app name.
3. The CLI polls until the deletion completes, fails, or the request expires
   (`--timeout`, default 10m).

Owner only, and the authority is non-delegable: no collaborator role, grant,
or admin seat can delete an app (`app:delete` is an owner-boundary
capability). Agents must never attempt to complete the confirmation page
themselves - the browser step exists to put a human in the loop.

Refusals worth recognizing (409 with a `code`):

- `oapp_launched` - an open/launched oApp belongs to its venue and holders;
  it cannot be deleted.
- `app_delete_blocked_mainnet` - apps deployed to Solana mainnet keep their
  record (it is the only pointer to their on-chain state).
- `app_delete_blocked_deploy_in_flight` - retry after the active policy
  deploy settles.
- `app_delete_in_progress` - a confirmed deletion is already executing.

JSON mode never opens a browser. `bounded apps delete --json` creates the
request and returns `requiresConfirmation:true` with the `confirmUrl`,
`fingerprint`, and ready-to-run `confirmationArgs`; after the human confirms
in the browser, `bounded apps delete --app-id <id> --watch --request-id <rid>
--json` polls to the terminal state.

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
only at a trusted HTTPS mirror with the same release layout. The updater
fetches `SHA256SUMS` and `SHA256SUMS.sig` from that host and verifies the
signature against a public key compiled into the CLI, so a compromised or
spoofed origin cannot forge an update. `--env` and `BOUNDED_ENV` do not select
a CLI update channel.

`bounded update` updates only the CLI component and its normal update-check
cache. Re-run the installer when the Bounded agent skill should be refreshed
too.

`link` flags: `--no-browser` (just print the URL), `--email <addr>` (headless
approval: email an OTP, read it from stdin, approve this wallet key), `--timeout
<dur>` (default `10m`). `login` flags: `--email <addr>` (terminal OTP),
`--no-browser` (prompt for terminal OTP). Collaboration grants
**control-plane** authority (manage the app), not a data-plane bypass — give data
powers explicitly via policy rules ([admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md)).

### Machine-readable onboarding

Onboarding commands in `--json` mode keep stdout to exactly one JSON document and keep stderr free of human progress text, including first-use key-creation guidance.
The successful `bounded init --json` result has `action: "init"`, the written policy and project-config paths, the selected account source and environment, and `nextCommands`.
The successful `bounded account use ... --json` result has `action: "accountUse"`, the selected `keySource`, project context, and safe next commands.
When a wallet source and a saved web session are separate, `bounded whoami --json` reports the condition in `warnings[]` with stable code `unlinked_web_account`, the public wallet address, the web email, and next commands instead of printing a warning beside the JSON.
Running `bounded account transfer-to-web --json` without `--yes` returns an `action: "transferToWebPreview"` document with `requiresConfirmation: true` and replayable `confirmationArgs`; its `ok: true` means the preview completed, not that ownership moved.

`bounded link --json` requires `--email <you@example.com>`.
The interactive browser device flow must expose a verification URL, user code, and security fingerprint before approval, so it is intentionally unavailable when the command must emit only one final JSON document.
Use `bounded link --email you@example.com --json`, provide the OTP on stdin, and read the single `action: "linked"` result.
The email device-link path performs its own OTP exchange and works without a saved web session.
For commands that instead require an existing web control-plane session, such as default-web `bounded init` or transfer-to-web, an absent or unrefreshable session in JSON mode fails without opening a browser and directs the caller to run `bounded login --email <you@example.com>` first.

Non-2xx responses and request transport/decode failures from the device start, info, approval, or polling API use `action: "deviceLink"`, the failed `stage`, and either an HTTP `statusCode` or a transport-safe fallback in JSON mode.
Only `device_confirmation_required`, `device_already_linked`, and `account_link_would_merge_existing_projects` are preserved as upstream machine codes.
An unknown code becomes `device_link_request_failed`, and a transport or decode failure becomes `device_link_transport_failed`.
Structured device API error paths never copy a raw response object, request URL, response-body device or user code, token, or other credential material into stdout or stderr.
The interactive human approval flow still intentionally prints its verification URL, user code, and security fingerprint before approval.
An explicit public `message` field may supply human detail, but an absent message produces a generic status description instead of reflecting the response body.

### Project config — `bounded.json`

`bounded init` writes public `bounded.json`; `deploy --create` fills in `appId`.
Agents should read this file first. It is safe to commit and contains no private
key material. A named instance binds every deployment target that must move
together:

```json
{
  "$schema": "https://bounded.sh/schemas/bounded.schema.json",
  "name": "my-app",
  "defaultInstance": "poofnet-primary",
  "instances": {
    "poofnet-primary": {
      "appId": "6a37ecc89def2f10f13aa922",
      "controlPlane": "production",
      "policyTarget": "poofnet",
      "buildTarget": "poofnet"
    },
    "poofnet-empty": {
      "controlPlane": "production",
      "policyTarget": "poofnet",
      "buildTarget": "poofnet"
    }
  },
  "protocol": "realtime_offchain",
  "policy": "policy.json",
  "account": {
    "keySource": "web",
    "loginHint": "you@example.com"
  }
}
```

Select an instance with the global `--instance <name>` flag, `BOUNDED_INSTANCE`, or `defaultInstance`, in that order.
If exactly one instance exists, the CLI selects it automatically.
If several exist with no selection, the CLI refuses and names the available instances.
An explicit `--app-id` can still target an app directly, but `--env` cannot change the control plane of a selected instance.
The selected instance's `policyTarget` selects the matching policy `environments` entry, while `buildTarget` selects the frontend build mode.
Several instances may intentionally reuse those targets while keeping distinct app IDs.

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

Legacy single-app files with top-level `appId` and `environment` remain readable.
For wallet/keypair projects, a non-empty `BOUNDED_PRIVATE_KEY` overrides `account.keySource:"global"`, `"project"`, and `"profile"`.
Check `bounded whoami --json` before an identity-sensitive deploy instead of assuming the public project config selected the active key.
An explicit project `account.keySource:"web"`, and projectless control-plane commands, use the web session.
App-bound data-plane operations (`data`, `subscribe`, `functions invoke`, `runtime invoke`) also run under the web session **on cloud apps**: the CLI exchanges the platform login for an app-pinned session server-side, so `@user.id` matches the same email's identity on the app's own site.
A web session cannot SIGN, so writes to `onchain: true` collections that need a client-signed Solana transaction still require a local keypair (`bounded account use --global`, with `"auth": { "wallets": true }` deployed).
On a **Bounded Local** connection the web lane is refused outright: the app lives only in your stack while web login is brokered by the shared staging issuer, so local data commands use the keypair lane.
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

Cloud source sync is opt-in and separate from ordinary artifact deployment.
Set `"sourcePush": true` in
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
| `verify [policy.json]` | Run the proof engine, print the report + counterexamples | `--app-id` (defaults to `bounded.json`), `--operation`, `--protocol`, `--constants`, `--environment`, `--json` |
| `plugins list` | List the callable plugin projection offline | `--family`, `--grep`, `--json`, `--quiet` |
| `plugins describe <plugin.function>` | Print one plugin function's exact argument, return, auth, support, and verification contract offline | `--json`, `--quiet` |
| `tests run [dir\|file]` | Run policy test files against a sandboxed app, print per-file PASS/FAIL | `--app-id`, `--deployed-policy`, `--file` (repeatable), `--json` |
| `tests push [dir]` | Attach local test files to the app (merge by fileName) | `--app-id`, `--replace` |
| `tests list` | List test files attached to the app | `--app-id` |
| `tests pull [--dir]` | Fetch attached test files to disk | `--app-id`, `--dir`, `--force` |
| `deploy [policy.json]` | Validate, compile, and push the policy (same fail-closed gate), or reconcile one exact retained operation without submitting another policy mutation | `--app-id` (defaults to `bounded.json`) or `--create --name`, `--protocol`, `--public`, `--constants`, `--environment`, `--recover-operation` |
| `deploy status` | Read-only: what holds the app's deploy slot, and whether a fresh deploy is safe. Never mutates. | `--app-id` (defaults to `bounded.json`), `--json` |
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

`verify` and `deploy --create` reject an unknown `--protocol` locally before any network call and list the valid app protocols.
When the verifier returns a valid result, `bounded verify --json` emits exactly one schema-version-2 document with `status`, `passed`, `safeToDeploy`, exact counts, structured proof details and counterexamples, the access report, and `capabilityReadiness`.
Local argument, file, JSON, environment, configuration, authentication, transport, and malformed-response failures that occur before a valid verifier result instead use the ordinary one-document root error shape and exit nonzero.
`status` is one of `PROVEN`, `DISPROVED`, `INVALID`, or `UNPROVEN`.
`safeToDeploy` describes the whole-policy schema and proof gate and can be true only for the default `verifyForDeploy` operation.
For that operation, a passing gate with genuinely unresolved non-blocking advisories can be `UNPROVEN` with `passed: true` and `safeToDeploy: true`; a passing custom `--operation` still reports `safeToDeploy: false`.
The command exits nonzero for a failed gate.

`capabilityReadiness` is advisory and never changes `passed` or `safeToDeploy`.
It is reported verbatim from the verifier, with one row per plugin function and execution context, the canonical capability state, an `applicability` field, and named-query return-type advisories; repeated occurrences of the same function-context pair are grouped.
It is always an object.
`{}` means the platform supplied no usable readiness section; otherwise the report metadata remains present even when its rows and advisories are empty.
It does not prove live-network execution.

Use the offline plugin reference before authoring an onchain hook:

```bash
bounded plugins list
bounded plugins list --family "Pump Fun" --json
bounded plugins describe @PumpFunPlugin.buyExactSolIn
bounded plugins describe buyExactSolIn --json
```

These commands need no account, project, or network.
`list` reports each callable identifier, signature, return type, and network-scoped capability state; `describe` adds each argument's name, manifest type, proof sort, optionality, signer role, units, the return contract, and authenticated-caller requirement.
The embedded plugin projection has its own catalog `schemaVersion`, which is separate from the verify report's schema version 2.
Capability state describes onchain reachability for the catalog's named network, not a deploy verdict: `unverified` means no retained live proof exists, while `unsupported` also covers offchain-only functions and functions unavailable on that network.
An unambiguous bare function name is accepted, but use the returned canonical identifier in policy source.
Namespaced entries use `@Namespace.function`, while core entries such as `get` and `getAfter` remain bare.

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
  },
  "sourceSync": {
    "requested": false,
    "status": "skipped",
    "reason": "source_not_requested"
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

The JSON policy-deploy result aggregates policy mutation, app creation, local marker, protocol warnings, and optional source sync into that one stdout document.
A requested source-sync failure happens after the policy commits, so the result retains `state: "committed"` and the full `policyDeployReceipt` while reporting top-level `ok: false`, `status: "partial"`, `partial: true`, and `sourceSync.status: "failed"`.
That partial source outcome exits zero and does not roll the committed policy back, so inspect the structured fields instead of relying on the process exit alone.
When source sync was not requested, `sourceSync.status` is `"skipped"` with `requested: false`.

For `deploy --create`, the CLI requests schema validation before app creation.
When that preflight returns schema issues, the CLI emits `ok: false`, `action: "deployPolicy"`, `code: "invalid_policy"`, `created: false`, `issueCount`, and `issues[]`, and creates no app.
Preflight transport failure or a malformed verifier response is fail-open so the authoritative deploy can still decide.
If app creation returns a durable app ID but policy client setup, policy submission, or receipt validation then fails, JSON mode exits nonzero with one recovery document shaped like this:

```json
{
  "ok": false,
  "action": "deployPolicy",
  "status": "partial",
  "partial": true,
  "stage": "policyClient | policyDeploy | policyReceipt",
  "appId": "<durably created app ID>",
  "created": true,
  "code": "<safe code when available>",
  "statusCode": 422,
  "error": "<safe non-reflective error>",
  "sourceSync": {
    "requested": true,
    "status": "skipped",
    "reason": "policy_not_committed"
  },
  "warnings": []
}
```

Treat the durable `appId` as recovery state and do not retry `--create` for the same intended app.
The optional `code`, `statusCode`, `state`, `operationId`, and `recoveryCommand` fields appear only when they pass the CLI's safe allowlists.
Marker, project-config, and protocol warnings remain in `warnings[]`.
No `policyDeployReceipt` is present because the policy commit was not confirmed, and no site-live field is inferred.
When source sync was not requested, the same skipped object uses `requested: false` and reason `source_not_requested`.
Protocol mismatches are retained in `warnings[]` with code `onchain_collections_with_offchain_protocol` or `onchain_protocol_collections_not_registered` and the affected collections.
App-recording failures such as `app_marker_not_written`, `gitignore_not_updated`, or `project_config_not_updated` also remain in `warnings[]` and make the otherwise committed result partial.
The `unlinked_wallet_owner` warning is anti-loss guidance and does not by itself make a deploy partial.

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
For a mainnet app under onchain user custody, recovery may require a fresh owner signature for that retained operation.
The CLI retrieves the permit with the same operation ID, signs it locally, and retries only the recovery endpoint.
It never calls `updateApp` or creates a replacement policy operation during this recovery.
If the read-only permit requirement probe is temporarily unavailable, the CLI keeps the exact recovery operation pollable instead of falling back to a fresh deploy.
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

### Is a fresh deploy safe? (`bounded deploy status`)

`bounded deploy status --json` is the read-only answer to "what is holding this
app's deploy slot". Use it after any ambiguous deploy, before deciding between a
recovery and a fresh deploy.

```json
{
  "ok": true,
  "appId": "<id>",
  "state": "deploying",
  "operationId": "<uuid>",
  "operationKind": "policy",
  "phase": "onchain",
  "ageSeconds": 412,
  "pendingPublication": true,
  "freshDeploySafe": false
}
```

It is a status projection, not a verdict on recoverability: it deliberately does
not classify the retained operation (that requires the exact policy body and its
digests, which a GET does not carry) and it never emits a recovery command.
`freshDeploySafe` is true only when no policy operation holds the fence and no
publication is pending; anything unreadable or unrecognized reports false.
The command needs the verified owner - a non-owner and an unknown app both
answer `404`, so it can never be used to probe whether an app exists.

### Structured errors and when a recovery command is offered

Every ambiguous deploy or recovery outcome now emits the documented object with
`code`, `state`, `operationId`, and - only when the outcome is actually
resumable - `recoveryCommand`:

- **Resumable** (`unknown`, `processing`, `recoverable`, `auth_expired`): run
  the emitted `recoveryCommand` verbatim, under the same verified owner
  identity.
  `409 policy_preflight_status_conflict` is resumable in this sense: a
  server-side authority fence refused that exact write, so retrying immediately
  is pointless, but the operation itself is intact and the same operation id
  still resumes it once the platform-side defect is fixed.
  `auth_expired` (a `401`) means YOUR login died mid-reconciliation and could
  not be refreshed without a prompt - the operation itself is untouched. Sign
  in again (`bounded login`), then run the recovery command.
  The client re-resolves its bearer before every polling request, so this
  outcome normally appears only when the session is truly gone (for example a
  revoked refresh token).
- **Definitive** (`410 policy_operation_unrecoverable`, plus abandoned,
  superseded, target-mismatch, permission (`403`), invalid-input, and
  manual-intervention outcomes): NO `recoveryCommand` is emitted, because
  re-running the operation can never commit. The message says whether to run a
  fresh `bounded deploy` or to escalate for operator review.

The operation id the CLI minted stays authoritative: a response carrying a
different id is refused rather than followed, so a recovery can never be bound to
someone else's operation.

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

## Prompt-driven builds - `create`, `edit`, `builds`

Bounded's own build agent writes the app from a prompt. The same control plane
the hosted create page and the in-app widget drive: a prompt creates the app and
its first build, and later prompts iterate on it. A run started from the CLI is
the same object the widget shows, and vice versa.

This is the alternative to authoring the app yourself. When YOU are writing the
policy and the client, use `init` / `verify` / `deploy` instead - handing the
work to the build agent is a different product, not a shortcut for the same one.

| Command | Does | Key flags |
|---|---|---|
| `create <prompt>` | Create an app from a prompt, submit its first build, watch it to completion, and link the app so the next command resolves it | `--name`, `--no-watch`, `--timeout` (default 30m; `0` waits indefinitely) |
| `edit <prompt>` (alias `iterate`) | Submit an edit prompt against the linked app and watch the build | `--app-id` (defaults to `bounded.json`), `--no-watch`, `--timeout` |
| `builds list` | Recent runs with state, operation, and prompt | `--app-id`, `--limit` |
| `builds watch [runId]` | Watch a run; with no run id, the newest unfinished one | `--app-id`, `--timeout` |
| `builds cancel [runId]` | Cancel a run | `--app-id` |
| `builds gate <runId> <gateId>` | Decide a gate that parked a run | `--approve` / `--reject` (exactly one), `--note`, `--app-id` |

```bash
bounded create "a notes app with tags and search"   # create + first build + watch
bounded edit "add a dark mode toggle"               # iterate on the linked app
bounded builds list --limit 5
bounded builds watch                                # reattach to the newest live run
```

Either login lane works: a web session (`bounded login`) or a local signing key.
`create` records the new app the same way `deploy --create` does, so `edit` and
`builds` resolve it from the project with no `--app-id`.

**A created app is private.** Genesis mints every app behind the Bounded site
gate, so its url shows visitors the private-site page until you publish it:

```bash
bounded site privacy public --app-id <id>
```

Each edit builds on the app's last published deployment, exactly like a widget edit.
Watching is a poll, not a stream; interrupting a watch **detaches only** - the run
keeps going server-side, and the message names the reattach and cancel commands.
Cancelling is always explicit.

Run states are `queued`, `admitted`, `executing`, `preview_ready`, `parked`
(`parkReason` is `gate` or `funding`), `resuming`, `promoting`, `quarantined`,
and the terminal `promoted`, `failed`, `canceled`, `rejected`, `expired`,
`rebase_required`, `reported`. Only `promoted` published the app.

`--json` emits exactly one document. Watching to completion emits the final run
(`appId`, `runId`, `state`, `appUrl`, `previewUrl`, `gates`, `stageSummaries`,
`usage`, plus `slug`/`url` for `create`); a run that ends anything other than
`promoted` returns that same document as the error envelope with `ok: false` and
`code` set to the failure reason. `--no-watch` emits the acknowledgement
(`appId`, `runId`, `state: "queued"`) and exits 0, which is the shape to use when
an agent wants to drive `bounded builds watch --json` itself. A detach or a
`--timeout` expiry is likewise one document, with `detached: true` and the
last-seen state.

`--quiet` prints the one value the next command takes: the app id for `create`
and `edit`, one run id per line for `builds list`, the resulting state for
`cancel` and `gate`.

Refusals keep the server's own code and detail: `project_limit_exceeded` (with
`planId`/`usage`/`limit`), `insufficient_funding`, `free_builds_exhausted`,
`usage_settlement_pending`, `prompt_too_long`, `app_unknown`, `auth_required`.
Creation is journaled by idempotency key, so a create that reports the prior
attempt as still converging is waited out on the same key rather than creating a
second app.

After a promoted run, `bounded clone <appId>` brings the generated source down
locally; `bounded pull` fast-forwards it afterwards.

## Cloud source sync

Source rides the deploy: with `"sourcePush": true` in `bounded.json` (or
`--with-source` on the command), `bounded deploy` and `bounded site deploy`
also push the project tree to the app's cloud source repository and print
`source synced: <sha>`. A source-push failure after a successful deploy warns
but does not fail the deploy. `bounded clone` / `bounded pull` read the same
repository. Full model: [source-sync.md](source-sync.md).

`bounded site deploy ... --json` always keeps stdout to one JSON document.
Successful deploys, post-upload editing-base failures, and recovery failures after an implicit app was durably created use the aggregate document below instead of emitting one document per phase.
Pre-mutation failures and control-token or upload failures against an existing app can instead use the ordinary root JSON error shape because no new app or landed upload needs a recovery receipt.
It has `action: "siteDeploy"`, top-level `ok`, `status`, `partial`, `siteLive`, `appId`, and any upload `deployId` or `url`, plus component objects named `upload`, `sourceSync`, `editingBase`, and `classification`.
Every component reports its own `status`.
A requested component that runs reports `ok`; one that cannot run because upload did not complete can report `status: "skipped"` without `ok`.
Unrequested source-dependent components report `status: "skipped"` and `requested: false`.
Inspect the top-level result and every requested component instead of treating the process exit alone as proof that all follow-up work succeeded.

The upload can land before a later phase fails.
A source-sync failure keeps the canonical site live, exits zero, and returns `ok: false`, `status: "partial"`, `partial: true`, and `siteLive: true` with the successful upload receipt and failed `sourceSync` component.
A fatal post-upload editing-base failure exits nonzero but emits that same landed partial receipt exactly once, with `editingBase.status: "failed"`; the nonzero exit does not roll the site back.
A deploy without source reports `sourceSync`, `editingBase`, and `classification` as skipped.
A variant upload sets `siteLive: false` because it did not replace the canonical site, even when the preview variant upload itself succeeded.

An implicit first site deploy can create the app before a later starter-policy validation, editing-base preflight, control-token, or upload failure.
In that case JSON mode still emits exactly one recovery document with `ok: false`, `status: "partial"`, `partial: true`, `siteLive: false`, the durable `appId`, `created: true`, and `stage` equal to `starterPolicyValidation`, `editingBasePreflight`, `controlToken`, or `upload`.
Its `upload` component says whether upload was skipped or failed and carries the corresponding safe reason, while `warnings[]` retains any marker or account-recovery warning generated after app creation.
Treat that `appId` as the recovery handle because the app exists even though the site is not live.
If starter-policy acknowledgement or source validation fails after creation, `upload.reason` is `starter_policy_validation_failed` and the partial warning code is `app_not_linked_after_create`.
The response never reflects untrusted starter-policy response fields.
Keep the returned `appId`, leave the project unlinked, and do not retry the source-backed deploy until the control-plane response is healthy.
If a warning says the local marker or project config was not written, correct the local problem and retry against the same app with `bounded site deploy <dir> --app-id <appId>` instead of creating another app.

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

## Billing

`bounded billing ...` manages the caller's own Bounded account: monthly Pro or
Team subscription and Stripe Customer Portal.

| Command | Does | Example |
|---|---|---|
| `billing status` | Show the current Bounded plan, effective project cap, and bucket status | `bounded billing status` |
| `billing checkout` | Start monthly Bounded Pro or Team | `bounded billing checkout --plan pro` |
| `billing portal` | Open Stripe Customer Portal for the Bounded account | `bounded billing portal` |
| `upgrade` | Alias for `billing checkout --plan pro` | `bounded upgrade` |

`billing checkout --plan pro|team` creates Bounded's own monthly subscription.
It does not create subscriptions for an app's end users.

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
env's constants, applies its `schedules` cadence overrides, drops the functions
whose own `environments` allowlist excludes it, targets its `appId`, and strips
the block before shipping a normal policy. One file → many apps.

```bash
bounded deploy ./policy.json --environment preview      # preview appId + preview constants
bounded deploy ./policy.json --environment production   # production appId + production constants
```

Accepted by `deploy`, `verify`, and `functions deploy --all`, which resolve it
identically. There is no short form: the global `--env` flag is a different
axis (it selects the Bounded control plane, not an entry in your policy).

A policy that scopes **any** function with an `environments` allowlist refuses a
`deploy`, `verify`, or `functions deploy --all` run that omits `--environment`,
rather than guessing which functions belong on the target app.

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
| `domains origins` | List extra allowed auth/CORS origins for the app | `bounded domains origins --app-id <id>` |
| `domains origins add <origin>` | Allow an extra origin to sign in and call the app (https anywhere; http only for localhost). Needed for any host that is not first-party or a registered domain - a tunnel, a preview URL - because wallet sign-in (SIWS) is bound to the browser origin and an unregistered one fails with `relying party not allowed for app`. Register it on the environment the app runs in | `bounded domains origins add https://abc123.ngrok.app --app-id <id> --env staging` |
| `domains origins remove <origin>` | Remove an extra allowed origin | `bounded domains origins remove https://abc123.ngrok.app --app-id <id>` |

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

In CLI releases with structured decline propagation, a rejected `data set`, `data set-many`, or `data delete` in `--json` mode preserves the safe server envelope under `decline` without copying unknown response fields.
For a `rollingSum` rejection, branch on `decline.boundary.cause`; disclosure-gated `cap`, `current`, and `attempted` values can be JSON numbers or exact decimal strings.

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
`ws/v2` protocol and auth as the SDK, under the selected account — a web login
on cloud apps, or your `~/.bounded/credentials` keypair; see the account
section above)
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

`deploy` uploads the function's code and updates its policy entry for a caller with `functions:deploy`.
`--auth` is required.
Explicit optional metadata overrides the existing entry, while omitted optional metadata such as timeout, secrets, runtime, sandbox, webhook, egress, browser origins, `actAs`, `logsAuth`, and build capability is preserved by the deploy service.
A bare `--secret NAME` declares a name without exposing its value in argv.
`deploy --all` (CLI 0.0.88+) is the batch form and the right default after a
policy deploy: it reads every function from the policy file (metadata included,
`@const.*` actAs resolved from the environment's constants), sends ONE request,
and the service skips unchanged pins and publishes the changed set in one
atomic publication — a no-op pass is a single round-trip, never one
publication per function. With `--environment`, a function carrying its own
`environments` allowlist is deployed only to the environments it lists, and the
key is stripped from the ones that ship; without `--environment`, a policy that
scopes any function refuses the batch outright. See
[environments.md](environments.md). `invoke`
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
with per-function `logsAuth` delegation for other viewers. Every invoke also
returns an `x-bounded-invocation-id` response header; the same id is stamped on
the invocation's log entry (and carried to every `ctx.*` hop as
`x-bounded-correlation-id`), so a frontend error report carrying the header
value is directly greppable to its exact entry. Same-key retries share the id -
one business operation groups under one value. Debug loop: a flow
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
