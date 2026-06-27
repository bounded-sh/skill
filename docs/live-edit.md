# Live-Edit

Use this when a Bounded app is registered for local live-edit and the user wants
an agent to change the running app from feedback or a natural-language request.

The local reference server is the daemon started by `bounded dev` or
`bounded dashboard`. By default it serves the live-edit API at:

```text
http://127.0.0.1:8011
```

Every request is scoped to an app id. Never infer "the current app" from a
global daemon.

**Keep this daemon running for basically all local Bounded development.** It is
the one localhost backend the dashboard, the in-app widget, and the private-site
gate all call — it lists apps, mints app-pinned sessions, proxies owner-gated
reads, runs live-edit jobs, and flips site privacy, all without the browser ever
holding a key. If it is not running: the dashboard shows "daemon not reachable",
the widget renders but cannot connect, and a private site falls back to manual
login instead of one-tap CLI unlock. The installer starts it as a background
service (`bounded dashboard --no-web`); if you ever see those degraded states,
the fix is almost always "start/keep `bounded dashboard` running". Prefer leaving
it on over starting it per-task.

For private hosted sites, keep this daemon running while testing. The gate page
on `https://<appId>.bounded.page` calls
`GET /api/apps/<appId>/site-gate-session` to mint an app-pinned session as the
local CLI user, then exchanges it for the site gate cookie when that user is an
owner, manager, or collaborator.

## Register An App

From the app repo:

```sh
bounded live-edit register --app-id <appId> --repo . --origin https://<appId>.bounded.page
```

Useful options:

```sh
bounded live-edit register \
  --scope app \
  --feedback-path boundedfeedback \
  --build-command "npm run build" \
  --deploy-command "bounded site deploy dist --app-id {app_id}"
```

Scopes:

- `app`: app code only; policy is read-only.
- `app+policy`: app code and policy can both be edited.

Default to `app` unless the creator explicitly asks for full development.

## Agent Loop

1. Read registered apps:

```sh
curl -s http://127.0.0.1:8011/apps
```

2. Read metadata, access, and policy:

```sh
curl -s http://127.0.0.1:8011/apps/<appId>
curl -s http://127.0.0.1:8011/apps/<appId>/access
curl -s http://127.0.0.1:8011/apps/<appId>/policy
```

3. Read feedback:

```sh
curl -s http://127.0.0.1:8011/apps/<appId>/feedback
```

4. Create a job:

```sh
curl -s -X POST http://127.0.0.1:8011/apps/<appId>/propose \
  -H 'content-type: application/json' \
  -d '{"instruction":"make the inventory grid denser"}'
```

If no daemon-side `agentCommand` is configured, the job returns in
`external-agent` mode. In that mode you edit the repo directly, then call
`/validate` and `/deploy`.

If `agentCommand` is configured, the local daemon runs it in a staged workspace,
not in the real checkout. `{repo}` points at that staged workspace and
`{source_repo}` points at the real checkout. The daemon validates the staged
diff and applies only a passing diff back to the real checkout.

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
curl -s -X POST http://127.0.0.1:8011/apps/<appId>/validate \
  -H 'content-type: application/json' \
  -d '{"jobId":"<jobId>"}'
```

If validation fails, stop and report a refusal. Name the rule or invariant from
`violatedInvariant` when present. Do not deploy a refused job.

7. Deploy:

```sh
curl -s -X POST http://127.0.0.1:8011/apps/<appId>/deploy/<jobId>
```

8. Poll job status:

```sh
curl -s http://127.0.0.1:8011/apps/<appId>/jobs/<jobId>
```

The dashboard and agents can also read recent daemon-memory jobs:

```sh
curl -s http://127.0.0.1:8011/apps/<appId>/jobs
```

## Widget Embed

For a creator-local v1 app, embed the local widget script in the app frontend:

```html
<script async src="http://127.0.0.1:8011/apps/<appId>/widget.js"></script>
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
  `pi`, `other` probes) plus a composer that writes feedback with
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
`https://<appId>.bounded.page` origin for `/apps/<appId>/...` routes and the
raw-app private-site gate route `/api/apps/<appId>/site-gate-session`.
Registered custom origins are app-specific: a custom domain registered on one
app must not be accepted for another app's `/apps/:appId/...` route. If the
widget or gate cannot reach the daemon, first confirm the app origin is
registered correctly or use the raw `<appId>.bounded.page` URL for daemon
auto-unlock.
Browser-origin widget actions include `X-Bounded-Live-Edit-Token`; local
no-Origin agent/curl calls do not need that token.

## Rollback

For Bounded static-hosted apps (`https://<appId>.bounded.page`), site deploys are
versioned by the router and `/rollback` restores the previous static artifact.
For custom deploy targets, register a `--rollback-command`; otherwise the daemon
must refuse rollback instead of guessing.

## Safety Language

Be precise:

- Tier-1 state invariants are enforced by Bounded below the app code.
- App-code edits at `app` scope cannot remove those invariants.
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
