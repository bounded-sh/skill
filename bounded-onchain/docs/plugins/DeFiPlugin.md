<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@DeFiPlugin`

AMM pools, swaps, Meteora launches/fee claims, and cp-AMM liquidity positions.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

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

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source providing liquidity - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | no | - | The NFT mint address of the position to add liquidity to |
| `tokenAAmount` | string | yes | no | - | Amount of token A to deposit (in smallest units) |
| `tokenBAmount` | string | yes | no | - | Amount of token B to deposit (in smallest units) |
| `slippageBps` | number | no | no | - | Optional: Slippage tolerance in basis points (100 = 1%). Allows extra tokens to be spent as buffer. Default: 0 |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.claimDammV2PoolFees`

```
@DeFiPlugin.claimDammV2PoolFees(source, poolAddress, positionMintAddress?) - If positionMintAddress is provided, claims fees from only that position; otherwise claims from all positions owned by source in the pool.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source account claiming fees - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | no | - | The address of the graduated DAMM v2 pool |
| `positionMintAddress` | string | no | no | - | Optional: The NFT mint address of a specific position to claim fees from. The position address is derived from this mint. If omitted, claims from all positions owned by source in the pool. |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.claimMeteoraPoolFees`

```
@DeFiPlugin.claimMeteoraPoolFees(source, poolAddress)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source account claiming fees - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | no | - | The address of the Meteora virtual pool |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.closeCpAmmPosition`

```
@DeFiPlugin.closeCpAmmPosition(source, poolAddress, positionMintAddress) - Closes an empty Meteora CP-AMM position and recovers rent
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The owner of the position - can be wallet address, @contract.address for escrow, or account ID for PDA. Also receives rent refund. |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | no | - | The NFT mint address of the position to close (must be empty - no liquidity) |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.createCpAmmPosition`

```
@DeFiPlugin.createCpAmmPosition(owner, poolAddress, positionId) - Creates a new liquidity position (NFT) in a Meteora CP-AMM pool
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `owner` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The owner of the position - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionId` | string | yes | no | - | Unique identifier for this position (e.g., document path $positionId) |

- `owner` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.createMeteoraConfig`

```
@DeFiPlugin.createMeteoraConfig(configId, feeAccount, preMigratedFeeAmountBps, preMigratedCreatorFeePercentage, postMigratedFeeAmountBps, creatorPermanentLockedLiquidityPercentage, initialMarketCap?, migrationMarketCap?, totalTokenSupply?, tokenBaseDecimal?, leftover?, leftoverReceiver?, decayStartingFeeBps?, decayEndingFeeBps?, decayNumberOfPeriod?, decayTotalDuration?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `configId` | string | yes | no | - | Unique identifier for the config within the app |
| `feeAccount` | string | yes | no | - | The account that will receive the fees |
| `preMigratedFeeAmountBps` | number | yes | no | - | The fee amount in basis points for the pre-migrated pool |
| `preMigratedCreatorFeePercentage` | number | yes | no | - | The creator fee percentage for the pre-migrated pool |
| `postMigratedFeeAmountBps` | number | yes | no | - | The fee amount in basis points for the post-migrated pool |
| `creatorPermanentLockedLiquidityPercentage` | number | yes | no | - | Percentage (0-100) of the migrated DAMM v2 creator liquidity that is PERMANENTLY LOCKED. This is an LP-lock split, not a fee share: the remaining 100 minus this value becomes ordinary creator liquidity the creator can withdraw. It does not change who receives post-migration trading fees. The partner legs are fixed at 0 today, so the creator holds 100 percent of the migrated position either way |
| `initialMarketCap` | number | no | no | - | Optional: The initial market cap in SOL for the bonding curve. Default: 30 |
| `migrationMarketCap` | number | no | no | - | Optional: The market cap in SOL at which the pool migrates to DAMM v2. Default: 85 |
| `totalTokenSupply` | number | no | no | - | Optional: The total token supply (in base units). Default: 1000000000 |
| `tokenBaseDecimal` | number | no | no | - | Optional: The token decimal places (6 or 9). Default: 6 |
| `leftover` | number | no | no | - | Optional: The number of tokens to reserve as leftover (outside the bonding curve). These tokens are minted into the pool's base vault and can only be withdrawn by leftoverReceiver after migration to DAMM V2. Default: 0 |
| `leftoverReceiver` | string | no | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | Optional: The account that will receive leftover tokens after migration. Can be a wallet address, @contract.address for escrow, or an account id (a named app PDA; see the custody guide). Default: uses feeAccount |
| `decayStartingFeeBps` | number | no | no | - | Optional: Anti-snipe opening fee in basis points for the pre-migrated pool. When set (with decayNumberOfPeriod/decayTotalDuration), the pre-migration fee starts here and decays linearly (Meteora FeeSchedulerLinear) toward decayEndingFeeBps. Example: 5000 (50%) decaying to 300 (3%). Default: preMigratedFeeAmountBps (flat fee, no decay) |
| `decayEndingFeeBps` | number | no | no | - | Optional: The fee in basis points the pre-migration fee decays down to. Default: preMigratedFeeAmountBps |
| `decayNumberOfPeriod` | number | no | no | - | Optional: Number of linear reduction periods over which the fee decays from decayStartingFeeBps to decayEndingFeeBps. Default: 0 (flat fee, no decay) |
| `decayTotalDuration` | number | no | no | - | Optional: Total duration of the fee decay, in the pool's activation unit (slots). Default: 0 (flat fee, no decay) |

### `DeFiPlugin.createMeteoraVirtualPool`

```
@DeFiPlugin.createMeteoraVirtualPool(configId, tokenId, name, symbol, uri, initialSolBuyAmount?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `configId` | string | yes | no | - | Unique identifier for the config within the app |
| `tokenId` | string | yes | no | - | Unique identifier for the token within the app |
| `name` | string | yes | no | - | The name of the token |
| `symbol` | string | yes | no | - | The symbol of the token |
| `uri` | string | yes | no | - | The URI of the json metadata |
| `initialSolBuyAmount` | string | no | no | - | Optional: Initial SOL amount in lamports to buy tokens with (dev buy). If provided and > 0, executes a swap after pool creation. |

### `DeFiPlugin.createPool`

```
@DeFiPlugin.createPool(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, tokenBAmount, config?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF; CPAMM-SCENARIO.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `tokenMintAAddress` | string | yes | no | - | The mint address of the token A |
| `tokenMintBAddress` | string | yes | no | - | The mint address of the token B |
| `tokenAAmount` | string | yes | no | - | The amount of token A to deposit |
| `tokenBAmount` | string | yes | no | - | The amount of token B to deposit |
| `config` | object | no | no | - | Optional: Pool configuration object. If omitted, uses default config. If provided, ALL fields are REQUIRED (no partial configs). |

Fields of `config`:

| Field | Type | Required | Signs | Accepts |
|---|---|---|---|---|
| `baseFeeBps` | number | conditional | no | - |
| `numberOfPeriod` | number | conditional | no | - |
| `periodFrequency` | number | conditional | no | - |
| `reductionFactor` | number | conditional | no | - |
| `feeSchedulerMode` | string | conditional | no | - |
| `protocolFeePercent` | number | conditional | no | - |
| `referralFeePercent` | number | conditional | no | - |
| `compoundingFeeBps` | number | conditional | no | - |
| `dynamicFeeEnabled` | boolean | conditional | no | - |
| `binStep` | number | conditional | no | - |
| `filterPeriod` | number | conditional | no | - |
| `decayPeriod` | number | conditional | no | - |
| `dynamicFeeReductionFactor` | number | conditional | no | - |
| `maxVolatilityAccumulator` | number | conditional | no | - |
| `variableFeeControl` | number | conditional | no | - |
| `collectFeeMode` | string | conditional | no | - |
| `activationType` | string | conditional | no | - |
| `activationPoint` | number | conditional | no | - |
| `hasAlphaVault` | boolean | conditional | no | - |

- `sourceAddress` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.lockCpAmmPosition`

```
@DeFiPlugin.lockCpAmmPosition(source, poolAddress, positionMintAddress, periodFrequency, cliffUnlockLiquidity, liquidityPerPeriod, numberOfPeriod, cliffPoint?) - Locks liquidity in a position with vesting schedule
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source of the position - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | no | - | The NFT mint address of the position to lock |
| `periodFrequency` | number | yes | no | - | Time in seconds between unlock periods |
| `cliffUnlockLiquidity` | string | yes | no | - | Amount of liquidity unlocked at cliff (u128 as string) |
| `liquidityPerPeriod` | string | yes | no | - | Amount of liquidity unlocked per period (u128 as string) |
| `numberOfPeriod` | number | yes | no | - | Total number of vesting periods |
| `cliffPoint` | number | no | no | - | Unix timestamp when cliff unlocking begins (optional, null for immediate) |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.removeCpAmmLiquidity`

```
@DeFiPlugin.removeCpAmmLiquidity(source, poolAddress, positionMintAddress, tokenAAmount, tokenBAmount, slippageBps?) - Removes liquidity from a Meteora CP-AMM position. Pass null for both token amounts to remove all unlocked liquidity.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source removing liquidity - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionMintAddress` | string | yes | no | - | The NFT mint address of the position to remove liquidity from |
| `tokenAAmount` | string | no | no | - | Amount of token A to withdraw (in smallest units), or null to remove all |
| `tokenBAmount` | string | no | no | - | Amount of token B to withdraw (in smallest units), or null to remove all. Must match tokenAAmount: both specified or both null. |
| `slippageBps` | number | no | no | - | Optional: Slippage tolerance in basis points (100 = 1%). Allows receiving fewer tokens. Default: 0 |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.swap`

```
@DeFiPlugin.swap(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, slippageBps?)
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-DEVNET-JUPITER.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `sourceAddress` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The address of the source account, the `@contract.address` program-ID sentinel (resolved by the plugin to the app escrow PDA) or an account id (a named app PDA; see the custody guide) |
| `tokenMintAAddress` | string | yes | no | - | The mint address of the token A |
| `tokenMintBAddress` | string | yes | no | - | The mint address of the token B |
| `tokenAAmount` | string | yes | no | - | The amount of token A to swap |
| `slippageBps` | number | no | no | - | Optional: Slippage tolerance in basis points (1 bps = 0.01%). Default: 500 (5%) |

- `sourceAddress` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.swapInMeteoraVirtualPool`

```
@DeFiPlugin.swapInMeteoraVirtualPool(source, poolTokenMint, tokenMint, amount, minimumAmountOut?)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | **yes** | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source account for the swap - can be @user.address, @contract.address for escrow, or a string ID for PDA |
| `poolTokenMint` | string | yes | no | - | The mint address of the pool's base token (used to find the pool) |
| `tokenMint` | string | yes | no | - | The mint address of the token to swap in (use @TokenPlugin.SOL for native SOL) |
| `amount` | string | yes | no | - | The amount of token to swap in (in smallest units) |
| `minimumAmountOut` | string | no | no | - | Optional minimum output amount in smallest units. The swap fails if the quoted output is lower. |

- `source` signs: a wallet form requires that wallet's signature; `@contract.address` is program-signed; an account-id source is program-signed.
Never pass a resolved `getAccountAddress(...)` string where a signing account id is expected - the id string is the signing capability. See [custody and PDAs](../custody-and-pdas.md).

### `DeFiPlugin.withdrawLeftover`

```
@DeFiPlugin.withdrawLeftover(virtualPoolAddress) - Withdraws leftover tokens from a migrated Meteora virtual pool to the leftoverReceiver set in the config. Can only be called after migration.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `virtualPoolAddress` | string | yes | no | - | The address of the Meteora virtual pool |

## Read-only

### `DeFiPlugin.getClaimableCpAmmPositionFee`

```
@DeFiPlugin.getClaimableCpAmmPositionFee(owner, poolAddress, tokenMint, positionMintAddress?) - Gets the claimable fees for a specific token from a CP-AMM position. If positionMintAddress is omitted, aggregates fees from all positions owned by owner in the pool.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `uint`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `owner` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The owner of the position(s) - can be wallet address, @contract.address for escrow, or account ID for PDA |
| `poolAddress` | string | yes | no | - | The address of the CP-AMM pool |
| `tokenMint` | string | yes | no | - | The mint address of the token to get claimable fees for (use @TokenPlugin.SOL for SOL) |
| `positionMintAddress` | string | no | no | - | Optional: The NFT mint address of a specific position. The position address is derived from this mint. If omitted, aggregates fees from all positions owned by owner in the pool. |

### `DeFiPlugin.getClaimableMeteoraPoolFees`

```
@DeFiPlugin.getClaimableMeteoraPoolFees(source, poolAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `source` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The source account to check claimable fees for - can be a wallet address, program ID for PDA, or any string for PDA derivation |
| `poolAddress` | string | yes | no | - | The address of the Meteora virtual pool |

### `DeFiPlugin.getCpAmmPoolAddress`

```
@DeFiPlugin.getCpAmmPoolAddress(tokenAMint, tokenBMint, configAddress) - Derives the CP-AMM pool address from token mints and config. configAddress is REQUIRED - use METEORA_DYNAMIC_POOL_CONFIG for createPool pools or METEORA_MIGRATION_CONFIG for graduated pools.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `tokenAMint` | string | yes | no | - | The mint address of token A (use 'solana' or @constants.SOL for native SOL) |
| `tokenBMint` | string | yes | no | - | The mint address of token B (use 'solana' or @constants.SOL for native SOL) |
| `configAddress` | string | yes | no | - | The pool config address. Use @constants.METEORA_DYNAMIC_POOL_CONFIG (BQS7mc9ouPRb29BKMkZj3pA5yP4Yu6AKHL4MaaYG5YTG) for pools created via createPool, or @constants.METEORA_MIGRATION_CONFIG (A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck) for graduated bonding curve pools |

### `DeFiPlugin.getCpAmmPositionNftMintAddress`

```
@DeFiPlugin.getCpAmmPositionNftMintAddress(owner, poolAddress, positionId) - Derives the position NFT mint address. Use this mint address in addCpAmmLiquidity, removeCpAmmLiquidity, lockCpAmmPosition, and closeCpAmmPosition.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `owner` | string | yes | no | wallet address / `@contract.address` (app escrow) / account id (named PDA) | The owner address (wallet, escrow, or account ID) |
| `poolAddress` | string | yes | no | - | The address of the Meteora CP-AMM pool |
| `positionId` | string | yes | no | - | Unique identifier for the position (e.g., document path $positionId) |

### `DeFiPlugin.getDammV2PoolAddress`

```
@DeFiPlugin.getDammV2PoolAddress(tokenMintAddress)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `tokenMintAddress` | string | yes | no | - | The mint address of the token (same as used in createMeteoraVirtualPool) |

### `DeFiPlugin.getMeteoraSwapQuote`

```
@DeFiPlugin.getMeteoraSwapQuote(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount)
```

- Callable from: offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (not run); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `tokenMintAddress` | string | yes | no | - | The mint address of the pool's base token (used to find the pool) |
| `tokenToSwapInMintAddress` | string | yes | no | - | The mint address of the token to swap in (use 'solana' or @TokenPlugin.SOL for native SOL) |
| `tokenAmount` | string | yes | no | - | The amount of token to swap in (in smallest units) |

### `DeFiPlugin.getMeteoraVirtualPoolAddress`

```
@DeFiPlugin.getMeteoraVirtualPoolAddress(tokenMintAddress, configId)
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Status: **unverified** (source parity only); markers: LIVE-METEORA-PROOF.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `tokenMintAddress` | string | yes | no | - | The mint address of the token |
| `configId` | string | yes | no | - | Unique identifier for the config within the app |

### `DeFiPlugin.getSwapQuote`

```
@DeFiPlugin.getSwapQuote(inputMint, outputMint, amount)
```

- Callable from: offchain rules, offchain named queries
- Returns: `string`
- Status: **unsupported** (not run); markers: NO-DEVNET-JUPITER.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `inputMint` | string | yes | no | - | The mint address of the input token (use 'solana' for native SOL) |
| `outputMint` | string | yes | no | - | The mint address of the output token (use 'solana' for native SOL) |
| `amount` | string | yes | no | - | The amount of input token to swap (in smallest units, e.g., lamports for SOL) |
