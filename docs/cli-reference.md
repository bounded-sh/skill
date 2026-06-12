# CLI Reference — every `bounded` command

The complete `bounded` command surface, grouped by purpose. Every flag below
exists in the CLI; `bounded <cmd> --help` prints the same with an Example block.

**Global flags** (any command): `--json` (structured output for agents —
errors are emitted as JSON too), `--quiet` (minimal output), `--env`
(`production` default, or `staging`; also `BOUNDED_ENV`).

## Identity & teams

No login step — your ed25519 keypair at `~/.bounded/key` (or
`BOUNDED_PRIVATE_KEY`) IS your account. See [auth.md](auth.md).

| Command | Does | Example |
|---|---|---|
| `whoami` | Show address, environment, key source (creates the key on first run) | `bounded whoami` |
| `link` | Bind the keypair to a human account for billing/teams (placeholder today) | `bounded link` |
| `share <wallet> --app-id <id>` | Add a collaborator who may update the policy (owner only) | `bounded share <wallet> --app-id <id>` |
| `unshare <wallet> --app-id <id>` | Remove a collaborator (owner only) | `bounded unshare <wallet> --app-id <id>` |
| `collaborators --app-id <id>` | List collaborators (alias: `shares`) | `bounded collaborators --app-id <id>` |

## Policy lifecycle

| Command | Does | Key flags |
|---|---|---|
| `init` | Write a starter `policy.json` (spend ledger + `spend_cap`) | `--force` overwrite |
| `verify <policy.json>` | Run the proof engine, print the report + counterexamples | `--app-id` (required), `--operation`, `--constants` |
| `deploy <policy.json>` | Validate, compile, and push the policy (same fail-closed gate) | `--app-id` or `--create --name`, `--protocol`, `--constants` |

```bash
bounded init                                            # scaffold policy.json
bounded deploy ./policy.json --create --name my-app     # create app + deploy (prints appId)
bounded verify ./policy.json --app-id <appId>           # re-prove after edits
bounded deploy ./policy.json --app-id <appId>           # redeploy
```

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
  --rule '@user.address != null && @newData.amount <= 100' \
  --property '@newData.amount <= 100'
```

### `--constants`

Policies may reference `@constants.NAME`; supply values at deploy/verify with
`--constants NAME=value` (repeatable or comma-separated). Digit-only values
≤15 chars inline as numbers; everything else is wrapped as a string literal.

```bash
bounded deploy ./policy.json --app-id <id> --constants CAP=5000,ADMIN=8xY...
```

## Data plane

All `data` subcommands take `--app-id <id>` (required) and optional
`--chain realtime` (default; `mainnet` arrives later). Writes go through the
realtime worker, which enforces the deployed policy atomically. Full semantics:
[data-plane.md](data-plane.md); reads: [queries.md](queries.md).

| Command | Does | Example |
|---|---|---|
| `data set` | Write one document | `bounded data set --app-id <id> --path spend/a --data '{"amount":60}'` |
| `data set-many` | Atomic all-or-nothing batch | `bounded data set-many --app-id <id> --from-json bundle.json` |
| `data get` | Read a doc, or list/filter a collection | `bounded data get --app-id <id> --path spend --limit 20` |
| `data get-many` | Batch-read paths from a JSON array | `echo '["spend/a","spend/b"]' \| bounded data get-many --app-id <id> --from-json /dev/stdin` |
| `data query` | Run a named policy query | `bounded data query --app-id <id> --name myQuery --args '{"k":"v"}'` |
| `data aggregate` | Grouped count/sum/avg/min/max | `bounded data aggregate --app-id <id> --path spend --group category --sum amount` |
| `data search` | Full-text search a collection | `bounded data search --app-id <id> --path notes --query "shipping"` |

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
bounded data get --app-id <id> --path spend \
  --filter '{"amount":{"$gt":10}}' --sort amount:desc --limit 20
```

### `data aggregate` flags

`--group` (repeatable) + at least one of `--count`, `--sum F`, `--avg F`,
`--min F`, `--max F`; optional `--filter` narrows before aggregating.

### `data search` flags

`--query` (required) and optional `--fields a,b` (default: all fields),
`--limit`, `--cursor`.

### `--skip-preflight`

On `set` / `set-many`, an **onchain-only** flag: skip RPC preflight simulation
so failing txs still land on-chain. No effect on the realtime data plane.

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
dispatcher gates the call on the `auth` rule, then prints the function's JSON (or
the dispatcher error — `403` if the rule denies you). Full guide:
[functions.md](functions.md).

## Related

- [data-plane.md](data-plane.md) — write semantics, atomic batches, failure codes
- [queries.md](queries.md) — filters, sort, paging, aggregations, search in depth
- [sdk-reference.md](sdk-reference.md) — the same operations from TypeScript
- [auth.md](auth.md) — the keypair identity the CLI acts as
- [verify-and-counterexamples.md](verify-and-counterexamples.md) — reading `verify` output
