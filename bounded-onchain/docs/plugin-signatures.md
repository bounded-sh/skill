<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# Complete plugin signatures

Every callable signature in one optional scan. Use the linked namespace page for manifest argument descriptions and existing signer markers; use the [compact plugin router](plugins.md) when you already know the namespace.

| Function | Bare signature | Callable from | Detail |
|---|---|---|---|
| `@AccountPlugin.createAccount` | `createAccount(accountId)` | `hooks.onchain` | [reference](plugins/AccountPlugin.md) |
| `@AccountPlugin.getAccountAddress` | `getAccountAddress(accountId)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/AccountPlugin.md) |
| `@App.set` | `set(string, string, object)` | `hooks.onchain` | [reference](plugins/App.md) |
| `@App.get` | `get(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/App.md) |
| `@BondingCurvePlugin.getMarketCapInSol` | `getMarketCapInSol(supply, virtualSolReserves, virtualTokenReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@BondingCurvePlugin.getMaxSolInProduct` | `getMaxSolInProduct(virtualSolReserves, virtualTokenReserves, actualTokenReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@BondingCurvePlugin.getMaxTokensInProduct` | `getMaxTokensInProduct(virtualSolReserves, virtualTokenReserves, actualSolReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@BondingCurvePlugin.getSolOutProduct` | `getSolOutProduct(tokenAmount, virtualSolReserves, virtualTokenReserves, actualSolReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@BondingCurvePlugin.getTokensInProduct` | `getTokensInProduct(solAmountOut, virtualSolReserves, virtualTokenReserves, actualSolReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@BondingCurvePlugin.getTokensOutProduct` | `getTokensOutProduct(solAmount, virtualSolReserves, virtualTokenReserves, actualTokenReserves)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/BondingCurvePlugin.md) |
| `@Bytes.anchorDiscriminator` | `anchorDiscriminator(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.bool` | `bool(boolean)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.concat` | `concat(bytes, bytes?, ...)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.i64` | `i64(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.i64At` | `i64At(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.len` | `len(bytes)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.pubkey` | `pubkey(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.pubkeyAt` | `pubkeyAt(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.raw` | `raw(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.str` | `str(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u128` | `u128(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u16` | `u16(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u16At` | `u16At(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u32` | `u32(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u32At` | `u32At(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u64` | `u64(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u64At` | `u64At(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u8` | `u8(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.u8At` | `u8At(bytes, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@Bytes.utf8` | `utf8(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Bytes.md) |
| `@CPI.dlmmSwap` | `dlmmSwap(source, lbPair, reserveX, reserveY, inputMint, outputMint, oracle, amountIn, minAmountOut)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoBorrow` | `kaminoBorrow(string, number, string, string, string, string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoDeposit` | `kaminoDeposit(string, number, string, string, string, string, string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoInitObligation` | `kaminoInitObligation(string, number, string)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoInitUserMetadata` | `kaminoInitUserMetadata(string, string)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoRefreshObligation` | `kaminoRefreshObligation(string, number, string)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoRefreshReserve` | `kaminoRefreshReserve(string, string, string, string, string, string, string)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoRepay` | `kaminoRepay(string, number, string, string, string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.kaminoWithdraw` | `kaminoWithdraw(string, number, string, string, string, string, string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.memoNote` | `memoNote(string, string)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.raydiumDeposit` | `raydiumDeposit(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, maximumToken0Amount, maximumToken1Amount)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.raydiumSwapBaseInput` | `raydiumSwapBaseInput(source, ammConfig, poolState, inputVault, outputVault, inputMint, outputMint, observationState, amountIn, minimumAmountOut)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.raydiumWithdraw` | `raydiumWithdraw(source, poolState, token0Vault, token1Vault, vault0Mint, vault1Mint, lpMint, lpTokenAmount, minimumToken0Amount, minimumToken1Amount)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.stakePoolDepositSol` | `stakePoolDepositSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, referralFeeAccount, lamports, minimumPoolTokensOut)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.stakePoolWithdrawSol` | `stakePoolWithdrawSol(source, stakePool, reserveStake, poolMint, managerFeeAccount, poolTokens, minimumLamportsOut)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@CPI.transferLamports` | `transferLamports(string, string, number)` | `hooks.onchain` | [reference](plugins/CPI.md) |
| `@DeFiPlugin.addCpAmmLiquidity` | `addCpAmmLiquidity(string, string, string, string, string, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.claimDammV2PoolFees` | `claimDammV2PoolFees(string, string, string?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.claimMeteoraPoolFees` | `claimMeteoraPoolFees(string, string)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.closeCpAmmPosition` | `closeCpAmmPosition(string, string, string)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.createCpAmmPosition` | `createCpAmmPosition(string, string, string)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.createMeteoraConfig` | `createMeteoraConfig(string, string, number, number, number, number, number?, number?, number?, number?, number?, string?, number?, number?, number?, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.createMeteoraVirtualPool` | `createMeteoraVirtualPool(string, string, string, string, string, string?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.createPool` | `createPool(string, string, string, string, string, object?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.lockCpAmmPosition` | `lockCpAmmPosition(string, string, string, number, string, string, number, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.removeCpAmmLiquidity` | `removeCpAmmLiquidity(string, string, string, string?, string?, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.swap` | `swap(string, string, string, string, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.swapInMeteoraVirtualPool` | `swapInMeteoraVirtualPool(string, string, string, string, string?, number?)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.withdrawLeftover` | `withdrawLeftover(string)` | `hooks.onchain` | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getClaimableCpAmmPositionFee` | `getClaimableCpAmmPositionFee(string, string, string, string?)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getClaimableMeteoraPoolFees` | `getClaimableMeteoraPoolFees(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getCpAmmPoolAddress` | `getCpAmmPoolAddress(string, string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getCpAmmPositionNftMintAddress` | `getCpAmmPositionNftMintAddress(string, string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getDammV2PoolAddress` | `getDammV2PoolAddress(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getMeteoraSwapQuote` | `getMeteoraSwapQuote(string, string, string)` | offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getMeteoraVirtualPoolAddress` | `getMeteoraVirtualPoolAddress(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DeFiPlugin.getSwapQuote` | `getSwapQuote(string, string, string)` | offchain rules, offchain named queries | [reference](plugins/DeFiPlugin.md) |
| `@DflowPlugin.openPredictionMarketOrder` | `openPredictionMarketOrder(string, string, string, number, number?)` | `hooks.onchain` | [reference](plugins/DflowPlugin.md) |
| `@DflowPlugin.getKycStatus` | `getKycStatus(string)` | offchain rules, offchain named queries | [reference](plugins/DflowPlugin.md) |
| `@DocumentPlugin.putDocument` | `putDocument(path, data)` | `hooks.offchain` | [reference](plugins/DocumentPlugin.md) |
| `@DocumentPlugin.updateField` | `updateField(path, field, value)` | `hooks.onchain`, `hooks.offchain` | [reference](plugins/DocumentPlugin.md) |
| `@MathPlugin.mulDivCeil` | `mulDivCeil(number, number, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/MathPlugin.md) |
| `@MathPlugin.mulDivFloor` | `mulDivFloor(number, number, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/MathPlugin.md) |
| `@NFTPlugin.burn` | `burn(string, string, string?)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.createCollection` | `createCollection(string, string, string)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.mintNFT` | `mintNFT(string, string, string, string, string?)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.transfer` | `transfer(string, string, string, string?)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.updateCollectionRoyalties` | `updateCollectionRoyalties(string, string, number, array?)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.updateRoyalties` | `updateRoyalties(string, string?, string, number, array?)` | `hooks.onchain` | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.getCollectionMintAddress` | `getCollectionMintAddress(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.getOwner` | `getOwner(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.getTokenMintAddress` | `getTokenMintAddress(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/NFTPlugin.md) |
| `@NFTPlugin.getUpdateAuthority` | `getUpdateAuthority(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/NFTPlugin.md) |
| `@OraclePlugin.requestRandomness` | `requestRandomness(string, string)` | `hooks.onchain` | [reference](plugins/OraclePlugin.md) |
| `@OraclePlugin.getRandomNumber` | `getRandomNumber(string, number, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/OraclePlugin.md) |
| `@OraclePlugin.getVRFAddress` | `getVRFAddress(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/OraclePlugin.md) |
| `@PhoenixPerpsPlugin.closePosition` | `closePosition(source, market, sizeBaseLots, side, subaccountIndex?, slippageBps?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.depositFunds` | `depositFunds(source, amount, subaccountIndex?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.emberDeposit` | `emberDeposit(source, usdcAmount)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.emberWithdraw` | `emberWithdraw(source, amount?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.placeLong` | `placeLong(source, market, sizeBaseLots, subaccountIndex?, slippageBps?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.placeShort` | `placeShort(source, market, sizeBaseLots, subaccountIndex?, slippageBps?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.registerTrader` | `registerTrader(source, subaccountIndex?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.syncParentToChild` | `syncParentToChild(source, subaccountIndex)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.transferToCross` | `transferToCross(source, subaccountIndex)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.transferToIsolated` | `transferToIsolated(source, amount, subaccountIndex)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.withdrawFunds` | `withdrawFunds(source, amount, subaccountIndex?)` | `hooks.onchain` | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.getCollateralBalance` | `getCollateralBalance(source, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.getMarkPrice` | `getMarkPrice(market)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.getPortfolioValue` | `getPortfolioValue(source, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.getPositionSize` | `getPositionSize(source, market, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.getUnrealizedPnl` | `getUnrealizedPnl(source, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.hasPosition` | `hasPosition(source, market, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PhoenixPerpsPlugin.isRegistered` | `isRegistered(source, subaccountIndex?)` | offchain rules, offchain named queries | [reference](plugins/PhoenixPerpsPlugin.md) |
| `@PredictionMarketPlugin.applyFee` | `applyFee(amount, feeBps)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getCollateralOutAmm` | `getCollateralOutAmm(yesIn, collateralReserve, yesSupply)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getNoCollateralOutLsmr` | `getNoCollateralOutLsmr(noIn, yesSupply, noSupply, b)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getNoTokensOutLsmr` | `getNoTokensOutLsmr(amountIn, yesSupply, noSupply, b)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getYesCollateralOutLsmr` | `getYesCollateralOutLsmr(yesIn, yesSupply, noSupply, b)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getYesTokenOutAmm` | `getYesTokenOutAmm(amountIn, collateralReserve, yesSupply)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PredictionMarketPlugin.getYesTokensOutLsmr` | `getYesTokensOutLsmr(amountIn, yesSupply, noSupply, b)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PredictionMarketPlugin.md) |
| `@PriceFeedPlugin.getPriceFeed` | `getPriceFeed(string, string?)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PriceFeedPlugin.md) |
| `@PumpFunPlugin.buyExactSolIn` | `buyExactSolIn(source, mint, solAmount, slippageBps)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.buyExactSolInWithMinimumOutput` | `buyExactSolInWithMinimumOutput(source, mint, solAmount, minTokensOut)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.collectCreatorFee` | `collectCreatorFee(creator)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.createFeeSharingConfig` | `createFeeSharingConfig(source, mint)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.createToken` | `createToken(tokenId, name, symbol, uri, creator, config?)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.createTokenV2` | `createTokenV2(tokenId, name, symbol, uri, creator, isMayhemMode, config?)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.distributeCreatorFees` | `distributeCreatorFees(mint)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.pumpswapDeposit` | `pumpswapDeposit(source, mint, lpTokenAmountOut, maxBaseAmountIn, maxQuoteAmountIn)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.pumpswapWithdraw` | `pumpswapWithdraw(source, mint, lpTokenAmountIn, minBaseAmountOut, minQuoteAmountOut)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.transferCreatorFeesToPump` | `transferCreatorFeesToPump(mint)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.updateShareholders` | `updateShareholders(source, mint, shareholders)` | `hooks.onchain` | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.getBondingCurveProgress` | `getBondingCurveProgress(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.getCreatorFee` | `getCreatorFee(mint)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PumpFunPlugin.md) |
| `@PumpFunPlugin.getPumpBuyQuote` | `getPumpBuyQuote(string, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/PumpFunPlugin.md) |
| `@Solana.createAccount` | `createAccount(string, number, string)` | `hooks.onchain` | [reference](plugins/Solana.md) |
| `@Solana.invoke` | `invoke(string, array, bytes)` | `hooks.onchain` | [reference](plugins/Solana.md) |
| `@Solana.account` | `account(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.ata` | `ata(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.data` | `data(string, number, number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.lamports` | `lamports(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.pda` | `pda(array, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.pdaBump` | `pdaBump(array, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.rentExemption` | `rentExemption(number)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@Solana.signerAccount` | `signerAccount(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/Solana.md) |
| `@StringUtils.length` | `length(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries, `hooks.offchain` | [reference](plugins/StringUtils.md) |
| `@TensorPlugin.buyNft` | `buyNft(string, number)` | `hooks.onchain` | [reference](plugins/TensorPlugin.md) |
| `@TensorPlugin.listNft` | `listNft(string, number?, number?, string?, string?, string?)` | `hooks.onchain` | [reference](plugins/TensorPlugin.md) |
| `@TokenPlugin.burn` | `burn(string, string, number)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.createToken` | `createToken(string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.createToken2022` | `createToken2022(string, string, string, string, number, object?)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.mint` | `mint(string, string, string, string, number)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.transfer` | `transfer(string, string, string, number)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.transferWholeTokens` | `transferWholeTokens(string, string, string, number)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.withdrawWithheldTokens` | `withdrawWithheldTokens(string, string, string, string)` | `hooks.onchain` | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.getBalance` | `getBalance(string, string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.getDecimals` | `getDecimals(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.getSupply` | `getSupply(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.getTokenMintAddress` | `getTokenMintAddress(string,string?,string?)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/TokenPlugin.md) |
| `@TokenPlugin.getWithdrawWithheldAuthority` | `getWithdrawWithheldAuthority(string)` | onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries | [reference](plugins/TokenPlugin.md) |
