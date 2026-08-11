<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@App`

Cross-app Document reads and writes from onchain policy.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `App.set`

```
@App.set(appId, path, data) - Cross-app write. Evaluates the target app's create/update rule with the current user and enforces its field maps. Fails closed for target hooks, target onchain invariants, or nested write effects until those transitions can be enforced atomically. Rent is funded by the calling app's escrow.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-CROSS-APP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `appId` | string | yes | - | The TARGET app id to write into |
| `path` | string | yes | - | The document path in the TARGET app (e.g. 'scores/player1') |
| `data` | object | yes | - | Object of field values to write, validated against the target path's field type/required/readonly maps |

## Read-only

### `App.get`

```
@App.get(appId, path) - Reads another app's document (or null if missing). Read-only; the document PDA is derived with the TARGET app id.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `object`
- Status: **unverified** (source parity only); markers: LIVE-CROSS-APP-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `appId` | string | yes | - | The TARGET app id to read from |
| `path` | string | yes | - | The document path in the TARGET app (e.g. 'scores/player1') |
