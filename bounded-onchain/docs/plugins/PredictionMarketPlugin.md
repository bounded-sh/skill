<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PredictionMarketPlugin`

Pure AMM/LSMR prediction-market math (quotes only, no mutation).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Read-only

### `PredictionMarketPlugin.applyFee`

```
@PredictionMarketPlugin.applyFee(amount, feeBps)
```

Calculates the fee amount from a given amount using basis points (bps). Formula: (amount * feeBps) // 10000

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `amount` | u64 | yes | - | The amount to calculate fee from. |
| `feeBps` | u64 | yes | - | The fee in basis points (e.g., 100 = 1%). |

### `PredictionMarketPlugin.getCollateralOutAmm`

```
@PredictionMarketPlugin.getCollateralOutAmm(yesIn, collateralReserve, yesSupply)
```

Calculates the amount of collateral out for a given amount of YES tokens in, using constant product AMM formula: (collateralReserve * yesIn) // (yesSupply + yesIn)

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `yesIn` | u64 | yes | - | The amount of YES tokens being sold. |
| `collateralReserve` | u64 | yes | - | The current collateral reserve in the market. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |

### `PredictionMarketPlugin.getNoCollateralOutLsmr`

```
@PredictionMarketPlugin.getNoCollateralOutLsmr(noIn, yesSupply, noSupply, b)
```

Calculates the amount of collateral out for a given amount of NO tokens in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `noIn` | u64 | yes | - | The amount of NO tokens being sold. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | - | The current NO token supply in the market. |
| `b` | u64 | yes | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getNoTokensOutLsmr`

```
@PredictionMarketPlugin.getNoTokensOutLsmr(amountIn, yesSupply, noSupply, b)
```

Calculates the number of NO tokens out for a given amount of collateral in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `amountIn` | u64 | yes | - | The amount of collateral being deposited. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | - | The current NO token supply in the market. |
| `b` | u64 | yes | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getYesCollateralOutLsmr`

```
@PredictionMarketPlugin.getYesCollateralOutLsmr(yesIn, yesSupply, noSupply, b)
```

Calculates the amount of collateral out for a given amount of YES tokens in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `yesIn` | u64 | yes | - | The amount of YES tokens being sold. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | - | The current NO token supply in the market. |
| `b` | u64 | yes | - | The LMSR liquidity parameter (b). |

### `PredictionMarketPlugin.getYesTokenOutAmm`

```
@PredictionMarketPlugin.getYesTokenOutAmm(amountIn, collateralReserve, yesSupply)
```

Calculates the number of YES tokens out for a given amount of collateral in, using constant product AMM formula: (amountIn * yesSupply) // (collateralReserve + amountIn)

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `amountIn` | u64 | yes | - | The amount of collateral being deposited. |
| `collateralReserve` | u64 | yes | - | The current collateral reserve in the market. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |

### `PredictionMarketPlugin.getYesTokensOutLsmr`

```
@PredictionMarketPlugin.getYesTokensOutLsmr(amountIn, yesSupply, noSupply, b)
```

Calculates the number of YES tokens out for a given amount of collateral in, using LMSR (Logarithmic Market Scoring Rule) formula.

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `amountIn` | u64 | yes | - | The amount of collateral being deposited. |
| `yesSupply` | u64 | yes | - | The current YES token supply in the market. |
| `noSupply` | u64 | yes | - | The current NO token supply in the market. |
| `b` | u64 | yes | - | The LMSR liquidity parameter (b). |
