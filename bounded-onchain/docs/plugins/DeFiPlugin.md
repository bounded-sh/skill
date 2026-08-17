<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@DeFiPlugin`

AMM pools, swaps, Meteora launches/fee claims, and cp-AMM liquidity positions.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Conventions for every call

- **Custody:** every `source`/`owner` argument follows the uniform rule - wallet, `@contract.address` escrow, or account id (named app PDA). A per-entity account id is how you keep one launch/market/position pot physically separate from another: `createPool($launchId, ...)` gives each launch its own program-signed fund instead of pooling everything in the shared escrow. See [custody and PDAs](../custody-and-pdas.md).
- Meteora launch flows (config, virtual pool, fee claims) are documented end to end in [meteora-token-launch.md](../meteora-token-launch.md) and the fee-split composition in [oapps-tokenomics-fee-split.md](../oapps-tokenomics-fee-split.md).
- Slippage arguments are basis points (`500` = 5%). Every mutating call returns `Bool` (built and executed), never an amount - read balances or pool state afterwards.

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `DeFiPlugin.addCpAmmLiquidity`

```
@DeFiPlugin.addCpAmmLiquidity(source, poolAddress, positionMintAddress, tokenAAmount, tokenBAmount, slippageBps?) - Adds liquidity to a Meteora CP-AMM position
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source providing liquidity - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | - | The NFT mint address of the position to add liquidity to |
| `tokenAAmount` | string | yes | - | Amount of token A to deposit (in smallest units) |
| `tokenBAmount` | string | yes | - | Amount of token B to deposit (in smallest units) |
| `slippageBps` | number | no | - | Optional: Slippage tolerance in basis points (100 = 1%). Allows extra tokens to be spent as buffer. Default: 0 |

### `DeFiPlugin.claimDammV2PoolFees`

```
@DeFiPlugin.claimDammV2PoolFees(source, poolAddress, positionMintAddress?) - If positionMintAddress is provided, claims fees from only that position; otherwise claims from all positions owned by source in the pool.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source account claiming fees - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | - | The address of the graduated DAMM v2 pool |
| `positionMintAddress` | string | no | - | Optional: The NFT mint address of a specific position to claim fees from. The position address is derived from this mint. If omitted, claims from all positions owned by source in the pool. |

### `DeFiPlugin.claimMeteoraPoolFees`

```
@DeFiPlugin.claimMeteoraPoolFees(source, poolAddress)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source account claiming fees - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | - | The address of the Meteora virtual pool |

### `DeFiPlugin.closeCpAmmPosition`

```
@DeFiPlugin.closeCpAmmPosition(source, poolAddress, positionMintAddress) - Closes an empty Meteora CP-AMM position and recovers rent
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The owner of the position - can be wallet address, @contract.address for escrow, or account ID for PDA. Also receives rent refund. |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | - | The NFT mint address of the position to close (must be empty - no liquidity) |

### `DeFiPlugin.createCpAmmPosition`

```
@DeFiPlugin.createCpAmmPosition(owner, poolAddress, positionId) - Creates a new liquidity position (NFT) in a Meteora CP-AMM pool
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `owner` | string | yes | **yes** | The owner of the position - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionId` | string | yes | - | Unique identifier for this position (e.g., document path $positionId) |

### `DeFiPlugin.createMeteoraConfig`

```
@DeFiPlugin.createMeteoraConfig(configId, feeAccount, preMigratedFeeAmountBps, preMigratedCreatorFeePercentage, postMigratedFeeAmountBps, creatorPermanentLockedLiquidityPercentage, initialMarketCap?, migrationMarketCap?, totalTokenSupply?, tokenBaseDecimal?, leftover?, leftoverReceiver?, decayStartingFeeBps?, decayEndingFeeBps?, decayNumberOfPeriod?, decayTotalDuration?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `configId` | string | yes | - | Unique identifier for the config within the app |
| `feeAccount` | string | yes | - | The account that will receive the fees |
| `preMigratedFeeAmountBps` | number | yes | - | The fee amount in basis points for the pre-migrated pool |
| `preMigratedCreatorFeePercentage` | number | yes | - | The creator fee percentage for the pre-migrated pool |
| `postMigratedFeeAmountBps` | number | yes | - | The fee amount in basis points for the post-migrated pool |
| `creatorPermanentLockedLiquidityPercentage` | number | yes | - | Percentage (0-100) of the migrated DAMM v2 creator liquidity that is PERMANENTLY LOCKED. This is an LP-lock split, not a fee share: the remaining 100 minus this value becomes ordinary creator liquidity the creator can withdraw. It does not change who receives post-migration trading fees. The partner legs are fixed at 0 today, so the creator holds 100 percent of the migrated position either way |
| `initialMarketCap` | number | no | - | Optional: The initial market cap in SOL for the bonding curve. Default: 30 |
| `migrationMarketCap` | number | no | - | Optional: The market cap in SOL at which the pool migrates to DAMM v2. Default: 85 |
| `totalTokenSupply` | number | no | - | Optional: The total token supply (in base units). Default: 1000000000 |
| `tokenBaseDecimal` | number | no | - | Optional: The token decimal places (6 or 9). Default: 6 |
| `leftover` | number | no | - | Optional: The number of tokens to reserve as leftover (outside the bonding curve). These tokens are minted into the pool's base vault and can only be withdrawn by leftoverReceiver after migration to DAMM V2. Default: 0 |
| `leftoverReceiver` | string | no | - | Optional: The account that will receive leftover tokens after migration. Can be a wallet address, @contract.address for escrow, or an account id (a named app PDA; see the custody guide). Default: uses feeAccount |
| `decayStartingFeeBps` | number | no | - | Optional: Anti-snipe opening fee in basis points for the pre-migrated pool. When set (with decayNumberOfPeriod/decayTotalDuration), the pre-migration fee starts here and decays linearly (Meteora FeeSchedulerLinear) toward decayEndingFeeBps. Example: 5000 (50%) decaying to 300 (3%). Default: preMigratedFeeAmountBps (flat fee, no decay) |
| `decayEndingFeeBps` | number | no | - | Optional: The fee in basis points the pre-migration fee decays down to. Default: preMigratedFeeAmountBps |
| `decayNumberOfPeriod` | number | no | - | Optional: Number of linear reduction periods over which the fee decays from decayStartingFeeBps to decayEndingFeeBps. Default: 0 (flat fee, no decay) |
| `decayTotalDuration` | number | no | - | Optional: Total duration of the fee decay, in the pool's activation unit (slots). Default: 0 (flat fee, no decay) |

### `DeFiPlugin.createMeteoraVirtualPool`

```
@DeFiPlugin.createMeteoraVirtualPool(configId, tokenId, name, symbol, uri, initialSolBuyAmount?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `configId` | string | yes | - | Unique identifier for the config within the app |
| `tokenId` | string | yes | - | Unique identifier for the token within the app |
| `name` | string | yes | - | The name of the token |
| `symbol` | string | yes | - | The symbol of the token |
| `uri` | string | yes | - | The URI of the json metadata |
| `initialSolBuyAmount` | string | no | - | Optional: Initial SOL amount in lamports to buy tokens with (dev buy). If provided and > 0, executes a swap after pool creation. |

### `DeFiPlugin.createPool`

```
@DeFiPlugin.createPool(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, tokenBAmount, config?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF; CPAMM-SCENARIO.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `tokenMintAAddress` | string | yes | - | The mint address of the token A |
| `tokenMintBAddress` | string | yes | - | The mint address of the token B |
| `tokenAAmount` | string | yes | - | The amount of token A to deposit |
| `tokenBAmount` | string | yes | - | The amount of token B to deposit |
| `config` | object | no | - | Optional: Pool configuration object. If omitted, uses default config. If provided, ALL fields are REQUIRED (no partial configs). |

Fields of `config`:

| Field | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `baseFeeBps` | number | conditional | - | Base fee in basis points (0-10000) |
| `numberOfPeriod` | number | conditional | - | Number of fee reduction periods |
| `periodFrequency` | number | conditional | - | Frequency of fee reduction periods in seconds |
| `reductionFactor` | number | conditional | - | Fee reduction factor per period |
| `feeSchedulerMode` | string | conditional | - | Fee scheduler mode: 'linear' or 'exponential' |
| `protocolFeePercent` | number | conditional | - | Protocol fee percentage (0-100) |
| `referralFeePercent` | number | conditional | - | Referral fee percentage (0-100) |
| `compoundingFeeBps` | number | conditional | - | Compounding fee in basis points (required when collectFeeMode is 'compounding', default 0) |
| `dynamicFeeEnabled` | boolean | conditional | - | Enable dynamic fee calculation |
| `binStep` | number | conditional | - | Bin step for dynamic fee (if enabled) |
| `filterPeriod` | number | conditional | - | Filter period for volatility (if dynamic fee enabled) |
| `decayPeriod` | number | conditional | - | Decay period for volatility (if dynamic fee enabled) |
| `dynamicFeeReductionFactor` | number | conditional | - | Dynamic fee reduction factor (if dynamic fee enabled) |
| `maxVolatilityAccumulator` | number | conditional | - | Max volatility accumulator (if dynamic fee enabled) |
| `variableFeeControl` | number | conditional | - | Variable fee control (if dynamic fee enabled) |
| `collectFeeMode` | string | conditional | - | Fee collection mode: 'onlyB', 'both', or 'compounding' |
| `activationType` | string | conditional | - | Activation type: 'timestamp' or 'slot' |
| `activationPoint` | number | conditional | - | Activation point (timestamp or slot number), null for immediate |
| `hasAlphaVault` | boolean | conditional | - | Whether pool has alpha vault |

### `DeFiPlugin.lockCpAmmPosition`

```
@DeFiPlugin.lockCpAmmPosition(source, poolAddress, positionMintAddress, periodFrequency, cliffUnlockLiquidity, liquidityPerPeriod, numberOfPeriod, cliffPoint?) - Locks liquidity in a position with vesting schedule
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source of the position - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | - | The NFT mint address of the position to lock |
| `periodFrequency` | number | yes | - | Time in seconds between unlock periods |
| `cliffUnlockLiquidity` | string | yes | - | Amount of liquidity unlocked at cliff (u128 as string) |
| `liquidityPerPeriod` | string | yes | - | Amount of liquidity unlocked per period (u128 as string) |
| `numberOfPeriod` | number | yes | - | Total number of vesting periods |
| `cliffPoint` | number | no | - | Unix timestamp when cliff unlocking begins (optional, null for immediate) |

### `DeFiPlugin.removeCpAmmLiquidity`

```
@DeFiPlugin.removeCpAmmLiquidity(source, poolAddress, positionMintAddress, tokenAAmount, tokenBAmount, slippageBps?) - Removes liquidity from a Meteora CP-AMM position. Pass null for both token amounts to remove all unlocked liquidity.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source removing liquidity - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | - | The NFT mint address of the position to remove liquidity from |
| `tokenAAmount` | string | no | - | Amount of token A to withdraw (in smallest units), or null to remove all |
| `tokenBAmount` | string | no | - | Amount of token B to withdraw (in smallest units), or null to remove all. Must match tokenAAmount: both specified or both null. |
| `slippageBps` | number | no | - | Optional: Slippage tolerance in basis points (100 = 1%). Allows receiving fewer tokens. Default: 0 |

### `DeFiPlugin.swap`

```
@DeFiPlugin.swap(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, slippageBps?)
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-DEVNET-JUPITER.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `tokenMintAAddress` | string | yes | - | The mint address of the token A |
| `tokenMintBAddress` | string | yes | - | The mint address of the token B |
| `tokenAAmount` | string | yes | - | The amount of token A to swap |
| `slippageBps` | number | no | - | Optional: Slippage tolerance in basis points (1 bps = 0.01%). Default: 500 (5%) |

### `DeFiPlugin.swapInMeteoraVirtualPool`

```
@DeFiPlugin.swapInMeteoraVirtualPool(source, poolTokenMint, tokenMint, amount, minimumAmountOut?, slippageBps?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The source account for the swap - can be @user.address, @contract.address for escrow, or a string ID for PDA |
| `poolTokenMint` | string | yes | - | The mint address of the pool's base token (used to find the pool) |
| `tokenMint` | string | yes | - | The mint address of the token to swap in (use @TokenPlugin.SOL for native SOL) |
| `amount` | string | yes | - | The amount of token to swap in (in smallest units) |
| `minimumAmountOut` | string | no | - | Optional explicit minimum output amount in smallest units. When omitted, the builder derives the floor from a fresh on-chain quote using slippageBps, which defaults to 500 (5%). |
| `slippageBps` | number | no | - | Optional slippage tolerance in basis points (1 bps = 0.01%). Used when minimumAmountOut is omitted: the builder pulls a fresh on-chain quote and derives the protected minimum-output floor. Defaults to 500 (5%). |

### `DeFiPlugin.withdrawLeftover`

```
@DeFiPlugin.withdrawLeftover(virtualPoolAddress) - Withdraws leftover tokens from a migrated Meteora virtual pool to the leftoverReceiver set in the config. Can only be called after migration.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `virtualPoolAddress` | string | yes | - | The address of the Meteora virtual pool |

## Read-only

### `DeFiPlugin.getClaimableCpAmmPositionFee`

```
@DeFiPlugin.getClaimableCpAmmPositionFee(owner, poolAddress, tokenMint, positionMintAddress?) - Gets the claimable fees for a specific token from a CP-AMM position. If positionMintAddress is omitted, aggregates fees from all positions owned by owner in the pool.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `uint`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `owner` | string | yes | - | The owner of the position(s) - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | - | The address of the CP-AMM pool |
| `tokenMint` | string | yes | - | The mint address of the token to get claimable fees for (use @TokenPlugin.SOL for SOL) |
| `positionMintAddress` | string | no | - | Optional: The NFT mint address of a specific position. The position address is derived from this mint. If omitted, aggregates fees from all positions owned by owner in the pool. |

### `DeFiPlugin.getClaimableMeteoraPoolFees`

```
@DeFiPlugin.getClaimableMeteoraPoolFees(source, poolAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | - | The source account to check claimable fees for - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | - | The address of the Meteora virtual pool |

### `DeFiPlugin.getCpAmmPoolAddress`

```
@DeFiPlugin.getCpAmmPoolAddress(tokenAMint, tokenBMint, configAddress) - Derives the CP-AMM pool address from token mints and config. configAddress is REQUIRED - use METEORA_DYNAMIC_POOL_CONFIG for createPool pools or METEORA_MIGRATION_CONFIG for graduated pools.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenAMint` | string | yes | - | The mint address of token A (use 'solana' or @constants.SOL for native SOL) |
| `tokenBMint` | string | yes | - | The mint address of token B (use 'solana' or @constants.SOL for native SOL) |
| `configAddress` | string | yes | - | The pool config address. Use @constants.METEORA_DYNAMIC_POOL_CONFIG (BQS7mc9ouPRb29BKMkZj3pA5yP4Yu6AKHL4MaaYG5YTG) for pools created via createPool, or @constants.METEORA_MIGRATION_CONFIG (A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck) for graduated bonding curve pools |

### `DeFiPlugin.getCpAmmPositionNftMintAddress`

```
@DeFiPlugin.getCpAmmPositionNftMintAddress(owner, poolAddress, positionId) - Derives the position NFT mint address. Use this mint address in addCpAmmLiquidity, removeCpAmmLiquidity, lockCpAmmPosition, and closeCpAmmPosition.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `owner` | string | yes | - | The owner address (wallet, escrow, or account ID) |
| `poolAddress` | string | yes | - | The address of the Meteora CP-AMM pool |
| `positionId` | string | yes | - | Unique identifier for the position (e.g., document path $positionId) |

### `DeFiPlugin.getDammV2PoolAddress`

```
@DeFiPlugin.getDammV2PoolAddress(tokenMintAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenMintAddress` | string | yes | - | The mint address of the token (same as used in createMeteoraVirtualPool) |

### `DeFiPlugin.getMeteoraSwapQuote`

```
@DeFiPlugin.getMeteoraSwapQuote(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount)
```

- Callable from: offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (not run); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenMintAddress` | string | yes | - | The mint address of the pool's base token (used to find the pool) |
| `tokenToSwapInMintAddress` | string | yes | - | The mint address of the token to swap in (use 'solana' or @TokenPlugin.SOL for native SOL) |
| `tokenAmount` | string | yes | - | The amount of token to swap in (in smallest units) |

### `DeFiPlugin.getMeteoraVirtualPoolAddress`

```
@DeFiPlugin.getMeteoraVirtualPoolAddress(tokenMintAddress, configId)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `tokenMintAddress` | string | yes | - | The mint address of the token |
| `configId` | string | yes | - | Unique identifier for the config within the app |

### `DeFiPlugin.getSwapQuote`

```
@DeFiPlugin.getSwapQuote(inputMint, outputMint, amount)
```

- Callable from: offchain rules, offchain named queries
- Returns: `string`
- Status: **unsupported** (not run); markers: NO-DEVNET-JUPITER.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `inputMint` | string | yes | - | The mint address of the input token (use 'solana' for native SOL) |
| `outputMint` | string | yes | - | The mint address of the output token (use 'solana' for native SOL) |
| `amount` | string | yes | - | The amount of input token to swap (in smallest units, e.g., lamports for SOL) |
