<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@PriceFeedPlugin`

Pyth price reads by 64-hex feed id.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Price units and integer rules

`getPriceFeed` returns a decimal `String` in dollars, such as `"119.80958948"`, or a decimal base/quote ratio when a second feed is supplied.
Use `String` as the named-query return type.
Do not pass this result into integer rule arithmetic or compare it directly to an integer: a numeric-looking string is not an integer price.

`getPriceFeedScaled(feedId, decimals)` is a separate USD-only integer API requiring runtime v8 when executed in the Solana program.
The devnet program runs runtime v9 as of 2026-10-06 (slot 508118456); mainnet-beta remains on runtime v8 as of 2026-09-29 (slot 451516304).
Only the programs have been upgraded for this API; the matching hosted worker, query, and compiler services, venue policy, and frontend rollout remain pending.
The devnet catalog remains `unverified` until hosted app acceptance is established.
Pass a `@PriceFeedPlugin.<SYMBOL>` constant or a 64-character Pyth feed ID, then an integer precision from 0 through 18.
It returns `floor(USD price * 10^decimals)` as a positive `UInt` using exact checked arithmetic.
At precision 6, the example price becomes `119809589` micro-USD per SOL.
Invalid precision, non-positive prices, rounding to zero, u64 overflow, and invalid or stale oracle accounts fail closed.
This call has exactly two arguments and does not accept a quote feed.

When evaluated directly in the worker, both price APIs read verified sponsored oracle account bytes through the platform RPC.
That price read does not execute the Bounded program and is independent of its deployed runtime version.
A whole query routed to the Solana program still requires runtime v8 for the scaled call, even when its collection declares `onchain: false`.

For a runtime-v8 policy that retains a $5 SOL cushion, use compatible micro-USD and lamport units:

```text
@MathPlugin.mulDivCeil(5000000, 1000000000, @PriceFeedPlugin.getPriceFeedScaled(@PriceFeedPlugin.SOL, 6))
```

The result is the required lamport balance after the deposit.
Flooring the price and rounding the required lamports up keeps the cushion conservative.
The frontend must use the same scale and rounding when deciding how much SOL is available to deposit.

## Read-only

### `PriceFeedPlugin.getPriceFeed`

```
@PriceFeedPlugin.getPriceFeed(baseFeedId, quoteFeedId?) - pass a @PriceFeedPlugin.<SYMBOL> variable or a 64-character Pyth feed id, e.g., getPriceFeed(@PriceFeedPlugin.SOL) or getPriceFeed(@PriceFeedPlugin.SOL, @PriceFeedPlugin.BTC). A plain symbol string like 'SOL' is not a feed id and is rejected. Both onchain and offchain evaluation read the feed's sponsored Pyth push-oracle account on the app's cluster, so the feed id must have a sponsored account there (all @PriceFeedPlugin.<SYMBOL> feeds do); a feed without one fails closed.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PYTH-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `baseFeedId` | string | yes | - | The base asset feed id: a @PriceFeedPlugin.<SYMBOL> variable (e.g., @PriceFeedPlugin.SOL) or a 64-character hex Pyth feed id. A plain symbol string like 'SOL' is not a valid feed id. |
| `quoteFeedId` | string | no | - | Optional quote asset feed id: a @PriceFeedPlugin.<SYMBOL> variable (e.g., @PriceFeedPlugin.BTC) or a 64-character hex Pyth feed id. Defaults to USD if not provided. |

### `PriceFeedPlugin.getPriceFeedScaled`

```
@PriceFeedPlugin.getPriceFeedScaled(feedId, decimals) - returns the USD price as a positive UInt, floor(price * 10^decimals), using exact checked integer arithmetic. decimals must be 0..18; use 6 for micro-USD. Pass a @PriceFeedPlugin.<SYMBOL> variable or a 64-character Pyth feed id. Reads the same fully verified, fresh sponsored Pyth account as getPriceFeed; rejects non-positive prices, precision underflow to zero, and u64 overflow. USD only; use the unchanged getPriceFeed for decimal-string prices and base/quote ratios. Requires onchain runtime v8, which must be deployed on the target cluster first.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `uint`
- Status: **unverified** (source parity only); markers: NEEDS-RUNTIME-V8; LIVE-PYTH-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `feedId` | string | yes | - | The USD feed id: a @PriceFeedPlugin.<SYMBOL> variable or a 64-character hex Pyth feed id, optionally prefixed with 0x. |
| `decimals` | uint | yes | - | Integer precision from 0 to 18. The positive USD price is multiplied by 10^decimals and rounded down. 6 returns integer micro-USD. |

## Built-in values

| Name | Meaning |
|---|---|
| `@PriceFeedPlugin.BTC` | [object Object] |
| `@PriceFeedPlugin.ETH` | [object Object] |
| `@PriceFeedPlugin.SOL` | [object Object] |
| `@PriceFeedPlugin.USDC` | [object Object] |
