<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@MathPlugin`

Overflow-safe mulDiv helpers for rule arithmetic.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Read-only

### `MathPlugin.mulDivCeil`

```
@MathPlugin.mulDivCeil(value, multiplier, divisor) - Computes ceil(value * multiplier / divisor) with full precision intermediate product
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `value` | number | yes | - | The value to multiply (unsigned) |
| `multiplier` | number | yes | - | The multiplier (unsigned) |
| `divisor` | number | yes | - | The divisor (unsigned, must be non-zero) |

### `MathPlugin.mulDivFloor`

```
@MathPlugin.mulDivFloor(value, multiplier, divisor) - Computes floor(value * multiplier / divisor) with full precision intermediate product
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `value` | number | yes | - | The value to multiply (unsigned) |
| `multiplier` | number | yes | - | The multiplier (unsigned) |
| `divisor` | number | yes | - | The divisor (unsigned, must be non-zero) |
