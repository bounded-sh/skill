# Key & account safety — wallet keys and web sessions

**What's in here / when to read this:** how `bounded.json` selects the CLI account
source, when wallet/keypair credentials are the ownership secret, and when a
project should use a Bounded web account session instead. Read this before your
first deploy, and read it again any time you set up CI, switch machines, or hand
a project to a teammate or another agent.

> **TL;DR.** In wallet/keypair mode, `~/.bounded/credentials`, a profile key, a
> project key, or `BOUNDED_PRIVATE_KEY` owns the apps created with it. Treat that
> key like an SSH private key: back it up, run `bounded link` on day one, or share
> a backup owner. In web account mode, run `bounded account use --web` and
> `bounded login --email ...`; the CLI uses `~/.bounded/web-session.json` instead
> of a local key. Public `bounded.json` and `.bounded/app.json` are safe to commit;
> credentials and web-session files are not.

## 1. Wallet credentials own apps in wallet/keypair mode

When you first run a command that needs auth (e.g. `bounded whoami` or
`bounded deploy --create`) under a wallet/keypair source, the CLI creates or loads
a keypair with **zero ceremony**:

- `~/.bounded/credentials` — the global wallet key, one base58-encoded **64-byte
  Solana ed25519 secret key** (32-byte seed + 32-byte pubkey). File mode `0600`,
  directory `~/.bounded` mode `0700`.
- `~/.bounded/accounts/<profile>/credentials` — a named wallet profile.
- `<project>/.bounded/credentials` — a repo-local wallet key, gitignored.
- `BOUNDED_PRIVATE_KEY` — an env-provided wallet key for CI/automation.
- It is **auto-generated on first use**, the address is printed once to stderr, and
  the private key is **never shown again** and **never auto-backed-up** anywhere.
- **This key owns apps created with it.** `bounded deploy --create` makes an app
  owned by the active CLI identity. In wallet/keypair mode, that means the keypair.

**The hard truth for wallet mode:** if you lose the wallet key and you never
linked it to a web account, shared the app with a backup owner, or backed it up,
the apps it created are unrecoverable. There is no "forgot my key" flow, no
support master-reset, and no way to re-mint ownership for that key.

So treat this file exactly like an **SSH private key**: back it up somewhere safe,
don't paste it anywhere, and set up a recovery path (`bounded link`) *before* you
have anything to lose.

If the project uses `account.keySource:"web"`, the CLI does not use a local wallet
key for control-plane auth. It uses `~/.bounded/web-session.json`, created by
`bounded login --email ...`, and refreshes the session when possible.

## 2. `BOUNDED_PRIVATE_KEY` — wallet CI override

For wallet-mode CI / automation, set the base58 secret key in the
`BOUNDED_PRIVATE_KEY` env var. When selected as the account source, it supplies the
wallet key without reading any credentials file.

- It is a **secret**. Never commit it, never log it, never echo it. Store it in your
  CI provider's secret manager.
- It must be the **same key** that owns the apps your CI touches (or a linked /
  shared collaborator) — a different key is a different account that can't see your
  apps.

## 3. Account source resolution

The public `bounded.json` can select `global`, `project`, `profile`, `env`, or
`web`; it never stores a private key or web token.

| Config | Auth material |
|---|---|
| `{"keySource":"web"}` | `~/.bounded/web-session.json` (Bounded Auth session; run `bounded login --email ...`) |
| `{"keySource":"env"}` | `BOUNDED_PRIVATE_KEY` |
| `{"keySource":"profile","profile":"client-a"}` | `~/.bounded/accounts/client-a/credentials` |
| `{"keySource":"project","keyPath":".bounded/credentials"}` | `<project>/.bounded/credentials` |
| `{"keySource":"global"}` | `~/.bounded/credentials` |

When `keySource` is `web`, control-plane commands use the web session. Commands
that require a local wallet signer fail with a clear message and ask you to pick
`project`, `global`, `profile`, or `env`; they should not silently link or create
a key. When a wallet/keypair source is selected, keypair commands use that source,
and `BOUNDED_PRIVATE_KEY` is the explicit CI/automation path.

The global key is the default and auto-works. For one project under another
account, run `bounded account use client-a`; the next auth command creates/uses
`~/.bounded/accounts/client-a/credentials`. For a repo-local isolated key, run
`bounded account use --project`; the key lives at `<project>/.bounded/credentials`
and is gitignored. For a web account, run `bounded account use --web`, then
`bounded login --email you@example.com`. The public config and marker always
record *which* source was used (§4).

## 3b. Deploy denied? You may be using the wrong identity — try the other one first

A control-plane command that fails with **403 `site_control_denied`** (or a
boundary-violation on `site deploy` / `deploy` / `functions`) almost never means
"you can't deploy this." It means **the identity your `bounded.json` account source
points at is not an owner/admin of that app** — and the CLI uses *only that one
source*. It does **not** fall back to your other signed-in identities.

This is the trap: you can be logged in to two accounts at once — a wallet key at
`~/.bounded/credentials` **and** a web login at `~/.bounded/web-session.json` — and
still get a hard 403, because the deploy only tried the one the config selected.
One of them may own the app while the other does not. **A 403 is a signal to switch
identity, not a dead end.** Before you conclude "owner-gated, needs someone else,"
try the identities you already have:

```bash
# What's signed in locally:
ls ~/.bounded/credentials ~/.bounded/web-session.json 2>/dev/null
bounded account --json                 # which source THIS project uses
# web session identity (if present): the email that owns it
python3 -c "import json;d=json.load(open('$HOME/.bounded/web-session.json'));print(d['email'],'exp',d['expiresAt'])"
```

Then deploy under the other identity. To avoid mutating a **shared/committed**
`bounded.json` (a co-agent may read it mid-window), deploy from a throwaway dir
whose config selects the other source — the app is unchanged, only *your* local
auth differs:

```bash
mkdir -p /tmp/deploy-as-web && cd /tmp/deploy-as-web
cat > bounded.json <<JSON
{ "appId": "<TARGET_APP_ID>", "environment": "production", "account": { "keySource": "web" } }
JSON
bounded site deploy /abs/path/to/dist      # uses ~/.bounded/web-session.json (the web login)
```

Or, for a project you own, just switch in place: `bounded account use --web` (web
login) or `bounded account use --global` (wallet), then re-deploy. If the web
session is expired, `bounded login --email you@example.com` first.

**Rule of thumb: never report a deploy as "owner-gated / blocked" until you've
tried every identity signed in on the machine.** Wallet-owns-it and web-owns-it are
both common; the CLI picks one, so the fix is usually just switching sources.

## 4. Public project markers — `bounded.json` and `.bounded/app.json`

`bounded init` writes public `bounded.json`; `bounded deploy --create` records the
app id there and also writes legacy-compatible `.bounded/app.json`. Both are
**PUBLIC** — they record the app, env, owner identity, and account source, but
**never the private key, web token, or refresh token**. Commit them: they tell
teammates and agents which app/account this folder maps to.

`bounded.json` is the first file agents should read:

```json
{
  "$schema": "https://bounded.sh/schemas/bounded.schema.json",
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "environment": "production",
  "protocol": "realtime_offchain",
  "policy": "policy.json",
  "account": {
    "keySource": "profile",
    "profile": "client-a"
  }
}
```

Web-account projects record only a public login hint:

```json
{
  "account": {
    "keySource": "web",
    "loginHint": "you@example.com"
  }
}
```

`.bounded/app.json` records the public owner identity and resolved account source:

```json
{
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "env": "production",
  "protocol": "realtime_offchain",
  "owner": "GFdiGThC8DJ5oMdDYj1xgyQJjWkje6EbzH2jdUMcuWBt",
  "ownerKeySource": "global (~/.bounded/credentials)",
  "linkedAccount": "you@example.com",
  "createdAt": "2026-06-21T18:00:00Z"
}
```

| Field | Meaning |
|---|---|
| `owner` | the public owner identity recorded at create time: a wallet address in wallet/keypair mode, or a Bounded Auth user id in web mode |
| `ownerKeySource` | the account source — `global (~/.bounded/credentials)`, `project (.bounded/credentials)`, `profile "<name>" (~/.bounded/accounts/<name>/credentials)`, `env (BOUNDED_PRIVATE_KEY)`, or `web (Bounded Auth)`. Never a key or token. |
| `linkedAccount` | the linked or logged-in web account hint when known, blank if none |

`account.keySource` / `ownerKeySource` answer "which account source does this app
use?" without ever embedding a secret. If it says `global`, the key is in
`~/.bounded/credentials` on the machine that created the app. If it says `web`,
the active session is `~/.bounded/web-session.json`.

## 5. The managed `.gitignore` block

`bounded deploy --create` / `bounded init` appends an idempotent managed block to
your project `.gitignore` (only if absent). It ignores everything that could carry a
raw secret and **keeps the public marker committable**:

```gitignore
# Bounded (managed) — never commit private keys or secrets.
# Public markers bounded.json and .bounded/app.json ARE safe to commit; everything below is not.
.bounded/credentials
.bounded/*.key
*.key
*.keypair.json
.env
.env.*
!.env.example
```

- `bounded.json` and `.bounded/app.json` (the public markers) are **deliberately
  NOT ignored** — commit them.
- A project key, any dropped keypair file, and a `.env` holding `BOUNDED_PRIVATE_KEY`
  are all ignored so you can't accidentally commit a secret. The web-session file
  lives in `~/.bounded/web-session.json`; do not copy it into a repo.
- `!.env.example` keeps a checked-in example env file allowed.

## 6. `bounded link` — wallet-mode anti-loss

The canonical identity is your **web account's user id** — wallet keys are
detachable signing credentials, and email is a verified contact/login method.
`bounded login` is a plain web login and does **not** link any local key.
`bounded link` explicitly attaches the active **local wallet key** to a **remote
Bounded web account** via an OAuth-style **device flow** (device code +
fingerprint approval at **bounded.sh/link** — agents should print that URL for
their user). The current headless approval method is email OTP: run
`bounded link --email you@example.com`; the CLI emails an OTP, reads the code
from stdin, approves the same fingerprint-checked device flow, and records the
linkage locally. Linking is **refused** if it would merge two unlinked accounts
that both already own projects. On approval:

- Your keypair and your web account become **mutual admin collaborators** on each
  other's apps.
- Your apps become **reachable and administrable from the web account** — so if the
  local key is lost, you can still get to them.
- The link is one explicit wallet-key <-> web-account pair. One local key can be
  linked to one remote account, and that email/wallet combo is the durable
  association.
- You can then run **`bounded account transfer-to-web`** (`--yes` to confirm) to
  make the web account the **owner-of-record**, so the key is fully detachable.
  Linking is not required for the transfer itself: after `bounded login`, the CLI
  proves possession of the local key automatically, so `transfer-to-web` also works
  when a link is refused (for example when both the key and the web account
  already own projects). Use `--app <appId>` (repeatable) to move a subset.

This is **the** anti-loss mechanism. Run it on day one, before you have apps worth
losing.

> **`bounded link` does NOT roll or replace your key.** The keypair keeps signing for
> everything; linking only **adds** an association (an account it's reachable from).
> There is no key rotation.

If the project already uses `account.keySource:"web"`, do not run `bounded link`;
run `bounded login --email ...` (or the current web login method) to refresh the
web session.

## 7. `bounded share` — add a backup owner BEFORE loss

```bash
bounded share <wallet|email> --app-id <id> [--role developer|admin|viewer|billing]
```

Adds a collaborator to one app (owner-gated):

- **email** → resolved to its auto-provisioned embedded wallet, added as **admin**
  by default (they need no wallet of their own).
- **wallet** → added directly, default role **policy**.
- `admin` grants act/sign + policy management; `policy` is policy-only.

A shared **admin** can act on the app, so they survive wallet-key loss *for that
app*. Add a backup owner **before** anything goes wrong.

> **There is no key-rotation and no recovery command.** The only ownership move is
> `bounded account transfer-to-web` (to your own web account, after
> `bounded login`; no link required). In wallet/keypair mode, the only ways an app survives losing its
> key are: you **linked** the key (or transferred ownership to the web account),
> you **shared** the app with another identity, or you **backed up** the key file.
> All must happen *before* the loss.

## 8. Recovery decision table

| Situation | Can you still reach the app? |
|---|---|
| **Web account source** (`bounded account use --web`) | **Yes** — log in again with `bounded login --email ...` if the session expires or is missing. |
| **Linked wallet key** (`bounded link`) | **Yes** — administrable from your web account. |
| **Shared admin** (`bounded share … --role admin`) | **Yes** — that identity can act on the app. |
| **Backed up the wallet key file** | **Yes** — restore the selected credentials file and you're the owner again. |
| **None of the above + key lost** | **No.** The app is **orphaned.** No server-side master reset exists — ownership is the keypair. |

Choose web mode or link wallet keys early so a local-machine loss is not an app
loss.

## 9. Agent guidance — what the assistant must do

When you (an AI agent) operate Bounded on a human's behalf:

1. **Read `bounded.json` first.** It is the public project source of truth for
   `appId`, environment, policy path, and account source. If absent, fall back to
   `.bounded/app.json`.
2. **If `account.keySource` is `web`, use web auth.** Run
   `bounded login --email ...` when the session is absent or stale. Do not suggest
   `bounded link`; there is no local key to link in this mode.
3. **If `account.keySource` is wallet/keypair (`global`, `project`, `profile`, or
   `env`), SUGGEST `bounded link` on first `deploy --create`** or share a backup
   owner. Confirm where the selected key lives.
4. **Tell the human which account source owns/administers the app**
   (`bounded.json` `account.keySource` / marker `ownerKeySource`) **and what the
   public owner identity is** (`owner`). For wallet mode, they need to know which
   key to back up.
5. **Never echo, print, or commit secrets.** Rely on public `bounded.json` /
   `.bounded/app.json` for provenance. Credentials files, `BOUNDED_PRIVATE_KEY`,
   and `~/.bounded/web-session.json` are secrets — keep them out of logs, chat,
   and the repo.
6. **On a new machine, do not silently spawn a second wallet identity.** Reuse the
   same wallet key, link both wallet keys to one web account, or switch the project
   to `web` and log in intentionally.

## First-time setup (do this once)

```bash
bounded init          # writes policy.json + public bounded.json
# Wallet/keypair mode:
bounded whoami        # auto-creates selected wallet credentials; note the address
bounded link          # attach the wallet key to your web account
# ... back up the selected credentials file somewhere safe

# Web account mode instead:
bounded account use --web
bounded login --email you@example.com
bounded whoami        # confirms the web identity and source

bounded deploy --create --name my-app       # records appId in bounded.json + .bounded/app.json
git add bounded.json .bounded/app.json .gitignore      # commit PUBLIC markers, not keys
```

## Returning / new machine (don't spawn an accidental wallet identity)

If the CLI auto-creates a key on a new machine, that's a **brand-new account** — it
can't see apps created elsewhere. Instead, do one of:

```bash
# Option A — reuse the same global key (copy it securely from the old machine)
#   scp old-machine:~/.bounded/credentials ~/.bounded/credentials   # then chmod 600
chmod 600 ~/.bounded/credentials
bounded whoami        # confirm the address matches your apps' owner

# Option B — link this machine's key to the same web account
bounded link          # now both keys are admin-collaborators on your apps

# Option C — CI / one-off: supply the owning key via env (never commit it)
export BOUNDED_PRIVATE_KEY=<base58-secret>
bounded whoami        # should show your existing owner address

# Option D — web account source: log in again instead of copying a key
bounded account use --web
bounded login --email you@example.com
bounded whoami        # should show your existing web identity
```

After A, B, or C, `bounded whoami` should show the wallet owner address that
matches `owner` in your project's `.bounded/app.json`. After D, it should show the
same web identity. In all cases it should also show the `bounded.json`
app/account context for configured projects.

## Related

- [cli-reference.md](cli-reference.md) — `whoami`, `login`, `link`, `share`, `collaborators`, account source
- [auth.md](../../bounded-frontend/docs/auth.md) — CLI auth, end-user login, and the recovery callout
- [admin-and-ownership.md](../../bounded-backend/docs/admin-and-ownership.md) — control plane vs data plane; no owner god-mode
- [secrets.md](../../bounded-backend/docs/secrets.md) — app-level secret values (Stripe/OpenAI keys), kept out of code
