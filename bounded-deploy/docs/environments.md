# Environments — one policy file, many deploys

**What's in here:** the `environments` block — a **client-side** (CLI-only)
construct that lets one `policy.json` drive several apps (preview, production, …),
each with its own `appId` and its own constant values. The CLI resolves it and
deploys a normal policy. Builds on
[constants-and-defs.md](constants-and-defs.md).

## Shape

```json
{
  "environments": {
    "preview":    { "appId": "6a2e...pre", "constants": { "ADMIN": "PreAdminWallet", "DAILY_CAP": 50 } },
    "production": { "appId": "6a2e...prd", "constants": { "ADMIN": "PrdAdminWallet", "DAILY_CAP": 5000 } }
  },
  "constants": { "ADMIN": "PreAdminWallet", "DAILY_CAP": 50 },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "spend/$id": {
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "fields": { "amount": "UInt" }, "tier": "durable",
    "invariants": [ { "type": "rollingSum", "name": "cap", "field": "amount", "windowSeconds": 86400, "limit": "@const.DAILY_CAP" } ]
  }
}
```

Each environment entry has:
- `appId` — the bounded app this environment targets.
- `constants` — values overlaid onto the top-level `constants` block (env wins;
  unspecified keys keep the top-level default).

The top-level `constants` block is the **default** (handy for a bare
`bounded deploy` with no `--environment`).

## Usage

```bash
bounded deploy ./policy.json --environment preview      # → preview appId, preview constants
bounded deploy ./policy.json --environment production   # → production appId, production constants
bounded verify ./policy.json --environment production   # prove the prod-resolved policy
```

What the CLI does for `--environment <name>`:
1. **Overlays** `environments.<name>.constants` onto the policy's `constants`
   block (env values win).
2. **Targets** `environments.<name>.appId` (an explicit `--app-id` still wins).
3. **Strips** the `environments` block, then ships a NORMAL policy — server-side
   `@const`/`@def` resolution ([constants-and-defs.md](constants-and-defs.md))
   inlines the now env-specific values.

So one file gives preview and production **different admin members and different
caps** with no flags and no copy-paste. Per-env `appId`s keep the two apps
cleanly separated.

## Notes

- `--environment` selects an *entry in your policy* (a per-env `appId` +
  constants). Deploys target the normal Bounded API by default; you don't need
  any other flag to pick an endpoint.
- The `environments` block is a CLI
  authoring convenience. Deploying without `--environment` strips it too.
- Combine with `--constants NAME=value` for one-off CI overrides on top of the
  selected environment.

## Related
- [constants-and-defs.md](constants-and-defs.md) — `@const`/`@def` resolution (the server-side half)
- [roles.md](roles.md) — per-env admin via `@const.ADMIN`
- [cli-reference.md](cli-reference.md) — every flag on `deploy`/`verify`
