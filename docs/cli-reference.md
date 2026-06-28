# CLI Reference — every `bounded` command

**What's in here / when to read this:** every `bounded` command + flag, grouped
by purpose. Every flag below exists in the CLI; `bounded <cmd> --help` prints the
same with an Example block.

**Global flags** (any command): `--json` (structured output for agents —
errors are emitted as JSON too), `--quiet` (minimal output), `--env`
(`production`; also `BOUNDED_ENV`).

## Identity & teams

No login step — your ed25519 keypair IS your account, and **owns every app you
create**. It lives in `~/.bounded/credentials` (a JSON file with a base58
`privateKey` field, mode `0600` in a `0700` dir, auto-created on first run), or is
supplied via the `BOUNDED_PRIVATE_KEY` env var (a **base58** secret string, which
overrides the file). See [auth.md](auth.md).

> **This file is your account, and it is unrecoverable if lost.** There is no
> password reset and no server-side master key — ownership *is* the keypair. If
> you lose `~/.bounded/credentials` without having linked or shared, every app it
> created is orphaned forever. Treat it like an SSH private key: **back it up.**
> Then run `bounded link` (below) so the apps survive local key loss. Full safety
> model: [key-and-account-safety.md](key-and-account-safety.md).

> **Never commit a key.** `BOUNDED_PRIVATE_KEY` and the raw `privateKey` are
> secrets — never commit or log them. `deploy --create` writes a managed
> `.gitignore` secrets block for you (see below), but you are still responsible
> for keys you drop in a repo by hand.

> **Running another identity:** use `bounded account use <profile>` in the
> project, then `bounded whoami` or `bounded link --email you@example.com`.
> Profile keys live at `~/.bounded/accounts/<profile>/credentials`, so one
> project can use your default account and another can use a client/team account
> without committing secrets. You can still use `BOUNDED_PRIVATE_KEY` for CI.

| Command | Does | Example |
|---|---|---|
| `version` | Print which CLI build you're on (version/commit/date). Same info via `bounded --version` / `-v`. Use after rebuilding the bundle to confirm you picked up the latest. No network/key. `--json` for fields. | `bounded version` |
| `whoami` | Show address, environment, key source, linked email (if any), and this folder's app marker if present (creates the key on first run) | `bounded whoami` |
| `link` | **The anti-loss move.** Bind the keypair to your human (email) account via an **OAuth device flow** (with an anti-phishing fingerprint), or use `--email` for headless OTP approval; keypair + email-account wallet become admin-collaborators on each other's apps, so your apps survive local key loss. The keypair keeps signing — linking only ADDS the association, it never rolls or replaces the key. | `bounded link --email you@example.com` |
| `account` / `account use` | Show or set this project's account source in `bounded.json`: global, project, profile, or env. | `bounded account use client-a` |
| `share <wallet\|email> --role policy\|admin --app-id <id>` | Add a collaborator (a backup owner). **Wallet** → direct. **Email** → resolved to its auto-provisioned embedded wallet, added with the role you chose, and sent an invite email when outbound email is configured. Owner only. Share BEFORE loss — there is no transfer-ownership and no key-recovery command. | `bounded share teammate@example.com --role admin --app-id <id>` |
| `unshare <wallet> --app-id <id>` | Remove a collaborator (owner only) | `bounded unshare <wallet> --app-id <id>` |
| `collaborators --app-id <id>` | List collaborators (alias: `shares`) | `bounded collaborators --app-id <id>` |

`link` flags: `--no-browser` (just print the URL), `--email <addr>` (headless
approval: email an OTP, read it from stdin, approve this device), `--timeout
<dur>` (default `10m`). Collaboration grants **control-plane** authority (manage
the app), not a data-plane bypass — give data powers explicitly via policy rules
([admin-and-ownership.md](admin-and-ownership.md)).

### Project config — `bounded.json`

`bounded init` writes public `bounded.json`; `deploy --create` fills in `appId`.
Agents should read this file first. It is safe to commit and contains no private
key material:

```json
{
  "$schema": "https://bounded.sh/schemas/bounded.schema.json",
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "environment": "production",
  "protocol": "realtime_offchain",
  "policy": "policy.json",
  "liveEdit": {
    "artifacts": false,
    "artifactPush": false,
    "defaultEditMode": "canonical"
  },
  "account": {
    "keySource": "profile",
    "profile": "client-a"
  }
}
```

Resolution rules:

| Config | Private key location |
|---|---|
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
```

Explicit flags still win: `--app-id`, `--env`, and `BOUNDED_PRIVATE_KEY` override
project defaults. Older projects with only `.bounded/app.json` still work; the
CLI falls back to that marker when `bounded.json` is absent.

### The per-app marker — `.bounded/app.json`

On `deploy --create`, the CLI writes a per-app marker at
`<project>/.bounded/app.json`. It records only **PUBLIC** information (never a
private key) and is **safe to commit** — it tells anyone with the repo which app,
owner, and env this folder maps to, and which key a teammate needs:

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

- `owner` — the **public key** that owns the app.
- `ownerKeySource` — WHERE the private key lives (never the key itself): one of
  `global (~/.bounded/credentials)`, `project (.bounded/credentials)`,
  `profile "<name>" (~/.bounded/accounts/<name>/credentials)`, or
  `env (BOUNDED_PRIVATE_KEY)`. Answers "which key do I need for this app?"
- `sitePrivate` — true when the hosted static site was created behind the
  private site gate. Older/public apps may omit it.
- `linkedAccount` — the email account this owner is linked to (the recovery path),
  blank if you haven't run `bounded link`.

`deploy --create` also maintains a managed `.gitignore` block that ignores every
secret-bearing path (`.bounded/credentials`, `*.key`, `*.keypair.json`, `.env`,
`.env.*`) while keeping the public `.bounded/app.json` marker committable. Full
treatment: [key-and-account-safety.md](key-and-account-safety.md).

## Policy lifecycle

| Command | Does | Key flags |
|---|---|---|
| `init` | Write starter `policy.json` plus public `bounded.json` | `--force` overwrite |
| `verify [policy.json]` | Run the proof engine, print the report + counterexamples | `--app-id` (defaults to `bounded.json`), `--operation`, `--constants`, `--environment` |
| `deploy [policy.json]` | Validate, compile, and push the policy (same fail-closed gate) | `--app-id` (defaults to `bounded.json`) or `--create --name`, `--protocol`, `--public`, `--constants`, `--environment` |
| `dev` | Run the focused app dashboard, auto-register that app for live-edit, and start the loopback API daemon | `--app-id`, `--port`, `--api-port`, `--policy`, `--force` |
| `dashboard` | Run the local multi-project dashboard daemon + web UI | `--port`, `--api-port`, `--no-web`, `--force` |
| `live-edit register/list` | Register local repos for the dashboard daemon's live-edit `/apps/:appId/...` API | `--app-id`, `--repo`, `--origin`, `--scope`, `--artifacts on\|off`, `--artifact-push on\|off`, `--edit-mode canonical\|variant`, `--build-command`, `--deploy-command`, `--rollback-command` |

```bash
bounded init                                            # scaffold policy.json + bounded.json
bounded deploy --create --name my-app                   # create app + record appId; hosted site gate defaults private
bounded deploy --create --name my-app --public          # opt out; hosted site is public from the start
bounded verify                                          # re-prove after edits
bounded deploy                                          # redeploy using bounded.json
```

## Local dashboard

The installer starts the dashboard daemon on `http://127.0.0.1:8085` by
default. Set `BOUNDED_DASHBOARD=0` during install only when you do not want a
background local daemon.

Open the full web UI beside the normal CLI loop:

```bash
bounded dashboard
```

It starts a loopback-only daemon and the local web UI. The daemon holds the
keypair and mints app-pinned sessions on demand; the browser never receives the
private key. Use it as the default companion surface while building: inspect all
local apps, read data through the daemon, view deployed policy/proof reports,
invoke functions, and check dashboard-brokered invocation logs.
Private hosted-site gates also use this daemon: a first visit to
`https://<appId>.bounded.page` calls
`GET /api/apps/<appId>/site-gate-session` and unlocks as the local CLI user when
that user is an owner, manager, or collaborator. Agents should keep
`bounded dashboard --no-web` or `bounded dev --app-id <id>` running during
private-site testing.

Useful flags:

```bash
bounded dashboard --port 8008 --api-port 8085
bounded dashboard --no-web   # daemon API only, for a separate SPA dev server
```

For the current project only, use:

```bash
bounded dev --app-id <id>
```

`bounded dev` opens the dashboard scoped to that app, registers it in the
live-edit registry if needed, and starts the same `/apps/:appId/...` daemon API.

## Live-edit registry and API

Live-edit is a local daemon API, not a new proof primitive. Register each app id
with the local checkout and deployed origin the daemon should operate on:

```bash
bounded live-edit register --app-id <id> --repo . --origin https://<id>.bounded.page
bounded live-edit register --app-id <id> --repo . --origin https://<id>.bounded.page --artifacts on --edit-mode variant
bounded live-edit list
```

The dashboard daemon then serves:

```text
GET  http://127.0.0.1:8085/apps
GET  http://127.0.0.1:8085/api/apps/<appId>/site-gate-session
GET  http://127.0.0.1:8085/apps/<appId>
GET  http://127.0.0.1:8085/apps/<appId>/widget.js
POST http://127.0.0.1:8085/apps/<appId>/widget/session
POST http://127.0.0.1:8085/apps/<appId>/propose
POST http://127.0.0.1:8085/apps/<appId>/validate
GET  http://127.0.0.1:8085/apps/<appId>/jobs
POST http://127.0.0.1:8085/apps/<appId>/deploy/<jobId>
POST http://127.0.0.1:8085/apps/<appId>/rollback
```

Use `--scope app` for guarded app-code edits and `--scope app+policy` only for
trusted full-development surfaces. Full agent workflow: [live-edit.md](live-edit.md).
Configured daemon `agentCommand` jobs run in a staged workspace first; only a
validated diff is applied back to the real checkout.

The local daemon accepts browser CORS only from localhost, the dashboard web
origin, app-specific registered live-edit origins, and the matching
`https://<appId>.bounded.page` origin for `/apps/<appId>/...` routes. The widget
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
| `billing status` | Show current Bounded plan and bucket status | `bounded billing status` |
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
> values that live with the policy — see [constants-and-defs.md](constants-and-defs.md).
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
| `live status <room-path>` | Show live room diagnostics (`available`, `running`, `stopReason`, `etag`, `generation`, tick/alarm times). `--app-id` defaults to `bounded.json`. | `bounded live status rooms/r1` |
| `secret put <NAME> [VALUE]` | Set/update a backend secret for an app. Prefer `--value-stdin`, `--value-env`, or the hidden prompt so the value is not placed in argv; legacy `VALUE` still works with a warning. | `printf '%s' "$STRIPE_KEY" \| bounded secret put STRIPE_KEY --value-stdin --app-id <id>` |
| `secret list` | List secret NAMES for an app (never values) | `bounded secret list --app-id <id>` |
| `secret rm <NAME>` | Remove a secret | `bounded secret rm STRIPE_KEY --app-id <id>` |
| `site deploy [dir]` | Publish a built static frontend (default `./dist`, needs `index.html`) to `<app>.bounded.page`; if no app is linked, creates a private app unless `--public` is passed; deploys are versioned for static-host rollback. Add `--variant <var_id>` to upload a preview frontend branch without replacing the canonical site. | `bounded site deploy ./dist --app-id <id>` |
| `site variants` | List current frontend variants for owner/admin review: status, deploy id, preview/switch paths, and affected files. | `bounded site variants --app-id <id>` |
| `site rollback [deployId]` | Roll back the canonical hosted frontend, or pass `--variant <var_id>` to roll back a frontend variant to its previous accepted deploy. | `bounded site rollback --variant var_amit_refunds --app-id <id>` |
| `site promote <variantId>` | Promote a frontend variant into the canonical hosted site after owner/admin authorization. Backend rules, data, functions, and policies stay unchanged. | `bounded site promote var_amit_refunds --app-id <id>` |
| `site privacy [status\|private\|public]` | Show or change the hosted static site's gate; applies to raw app-id, vanity slug, and active custom-domain hosts for the app, not API hosts | `bounded site privacy public --app-id <id>` |

The backend runs with a sealed `ctx` (store / ai / schedule / fetch / identity) — see
[backend-runtime.md](backend-runtime.md). Frontend hosting: [frontend-hosting.md](frontend-hosting.md).
`<app>-api.bounded.page` routes to your backend; `<app>.bounded.page` serves the site.
For Bounded-hosted static apps, live-edit rollback restores the previous router
artifact. Custom hosts need an explicit `--rollback-command`.

## Domains

| Command | Does | Example |
|---|---|---|
| `domains slug [slug]` | Claim one canonical vanity `<slug>.bounded.page` for an app; `--release` frees it | `bounded domains slug myapp --app-id <id>` |
| `domains list` | List custom domains and refresh pending SSL/ownership status | `bounded domains list --app-id <id>` |
| `domains add <domain>` | Add a custom frontend domain you own (Pro); prints the DNS records to create | `bounded domains add app.yourdomain.com --app-id <id>` |
| `domains remove <domain>` | Remove a custom domain and its routing/origin entry | `bounded domains remove app.yourdomain.com --app-id <id>` |

Vanity slugs are free. Custom domains are Pro-gated on the app owner's account.
If the owner later loses Pro, Bounded may remove or disable custom domain links;
the raw `<appId>.bounded.page` URL and any vanity `<slug>.bounded.page` fallback
keep working. Custom domains serve the static frontend only; API calls should use
the app's Bounded API hostname. Custom domains inherit the app's hosted-site
privacy gate; use `bounded site privacy private|public --app-id <id>` to change
the raw, vanity, and custom static hosts together. For root/apex domains, the
DNS record may be a CNAME at `@`; if your DNS host rejects that, use a subdomain
like `www` or move the zone's nameservers to Cloudflare for CNAME flattening.

## Data plane

All `data` subcommands take `--app-id <id>` (required) and optional
`--chain realtime` (default; `mainnet` arrives later). Writes go through
Bounded, which enforces the deployed policy atomically. Full semantics:
[data-plane.md](data-plane.md); reads: [queries.md](queries.md).

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
  [--auth '<rule>'] [--secret K=V] [--timeout <sec>]
bounded functions list   --app-id <id>
bounded functions invoke <name> --app-id <id> [--data '<json>']
bounded functions logs   <name> --app-id <id>
```

`deploy` uploads the function's code and merges its entry (the invocation `auth`
rule, `entry`, `timeout`, `secrets`) into the policy — owner/admin only. `invoke`
attaches your session token automatically (same token as `data`) so the
Bounded gates the call on the `auth` rule, then prints the function's JSON (or
the platform error — `403` if the rule denies you). Caller-scoped functions may
be invoked by any caller their `auth` rule admits; functions that declare
`actAs` in policy are service-identity functions and must be admin-gated at
verify/deploy. Full guide:
[functions.md](functions.md).

## Related

- [data-plane.md](data-plane.md) — write semantics, atomic batches, failure codes
- [queries.md](queries.md) — filters, sort, paging, aggregations, search in depth
- [sdk-reference.md](sdk-reference.md) — the same operations from TypeScript
- [auth.md](auth.md) — the keypair identity the CLI acts as
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — reading `verify` output
