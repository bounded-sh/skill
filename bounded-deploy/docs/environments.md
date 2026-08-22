# Environments — one policy file, many deploys

## Project instances and policy environments are different

Use `bounded.json` `instances` to name app deployments.
Each instance owns one `appId`, `controlPlane`, `policyTarget`, and `buildTarget` tuple.
Use the policy's `environments` block for constant overlays, schedule cadence, and function inclusion.

For example, two separate Poofnet apps can both use `controlPlane: "production"`, `policyTarget: "poofnet"`, and `buildTarget: "poofnet"` while retaining different app IDs.
Select either with `bounded --instance <name> ...`.
The CLI refuses a conflicting `--env` because it would split the selected tuple.
It also refuses a conflicting `--environment` because policy deployment must use the instance's declared policy target.

**What's in here:** the `environments` block — a **client-side** (CLI-only)
construct that lets one `policy.json` drive several apps (preview, production, …),
each with its own `appId`, its own constant values, its own schedule cadence, and
its own subset of the policy's functions. The CLI resolves it and
deploys a normal policy. Builds on
[constants-and-defs.md](../../bounded-backend/docs/constants-and-defs.md).

## Shape

```json
{
  "environments": {
    "preview":    { "appId": "6a2e...pre", "constants": { "ADMIN": "PreAdminWallet", "DAILY_CAP": 50 }, "schedules": { "*": { "every": "15m" } } },
    "production": { "appId": "6a2e...prd", "constants": { "ADMIN": "PrdAdminWallet", "DAILY_CAP": 5000 } }
  },
  "constants": { "ADMIN": "LocalDevWallet", "DAILY_CAP": 50 },
  "roles": { "admin": { "members": ["@const.ADMIN"], "read": "*" } },
  "spend/$id": {
    "rules": { "read": "@user.id != null", "create": "@user.id != null", "update": "false", "delete": "false" },
    "fields": { "amount": "UInt" }, "tier": "durable",
    "invariants": [ { "type": "rollingSum", "name": "cap", "field": "amount", "windowSeconds": 86400, "limit": "@const.DAILY_CAP" } ]
  }
}
```

Each environment entry has:
- `appId` — **required.** The bounded app this environment targets. An entry with
  a missing or empty `appId` is refused before anything is overlaid, so a
  mistyped entry can never deploy env constants to a fallback app.
- `constants` — values overlaid onto the top-level `constants` block (env wins;
  unspecified keys keep the top-level default).
- `schedules` — optional per-environment `schedule.every` overrides, see
  [§ Per-environment schedule cadence](#per-environment-schedule-cadence).

A function can also scope *itself* to a set of environments from the other side,
with its own `environments` allowlist — see
[§ Environment-scoped functions](#environment-scoped-functions).

The top-level `constants` block is the **local-dev default** - the values used
when you deploy to an app that the `environments` block does not name. Do **not**
fill it with a copy of any deployed environment's real identity constants
(`ADMIN`, a fee wallet, a steward): if it holds staging's admin and you deploy to
production, that staging wallet becomes the production admin. In the example
above `ADMIN` is a throwaway `LocalDevWallet`, distinct from both preview and
production, precisely so a bare deploy cannot silently ship one environment's
identity to another.

You do not have to rely on the base block for a named deploy: `bounded deploy`
**derives the environment from the target app id** when you omit `--environment`.
If `--app-id` (or the linked `bounded.json` app) matches exactly one
environment's `appId`, the CLI resolves that environment's constants and prints
which one it picked; only a target that matches no environment falls through to
the base block. So the base block is for local/unnamed targets, never a stand-in
for a production environment's identity.

## Usage

```bash
bounded deploy ./policy.json --environment preview      # → preview appId, preview constants
bounded deploy ./policy.json --environment production   # → production appId, production constants
bounded verify ./policy.json --environment production   # prove the prod-resolved policy
```

What the CLI does for `--environment <name>`:
1. **Overlays** `environments.<name>.constants` onto the policy's `constants`
   block (env values win).
2. **Rewrites** each scheduled collection's `schedule.every` from
   `environments.<name>.schedules`, when that entry declares one.
3. **Drops** every function whose own `environments` allowlist excludes
   `<name>`, and removes that `environments` key from the functions it keeps.
4. **Targets** `environments.<name>.appId` (an explicit `--app-id` still wins).
5. **Strips** the `environments` block, then ships a NORMAL policy — server-side
   `@const`/`@def` resolution ([constants-and-defs.md](../../bounded-backend/docs/constants-and-defs.md))
   inlines the now env-specific values.

`bounded deploy`, `bounded verify`, and `bounded functions deploy --all` run the
same resolution, so what you prove is what you ship.

So one file gives preview and production **different admin members and different
caps** with no flags and no copy-paste. Per-env `appId`s keep the two apps
cleanly separated.

Server-side resolution inlines an exact `@const.NAME` in any authored data position except within a reserved `constants` or `defs` block, not just rules; a function's `actAs` is included.
So an environment can also select a different **service identity** per
environment: declare `"actAs": "@const.STEWARD"` on the function and override
`STEWARD` in the staging entry only, leaving the production-resolved policy
unchanged.
See [constants-and-defs.md §Per-environment service identity](../../bounded-backend/docs/constants-and-defs.md#per-environment-service-identity-actas).

## Staging + production, end to end

Create two apps before adding the `environments` block. Record each printed
`appId`. The second command creates the production app:

```bash
bounded deploy ./policy.json --create --name my-app-staging
bounded deploy ./policy.json --create --name my-app-production
```

Wire both ids into `policy.json`:

```json
{
  "environments": {
    "staging": {
      "appId": "<staging-app-id>",
      "constants": { "ADMIN": "StagingAdmin", "DAILY_CAP": 50 }
    },
    "production": {
      "appId": "<production-app-id>",
      "constants": { "ADMIN": "ProductionAdmin", "DAILY_CAP": 5000 }
    }
  },
  "constants": { "ADMIN": "StagingAdmin", "DAILY_CAP": 50 }
}
```

Resolve, prove, and deploy the policy once per environment:

```bash
bounded verify ./policy.json --environment staging
bounded deploy ./policy.json --environment staging

bounded verify ./policy.json --environment production
bounded deploy ./policy.json --environment production
```

Build the static frontend, then deploy the same build to each app explicitly:

```bash
npm run build
bounded site deploy ./dist --app-id <staging-app-id>
bounded site deploy ./dist --app-id <production-app-id>
```

Deploy the policy-declared function set once per environment so the same environment-specific constants resolve inside `actAs`:

```bash
bounded functions deploy --all --policy ./policy.json --environment staging
bounded functions deploy --all --policy ./policy.json --environment production
```

`policy.json` `--environment` and an instance's `controlPlane` are different axes.
`--environment staging` selects an entry from the policy.
The instance's `controlPlane`, or legacy `bounded.json` `environment`, selects the Bounded platform control plane.

## Per-environment schedule cadence

A production sweep that runs `every: "1m"` rarely wants that cadence on a test
venue, and a generated second policy file is a bad way to say so. An
environment's `schedules` block retunes the cadence in place:

```json
{
  "environments": {
    "staging": {
      "appId": "<staging-app-id>",
      "schedules": { "*": { "every": "15m" }, "sweeps/$id": { "every": "5m" } }
    }
  },
  "sweeps/$id": {
    "rules": { "read": "@user.id != null", "create": "false", "update": "false", "delete": "false" },
    "schedule": { "every": "1m", "run": "tick" }
  },
  "quotas/$quotaId": {
    "rules": { "read": "@user.id != null", "create": "false", "update": "false", "delete": "false" },
    "schedule": { "every": "1d", "run": "resetQuota" }
  }
}
```

Keys are collection keys, or the literal `"*"`:

- `"*"` applies to **every** scheduled collection in the policy.
- An **exact collection key wins** over `"*"`, so on staging the block above
  leaves `sweeps/$id` at `5m` and moves `quotas/$quotaId` — every *other*
  scheduled collection — to `15m`.
- `every` is the **only** field that can vary per environment. `run`, and any
  other schedule field, is refused — an environment retunes a schedule, it never
  repoints one.

The base policy's own `schedule.every` values stay untouched and remain what a
bare deploy (and, by convention, production) ships.

This is fail-closed on every axis, because a silently-ignored override would
leave the base cadence running in an environment the author believed they had
retuned:

- a key matching **no** scheduled collection is an error, not a no-op — that is
  what catches a typo'd collection key;
- `"*"` in a policy with **no** scheduled collections at all is an error;
- a missing or empty `every` is an error.

## Environment-scoped functions

The other direction: a function declares which environments it belongs to, with
its own `environments` allowlist.

```json
"functions": {
  "settleInvoices": { "entry": "functions/settleInvoices.ts", "auth": "@user.id != null" },
  "probeCreate": {
    "entry": "functions/probeCreate.ts",
    "auth": "@user.id != null && get(/admins/@user.id) != null",
    "environments": ["staging", "preview"]
  }
}
```

`probeCreate` ships to `staging` and `preview` and to nothing else. Every other
environment drops the function from the policy entirely, and the `environments`
key itself is stripped from the functions that are kept, so a NORMAL policy
reaches the API in every case.

The guarantee this buys is that a test-venue function cannot reach a real app,
so each way of losing it refuses instead:

- a name in the allowlist that is **not** a key of the top-level `environments`
  block refuses, so a typo fails the deploy rather than quietly excluding the
  function from every environment;
- a `schedule.run` naming a function that this environment stripped refuses,
  naming both the collection and the function, rather than shipping a dangling
  reference for the server to reject;
- a **new** environment excludes the function until it is added to the list —
  the allowlist is the whole grant, there is no inherited default;
- and `deploy`, `verify`, or `functions deploy --all` run **without**
  `--environment` refuses outright as soon as any function carries an
  `environments` key, naming the scoped functions. An env-blind deploy has no
  environment to filter against, so rather than guess it makes you pick.

That last rule is the one to remember when a previously-fine bare
`bounded deploy ./policy.json` starts refusing: adding the first
`environments` allowlist anywhere in the policy makes `--environment`
mandatory for the whole file.

## Notes

- `--environment` selects an *entry in your policy* (a per-env `appId`,
  constants, schedule cadence, and function set). Deploys target the normal
  Bounded API by default; you don't need any other flag to pick an endpoint.
- The `environments` block is a CLI authoring convenience and never reaches the
  API. Deploying without `--environment` strips it too — but see
  [§ Environment-scoped functions](#environment-scoped-functions): a policy that
  scopes any function refuses an env-blind deploy rather than stripping its way
  past the question.
- Combine with `--constants NAME=value` for one-off CI overrides on top of the
  selected environment.

## Related
- [constants-and-defs.md](../../bounded-backend/docs/constants-and-defs.md) — `@const`/`@def` resolution (the server-side half)
- [roles.md](../../bounded-backend/docs/roles.md) — per-env admin via `@const.ADMIN`
- [hooks-scheduled-webhooks.md](../../bounded-backend/docs/hooks-scheduled-webhooks.md) — the `schedule` block a `schedules` override retunes
- [functions.md](../../bounded-backend/docs/functions.md) — the function spec an `environments` allowlist rides on
- [cli-reference.md](cli-reference.md) — every flag on `deploy`/`verify`
