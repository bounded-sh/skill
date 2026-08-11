<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PriceFeedPlugin`

Pyth price reads by 64-hex feed id.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Read-only

### `PriceFeedPlugin.getPriceFeed`

```
@PriceFeedPlugin.getPriceFeed(baseFeedId, quoteFeedId?) - pass a @PriceFeedPlugin.<SYMBOL> variable or a 64-character Pyth feed id, e.g., getPriceFeed(@PriceFeedPlugin.SOL) or getPriceFeed(@PriceFeedPlugin.SOL, @PriceFeedPlugin.BTC). A plain symbol string like 'SOL' is not a feed id and is rejected.
```

- Callable from: rules, named queries, and hooks (read-only)
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PYTH-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `baseFeedId` | string | yes | no | - | The base asset feed id: a @PriceFeedPlugin.<SYMBOL> variable (e.g., @PriceFeedPlugin.SOL) or a 64-character hex Pyth feed id. A plain symbol string like 'SOL' is not a valid feed id. |
| `quoteFeedId` | string | no | no | - | Optional quote asset feed id: a @PriceFeedPlugin.<SYMBOL> variable (e.g., @PriceFeedPlugin.BTC) or a 64-character hex Pyth feed id. Defaults to USD if not provided. |

## Built-in values

| Name | Meaning |
|---|---|
| `@PriceFeedPlugin.BTC` | [object Object] |
| `@PriceFeedPlugin.ETH` | [object Object] |
| `@PriceFeedPlugin.SOL` | [object Object] |
| `@PriceFeedPlugin.USDC` | [object Object] |
