# Access playbook — don't give up on an access error

**What's in here / when to read this:** you tried to `deploy`, `site deploy`,
or run `bounded access` and hit **`requires a keypair`**, a **`401`/`403`**, or
"you don't have access" — and you're about to tell the human they're **blocked on
the owner**. **Stop and read this first.** Those errors are almost never "you lack
access." They are almost always **the wrong identity is selected** or a **stale
token**. This is the diagnostic playbook that runs the real checks instead of
surrendering. For the roles/capabilities model behind it, see
[access-control.md](../../bounded-backend/docs/access-control.md).

> **The incident this doc exists to prevent.** A user was an **admin**
> (`ui:deploy` = ✓) on an app and could deploy the whole time. Their CLI was
> signed in as a **web-login** account, so `bounded site deploy` errored
> `requires a keypair`. The agent read that as a permissions wall and said
> "blocked on the owner's account" for *many turns*. Both conclusions were wrong:
> the user had `ui:deploy`, and the error was a CLI-version quirk, not a wall.

## First move: run the canonical check (never hand-roll a token curl)

```bash
bounded whoami                          # WHO am I signed in as right now?
bounded access --app-id <id>            # WHAT can this identity do on this app?
bounded access --app-id <id> --json     # per-capability arrays — the source of truth
```

`bounded access` prints **your effective role** on the app. If you have the
capability, you can do the thing — no owner needed:

| You have | You can |
|---|---|
| `ui:deploy` | `bounded site deploy` (publish the frontend) |
| `policy:deploy` | `bounded deploy` (push `policy.json`) |
| `functions:deploy` | deploy backend functions |
| `code:read` | read/clone the source |

`admin`, `developer`, and `owner` all carry `ui:deploy` + `policy:deploy` +
`functions:deploy`. **Do NOT** probe access by curling a token against the API —
stale/expired tokens return misleading `401`s and send you chasing a permissions
problem that doesn't exist. `bounded access` is the answer; trust it over a raw
HTTP status.

## The five things an access error is (almost always) really telling you

### 1. Wrong identity selected — the #1 cause

A person has **three separate-but-linked identities**, and only one of them may
hold the grant:

- their **email** (web login, e.g. `amit@poof.new`),
- their **wallet**,
- their **CLI keypair** (`~/.bounded/credentials`).

If the owner shared the app **with an email**, the **email identity** is the
member — **not necessarily the CLI keypair** you happen to be signed in as. A
freshly auto-created global keypair owns nothing and will 401 on everything.
`bounded whoami` tells you which identity is active. Switch and **re-check under
each relevant identity before concluding anything**:

```bash
bounded account use --web && bounded login --email you@example.com   # web/email session
bounded access --app-id <id>                                          # check as the web identity
bounded account use --global                                          # your CLI keypair
bounded access --app-id <id>                                          # check as the keypair
```

The grant is real if *any* of your identities shows it. Don't stop at the first
one that 403s.

### 2. `requires a keypair` on a web session = a CLI-version bug, not a wall

A **web-login session is platform-scoped**, and the CLI performs the deploy on
behalf of web-account members (as of the CLI fix). If an **older** CLI refuses a
web-account deploy with `requires a keypair`, that is a **version bug in the CLI**,
not a permissions wall. Fixes, in order:

```bash
bounded version                                          # confirm what build you're on
bounded update                                           # update to the current CLI
# If this old build has no `update` command, run the installer once:
curl -fsSL https://get.bounded.sh/install.sh | sh
# (developing the CLI locally? rebuild the bundle, then `bounded version` to confirm)
```

If updating isn't possible right now and the same person *also* has a wallet
key/keypair that holds the grant, `bounded account use --global` (or the profile
that owns it) and deploy from there. Either way: **don't declare it blocked.**

### 3. Collaborators are cross-account — a different owner does NOT mean no access

You can be an `admin`/`developer` on an app **owned by a completely different
account** — a different person, even a teammate's. **A different owning account
does not mean you lack access.** Never infer "not mine → can't touch it" from
`.bounded/app.json`'s `owner` field. Verify the real answer:

```bash
bounded access --app-id <id>     # your effective role on an app you don't own
```

If it shows a role with the capability you need, act. Ownership is about
key-recovery and the roster; **capability** is what gates the deploy.

### 4. Stale token / expired web session

A `401` under a web source often just means the session lapsed. Re-establish it,
then re-run the check:

```bash
bounded login --email you@example.com    # refresh ~/.bounded/web-session.json
bounded access --app-id <id>
```

### 5. "Blocked by this app's boundaries" — the 403 that is NOT an identity problem

If the deploy error says **`Blocked by this app's boundaries`** / `boundary_violation`,
STOP switching identities — a boundary lock (`binding: "all"`) refuses **every author,
including the owner**. No login on this machine or any other can deploy past it.
(CLI ≥ 0.0.59 says this in the error; older CLIs wrongly appended the "retry with your
other identity" hint here.)

What to do instead:

1. **Inspect the lock**: dashboard → Boundaries tab, or
   `GET /app/<id>/boundaries/ui` (owner/admin bearer). Look at `amend`:
   - **`amend: "creator"`** — the owner can amend the boundaries block itself. Update
     the site with the three-step dance: ① deploy a policy with the boundary loosened
     (e.g. posture `"open"`, `ui: []`) via `bounded deploy` → ② `bounded site deploy
     <dist>` → ③ re-apply the locked boundaries block with another `bounded deploy`.
   - **`amend: "none"`** — a one-way renouncement you may ENCOUNTER (the launch flow
     sets it for apps whose rules were deliberately renounced). Gate G2 refuses any
     change to the `boundaries`/`openApps` sections from anyone, owner included, and
     there is no unlock — treat it as operationally permanent. The recourse is a NEW
     app + repointing the slug/custom domain.
2. **Know the no-op nuance**: change detection is content-hash based, so a
   **byte-identical redeploy passes** even under a full lock (nothing changed → nothing
   violates). Don't read a passing identical redeploy as "the lock is off", and don't
   read the first failing real change as flaky.
3. **Authoring guidance — always write `amend: "creator"`, never `"none"`.** A
   creator-amendable lock still refuses every change from every author; the only
   difference is that the owner can deliberately amend it later. `amend: "none"` is a
   one-way renouncement with no undo — do NOT author it in a policy, an example, or a
   "lock it down" request (use `"creator"`). If a human genuinely wants an irrevocable
   renouncement, surface the permanence and let THEM make that call explicitly; it is
   a launch-ceremony decision, not a default. Boundaries are the app's declared fence,
   enforced fail-closed by the platform's deploy gates — their strength is how well
   the boundary is defined times how well the service enforces it, so keep the
   definition tight rather than reaching for irreversibility.

## If you genuinely lack access — obtain it (don't wait, ask correctly)

Only after the checks above come back empty under **every** identity is access
actually missing. Then an **owner** (or an admin holding `access:manage`) grants
it in one command:

```bash
bounded share <email-or-wallet> --role developer --app-id <id>   # any paid plan
bounded share <email-or-wallet> --role admin     --app-id <id>   # Team+ owner only
```

- Prefer **`--role developer`** for "help me build/deploy this" — it's exactly
  `app:view + code:read + policy:deploy + functions:deploy + ui:deploy`, and it's
  the only role a **Pro** owner can grant (admin/viewer/billing need Team+; a Pro
  owner gets a `402` on those). Full plan gating + capability matrix in
  [access-control.md](../../bounded-backend/docs/access-control.md).
- Share **by email** works even if the recipient has never signed up — the grant
  binds the instant they verify that email. So the ask to the owner is concrete:
  *"run `bounded share <my-email> --role developer --app-id <id>`."*

## The whole playbook in one flow

1. **Don't give up.** `requires a keypair` / `401` / `403` ≠ "you lack access."
2. `bounded whoami` — know who you are. `bounded access --app-id <id>` — know what
   you can do. Never curl a token to test access.
3. Have `ui:deploy` / `policy:deploy`? **Deploy.** No owner required.
4. Errored but should have it? **Switch identity** (`account use --web` /
   `--global`) and re-check under each; **update the CLI** if a web session hit
   `requires a keypair`.
5. Empty under every identity? Ask an owner for one `bounded share ... --role
   developer --app-id <id>`.

## Related

- Roles, capability matrix, plan gating, the `access` block →
  [access-control.md](../../bounded-backend/docs/access-control.md)
- Identity facets (email/wallet/keypair), account sources, web vs keypair mode →
  [key-and-account-safety.md](key-and-account-safety.md)
- Every `bounded` command + flag (`update`, `whoami`, `access`, `account use`,
  `share`, `site deploy`) → [cli-reference.md](cli-reference.md)
