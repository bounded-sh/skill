# Reserved identity sets + function log access

Bounded maintains **reserved, platform-managed identity sets** for every app,
resolved from the real identity graph and kept current automatically. A policy can
read them in any rule; they are **read-only projections** — they can't be written,
edited, or defined away (the `__`-prefixed paths are write-blocked), so access
expressed against them never goes stale and nobody can self-promote into one.

| Read in a rule | True when the caller is… |
| --- | --- |
| `get(/__managers__/@user.id) != null` | the owner, a collaborator, OR any identity linked to those humans' accounts |
| `get(/__owners__/@user.id) != null` | the owner, or an identity linked to the owner's account |
| `get(/__collaborators__/@user.id) != null` | a collaborator, or an identity linked to a collaborator's account |
| `get(/__admins__/@user.id) != null` | a collaborator granted the `admin` control role |
| `get(/__developers__/@user.id) != null` | a collaborator granted the `developer` role (deploy policy/functions/UI) |
| `get(/__viewers__/@user.id) != null` | a collaborator granted the read-only `viewer` role |
| `get(/__billing__/@user.id) != null` | a collaborator granted the `billing` role |

The four **role sets** (`__admins__`/`__developers__`/`__viewers__`/`__billing__`)
are the *control-plane → data-plane bridge*: they project the control roster (set via
`bounded share --role` or the policy `access` block) so a rule can opt into giving a
control role data powers — **without any hidden owner/admin bypass**. See
[access-control.md](access-control.md) for the `access` block, custom roles, and the
platform super-admin pattern.

These sets are keyed by `@user.id` — the **universal, stable identity** that is
always present for an authenticated caller (it equals the wallet address for
wallet logins and the account identity for email/social logins). Use `@user.id`
for membership/ownership gates so they work for every login type, not just wallet
logins. (Reserve `@user.address` for genuinely onchain/wallet operations, where
it is the only allowed identity variable; it is `null` for email-only logins.)

"Linked to the same account" means the human's other wallets/devices (their
embedded wallet + linked CLI keypairs) — so a teammate signing in from a
different device still counts, with **no policy edit** when the team changes.
Rules can check these reserved paths with `get(...) != null`, and the prover
treats those checks soundly — e.g. a `conserve` or `bound` invariant on the same
collection still proves cleanly.

## Use them in rules

```json
{
  "ops/$id": {
    "rules": {
      "read":   "@user.id != null && get(/__managers__/@user.id) != null",
      "create": "@user.id != null && get(/__managers__/@user.id) != null",
      "update": "false", "delete": "false"
    }
  }
}
```

Only app managers (owner + collaborators + their linked identities) can read/create
`ops`. Non-managers get a `403` — verified. The leading `@user.id != null &&` is
what makes `bounded verify` *prove* the rule requires a signed-in user (a membership
`get(...)` alone already returns null for an anonymous caller, but stating the auth
check explicitly keeps the proof clean — same idiom as
[admin-and-ownership.md](admin-and-ownership.md)). Want an alias? Define your own def:
`"defs": { "isManager": "@user.id != null && get(/__managers__/@user.id) != null" }` and use
`@def.isManager`.

## Who can view a function's server logs — `logsAuth`

Bounded Functions capture `console.log/error/warn/...` and surface them to the
caller (CLI/dashboard) via an opt-in side channel. **Who may view them** is a
per-function policy rule, `logsAuth` — validated and compiled exactly like the
function's `auth` rule:

```json
{ "functions": {
  "runPayouts": {
    "auth": "true",                                     // who may INVOKE
    "entry": "functions/runPayouts.ts",
    "logsAuth": "@user.id != null && get(/__managers__/@user.id) != null"   // who may VIEW logs
  }
} }
```

- **Default** (omit `logsAuth`): app managers. So owner + collaborators + their
  linked accounts see logs out of the box; nobody else does — even an end-user
  who can invoke the function gets the result but no logs.
- Widen or narrow it per function with any rule (e.g. let an invoker see their
  own run, or restrict to a specific admin).
- The captured console output is also redacted of declared secret values, capped
  in size, and only returned when the owner tooling opts in.

## When to use which

| You want… | Use |
| --- | --- |
| Gate data on the app's dev team (owner + collaborators + their devices) | `get(/__managers__/@user.id) != null` |
| Gate on the owner specifically | `get(/__owners__/@user.id) != null` |
| Control who sees a function's logs | `logsAuth` (defaults to managers) |
| A backend identity the function acts AS (not a viewer) | a service key — [docs/service-keys.md](service-keys.md) |
