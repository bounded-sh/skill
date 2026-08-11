<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@StringUtils`

String helpers usable in rules.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Read-only

### `StringUtils.length`

```
@StringUtils.length(str)
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `str` | string | yes | no | - | The string to get the length of |
