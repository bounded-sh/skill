# Live-Edit

Use this when a Bounded app is registered for local live-edit and the user wants
an agent to change the running app from feedback or a natural-language request.

The local reference server is the daemon started by `bounded dev` or
`bounded dashboard`. By default it serves the live-edit API at:

```text
http://127.0.0.1:8085
```

Every request is scoped to an app id. Never infer "the current app" from a
global daemon.

**Keep this daemon running for local Bounded development.** It is the localhost
backend behind the dashboard and local live-edit API: it lists apps, proxies
owner-gated reads, runs local live-edit jobs, flips site privacy, builds, and
deploys without the browser holding a private key. If it is not running, the
local dashboard shows "daemon not reachable" and local live-edit cannot run.
The installer starts it as a background service (`bounded dashboard --no-web`);
if you see local degraded states, the fix is almost always "start/keep
`bounded dashboard` running".

Deployed HTTPS pages must not depend on background requests to `127.0.0.1`.
Strict Chrome and Safari can block public-site-to-localhost subresource fetches.
The deployed widget is cloud-backed and may offer:

- a top-level link to `http://127.0.0.1:8008/apps/<appId>` for the local
  dashboard, which then talks to the `http://127.0.0.1:8085` daemon for
  Claude/Codex edits; and
- cloud live-edit, when Bounded reports that it is available for the current
  app and signed-in user.

Private hosted sites use cloud sign-in to unlock the deployed page. The local
dashboard remains the local edit entry point.

## Register An App

From the app repo:

```sh
bounded live-edit register --app-id <appId> --repo . --origin https://<appId>.bounded.page
```

Useful options:

```sh
bounded live-edit register \
  --scope app \
  --artifacts on \
  --source-provider auto \
  --edit-mode variant \
  --feedback-path boundedfeedback \
  --build-command "npm run build" \
  --frontend-dir web \
  --dist-dir web/dist \
  --artifact-push on
```

Scopes:

- `app`: app code only; policy is read-only.
- `app+policy`: app code and policy can both be edited.

Default to `app` unless the creator explicitly asks for full development.

Cloud source tracking and variants:

- New registrations default to `--artifacts on`, `--artifact-push on`, and
  `--source-provider auto`, and `--edit-mode canonical`.
- `liveEdit.sourceProvider` / `--source-provider` selects the cloud source Git
  backend: `auto`, `github`, `artifacts`, or `none`. `auto` lets Bounded choose
  the configured backend for the environment. `none` opts out of cloud source
  tracking and remote code-improvement.
- Respect repo opt-outs. `--artifacts off` or `bounded.json`
  `liveEdit.artifacts: false` disables Bounded cloud source tracking for the
  project. `--source-provider none` is the explicit provider-level opt-out.
  `--artifact-push off` or `bounded.json`
  `liveEdit.artifactPush: false` keeps local live-edit working but disables
  automatic source sync after deploys.
- With cloud source push enabled, successful local live-edit deploys attempt to
  sync a filtered source copy to Bounded's configured source provider so
  cloud/review flows can use the same workspace. If Bounded reports cloud source
  sync is unavailable, keep the local deploy as successful, report the warning,
  and do not upload the source anywhere else.
- Use `bounded.json` `liveEdit.frontendDir`, `liveEdit.distDir`, and
  `liveEdit.buildCommand` for non-root frontend layouts. These are public,
  secret-free build hints. Default deploy checks `liveEdit.distDir`,
  `liveEdit.frontendDir/dist`, `dist`, then `web/dist`; cloud live-edit also
  auto-detects root and `web/` package build scripts.
- `--edit-mode variant` makes the widget default to **My version**. Use
  `canonical` to keep the existing main-app edit flow. `bounded.json`
  `liveEdit.defaultEditMode` can set the repo default.
- Cloud live-edit is offered in the deployed widget only when Bounded reports it
  available for the app. If cloud source tracking is off or the cloud source is
  not ready, use local live-edit from the daemon instead.
- Variant mode requires the default Bounded hosted frontend deploy path. If the
  app uses a custom `--deploy-command`, use canonical mode unless the owner has
  provided a custom variant-aware deploy command.

## Cloud Live-Edit

Cloud live-edit is the in-page deployed-app experience. The browser talks only
to `https://<app>.bounded.page/__bounded/widget/...`; Bounded runs the edit
server-side against the app's synchronized source, bills the owner or
collaborator's AI/external-services bucket, then publishes the resulting
frontend variant.

Required gates:

- the caller signs in with a Bounded app-scoped session and is authorized for the
  app;
- the app has not opted out of Bounded cloud source tracking;
- Bounded has a current synchronized source copy for the app;
- Bounded reports cloud live-edit available for the app;
- AI model selection is from the Bounded allowlist; and
- billing/top-up gates have room in the AI/external-services bucket.

Agents working locally must keep the configured cloud source current when source
push is enabled. After a successful local live-edit deploy, attempt the filtered
source sync. If a project opts out, do not upload source and do not offer cloud
code-improvement from the deployed widget. If a cloud edit lands while a local
checkout is open, pull/reconcile before continuing local edits instead of
assuming the checkout is authoritative.

## Agent Loop

1. Read registered apps:

```sh
curl -s http://127.0.0.1:8085/apps
```

2. Read metadata, access, and policy:

```sh
curl -s http://127.0.0.1:8085/apps/<appId>
curl -s http://127.0.0.1:8085/apps/<appId>/access
curl -s http://127.0.0.1:8085/apps/<appId>/policy
```

3. Read feedback:

```sh
curl -s http://127.0.0.1:8085/apps/<appId>/feedback
```

4. Create a job:

```sh
curl -s -X POST http://127.0.0.1:8085/apps/<appId>/propose \
  -H 'content-type: application/json' \
  -d '{"instruction":"make the inventory grid denser","editMode":"variant"}'
```

If no daemon-side `agentCommand` is configured, the job returns in
`external-agent` mode. In that mode you edit the repo directly, then call
`/validate` and `/deploy`.

If `agentCommand` is configured, the local daemon runs it in a staged workspace,
not in the real checkout. `{repo}` points at that staged workspace and
`{source_repo}` points at the real checkout. The daemon validates the staged
diff and applies only a passing diff back to the real checkout.

Use `editMode:"canonical"` for the original full app edit/deploy flow. Use
`editMode:"variant"` when artifacts are enabled and the user wants their own
frontend branch. Variant jobs deploy a frontend-only branch; backend functions,
data, policies, permissions, and invariants remain shared and enforced.

5. Edit only within the granted scope.

At `app` scope, do not edit:

- `policy.json` or the policy path from `bounded.json`;
- `bounded.json`;
- `.bounded/app.json`;
- `.bounded/credentials`;
- `.env*`;
- `*.key` or `*.keypair.json`;
- any path listed in `rootConstraints`.

At `app+policy`, policy edits are allowed, but secret/project-control files and
root constraints still are not.

6. Validate before deploy:

```sh
curl -s -X POST http://127.0.0.1:8085/apps/<appId>/validate \
  -H 'content-type: application/json' \
  -d '{"jobId":"<jobId>"}'
```

If validation fails, stop and report a refusal. Name the rule or invariant from
`violatedInvariant` when present. Do not deploy a refused job.

7. Deploy:

```sh
curl -s -X POST http://127.0.0.1:8085/apps/<appId>/deploy/<jobId>
```

8. Poll job status:

```sh
curl -s http://127.0.0.1:8085/apps/<appId>/jobs/<jobId>
```

The dashboard and agents can also read recent daemon-memory jobs:

```sh
curl -s http://127.0.0.1:8085/apps/<appId>/jobs
```

## Widget Embed

For a creator-local v1 app, embed the local widget script in the app frontend:

```html
<script async src="http://127.0.0.1:8085/apps/<appId>/widget.js"></script>
```

The widget renders the animated Bounded mark as the launcher; clicking it opens a
panel (the launcher mark doubles as the minimize control) with three tabs —
**Prompt**, **Dashboard**, and **Non-negotiables** — and a persistent
**privacy toggle** above them. It:

- reads `GET /apps/<appId>/widget/config` (which now also carries a
  `policySummary` of collections + invariants for the Non-negotiables tab);
- mints a short-lived widget session with `POST /apps/<appId>/widget/session`;
- saves launcher corner placement, last tab, and the one-hour hide window in
  `localStorage`; the move control cycles the launcher through the four corners;
- stops widget keyboard/input events from bubbling into the host app while the
  user is typing;
- shows whether it is connected to localhost and tells the user to run
  `bounded dashboard` if not;
- **Privacy toggle** (always visible when connected): reads
  `GET /apps/<appId>/site-privacy` and flips it with
  `POST /apps/<appId>/site-privacy {private}` (capability `privacy`, owner-gated).
  This is the in-app way to make a private app public (or vice-versa) without the
  CLI; the daemon proxies the owner-gated dev-api and syncs the edge gate;
- **Prompt** tab: a runner selector (the daemon's `codex`, `claude`, `opencode`,
  `pi`, `other` probes), an edit-mode selector when artifacts are enabled, plus
  a composer that writes feedback with
  `POST /apps/<appId>/feedback`, starts a job with `POST /apps/<appId>/propose`,
  polls `GET /apps/<appId>/jobs/<jobId>`, and deploys validated jobs with
  `POST /apps/<appId>/deploy/<jobId>`;
- **Dashboard** tab: embeds the app dashboard at `dashboardUrl` (usually
  `http://localhost:8008/apps/<appId>`) in an iframe, with an expand-to-fullscreen
  view that minimizes back;
- **Non-negotiables** tab: the policy's proven invariants plus the guardrails
  applied to every prompt (policy lock, secret protection, staged validation).

If the app cannot load from `127.0.0.1`, use the same script with
`data-api-base` pointed at the reachable daemon or cloud server:

```html
<script
  async
  src="https://example-daemon/apps/<appId>/widget.js"
  data-app-id="<appId>"
  data-api-base="https://example-daemon"
></script>
```

The local daemon accepts browser CORS only from localhost, its configured
dashboard URL, registered live-edit app origins, and the matching hosted
`https://<appId>.bounded.page` origin for `/apps/<appId>/...` routes.
Registered custom origins are app-specific: a custom domain registered on one
app must not be accepted for another app's `/apps/:appId/...` route. Deployed
HTTPS pages should not rely on background localhost requests to unlock a private
site; use normal Bounded sign-in for the deployed gate, or open the top-level
local dashboard link for local editing.
Browser-origin widget actions include `X-Bounded-Live-Edit-Token`; local
no-Origin agent/curl calls do not need that token.

When a variant deploy succeeds, the hosted router activates it with a session
cookie and redirects back to the normal app path. The URL stays like
`https://<app>.bounded.page`; the widget may show "Using my version" from
session storage and offers an Original switch-back. Preview/share links may use
`/__bounded/preview?variant=<variantId>` or `?bounded_preview=<variantId>` to
activate someone else's shared branch, then return to the normal URL.

## Rollback

For Bounded static-hosted apps (`https://<appId>.bounded.page`), site deploys are
versioned by the router and `/rollback` restores the previous static artifact.
For frontend variants, owners can review current branches with
`bounded site variants --app-id <id>` and roll back a branch with
`bounded site rollback --variant <variantId> --app-id <id>` before promoting it.
For custom deploy targets, register a `--rollback-command`; otherwise the daemon
must refuse rollback instead of guessing.

## Safety Language

Be precise:

- Tier-1 state invariants are enforced by Bounded below the app code.
- App-code edits at `app` scope cannot remove those invariants.
- Frontend variants can change workflow and UI, but cannot grant backend
  permissions or bypass policy.
- `app+policy` can change invariants, so the guarantee changes: invariants hold
  only after the new policy itself verifies and deploys.
- Rendered behavior, copy, layout, and gameplay are not formally proven.

If the user asks for something like "mint everyone infinite Ink" and validation
or runtime policy rejects it, explain the refusal plainly and name the rule.

## Local Commands

```sh
bounded dev --app-id <appId>
bounded dashboard
bounded live-edit list
bounded live-edit register --help
```

The server contract lives in the CLI repo at
`docs/live-edit-server-contract.md`. Update that contract whenever endpoint or
enforcement behavior changes.

Related:

- `cli-reference.md`
- `frontend-hosting.md`
- `verify-and-counterexamples.md`
- `proof-coverage.md`
