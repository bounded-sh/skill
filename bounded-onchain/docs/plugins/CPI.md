<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@CPI`

Descriptor-bound CPI calls (memo, lamports, Kamino, DLMM, Raydium, stake pools).

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

Argument descriptions and signer markers below are copied from the existing monorepo manifest. `-` under `Signer in manifest` means undeclared, not confirmed non-signing.

## Descriptor lane

`@CPI.*` calls are descriptor-bound: the deploy binds program id, account schema, and attested instruction bytes, so policy code cannot vary the shape. They require attested transaction data, which exists only in `hooks.onchain` execution. Custody of the `source` argument varies per descriptor - `memoNote`/`transferLamports` follow the uniform three-form rule, while the Kamino family is wallet-only (the obligation owner). Most Kamino, stake-pool, Raydium and DLMM descriptors additionally carry `NEEDS-RUNTIME-V4` and are refused at deploy until that runtime ships; see [policy-primitives.md](../policy-primitives.md#descriptor-cpi-cpi).

## Transactional

Use the per-function `Callable from` line below. A `false` return or thrown error in a hook aborts the entire write.

### `CPI.dlmmSwap`

```
@CPI.dlmmSwap(source, lbPair, reserveX, reserveY, inputMint, outputMint, oracle, amountIn, minAmountOut) - swaps through a Meteora DLMM pair. `minAmountOut` is required slippage protection. The bin arrays the trade crosses are resolved automatically from a live quote. Classic SPL mints only; Token-2022 pairs are unsupported in v1.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-DLMM-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Who signs and owns the token accounts: wallet, @contract.address escrow, or named account. |
| `lbPair` | address | yes | - | The DLMM pair account. |
| `reserveX` | address | yes | - | Pair reserve for token X. |
| `reserveY` | address | yes | - | Pair reserve for token Y. |
| `inputMint` | address | yes | - | Mint being sold. |
| `outputMint` | address | yes | - | Mint being bought. |
| `oracle` | address | yes | - | The pair's oracle account. |
| `amountIn` | u64 | yes | - | Exact input amount, in base units. |
| `minAmountOut` | u64 | yes | - | Minimum output to accept; the swap fails below this. |

### `CPI.kaminoBorrow`

```
@CPI.kaminoBorrow(sourceAddress, obligationId, lendingMarket, borrowReserve, reserveLiquidityMint, reserveSourceLiquidity, borrowReserveLiquidityFeeReceiver, obligationFarmUserState, reserveFarmState, liquidityAmount) - borrows liquidityAmount (token base units) against the obligation's collateral (borrowObligationLiquidityV2); the borrowed tokens land in source's ATA (created if missing). Chain refresh prefixes for ALL open reserves in the SAME hook: @CPI.kaminoRefreshReserve(depositReserve...) && @CPI.kaminoRefreshReserve(borrowReserve...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoBorrow(...). Bind vault/fee accounts via @const from the reserve's on-chain state. No debt farm: pass the KLend program id for both farm args. Referred users (obligations carrying a referrer) are unsupported in v1.
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The borrowing wallet (obligation owner) |
| `obligationId` | number | yes | - | u8 obligation id used at init |
| `lendingMarket` | string | yes | - | Lending market address (bind via @const) |
| `borrowReserve` | string | yes | - | Borrow reserve address (bind via @const) |
| `reserveLiquidityMint` | string | yes | - | The borrow reserve's liquidity token mint |
| `reserveSourceLiquidity` | string | yes | - | The borrow reserve's liquidity supply vault (from reserve state) |
| `borrowReserveLiquidityFeeReceiver` | string | yes | - | The borrow reserve's fee receiver vault (from reserve state) |
| `obligationFarmUserState` | string | yes | - | Obligation debt-farm user state, or the KLend program id when the reserve has no debt farm |
| `reserveFarmState` | string | yes | - | Reserve debt farm state, or the KLend program id when the reserve has no debt farm |
| `liquidityAmount` | number | yes | - | Borrow amount in token base units |

### `CPI.kaminoDeposit`

```
@CPI.kaminoDeposit(sourceAddress, obligationId, lendingMarket, reserve, reserveLiquidityMint, reserveLiquiditySupply, reserveCollateralMint, reserveDestinationDepositCollateral, obligationFarmUserState, reserveFarmState, liquidityAmount) - deposits liquidityAmount (token base units) into a Kamino reserve as obligation collateral (depositReserveLiquidityAndObligationCollateralV2). Chain refresh prefixes in the SAME hook: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...). Bind the per-reserve vault accounts via @const from the reserve's on-chain state (they are NOT derivable - old and new reserves use different seed schemes). If the reserve has no collateral farm, pass the KLend program id for BOTH farm args; farmed reserves need an initialized obligation farm state (created outside this set) - v1 targets farmless reserves. The user must already hold the SPL token (wrapped SOL for the SOL reserve - no wrap step is performed). Token-2022 reserves are unsupported (token programs pinned to classic SPL).
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The depositing wallet (obligation owner) |
| `obligationId` | number | yes | - | u8 obligation id used at init |
| `lendingMarket` | string | yes | - | Lending market address (bind via @const) |
| `reserve` | string | yes | - | Deposit reserve address (bind via @const) |
| `reserveLiquidityMint` | string | yes | - | The reserve's liquidity token mint |
| `reserveLiquiditySupply` | string | yes | - | The reserve's liquidity supply vault (from reserve state) |
| `reserveCollateralMint` | string | yes | - | The reserve's collateral (cToken) mint (from reserve state) |
| `reserveDestinationDepositCollateral` | string | yes | - | The reserve's collateral supply vault (from reserve state) |
| `obligationFarmUserState` | string | yes | - | Obligation farm user state, or the KLend program id when the reserve has no collateral farm |
| `reserveFarmState` | string | yes | - | Reserve collateral farm state, or the KLend program id when the reserve has no collateral farm |
| `liquidityAmount` | number | yes | - | Deposit amount in token base units |

### `CPI.kaminoInitObligation`

```
@CPI.kaminoInitObligation(sourceAddress, obligationId, lendingMarket) - creates a VANILLA Kamino obligation (tag 0) for source on the given lending market (bind lendingMarket via @const, e.g. Main Market 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF). obligationId is a u8 (0-255) so one wallet can hold several obligations; use 0 unless you need more. Requires @CPI.kaminoInitUserMetadata to have run for source. First-deposit chain: @CPI.kaminoInitUserMetadata(...) && @CPI.kaminoInitObligation(...) && @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...).
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The obligation owner wallet |
| `obligationId` | number | yes | - | u8 obligation id (0-255); 0 for the default obligation |
| `lendingMarket` | string | yes | - | Kamino lending market address (bind via @const) |

### `CPI.kaminoInitUserMetadata`

```
@CPI.kaminoInitUserMetadata(sourceAddress, userLookupTable) - one-time Kamino Lend onboarding: creates the user_metadata PDA for source (fails if it already exists). Pass the System program id (11111111111111111111111111111111) as userLookupTable unless the user has a dedicated Kamino lookup table. Run before @CPI.kaminoInitObligation. Referrals are not supported (referrer metadata is passed as Kamino's None sentinel).
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The wallet onboarding to Kamino Lend (owner + fee payer identity) |
| `userLookupTable` | string | yes | - | User lookup table address; pass 11111111111111111111111111111111 when none exists |

### `CPI.kaminoRefreshObligation`

```
@CPI.kaminoRefreshObligation(sourceAddress, obligationId, lendingMarket) - refreshes an obligation of ANY shape. The open reserves are resolved automatically from live state, including the effect of Kamino mutations earlier in the same transaction, so the three former fixed shapes (Empty/Deposited/full) are gone. Refresh each reserve first: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...).
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `sourceAddress` | string | yes | - | The obligation owner: wallet, @contract.address escrow, or named account. |
| `obligationId` | number | yes | - | u8 obligation index for this owner/market (use 0 unless you hold several). |
| `lendingMarket` | string | yes | - | The Kamino lending market, bound via @const. |

### `CPI.kaminoRefreshReserve`

```
@CPI.kaminoRefreshReserve(sourceAddress, reserve, lendingMarket, pythOracle, switchboardPriceOracle, switchboardTwapOracle, scopePrices) - refreshes a reserve's accrued interest + oracle price; Kamino requires it in the same slot before deposit/borrow/withdraw. Chain it as a prefix, e.g. deposit hook = @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...). Bind the reserve's oracle accounts via @const from its on-chain config; for every unused oracle slot pass the KLend program id KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD (Kamino's None sentinel - most mainnet reserves price via scopePrices only). source is required by the CPI framework but unused by the instruction.
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The acting wallet (framework source; not an instruction account) |
| `reserve` | string | yes | - | Reserve address to refresh (bind via @const) |
| `lendingMarket` | string | yes | - | Lending market the reserve belongs to (bind via @const) |
| `pythOracle` | string | yes | - | Pyth price account, or the KLend program id if unused |
| `switchboardPriceOracle` | string | yes | - | Switchboard price aggregator, or the KLend program id if unused |
| `switchboardTwapOracle` | string | yes | - | Switchboard TWAP aggregator, or the KLend program id if unused |
| `scopePrices` | string | yes | - | Scope prices account (most reserves), or the KLend program id if unused |

### `CPI.kaminoRepay`

```
@CPI.kaminoRepay(sourceAddress, obligationId, lendingMarket, repayReserve, reserveLiquidityMint, reserveDestinationLiquidity, obligationFarmUserState, reserveFarmState, liquidityAmount) - repays obligation debt from source's ATA (repayObligationLiquidityV2; the V1 instruction rejects CPI callers). Pass 18446744073709551615 (u64 max) as liquidityAmount to repay the full debt. Kamino does not require refresh prefixes for repay, but a following withdraw in the same hook does: repay-and-withdraw = @CPI.kaminoRepay(...) && @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoWithdraw(...). No debt farm: pass the KLend program id for both farm args.
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The repaying wallet (obligation owner) |
| `obligationId` | number | yes | - | u8 obligation id used at init |
| `lendingMarket` | string | yes | - | Lending market address (bind via @const) |
| `repayReserve` | string | yes | - | Reserve whose debt is being repaid (bind via @const) |
| `reserveLiquidityMint` | string | yes | - | The repay reserve's liquidity token mint |
| `reserveDestinationLiquidity` | string | yes | - | The repay reserve's liquidity supply vault (from reserve state) |
| `obligationFarmUserState` | string | yes | - | Obligation debt-farm user state, or the KLend program id when the reserve has no debt farm |
| `reserveFarmState` | string | yes | - | Reserve debt farm state, or the KLend program id when the reserve has no debt farm |
| `liquidityAmount` | number | yes | - | Repay amount in token base units; u64 max repays everything |

### `CPI.kaminoWithdraw`

```
@CPI.kaminoWithdraw(sourceAddress, obligationId, lendingMarket, withdrawReserve, reserveLiquidityMint, reserveSourceCollateral, reserveCollateralMint, reserveLiquiditySupply, obligationFarmUserState, reserveFarmState, collateralAmount) - withdraws obligation collateral and redeems it for the underlying token into source's ATA (withdrawObligationCollateralAndRedeemReserveCollateralV2; the V1 instruction rejects CPI callers). collateralAmount is in COLLATERAL (cToken) units; pass 18446744073709551615 (u64 max) to withdraw everything the LTV allows. Chain refresh prefixes for ALL open reserves in the SAME hook: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoWithdraw(...). No collateral farm: pass the KLend program id for both farm args.
```

- Callable from: `hooks.onchain`
- Status: **unsupported** (not run); markers: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The withdrawing wallet (obligation owner) |
| `obligationId` | number | yes | - | u8 obligation id used at init |
| `lendingMarket` | string | yes | - | Lending market address (bind via @const) |
| `withdrawReserve` | string | yes | - | Reserve collateral is withdrawn from (bind via @const) |
| `reserveLiquidityMint` | string | yes | - | The withdraw reserve's liquidity token mint |
| `reserveSourceCollateral` | string | yes | - | The reserve's collateral supply vault (from reserve state) |
| `reserveCollateralMint` | string | yes | - | The reserve's collateral (cToken) mint (from reserve state) |
| `reserveLiquiditySupply` | string | yes | - | The reserve's liquidity supply vault (from reserve state) |
| `obligationFarmUserState` | string | yes | - | Obligation collateral-farm user state, or the KLend program id when the reserve has no collateral farm |
| `reserveFarmState` | string | yes | - | Reserve collateral farm state, or the KLend program id when the reserve has no collateral farm |
| `collateralAmount` | number | yes | - | Withdraw amount in collateral (cToken) base units; u64 max withdraws all |

### `CPI.memoNote`

```
@CPI.memoNote(sourceAddress, note) - writes `note` to the SPL Memo program, signed by source (wallet, @contract.address escrow, or named account)
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-SAFE-CPI-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The address attesting the memo: a wallet, @contract.address for the app escrow, or an account id (a named app PDA; see the custody guide) |
| `note` | string | yes | - | UTF-8 memo text recorded on-chain |

### `CPI.raydiumDeposit`

```
@CPI.raydiumDeposit(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, maximumToken0Amount, maximumToken1Amount) - mints `lpTokenAmount` LP tokens, spending at most the two maximum amounts. Both maximums are required slippage protection.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Liquidity provider: wallet, @contract.address escrow, or named account. |
| `poolState` | address | yes | - | The pool state account. |
| `token0Vault` | address | yes | - | Pool vault for token 0. |
| `token1Vault` | address | yes | - | Pool vault for token 1. |
| `vault0Mint` | address | yes | - | Mint of token 0. |
| `vault1Mint` | address | yes | - | Mint of token 1. |
| `lpMint` | address | yes | - | The pool's LP token mint. |
| `lpTokenAmount` | u64 | yes | - | LP tokens to mint. |
| `maximumToken0Amount` | u64 | yes | - | Most token 0 to spend; the deposit fails above this. |
| `maximumToken1Amount` | u64 | yes | - | Most token 1 to spend; the deposit fails above this. |

### `CPI.raydiumSwapBaseInput`

```
@CPI.raydiumSwapBaseInput(source, ammConfig, poolState, inputVault, outputVault, inputMint, outputMint, observationState, amountIn, minimumAmountOut) - swaps an exact input amount through a Raydium CPMM pool. `minimumAmountOut` is required slippage protection. Input and output token accounts are the source's ATAs for each mint; both classic SPL and Token-2022 mints work, including mixed pools.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Who signs and owns the token accounts: wallet, @contract.address escrow, or named account. |
| `ammConfig` | address | yes | - | The pool's AMM config account. |
| `poolState` | address | yes | - | The pool state account. |
| `inputVault` | address | yes | - | Pool vault holding the input mint. |
| `outputVault` | address | yes | - | Pool vault holding the output mint. |
| `inputMint` | address | yes | - | Mint being sold. |
| `outputMint` | address | yes | - | Mint being bought. |
| `observationState` | address | yes | - | The pool's oracle observation account. |
| `amountIn` | u64 | yes | - | Exact input amount, in base units. |
| `minimumAmountOut` | u64 | yes | - | Minimum output to accept; the swap fails below this. |

### `CPI.raydiumWithdraw`

```
@CPI.raydiumWithdraw(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, minimumToken0Amount, minimumToken1Amount) - burns `lpTokenAmount` LP tokens for the underlying pair. Both minimums are required slippage protection.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Liquidity provider: wallet, @contract.address escrow, or named account. |
| `poolState` | address | yes | - | The pool state account. |
| `token0Vault` | address | yes | - | Pool vault for token 0. |
| `token1Vault` | address | yes | - | Pool vault for token 1. |
| `vault0Mint` | address | yes | - | Mint of token 0. |
| `vault1Mint` | address | yes | - | Mint of token 1. |
| `lpMint` | address | yes | - | The pool's LP token mint. |
| `lpTokenAmount` | u64 | yes | - | LP tokens to burn. |
| `minimumToken0Amount` | u64 | yes | - | Least token 0 to accept; the withdraw fails below this. |
| `minimumToken1Amount` | u64 | yes | - | Least token 1 to accept; the withdraw fails below this. |

### `CPI.stakePoolDepositSol`

```
@CPI.stakePoolDepositSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, referralFeeAccount, lamports, minimumPoolTokensOut) - deposits SOL into any SPL stake pool and receives that pool's tokens. `minimumPoolTokensOut` is required slippage protection. Pools configuring a SOL deposit authority are unsupported.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Who provides the lamports: wallet, @contract.address escrow, or named account. |
| `stakePool` | address | yes | - | The stake pool account. |
| `reserveStake` | address | yes | - | The pool's reserve stake account. |
| `poolMint` | address | yes | - | The pool token mint. |
| `managerFeeAccount` | address | yes | - | Account receiving the pool's fee tokens. |
| `referralFeeAccount` | address | yes | - | Account receiving referral fee tokens. |
| `lamports` | u64 | yes | - | Lamports to deposit. |
| `minimumPoolTokensOut` | u64 | yes | - | Minimum pool tokens to accept; the transaction fails below this. |

### `CPI.stakePoolWithdrawSol`

```
@CPI.stakePoolWithdrawSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, poolTokens, minimumLamportsOut) - burns pool tokens and receives SOL from the pool's reserve. `minimumLamportsOut` is required slippage protection. Fails if the reserve lacks liquidity; pools configuring a SOL withdraw authority are unsupported.
```

- Callable from: `hooks.onchain`
- Status: **unverified** (not run); markers: LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | address | yes | - | Who burns the pool tokens and receives lamports. |
| `stakePool` | address | yes | - | The stake pool account. |
| `reserveStake` | address | yes | - | The pool's reserve stake account. |
| `poolMint` | address | yes | - | The pool token mint. |
| `managerFeeAccount` | address | yes | - | Account receiving the pool's fee tokens. |
| `poolTokens` | u64 | yes | - | Pool tokens to burn. |
| `minimumLamportsOut` | u64 | yes | - | Minimum lamports to accept; the transaction fails below this. |

### `CPI.transferLamports`

```
@CPI.transferLamports(sourceAddress, recipientAddress, lamports) - System-program transfer of raw lamports
```

- Callable from: `hooks.onchain`
- Status: **unverified** (source parity only); markers: LIVE-SAFE-CPI-PROOF.

| Arg | Type | Required | Signer in manifest | Description |
|---|---|---|---|---|
| `source` | string | yes | **yes** | The address lamports leave from: a wallet, @contract.address for the app escrow, or an account id (a named app PDA; see the custody guide) |
| `recipient` | string | yes | - | The address receiving the lamports |
| `lamports` | number | yes | - | Amount in lamports (1 SOL = 1_000_000_000) |
