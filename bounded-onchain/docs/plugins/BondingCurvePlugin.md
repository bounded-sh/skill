<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@BondingCurvePlugin`

Pure constant-product bonding-curve math (quotes only, no mutation).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Read-only

### `BondingCurvePlugin.getMarketCapInSol`

```
@BondingCurvePlugin.getMarketCapInSol(supply, virtualSolReserves, virtualTokenReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `supply` | u64 | yes | no | - | The current supply of the token. |
| `virtualSolReserves` | u64 | yes | no | - | The current amount of virtual sol reserves in the bonding curve to compute the price. |
| `virtualTokenReserves` | u64 | yes | no | - | The current amount of virtual token reserves in the bonding curve to compute the price. |

### `BondingCurvePlugin.getMaxSolInProduct`

```
@BondingCurvePlugin.getMaxSolInProduct(virtualSolReserves, virtualTokenReserves, actualTokenReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `virtualSolReserves` | u64 | yes | no | - | The current amount of virtual sol reserves in the bonding curve to compute the price. |
| `virtualTokenReserves` | u64 | yes | no | - | The current amount of virtual token reserves in the bonding curve to compute the price. |
| `actualTokenReserves` | u64 | yes | no | - | The current amount of actual token reserves in the bonding curve. The actual balance of the token in the bonding curve. |

### `BondingCurvePlugin.getMaxTokensInProduct`

```
@BondingCurvePlugin.getMaxTokensInProduct(virtualSolReserves, virtualTokenReserves, actualSolReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `virtualSolReserves` | u64 | yes | no | - | The current amount of virtual sol reserves in the bonding curve to compute the price. |
| `virtualTokenReserves` | u64 | yes | no | - | The current amount of virtual token reserves in the bonding curve to compute the price. |
| `actualSolReserves` | u64 | yes | no | - | The current amount of actual sol reserves in the bonding curve. The actual balance of the sol in the bonding curve. |

### `BondingCurvePlugin.getSolOutProduct`

```
@BondingCurvePlugin.getSolOutProduct(tokenAmount, virtualSolReserves, virtualTokenReserves, actualSolReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `tokenAmount` | u64 | yes | no | - | The amount of tokens you want to put in the bonding curve. |
| `virtualSolReserves` | u64 | yes | no | - | The current amount of virtual sol reserves in the bonding curve to compute the price. |
| `virtualTokenReserves` | u64 | yes | no | - | The current amount of virtual token reserves in the bonding curve to compute the price. |
| `actualSolReserves` | u64 | yes | no | - | The current amount of actual sol reserves in the bonding curve. The actual balance of the sol in the bonding curve. |

### `BondingCurvePlugin.getTokensInProduct`

```
@BondingCurvePlugin.getTokensInProduct(solAmountOut, virtualSolReserves, virtualTokenReserves, actualSolReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `solAmountOut` | u64 | yes | no | - | Non-negative SOL amount to remove from the curve. |
| `virtualSolReserves` | u64 | yes | no | - | Current virtual SOL reserves. |
| `virtualTokenReserves` | u64 | yes | no | - | Current virtual token reserves. |
| `actualSolReserves` | u64 | yes | no | - | Current actual SOL reserves. |

### `BondingCurvePlugin.getTokensOutProduct`

```
@BondingCurvePlugin.getTokensOutProduct(solAmount, virtualSolReserves, virtualTokenReserves, actualTokenReserves)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `solAmount` | u64 | yes | no | - | The amount of sol you want to put in the bonding curve. |
| `virtualSolReserves` | u64 | yes | no | - | The current amount of virtual sol reserves in the bonding curve to compute the price. |
| `virtualTokenReserves` | u64 | yes | no | - | The current amount of virtual token reserves in the bonding curve to compute the price. |
| `actualTokenReserves` | u64 | yes | no | - | The current amount of actual token reserves in the bonding curve. The actual balance of the token in the bonding curve. |
