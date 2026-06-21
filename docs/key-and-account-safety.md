# Key & account safety — don't lose your apps

**What's in here / when to read this:** the single most important operational
fact about Bounded — **your CLI keypair IS your account, and it OWNS every app you
create.** Read this BEFORE your first deploy, and read it again any time you set up
CI, switch machines, or hand a project to a teammate or another agent. Losing this
key without linking or sharing first means your apps are **gone** — there is no
server-side reset.

> **TL;DR.** `~/.bounded/credentials` is a Solana private key, auto-generated the
> first time you run an authenticated command, never shown to you, never backed up.
> It owns your apps. Treat it like an SSH private key: **back it up, and run
> `bounded link` on day one.** The public `.bounded/app.json` marker is safe to
> commit; the credentials file is not.

## 1. The credentials file IS your account

When you first run a command that needs auth (e.g. `bounded whoami` or
`bounded deploy --create`), the CLI creates a keypair for you with **zero
ceremony**:

- `~/.bounded/credentials` — one base58-encoded **64-byte Solana ed25519 secret
  key** (32-byte seed + 32-byte pubkey). File mode `0600`, directory `~/.bounded`
  mode `0700`.
- It is **auto-generated on first use**, the address is printed once to stderr, and
  the private key is **never shown again** and **never auto-backed-up** anywhere.
- **This one key OWNS every app you create.** `bounded deploy --create` makes an app
  owned by this pubkey. Ownership on Bounded *is* the keypair — there is no separate
  account password, no email-and-password login behind it by default.

**The hard truth:** if you lose `~/.bounded/credentials` and you never linked it to
an account or added a backup owner, **every app it created is unrecoverable.** There
is no "forgot my key" flow, no support master-reset, no way to re-mint ownership.
Ownership is the keypair, full stop.

So treat this file exactly like an **SSH private key**: back it up somewhere safe,
don't paste it anywhere, and set up a recovery path (`bounded link`) *before* you
have anything to lose.

## 2. `BOUNDED_PRIVATE_KEY` — the CI override

For CI / automation, set the base58 secret key in the `BOUNDED_PRIVATE_KEY` env var.
When present it **overrides the file** entirely.

- It is a **secret**. Never commit it, never log it, never echo it. Store it in your
  CI provider's secret manager.
- It must be the **same key** that owns the apps your CI touches (or a linked /
  shared collaborator) — a different key is a different account that can't see your
  apps.

## 3. Key resolution precedence

The CLI picks the private key in this exact order — **first match wins**:

| Order | Source | Use |
|---|---|---|
| 1 | `BOUNDED_PRIVATE_KEY` (env) | CI / automation |
| 2 | `<project>/.bounded/credentials` | project-scoped key (opt-in; one app = one isolated key) |
| 3 | `~/.bounded/credentials` | global default (auto-created, zero ceremony) |

The global key (3) is the default and auto-works. A **project key** (2) is opt-in —
drop a `credentials` file in the project's `.bounded/` directory if you want this one
app on its own isolated key (and gitignore it — see §5). The marker always records
*which* source was used (§4).

## 4. The per-app marker — `.bounded/app.json` (PUBLIC, committable)

Every project gets a marker written by `bounded deploy --create` (and refreshed by
later deploys / `bounded link`). It is **PUBLIC** — it records the owner *public*
key and *where* the private key lives, but **never the private key itself**. Commit
it: it tells your teammate (or future you) which app this folder is, who owns it,
and which key to use.

```json
{
  "appId": "6a37ecc89def2f10f13aa922",
  "name": "my-app",
  "env": "production",
  "protocol": "realtime_offchain",
  "owner": "GFdiGThC8DJ5oMdDYj1xgyQJjWkje6EbzH2jdUMcuWBt",
  "ownerKeySource": "global (~/.bounded/credentials)",
  "linkedAccount": "amit@poof.new",
  "createdAt": "2026-06-21T18:00:00Z"
}
```

| Field | Meaning |
|---|---|
| `owner` | the **public key** that owns the app (so the owner pubkey is always visible) |
| `ownerKeySource` | **WHERE** the private key lives — `global (~/.bounded/credentials)`, `project (.bounded/credentials)`, or `env (BOUNDED_PRIVATE_KEY)`. Never the key, just its home. |
| `linkedAccount` | the email/human account this owner is linked to (the recovery path), blank if not linked |

`ownerKeySource` answers "where did the key for this app come from?" without ever
embedding a secret. If it says `global`, the key is in `~/.bounded/credentials` on
the machine that created the app.

## 5. The managed `.gitignore` block

`bounded deploy --create` / `bounded init` appends an idempotent managed block to
your project `.gitignore` (only if absent). It ignores everything that could carry a
raw secret and **keeps the public marker committable**:

```gitignore
# Bounded (managed) — never commit private keys or secrets.
# The public marker .bounded/app.json IS safe to commit; everything below is not.
.bounded/credentials
.bounded/*.key
*.key
*.keypair.json
.env
.env.*
!.env.example
```

- `.bounded/app.json` (the public marker) is **deliberately NOT ignored** — commit it.
- A project key, any dropped keypair file, and a `.env` holding `BOUNDED_PRIVATE_KEY`
  are all ignored so you can't accidentally commit a secret.
- `!.env.example` keeps a checked-in example env file allowed.

## 6. `bounded link` — the day-one anti-loss move

`bounded link` attaches your keypair to your **email account** via an OAuth-style
**device flow** (it opens a verify URL + code, with a device-fingerprint
anti-phishing confirmation). On approval:

- Your keypair and your email account's wallet become **mutual admin
  collaborators** on each other's apps.
- Your apps become **reachable and administrable from the web account** — so if the
  local key is lost, you can still get to them.

This is **the** anti-loss mechanism. Run it on day one, before you have apps worth
losing.

> **`bounded link` does NOT roll or replace your key.** The keypair keeps signing for
> everything; linking only **adds** an association (an account it's reachable from).
> There is no key rotation.

## 7. `bounded share` — add a backup owner BEFORE loss

```bash
bounded share <wallet|email> --app-id <id> [--role policy|admin]
```

Adds a collaborator to one app (owner-gated):

- **email** → resolved to its auto-provisioned embedded wallet, added as **admin**
  by default (they need no wallet of their own).
- **wallet** → added directly, default role **policy**.
- `admin` grants act/sign + policy management; `policy` is policy-only.

A shared **admin** can act on the app, so they survive your key loss *for that app*.
Add a backup owner **before** anything goes wrong.

> **There is no `transfer-ownership`, no key-rotation, and no recovery command.**
> The only ways an app survives losing its key are: you **linked** the key, you
> **shared** the app with another identity, or you **backed up** the key file. All
> three must happen *before* the loss.

## 8. Recovery decision table

| Situation | Can you still reach the app? |
|---|---|
| **Linked** (`bounded link`) | **Yes** — administrable from your web/email account. |
| **Shared admin** (`bounded share … --role admin`) | **Yes** — that identity can act on the app. |
| **Backed up the key file** | **Yes** — restore `~/.bounded/credentials` and you're the owner again. |
| **None of the above + key lost** | **No.** The app is **orphaned.** No server-side master reset exists — ownership is the keypair. |

Link early so the first row is always the one that applies.

## 9. Agent guidance — what the assistant must do

When you (an AI agent) operate Bounded on a human's behalf:

1. **On the first `deploy --create` in a project, SUGGEST `bounded link`** to the
   human, so their work isn't tied to a throwaway key. Confirm with them where the
   key lives.
2. **Always tell the human WHERE the app's private key lives** (the marker's
   `ownerKeySource`) **and what the public owner address is** (`owner`). They need to
   know which key to back up.
3. **Never echo, print, or commit the private key.** Rely on the public
   `.bounded/app.json` for provenance. The credentials file and
   `BOUNDED_PRIVATE_KEY` are secrets — keep them out of logs, chat, and the repo.
4. **On a new machine, reuse the SAME key** (copy `~/.bounded/credentials` securely)
   **or `bounded link` both machines to one account.** Do **not** silently let the
   CLI auto-generate a *second* identity — that new key is a different account that
   **can't see the first machine's apps**.

## First-time setup (do this once)

```bash
bounded whoami        # auto-creates ~/.bounded/credentials; note the address
bounded link          # attach the key to your email account — your safety net
# ... back up ~/.bounded/credentials somewhere safe (treat it like an SSH key)
bounded deploy ./policy.json --create --name my-app   # writes .bounded/app.json + .gitignore block
git add .bounded/app.json .gitignore        # commit the PUBLIC marker, not the key
```

## Returning / new machine (don't spawn a second identity)

If the CLI auto-creates a key on a new machine, that's a **brand-new account** — it
can't see apps created elsewhere. Instead, do one of:

```bash
# Option A — reuse the same global key (copy it securely from the old machine)
#   scp old-machine:~/.bounded/credentials ~/.bounded/credentials   # then chmod 600
chmod 600 ~/.bounded/credentials
bounded whoami        # confirm the address matches your apps' owner

# Option B — link this machine's key to the same email account
bounded link          # now both keys are admin-collaborators on your apps

# Option C — CI / one-off: supply the owning key via env (never commit it)
export BOUNDED_PRIVATE_KEY=<base58-secret>
bounded whoami        # should show your existing owner address
```

After either A or B, `bounded whoami` should show the owner address that matches
`owner` in your projects' `.bounded/app.json`.

## Related

- [cli-reference.md](cli-reference.md) — `whoami`, `link`, `share`, `collaborators`, key source
- [auth.md](auth.md) — the keypair identity, end-user login, and the recovery callout
- [admin-and-ownership.md](admin-and-ownership.md) — control plane vs data plane; no owner god-mode
- [secrets.md](secrets.md) — app-level secret values (Stripe/OpenAI keys), kept out of code
