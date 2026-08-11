<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PredictionMarketPlugin`

Pure AMM/LSMR prediction-market math (quotes only, no mutation).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Read-only

### `PredictionMarketPlugin.applyFee`

```
@PredictionMarketPlugin.applyFee(amount, feeBps)
```

Calculates the fee amount from a given amount using basis points (bps). Formula: (amount * feeBps) // 10000

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `amount` | u64 | yes | no | - | The amount to calculate fee from. |
| `feeBps` | u64 | yes | no | - | The fee in basis points (e.g., 100 = 1%). |

### `PredictionMarketPlugin.getCollateralOutAmm`

```
@PredictionMarketPlugin.getCollateralOutAmm(yesIn, collateralReserve, yesSupply)
```

Calculates the amount of collateral out for a given amount of YES tokens in, using constant product AMM formula: (collateralReserve * yesIn) // (yesSupply + yesIn)

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `yesIn` | u64 | yes | no | - | The amount of YES tokens being sold. |
| `collateralReserve` | u64 | yes | no | - | The current collateral reserve in the market. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |

### `PredictionMarketPlugin.getNoCollateralOutLsmr`

```
@PredictionMarketPlugin.getNoCollateralOutLsmr(noIn, yesSupply, noSupply, b)
```

Calculates the amount of collateral out for a given amount of NO tokens in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `noIn` | u64 | yes | no | - | The amount of NO tokens being sold. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | no | - | The current NO token supply in the market. |
| `b` | u64 | yes | no | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getNoTokensOutLsmr`

```
@PredictionMarketPlugin.getNoTokensOutLsmr(amountIn, yesSupply, noSupply, b)
```

Calculates the number of NO tokens out for a given amount of collateral in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `amountIn` | u64 | yes | no | - | The amount of collateral being deposited. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | no | - | The current NO token supply in the market. |
| `b` | u64 | yes | no | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getYesCollateralOutLsmr`

```
@PredictionMarketPlugin.getYesCollateralOutLsmr(yesIn, yesSupply, noSupply, b)
```

Calculates the amount of collateral out for a given amount of YES tokens in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `yesIn` | u64 | yes | no | - | The amount of YES tokens being sold. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | no | - | The current NO token supply in the market. |
| `b` | u64 | yes | no | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getYesTokenOutAmm`

```
@PredictionMarketPlugin.getYesTokenOutAmm(amountIn, collateralReserve, yesSupply)
```

Calculates the number of YES tokens out for a given amount of collateral in, using constant product AMM formula: (amountIn * yesSupply) // (collateralReserve + amountIn)

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `amountIn` | u64 | yes | no | - | The amount of collateral being deposited. |
| `collateralReserve` | u64 | yes | no | - | The current collateral reserve in the market. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |

### `PredictionMarketPlugin.getYesTokensOutLsmr`

```
@PredictionMarketPlugin.getYesTokensOutLsmr(amountIn, yesSupply, noSupply, b)
```

Calculates the number of YES tokens out for a given amount of collateral in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `amountIn` | u64 | yes | no | - | The amount of collateral being deposited. |
| `yesSupply` | u64 | yes | no | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | no | - | The current NO token supply in the market. |
| `b` | u64 | yes | no | - | The LMSR liquidity parameter (b). |
