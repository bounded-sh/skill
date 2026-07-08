# Access control — the `access` block, roles, and platform super-admins

**What's in here / when to read this:** how to control *who can administer an app*
(deploy, manage privacy/billing, share, run cloud edits, fork the UI) — and how to build
a **platform** on Bounded with **super-admins**. This is the CONTROL plane. For the DATA
plane (who can read/write app data) see [admin-and-ownership.md](admin-and-ownership.md)
and [roles.md](roles.md). The two compose; the bridge below connects them.

> **B2C default — you usually need none of this.** A normal app: the creator is the
> `owner` and can do everything; everyone else has nothing until granted. No `access`
> block required. Only reach for this when you want collaborators, external contributors,
> or a multi-tenant platform with super-admins.

## The one model

Two planes, one identity, one source of truth:

- **Identity = the account.** Tracked by the canonical account **id** (`@user.id`).
  **Email and wallet are facets** you author/share with — they resolve to the id. So you
  can invite, log in, and share **by email** and it just works (see "Share by email").
- **Control plane** (this doc): the `access` block in `policy.json` + `bounded share`.
- **Data plane**: `policy.json` rules + invariants. **No owner god-mode** — the owner is
  governed too. The control roster is exposed to policy as *opt-in* primitives (the bridge).

## ⚠️ Read this first: control roles vs an `admins/$userId` collection

The single most common confusion (for humans AND agents): **the `access` block does NOT
replace a data-plane `admins` collection.** They answer different questions — pick by
*who* the "admin" is.

| If the "admin" is… | …it's the | Use |
|---|---|---|
| someone who **operates the app** (deploys, billing, settings) — your **team** | **control plane** | `bounded share --role` or the `access` block (this doc) |
| one of your **app's end-users** with elevated **in-app** powers (forum moderator, game admin) — **changes at runtime** | **data plane** | a normal `admins/$userId` collection + rules gating on `get(/admins/@user.id)` — see [admin-and-ownership.md](admin-and-ownership.md) |

Rule of thumb: *"helps run the app" → control plane (access block). "is a special kind of
my app's user" → data plane (a collection you write at runtime).*

The two look identical but are NOT the same — mind the underscores:

- `get(/__admins__/@user.id)` — **double underscore, RESERVED.** The control-plane admin
  set (your collaborators with the admin role), exposed **read-only**. You can't write it.
- `get(/admins/@user.id)` — **your own collection.** A data-plane collection you define
  and `set(...)` at runtime (moderators, etc.). Governed by your rules + the founder-genesis
  pattern.

They only meet at the optional **bridge**: a rule *may* read `get(/__admins__/@user.id)` if
you want your operators to also have data powers. Otherwise the two never touch. **A B2C app
with end-user roles (moderators, etc.) uses an `admins`/`roles` collection and may need no
`access` block at all.**

## Control roles (preset bundles of capabilities)

| Role | Can |
|---|---|
| `owner` | everything (one per app, transferable) |
| `admin` | manage the app + act on data — *not* delete/transfer/manage-the-roster |
| `developer` | **read the source** + deploy/update policy, functions, and the UI — this IS the **bounded-agent** role (renames the legacy `policy` role) |
| `viewer` | read-only management surfaces + proofs (the "external people" tier) |
| `billing` | view + manage billing |

> **⚠️ Plan gating — check the OWNER's plan before suggesting a role.** Collaboration is
> a paid feature, billed to the **app owner's** plan:
>
> | Owner's plan | Seats | Roles you can grant |
> |---|---|---|
> | Free | 0 — solo | none |
> | Pro | 3 | **`developer` only** (full build access: verify, deploy policy/functions/UI) |
> | Team | 25 | all of them — `developer`, `admin`, `viewer`, `billing` |
> | Enterprise | unlimited | all |
>
> On Pro, `--role admin`/`viewer`/`billing` is rejected with a `402` telling you to re-run
> with `--role developer` or upgrade to Team. **Default to `--role developer`** unless you
> know the owner is Team+ — for "help me build/deploy this app" it's the right role anyway.

Grant with the CLI:

```bash
bounded share <wallet>          --role developer --app-id <id>   # any paid plan
bounded share newperson@x.com   --role developer --app-id <id>   # works before they sign up
bounded share alice@example.com --role admin --app-id <id>       # Team+ owners only
```

### What each preset actually contains (the capability matrix)

The prose above is a summary — this is the ground truth. `admin` is **owner minus the
three keys-to-the-kingdom** (`app:delete`, `app:transfer`, `access:manage`), so **`admin`
is a strict superset of `developer`** (and of `viewer`/`billing`). It already includes
`code:read` + `policy:deploy` + `functions:deploy` + `ui:deploy`.

| Capability | owner | admin | developer | viewer | billing |
|---|:--:|:--:|:--:|:--:|:--:|
| `app:view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `code:read` (read source) | ✓ | ✓ | ✓ | — | — |
| `policy:deploy` | ✓ | ✓ | ✓ | — | — |
| `functions:deploy` | ✓ | ✓ | ✓ | — | — |
| `ui:deploy` | ✓ | ✓ | ✓ | — | — |
| `ui:fork` | ✓ | ✓ | — | — | — |
| `cloud:prompt` / `cloud:apply` | ✓ | ✓ | — | — | — |
| `data:act` | ✓ | ✓ | — | — | — |
| `app:settings` | ✓ | ✓ | — | — | — |
| `billing:manage` | ✓ | ✓ | — | — | ✓ |
| `access:manage` (roster) | ✓ | — | — | — | — |
| `app:delete` | ✓ | — | — | — | — |
| `app:transfer` | ✓ | — | — | — | — |

**⇒ To let someone edit AND redeploy an app AND manage its data/settings — but not delete
it, transfer ownership, or add collaborators — grant `admin` alone.** You do **not** also
need `developer`; `admin` already covers deploy. Reach for `developer` when you want *only*
build/deploy powers (e.g. an AI agent) with no settings/billing/data access.

### `bounded share` sets ONE role per collaborator (last-write-wins)

The CLI stores a **single** role per subject — re-sharing with a new role **replaces** the
old one, it does not stack. (The `access`-block `grants` array below is the only place
capabilities compose — via *custom roles*, not by listing a person twice.) Since the presets
nest (`viewer`/`billing`/`developer` ⊂ `admin` ⊂ `owner`), pick the **one** preset that
covers everything the person needs; if no single preset fits, define a custom role.

Verify the effective result any time with:

```bash
bounded access --app-id <id> --json   # per-member capability arrays — the source of truth
```

## Custom roles + capabilities (the flexible layer)

Roles are *bundles of capabilities*. The atomic capabilities (`surface:action`):
`app:view` · `app:settings` · `app:delete` · `app:transfer` · `access:manage` ·
`billing:manage` · `policy:deploy` · `functions:deploy` · `ui:deploy` · `ui:fork` ·
`code:read` · `cloud:prompt` · `cloud:apply` · `data:act`.

Author custom roles + grants in the **`access` block of `policy.json`** (agents edit this
directly; it deploys with the policy and `bounded verify` reports who-can-do-what):

```jsonc
{
  "access": {
    "roles": { "ui-contributor": ["ui:fork", "cloud:prompt"] },
    // grants are always to a SPECIFIC, named subject (so the roster is a real list):
    "grants": [
      { "subject": "alice@example.com", "role": "admin" },
      { "subject": "team:design",       "role": "ui-contributor" }
    ],
    // `external` opens the app to NON-collaborators (a whole class, not named people):
    "external": {
      "widget":  "viewer",      // non-owners see this role's read-only surfaces in the widget
      "propose": "signed-in"    // anyone signed-in may SUGGEST cloud edits (proposals you approve)
    }
  }
}
```

- **grants → `subject`** = `email` | `wallet` | `team:<name>` | account id — always a
  **specific** person/team. (There is **no** `audience` in grants — "open to a whole class"
  lives in `external`, below. Grants are the enumerable roster.)
- **`role`** pulls in a preset or a custom role; or skip it and list raw `capabilities`.
- **workflow** = `direct` (applies now) or `propose` (creates a fork/variant you promote —
  the wiki/PR flow; reuses the [variant system](../../bounded-frontend/docs/frontend-hosting.md)).
- **`external.widget`** = the read-only role non-owners see in the widget (e.g. `viewer`).
- **`external.propose`** = `signed-in` | `public` — who may **suggest** cloud edits as
  proposals (the open-contribution / wiki flow). It only ever grants `cloud:prompt` as a
  *proposal*, never a direct change. This is the ONLY "whole class" knob — and it belongs to
  `external` because it's about opening the app to outsiders. **NOTE:** "any signed-in user
  can create a post" is **not** this — that's a plain **data rule** (`"create": "@user.id != null"`).

### The `developer` role IS the "bounded-agent" role

To let an **AI agent** build an app end-to-end — read the source, then deploy policy,
functions, and UI — share its key (or grant) as **`developer`**. That preset is exactly
`app:view + code:read + policy:deploy + functions:deploy + ui:deploy` — everything an agent
needs and nothing it doesn't (no delete/transfer/billing/roster):

```bash
bounded share <agent-wallet-or-email> --role developer --app-id <id>
```

`code:read` is the capability to **retrieve the project's source** (clone/read the managed
repo, the base for a cloud edit). Want a tighter or differently-named agent role? Define a
custom one — e.g. a read-only reviewer:

```jsonc
"access": { "roles": { "reviewer": ["app:view", "code:read"] } }   // sees + reads source, deploys nothing
```

## Share by email — registered OR brand-new (important)

A grant authored by email is **stored as the email** and matched against the recipient's
**verified** email facet. So:

- **Already-registered email** → matches immediately, however they log in.
- **Brand-new, never-bound email** → the grant waits in the manifest and **binds the
  instant that person verifies the email at signup**. No pending list, no migration.

Only OTP/social-verified emails ever match, so only a proven holder of the address gets in.

## The bridge — control roster → data plane (no backdoor)

Being an owner/admin does **not** bypass data rules. Instead the runtime injects read-only
role sets your policy can **opt into**:

```jsonc
"posts/$id": {
  "rules": {
    // an admin (control plane) may moderate — only because the policy SAYS so:
    "update": "@user.id == @data.author || get(/__admins__/@user.id) != null"
  }
}
```

Available sets: `/__owners__`, `/__admins__`, `/__developers__`, `/__viewers__`,
`/__billing__`, `/__collaborators__`, and `/__managers__` (owner + every collaborator) —
all keyed on `@user.id` and matched across the account's wallet/email facets. They are
**read-only projections** of the control roster: a data-plane write can never create or
modify an entry (the `__`-prefixed paths are write-blocked), so nobody can self-promote.
This keeps the no-god-mode + provability guarantees: the control plane *seeds* the data
plane, policy still governs everyone.

## Platform use-case — super-admins (multi-tenant apps on Bounded)

Building a **platform** (a multi-tenant SaaS, marketplace, or tool where *your* users each
own sub-resources, and *you* need super-admins across all of them)? Two layers, and they
stack cleanly:

**1. Platform super-admins (control plane).** The people who run the platform are the app
`owner` + `admin` grants in the `access` block. They deploy policy, manage billing, and —
via the bridge — can be given cross-tenant data powers your policy declares. Make one
easily:

```bash
bounded share ops@yourco.com --role admin --app-id <platformAppId>
```

**2. In-app super-admins (data plane), provably closed.** When *your platform's own users*
include super-admins (e.g. moderators who can act across every tenant), declare them as a
flat, provable admin registry and gate rules on it:

```jsonc
{
  "constants": { "FOUNDER": "<your-account-id>" },
  "admins/$userId": {
    "fields": { "active": "Bool" },
    "tier": "durable",
    "rules": {
      "read":   "@user.id != null",
      // only existing admins add admins; the founder bootstraps (genesis clause).
      // Gate on THIS collection (/admins) — the same scope the authorityClosure
      // proof is taken over — NOT the control-plane bridge (/__admins__). Every
      // write action needs `@user.id != null` so an anonymous caller can't slip in.
      "create": "@user.id != null && (get(/admins/@user.id) != null || @user.id == @const.FOUNDER)",
      "update": "@user.id != null && get(/admins/@user.id) != null",
      "delete": "@user.id != null && get(/admins/@user.id) != null"
    }
  },
  "tenants/$tenantId": {
    "fields": { "owner": "String!", "name": "String" },
    "tier": "durable",
    "rules": {
      "read":   "true",
      "create": "@user.id != null && @newData.owner == @user.id",
      // the holder may transfer; an admin may moderate but NOT seize ownership
      // (@newData.owner == @data.owner) — this is what proves transfer authority.
      "update": "@user.id != null && (@user.id == @data.owner || (get(/admins/@user.id) != null && @newData.owner == @data.owner))",
      "delete": "@user.id != null && (@user.id == @data.owner || get(/admins/@user.id) != null)"
    }
  },
  "tenants/$tenantId/items/$itemId": {
    "fields": { "body": "String" },
    "tier": "durable",
    "rules": {
      "read":   "true",
      "create": "@user.id != null && @user.id == get(/tenants/$tenantId).owner",
      "update": "@user.id != null && (@user.id == get(/tenants/$tenantId).owner || get(/admins/@user.id) != null)",
      "delete": "@user.id != null && get(/admins/@user.id) != null"
    }
  },
  "proofs": {
    "attestations": [{
      "claim": "the admin set only grows through existing admins, seeded by the founder",
      "kind": "authorityClosure", "roleScope": "admins/$userId", "initialMember": "@const.FOUNDER"
    }]
  }
}
```

*(Verifies clean against the real proof engine: `✓ Proven — Safe to deploy`. The
`authorityClosure` BASE+INDUCTION+side-door sweep passes and tenant ownership is proven
transfer-safe; the only advisories are the intentional public `read` rules.)*

The `authorityClosure` proof makes super-admin a **provable, closed set** — no
self-promotion, no side doors — which is the platform-grade guarantee you can't get from a
"service-role key." Tenant owners manage their own tenant; platform super-admins manage all;
every write is still checked. See [admin-and-ownership.md](admin-and-ownership.md) for the
bootstrap and proof details, and [invariants.md](invariants.md) for `tenantTag` isolation
so one tenant can never touch another's data.

## Related

- Data-plane admin/owner patterns + `authorityClosure` → [admin-and-ownership.md](admin-and-ownership.md)
- Top-level provable `roles` block (cross-collection read/write grants) → [roles.md](roles.md)
- Sharing, linking, teams, login → [auth.md](../../bounded-frontend/docs/auth.md)
- Tenant isolation invariants → [invariants.md](invariants.md#tenanttag--documents-carry-their-tenant)
