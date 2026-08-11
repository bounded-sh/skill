<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# Plugin catalog

Every policy-callable plugin function, one screen. Open a namespace page only when you need argument contracts; open [solana-capability-status.md](solana-capability-status.md) for the live support state of anything you plan to ship.

Custody rule for every `source`/`owner`/`creator`/destination argument: a wallet address means that wallet signs, `@contract.address` means the shared app escrow (program-signed), and any non-pubkey string is an account id resolved to a named app PDA (program-signed). Details: [custody and PDAs](custody-and-pdas.md).

| Namespace | Role | Functions | Detail |
|---|---|---|---|
| `@AccountPlugin` | Named app PDAs (per-entity escrow/vault accounts) - create them and read their addresses. | 1 transactional, 1 read-only | [reference](plugins/AccountPlugin.md) |
| `@App` | Cross-app Document reads and writes from onchain policy. | 1 transactional, 1 read-only | [reference](plugins/App.md) |
| `@BondingCurvePlugin` | Pure constant-product bonding-curve math (quotes only, no mutation). | 0 transactional, 6 read-only | [reference](plugins/BondingCurvePlugin.md) |
| `@Bytes` | Borsh-style byte building and reading for raw instruction data. | 0 transactional, 20 read-only | [reference](plugins/Bytes.md) |
| `@CPI` | Descriptor-bound CPI calls (memo, lamports, Kamino, DLMM, Raydium, stake pools). | 16 transactional, 0 read-only | [reference](plugins/CPI.md) |
| `@DeFiPlugin` | AMM pools, swaps, Meteora launches/fee claims, and cp-AMM liquidity positions. | 13 transactional, 8 read-only | [reference](plugins/DeFiPlugin.md) |
| `@DflowPlugin` | DFlow prediction-market orders and KYC status. | 1 transactional, 1 read-only | [reference](plugins/DflowPlugin.md) |
| `@DocumentPlugin` | Staged document writes from hooks (the only plugin usable in offchain hooks). | 2 transactional, 0 read-only | [reference](plugins/DocumentPlugin.md) |
| `@MathPlugin` | Overflow-safe mulDiv helpers for rule arithmetic. | 0 transactional, 2 read-only | [reference](plugins/MathPlugin.md) |
| `@NFTPlugin` | Metaplex Core NFTs: collections, mints, transfers, burns, royalties. | 6 transactional, 4 read-only | [reference](plugins/NFTPlugin.md) |
| `@OraclePlugin` | ORAO verifiable randomness (request + reveal reads). | 1 transactional, 2 read-only | [reference](plugins/OraclePlugin.md) |
| `@PhoenixPerpsPlugin` | Phoenix leveraged perps: registration, collateral, positions. | 11 transactional, 7 read-only | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PredictionMarketPlugin` | Pure AMM/LSMR prediction-market math (quotes only, no mutation). | 0 transactional, 7 read-only | [reference](plugins/PredictionMarketPlugin.md) |
| `@PriceFeedPlugin` | Pyth price reads by 64-hex feed id. | 0 transactional, 1 read-only | [reference](plugins/PriceFeedPlugin.md) |
| `@PumpFunPlugin` | Pump.fun token launches, buys, creator fees, and PumpSwap liquidity. | 10 transactional, 2 read-only | [reference](plugins/PumpFunPlugin.md) |
| `@Solana` | Extended Solana primitives: account reads, PDAs/ATAs, named signers, raw invoke. | 2 transactional, 8 read-only | [reference](plugins/Solana.md) |
| `@StringUtils` | String helpers usable in rules. | 0 transactional, 1 read-only | [reference](plugins/StringUtils.md) |
| `@TensorPlugin` | Tensor NFT marketplace buys and listings. | 2 transactional, 0 read-only | [reference](plugins/TensorPlugin.md) |
| `@TokenPlugin` | SPL and Token-2022 tokens: transfers, mints, burns, balances, supply. | 7 transactional, 5 read-only | [reference](plugins/TokenPlugin.md) |

## `@AccountPlugin`

```
@AccountPlugin.createAccount(accountId)
@AccountPlugin.getAccountAddress(accountId)
```

## `@App`

```
@App.set(appId, path, data) - Cross-app write. Evaluates the target app's create/update rule with the current user and enforces its field maps. Fails closed for target hooks, target onchain invariants, or nested write effects until those transitions can be enforced atomically. Rent is funded by the calling app's escrow.
@App.get(appId, path) - Reads another app's document (or null if missing). Read-only; the document PDA is derived with the TARGET app id.
```

## `@BondingCurvePlugin`

```
@BondingCurvePlugin.getMarketCapInSol(supply, virtualSolReserves, virtualTokenReserves)
@BondingCurvePlugin.getMaxSolInProduct(virtualSolReserves, virtualTokenReserves, actualTokenReserves)
@BondingCurvePlugin.getMaxTokensInProduct(virtualSolReserves, virtualTokenReserves, actualSolReserves)
@BondingCurvePlugin.getSolOutProduct(tokenAmount, virtualSolReserves, virtualTokenReserves, actualSolReserves)
@BondingCurvePlugin.getTokensInProduct(solAmountOut, virtualSolReserves, virtualTokenReserves, actualSolReserves)
@BondingCurvePlugin.getTokensOutProduct(solAmount, virtualSolReserves, virtualTokenReserves, actualTokenReserves)
```

## `@Bytes`

```
@Bytes.anchorDiscriminator(namespace, name) - sha256(namespace + ':' + name)[..8], e.g. @Bytes.anchorDiscriminator('global', 'increment') for an Anchor instruction discriminator.
@Bytes.bool(b) - Encodes b as 1 byte (0 or 1).
@Bytes.concat(a, b, ...) - Concatenates Bytes values (variadic).
@Bytes.i64(n) - Encodes n as 8 bytes little-endian two's complement (range-checked).
@Bytes.i64At(bytes, offset) - Reads a little-endian i64 (two's complement) at offset (bounds-checked).
@Bytes.len(bytes) - Returns the byte length of a Bytes value.
@Bytes.pubkey(addr) - Encodes an address as its raw 32 bytes.
@Bytes.pubkeyAt(bytes, offset) - Reads a 32-byte pubkey at offset and returns it as an address (bounds-checked).
@Bytes.raw(hexString) - Hex string to Bytes (e.g. @Bytes.raw('deadbeef')); constant-folded to a Bytes literal when the argument is a string literal.
@Bytes.str(s) - Borsh string encoding: u32 LE length prefix + utf8 bytes.
@Bytes.u128(n) - Encodes n as 16 bytes little-endian (input is a u64-range policy number).
@Bytes.u16(n) - Encodes n as 2 bytes little-endian (range-checked).
@Bytes.u16At(bytes, offset) - Reads a little-endian u16 at offset (bounds-checked).
@Bytes.u32(n) - Encodes n as 4 bytes little-endian (range-checked).
@Bytes.u32At(bytes, offset) - Reads a little-endian u32 at offset (bounds-checked).
@Bytes.u64(n) - Encodes n as 8 bytes little-endian (range-checked).
@Bytes.u64At(bytes, offset) - Reads a little-endian u64 at offset (bounds-checked). Combined with @Solana.data this reads any field of any account whose layout you know.
@Bytes.u8(n) - Encodes n as 1 byte (range-checked 0..255).
@Bytes.u8At(bytes, offset) - Reads a u8 at offset (bounds-checked).
@Bytes.utf8(s) - Bare utf8 bytes (no length prefix).
```

## `@CPI`

```
@CPI.dlmmSwap(source, lbPair, reserveX, reserveY, inputMint, outputMint, oracle, amountIn, minAmountOut) - swaps through a Meteora DLMM pair. `minAmountOut` is required slippage protection. The bin arrays the trade crosses are resolved automatically from a live quote. Classic SPL mints only; Token-2022 pairs are unsupported in v1.   # unsupported: LIVE-DLMM-PROOF, NEEDS-RUNTIME-V4
@CPI.kaminoBorrow(sourceAddress, obligationId, lendingMarket, borrowReserve, reserveLiquidityMint, reserveSourceLiquidity, borrowReserveLiquidityFeeReceiver, obligationFarmUserState, reserveFarmState, liquidityAmount) - borrows liquidityAmount (token base units) against the obligation's collateral (borrowObligationLiquidityV2); the borrowed tokens land in source's ATA (created if missing). Chain refresh prefixes for ALL open reserves in the SAME hook: @CPI.kaminoRefreshReserve(depositReserve...) && @CPI.kaminoRefreshReserve(borrowReserve...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoBorrow(...). Bind vault/fee accounts via @const from the reserve's on-chain state. No debt farm: pass the KLend program id for both farm args. Referred users (obligations carrying a referrer) are unsupported in v1.   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4
@CPI.kaminoDeposit(sourceAddress, obligationId, lendingMarket, reserve, reserveLiquidityMint, reserveLiquiditySupply, reserveCollateralMint, reserveDestinationDepositCollateral, obligationFarmUserState, reserveFarmState, liquidityAmount) - deposits liquidityAmount (token base units) into a Kamino reserve as obligation collateral (depositReserveLiquidityAndObligationCollateralV2). Chain refresh prefixes in the SAME hook: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...). Bind the per-reserve vault accounts via @const from the reserve's on-chain state (they are NOT derivable - old and new reserves use different seed schemes). If the reserve has no collateral farm, pass the KLend program id for BOTH farm args; farmed reserves need an initialized obligation farm state (created outside this set) - v1 targets farmless reserves. The user must already hold the SPL token (wrapped SOL for the SOL reserve - no wrap step is performed). Token-2022 reserves are unsupported (token programs pinned to classic SPL).   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4
@CPI.kaminoInitObligation(sourceAddress, obligationId, lendingMarket) - creates a VANILLA Kamino obligation (tag 0) for source on the given lending market (bind lendingMarket via @const, e.g. Main Market 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF). obligationId is a u8 (0-255) so one wallet can hold several obligations; use 0 unless you need more. Requires @CPI.kaminoInitUserMetadata to have run for source. First-deposit chain: @CPI.kaminoInitUserMetadata(...) && @CPI.kaminoInitObligation(...) && @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...).   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET
@CPI.kaminoInitUserMetadata(sourceAddress, userLookupTable) - one-time Kamino Lend onboarding: creates the user_metadata PDA for source (fails if it already exists). Pass the System program id (11111111111111111111111111111111) as userLookupTable unless the user has a dedicated Kamino lookup table. Run before @CPI.kaminoInitObligation. Referrals are not supported (referrer metadata is passed as Kamino's None sentinel).   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET
@CPI.kaminoRefreshObligation(sourceAddress, obligationId, lendingMarket) - refreshes an obligation of ANY shape. The open reserves are resolved automatically from live state, including the effect of Kamino mutations earlier in the same transaction, so the three former fixed shapes (Empty/Deposited/full) are gone. Refresh each reserve first: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...).   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET
@CPI.kaminoRefreshReserve(sourceAddress, reserve, lendingMarket, pythOracle, switchboardPriceOracle, switchboardTwapOracle, scopePrices) - refreshes a reserve's accrued interest + oracle price; Kamino requires it in the same slot before deposit/borrow/withdraw. Chain it as a prefix, e.g. deposit hook = @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoDeposit(...). Bind the reserve's oracle accounts via @const from its on-chain config; for every unused oracle slot pass the KLend program id KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD (Kamino's None sentinel - most mainnet reserves price via scopePrices only). source is required by the CPI framework but unused by the instruction.   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4
@CPI.kaminoRepay(sourceAddress, obligationId, lendingMarket, repayReserve, reserveLiquidityMint, reserveDestinationLiquidity, obligationFarmUserState, reserveFarmState, liquidityAmount) - repays obligation debt from source's ATA (repayObligationLiquidityV2; the V1 instruction rejects CPI callers). Pass 18446744073709551615 (u64 max) as liquidityAmount to repay the full debt. Kamino does not require refresh prefixes for repay, but a following withdraw in the same hook does: repay-and-withdraw = @CPI.kaminoRepay(...) && @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoWithdraw(...). No debt farm: pass the KLend program id for both farm args.   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4
@CPI.kaminoWithdraw(sourceAddress, obligationId, lendingMarket, withdrawReserve, reserveLiquidityMint, reserveSourceCollateral, reserveCollateralMint, reserveLiquiditySupply, obligationFarmUserState, reserveFarmState, collateralAmount) - withdraws obligation collateral and redeems it for the underlying token into source's ATA (withdrawObligationCollateralAndRedeemReserveCollateralV2; the V1 instruction rejects CPI callers). collateralAmount is in COLLATERAL (cToken) units; pass 18446744073709551615 (u64 max) to withdraw everything the LTV allows. Chain refresh prefixes for ALL open reserves in the SAME hook: @CPI.kaminoRefreshReserve(...) && @CPI.kaminoRefreshObligation(...) && @CPI.kaminoWithdraw(...). No collateral farm: pass the KLend program id for both farm args.   # unsupported: NO-USABLE-DEVNET-KAMINO-MARKET, NEEDS-RUNTIME-V4
@CPI.memoNote(sourceAddress, note) - writes `note` to the SPL Memo program, signed by source (wallet, @contract.address escrow, or named account)
@CPI.raydiumDeposit(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, maximumToken0Amount, maximumToken1Amount) - mints `lpTokenAmount` LP tokens, spending at most the two maximum amounts. Both maximums are required slippage protection.   # unsupported: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4
@CPI.raydiumSwapBaseInput(source, ammConfig, poolState, inputVault, outputVault, inputMint, outputMint, observationState, amountIn, minimumAmountOut) - swaps an exact input amount through a Raydium CPMM pool. `minimumAmountOut` is required slippage protection. Input and output token accounts are the source's ATAs for each mint; both classic SPL and Token-2022 mints work, including mixed pools.   # unsupported: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4
@CPI.raydiumWithdraw(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, minimumToken0Amount, minimumToken1Amount) - burns `lpTokenAmount` LP tokens for the underlying pair. Both minimums are required slippage protection.   # unsupported: LIVE-RAYDIUM-PROOF, NEEDS-RUNTIME-V4
@CPI.stakePoolDepositSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, referralFeeAccount, lamports, minimumPoolTokensOut) - deposits SOL into any SPL stake pool and receives that pool's tokens. `minimumPoolTokensOut` is required slippage protection. Pools configuring a SOL deposit authority are unsupported.   # unsupported: LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4
@CPI.stakePoolWithdrawSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, poolTokens, minimumLamportsOut) - burns pool tokens and receives SOL from the pool's reserve. `minimumLamportsOut` is required slippage protection. Fails if the reserve lacks liquidity; pools configuring a SOL withdraw authority are unsupported.   # unsupported: LIVE-STAKEPOOL-PROOF, NEEDS-RUNTIME-V4
@CPI.transferLamports(sourceAddress, recipientAddress, lamports) - System-program transfer of raw lamports
```

## `@DeFiPlugin`

```
@DeFiPlugin.addCpAmmLiquidity(source, poolAddress, positionMintAddress, tokenAAmount, tokenBAmount, slippageBps?) - Adds liquidity to a Meteora CP-AMM position
@DeFiPlugin.claimDammV2PoolFees(source, poolAddress, positionMintAddress?) - If positionMintAddress is provided, claims fees from only that position; otherwise claims from all positions owned by source in the pool.
@DeFiPlugin.claimMeteoraPoolFees(source, poolAddress)
@DeFiPlugin.closeCpAmmPosition(source, poolAddress, positionMintAddress) - Closes an empty Meteora CP-AMM position and recovers rent
@DeFiPlugin.createCpAmmPosition(owner, poolAddress, positionId) - Creates a new liquidity position (NFT) in a Meteora CP-AMM pool
@DeFiPlugin.createMeteoraConfig(configId, feeAccount, preMigratedFeeAmountBps, preMigratedCreatorFeePercentage, postMigratedFeeAmountBps, creatorPermanentLockedLiquidityPercentage, initialMarketCap?, migrationMarketCap?, totalTokenSupply?, tokenBaseDecimal?, leftover?, leftoverReceiver?, decayStartingFeeBps?, decayEndingFeeBps?, decayNumberOfPeriod?, decayTotalDuration?)
@DeFiPlugin.createMeteoraVirtualPool(configId, tokenId, name, symbol, uri, initialSolBuyAmount?)
@DeFiPlugin.createPool(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, tokenBAmount, config?)
@DeFiPlugin.lockCpAmmPosition(source, poolAddress, positionMintAddress, periodFrequency, cliffUnlockLiquidity, liquidityPerPeriod, numberOfPeriod, cliffPoint?) - Locks liquidity in a position with vesting schedule
@DeFiPlugin.removeCpAmmLiquidity(source, poolAddress, positionMintAddress, tokenAAmount, tokenBAmount, slippageBps?) - Removes liquidity from a Meteora CP-AMM position. Pass null for both token amounts to remove all unlocked liquidity.
@DeFiPlugin.swap(sourceAddress, tokenMintAAddress, tokenMintBAddress, tokenAAmount, slippageBps?)   # unsupported: NO-DEVNET-JUPITER
@DeFiPlugin.swapInMeteoraVirtualPool(source, poolTokenMint, tokenMint, amount, minimumAmountOut?)
@DeFiPlugin.withdrawLeftover(virtualPoolAddress) - Withdraws leftover tokens from a migrated Meteora virtual pool to the leftoverReceiver set in the config. Can only be called after migration.
@DeFiPlugin.getClaimableCpAmmPositionFee(owner, poolAddress, tokenMint, positionMintAddress?) - Gets the claimable fees for a specific token from a CP-AMM position. If positionMintAddress is omitted, aggregates fees from all positions owned by owner in the pool.
@DeFiPlugin.getClaimableMeteoraPoolFees(source, poolAddress)
@DeFiPlugin.getCpAmmPoolAddress(tokenAMint, tokenBMint, configAddress) - Derives the CP-AMM pool address from token mints and config. configAddress is REQUIRED - use METEORA_DYNAMIC_POOL_CONFIG for createPool pools or METEORA_MIGRATION_CONFIG for graduated pools.
@DeFiPlugin.getCpAmmPositionNftMintAddress(owner, poolAddress, positionId) - Derives the position NFT mint address. Use this mint address in addCpAmmLiquidity, removeCpAmmLiquidity, lockCpAmmPosition, and closeCpAmmPosition.
@DeFiPlugin.getDammV2PoolAddress(tokenMintAddress)
@DeFiPlugin.getMeteoraSwapQuote(tokenMintAddress, tokenToSwapInMintAddress, tokenAmount)
@DeFiPlugin.getMeteoraVirtualPoolAddress(tokenMintAddress, configId)
@DeFiPlugin.getSwapQuote(inputMint, outputMint, amount)   # unsupported: NO-DEVNET-JUPITER
```

## `@DflowPlugin`

```
@DflowPlugin.openPredictionMarketOrder(source, inputMint, outputMint, amount, slippageBps?)   # unsupported: NO-DEVNET-DFLOW
@DflowPlugin.getKycStatus(address) - Check KYC verification status for a wallet address   # unsupported: NO-DEVNET-DFLOW
```

## `@DocumentPlugin`

```
@DocumentPlugin.putDocument(path, data) - creates or replaces the document at `path`. Offchain hooks only.   # unsupported: OFFCHAIN-ONLY
@DocumentPlugin.updateField(path, field, value)
```

## `@MathPlugin`

```
@MathPlugin.mulDivCeil(value, multiplier, divisor) - Computes ceil(value * multiplier / divisor) with full precision intermediate product
@MathPlugin.mulDivFloor(value, multiplier, divisor) - Computes floor(value * multiplier / divisor) with full precision intermediate product
```

## `@NFTPlugin`

```
@NFTPlugin.burn(sourceAddress, mintAddress, collectionAddress?)
@NFTPlugin.createCollection(collectionId, name, metadataUri)
@NFTPlugin.mintNFT(nftId, name, metadataUri, destinationAddress, collectionAddress?)
@NFTPlugin.transfer(sourceAddress, destinationAddress, mintAddress, collectionAddress)
@NFTPlugin.updateCollectionRoyalties(collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on a collection. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
@NFTPlugin.updateRoyalties(nftAddress, collectionAddress, updateAuthority, basisPoints, creators?) - Update the royalties plugin on an NFT. If creators is omitted or null, existing on-chain creators are preserved and only basisPoints changes. SECURITY: When updateAuthority is a Bounded-signed PDA (@contract.address, an @AccountPlugin account, or the collection's Bounded PDA), Bounded signs via invoke_signed - you MUST gate the policy path with `rules` (e.g. rules.create: '@user.address == <admin>') to prevent unauthorized callers. Wallet authorities are natively enforced by Metaplex Core.
@NFTPlugin.getCollectionMintAddress(collectionId, name)
@NFTPlugin.getOwner(nftAddress) - Returns the current on-chain owner of a Metaplex Core NFT asset. Only valid for asset addresses (not collections - collections have no owner). For Bounded-held NFTs the return value is the raw escrow PDA (e.g. @contract.address or an @AccountPlugin account PDA); callers should compare against the expected address explicitly. Errors on-chain for collections or unknown accounts; returns null in offchain simulation when the asset is unknown.
@NFTPlugin.getTokenMintAddress(nftId, name)
@NFTPlugin.getUpdateAuthority(nftOrCollectionAddress) - Returns the actual on-chain update authority of an NFT or collection. For NFTs that inherit from their collection (UpdateAuthority::Collection), recursively resolves to the collection's on-chain authority. For Bounded-managed assets, returns the Bounded collection-authority PDA. For externally-managed assets, returns the wallet or account that owns the authority.
```

## `@OraclePlugin`

```
@OraclePlugin.requestRandomness(uniqueId, revealPath)
@OraclePlugin.getRandomNumber(uniqueId, lowerBound, upperBound)
@OraclePlugin.getVRFAddress(randomId)
```

## `@PhoenixPerpsPlugin`

```
@PhoenixPerpsPlugin.closePosition(source, market, sizeBaseLots, side, subaccountIndex?) - Closes an existing position via a ReduceOnly market order. side: 0=Bid (close short), 1=Ask (close long). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.depositFunds(source, amount, subaccountIndex?) - Deposits Phoenix tokens into the protocol as margin/collateral. subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.emberDeposit(source, usdcAmount) - Converts USDC to Phoenix tokens via the Ember bridge.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.emberWithdraw(source, amount?) - Converts Phoenix tokens back to USDC via the Ember bridge. If amount is omitted, withdraws all.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.placeLong(source, market, sizeBaseLots, subaccountIndex?) - Opens a long position via a market buy order (ImmediateOrCancel, Side::Bid). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.placeShort(source, market, sizeBaseLots, subaccountIndex?) - Opens a short position via a market sell order (ImmediateOrCancel, Side::Ask). subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.registerTrader(source, subaccountIndex?) - Registers a new trader account on Phoenix Perps. subaccountIndex 0 (default) = cross-margin (128 positions), 1-100 = isolated margin (1 position each).   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.syncParentToChild(source, subaccountIndex) - Activates an isolated subaccount by copying the cross subaccount's capability flags (notably DepositCollateral) into it. Must be called once between registerTrader and the first transferToIsolated for a given subaccount, otherwise Phoenix rejects transfer_collateral with CapabilityDenied. Idempotent on subsequent calls.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.transferToCross(source, subaccountIndex) - Sweeps ALL residual collateral + PnL from an isolated subaccount [0,N] back to the cross subaccount [0,0]. No amount field - Phoenix's transfer_collateral_child_to_parent ix always moves the full balance. subaccountIndex must be 1-100.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.transferToIsolated(source, amount, subaccountIndex) - Moves collateral from the cross subaccount [0,0] into an isolated subaccount [0,N]. This is the only way to activate an isolated subaccount; direct depositFunds against a frozen isolated PDA is rejected by Phoenix with CapabilityDenied. subaccountIndex must be 1-100. Requires cross subaccount to hold at least `amount` collateral.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.withdrawFunds(source, amount, subaccountIndex?) - Withdraws Phoenix tokens from protocol margin back to trader's token account. subaccountIndex 0 (default) = cross-margin, 1-100 = isolated margin subaccount.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.getCollateralBalance(source, subaccountIndex?) - Returns the trader's deposited collateral in PhUSD base units (6 decimals). 0 if not registered.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.getMarkPrice(market) - Returns the mark price for a Phoenix perp market, in PhUSD base units (6 decimals). Sourced from a reference trader's live position data.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.getPortfolioValue(source, subaccountIndex?) - Returns mark-to-market portfolio value including unrealized PnL, in PhUSD base units (6 decimals).   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.getPositionSize(source, market, subaccountIndex?) - Returns signed position size in base lots for the given market. Positive for long, negative for short, 0 if no position.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.getUnrealizedPnl(source, subaccountIndex?) - Returns signed unrealized PnL in PhUSD base units (6 decimals). Negative when underwater.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.hasPosition(source, market, subaccountIndex?) - Returns true if the trader has a non-zero position in the given market.   # unsupported: NO-DEVNET-PHOENIX
@PhoenixPerpsPlugin.isRegistered(source, subaccountIndex?) - Returns true if the trader PDA has been registered on Phoenix for this subaccount (default 0).   # unsupported: NO-DEVNET-PHOENIX
```

## `@PredictionMarketPlugin`

```
@PredictionMarketPlugin.applyFee(amount, feeBps)
@PredictionMarketPlugin.getCollateralOutAmm(yesIn, collateralReserve, yesSupply)
@PredictionMarketPlugin.getNoCollateralOutLsmr(noIn, yesSupply, noSupply, b)
@PredictionMarketPlugin.getNoTokensOutLsmr(amountIn, yesSupply, noSupply, b)
@PredictionMarketPlugin.getYesCollateralOutLsmr(yesIn, yesSupply, noSupply, b)
@PredictionMarketPlugin.getYesTokenOutAmm(amountIn, collateralReserve, yesSupply)
@PredictionMarketPlugin.getYesTokensOutLsmr(amountIn, yesSupply, noSupply, b)
```

## `@PriceFeedPlugin`

```
@PriceFeedPlugin.getPriceFeed(baseFeedId, quoteFeedId?) - pass a @PriceFeedPlugin.<SYMBOL> variable or a 64-character Pyth feed id, e.g., getPriceFeed(@PriceFeedPlugin.SOL) or getPriceFeed(@PriceFeedPlugin.SOL, @PriceFeedPlugin.BTC). A plain symbol string like 'SOL' is not a feed id and is rejected.
```

## `@PumpFunPlugin`

```
@PumpFunPlugin.buyExactSolIn(source, mint, solAmount, slippageBps) - Buy tokens with exact SOL amount
@PumpFunPlugin.collectCreatorFee(creator) - Collect accumulated creator fees from vault to creator wallet (permissionless)
@PumpFunPlugin.createFeeSharingConfig(source, mint) - Create fee sharing config for a token (source pays rent and becomes admin)
@PumpFunPlugin.createToken(tokenId, name, symbol, uri, creator, {seedMode: "idOnly"}) - Creates a new token on pump.fun with bonding curve. Optional config with seedMode: "idOnly" derives mint PDA from appId+tokenId only (enables vanity addresses).
@PumpFunPlugin.createTokenV2(tokenId, name, symbol, uri, creator, isMayhemMode, {seedMode: "idOnly"}) - Creates a Token-2022 (SPL-22) token on pump.fun with optional mayhem mode and optional config.
@PumpFunPlugin.distributeCreatorFees(mint) - Distribute creator fees to shareholders (permissionless)
@PumpFunPlugin.pumpswapDeposit(source, mint, lpTokenAmountOut, maxBaseAmountIn, maxQuoteAmountIn) - Deposit liquidity into a PumpSwap AMM pool. Mints LP tokens in exchange for base (token) and quote (SOL) deposits.
@PumpFunPlugin.pumpswapWithdraw(source, mint, lpTokenAmountIn, minBaseAmountOut, minQuoteAmountOut) - Withdraw liquidity from a PumpSwap AMM pool. Burns LP tokens and returns proportional base (token) and quote (SOL).
@PumpFunPlugin.transferCreatorFeesToPump(mint) - Transfer AMM creator fees to pump creator vault (permissionless, for graduated tokens)
@PumpFunPlugin.updateShareholders(source, mint, [{addr: @wallet1, bps: 5000}, ...]) - Set all shareholders atomically
@PumpFunPlugin.getBondingCurveProgress(tokenAddress)
@PumpFunPlugin.getCreatorFee(mint) - Get accumulated native SOL creator fees from bonding curve vault. Automatically resolves the correct vault from bonding curve creator (handles pre/post fee-sharing migration).
```

## `@Solana`

```
@Solana.createAccount(name, space, ownerProgramId) - Creates the app-scoped named PDA (Bounded_pda(appId, name)) as a fresh account with `space` bytes owned by ownerProgramId; rent-exempt minimum is funded by the app escrow.
@Solana.invoke(programId, metas, data) - Generic CPI to an arbitrary executable program. metas is an array of {address, writable?, signer?, signerName?} objects in callee order; signer:true is allowed only for the current user and signerName elevates only app-derived PDAs. data is Bytes built on-chain via @Bytes.*. programId must be a literal or @Solana well-known constant; Bounded, loaders, and signature precompiles are denied.
@Solana.account(addr) - Returns {lamports, owner, executable, dataLen} for the account, or null if the account is absent/empty (composes with the `!= null` idiom).
@Solana.ata(owner, mint) - Returns the associated token account address for owner + mint.
@Solana.data(addr, offset, len) - Returns a raw slice of the account's data as Bytes; errors if the slice is out of range. Combine with @Bytes.u64At/pubkeyAt/... to read any field of any account whose layout you know.
@Solana.lamports(addr) - Returns the account's lamport balance (0 if the account is missing).
@Solana.pda(seedsArray, programId) - find_program_address over the seeds for programId. Seed elements: string (utf8, max 32 bytes), address (32 bytes), bytes (raw, max 32), non-negative number (8-byte LE u64); max 16 seeds.
@Solana.pdaBump(seedsArray, programId) - Returns the bump of the same derivation as @Solana.pda(seedsArray, programId).
@Solana.rentExemption(space) - Returns the rent-exempt minimum lamports for an account with `space` data bytes (useful for budgeting checks before @Solana.createAccount).
@Solana.signerAccount(name) - Returns the app-scoped named PDA (Bounded_pda(appId, name)); usable as a signerName-elevated meta in @Solana.invoke and as the account created by @Solana.createAccount.
```

## `@StringUtils`

```
@StringUtils.length(str)
```

## `@TensorPlugin`

```
@TensorPlugin.buyNft(assetAddress, maxAmount)
@TensorPlugin.listNft(assetAddress, amount?, expireInSec?, currency?, privateTaker?, makerBroker?)
```

## `@TokenPlugin`

```
@TokenPlugin.burn(sourceAddress, mintAddress, amount)
@TokenPlugin.createToken(tokenId, name, symbol, uri, decimals)
@TokenPlugin.createToken2022(tokenId, name, symbol, uri, decimals, extensions?) - Creates a Token2022 token with optional extensions object. Extension fields: nonTransferable (true|false), feeBasisPoints (0-65535), maxFee (required if feeBasisPoints > 0), transferFeeAuthority (REQUIRED if feeBasisPoints > 0), interestRate (i16), interestRateAuthority (REQUIRED if interestRate is set), permanentDelegate (address). All address fields support: wallet addresses, @contract.address for escrow, or account IDs.
@TokenPlugin.mint(tokenId, name, symbol, destinationAddress, amount)
@TokenPlugin.transfer(sourceAddress, destinationAddress, mintAddress, amount)
@TokenPlugin.transferWholeTokens(sourceAddress, destinationAddress, mintAddress, amount)
@TokenPlugin.withdrawWithheldTokens(mintAddress, withdrawAuthority, feeReceiverOwner, sourceOwner) - Withdraws withheld transfer fees from a source token account to a fee receiver. Use @TokenPlugin.getTokenMintAddress(tokenId, name, symbol) to get mintAddress. Use @TokenPlugin.getWithdrawWithheldAuthority(mintAddress) to get the withdrawAuthority.
@TokenPlugin.getBalance(walletAddress, mintAddress)
@TokenPlugin.getDecimals(mintAddress)
@TokenPlugin.getSupply(mintAddress)
@TokenPlugin.getTokenMintAddress(tokenId) for id-only mode, or @TokenPlugin.getTokenMintAddress(tokenId, name, symbol) for legacy mode
@TokenPlugin.getWithdrawWithheldAuthority(mintAddress) - Returns the withdraw withheld authority from a Token2022 mint's TransferFeeConfig extension.
```

## Capability-only entries

Rows in the capability table with no callable manifest function today (disabled, runtime-gated, or core language forms):

| Entry | Support | Markers |
|---|---|---|
| `@Bytes.keccak256` | unsupported | NEEDS-RUNTIME-V4 |
| `@Bytes.sha256` | unsupported | NEEDS-RUNTIME-V4 |
| `@Solana.invokeAttested` | unsupported | DISABLED |
| `@Solana.secp256k1Recover` | unsupported | NEEDS-RUNTIME-V4 |
| `@Solana.slot` | unverified | LIVE-PENDING |
| `@Solana.verifyEd25519` | unsupported | NEEDS-RUNTIME-V4 |
| `get` | unverified | LIVE-PENDING |
| `getAfter` | unverified | LIVE-PENDING |
