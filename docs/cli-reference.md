# CLI Reference — every `bounded` command

**What's in here / when to read this:** every `bounded` command + flag, grouped
by purpose. Every flag below exists in the CLI; `bounded <cmd> --help` prints the
same with an Example block.

**Global flags** (any command): `--json` (structured output for agents —
errors are emitted as JSON too), `--quiet` (minimal output), `--env`
(`production` default, or `staging`; also `BOUNDED_ENV`).

## Identity & teams

No login step — your ed25519 keypair IS your account. It lives in
`~/.bounded/credentials` (a JSON file with a base58 `privateKey` field, created on
first run), or is supplied via the `BOUNDED_PRIVATE_KEY` env var (a **base58**
secret string, which overrides the file). See [auth.md](auth.md).

> **Running a second identity:** point `HOME` at a temp dir
> (`HOME=$(mktemp -d) bounded whoami`) — the CLI auto-creates a fresh
> `~/.bounded/credentials` there, giving you a clean separate account. (Or set
> `BOUNDED_PRIVATE_KEY` to another base58 key.) This is how you run a distinct
> agent identity without touching your main credentials.

| Command | Does | Example |
|---|---|---|
| `whoami` | Show address, environment, key source (creates the key on first run) | `bounded whoami` |
| `link` | Bind the keypair to a human (email) account via an **OAuth device flow**; keypair + email-wallet become admin-collaborators on each other's apps. Keypair keeps signing. | `bounded link` |
| `share <wallet\|email> --app-id <id>` | Add a collaborator. **Wallet** → direct (default role `policy`). **Email** → resolved to its Privy pre-generated wallet, added as `admin` (no wallet needed on their end). `--role policy\|admin` overrides. Owner only. | `bounded share teammate@example.com --app-id <id>` |
| `unshare <wallet> --app-id <id>` | Remove a collaborator (owner only) | `bounded unshare <wallet> --app-id <id>` |
| `collaborators --app-id <id>` | List collaborators (alias: `shares`) | `bounded collaborators --app-id <id>` |

`link` flags: `--no-browser` (just print the URL), `--timeout <dur>` (default
`10m`). Collaboration grants **control-plane** authority (manage the app), not a
data-plane bypass — give data powers explicitly via policy rules
([admin-and-ownership.md](admin-and-ownership.md)).

## Policy lifecycle

| Command | Does | Key flags |
|---|---|---|
| `init` | Write a starter `policy.json` (spend ledger + `spend_cap`) | `--force` overwrite |
| `verify <policy.json>` | Run the proof engine, print the report + counterexamples | `--app-id` (or `--environment`), `--operation`, `--constants`, `--environment` |
| `deploy <policy.json>` | Validate, compile, and push the policy (same fail-closed gate) | `--app-id` or `--create --name` or `--environment`, `--protocol`, `--constants`, `--environment` |

```bash
bounded init                                            # scaffold policy.json
bounded deploy ./policy.json --create --name my-app     # create app + deploy (prints appId)
bounded verify ./policy.json --app-id <appId>           # re-prove after edits
bounded deploy ./policy.json --app-id <appId>           # redeploy
```

> **`verify` / `verify-formal` is rate-limited** — about **5 requests per minute
> per app owner** on staging (`429: Too many formal verification requests`). The
> "declare → verify → fix" fast loop is real, but pace it: batch edits before
> re-running, and don't spin `verify` in a tight retry. A `429` is throttling, not
> a policy error — back off ~60s and retry.

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

CLI-side substitution for the **legacy** `@constants.NAME` token: supply values
at deploy/verify with `--constants NAME=value` (repeatable or comma-separated).
Digit-only values ≤15 chars inline as numbers; everything else is wrapped as a
string literal.

```bash
bounded deploy ./policy.json --app-id <id> --constants CAP=5000,ADMIN=8xY...
```

> Prefer an in-policy `constants` block + `@const.NAME` (resolved server-side) for
> values that live with the policy — see [constants-and-defs.md](constants-and-defs.md).
> Use `--constants` for one-off CI overrides.

### `--environment`

Select an entry from the policy's `environments` block: the CLI overlays that
env's constants, targets its `appId`, and strips the block before shipping a
normal policy. One file → many apps.

```bash
bounded deploy ./policy.json --environment staging      # staging appId + staging constants
bounded deploy ./policy.json --environment production   # production appId + production constants
```

Full treatment: [environments.md](environments.md).

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
| `subscribe` | **Stream realtime changes** for a path (one JSON line per server message) | `bounded subscribe "tasks/$taskId" --app-id <id>` |

### `subscribe` — realtime watch from the CLI

`bounded subscribe <path> --app-id <id>` opens a realtime subscription (same
`ws/v2` protocol and auth as the SDK — your `~/.bounded/credentials` identity)
and prints each update as one JSON line (`{"type":"snapshot"|"delta", ...}`).
Built for agents/scripts that react to data changes:

```bash
# a COLLECTION (all docs) or a CONCRETE doc — NOT a "$var" template path
bounded subscribe "rooms/r1/scores" --app-id <id> | while read -r line; do
  echo "$line" | jq '.data'   # react to each change
done
bounded subscribe "rooms/r1/scores/alice" --app-id <id> --once   # one doc
```

**Path semantics (important):** subscribe to a **collection** (`rooms`,
`rooms/r1/scores`) to watch all its docs, or a **concrete document**
(`rooms/r1`). Do NOT pass a `$variable` template path like `rooms/$roomId` —
the `$roomId` is matched literally, finds no document, and returns empty.

Flags: `--once` (exit after the first snapshot — good for a one-shot read),
`--timeout 30s` (exit if idle), `--include-subpaths`, `--filter '<json>'`,
`--limit N`. Streams until Ctrl-C, auto-reconnecting on drops. Reads obey the
same policy as everything else — a subscriber only sees what its identity is
allowed to read.

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

## Debugging denied writes — `bounded decisions`

When a write returns `403`, `bounded decisions` shows the realtime backend's
recent **WRITE policy decisions** for the app (most-recent-first) so you can see
*why* — each deny carries the failing rule/clause reason.

```sh
bounded decisions --app-id <id>                  # recent allows + denies (human table)
bounded decisions --app-id <id> --denied-only    # only the denials
bounded decisions --app-id <id> --limit 20       # cap the rows
bounded decisions --app-id <id> --json           # one JSON object per line (agent-friendly)
```

| Flag | Meaning |
|------|---------|
| `--app-id <id>` | Target app (required) |
| `--denied-only` | Only show denied writes |
| `--limit N` | Max rows, most-recent-first (0 = server default) |
| `--json` | Emit one compact JSON object per decision line |

Each entry: `ts`, `collection`, `path`, `action` (create/update/delete),
`actor` (wallet address or `(anon)`), `decision` (allow/deny), `reason`, and
`roomId` (for session/partition writes). Owner/collaborator gated (same auth as
`bounded share`/collaborators). The buffer is **in-memory and bounded** (~200
entries per app, denies retained over allows) — make a write, then re-run.

Typical loop: a `data set` returns `403 Policy failed: ...` → run
`bounded decisions --app-id <id> --denied-only` → read the failing-rule reason →
fix the policy or the calling identity.

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
