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

## Control roles (preset bundles of capabilities)

| Role | Can |
|---|---|
| `owner` | everything (one per app, transferable) |
| `admin` | manage the app + act on data — *not* delete/transfer/manage-the-roster |
| `developer` | deploy/update policy, functions, and the UI (renames the legacy `policy` role) |
| `viewer` | read-only management surfaces + proofs (the "external people" tier) |
| `billing` | view + manage billing |

Grant with the CLI:

```bash
bounded share alice@example.com --role admin --app-id <id>
bounded share <wallet>          --role developer --app-id <id>
bounded share newperson@x.com   --role viewer --app-id <id>   # works before they sign up
```

## Custom roles + capabilities (the flexible layer)

Roles are *bundles of capabilities*. The atomic capabilities (`surface:action`):
`app:view` · `app:settings` · `app:delete` · `app:transfer` · `access:manage` ·
`billing:manage` · `policy:deploy` · `functions:deploy` · `ui:deploy` · `ui:fork` ·
`cloud:prompt` · `cloud:apply` · `data:act`.

Author custom roles + grants in the **`access` block of `policy.json`** (agents edit this
directly; it deploys with the policy and `bounded verify` reports who-can-do-what):

```jsonc
{
  "access": {
    "roles": { "ui-contributor": ["ui:fork", "cloud:prompt"] },
    "grants": [
      { "subject": "alice@example.com", "role": "admin" },
      { "subject": "team:design",       "role": "ui-contributor" },
      // open UI prompting to anyone signed in, as PROPOSALS the owner promotes (a wiki):
      { "audience": "signed-in", "capabilities": ["cloud:prompt"], "workflow": "propose" }
    ],
    "external": { "widget": "viewer" }   // let non-owners see read-only proofs in the widget
  }
}
```

- **subject** = `email` | `wallet` | `team:<name>` | account id. **audience** = `signed-in`
  (any authenticated) | `public` (incl. anonymous).
- **workflow** = `direct` (applies now) or `propose` (creates a fork/variant the owner
  promotes — the wiki/PR flow; reuses the [variant system](frontend-hosting.md)).
- **external** opens the cloud widget to non-owners: an external signed-in person with
  `cloud:prompt` gets a "Suggest an edit" box; submissions go in as proposals.

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
- Sharing, linking, teams, login → [auth.md](auth.md)
- Tenant isolation invariants → [invariants.md](invariants.md#tenanttag--documents-carry-their-tenant)
