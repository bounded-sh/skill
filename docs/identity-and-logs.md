# Reserved identity sets + function log access

Bounded maintains three **reserved, platform-managed identity sets** for every
app, resolved from the real identity graph and kept current automatically. A
policy can read them in any rule; they can't be written, edited, or defined away,
so access expressed against them never goes stale.

| Read in a rule | True when the caller is… |
| --- | --- |
| `get(/__managers__/@user.address) != null` | the owner, a collaborator, OR any wallet linked to those humans' accounts |
| `get(/__owners__/@user.address) != null` | the owner, or a wallet linked to the owner's account |
| `get(/__collaborators__/@user.address) != null` | a collaborator, or a wallet linked to a collaborator's account |

"Linked to the same account" means the human's other wallets/devices (Privy
wallet + linked CLI keypairs) — so a teammate signing in from a different device
still counts, with **no policy edit** when the team changes. These are resolved
by the platform into the app config and injected at rule-eval time (no datastore
read). Existence-checks (`get(...) != null`) are a **sound uninterpreted boolean**
in the prover, so rules gating on them stay provable — e.g. a `conserve` or
`bound` invariant on the same collection still proves cleanly.

## Use them in rules

```json
{
  "ops/$id": {
    "rules": {
      "read":   "get(/__managers__/@user.address) != null",
      "create": "get(/__managers__/@user.address) != null",
      "update": "false", "delete": "false"
    }
  }
}
```

Only app managers (owner + collaborators + their linked wallets) can read/create
`ops`. Non-managers get a `403` — verified. Want an alias? Define your own def:
`"defs": { "isManager": "get(/__managers__/@user.address) != null" }` and use
`@def.isManager`.

## Who can view a function's server logs — `logsAuth`

Bounded Functions capture `console.log/error/warn/...` and surface them to the
caller (CLI/dashboard) via an opt-in side channel. **Who may view them** is a
per-function policy rule, `logsAuth` — validated and compiled exactly like the
function's `auth` rule:

```json
{ "functions": {
  "runPayouts": {
    "auth": "true",                                          // who may INVOKE
    "entry": "functions/runPayouts.ts",
    "logsAuth": "get(/__managers__/@user.address) != null"  // who may VIEW logs
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
| Gate data on the app's dev team (owner + collaborators + their devices) | `get(/__managers__/@user.address) != null` |
| Gate on the owner specifically | `get(/__owners__/@user.address) != null` |
| Control who sees a function's logs | `logsAuth` (defaults to managers) |
| A backend identity the function acts AS (not a viewer) | a service key — [docs/service-keys.md](service-keys.md) |
