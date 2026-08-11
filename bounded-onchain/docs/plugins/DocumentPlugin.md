<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@DocumentPlugin`

Staged document writes from hooks; check each function for its supported hook plane.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Placement

`updateField` is the one mutating plugin call legal in both hook planes: offchain hooks on any collection, and onchain bytecode following the [staged document update contract](../policy-primitives.md#onchain-staged-document-updates) (`get()` pre-state, staged writes, `getAfter()` post-state). Offchain hooks admit only DocumentPlugin mutations (plus StringUtils reads); every other plugin is onchain-hook-only. `putDocument` is offchain-only and its data argument must be an object literal (`{ total: 99 }`), never a JSON string. Field names must be quoted string literals.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `DocumentPlugin.putDocument`

```
@DocumentPlugin.putDocument(path, data) - creates or replaces the document at `path`. Offchain hooks only.
```

- Callable from: `hooks.offchain`
- Status: **unsupported** (not applicable); markers: OFFCHAIN-ONLY.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `path` | string | yes | - | The path of the document to create or replace. |
| `data` | any | yes | - | The document contents, as an object or a JSON string. |

### `DocumentPlugin.updateField`

```
@DocumentPlugin.updateField(path, field, value)
```

- Callable from: `hooks.onchain`, `hooks.offchain`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `path` | string | yes | - | The path of the document to update. |
| `field` | string | yes | - | The field to update. |
| `value` | any | yes | - | Any policy value to assign. Null deletes the field. |
