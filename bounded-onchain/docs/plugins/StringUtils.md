<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@StringUtils`

String helpers usable in rules.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Read-only

### `StringUtils.concat`

```
@StringUtils.concat(a, b, ...) - Concatenates string values (variadic); builds an account-id string like rootAppId + ":cca" (the + operator is arithmetic-only).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries, `hooks.offchain`
- Returns: `string`
- Status: **unverified** (source parity only); markers: NEEDS-RUNTIME-V6.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `a` | string | yes | - | First string value |
| `b` | string | no | - | Second string value (optional; variadic) |
| `c` | string | no | - | Additional string value (optional; variadic) |

### `StringUtils.length`

```
@StringUtils.length(str)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries, `hooks.offchain`
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `str` | string | yes | - | The string to get the length of |
